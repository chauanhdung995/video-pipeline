// src/agents/scriptAgent.js - Bước 2: Tạo kịch bản JSON
import { callAI } from '../services/aiRouter.js';
import {
  SCENE_TEMPLATES,
  DEFAULT_VIDEO_OBJECTIVE,
  getTemplateRecordsForObjective,
  getTemplatesForObjective,
  listVideoObjectives,
  normalizeTemplateData,
  normalizeTemplateName,
  normalizeVideoObjective,
  templateNeedsImage,
} from '../renderer/hyperframesTemplateSchemas.js';
import { normalizeUploadedImages, sceneUploadedImageUrl } from '../services/imageAssets.js';
import { buildSfxCatalogForPrompt, normalizeSfxPlan } from '../services/sfxCatalog.js';

const DURATION_PLANS = {
  60:  { minScenes: 4,  maxScenes: 8,  minTotalWords: 210,  targetTotalWords: 240,  maxTotalWords: 270,  minSceneWords: 18, maxSceneWords: 70 },
  120: { minScenes: 6,  maxScenes: 12, minTotalWords: 430,  targetTotalWords: 480,  maxTotalWords: 520,  minSceneWords: 22, maxSceneWords: 90 },
  180: { minScenes: 8,  maxScenes: 16, minTotalWords: 650,  targetTotalWords: 720,  maxTotalWords: 780,  minSceneWords: 24, maxSceneWords: 100 },
  240: { minScenes: 10, maxScenes: 20, minTotalWords: 850,  targetTotalWords: 960,  maxTotalWords: 1040, minSceneWords: 26, maxSceneWords: 110 },
  300: { minScenes: 12, maxScenes: 24, minTotalWords: 1060, targetTotalWords: 1200, maxTotalWords: 1300, minSceneWords: 28, maxSceneWords: 120 },
};

function buildDurationPlan(videoDurationSec = 120) {
  const safeVideoDurationSec = [60, 120, 180, 240, 300].includes(Number(videoDurationSec)) ? Number(videoDurationSec) : 120;
  const plan = DURATION_PLANS[safeVideoDurationSec] || DURATION_PLANS[120];
  const structureGuide = safeVideoDurationSec >= 240
    ? 'Structure: introduction, main points grouped by topic, short illustrative examples, closing summary.'
    : safeVideoDurationSec >= 120
    ? 'Structure: hook → 2-3 clearly developed main points → concise conclusion.'
    : 'Structure: fast hook, brief development, tight message close.';
  return {
    safeVideoDurationSec,
    ...plan,
    structureGuide,
  };
}

const OUTPUT_AR = { w: 1080, h: 1920, label: 'portrait, TikTok/Reels 9:16' };

const SCRIPT_PLAN_PROMPT = `You are a Vietnamese educational video scriptwriter and HyperFrames scene planner.

Write a complete video script for the topic: "{{TOPIC}}"

DURATION PARAMETERS:
- Total target: ~{{VIDEO_DURATION_SEC}}s.
- AI chooses scene count and scene length. Usual range: {{MIN_SCENES}}-{{MAX_SCENES}} scenes.
- Total voice length target: {{MIN_TOTAL_WORDS}}-{{MAX_TOTAL_WORDS}} Vietnamese words, ideal ~{{TOTAL_WORDS_TARGET}} words.
- Per-scene voice can vary naturally: ~{{MIN_WORDS_PER_SCENE}}-{{MAX_WORDS_PER_SCENE}} words. Hooks, stat reveals, and outros should be shorter; explanation/comparison scenes can be longer.
- {{STRUCTURE_GUIDE}}

CURRENT OUTPUT RATIO:
- {{RATIO_LABEL}} ({{W}}×{{H}})

VIDEO OBJECTIVE:
- {{VIDEO_OBJECTIVE_LABEL}}
- You may choose templates ONLY from the schema list below for this objective.

IMAGE REQUIREMENT:
{{IMAGE_REQUIREMENT}}

IMAGE-CAPABLE TEMPLATES IN THIS OBJECTIVE:
{{IMAGE_TEMPLATE_NAMES}}

USER UPLOADED IMAGES:
{{UPLOADED_IMAGES}}

AVAILABLE TEMPLATES FROM THIS OBJECTIVE:
{{TEMPLATE_PLANNING_CATALOG}}

HARD REQUIREMENTS:
- Make a complete scene list numbered sequentially from 1. Do NOT force equal scene duration.
- Each scene MUST include: "stt", "voice", "ttsVoice", "template".
- Each scene MAY include "targetDurationSec" as your estimate only; actual render duration follows generated voice/SRT.
- "voice" is Vietnamese display narration and subtitle text.
- "ttsVoice" is Vietnamese TTS-friendly narration with difficult abbreviations/units expanded.
- "template" MUST be one exact name from the schemas above.
- If IMAGE REQUIREMENT says images are required and IMAGE-CAPABLE TEMPLATES is not empty, prioritize those image-capable templates for hook/main evidence/context scenes.
- When images are required, use image-capable templates for at least half of non-outro scenes when the objective has enough image-capable templates.
- If the selected template has "needsImage": true, prefer a suitable item from USER UPLOADED IMAGES.
- When using an uploaded image, include "uploaded-image-url" with the exact uploaded "src", include "uploaded-image-name", and set "keyword-image" to "".
- Only use uploaded image URLs listed in USER UPLOADED IMAGES. Never invent image URLs.
- If no uploaded image is suitable, include "keyword-image" as a concrete Google Images query for Serper. Use useful operators when helpful: quoted phrases, OR, site:, -logo, -icon, -clipart, -stock.
- Use "outro" only for the final scene.
- Avoid repeating the same template in adjacent scenes unless necessary.
- Do NOT output layout descriptions, debug notes, markdown, comments, or prose outside JSON.

TTS NORMALIZATION GUIDELINES FOR "ttsVoice":
- Keep meaning identical to "voice".
- Expand AI → ây ai, KPI → cây bi ai, CEO → xi i ô, USD → đô la Mỹ, % → phần trăm.
- For long numbers, write them naturally in Vietnamese when that helps TTS.
- If unsure, keep the original phrase.

RETURN JSON ONLY:
{
  "scenes": [
    {
      "stt": 1,
      "voice": "Vietnamese narration...",
      "ttsVoice": "Vietnamese TTS-friendly narration...",
      "targetDurationSec": 8,
      "template": "hook",
      "keyword-image": "empty string when using uploaded-image-url, otherwise search query when selected template needs image",
      "uploaded-image-url": "only when using an uploaded image",
      "uploaded-image-name": "only when using an uploaded image"
    }
  ]
}`;

const TEMPLATE_DATA_PROMPT = `You convert a planned Vietnamese video script into final deterministic HyperFrames templateData JSON.

The scenes already have voice, template, and local image candidates when the template needs an image.

For each scene:
- Keep "stt", "voice", "ttsVoice", "targetDurationSec", "template", "keyword-image", "uploaded-image-url", and "uploaded-image-name" from the plan.
- Create "templateData" using the exact object shape of that scene's selected template sample.
- Do not put fields from a different template.
- Keep on-screen text concise and Vietnamese.
- If the template sample has "sfx", fill ONLY timing values for those keys. Use seconds from scene start or a short narration phrase. NEVER include sound-effect file paths.
- If the template sample has "imageSearch", copy the scene's "keyword-image" into templateData.imageSearch.q.
- P/S for image templates: choose one suitable image from "availableImages" and put its local "src" path into templateData.image.src. Prefer source "upload" when it matches the scene. Also fill image.title, image.width, image.height, image.alt.
- For image-background-hero, also copy the same local image path into templateData.background.src.
- Use only local image src values from availableImages/downloadedImages. Never use original remote URLs and never invent a path.
- If availableImages is empty, leave image.src and background.src empty.

SCENES WITH TEMPLATE SAMPLES:
{{SCENE_TEMPLATE_DATA_INPUT}}

RETURN JSON ONLY:
{
  "scenes": [
    {
      "stt": 1,
      "voice": "same voice",
      "ttsVoice": "same ttsVoice",
      "targetDurationSec": 8,
      "template": "exact template",
      "keyword-image": "if present",
      "uploaded-image-url": "if present",
      "uploaded-image-name": "if present",
      "templateData": { "use": "the selected template's exact sample shape" }
    }
  ]
}`;

const FREEFORM_SCRIPT_PROMPT = `You are a Vietnamese video scriptwriter and a HyperFrames HTML scene director.

Write a complete video script for the topic: "{{TOPIC}}"

This project is running with TEMPLATE MODE OFF.
You must NOT choose catalog templates. Instead, for every scene you create a detailed JSON "htmlSpec" that another AI call will use to generate the scene HTML.

DURATION PARAMETERS:
- Total target: ~{{VIDEO_DURATION_SEC}}s.
- AI chooses scene count and scene length. Usual range: {{MIN_SCENES}}-{{MAX_SCENES}} scenes.
- Total voice length target: {{MIN_TOTAL_WORDS}}-{{MAX_TOTAL_WORDS}} Vietnamese words, ideal ~{{TOTAL_WORDS_TARGET}} words.
- Per-scene voice can vary naturally: ~{{MIN_WORDS_PER_SCENE}}-{{MAX_WORDS_PER_SCENE}} words.
- {{STRUCTURE_GUIDE}}

CURRENT OUTPUT RATIO:
- {{RATIO_LABEL}} ({{W}}×{{H}})

IMAGE REQUIREMENT:
{{IMAGE_REQUIREMENT}}

AVAILABLE SOUND EFFECT FILES:
{{SFX_CATALOG}}

USER UPLOADED IMAGES:
{{UPLOADED_IMAGES}}

HARD REQUIREMENTS:
- Make a complete scene list numbered sequentially from 1.
- Each scene MUST include: "stt", "voice", "ttsVoice", "targetDurationSec", "visual", "htmlSpec".
- "voice" is Vietnamese display narration and subtitle text.
- "ttsVoice" is Vietnamese TTS-friendly narration with difficult abbreviations/units expanded.
- "visual" is a short Vietnamese summary of the scene direction.
- "htmlSpec" MUST be highly detailed and directly buildable as 1080×1920 HyperFrames-compatible HTML.
- "htmlSpec" MUST NOT mention a catalog template name.
- Prefer generated HTML/CSS/SVG/canvas elements. Do not depend on remote images or videos.
- If IMAGE REQUIREMENT says images are required, every main scene MUST include "imageRequired": true and either "uploaded-image-url" from USER UPLOADED IMAGES or "keyword-image" for Google/Serper image search.
- If USER UPLOADED IMAGES is not empty, use uploaded images in the video. Prefer assigning uploaded images to relevant scenes before using Google search.
- If using an uploaded image, include "uploaded-image-url" with the exact uploaded "src", include "uploaded-image-name", and set "keyword-image" to "".
- If no uploaded image is suitable and the scene needs an image, include "keyword-image" as a concrete Google Images query for Serper. Use useful operators when helpful: quoted phrases, OR, site:, -logo, -icon, -clipart, -stock.
- In htmlSpec.assets, describe where the local image should appear: background, hero image, evidence card, side panel, or annotation image.
- Include "sfxPlan" only when sound effects improve the beat. Use only files from AVAILABLE SOUND EFFECT FILES.
- For every SFX cue, include "timingPhrase" as the exact short narration phrase/keyword that should trigger the sound. "startSec" is only a rough estimate before TTS and will be used as fallback.
- Keep sfx subtle: usually 0-3 cues per scene, max 5. Voice must remain dominant.
- Do NOT output markdown, comments, debug notes, or prose outside JSON.

TTS NORMALIZATION GUIDELINES FOR "ttsVoice":
- Keep meaning identical to "voice".
- Expand AI → ây ai, KPI → cây bi ai, CEO → xi i ô, USD → đô la Mỹ, % → phần trăm.
- For long numbers, write them naturally in Vietnamese when that helps TTS.
- If unsure, keep the original phrase.

REQUIRED htmlSpec SHAPE:
{
  "concept": "one-sentence visual concept",
  "mood": "cinematic, editorial, playful, urgent, calm, premium, etc.",
  "palette": { "background": "#hex", "surface": "#hex", "primary": "#hex", "accent": "#hex", "text": "#hex" },
  "layout": {
    "pattern": "HERO | STACK | SPLIT | TIMELINE | CHART | PHONE | MAP | ORBIT | REVEAL | CUSTOM",
    "safeZone": "keep main content above y=1420 because subtitles burn in later",
    "composition": "exact spatial arrangement in portrait frame"
  },
  "background": {
    "type": "gradient | grid | particles | canvas | image",
    "description": "specific background design",
    "motion": "ambient motion that loops for the whole scene"
  },
  "elements": [
    {
      "id": "short stable id",
      "type": "text | number | card | icon | chart | line | badge | image | svg | canvas",
      "content": "Vietnamese text or graphic description",
      "position": { "x": 120, "y": 160, "w": 840, "h": 260 },
      "style": "font, weight, size, color, border, shadow",
      "motion": "enter/hold/exit animation with exact intent"
    }
  ],
  "timeline": [
    {
      "beat": "hook / reveal / explain / climax",
      "startHint": 0.0,
      "endHint": 2.5,
      "visibleElements": ["ids"],
      "animation": "clear instruction for this beat",
      "onScreenText": ["short Vietnamese phrases"]
    }
  ],
  "typography": {
    "fontFamily": "Be Vietnam Pro / Inter / Sora",
    "rules": "fixed px sizes, no viewport-scaled fonts, no clipped Vietnamese accents"
  },
  "qualityChecklist": [
    "no overlap between beat wrappers",
    "all content inside #content",
    "lower third stays clear"
  ]
}

RETURN JSON ONLY:
{
  "scenes": [
    {
      "stt": 1,
      "voice": "Vietnamese narration...",
      "ttsVoice": "Vietnamese TTS-friendly narration...",
      "targetDurationSec": 8,
      "visual": "short scene direction...",
      "imageRequired": true,
      "keyword-image": "empty string when using uploaded-image-url, otherwise concrete search query when the scene needs an image",
      "uploaded-image-url": "only when using an uploaded image",
      "uploaded-image-name": "only when using an uploaded image",
      "htmlSpec": { "concept": "...", "layout": {}, "elements": [], "timeline": [] },
      "sfxPlan": [
        {
          "id": "intro-whoosh",
          "file": "transition/whoosh-soft.mp3",
          "startSec": 0.12,
          "timingPhrase": "optional narration phrase",
          "volume": 0.24,
          "reason": "why this cue belongs here"
        }
      ]
    }
  ]
}`;

function extractScenesArray(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.scenes)) return input.scenes;
  if (Array.isArray(input?.script)) return input.script;
  if (input && typeof input === 'object') {
    const firstArr = Object.values(input).find(v => Array.isArray(v));
    if (firstArr) return firstArr;
  }
  throw new Error('Script không phải array');
}

function normalizePlanScenesInput(input, {
  allowedTemplates = null,
  videoObjective = DEFAULT_VIDEO_OBJECTIVE,
  uploadedImages = [],
} = {}) {
  const script = extractScenesArray(input);
  if (!script.length) throw new Error('Kịch bản đang rỗng');
  const allowed = Array.isArray(allowedTemplates)
    ? allowedTemplates
    : SCENE_TEMPLATES;
  if (!allowed.length) {
    throw new Error('Mục tiêu video đã chọn chưa có template nào trong catalog');
  }
  const hasUploadedImages = normalizeUploadedImages(uploadedImages).length > 0;

  return script.map((scene, index) => {
    const stt = Number(scene?.stt ?? index + 1);
    const voice = String(scene?.voice ?? '').trim();
    const ttsVoice = scene?.ttsVoice == null ? undefined : String(scene.ttsVoice).trim();
    const rawTargetDurationSec = Number(scene?.targetDurationSec);
    const targetDurationSec = Number.isFinite(rawTargetDurationSec)
      ? Math.max(3, Math.min(30, rawTargetDurationSec))
      : undefined;
    const rawTemplate = String(scene?.template ?? '').trim();
    const template = normalizeTemplate(rawTemplate);
    const keywordImage = String(scene?.['keyword-image'] || scene?.keywordImage || scene?.imageKeyword || '').trim();
    const uploadedImageUrl = String(
      scene?.['uploaded-image-url'] ||
      scene?.uploadedImageUrl ||
      scene?.imageUrl ||
      scene?.templateData?.image?.src ||
      ''
    ).trim();
    const uploadedImageName = String(
      scene?.['uploaded-image-name'] ||
      scene?.uploadedImageName ||
      scene?.imageName ||
      ''
    ).trim();

    if (!Number.isInteger(stt) || stt < 1) {
      throw new Error(`Cảnh ${index + 1} có "stt" không hợp lệ`);
    }
    if (!voice) {
      throw new Error(`Cảnh ${stt} thiếu "voice"`);
    }
    if (!rawTemplate) {
      throw new Error(`Cảnh ${stt} thiếu "template"`);
    }
    if (!template) {
      throw new Error(`Cảnh ${stt} có "template" không hợp lệ. Dùng một trong: ${SCENE_TEMPLATES.join(', ')}`);
    }
    if (!allowed.includes(template)) {
      throw new Error(`Cảnh ${stt} dùng template "${template}" không thuộc mục tiêu video đã chọn. Dùng một trong: ${allowed.join(', ')}`);
    }
    if (templateNeedsImage(template, videoObjective) && !keywordImage && !uploadedImageUrl && !hasUploadedImages) {
      throw new Error(`Cảnh ${stt} dùng template "${template}" cần "keyword-image" hoặc "uploaded-image-url"`);
    }

    return {
      stt,
      voice,
      ttsVoice: ttsVoice || voice,
      ...(targetDurationSec ? { targetDurationSec } : {}),
      template,
      ...(keywordImage ? { 'keyword-image': keywordImage, keywordImage } : uploadedImageUrl ? { 'keyword-image': '', keywordImage: '' } : {}),
      ...(uploadedImageUrl ? { 'uploaded-image-url': uploadedImageUrl, uploadedImageUrl } : {}),
      ...(uploadedImageName ? { 'uploaded-image-name': uploadedImageName, uploadedImageName } : {}),
    };
  });
}

function normalizeFreeformScenesInput(input) {
  const script = extractScenesArray(input);
  if (!script.length) throw new Error('Kịch bản AI HTML đang rỗng');

  return script.map((scene, index) => {
    const stt = Number(scene?.stt ?? index + 1);
    const voice = String(scene?.voice ?? '').trim();
    const ttsVoice = scene?.ttsVoice == null ? undefined : String(scene.ttsVoice).trim();
    const rawTargetDurationSec = Number(scene?.targetDurationSec);
    const targetDurationSec = Number.isFinite(rawTargetDurationSec)
      ? Math.max(3, Math.min(30, rawTargetDurationSec))
      : undefined;
    const visual = String(scene?.visual || scene?.visualDescription || scene?.sceneDescription || '').trim();
    const keywordImage = String(scene?.['keyword-image'] || scene?.keywordImage || scene?.imageKeyword || '').trim();
    const uploadedImageUrl = String(
      scene?.['uploaded-image-url'] ||
      scene?.uploadedImageUrl ||
      scene?.imageUrl ||
      ''
    ).trim();
    const uploadedImageName = String(
      scene?.['uploaded-image-name'] ||
      scene?.uploadedImageName ||
      scene?.imageName ||
      ''
    ).trim();
    const htmlSpec = normalizeHtmlSpec(scene?.htmlSpec || scene?.htmlJson || scene?.htmlDescription, { voice, visual, stt });
    const sfxPlan = normalizeSfxPlan(scene?.sfxPlan || scene?.sfx || []);
    const imageRequired = scene?.imageRequired === true ||
      scene?.requiresImage === true ||
      Boolean(keywordImage) ||
      Boolean(uploadedImageUrl) ||
      Boolean(htmlSpec?.assets?.imageRequired);

    if (!Number.isInteger(stt) || stt < 1) {
      throw new Error(`Cảnh ${index + 1} có "stt" không hợp lệ`);
    }
    if (!voice) {
      throw new Error(`Cảnh ${stt} thiếu "voice"`);
    }

    return {
      stt,
      voice,
      ttsVoice: ttsVoice || voice,
      ...(targetDurationSec ? { targetDurationSec } : {}),
      visual: visual || String(htmlSpec?.concept || '').trim() || `Cảnh ${stt}`,
      template: 'ai-html',
      generationMode: 'ai-html',
      useTemplateMode: false,
      ...(imageRequired ? { imageRequired: true } : {}),
      ...(keywordImage ? { 'keyword-image': keywordImage, keywordImage } : uploadedImageUrl ? { 'keyword-image': '', keywordImage: '' } : {}),
      ...(uploadedImageUrl ? { 'uploaded-image-url': uploadedImageUrl, uploadedImageUrl } : {}),
      ...(uploadedImageName ? { 'uploaded-image-name': uploadedImageName, uploadedImageName } : {}),
      htmlSpec,
      sfxPlan,
    };
  });
}

function normalizeHtmlSpec(input, { voice = '', visual = '', stt = 1 } = {}) {
  const base = input && typeof input === 'object' && !Array.isArray(input)
    ? input
    : { concept: String(input || visual || voice || `Cảnh ${stt}`).trim() };
  const elements = Array.isArray(base.elements) ? base.elements : [];
  const timeline = Array.isArray(base.timeline) ? base.timeline : [];
  return {
    concept: String(base.concept || base.summary || visual || voice || `Cảnh ${stt}`).trim(),
    mood: String(base.mood || 'cinematic editorial').trim(),
    palette: base.palette && typeof base.palette === 'object' && !Array.isArray(base.palette)
      ? base.palette
      : {},
    layout: base.layout && typeof base.layout === 'object' && !Array.isArray(base.layout)
      ? base.layout
      : { pattern: String(base.layout || 'HERO'), composition: visual || voice },
    background: base.background && typeof base.background === 'object' && !Array.isArray(base.background)
      ? base.background
      : { type: 'gradient', description: String(base.background || 'cinematic gradient background') },
    elements,
    timeline,
    typography: base.typography && typeof base.typography === 'object' && !Array.isArray(base.typography)
      ? base.typography
      : { fontFamily: 'Be Vietnam Pro', rules: 'fixed px sizes, Vietnamese accents must not be clipped' },
    qualityChecklist: Array.isArray(base.qualityChecklist)
      ? base.qualityChecklist
      : ['all content inside #content', 'lower third stays clear', 'no overlap between beat wrappers'],
    ...(base.assets && typeof base.assets === 'object' && !Array.isArray(base.assets) ? { assets: base.assets } : {}),
  };
}

function normalizeFinalScenesInput(input, { allowedTemplates = null } = {}) {
  const script = extractScenesArray(input);
  if (!script.length) throw new Error('JSON templateData đang rỗng');
  const allowed = Array.isArray(allowedTemplates) ? allowedTemplates : SCENE_TEMPLATES;
  return script.map((scene, index) => {
    const stt = Number(scene?.stt ?? index + 1);
    const voice = String(scene?.voice ?? '').trim();
    const ttsVoice = scene?.ttsVoice == null ? undefined : String(scene.ttsVoice).trim();
    const rawTargetDurationSec = Number(scene?.targetDurationSec);
    const targetDurationSec = Number.isFinite(rawTargetDurationSec)
      ? Math.max(3, Math.min(30, rawTargetDurationSec))
      : undefined;
    const template = normalizeTemplate(scene?.template);
    const templateDataInput = scene?.templateData;
    const keywordImage = String(scene?.['keyword-image'] || scene?.keywordImage || scene?.imageKeyword || '').trim();
    const uploadedImageUrl = String(
      scene?.['uploaded-image-url'] ||
      scene?.uploadedImageUrl ||
      scene?.imageUrl ||
      scene?.templateData?.image?.src ||
      ''
    ).trim();
    const uploadedImageName = String(
      scene?.['uploaded-image-name'] ||
      scene?.uploadedImageName ||
      scene?.imageName ||
      ''
    ).trim();

    if (!Number.isInteger(stt) || stt < 1) throw new Error(`Cảnh ${index + 1} có "stt" không hợp lệ`);
    if (!voice) throw new Error(`Cảnh ${stt} thiếu "voice"`);
    if (!template || !allowed.includes(template)) {
      throw new Error(`Cảnh ${stt} có template không hợp lệ. Dùng một trong: ${allowed.join(', ')}`);
    }
    if (!templateDataInput || typeof templateDataInput !== 'object' || Array.isArray(templateDataInput)) {
      throw new Error(`Cảnh ${stt} thiếu "templateData" object`);
    }

    const templateData = normalizeTemplateData(template, templateDataInput);
    return {
      stt,
      voice,
      ttsVoice: ttsVoice || voice,
      ...(targetDurationSec ? { targetDurationSec } : {}),
      ...(keywordImage ? { 'keyword-image': keywordImage, keywordImage } : uploadedImageUrl ? { 'keyword-image': '', keywordImage: '' } : {}),
      ...(uploadedImageUrl ? { 'uploaded-image-url': uploadedImageUrl, uploadedImageUrl } : {}),
      ...(uploadedImageName ? { 'uploaded-image-name': uploadedImageName, uploadedImageName } : {}),
      template,
      templateData,
    };
  });
}

export function normalizeUserScriptInput(input, options = {}) {
  const scenes = normalizeFinalScenesInput(input, options);
  return { scenes };
}

function normalizeTemplate(value) {
  return normalizeTemplateName(value);
}

export async function generateScript({
  topic,
  keys,
  onLog,
  videoDurationSec = 120,
  styleGuide = '',
  videoObjective = DEFAULT_VIDEO_OBJECTIVE,
  uploadedImages = [],
  requireImages = false,
}) {
  onLog?.(`Tạo kịch bản: "${topic}"`);
  const plan = buildDurationPlan(videoDurationSec);
  const ar = OUTPUT_AR;
  const objectiveId = normalizeVideoObjective(videoObjective);
  const objective = listVideoObjectives().find(item => item.id === objectiveId);
  const allowedTemplates = getTemplatesForObjective(objectiveId);
  const normalizedUploads = normalizeUploadedImages(uploadedImages);
  const imageTemplates = getImageTemplatesForObjective(objectiveId);
  if (!allowedTemplates.length) {
    throw new Error(`Mục tiêu video "${objective?.name || objectiveId}" chưa có template nào trong catalog`);
  }
  const prompt = SCRIPT_PLAN_PROMPT
    .replace('{{TOPIC}}', topic)
    .replaceAll('{{VIDEO_DURATION_SEC}}', String(plan.safeVideoDurationSec))
    .replaceAll('{{MIN_SCENES}}', String(plan.minScenes))
    .replaceAll('{{MAX_SCENES}}', String(plan.maxScenes))
    .replaceAll('{{MIN_TOTAL_WORDS}}', String(plan.minTotalWords))
    .replaceAll('{{MAX_TOTAL_WORDS}}', String(plan.maxTotalWords))
    .replaceAll('{{TOTAL_WORDS_TARGET}}', String(plan.targetTotalWords))
    .replaceAll('{{MIN_WORDS_PER_SCENE}}', String(plan.minSceneWords))
    .replaceAll('{{MAX_WORDS_PER_SCENE}}', String(plan.maxSceneWords))
    .replace('{{STRUCTURE_GUIDE}}', plan.structureGuide)
    .replaceAll('{{RATIO_LABEL}}', ar.label)
    .replaceAll('{{W}}', String(ar.w))
    .replaceAll('{{H}}', String(ar.h))
    .replace('{{VIDEO_OBJECTIVE_LABEL}}', `${objective?.name || objectiveId}${objective?.description ? ` — ${objective.description}` : ''}`)
    .replace('{{IMAGE_REQUIREMENT}}', buildImageRequirementText({ requireImages, uploadedImages: normalizedUploads }))
    .replace('{{IMAGE_TEMPLATE_NAMES}}', JSON.stringify(imageTemplates, null, 2))
    .replace('{{UPLOADED_IMAGES}}', JSON.stringify(normalizedUploads.map(toPromptImage), null, 2))
    .replace('{{TEMPLATE_PLANNING_CATALOG}}', JSON.stringify(buildPlanningCatalog(objectiveId), null, 2));

  const { result } = await callAI({ prompt, isJson: true, keys, onLog });
  const scenes = preferImageTemplatesForScript(
    normalizePlanScenesInput(result, { allowedTemplates, videoObjective: objectiveId, uploadedImages: normalizedUploads }),
    { requireImages, videoObjective: objectiveId, uploadedImages: normalizedUploads, onLog }
  );
  if (scenes.length < plan.minScenes || scenes.length > plan.maxScenes) {
    onLog?.(`AI chọn ${scenes.length} cảnh, ngoài gợi ý ${plan.minScenes}-${plan.maxScenes}; vẫn dùng vì kịch bản hợp lệ`);
  }
  onLog?.(`✓ Kịch bản phân cảnh: ${scenes.length} cảnh, có template và nguồn ảnh khi cần`);
  return { scenes };
}

export async function generateFreeformScript({
  topic,
  keys,
  onLog,
  videoDurationSec = 120,
  uploadedImages = [],
  requireImages = false,
}) {
  onLog?.(`Tạo kịch bản AI HTML tự do: "${topic}"`);
  const plan = buildDurationPlan(videoDurationSec);
  const ar = OUTPUT_AR;
  const normalizedUploads = normalizeUploadedImages(uploadedImages);
  const prompt = FREEFORM_SCRIPT_PROMPT
    .replace('{{TOPIC}}', topic)
    .replaceAll('{{VIDEO_DURATION_SEC}}', String(plan.safeVideoDurationSec))
    .replaceAll('{{MIN_SCENES}}', String(plan.minScenes))
    .replaceAll('{{MAX_SCENES}}', String(plan.maxScenes))
    .replaceAll('{{MIN_TOTAL_WORDS}}', String(plan.minTotalWords))
    .replaceAll('{{MAX_TOTAL_WORDS}}', String(plan.maxTotalWords))
    .replaceAll('{{TOTAL_WORDS_TARGET}}', String(plan.targetTotalWords))
    .replaceAll('{{MIN_WORDS_PER_SCENE}}', String(plan.minSceneWords))
    .replaceAll('{{MAX_WORDS_PER_SCENE}}', String(plan.maxSceneWords))
    .replace('{{STRUCTURE_GUIDE}}', plan.structureGuide)
    .replaceAll('{{RATIO_LABEL}}', ar.label)
    .replaceAll('{{W}}', String(ar.w))
    .replaceAll('{{H}}', String(ar.h))
    .replace('{{IMAGE_REQUIREMENT}}', buildImageRequirementText({ requireImages, uploadedImages: normalizedUploads }))
    .replace('{{SFX_CATALOG}}', JSON.stringify(buildSfxCatalogForPrompt(), null, 2))
    .replace('{{UPLOADED_IMAGES}}', JSON.stringify(normalizedUploads.map(toPromptImage), null, 2));

  const { result } = await callAI({ prompt, isJson: true, keys, onLog });
  const scenes = normalizeFreeformScenesInput(result);
  if (scenes.length < plan.minScenes || scenes.length > plan.maxScenes) {
    onLog?.(`AI chọn ${scenes.length} cảnh, ngoài gợi ý ${plan.minScenes}-${plan.maxScenes}; vẫn dùng vì kịch bản hợp lệ`);
  }
  const sfxCount = scenes.reduce((sum, scene) => sum + (Array.isArray(scene.sfxPlan) ? scene.sfxPlan.length : 0), 0);
  onLog?.(`✓ Kịch bản AI HTML: ${scenes.length} cảnh, ${sfxCount} SFX cue, đã có htmlSpec chi tiết`);
  return { scenes };
}

export async function generateTemplateDataForScript({
  scenes,
  keys,
  onLog,
  videoObjective = DEFAULT_VIDEO_OBJECTIVE,
  uploadedImages = [],
}) {
  const objectiveId = normalizeVideoObjective(videoObjective);
  const allowedTemplates = getTemplatesForObjective(objectiveId);
  const prompt = TEMPLATE_DATA_PROMPT.replace(
    '{{SCENE_TEMPLATE_DATA_INPUT}}',
    JSON.stringify(buildTemplateDataPromptInput(scenes, objectiveId, uploadedImages), null, 2)
  );
  const { result } = await callAI({ prompt, isJson: true, keys, onLog });
  const finalScenes = normalizeFinalScenesInput(result, { allowedTemplates });
  copyPlannedImageFields(finalScenes, scenes);
  applyLocalImageFallbacks(finalScenes, scenes);
  clearUploadedImageSearchQueries(finalScenes);
  onLog?.(`✓ TemplateData JSON: ${finalScenes.length} cảnh, đã khớp schema template`);
  return { scenes: finalScenes };
}

function buildPlanningCatalog(videoObjective) {
  return getTemplateRecordsForObjective(videoObjective).map(record => ({
    template: record.template,
    description: record.description,
    needsImage: templateNeedsImage(record.template, videoObjective),
    templateDataSample: record.templateData || {},
  }));
}

function getImageTemplatesForObjective(videoObjective) {
  return getTemplateRecordsForObjective(videoObjective)
    .map(record => record.template)
    .filter(template => templateNeedsImage(template, videoObjective));
}

export function preferImageTemplatesForScript(scenes = [], {
  requireImages = false,
  videoObjective = DEFAULT_VIDEO_OBJECTIVE,
  uploadedImages = [],
  onLog,
} = {}) {
  if (!requireImages || !Array.isArray(scenes) || !scenes.length) return scenes;
  const objectiveId = normalizeVideoObjective(videoObjective);
  const imageTemplates = getImageTemplatesForObjective(objectiveId);
  if (!imageTemplates.length) {
    onLog?.(`Yêu cầu có ảnh nhưng objective "${objectiveId}" chưa có template hỗ trợ ảnh; giữ template hiện tại`);
    return scenes;
  }

  const uploadPool = normalizeUploadedImages(uploadedImages);
  const editableScenes = scenes.filter((scene, index) => {
    const isLast = index === scenes.length - 1;
    return scene?.template !== 'outro' && !isLast;
  });
  const targetImageSceneCount = Math.min(
    editableScenes.length,
    Math.max(1, Math.ceil(editableScenes.length * 0.55))
  );
  let currentImageScenes = editableScenes.filter(scene => templateNeedsImage(scene.template, objectiveId)).length;
  let changed = 0;

  for (const scene of editableScenes) {
    if (currentImageScenes >= targetImageSceneCount) break;
    if (templateNeedsImage(scene.template, objectiveId)) continue;
    const nextTemplate = imageTemplates[(currentImageScenes + changed) % imageTemplates.length];
    scene.template = nextTemplate;
    scene.imageRequired = true;
    ensureSceneImageSource(scene, uploadPool);
    currentImageScenes += 1;
    changed += 1;
  }

  for (const scene of editableScenes) {
    if (!templateNeedsImage(scene.template, objectiveId)) continue;
    scene.imageRequired = true;
    ensureSceneImageSource(scene, uploadPool);
  }

  if (changed) {
    onLog?.(`Yêu cầu có ảnh: đã ưu tiên/chuyển ${changed} cảnh sang template có ảnh (${imageTemplates.join(', ')})`);
  }
  return scenes;
}

function ensureSceneImageSource(scene = {}, uploadPool = []) {
  const hasUpload = sceneUploadedImageUrl(scene);
  const hasKeyword = String(scene?.['keyword-image'] || scene?.keywordImage || '').trim();
  if (hasUpload || hasKeyword) return;

  if (uploadPool.length) {
    const selected = uploadPool[((Number(scene.stt) || 1) - 1) % uploadPool.length] || uploadPool[0];
    scene['uploaded-image-url'] = selected.src;
    scene.uploadedImageUrl = selected.src;
    scene['uploaded-image-name'] = selected.name || selected.title || selected.filename || '';
    scene.uploadedImageName = scene['uploaded-image-name'];
    scene['keyword-image'] = '';
    scene.keywordImage = '';
    return;
  }

  const keyword = buildFallbackImageKeyword(scene);
  scene['keyword-image'] = keyword;
  scene.keywordImage = keyword;
}

function buildFallbackImageKeyword(scene = {}) {
  const voice = String(scene.voice || '').replace(/[^\p{L}\p{N}\s%$€£¥₫.-]/gu, ' ');
  const words = voice.replace(/\s+/g, ' ').trim().split(/\s+/).slice(0, 12).join(' ');
  return `${words || 'editorial documentary image'} -logo -icon -clipart -stock`.trim();
}

function buildTemplateDataPromptInput(scenes = [], videoObjective, uploadedImages = []) {
  const records = new Map(getTemplateRecordsForObjective(videoObjective).map(record => [record.template, record]));
  const uploadPool = normalizeUploadedImages(uploadedImages);
  return (Array.isArray(scenes) ? scenes : []).map(scene => {
    const record = records.get(scene.template) || {};
    const availableImages = collectAvailableImages(scene, uploadPool);
    return {
      stt: scene.stt,
      voice: scene.voice,
      ttsVoice: scene.ttsVoice || scene.voice,
      targetDurationSec: scene.targetDurationSec,
      template: scene.template,
      'keyword-image': scene['keyword-image'] || scene.keywordImage || '',
      'uploaded-image-url': sceneUploadedImageUrl(scene),
      'uploaded-image-name': scene['uploaded-image-name'] || scene.uploadedImageName || '',
      templateSample: record.templateData || {},
      ps: templateNeedsImage(scene.template, videoObjective)
        ? 'Chọn hình ảnh phù hợp trong availableImages để điền vào image.src; nếu là image-background-hero thì điền cả background.src.'
        : '',
      availableImages,
      downloadedImages: availableImages,
    };
  });
}

function buildImageRequirementText({ requireImages = false, uploadedImages = [] } = {}) {
  const uploads = normalizeUploadedImages(uploadedImages);
  if (uploads.length) {
    return [
      `Images are REQUIRED because the user uploaded ${uploads.length} image(s).`,
      'Use the uploaded images in visible video scenes. Prefer one uploaded image per relevant scene.',
      'For scenes using upload, set imageRequired=true, uploaded-image-url to the exact uploaded src, uploaded-image-name, and keyword-image="".',
    ].join('\n');
  }
  if (requireImages) {
    return [
      'Images are REQUIRED because the topic/request asks for photos/images/visual evidence.',
      'Mark key/main scenes with imageRequired=true and include a concrete keyword-image query for Google/Serper image search.',
      'The HTML must visibly use the downloaded local image later.',
    ].join('\n');
  }
  return 'Images are optional. Use keyword-image only when a real photo/screenshot/evidence image materially improves the scene.';
}

function applyLocalImageFallbacks(finalScenes = [], plannedScenes = []) {
  const plannedByStt = new Map((Array.isArray(plannedScenes) ? plannedScenes : []).map(scene => [Number(scene.stt), scene]));
  for (const scene of finalScenes) {
    const planned = plannedByStt.get(Number(scene.stt));
    const candidates = collectAvailableImages(planned, []);
    if (!candidates.length) continue;

    const candidateSrcs = new Set(candidates.map(item => item.src).filter(Boolean));
    const currentSrc = String(scene.templateData?.image?.src || scene.templateData?.background?.src || '').trim();
    if (candidateSrcs.has(currentSrc)) continue;

    const selected = candidates[0];
    const data = {
      ...(scene.templateData || {}),
      image: {
        ...(scene.templateData?.image || {}),
        title: selected.title || '',
        src: selected.src,
        width: selected.width || 0,
        height: selected.height || 0,
        alt: selected.title || scene.templateData?.title || '',
      },
    };
    if (scene.template === 'image-background-hero') {
      data.background = {
        ...(data.background || {}),
        type: 'image',
        src: selected.src,
      };
    }
    scene.templateData = normalizeTemplateData(scene.template, data);
  }
}

function copyPlannedImageFields(finalScenes = [], plannedScenes = []) {
  const plannedByStt = new Map((Array.isArray(plannedScenes) ? plannedScenes : []).map(scene => [Number(scene.stt), scene]));
  for (const scene of finalScenes) {
    const planned = plannedByStt.get(Number(scene.stt));
    if (!planned) continue;
    const plannedKeyword = planned['keyword-image'] || planned.keywordImage || '';
    const plannedUploadUrl = sceneUploadedImageUrl(planned);
    const plannedUploadName = planned['uploaded-image-name'] || planned.uploadedImageName || '';
    if (plannedKeyword && !scene['keyword-image'] && !scene.keywordImage) {
      scene['keyword-image'] = plannedKeyword;
      scene.keywordImage = plannedKeyword;
    }
    if (plannedUploadUrl && !sceneUploadedImageUrl(scene)) {
      scene['uploaded-image-url'] = plannedUploadUrl;
      scene.uploadedImageUrl = plannedUploadUrl;
    }
    if (plannedUploadName && !scene['uploaded-image-name'] && !scene.uploadedImageName) {
      scene['uploaded-image-name'] = plannedUploadName;
      scene.uploadedImageName = plannedUploadName;
    }
  }
}

function clearUploadedImageSearchQueries(finalScenes = []) {
  for (const scene of finalScenes) {
    if (!sceneUploadedImageUrl(scene)) continue;
    if (scene['keyword-image'] || scene.keywordImage) continue;
    if (scene.templateData?.imageSearch && typeof scene.templateData.imageSearch === 'object') {
      scene.templateData.imageSearch = {
        ...scene.templateData.imageSearch,
        q: '',
        results: [],
      };
    }
  }
}

function collectAvailableImages(scene = {}, uploadPool = []) {
  const groups = [
    Array.isArray(scene?.uploadedImageCandidates) ? scene.uploadedImageCandidates : [],
    Array.isArray(scene?.imageCandidates) ? scene.imageCandidates : [],
  ];
  const wantedUpload = sceneUploadedImageUrl(scene);
  if (wantedUpload) {
    const selected = normalizeUploadedImages(uploadPool).find(item => item.src === wantedUpload);
    if (selected) groups.unshift([selected]);
  }
  const result = [];
  const seen = new Set();
  for (const item of groups.flat()) {
    const src = String(item?.src || '').trim();
    if (!src || seen.has(src)) continue;
    seen.add(src);
    result.push({
      title: String(item?.title || item?.name || item?.filename || '').trim(),
      name: String(item?.name || item?.title || item?.filename || '').trim(),
      src,
      width: Number(item?.width) || 0,
      height: Number(item?.height) || 0,
      source: item?.source || (src.includes('/images/uploaded/') ? 'upload' : 'search'),
    });
  }
  return result;
}

function toPromptImage(item) {
  return {
    name: item.name || item.title || item.filename || '',
    filename: item.filename || '',
    title: item.title || item.name || '',
    src: item.src,
    source: 'upload',
  };
}
