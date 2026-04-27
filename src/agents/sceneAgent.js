// src/agents/sceneAgent.js - Bước 5: Tạo HTML cho từng cảnh
import { callAI } from '../services/aiRouter.js';

const AR_CONFIGS = {
  '9:16': {
    w: 1080,
    h: 1920,
    label: 'portrait, TikTok/Reels',
    sidePadding: 70,
    topPadding: 90,
    bottomPadding: 130,
    textMaxW: 830,
    heroMaxW: 810,
    cardMinW: 620,
    cardMaxW: 780,
    subjectMaxH: 990,
    textBlockMaxH: 360,
    safeCenterW: 760,
    safeCenterH: 980,
    splitGap: 36,
    layoutRules: `RULES FOR 9:16 (tall portrait, mobile-first):
• Focal area: center column, vertical layout; avoid overly horizontal arrangements.
• Hero text/number: max-width {{HERO_MAX_W}}px; centered or very slight offset.
• Card/phone/mockup: width {{CARD_MIN_W}}px to {{CARD_MAX_W}}px; no full-width except background.
• 2-column layout: only if each column is narrow, total group max-width 84%; prefer vertical stack over horizontal split.
• Keep important subjects away from top/bottom edges; min headroom {{TOP_PADDING}}px, min side padding {{SIDE_PADDING}}px inside #content.
• Do not place text or key subjects in lower third — subtitle burn-in will cover them.
• Background image/video: object-fit:cover; focal point at center 45%/40%, avoid cropping the subject.
• Mascot/person/tall subject: max height {{SUBJECT_MAX_H}}px, bottom of subject stops above safe subtitle zone.`,
  },
  '16:9': {
    w: 1920,
    h: 1080,
    label: 'landscape, YouTube',
    sidePadding: 90,
    topPadding: 70,
    bottomPadding: 90,
    textMaxW: 980,
    heroMaxW: 920,
    cardMinW: 520,
    cardMaxW: 760,
    subjectMaxH: 450,
    textBlockMaxH: 300,
    safeCenterW: 1320,
    safeCenterH: 620,
    splitGap: 80,
    layoutRules: `RULES FOR 16:9 (wide landscape, cinematic):
• Focal area: center slightly offset left/right; leverage width for split layouts, timelines, dashboards.
• Hero text/number: max-width {{HERO_MAX_W}}px; avoid stretching into one long unreadable line.
• 2 clear columns or 60/40 layout allowed, but each block needs at least {{SPLIT_GAP}}px breathing room.
• Main subject (text block) max height {{TEXT_BLOCK_MAX_H}}px; avoid overly long vertical stacks.
• Horizontal video/image: prefer object-fit:cover or contain based on asset, always within a clear frame without cropping faces/text.
• Secondary elements should spread horizontally, not all crowded at center like 9:16.
• Avoid completely empty left/right edges or packing to the very edge; keep outer padding min {{SIDE_PADDING}}px.`,
  },
  '1:1':  {
    w: 1080,
    h: 1080,
    label: 'square, Instagram',
    sidePadding: 70,
    topPadding: 70,
    bottomPadding: 90,
    textMaxW: 760,
    heroMaxW: 730,
    cardMinW: 520,
    cardMaxW: 700,
    subjectMaxH: 700,
    textBlockMaxH: 280,
    safeCenterW: 740,
    safeCenterH: 740,
    splitGap: 32,
    layoutRules: `RULES FOR 1:1 (square, perfect balance):
• Focal area: frame center; prefer symmetric, radial, orbit layouts; 1 hero + 1 label.
• Hero text/number: max-width {{HERO_MAX_W}}px; text block height max {{TEXT_BLOCK_MAX_H}}px.
• Avoid overly tall or wide layouts; split layout only for very simple content.
• Main asset should be within the safe zone {{SAFE_CENTER_W}}px × {{SAFE_CENTER_H}}px at frame center.
• Card/list: max 3 items, each large and spacious; no dense dashboards.
• Background decoration should wrap around subject; do not block 4 corners with large objects.
• Maintain {{SIDE_PADDING}}px breathing room on each side inside #content to avoid cramped feel.`,
  },
  '4:5':  {
    w: 1080,
    h: 1350,
    label: 'portrait, Instagram Portrait',
    sidePadding: 65,
    topPadding: 60,
    bottomPadding: 105,
    textMaxW: 790,
    heroMaxW: 760,
    cardMinW: 600,
    cardMaxW: 820,
    subjectMaxH: 760,
    textBlockMaxH: 300,
    safeCenterW: 780,
    safeCenterH: 760,
    splitGap: 34,
    layoutRules: `RULES FOR 4:5 (portrait, balanced between feed and mobile):
• Focal area: slightly above center; vertical layout but less extreme than 9:16.
• Hero text/number: max-width {{HERO_MAX_W}}px; can use 2 short text rows.
• Card, chart, product shot: width {{CARD_MIN_W}}px to {{CARD_MAX_W}}px; avoid assets so tall they dominate the frame.
• Split layout works if each block is large enough; best as 1 hero + 1 support block below or beside.
• Bottom of main subject must stop above safe lower third; no CTA/text near the bottom edge.
• Portrait/person photo: maintain headroom {{TOP_PADDING}}px to 90px, avoid cropping head or hands.
• Min side padding {{SIDE_PADDING}}px, min top padding {{TOP_PADDING}}px for comfortable feed view.`,
  },
};

function getAspectRatioRules(ar) {
  const layoutRules = ar.layoutRules
    .replaceAll('{{SIDE_PADDING}}', String(ar.sidePadding))
    .replaceAll('{{TOP_PADDING}}', String(ar.topPadding))
    .replaceAll('{{BOTTOM_PADDING}}', String(ar.bottomPadding))
    .replaceAll('{{TEXT_MAX_W}}', String(ar.textMaxW))
    .replaceAll('{{HERO_MAX_W}}', String(ar.heroMaxW))
    .replaceAll('{{CARD_MIN_W}}', String(ar.cardMinW))
    .replaceAll('{{CARD_MAX_W}}', String(ar.cardMaxW))
    .replaceAll('{{SUBJECT_MAX_H}}', String(ar.subjectMaxH))
    .replaceAll('{{TEXT_BLOCK_MAX_H}}', String(ar.textBlockMaxH))
    .replaceAll('{{SAFE_CENTER_W}}', String(ar.safeCenterW))
    .replaceAll('{{SAFE_CENTER_H}}', String(ar.safeCenterH))
    .replaceAll('{{SPLIT_GAP}}', String(ar.splitGap));

  return `CURRENT ASPECT RATIO: ${ar.label} (${ar.w}×${ar.h})
Hard layout thresholds — MUST use these values directly in code:
• SIDE_PADDING = ${ar.sidePadding}px
• TOP_PADDING = ${ar.topPadding}px
• BOTTOM_PADDING = ${ar.bottomPadding}px
• TEXT_MAX_W = ${ar.textMaxW}px
• HERO_MAX_W = ${ar.heroMaxW}px
• CARD_MIN_W = ${ar.cardMinW}px
• CARD_MAX_W = ${ar.cardMaxW}px
• SUBJECT_MAX_H = ${ar.subjectMaxH}px
• TEXT_BLOCK_MAX_H = ${ar.textBlockMaxH}px
• SAFE_CENTER_W = ${ar.safeCenterW}px
• SAFE_CENTER_H = ${ar.safeCenterH}px
• SPLIT_GAP = ${ar.splitGap}px

${layoutRules}

GENERAL RULES BY RATIO:
• Every asset/text must be in a clear container with explicit top/left/width/height or internal flex/grid — no vague values that cause overflow.
• For images/video/logos: if content risks being cropped, prefer a contain frame + background fill over full-cover.
• No text block, main icon, character, or card may touch the edges of #content; always maintain proper padding per ratio rules.
• If the Visual concept layout conflicts with ratio rules, ALWAYS prioritize ratio rules to keep content in-frame.
• When writing CSS/JS, prefer using these exact threshold values for width/max-width/height/max-height/top/left/right/bottom rather than estimating.`;
}

function parseSRT(srt) {
  const blocks = srt.trim().split(/\n\n+/);
  return blocks.map(b => {
    const lines = b.split('\n');
    const time = lines[1] || '';
    const [from, to] = time.split(' --> ').map(t => t.trim());
    return { from, to, text: lines.slice(2).join(' ') };
  }).filter(x => x.from && x.to);
}

function srtToMs(t) {
  const [h, m, rest] = t.split(':');
  const [s, ms] = rest.split(',');
  return (+h) * 3600000 + (+m) * 60000 + (+s) * 1000 + (+ms);
}

// Default style guide (Finance / Crypto) — used when no styleGuide is passed in
export const DEFAULT_STYLE_GUIDE = `COLORS (use only from this list):
• Primary: #F7B500 (gold main), #FFD93D (bright gold), #FF9500 (orange accent)
• Gain/bull: #22c55e, #10b981, glow #22c55e80
• Loss/bear: #ef4444, #dc2626, glow #ef444480
• Neutral: #fff, #e5e7eb, #9ca3af, #4b5563
• BG accent: #1e293b, #0f172a, #1a1a2e
• Gold gradient: linear-gradient(135deg,#F7B500,#FF9500,#FFD93D)
• Bull gradient: linear-gradient(135deg,#10b981,#22c55e)
• Bear gradient: linear-gradient(135deg,#dc2626,#ef4444)

FONT SIZE (fixed px, viewport {{W}}):
• Hero number: 200-280px, font-weight:900, IBM Plex Mono
• Big number: 140-180px, font-weight:800
• Title: 72-96px, Be Vietnam Pro 800
• Subtitle: 48-56px, 600
• Label: 32-40px, 500, letter-spacing:2px, uppercase
• Caption: 24-28px, 400

VIETNAMESE TEXT — MANDATORY:
• All text elements MUST use class="txt" (defined in the CSS template).
• NEVER use overflow:hidden on any container holding text — Vietnamese diacritics above characters (ắ, ế, ổ...) will be clipped.
• If using inline style: add line-height:1.5;overflow:visible;padding-top:0.15em.
• Avoid placing text flush against elements above — keep margin-top at least 20px so diacritics aren't covered.

TEXT EFFECT PRESETS:
• Gold glow: text-shadow:0 0 30px #F7B500,0 0 60px #F7B50060
• Gradient fill: background:linear-gradient(135deg,#F7B500,#FFD93D);-webkit-background-clip:text;-webkit-text-fill-color:transparent
• Outline: -webkit-text-stroke:3px #F7B500;color:transparent
• 3D depth: text-shadow:0 4px 0 #8b6a00,0 8px 20px rgba(0,0,0,0.5)

DOMAIN ICONS/EMOJIS (SVG inline, size 80-200px, stroke-width 2.5-3):
• Bitcoin: <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#F7931A"/><text x="32" y="44" text-anchor="middle" font-family="Arial Black" font-size="40" fill="#fff">₿</text></svg>
• ETH: <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#627EEA"/><path d="M32 10L17 33l15-7V10zM32 10v16l15 7L32 10zM32 45v13l15-21-15 8zM32 58V45L17 37l15 21z" fill="#fff" opacity="0.8"/></svg>
• Dollar: circle + "$" text; Trend up/down: arrow path + trail
• Emojis: 🚀📈📉💰🔥⚡🎯💎🏆⚠️✅❌🔔📊💸🪙

AMBIENT SUGGESTION: tsParticles gold dust (#F7B500) OR matrix rain with chars ['0','1','$','₿']

CONCEPT → VISUAL MAPPING (domain: Finance / Crypto):
• Price up/bull → green #22c55e, arrow up, chart line rising, confetti, rocket icon
• Price down/bear → red #ef4444, arrow down, chart line falling, shake, warning icon
• Money/fees/cost → dollar icon, coin SVG, number count, wallet
• Time/waiting → clock icon, timer count, hourglass
• Speed/fast → speed lines, tunnel bg, zap icon ⚡
• Safety/security → shield, lock, green glow
• Comparison → SPLIT/VERSUS layout, 2 columns
• List/many items → STACK/DASHBOARD, stagger
• App/platform → PHONE MOCKUP
• Community/people → multiple avatar circles, orbit
• Warning/risk → warning triangle, red pulse, shake`;

const SCENE_PROMPT = `Generate cinematic HTML animation for Chrome headless {{W}}×{{H}}px ({{RATIO_LABEL}}). Rendered via puppeteer screencast → mp4. NO subtitles (burned in post).

Duration: {{DURATION}}ms
Voice (narration): "{{VOICE}}"
Visual concept: "{{VISUAL}}"

⚠ LANGUAGE RULE — MANDATORY:
The voice narration above is in Vietnamese. All on-screen text in the HTML MUST match the language of the voice content.
• Text overlays (hero text, labels, captions, CTA, keywords) → write in Vietnamese if derived from voice or visual concept.
• Numbers, symbols, icons, brand names → keep as-is (language-neutral).
• Do NOT translate Vietnamese words to English anywhere in the HTML output.
• Exception: UI chrome like axis labels or placeholder examples may use short English abbreviations (e.g. "vs", "%" ), but all meaningful human-readable text must be Vietnamese.

LAYOUT PARAMETERS BY ASPECT RATIO:
{{ASPECT_RATIO_RULES}}

════════════════════════════════════════
PART 0 — COMMON ERRORS: MANDATORY READ
════════════════════════════════════════

❌ ERROR A — ELEMENT OUT OF FRAME / CLIPPED
  Causes: missing top/left on position:absolute, width > container, translateX/Y too large.
  Required:
  • Every position:absolute inside #content: MUST declare explicit top AND left (px). NEVER leave as "auto" or omit.
  • Sum (left + width) ≤ {{CONTENT_W}}px; (top + height) ≤ {{CONTENT_H}}px — verify before writing.
  • Slide-in from bottom: start translateY({{H}}px) → tween to 0. Slide-out down: 0 → {{H}}px.
  • Slide-in from right: start translateX({{W}}px) → 0. From left: -{{W}}px → 0.
  • Shake/vibrate: translateX max ±20px (NOT ±100px+). Zoom punch: scale max 1.15.
  • NEVER use margin:auto alone to center with position:absolute — use left:50%;transform:translateX(-50%).

❌ ERROR B — OVERLAPPING BEATS / ELEMENTS COVERING EACH OTHER
  Causes: 2 beats active simultaneously, old beat not hidden when new beat enters, same z-index collision.
  Required:
  • Each beat = 1 unique wrapper div: <div id="b1" style="position:absolute;inset:0;opacity:0;pointer-events:none">
  • Only animate WRAPPER opacity to enter/exit — NEVER animate individual child elements separately.
  • Beat N exit must complete (wrapper opacity = 0) BEFORE beat N+1 starts entering — no overlap by even 1ms.
  • Use gsap.timeline() to chain: enter → hold → exit → (onComplete) enter next beat.
  • Child elements inside wrapper: position:absolute + explicit top/left in px.

❌ ERROR C — ANIMATION NOT RUNNING (library not loaded)
  Causes: code runs before CDN scripts are ready, using display:none, createElement outside load handler.
  Required:
  • ALL animation code MUST be inside: window.addEventListener('load', function(){ ... });
  • NEVER put any gsap.to() / anime() / tsParticles.load() OUTSIDE the load handler — CDN crash will break everything.
  • NEVER use display:none — use only opacity:0 (display is not animatable; opacity is).
  • NEVER use visibility:hidden to hide elements.
  • If creating elements via createElement(): create and appendChild() to DOM INSIDE load handler, BEFORE animating.
  • Ambient (tsParticles/bokeh/Three.js): initialize INSIDE load handler.

❌ ERROR D — VIETNAMESE TEXT CLIPPED / DIACRITICS HIDDEN
  Causes: overflow:hidden on text container, low line-height, clip-path cutting top area.
  Required:
  • NEVER use overflow:hidden on any div/span/p containing Vietnamese text — use overflow:visible.
  • All text must have class="txt" (line-height:1.5; overflow:visible; padding-top:0.15em already defined).
  • Text container: padding-top ≥ 8px, margin-top ≥ 12px from element above.
  • NEVER use clip-path on elements containing Vietnamese text.
  • NEVER use white-space:nowrap on long text — it will overflow horizontally.

════════════════════════════════════════
PART 1 — REQUIRED FRAME (DO NOT MODIFY)
════════════════════════════════════════

MANDATORY AFTER COPYING FRAME: Add a second <style> in <head> to override the palette per STYLE GUIDE (PART 5):
<style>:root{--c-bg:[BG_COLOR];--c-stage:[GRADIENT_OR_COLOR];--c-grid:[rgba grid, transparent if not needed];--c-accent:[ACCENT];--c-accent2:[ACCENT2]}</style>
→ This is the ONLY way to change background, grid and accent colors per domain. Do NOT skip this step.

<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600;700&family=Bebas+Neue&display=swap" rel="stylesheet">
<!-- ANIMATION ENGINE (always included) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<!-- ADD OTHER LIBRARIES AS NEEDED (see PART 2) -->

<style>
/* CSS VARS — style guide MUST override these vars (see PART 1 instructions above) */
:root{--c-bg:#05050a;--c-stage:radial-gradient(ellipse at 50% 30%,#1a1a2e 0%,#0a0a14 60%,#05050a 100%);--c-grid:rgba(247,181,0,0.04);--c-accent:#F7B500;--c-accent2:#FFD93D}
*{box-sizing:border-box}
html,body{width:{{W}}px;height:{{H}}px;margin:0;padding:0;overflow:hidden;background:var(--c-bg)}
#stage{position:absolute;inset:0;width:{{W}}px;height:{{H}}px;overflow:hidden;background:var(--c-stage);font-family:'Be Vietnam Pro',sans-serif;color:#fff}
#particles-bg{position:absolute;inset:0;z-index:1;pointer-events:none}
.grid-bg{position:absolute;inset:0;background-image:linear-gradient(var(--c-grid) 1px,transparent 1px),linear-gradient(90deg,var(--c-grid) 1px,transparent 1px);background-size:60px 60px;pointer-events:none;z-index:2}
.txt{display:block;line-height:1.5;overflow:visible;padding-top:0.15em;padding-bottom:0.05em}
.vignette{position:absolute;inset:0;background:radial-gradient(circle at center,transparent 55%,rgba(0,0,0,0.75));pointer-events:none;z-index:90}
.scan{position:absolute;inset:0;background:repeating-linear-gradient(180deg,rgba(255,255,255,0.025) 0px,rgba(255,255,255,0.025) 2px,transparent 2px,transparent 4px);pointer-events:none;z-index:91}
.noise{position:absolute;inset:0;opacity:.07;pointer-events:none;z-index:92;background-image:url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC45IiBudW1PY3RhdmVzPSIzIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbHRlcj0idXJsKCNuKSIgb3BhY2l0eT0iMC42Ii8+PC9zdmc+')}
#content{position:absolute;inset:10px;overflow:hidden;z-index:3;pointer-events:none}
</style></head><body>
<div id="stage">
  <div id="particles-bg"></div>
  <div class="grid-bg"></div>
  <!-- ALL CONTENT GOES INTO #content (safe zone 10px) — NEVER place content directly in #stage -->
  <div id="content">
    <!-- CONTENT LAYERS HERE (z-index 10-80, relative to #content) -->
  </div>
  <div class="vignette"></div>
  <div class="scan"></div>
  <div class="noise"></div>
</div>
<script>
// FAILSAFE — only triggers if CDN crashes or load handler cannot run; delay 2000ms
var _animReady=false;
setTimeout(function(){
  if(!_animReady){document.querySelectorAll('#content *').forEach(function(el){if(parseFloat(getComputedStyle(el).opacity)<0.05){el.style.opacity='1';el.style.transform='none';}});}
},2000);
// ════ MANDATORY: ALL SCENE CODE MUST BE INSIDE window.addEventListener('load',...) ════
// Reason: ensures CDN scripts (anime.js, gsap, tsParticles...) are fully loaded before use.
// Set _animReady=true at the top of the handler to disable the failsafe.
window.addEventListener('load',function(){
  _animReady=true;
  // SCENE CODE HERE
});
// ALWAYS END FILE WITH </script></body></html>
</script></body></html>

════════════════════════════════════════
PART 2 — CDN EFFECT LIBRARIES
════════════════════════════════════════

Import only NEEDED libraries (max 4-5). Do not import everything.

CORE GROUP (always present — already in template):
• anime.js 3.2.1 — main timeline, beat sync
• gsap 3.12.5 — smooth tweens

TEXT GROUP (add if needed):
• gsap TextPlugin — character-by-character text reveal
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/TextPlugin.min.js"></script>
• CountUp.js 2.8.0 — number count up/down
  <script src="https://cdnjs.cloudflare.com/ajax/libs/countup.js/2.8.0/countUp.umd.js"></script>

PARTICLE GROUP (pick 1 if needed):
• tsParticles slim 2.12.0 — RECOMMENDED, flexible JSON config (see PART 4)
  <script src="https://cdn.jsdelivr.net/npm/tsparticles-slim@2.12.0/tsparticles.slim.bundle.min.js"></script>
• Or hand-code with anime.js (30-50 circle divs, stagger loop — no CDN needed)

3D GROUP (ONLY when visual EXPLICITLY requires 3D — see PART 3):
• Three.js r128: <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
• p5.js 1.9.0 (generative art, lighter than Three.js): <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js"></script>

TEXT GROUP:
• CountUp.js 2.8.0: <script src="https://cdnjs.cloudflare.com/ajax/libs/countup.js/2.8.0/countUp.umd.js"></script>
  → new countUp.CountUp('el', value, {duration:1.5, separator:',', prefix:'$'}).start()
• gsap TextPlugin: <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/TextPlugin.min.js"></script>
  → gsap.to(el, {text:"...", duration:1})

════════════════════════════════════════
PART 3 — THREE.JS (only when visual EXPLICITLY requires 3D)
════════════════════════════════════════

Canvas: <canvas id="three-bg" style="position:absolute;inset:0;z-index:0;pointer-events:none"></canvas>
Setup: Scene + PerspectiveCamera(60,W/H,0.1,1000) + WebGLRenderer({canvas,alpha:true,antialias:true}) + setSize(W,H) + requestAnimationFrame loop

Recipes (pick 1 — use --c-accent color instead of hardcoding gold):
• PARTICLE SPHERE: 3000 BufferGeometry points + PointsMaterial({size:0.03,transparent:true}) + rotate y+=0.003/frame
• WIREFRAME MESH: SphereGeometry/TorusGeometry + MeshBasicMaterial({wireframe:true,opacity:0.15}) + rotate loop
• FLOATING CUBES: 30 BoxGeometry, random position/rotation speed, opacity 0.1-0.3
• TUNNEL: 200 cylinder points, z -= speed, reset when z < -10
• GRID PLANE: PlaneGeometry(20,20,40,40) wireframe + rotation.x=-Math.PI/3 + sine wave

RULES: alpha:true | no texture/OrbitControls/module imports | particle ≤5000 | camera drift ≤0.001 rad/frame

════════════════════════════════════════
PART 4 — tsParticles RECIPES
════════════════════════════════════════

tsParticles.load('particles-bg', { particles: { number:{value:N}, color:{value:'VAR(--c-accent)'}, shape:{type:'circle'}, opacity:{...}, size:{...}, move:{enable:true,speed:S,direction:'DIR',outModes:'bounce'} }, detectRetina:true })

Recipes (replace VAR(--c-accent) with appropriate style guide color):
• AMBIENT FLOAT: N=50, speed=1, direction='none' — gently drifting dots
• CONFETTI BURST: N=150, spread horizontal+vertical, emit at beat climax
• RISING BUBBLES: N=30, direction='top', speed=2, opacity fade
• MATRIX RAIN: shape='char', character=['0','1','$','₿'], direction='bottom', speed=4

════════════════════════════════════════
PART 5 — STYLE GUIDE (domain-specific)
════════════════════════════════════════

{{STYLE_GUIDE}}

════════════════════════════════════════
PART 6 — INLINE SVG ICON LIBRARY
════════════════════════════════════════

Inline SVG required (no icon fonts). Size 80-200px. Stroke-width 2.5-3.

Domain icons: see PART 5 — Style Guide (domain-specific SVG inline + emojis).

General icons (stroke, colored per style guide):
• Clock, Wallet, Chart, Fire, Rocket, Warning, Check, X, Lock, Unlock, Eye, Shield, Zap, Gift, Star
  Get path data from Lucide (MIT license): https://lucide.dev

Emojis when appropriate: 🚀📈📉💰🔥⚡🎯💎🏆⚠️✅❌🔔📊💸🪙

════════════════════════════════════════
PART 7 — EFFECTS & MOTION
════════════════════════════════════════

ENTER (pick 1 per element):
• Pop-in glow: scale:[0,1]+blur:[20,0]px+fade, 500ms easeOutBack
• Slide up: translateY:[80,0]+fade, 600ms easeOutExpo
• Count-up: CountUp.js or anime innerHTML, 800-1500ms
• Typewriter: gsap TextPlugin or interval 30ms/char
• Clip reveal: clip-path inset(0 100% 0 0)→inset(0), 700ms
• Elastic: scale:[0,1] easeOutElastic, 800ms
• Glitch-in: translateX±20 flicker + fade, 300ms

EXIT (300-500ms): Fade opacity→0 | Shrink scale→0.8+fade | Glitch-out translateX flicker

AMBIENT (continuous — pick 1):
• tsParticles: floating dots, confetti burst, matrix rain, rising bubbles (see PART 4)
• Bokeh CSS: 10-20 circle divs opacity 0.05-0.15, slow drift (lightweight, no CDN)
• Three.js: see PART 3

EMPHASIS: Shake translateX[-10,10,-8,8,0] | Pulse scale[1,1.15,1] | Glow burst text-shadow flash
TRANSITION: Crossfade | Zoom punch 1→1.08→1 | Whip pan ±200+blur

════════════════════════════════════════
PART 8 — VISUAL COMPOSITION
════════════════════════════════════════

Safe zone — MANDATORY:
• ALL content elements must be inside div#content (position:absolute;inset:10px;overflow:hidden).
• div#content hard-clips 10px on all 4 sides — NEVER place elements directly in div#stage.
• Coordinate space inside div#content: width={{CONTENT_W}}px, height={{CONTENT_H}}px.
• Minimum outer padding: left/right {{SIDE_PADDING}}px, top {{TOP_PADDING}}px, bottom {{BOTTOM_PADDING}}px.
• Main text block: max-width {{TEXT_MAX_W}}px. Hero text/number: max-width {{HERO_MAX_W}}px.
• Main subject (person, mascot, product, phone, large card): max-height {{SUBJECT_MAX_H}}px.
• Multi-line text block: max-height {{TEXT_BLOCK_MAX_H}}px.
• Safe focus zone at frame center: {{SAFE_CENTER_W}}px × {{SAFE_CENTER_H}}px. Prefer placing hero, numbers, main subject here.
• Split layout or 2 columns: gap minimum {{SPLIT_GAP}}px.
• Natural design with focal point at screen center area.
  Lower third (y > {{LOWER_THIRD_Y}}px) is the subtitle burn-in zone post-render — keep clear, background/ambient only.
  → Main content (text, numbers, icons, cards, mascots): concentrate at y = 60px to {{CONTENT_MAX_Y}}px inside div#content.
• Do not use width:100% for hero/card/text containers unless it's a background; always clamp to the thresholds above.

Layout patterns:
• HERO: 1 giant number/text at center, small label above
• SPLIT: 2 comparison columns left/right
• STACK: 3-4 cards stacked vertically, stagger enter
• ORBIT: 1 center + satellites rotating around (use anime rotate)
• TIMELINE: horizontal/vertical axis + stagger milestones
• CHART: bar/line animating from 0 → value (div height/width animate)
• PHONE MOCKUP: phone frame at center (voice mentions app/transactions)
• DASHBOARD: 4-6 stat cards in 2-column grid, stagger pop-in
• VERSUS: left element (red) vs right element (green), VS badge center
• REVEAL: cover overlay then clip-path reveal

LAYOUT SELECTION BY RATIO:
• 9:16, 4:5: prefer HERO, STACK, PHONE MOCKUP, REVEAL, ORBIT; limit wide SPLIT/DASHBOARD.
• 16:9: prefer SPLIT, TIMELINE, CHART, DASHBOARD, VERSUS; avoid cramming everything into center axis.
• 1:1: prefer HERO, ORBIT, short STACK, REVEAL; avoid overly long TIMELINE or heavily asymmetric splits.

Depth layers (z-index):
• 0: three-bg canvas
• 1: particles-bg
• 2: grid-bg
• 10-20: background deco, glow halos, bokeh
• 30-50: main content
• 60-80: foreground accents, badges, emoji
• 90-99: overlays (vignette, scan, noise)

════════════════════════════════════════
PART 9 — BEAT DIRECTION
════════════════════════════════════════

{{SUBS}}

DIRECTION RULES — READ CAREFULLY, APPLY STRICTLY:

1. EACH BEAT = ONE SINGLE MESSAGE
   • Extract exactly 1 main keyword (number, coin, concept) from voice.
   • Create exactly 1-2 content elements for that keyword. DO NOT create 3, 4, 5 elements at once.
   • CORRECT: "Bitcoin breaks 100K" → 1 hero number "$100,000" (count-up) + 1 BTC icon beside it.
   • WRONG: hero number + icon + chart + badge + emoji + label all at once.

2. MANDATORY LIFECYCLE FOR ALL CONTENT ELEMENTS:
   • ENTER: 400-600ms animation in (slide/fade/scale). Starts at beat.from.
   • HOLD: visible for minimum 2000ms (NEVER less than 2 seconds — viewers need to read it).
   • EXIT: 300-500ms animation out. Must START early enough before beat.to to COMPLETE by beat.to.
   • Hard formula: exit_start = beat.to - exit_duration. exit_end = beat.to.
   • Next beat: enter_start = beat.to (NOT earlier — previous beat must have finished exiting).
   • Example: beat 1000ms→3500ms, exit 400ms: enter 1000ms, hold until 3100ms, exit 3100→3500ms, next beat enters at 3500ms.

3. CLEAR BEFORE ADD — MANDATORY RULE:
   • Old beat element MUST have opacity=0 at exactly beat.to before new beat element enters.
   • ABSOLUTELY NO 2 beats visible simultaneously — overlapping beats is a critical error.
   • Use gsap.timeline() or gsap.delayedCall() or anime complete callback to ensure exit DONE → enter runs.
   • Only exception: element intentionally TRANSFORMED (scale/translate to new position, color change).
   • Ambient layer (tsParticles/bokeh) runs continuously — NOT content.
   • MANDATORY PATTERN: Each beat = 1 wrapper div (id="b1","b2"...) with initial opacity:0; animate wrapper opacity instead of individual children — guarantees clean clearing.

4. STRICT SIMULTANEOUS LIMIT:
   • Maximum 3 content elements visible at once (not counting ambient/background/overlays).
   • When staggering many items (list/cards): stagger in and out, don't let all persist simultaneously for long.

5. FINAL BEAT = CLIMAX (immutable rule):
   • Scale up hero element, glow burst, optionally add particle confetti.
   • Hold climax state until scene end (do NOT exit climax — this is the conclusion).

6. AMBIENT LAYER runs CONTINUOUSLY — pick 1: tsParticles (recommended) OR bokeh CSS OR Three.js (only when 3D is needed).

7. CHANGE LAYOUT PATTERN between beats: HERO → SPLIT → CHART → STACK (do not repeat consecutively).

CONCEPT → VISUAL MAPPING: see PART 5 — Style Guide (domain-specific mapping).

════════════════════════════════════════
PART 10 — BRAND ASSETS (OPTIONAL)
════════════════════════════════════════

Available brand assets list (format: NAME | TYPE | PATH [| DURATION]):
{{BRAND_ASSETS}}

USAGE RULES:
• If list has a "character ..." file → MUST use 1 character best matching the scene emotion/content.
• If list only has background/video/gif → use if suitable, not mandatory.
• Maximum 1 character + 1 background asset. NEVER use more than 2 assets.
Usage by type:

• image (.png/.jpg/.webp): use <img src="[PATH]"> — mascot, icon, background
  <img src="URL" style="position:absolute;bottom:120px;left:50%;transform:translateX(-50%);width:260px;z-index:70;pointer-events:none;opacity:0">
  Animate: fadeIn + float translateY ±15px loop 3s.

• gif (.gif): use <img src="[PATH]"> — auto-plays in Chrome
  Place like image, mind duration to sync with beat.

• video (.mp4/.webm): use <video src="[PATH]" autoplay muted loop playsinline>
  Typically used as background or overlay. Use appropriate z-index for layout.
  <video src="URL" autoplay muted loop playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:5;opacity:0.3;pointer-events:none"></video>

Do not cover main content (content y:300–1400). Use appropriate z-index and opacity.

════════════════════════════════════════
PART 10B — PROJECT ASSETS (MANDATORY USE)
════════════════════════════════════════

Assets specifically provided by producer, assigned to this scene (format: NAME_DESC | TYPE | PATH | ASPECT_RATIO):
{{PROJECT_ASSETS}}

MANDATORY RULES:
• If list is NOT "(none)" → MUST use ALL listed assets in this scene.
• This is a producer requirement — NEVER skip any asset.
• Use aspect ratio to calculate appropriate container size (e.g. 16:9 → width:100%;height:56vw).
• Place at the most suitable position and timing for the voice/visual content — can be main subject or background overlay.
• Usage same as PART 10 (image/gif → <img>, video → <video autoplay muted loop playsinline>).
• Paths are file:// — puppeteer loads directly from disk, no conversion needed.

════════════════════════════════════════
PART 11 — TECHNICAL CONSTRAINTS
════════════════════════════════════════

• Code: 300-600 lines. NEVER exceed 700 lines — if code is getting long, simplify animation instead of cutting midway.
• MANDATORY: File MUST be complete, ending exactly with </script></body></html>. NEVER cut off midway.
• Google Fonts link tag MUST be written correctly: <link href="https://fonts.googleapis.com/..." rel="stylesheet"> — NEVER write <link="..."> or omit href/rel.
• Import MAXIMUM 5 CDN libraries (choose based on scene needs).
• Timing: absolute ms (setTimeout/gsap.delayedCall). Total duration = {{DURATION}}ms.
• will-change:transform on heavily animated elements.
• NOT ALLOWED: external image URLs, video, heavy webGL (textures), iframes, display:flex on body.
• ALLOWED: inline SVG, CSS gradient, CSS filter, anime.js, gsap, Three.js core, tsParticles, p5.js, CountUp.js, Lottie, emoji, data:image base64.
• DOM elements: 30-150.
• Explicit easing on every animation.
• Timing-critical → anime/gsap (NOT @keyframes).
• Three.js: core only, alpha:true, particle ≤5000, slow camera drift.

POSITION & BOUNDS (violation = element overflows frame):
• Every position:absolute element in #content: MUST have explicit top AND left (px) — not "auto".
• Sum (left + width) ≤ {{CONTENT_W}}px; (top + height) ≤ {{CONTENT_H}}px.
• Center horizontally: left:50%;transform:translateX(-50%) — NEVER use left:auto;right:auto alone.
• Center vertically: top:50%;transform:translateY(-50%) — combine with translateX if centering both axes.
• Slide animation: starting value = ±{{W}}px or ±{{H}}px (outside frame), ending at 0. NEVER use ±9999px.
• Shake: translateX max ±20px. Zoom punch: scale ≤ 1.15. Do not exceed — will reveal white edges.
• transform-origin: center center (default) — declare explicitly when using large scale values.

SAFE INITIALIZATION — MANDATORY:
• Declare var _animReady=false; at top of <script>. Set _animReady=true; as first line in load handler.
• window.addEventListener('load',function(){...}) — MUST wrap ALL animation + ambient code.
• NEVER put any gsap.to() / anime() / tsParticles.load() outside the load handler.
• NEVER use display:none — only opacity:0. NEVER use visibility:hidden.
• createElement() and appendChild() must be done inside load handler, before animating that element.

BEAT WRAPPER PATTERN — mandatory to prevent overlapping:
• HTML (pre-created inside <div id="content">): <div id="b1" style="position:absolute;inset:0;opacity:0;pointer-events:none"> ... </div>
• Enter beat 1: gsap.to('#b1',{opacity:1,duration:0.5,ease:'power2.out'});
• Exit beat 1 + enter beat 2 (gsap timeline):
  gsap.timeline()
    .to('#b1',{opacity:0,duration:0.4,ease:'power2.in',delay: holdMs/1000})
    .to('#b2',{opacity:1,duration:0.5,ease:'power2.out'});
• NEVER let 2 beat wrappers have opacity>0 simultaneously — violates no-overlap rule.
• Ambient layer (tsParticles/bokeh) at lower z-index than beat wrappers, not affected by beat timing.

TIMING (violation = wrong output):
• Minimum hold: text/number ≥ 2000ms | icon/graphic ≥ 1500ms | badge/label ≥ 1200ms.
• exit_start = beat.to - exit_duration (e.g. exit 400ms → start at beat.to - 400ms).
• exit_end = beat.to — element MUST be invisible at exactly beat.to.
• Next beat enter: NEVER start before beat.to — NO overlap by even 1ms.
• Use gsap.timeline() or anime complete callback to ensure enter→hold→exit in correct order.
• NEVER use nested random setTimeouts that lose track of element lifecycle.
• Every content element must have BOTH enter AND exit called at the right times.

════════════════════════════════════════
PART 12 — PRE-SUBMISSION CHECKLIST
════════════════════════════════════════

BEAT & TIMING:
✓ Max 1-2 content elements per beat | max 3 elements simultaneously
✓ Hold ≥ 2000ms (text/number) before exit
✓ exit_start = beat.to - exit_duration; next beat enters at beat.to (no overlap)
✓ Final beat holds climax until end — no exit

LAYOUT & SAFE ZONE:
✓ All content inside #content — NEVER directly in #stage
✓ Width/height within thresholds: TEXT_MAX_W, HERO_MAX_W, SUBJECT_MAX_H, SIDE_PADDING, TOP_PADDING
✓ Lower third (y > {{LOWER_THIRD_Y}}px) clear — background/ambient only
✓ PROJECT ASSETS ≠ "(none)" → use ALL | BRAND ASSETS has "character" → use exactly 1

VISUAL & CODE:
✓ :root vars overridden per style guide (--c-bg, --c-stage, --c-grid, --c-accent, --c-accent2)
✓ ≥1 ambient layer (tsParticles/bokeh/Three.js) running continuously
✓ Different layout pattern between each beat
✓ All text: class="txt" or line-height:1.5+overflow:visible+padding-top:0.15em
✓ NO overflow:hidden on any container with Vietnamese text — use overflow:visible
✓ File < 900 lines | ≤5 CDN imports | ends with </script></body></html>
✓ Google Fonts: <link href="..." rel="stylesheet"> — NEVER write <link="...">

INITIALIZATION & BOUNDS — CHECK EACH ITEM:
✓ var _animReady=false; declared at top of <script>; _animReady=true; at top of load handler
✓ ALL gsap/anime/tsParticles inside window.addEventListener('load',function(){...})
✓ No animation calls outside load handler
✓ NO display:none — only opacity:0 (check every element initialization)
✓ NO visibility:hidden
✓ Every position:absolute has explicit top + left (px, not "auto")
✓ Sum (left+width) ≤ {{CONTENT_W}}px; (top+height) ≤ {{CONTENT_H}}px
✓ Slide animation: translateX/Y starting value = ±{{W}}px or ±{{H}}px — not ±9999px
✓ Shake: translateX ≤ ±20px; Scale: ≤ 1.15
✓ Each beat = 1 wrapper div; old beat exit completes before new beat enters (no overlap)
✓ createElement() called inside load handler, before animating

LANGUAGE:
✓ All on-screen text (hero, labels, captions) is in Vietnamese — matching the voice narration language
✓ No Vietnamese words have been translated to English in the HTML

RETURN ONLY <!DOCTYPE html>...</html>. No markdown fence, no explanation.`;

const THUMBNAIL_PROMPT = `Generate STATIC HTML thumbnail for a Vietnamese video on Chrome headless {{W}}×{{H}}px ({{RATIO_LABEL}}).

THIS IS A STATIC THUMBNAIL IMAGE, NOT A VIDEO SCENE.
Thumbnail title: "{{TITLE}}"
Thumbnail description: "{{PROMPT}}"

LAYOUT PARAMETERS BY ASPECT RATIO:
{{ASPECT_RATIO_RULES}}

MANDATORY REQUIREMENTS:
• Create a static layout only — to be captured as 1 JPEG image.
• NO anime.js, gsap, requestAnimationFrame, setTimeout, particle loops, progress bars, or any animations.
• Prioritize strong, readable, high-contrast layout with 1 main subject and short text overlay.
• Text must be large, clear, with proper Vietnamese character support, not covered or touching edges.
• Can use gradients, glow, inline SVG, icons, shapes, project asset images if suitable.
• Result must look like a real YouTube/TikTok thumbnail: clear focal point, minimal clutter, not spread thin.

AVAILABLE PROJECT ASSETS:
{{PROJECT_ASSETS}}

STYLE GUIDE:
{{STYLE_GUIDE}}

RETURN 1 COMPLETE HTML FILE USING THIS FRAME:
<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600;700&family=Bebas+Neue&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
html,body{width:{{W}}px;height:{{H}}px;margin:0;padding:0;overflow:hidden;background:#05050a}
body{font-family:'Be Vietnam Pro',sans-serif;color:#fff}
.txt{display:block;line-height:1.5;overflow:visible;padding-top:0.15em;padding-bottom:0.05em}
#stage{position:relative;width:{{W}}px;height:{{H}}px;overflow:hidden;background:#05050a}
#content{position:absolute;inset:10px;overflow:hidden}
</style></head><body>
<div id="stage">
  <div id="content">
    <!-- STATIC THUMBNAIL LAYOUT HERE -->
  </div>
</div>
</body></html>

RETURN ONLY <!DOCTYPE html>...</html>. NO markdown fence, NO explanation.`;

const fmtMs = ms => ms < 60000 ? `${(ms/1000).toFixed(1)}s` : `${Math.floor(ms/60000)}m${Math.round((ms%60000)/1000)}s`;

const EDIT_HTML_PROMPT = `You are an expert HTML animation editor. Edit the following HTML per the user's request.

EDIT REQUEST:
{{EDIT_PROMPT}}

CURRENT HTML:
{{CURRENT_HTML}}

MANDATORY RULES:
• Only change what is requested, preserve everything else.
• Preserve HTML structure: #stage, #content, vignette, scan, noise.
• Preserve timing, animations, and CDN imports (only add if a new library is needed).
• File must be complete, ending exactly with </script></body></html>.
• Google Fonts: <link href="..." rel="stylesheet"> — NEVER omit href/rel.
• RETURN ONLY <!DOCTYPE html>...</html>. No markdown fence, no explanation.`;

const EDIT_THUMBNAIL_HTML_PROMPT = `You are an expert static HTML thumbnail editor for video.

EDIT REQUEST:
{{EDIT_PROMPT}}

CURRENT HTML:
{{CURRENT_HTML}}

MANDATORY RULES:
• This is a STATIC THUMBNAIL, not a video scene.
• Only change what the user requests, preserve everything else.
• DO NOT add animations, anime.js, gsap timelines, requestAnimationFrame, setTimeout, progress bars, particle loops, or any motion effects.
• Maintain static layout, clear subject, large text, strong contrast, authentic thumbnail style.
• Keep HTML structure clean, complete, ending with </body></html>.
• Google Fonts: <link href="..." rel="stylesheet"> — NEVER omit href/rel.
• RETURN ONLY <!DOCTYPE html>...</html>. No markdown fence, no explanation.`;

export async function editSceneHTML({ currentHtml, editPrompt, keys, onLog }) {
  const prompt = EDIT_HTML_PROMPT
    .replace('{{EDIT_PROMPT}}', editPrompt)
    .replace('{{CURRENT_HTML}}', currentHtml);

  const t0 = Date.now();
  const { result } = await callAI({ prompt, isJson: false, keys, onLog });
  let html = result.trim();
  if (!html.toLowerCase().includes('<!doctype')) {
    html = html.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();
  }
  const lines = html.split('\n').length;
  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  onLog?.(`✓ HTML đã sửa: ${lines} dòng (${kb} KB) | ${fmtMs(Date.now() - t0)}`);
  return html;
}

export async function editThumbnailHTML({ currentHtml, editPrompt, keys, onLog }) {
  const prompt = EDIT_THUMBNAIL_HTML_PROMPT
    .replace('{{EDIT_PROMPT}}', editPrompt)
    .replace('{{CURRENT_HTML}}', currentHtml);

  const t0 = Date.now();
  const { result } = await callAI({ prompt, isJson: false, keys, onLog });
  let html = result.trim();
  if (!html.toLowerCase().includes('<!doctype')) {
    html = html.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();
  }
  const lines = html.split('\n').length;
  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  onLog?.(`✓ Thumbnail HTML đã sửa: ${lines} dòng (${kb} KB) | ${fmtMs(Date.now() - t0)}`);
  return html;
}

export async function generateSceneHTML({ scene, keys, onLog, brandAssets = [], projectAssets = [], outputAspectRatio = '9:16', styleGuide = DEFAULT_STYLE_GUIDE }) {
  const ar = AR_CONFIGS[outputAspectRatio] || AR_CONFIGS['9:16'];
  const aspectRatioRules = getAspectRatioRules(ar);
  const contentW      = ar.w - 20;
  const contentH      = ar.h - 20;
  const lowerThirdY   = Math.round(ar.h * 0.807);
  const contentMaxY   = Math.round(ar.h * 0.792);
  const subsArr = parseSRT(scene.srt || '').map(s => ({
    from: srtToMs(s.from),
    to: srtToMs(s.to),
    text: s.text
  }));
  const duration = subsArr.length ? Math.max(...subsArr.map(s => s.to)) : 5000;

  // Format brand assets: TÊN | LOẠI | URL [| duration]
  const brandAssetsText = brandAssets.length
    ? brandAssets.map(a => {
        const dur = a.duration != null ? ` | ${a.duration}s` : '';
        return `${a.name} | ${a.type} | ${a.url}${dur}`;
      }).join('\n')
    : '(none)';

  // Format project assets: TÊN | LOẠI | FILE_URL | ASPECT_RATIO
  const projectAssetsText = projectAssets.length
    ? projectAssets.map(a => `${a.name} | ${a.type} | ${a.fileUrl} | ${a.aspectRatio}`).join('\n')
    : '(none)';

  onLog?.(`Cảnh ${scene.stt}: ${subsArr.length} beat SRT | ${fmtMs(duration)} | ${brandAssets.length} brand assets | ${projectAssets.length} project assets`);

  const prompt = SCENE_PROMPT
    .replace(/\{\{W\}\}/g, ar.w)
    .replace(/\{\{H\}\}/g, ar.h)
    .replace(/\{\{RATIO_LABEL\}\}/g, ar.label)
    .replace(/\{\{CONTENT_W\}\}/g, contentW)
    .replace(/\{\{CONTENT_H\}\}/g, contentH)
    .replace(/\{\{LOWER_THIRD_Y\}\}/g, lowerThirdY)
    .replace(/\{\{CONTENT_MAX_Y\}\}/g, contentMaxY)
    .replace(/\{\{SIDE_PADDING\}\}/g, ar.sidePadding)
    .replace(/\{\{TOP_PADDING\}\}/g, ar.topPadding)
    .replace(/\{\{BOTTOM_PADDING\}\}/g, ar.bottomPadding)
    .replace(/\{\{TEXT_MAX_W\}\}/g, ar.textMaxW)
    .replace(/\{\{HERO_MAX_W\}\}/g, ar.heroMaxW)
    .replace(/\{\{CARD_MIN_W\}\}/g, ar.cardMinW)
    .replace(/\{\{CARD_MAX_W\}\}/g, ar.cardMaxW)
    .replace(/\{\{SUBJECT_MAX_H\}\}/g, ar.subjectMaxH)
    .replace(/\{\{TEXT_BLOCK_MAX_H\}\}/g, ar.textBlockMaxH)
    .replace(/\{\{SAFE_CENTER_W\}\}/g, ar.safeCenterW)
    .replace(/\{\{SAFE_CENTER_H\}\}/g, ar.safeCenterH)
    .replace(/\{\{SPLIT_GAP\}\}/g, ar.splitGap)
    .replace('{{ASPECT_RATIO_RULES}}', aspectRatioRules)
    .replace('{{VOICE}}', scene.voice.replace(/"/g, "'"))
    .replace('{{VISUAL}}', scene.visual.replace(/"/g, "'"))
    .replace(/\{\{DURATION\}\}/g, duration)
    .replace('{{SUBS}}', JSON.stringify(subsArr, null, 2))
    .replace('{{BRAND_ASSETS}}', brandAssetsText)
    .replace('{{PROJECT_ASSETS}}', projectAssetsText)
    .replace('{{STYLE_GUIDE}}', styleGuide);

  const t0 = Date.now();
  const { result } = await callAI({ prompt, isJson: false, keys, onLog });
  let html = result.trim();
  if (!html.toLowerCase().includes('<!doctype')) {
    html = html.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();
  }
  const lines = html.split('\n').length;
  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  onLog?.(`✓ Cảnh ${scene.stt}: HTML ${lines} dòng (${kb} KB) | ${fmtMs(Date.now() - t0)}`);
  return html;
}

export async function generateThumbnailHTML({ title, prompt: thumbnailPrompt, keys, onLog, projectAssets = [], outputAspectRatio = '9:16', styleGuide = DEFAULT_STYLE_GUIDE }) {
  const ar = AR_CONFIGS[outputAspectRatio] || AR_CONFIGS['9:16'];
  const aspectRatioRules = getAspectRatioRules(ar);
  const projectAssetsText = projectAssets.length
    ? projectAssets.map(a => `${a.name} | ${a.type} | ${a.fileUrl} | ${a.aspectRatio}`).join('\n')
    : '(none)';

  const prompt = THUMBNAIL_PROMPT
    .replace(/\{\{W\}\}/g, ar.w)
    .replace(/\{\{H\}\}/g, ar.h)
    .replace(/\{\{RATIO_LABEL\}\}/g, ar.label)
    .replace('{{ASPECT_RATIO_RULES}}', aspectRatioRules)
    .replace('{{TITLE}}', String(title || '').replace(/"/g, "'"))
    .replace('{{PROMPT}}', String(thumbnailPrompt || '').replace(/"/g, "'"))
    .replace('{{PROJECT_ASSETS}}', projectAssetsText)
    .replace('{{STYLE_GUIDE}}', styleGuide);

  const t0 = Date.now();
  const { result } = await callAI({ prompt, isJson: false, keys, onLog });
  let html = result.trim();
  if (!html.toLowerCase().includes('<!doctype')) {
    html = html.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();
  }
  const lines = html.split('\n').length;
  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  onLog?.(`✓ Thumbnail: HTML ${lines} dòng (${kb} KB) | ${fmtMs(Date.now() - t0)}`);
  return html;
}
