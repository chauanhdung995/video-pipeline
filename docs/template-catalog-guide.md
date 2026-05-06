# HyperFrames Template Catalog Guide

Catalog root:

```text
src/renderer/hyperframes/catalog/objectives/
```

Local HyperFrames registry blocks:

```text
src/renderer/hyperframes/blocks/
```

Sound effects:

```text
assets/sfx/
```

Each video objective is one folder. The folder name is a stable slug, for example `mac-dinh`, `explainer`, `breaking-news`.

```text
objectives/
└── mac-dinh/
    ├── objective.json
    ├── README.md
    ├── hook/
    │   ├── schema.json
    │   ├── template.html.tmpl
    │   ├── demo.json
    │   ├── demo.html
    │   └── demo.mp4
    └── stat-pill/
        └── ...
```

## Objective

Create or edit `objective.json`:

```json
{
  "id": "explainer",
  "name": "Explainer",
  "description": "Video giải thích",
  "status": "ready"
}
```

The UI reads this file through `/api/video-objectives`. If an objective has no template folders, the UI will show it as unavailable for generation.

## Template Folder

Each template folder must contain these files:

```text
my-template/
├── schema.json
├── template.html.tmpl
├── demo.json
├── demo.html
└── demo.mp4
```

`schema.json` is the contract sent to OpenAI:

```json
{
  "template": "my-template",
  "description": "What this visual template is for.",
  "templateData": {
    "title": "Short title",
    "background": {
      "type": "gradient",
      "colors": ["#111827", "#2563eb"],
      "opacity": 0.18
    },
    "appearanceOrder": ["title"],
    "timingPhrases": {
      "title": "phrase in narration"
    },
    "sfx": {
      "intro": 0.08,
      "accent": "phrase in narration"
    }
  }
}
```

Rules:

- `template` must match the folder name.
- `templateData` must be specific to that template. Do not use one shared schema for every template.
- `timingPhrases` maps element keys to words/phrases in `voice`; renderer uses word timings/SRT to reveal elements when narration reaches that phrase.
- `sfx` contains timing only. Use a number of seconds from scene start or a phrase from narration. Do not put sound-effect paths, filenames, or volume in JSON; fixed media paths live in `assets/sfx` and the renderer maps them per template.
- `appearanceOrder` is a fallback when no exact word timing is found.

## HyperFrames Blocks

The local block mirror is synced from the official HyperFrames registry and currently contains:

- 43 installable blocks in `src/renderer/hyperframes/blocks/*.html`
- 3 reusable components in `src/renderer/hyperframes/blocks/components/*.html`
- 8 full examples in `src/renderer/hyperframes/blocks/examples/*`
- registry metadata in `src/renderer/hyperframes/blocks/_registry/*`

Re-sync the local mirror when HyperFrames publishes new blocks:

```bash
npm run hyperframes:sync-blocks
```

Use blocks in three ways:

- Mount a complete block composition with `data-composition-src`, for example:

```html
<div data-composition-src="blocks/tiktok-follow.html" data-duration="2.4"></div>
```

- Copy or adapt small reusable pieces from `blocks/components/*.html` into a template.
- Use `blocks/examples/*` as reference material when designing a new template. Examples and `_registry` metadata are intentionally excluded from render temp folders so B6 does not copy unnecessary files for every scene.

The generated `blocks/_registry/index.json` is the fastest file to inspect when you need to know which official blocks are available. It lists each local item name, registry type, source files, and local target files.

## Sound Effects

Sound-effect paths are fixed in renderer code per template. The AI should only provide timing in `templateData.sfx`.

Recommended pattern:

```json
{
  "sfx": {
    "intro": 0.12,
    "badge": "500%",
    "transition": "nhưng"
  }
}
```

Renderer logic should map those keys to files under `assets/sfx`, for example `assets/sfx/whoosh.mp3` or `assets/sfx/pop.mp3`, and resolve string values through word timing/SRT.

Do not ask OpenAI to invent SFX filenames. When creating a new template, inspect `assets/sfx/` and pick fixed media paths yourself.

Narration audio is injected by the HyperFrames render pipeline before render. Template HTML should not add the voice file manually; only template-specific SFX should be declared by the renderer.

## Serper Image Templates

Image-capable templates should expose an `imageSearch` object in `schema.json`.

Current default image templates:

- `image-background-hero`: Serper image becomes a full-screen animated background.
- `image-inset-card`: Serper image is rendered inside a rounded media panel.

Schema pattern:

```json
{
  "templateData": {
    "title": "Scene title",
    "imageSearch": {
      "q": "\"bitcoin vs gold\" chart OR infographic -logo -icon",
      "intent": "What kind of image this template needs.",
      "orientation": "any",
      "prefer": ["chart", "bitcoin", "gold"],
      "avoid": ["logo", "icon", "clipart", "stock"]
    },
    "image": {
      "title": "",
      "src": "",
      "width": 0,
      "height": 0,
      "alt": ""
    }
  }
}
```

Prompt/runtime flow:

1. OpenAI reads only templates from the selected video objective.
2. OpenAI creates the scene plan: `voice`, `ttsVoice`, `template`, `visual`, and, when the chosen template needs an image, `keyword-image`.
3. The server calls `https://google.serper.dev/images` for each `keyword-image`.
4. Only these fields from each Serper result are kept before download: `title`, `imageUrl`, `imageWidth`, `imageHeight`.
5. The server downloads each candidate image into the current session and skips candidates that fail to download or are not real image files.
6. Downloaded files are named from image title plus dimensions, for example `15 years of gold vs Bitcoin 1640x2048.jpg`.
7. OpenAI receives the selected template sample plus a P/S: choose the appropriate local image from `downloadedImages`.
8. OpenAI writes final `templateData` and fills `templateData.image.src` with a local `/sessions/.../images/...` path. For `image-background-hero`, it also fills `templateData.background.src`.
9. During HyperFrames render, local session images are copied into the temporary composition folder so preview and render use the same downloaded file.

Do not put Serper API response fields like `domain`, `link`, `thumbnailUrl`, `source`, or `googleUrl` into the image-selection prompt. They add context noise and are not needed for rendering.

Serper Images uses the same API key as article crawling: `SERPER_SCRAPE_API_KEY`. There is no separate image key.

## New Template Workflow

1. Pick the objective folder, for example `src/renderer/hyperframes/catalog/objectives/explainer/`.
2. Create one folder per template slug, for example `market-chart/`.
3. Add `schema.json` with template-specific `templateData`. Each template needs its own JSON shape because layouts, media slots, timing keys, and SFX keys differ.
4. Add `template.html.tmpl`, `demo.json`, `demo.html`, and `demo.mp4`.
5. Review `src/renderer/hyperframes/blocks/_registry/index.json` and choose blocks/components that fit the template.
6. Review `assets/sfx/` and map fixed SFX files inside renderer code.
7. Update `src/renderer/hyperframesTemplateSystem.js` so the renderer can draw the new template.
8. Update `src/renderer/hyperframesTemplateSchemas.js` if the template needs normalization/defaults.
9. Run the scaffold/demo command to verify the template output.

## Renderer Support

Adding a folder makes the template visible to the script prompt, but the renderer must still know how to draw it.

For a new template, update:

```text
src/renderer/hyperframesTemplateSystem.js
```

Add the template to `renderInner(...)`, then implement a render function that consumes your `templateData`.

If the template has a new data shape, also update:

```text
src/renderer/hyperframesTemplateSchemas.js
```

Add normalization logic inside `normalizeTemplateData(...)` so user/AI JSON is cleaned before rendering.

## Demo Files

`demo.json` should contain one complete scene using the template:

```json
{
  "objective": "explainer",
  "template": "my-template",
  "scenes": [
    {
      "stt": 1,
      "voice": "Vietnamese narration...",
      "ttsVoice": "Vietnamese narration for TTS...",
      "template": "my-template",
      "templateData": {},
      "visual": "LAYOUT: my-template..."
    }
  ]
}
```

`demo.html` is a rendered preview of that scene. `demo.mp4` is the rendered video sample.

To rebuild the default demo catalog:

```bash
node scripts/scaffold_template_catalog.mjs --render-mp4
```

For your own new template, you can copy an existing folder, edit `schema.json` and `demo.json`, then use `composeSceneHTML(...)` or the scaffold script as a reference to generate `demo.html` and `demo.mp4`.

## Prompt Flow

When the user selects a video objective in the UI:

1. Browser sends `videoObjective` to `/api/start`.
2. Server validates the objective and reads only templates from that objective folder.
3. `generateScript(...)` sends only those templates to OpenAI for scene planning.
4. OpenAI returns scenes with `template`; image templates also return `keyword-image`.
5. Server downloads usable Serper images into the session.
6. `generateTemplateDataForScript(...)` sends each selected template sample plus local image paths to OpenAI.
7. OpenAI returns final template-specific `templateData`.
8. Renderer splits each scene back into its selected template.

This keeps templates isolated by objective. Templates from other objectives are not exposed to the model for that video.
