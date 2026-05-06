// src/agents/sceneAgent.js - Bước 5: Tạo HTML cho từng cảnh
import { callAI } from '../services/aiRouter.js';
import { composeSceneHTML, estimateSceneDurationSec, inferTemplate } from '../renderer/hyperframesTemplateSystem.js';
import { buildSfxCatalogForPrompt, getSfxDurationSec, normalizeSfxPlan } from '../services/sfxCatalog.js';

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

LAYOUT SELECTION FOR 9:16:
• Prefer HERO, STACK, PHONE MOCKUP, REVEAL, ORBIT.
• Use SPLIT/DASHBOARD only when each column remains readable in a narrow vertical frame.
• Keep the lower third clear for burned-in karaoke subtitles.

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
PART 10 — TEMPLATE-DRIVEN VISUALS
════════════════════════════════════════

Use only generated HTML/CSS/SVG/canvas elements and the selected HyperFrames template structure.
Do not depend on external image/video/GIF producer assets or brand-specific media folders.

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

const FREEFORM_HTML_PROMPT = `You are an expert HyperFrames HTML motion designer.

Generate one complete HTML animation scene for Chrome headless 1080×1920 portrait video.
The output is rendered by HyperFrames, then voiceover is injected by the pipeline.

SCENE METADATA:
- Scene number: {{STT}}
- Duration: {{DURATION_SEC}}s
- Voice narration: {{VOICE_JSON}}
- Short visual direction: {{VISUAL_JSON}}

DETAILED HTML SPEC JSON:
{{HTML_SPEC_JSON}}

SRT BEATS:
{{SRT_BEATS_JSON}}

WORD TIMINGS:
{{WORD_TIMINGS_JSON}}

AVAILABLE LOCAL IMAGE ASSETS:
{{IMAGE_ASSETS_JSON}}

AVAILABLE SFX FILES:
{{SFX_CATALOG_JSON}}

SELECTED SFX PLAN:
{{SFX_PLAN_JSON}}

TIMING ALIGNMENT:
- SRT BEATS and WORD TIMINGS are measured after the real TTS voice was generated.
- Use SRT BEATS for beat wrapper enter/hold/exit timing.
- Use WORD TIMINGS for important keyword reveals, number pops, image/card reveals, and animation accents.
- SELECTED SFX PLAN may include "timingPhrase"; align the visual reveal for that cue to the matching word timing when available.
- "startSec" in SELECTED SFX PLAN is only a rough fallback. The pipeline will prefer timingPhrase matched against WORD TIMINGS for final SFX audio placement.

HYPERFRAMES HTML STANDARD:
- Return exactly one complete HTML document, starting with <!DOCTYPE html> and ending with </html>.
- Root scene element MUST be:
  <div id="stage" data-vp-html-version="hyperframes-ai-v1" data-composition-id="scene-{{STT}}" data-width="1080" data-height="1920" data-start="0" data-duration="{{DURATION_SEC}}">
- All visible content MUST live inside <div id="content">.
- Register the deterministic HyperFrames timeline inside the load handler:
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } });
  window.__timelines["scene-{{STT}}"] = tl;
- All main GSAP animations MUST be added to that registered tl timeline. Do not create unregistered timelines.
- Do not use Math.random(), crypto random, Date.now() for visual randomness, requestAnimationFrame(), setInterval(), or infinite animation loops.
- If variation is needed, use fixed arrays of coordinates/values or a tiny seeded PRNG function named seededRandom().
- Never use repeat:-1. For ambient pulses, use a finite repeat count that fits inside the scene duration.
- Use fixed pixel layout for 1080×1920. Do not use viewport-sized fonts.
- Keep main content above y=1420 because subtitles are burned in later.
- Include no voiceover audio tag. The pipeline injects voiceover.
- Do not include remote images, videos, iframes, or external producers' assets.
- If AVAILABLE LOCAL IMAGE ASSETS is not empty, visibly use at least one listed local image src in this scene.
- Use only listed local image src values. Never invent image paths or use original remote URLs.
- Image scenes should place the image as a background, evidence card, hero panel, side panel, or annotation image according to htmlSpec.assets/layout.
- You MAY use CDN scripts for gsap/anime/tsParticles/Three.js only when needed. Keep imports minimal.
- Do not include SFX audio tags. The pipeline injects selected SFX automatically from SELECTED SFX PLAN using /assets/sfx/... files from the catalog.

VISUAL QUALITY RULES:
- Make the HTML match the detailed htmlSpec. Use the JSON as the source of truth.
- All on-screen human text must be Vietnamese and concise.
- Each timeline beat should use one wrapper div: #beat-1, #beat-2, etc.
- Only one beat wrapper should be visible at a time, except ambient/background layers.
- Every absolutely positioned visible element must have explicit top, left, width, and height or an equivalent inset.
- Vietnamese text must not be clipped: line-height >= 1.25, overflow visible, enough top padding.
- Use an ambient layer (CSS, particles, SVG, or canvas) so the scene is not static.
- Set var _animReady=false; before load. Inside window.addEventListener('load', function(){...}), set _animReady=true, register window.__timelines["scene-{{STT}}"], and add animations to the paused tl.
- Include a failsafe that makes #content children visible if animation does not initialize within 2 seconds.
- End the scene with the final/climax beat visible until the end.

RETURN ONLY THE HTML DOCUMENT. No markdown fence, no explanation.`;

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

export async function generateSceneHTML({ scene, keys, onLog, styleGuide = '', sceneCount = 0, useTemplateMode = true }) {
  const t0 = Date.now();
  const subsArr = parseSRT(scene.srt || '');
  const durationSec = estimateSceneDurationSec(scene.srt || '', 6);
  const wordCount = Array.isArray(scene.wordTimings) ? scene.wordTimings.length : 0;
  const shouldUseTemplate = useTemplateMode !== false && scene?.useTemplateMode !== false && scene?.generationMode !== 'ai-html';

  if (!shouldUseTemplate) {
    const html = await generateFreeformSceneHTML({
      scene,
      keys,
      onLog,
      durationSec,
      subsArr,
      wordCount,
    });
    const lines = html.split('\n').length;
    const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
    onLog?.(`✓ Cảnh ${scene.stt}: HTML AI HyperFrames ${lines} dòng (${kb} KB) | ${fmtMs(Date.now() - t0)}`);
    return html;
  }

  const templateName = inferTemplate(scene, sceneCount);
  const dataMode = scene?.templateData ? 'templateData' : 'voice fallback';
  onLog?.(`Cảnh ${scene.stt}: compose HyperFrames template=${templateName} (${dataMode}) | ${subsArr.length} beat SRT | ${wordCount} word timings | ${durationSec.toFixed(2)}s`);

  const html = composeSceneHTML({
    scene,
    sceneCount,
    styleGuide,
    durationSec,
  });

  const lines = html.split('\n').length;
  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  onLog?.(`✓ Cảnh ${scene.stt}: HTML HyperFrames deterministic ${lines} dòng (${kb} KB) | ${fmtMs(Date.now() - t0)}`);
  return html;
}

async function generateFreeformSceneHTML({ scene, keys, onLog, durationSec, subsArr, wordCount }) {
  const sfxPlan = normalizeSfxPlan(scene?.sfxPlan || []);
  const imageAssets = collectSceneImageAssets(scene);
  const prompt = FREEFORM_HTML_PROMPT
    .replaceAll('{{STT}}', String(scene?.stt ?? 'x'))
    .replaceAll('{{DURATION_SEC}}', durationSec.toFixed(3))
    .replace('{{VOICE_JSON}}', JSON.stringify(scene?.voice || ''))
    .replace('{{VISUAL_JSON}}', JSON.stringify(scene?.visual || ''))
    .replace('{{HTML_SPEC_JSON}}', JSON.stringify(scene?.htmlSpec || buildFallbackHtmlSpec(scene), null, 2))
    .replace('{{SRT_BEATS_JSON}}', JSON.stringify(toPromptSrtBeats(subsArr), null, 2))
    .replace('{{WORD_TIMINGS_JSON}}', JSON.stringify(toPromptWordTimings(scene?.wordTimings), null, 2))
    .replace('{{IMAGE_ASSETS_JSON}}', JSON.stringify(imageAssets, null, 2))
    .replace('{{SFX_CATALOG_JSON}}', JSON.stringify(buildSfxCatalogForPrompt(), null, 2))
    .replace('{{SFX_PLAN_JSON}}', JSON.stringify(sfxPlan, null, 2));

  onLog?.(`Cảnh ${scene.stt}: AI tạo HTML từ htmlSpec | ${subsArr.length} beat SRT | ${wordCount} word timings | ${imageAssets.length} ảnh | ${sfxPlan.length} SFX cue | ${durationSec.toFixed(2)}s`);
  const { result } = await callAI({ prompt, isJson: false, keys, onLog });
  let html = normalizeGeneratedHtml(result);
  html = ensureAIHyperframesMarkers(html, scene, durationSec);
  html = ensureRequiredImageRendered(html, scene, imageAssets);
  html = injectFreeformSfx(html, { ...scene, sfxPlan }, durationSec);
  return html;
}

function buildFallbackHtmlSpec(scene = {}) {
  const voice = String(scene?.voice || '').trim();
  return {
    concept: voice || `Cảnh ${scene?.stt ?? ''}`,
    mood: 'cinematic editorial',
    palette: {
      background: '#07111f',
      surface: '#101827',
      primary: '#38bdf8',
      accent: '#facc15',
      text: '#ffffff',
    },
    layout: {
      pattern: 'HERO',
      safeZone: 'main content above y=1420',
      composition: 'centered hero text with one supporting visual motif',
    },
    background: {
      type: 'gradient',
      description: 'deep gradient with subtle animated grid',
      motion: 'slow ambient drift',
    },
    elements: [
      {
        id: 'hero',
        type: 'text',
        content: voice.slice(0, 80),
        position: { x: 110, y: 360, w: 860, h: 320 },
        style: 'large bold Vietnamese text, white with accent highlight',
        motion: 'fade and slide up, hold, gentle pulse',
      },
    ],
    timeline: [
      {
        beat: 'main reveal',
        startHint: 0,
        endHint: 3,
        visibleElements: ['hero'],
        animation: 'hero enters then holds',
        onScreenText: [voice.slice(0, 42)],
      },
    ],
    typography: {
      fontFamily: 'Be Vietnam Pro',
      rules: 'fixed px sizes, line-height >= 1.25, overflow visible',
    },
    qualityChecklist: ['all content inside #content', 'lower third stays clear'],
  };
}

function toPromptSrtBeats(subsArr = []) {
  return (Array.isArray(subsArr) ? subsArr : []).map((item, index) => ({
    index: index + 1,
    from: item.from,
    to: item.to,
    startSec: Number((srtToMs(item.from) / 1000).toFixed(3)),
    endSec: Number((srtToMs(item.to) / 1000).toFixed(3)),
    text: item.text,
  }));
}

function toPromptWordTimings(wordTimings = []) {
  return (Array.isArray(wordTimings) ? wordTimings : []).slice(0, 180).map(item => ({
    word: String(item?.word || item?.text || '').trim(),
    start: Number(Number(item?.start ?? 0).toFixed(3)),
    end: Number(Number(item?.end ?? item?.start ?? 0).toFixed(3)),
  })).filter(item => item.word);
}

function collectSceneImageAssets(scene = {}) {
  const groups = [
    Array.isArray(scene?.uploadedImageCandidates) ? scene.uploadedImageCandidates : [],
    Array.isArray(scene?.imageCandidates) ? scene.imageCandidates : [],
  ];
  const seen = new Set();
  const assets = [];
  for (const item of groups.flat()) {
    const src = String(item?.src || '').trim();
    if (!src || seen.has(src)) continue;
    if (!src.startsWith('/sessions/')) continue;
    seen.add(src);
    assets.push({
      src,
      title: String(item?.title || item?.name || item?.filename || '').trim(),
      alt: String(item?.alt || item?.title || item?.name || '').trim(),
      width: Number(item?.width) || 0,
      height: Number(item?.height) || 0,
      source: item?.source || (src.includes('/images/uploaded/') ? 'upload' : 'search'),
    });
  }
  return assets.slice(0, 10);
}

function normalizeGeneratedHtml(result) {
  const html = String(result || '')
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  if (!/^<!doctype html>/i.test(html)) {
    throw new Error('AI HTML thiếu <!DOCTYPE html>');
  }
  if (!html.toLowerCase().endsWith('</html>')) {
    throw new Error('AI HTML bị cắt dở, thiếu </html>');
  }
  if (!/<div\b(?=[^>]*\bid=["']stage["'])[^>]*>/i.test(html)) {
    throw new Error('AI HTML thiếu <div id="stage"> theo chuẩn HyperFrames');
  }
  if (!/<div\b(?=[^>]*\bid=["']content["'])[^>]*>/i.test(html)) {
    throw new Error('AI HTML thiếu <div id="content">');
  }
  return html;
}

function ensureRequiredImageRendered(html, scene, imageAssets = []) {
  if (!imageAssets.length) return html;
  const hasAnyLocalImage = imageAssets.some(item => html.includes(item.src)) ||
    /<(?:img|image)\b[^>]*(?:\/sessions\/[^"' >]+\/images\/|assets\/session-images\/)/i.test(html);
  if (hasAnyLocalImage) return html;

  const selected = imageAssets[0];
  const label = selected.title || selected.alt || 'Ảnh minh họa';
  const style = `<style>
#vp-required-image-layer{position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden}
#vp-required-image-layer img{position:absolute;left:70px;top:120px;width:940px;height:760px;object-fit:cover;border-radius:34px;opacity:.58;filter:saturate(1.08) contrast(1.05);box-shadow:0 38px 110px rgba(0,0,0,.42)}
#vp-required-image-layer::after{content:"";position:absolute;left:70px;top:120px;width:940px;height:760px;border-radius:34px;background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.44))}
#vp-required-image-caption{position:absolute;left:100px;top:830px;width:880px;color:#fff;font:700 28px/1.35 "Be Vietnam Pro",Inter,sans-serif;text-shadow:0 2px 18px rgba(0,0,0,.55);opacity:.84;overflow:visible}
</style>`;
  const layer = `<div id="vp-required-image-layer" data-required-image="true">
      <img src="${escapeAttr(selected.src)}" alt="${escapeAttr(label)}">
      <div id="vp-required-image-caption">${escapeHtml(label)}</div>
    </div>`;

  let out = html;
  out = out.replace(/<\/head>/i, `${style}\n</head>`);
  return out.replace(/(<div\b(?=[^>]*\bid=["']stage["'])[^>]*>)/i, `$1\n    ${layer}`);
}

function ensureAIHyperframesMarkers(html, scene, durationSec) {
  const compositionId = `scene-${safeId(scene?.stt ?? 'x')}`;
  let out = html;
  const stageMatch = out.match(/<div\b(?=[^>]*\bid=["']stage["'])[^>]*>/i);
  if (!stageMatch) return out;
  let tag = stageMatch[0];
  tag = upsertHtmlAttr(tag, 'data-vp-html-version', 'hyperframes-ai-v1');
  tag = upsertHtmlAttr(tag, 'data-composition-id', compositionId);
  tag = upsertHtmlAttr(tag, 'data-width', '1080');
  tag = upsertHtmlAttr(tag, 'data-height', '1920');
  tag = upsertHtmlAttr(tag, 'data-start', '0');
  tag = upsertHtmlAttr(tag, 'data-duration', durationSec.toFixed(3));
  out = out.replace(stageMatch[0], tag);
  if (!/<meta\s+name=["']video-pipeline-html["']/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, match => `${match}\n<meta name="video-pipeline-html" content="hyperframes-ai-v1">`);
  }
  return out;
}

function upsertHtmlAttr(tag, name, value) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\s${escapedName}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'i');
  const attr = ` ${name}="${escapeAttr(value)}"`;
  if (re.test(tag)) return tag.replace(re, attr);
  return tag.replace(/>$/, `${attr}>`);
}

function injectFreeformSfx(html, scene, durationSec) {
  const cues = normalizeSfxPlan(scene?.sfxPlan || []);
  if (!cues.length) return html;
  const existing = new Set(
    Array.from(html.matchAll(/<audio\b[^>]*data-sfx-key=(?:"([^"]*)"|'([^']*)')[^>]*>/gi))
      .map(match => match[1] || match[2])
  );
  const tags = cues.map((cue, index) => {
    if (existing.has(cue.id)) return '';
    const start = clamp(resolveCueStartSec(cue, scene, index, cues.length, durationSec), 0, Math.max(0, durationSec - 0.05));
    const clipDuration = clamp(getSfxDurationSec(cue.file, 0.5), 0.05, 10);
    const end = Math.min(durationSec, start + clipDuration);
    const effectiveDuration = Math.max(0.05, end - start);
    const trackIndex = 4 + index;
    return `<audio id="sfx-ai-${safeId(cue.id)}-${index}"
      data-sfx-template="ai-freeform"
      data-sfx-key="${escapeAttr(cue.id)}"
      data-start="${start.toFixed(3)}"
      data-end="${end.toFixed(3)}"
      data-duration="${effectiveDuration.toFixed(3)}"
      data-layer="${trackIndex}"
      data-track-index="${trackIndex}"
      data-volume="${clamp(cue.volume, 0, 0.85).toFixed(2)}"
      preload="auto"
      src="/assets/sfx/${escapeAttr(cue.file)}"></audio>`;
  }).filter(Boolean);
  if (!tags.length) return html;
  return html.replace(/(<div\b(?=[^>]*\bid=["']stage["'])[^>]*>)/i, `$1\n    ${tags.join('\n    ')}`);
}

function resolveCueStartSec(cue, scene, index, total, durationSec) {
  const phraseStart = findPhraseStartSec(cue?.timingPhrase, scene?.wordTimings);
  if (Number.isFinite(phraseStart)) return phraseStart;
  if (Number.isFinite(Number(cue?.startSec))) return Number(cue.startSec);
  const step = durationSec / Math.max(2, total + 1);
  return 0.15 + (index * step);
}

function findPhraseStartSec(phrase, wordTimings = []) {
  const wanted = normalizeSearchText(phrase).split(' ').filter(Boolean);
  if (!wanted.length) return NaN;
  const words = (Array.isArray(wordTimings) ? wordTimings : [])
    .map(item => ({
      word: normalizeSearchText(item?.word || item?.text || ''),
      start: Number(item?.start),
    }))
    .filter(item => item.word && Number.isFinite(item.start));
  for (let i = 0; i <= words.length - wanted.length; i += 1) {
    const chunk = words.slice(i, i + wanted.length).map(item => item.word);
    if (wanted.every((word, idx) => chunk[idx] === word)) return words[i].start;
  }
  return NaN;
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function safeId(value) {
  return String(value ?? 'x').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 60) || 'x';
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
