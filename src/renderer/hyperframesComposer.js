const AR_CONFIGS = {
  '9:16': { w: 1080, h: 1920, label: 'portrait', safeX: 72, safeTop: 120, safeBottom: 250 },
};

const FALLBACK_COLORS = ['#0a1628', '#1e2a47', '#22d3ee', '#a855f7', '#f8fafc', '#ef4444'];

export function estimateSceneDurationSec(srt, fallbackSec = 6) {
  const matches = String(srt || '').matchAll(/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/g);
  let max = 0;
  for (const match of matches) max = Math.max(max, srtToSec(match[1]));
  return max > 0 ? Math.max(1, max + 0.2) : fallbackSec;
}

export function composeSceneHTML({
  scene,
  sceneCount = 0,
  styleGuide = '',
  durationSec = null,
}) {
  const ar = AR_CONFIGS['9:16'];
  const duration = clampNumber(durationSec ?? estimateSceneDurationSec(scene?.srt), 1, 120);
  const palette = extractPalette(styleGuide);
  const template = inferTemplate(scene, sceneCount);
  const data = buildTemplateData(template, scene, sceneCount);
  const revealPlan = buildRevealPlan(template, data, scene, duration);
  const compositionId = `scene-${safeId(scene?.stt ?? 'x')}`;
  const scale = Math.min(ar.w / 1080, ar.h / 1920);
  const fontScale = Math.max(0.62, Math.min(1.15, scale || 1));
  const layoutHtml = renderTemplate(template, data, '', ar, revealPlan);
  const title = `Canh ${scene?.stt ?? ''}`;

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="video-pipeline-html" content="hyperframes-timed-v2">
  <meta name="viewport" content="width=${ar.w}, height=${ar.h}">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800;900&family=Anton&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
${baseCss(ar, palette, fontScale)}
  </style>
</head>
<body>
  <div id="stage"
       data-vp-html-version="hyperframes-timed-v2"
       data-hf-duration-owner="root"
       data-composition-id="${compositionId}"
       data-width="${ar.w}"
       data-height="${ar.h}"
       data-start="0"
       data-duration="${duration.toFixed(3)}">
    <div class="shell-bg"></div>
    <div class="grid-bg"></div>
    <div class="orb orb-a"></div>
    <div class="orb orb-b"></div>
    <div id="scene-root" class="scene-shell clip"
         data-hf-duration-owner="scene"
         data-start="0"
         data-duration="${duration.toFixed(3)}"
         data-track-index="0"
         data-layout="${template}">
      ${layoutHtml}
    </div>
    <div class="brand-corner">
      <div class="brand-mark">&gt;_</div>
      <div>
        <div class="brand-name">Video Pipeline</div>
        <div class="brand-tag">${escapeHtml(ar.label)}</div>
      </div>
    </div>
    <div class="grain" data-layout-allow-overflow="true"></div>
    <div class="vignette"></div>
  </div>
  <script>
${timelineJs(compositionId, template, duration, revealPlan)}
  </script>
</body>
</html>`;
}

function renderTemplate(template, data, assetHtml, ar, revealPlan = {}) {
  const withReveal = html => applyRevealStyles(html, revealPlan);
  switch (template) {
    case 'hook':
      return withReveal(`<div class="layout layout-hook">
        <div class="eyebrow hf-anim" data-anim-key="eyebrow">Mở đầu</div>
        <div class="hook-title txt shimmer hf-anim" data-anim-key="hook-title">${escapeHtml(data.headline)}<span class="shimmer-mask"></span></div>
        ${data.subhead ? `<div class="hook-sub txt hf-anim" data-anim-key="hook-sub">${escapeHtml(data.subhead)}</div>` : ''}
        ${assetHtml}
      </div>`);
    case 'comparison':
      return withReveal(`<div class="layout layout-comparison">
        <div class="cmp-card cmp-left hf-anim" data-anim-key="cmp-left">
          <div class="cmp-label txt">${escapeHtml(data.left.label)}</div>
          <div class="cmp-value txt">${escapeHtml(data.left.value)}</div>
        </div>
        <div class="cmp-vs hf-anim" data-anim-key="cmp-vs">VS</div>
        <div class="cmp-card cmp-right hf-anim" data-anim-key="cmp-right">
          <div class="cmp-label txt">${escapeHtml(data.right.label)}</div>
          <div class="cmp-value txt">${escapeHtml(data.right.value)}</div>
        </div>
        ${assetHtml}
      </div>`);
    case 'stat-hero':
      return withReveal(`<div class="layout layout-stat">
        <div class="stat-value txt shimmer hf-anim" data-anim-key="stat-value">${escapeHtml(data.value)}<span class="shimmer-mask"></span></div>
        <div class="stat-label txt hf-anim" data-anim-key="stat-label">${escapeHtml(data.label)}</div>
        ${data.context ? `<div class="stat-context txt hf-anim" data-anim-key="stat-context">${escapeHtml(data.context)}</div>` : ''}
        ${assetHtml}
      </div>`);
    case 'feature-list':
      return withReveal(`<div class="layout layout-list">
        <div class="feature-card hf-anim" data-anim-key="feature-card">
          <div class="feature-title txt">${escapeHtml(data.title)}</div>
          <div class="feature-rule hf-line" data-anim-key="feature-rule"></div>
          <div class="feature-items">
            ${data.bullets.map((b, i) => `<div class="feature-item hf-anim" data-anim-key="feature-item-${i}" data-item="${i}">
              <span class="feature-dot"></span><span class="txt">${escapeHtml(b)}</span>
            </div>`).join('\n')}
          </div>
        </div>
        ${assetHtml}
      </div>`);
    case 'outro':
      return withReveal(`<div class="layout layout-outro">
        <div class="out-cta hf-anim" data-anim-key="out-cta">${escapeHtml(data.ctaTop)}</div>
        <div class="out-channel txt shimmer hf-anim" data-anim-key="out-channel">${escapeHtml(data.channelName)}<span class="shimmer-mask"></span></div>
        <div class="out-source txt hf-anim" data-anim-key="out-source">${escapeHtml(data.source)}</div>
        <div class="follow-card hf-anim" data-anim-key="follow-card">
          <div class="follow-avatar">VP</div>
          <div>
            <div class="follow-name">Video Pipeline</div>
            <div class="follow-handle">@video.pipeline</div>
          </div>
          <div class="follow-button">Follow</div>
        </div>
      </div>`);
    case 'callout':
    default:
      return withReveal(`<div class="layout layout-callout">
        <div class="callout-card hf-anim" data-anim-key="callout-card">
          <div class="callout-tag">${escapeHtml(data.tag)}</div>
          <div class="callout-statement txt">${escapeHtml(data.statement)}</div>
        </div>
        ${assetHtml}
      </div>`);
  }
}

function applyRevealStyles(html, revealPlan = {}) {
  return String(html).replace(/data-anim-key="([^"]+)"/g, (full, key) => {
    const delay = clampRevealTime(revealPlan?.[key], 120);
    const shimmerDelay = delay + 0.56;
    const effect = effectForKey(key);
    const style = [
      `--hf-delay:${delay.toFixed(3)}s`,
      `--hf-shimmer-delay:${shimmerDelay.toFixed(3)}s`,
      `--hf-effect:hf-${effect}`,
    ].join(';');
    return `${full} data-hf-effect="${escapeAttr(effect)}" style="${escapeAttr(style)}"`;
  });
}

function effectForKey(key) {
  if (/cmp-left|feature-item/.test(key)) return 'left';
  if (/cmp-right/.test(key)) return 'right';
  if (/hook-title|stat-value|out-channel|cmp-vs/.test(key)) return 'pop';
  if (/eyebrow|out-cta/.test(key)) return 'down';
  if (/feature-rule/.test(key)) return 'rule';
  return 'rise';
}

function baseCss(ar, palette, fontScale) {
  const hero = Math.round(Math.min(ar.w * 0.14, ar.h * 0.095) * fontScale);
  const title = Math.round(Math.min(ar.w * 0.07, ar.h * 0.052) * fontScale);
  const body = Math.round(Math.min(ar.w * 0.049, ar.h * 0.04) * fontScale);
  const cardRadius = Math.round(Math.max(18, Math.min(ar.w, ar.h) * 0.022));
  const shellPad = Math.round(Math.max(24, ar.safeX * 0.72));
  const lowerLimit = Math.max(0, ar.h - ar.safeBottom);
  return `*{box-sizing:border-box}
html,body{margin:0;padding:0;width:${ar.w}px;height:${ar.h}px;overflow:hidden;background:${palette.bg};font-family:'Be Vietnam Pro','Inter',sans-serif;color:#fff}
#stage{position:relative;width:${ar.w}px;height:${ar.h}px;overflow:hidden;background:${palette.bg};--accent:${palette.accent};--accent2:${palette.accent2};--soft:${palette.soft};--danger:${palette.danger};--hero:${hero}px;--title:${title}px;--body:${body}px;--card-radius:${cardRadius}px}
.shell-bg{position:absolute;inset:0;background:radial-gradient(circle at 20% 12%,${withAlpha(palette.accent, 0.26)},transparent 28%),radial-gradient(circle at 86% 72%,${withAlpha(palette.accent2, 0.24)},transparent 28%),linear-gradient(145deg,${palette.bg},${palette.bg2});z-index:0}
.grid-bg{position:absolute;inset:0;background-image:linear-gradient(${withAlpha(palette.soft, 0.06)} 1px,transparent 1px),linear-gradient(90deg,${withAlpha(palette.soft, 0.06)} 1px,transparent 1px);background-size:${Math.round(ar.w / 12)}px ${Math.round(ar.w / 12)}px;opacity:.75;z-index:1}
.orb{position:absolute;border-radius:999px;filter:blur(18px);opacity:.42;z-index:2}
.orb-a{width:${Math.round(ar.w * .32)}px;height:${Math.round(ar.w * .32)}px;left:${Math.round(ar.w * -.08)}px;top:${Math.round(ar.h * .16)}px;background:${withAlpha(palette.accent, .34)}}
.orb-b{width:${Math.round(ar.w * .38)}px;height:${Math.round(ar.w * .38)}px;right:${Math.round(ar.w * -.12)}px;bottom:${Math.round(ar.h * .12)}px;background:${withAlpha(palette.accent2, .28)}}
.scene-shell{position:absolute;inset:0;z-index:5;overflow:hidden}
.layout{position:absolute;left:${ar.safeX}px;right:${ar.safeX}px;top:${ar.safeTop}px;bottom:${ar.safeBottom}px;min-height:0;z-index:8}
.txt{display:block;line-height:1.18;overflow:visible;padding-top:.08em;padding-bottom:.08em;word-break:normal;overflow-wrap:break-word}
@keyframes hf-rise{from{opacity:0;transform:translateY(54px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes hf-down{from{opacity:0;transform:translateY(-28px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes hf-left{from{opacity:0;transform:translateX(-52px)}to{opacity:1;transform:translateX(0)}}
@keyframes hf-right{from{opacity:0;transform:translateX(52px)}to{opacity:1;transform:translateX(0)}}
@keyframes hf-pop{from{opacity:0;transform:scale(.58)}to{opacity:1;transform:scale(1)}}
@keyframes hf-rule{from{opacity:0;transform:scaleX(0)}to{opacity:1;transform:scaleX(1)}}
@keyframes hf-shimmer{from{left:-30%}to{left:108%}}
.hf-anim{opacity:0;will-change:transform,opacity;animation-name:var(--hf-effect,hf-rise);animation-duration:var(--hf-dur,.55s);animation-timing-function:cubic-bezier(.19,1,.22,1);animation-delay:var(--hf-delay,0s);animation-fill-mode:both}
.hf-line{opacity:0;transform-origin:left center;will-change:transform,opacity;animation:hf-rule .45s cubic-bezier(.19,1,.22,1) var(--hf-delay,0s) both}
.eyebrow{display:inline-flex;width:max-content;align-items:center;gap:12px;padding:12px 22px;border:1px solid ${withAlpha(palette.accent, .44)};border-radius:999px;color:var(--accent);background:${withAlpha(palette.accent, .12)};font-size:${Math.round(body * .56)}px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
.layout-hook,.layout-stat,.layout-callout,.layout-outro{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:${Math.round(ar.h * .026)}px}
.hook-title{font-family:'Anton','Be Vietnam Pro',sans-serif;font-size:var(--hero);line-height:1.02;text-transform:uppercase;text-shadow:0 10px 50px rgba(0,0,0,.5);max-width:${Math.round(ar.w - ar.safeX * 2)}px}
.hook-sub{font-size:${Math.round(title * .82)}px;font-weight:800;color:rgba(255,255,255,.84);max-width:${Math.round(ar.w - ar.safeX * 2.4)}px}
.shimmer{position:relative;display:block;overflow:hidden;background:linear-gradient(90deg,#fff,var(--accent),var(--accent2),#fff);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent}
.shimmer-mask{position:absolute;top:0;left:-30%;width:22%;height:100%;pointer-events:none;background:linear-gradient(105deg,transparent 0%,rgba(255,255,255,.05) 28%,rgba(255,255,255,.52) 50%,rgba(255,255,255,.05) 72%,transparent 100%);mix-blend-mode:screen;opacity:.72;filter:blur(3px);animation:hf-shimmer .95s ease-out var(--hf-shimmer-delay,.6s) both}
.layout-stat{gap:${Math.round(ar.h * .018)}px}
.stat-value{font-family:'Anton','Be Vietnam Pro',sans-serif;font-size:${Math.round(hero * 1.22)}px;line-height:.98;text-shadow:0 0 70px ${withAlpha(palette.accent, .46)}}
.stat-label{font-size:${Math.round(title * .9)}px;font-weight:900;max-width:${Math.round(ar.w - ar.safeX * 2)}px}
.stat-context{font-size:${Math.round(body * .78)}px;color:rgba(255,255,255,.72);font-weight:700;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:14px 28px;background:rgba(15,23,42,.42)}
.layout-comparison{display:grid;grid-template-rows:1fr auto 1fr;align-items:center;gap:${Math.round(ar.h * .026)}px}
.cmp-card{width:100%;min-height:${Math.round((lowerLimit - ar.safeTop) * .23)}px;padding:${Math.round(ar.w * .045)}px;border-radius:var(--card-radius);background:rgba(15,23,42,.68);border:2px solid rgba(255,255,255,.16);box-shadow:0 20px 80px rgba(0,0,0,.26);display:flex;flex-direction:column;justify-content:center}
.cmp-left{border-color:${withAlpha(palette.accent, .62)}}
.cmp-right{border-color:${withAlpha(palette.accent2, .62)}}
.cmp-label{font-size:${Math.round(body * .72)}px;color:rgba(255,255,255,.68);font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px}
.cmp-value{font-size:${Math.round(title * 1.2)}px;font-weight:900;color:#fff}
.cmp-vs{justify-self:center;font-family:'Anton',sans-serif;font-size:${Math.round(hero * .55)}px;color:rgba(255,255,255,.34);line-height:1}
.layout-list{display:flex;align-items:center;justify-content:center}
.feature-card{width:100%;max-width:${Math.round(Math.min(ar.w - ar.safeX * 2, ar.w * .84))}px;padding:${Math.round(ar.w * .055)}px;border-radius:var(--card-radius);background:rgba(15,23,42,.72);border:2px solid ${withAlpha(palette.accent2, .42)};box-shadow:0 22px 90px rgba(0,0,0,.32)}
.feature-title{font-size:${Math.round(title * .86)}px;font-weight:900;color:var(--accent);line-height:1.18}
.feature-rule{height:3px;width:100%;margin:${Math.round(ar.h * .026)}px 0;background:linear-gradient(90deg,var(--accent),transparent);transform-origin:left center}
.feature-items{display:flex;flex-direction:column;gap:${Math.round(ar.h * .021)}px}
.feature-item{display:grid;grid-template-columns:auto 1fr;align-items:start;gap:24px;font-size:${Math.round(body * .9)}px;font-weight:800;color:rgba(255,255,255,.9);line-height:1.25}
.feature-dot{width:${Math.round(body * .34)}px;height:${Math.round(body * .34)}px;margin-top:${Math.round(body * .19)}px;border-radius:999px;background:var(--accent2);box-shadow:0 0 22px ${withAlpha(palette.accent2, .6)}}
.callout-card{width:100%;max-width:${Math.round(ar.w - ar.safeX * 2)}px;padding:${Math.round(ar.w * .07)}px;border-radius:var(--card-radius);background:linear-gradient(145deg,rgba(15,23,42,.78),rgba(15,23,42,.52));border:2px solid ${withAlpha(palette.accent, .48)};box-shadow:0 28px 100px rgba(0,0,0,.34)}
.callout-tag{display:inline-flex;margin-bottom:${Math.round(ar.h * .024)}px;padding:12px 26px;border-radius:999px;background:${withAlpha(palette.accent, .16)};color:var(--accent);font-size:${Math.round(body * .62)}px;font-weight:900;text-transform:uppercase;letter-spacing:.1em}
.callout-statement{font-size:${Math.round(title * .92)}px;font-weight:900;line-height:1.24}
.layout-outro{background:linear-gradient(180deg,${withAlpha(palette.accent2, .16)},transparent);border-radius:${cardRadius}px}
.out-cta{font-size:${Math.round(body * .78)}px;font-weight:900;padding:14px 30px;border-radius:999px;border:2px solid rgba(255,255,255,.3)}
.out-channel{font-family:'Anton','Be Vietnam Pro',sans-serif;font-size:${Math.round(hero * .82)}px;line-height:1.02;text-transform:uppercase}
.out-source{font-size:${Math.round(body * .72)}px;font-weight:700;color:rgba(255,255,255,.68)}
.follow-card{display:flex;align-items:center;gap:20px;margin-top:${Math.round(ar.h * .035)}px;padding:18px 24px;border-radius:999px;background:#151515;border:1px solid rgba(255,255,255,.12);box-shadow:0 16px 70px rgba(0,0,0,.35)}
.follow-avatar{width:${Math.round(body * 1.45)}px;height:${Math.round(body * 1.45)}px;border-radius:999px;display:grid;place-items:center;background:linear-gradient(135deg,var(--accent),var(--accent2));font-weight:900;color:#06101d}
.follow-name{font-size:${Math.round(body * .62)}px;font-weight:900;text-align:left}
.follow-handle{font-size:${Math.round(body * .48)}px;color:rgba(255,255,255,.58);text-align:left}
.follow-button{font-size:${Math.round(body * .54)}px;font-weight:900;background:#fe2c55;color:#fff;border-radius:999px;padding:14px 24px}
.asset-dock{position:absolute;left:0;right:0;margin:0 auto;bottom:${Math.round(ar.safeBottom * .34)}px;display:grid;place-items:center;width:min(${Math.round(ar.w * .7)}px,74vw);height:${Math.round(Math.max(ar.h * .18, 180))}px;z-index:16;pointer-events:none}
.asset-grid{grid-template-columns:repeat(2,1fr);gap:16px;height:${Math.round(Math.max(ar.h * .25, 250))}px}
.asset-media{max-width:100%;width:100%;height:100%;object-fit:cover;border-radius:${Math.round(cardRadius * .7)}px;border:1px solid rgba(255,255,255,.18);box-shadow:0 18px 60px rgba(0,0,0,.32);background:rgba(0,0,0,.22)}
.brand-corner{position:absolute;left:${shellPad}px;top:${Math.round(shellPad * .82)}px;display:flex;align-items:center;gap:16px;z-index:30;opacity:.9}
.brand-mark{width:${Math.round(body * 1.12)}px;height:${Math.round(body * 1.12)}px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#06101d;font-family:monospace;font-size:${Math.round(body * .46)}px;font-weight:900}
.brand-name{font-size:${Math.round(body * .46)}px;font-weight:900;line-height:1}
.brand-tag{font-size:${Math.round(body * .34)}px;color:rgba(255,255,255,.58);font-weight:800;text-transform:uppercase;letter-spacing:.12em;margin-top:5px}
.grain{position:absolute;inset:-50%;z-index:45;pointer-events:none;opacity:.08;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.8'/%3E%3C/svg%3E")}
.vignette{position:absolute;inset:0;z-index:44;pointer-events:none;background:radial-gradient(circle at center,transparent 52%,rgba(0,0,0,.58))}
video.asset-media{object-fit:cover}`;
}

function timelineJs(compositionId, template, duration, revealPlan = {}) {
  const safeDuration = Number(duration).toFixed(3);
  const animationLines = buildTimelineLines(template, revealPlan, duration).join('\n');
  return `window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
window.__timelines[${JSON.stringify(compositionId)}] = tl;
tl.set("#scene-root", { opacity: 1 }, 0);
tl.set("#scene-root", { opacity: 1 }, ${safeDuration});
tl.fromTo(".orb-a", { x: "-24", y: 12, opacity: 0.22 }, { x: 26, y: "-18", opacity: 0.46, duration: ${safeDuration}, ease: "sine.inOut" }, 0);
tl.fromTo(".orb-b", { x: 24, y: "-8", opacity: 0.20 }, { x: "-22", y: 18, opacity: 0.40, duration: ${safeDuration}, ease: "sine.inOut" }, 0);
tl.fromTo(".grid-bg", { y: 0, opacity: 0.55 }, { y: "-32", opacity: 0.80, duration: ${safeDuration}, ease: "none" }, 0);
${animationLines}
(function installHyperFramesSeekBridge() {
  function seekTimelines(t) {
    const time = Math.max(0, Number(t) || 0);
    const timelines = window.__timelines || {};
    Object.values(timelines).forEach(function (timeline) {
      if (!timeline || typeof timeline.seek !== "function") return;
      if (typeof timeline.pause === "function") timeline.pause();
      timeline.seek(time, false);
    });
    document.querySelectorAll("video[data-start]").forEach(function (video) {
      const start = Number(video.getAttribute("data-start")) || 0;
      const dur = Number(video.getAttribute("data-duration")) || Number.POSITIVE_INFINITY;
      const local = time - start;
      if (local >= 0 && local <= dur && Number.isFinite(video.duration || 0)) {
        try { video.currentTime = Math.min(Math.max(0, local), video.duration || local); } catch {}
      }
    });
  }
  function install() {
    const hf = window.__hf || {};
    try {
      Object.defineProperty(hf, "duration", {
        configurable: true,
        enumerable: true,
        get: function () { return ${safeDuration}; }
      });
    } catch {
      hf.duration = ${safeDuration};
    }
    try {
      Object.defineProperty(hf, "seek", {
        configurable: false,
        enumerable: true,
        writable: false,
        value: seekTimelines
      });
    } catch {
      try { hf.seek = seekTimelines; } catch {}
    }
    window.__hf = hf;
  }
  install();
  let installs = 0;
  const keep = setInterval(function () {
    install();
    installs += 1;
    if (installs > 80) clearInterval(keep);
  }, 25);
})();
setTimeout(function () {
  if (!window.__hyperframeRuntimeBootstrapped) {
    try { tl.play(0); } catch {}
  }
}, 160);`;
}

function buildTimelineLines(template, revealPlan, duration) {
  const lines = [];
  const at = key => clampRevealTime(revealPlan?.[key], duration);
  const f = value => Number(value).toFixed(3);
  const selector = key => `[data-anim-key=${key}]`;
  const push = (method, sel, props, pos) => lines.push(`tl.${method}(${JSON.stringify(sel)}, ${jsGsapObject(props)}, ${f(pos)});`);
  const fromToSelector = (sel, fromProps, toProps, pos) => {
    lines.push(`tl.fromTo(${JSON.stringify(sel)}, ${jsGsapObject(fromProps)}, ${jsGsapObject(toProps)}, ${f(pos)});`);
  };
  const fromTo = (key, fromProps, toProps, pos) => {
    lines.push(`tl.fromTo(${JSON.stringify(selector(key))}, ${jsGsapObject(fromProps)}, ${jsGsapObject(toProps)}, ${f(pos)});`);
  };
  const to = (keyOrSelector, props, pos) => {
    const sel = keyOrSelector.startsWith?.('[') || keyOrSelector.startsWith?.('.') || keyOrSelector.startsWith?.('#')
      ? keyOrSelector
      : selector(keyOrSelector);
    push('to', sel, props, pos);
  };
  const shimmer = (key, pos) => fromToSelector(`${selector(key)} .shimmer-mask`, { x: "-140%" }, { x: "140%", duration: 0.95, ease: "none" }, pos);
  const assetAt = at('asset-dock');
  const addAsset = () => fromTo('asset-dock', { y: 70, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.55, ease: "power3.out" }, assetAt);
  const sustain = (key, start, amount = 1.025) => {
    const len = Math.max(0.7, duration - start - 0.25);
    to(key, { scale: amount, duration: len, ease: "none" }, start);
  };

  if (template === 'comparison') {
    fromTo('cmp-left', { x: "-90", opacity: 0 }, { x: 0, opacity: 1, duration: 0.55, ease: "power3.out" }, at('cmp-left'));
    fromTo('cmp-vs', { scale: 0.35, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "power3.out" }, at('cmp-vs'));
    fromTo('cmp-right', { x: 90, opacity: 0 }, { x: 0, opacity: 1, duration: 0.55, ease: "power3.out" }, at('cmp-right'));
    sustain('cmp-left', at('cmp-left') + 0.75, 1.018);
    sustain('cmp-right', at('cmp-right') + 0.75, 1.018);
    addAsset();
    return lines;
  }

  if (template === 'feature-list') {
    fromTo('feature-card', { y: 60, scale: 0.96, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.55, ease: "power3.out" }, at('feature-card'));
    fromToSelector('.feature-rule', { scaleX: 0, opacity: 1 }, { scaleX: 1, opacity: 1, duration: 0.45, ease: "power2.out" }, at('feature-rule'));
    for (let i = 0; i < 3; i++) {
      const key = `feature-item-${i}`;
      fromTo(key, { x: "-42", opacity: 0 }, { x: 0, opacity: 1, duration: 0.42, ease: "power3.out" }, at(key));
    }
    addAsset();
    return lines;
  }

  if (template === 'hook') {
    fromTo('eyebrow', { y: "-26", opacity: 0 }, { y: 0, opacity: 1, duration: 0.38, ease: "power3.out" }, at('eyebrow'));
    fromTo('hook-title', { scale: 0.58, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.62, ease: "power3.out" }, at('hook-title'));
    shimmer('hook-title', at('hook-title') + 0.56);
    fromTo('hook-sub', { y: 56, opacity: 0 }, { y: 0, opacity: 1, duration: 0.48, ease: "power3.out" }, at('hook-sub'));
    sustain('hook-title', at('hook-title') + 0.8, 1.028);
    addAsset();
    return lines;
  }

  if (template === 'stat-hero') {
    fromTo('stat-value', { scale: 0.42, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.62, ease: "power3.out" }, at('stat-value'));
    shimmer('stat-value', at('stat-value') + 0.56);
    fromTo('stat-label', { y: 44, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, at('stat-label'));
    fromTo('stat-context', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.38, ease: "power3.out" }, at('stat-context'));
    sustain('stat-value', at('stat-value') + 0.8, 1.04);
    addAsset();
    return lines;
  }

  if (template === 'outro') {
    fromTo('out-cta', { y: "-28", opacity: 0 }, { y: 0, opacity: 1, duration: 0.42, ease: "power3.out" }, at('out-cta'));
    fromTo('out-channel', { scale: 0.62, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55, ease: "power3.out" }, at('out-channel'));
    shimmer('out-channel', at('out-channel') + 0.52);
    fromTo('out-source', { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.38, ease: "power3.out" }, at('out-source'));
    fromTo('follow-card', { y: 120, opacity: 0, scale: 0.92 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }, at('follow-card'));
    to('.follow-button', { scale: 0.92, duration: 0.12, ease: "power2.out" }, at('follow-card') + 0.82);
    to('.follow-button', { scale: 1, duration: 0.24, ease: "power3.out" }, at('follow-card') + 0.96);
    sustain('follow-card', at('follow-card') + 1.2, 1.04);
    return lines;
  }

  fromTo('callout-card', { y: 52, scale: 0.92, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.55, ease: "power3.out" }, at('callout-card'));
  sustain('callout-card', at('callout-card') + 0.8, 1.024);
  addAsset();
  return lines;
}

function jsGsapObject(obj) {
  return `{ ${Object.entries(obj)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? JSON.stringify(value) : Number(value)}`)
    .join(', ')} }`;
}

function buildRevealPlan(template, data, scene, duration) {
  const entries = parseSRTEntries(scene?.srt);
  const exactWords = normalizeWordTimingList(scene?.wordTimings);
  const words = exactWords.length ? exactWords : buildApproxWordTimings(entries);
  const entryAt = (index, fallback) => Number.isFinite(entries[index]?.start) ? entries[index].start : fallback;
  const after = (value, offset) => clampRevealTime(Number(value) + offset, duration);
  const phraseAt = (phrase, fallback) => clampRevealTime(findPhraseStart(phrase, words, fallback), duration);

  if (template === 'hook') {
    const title = phraseAt(data.headline, entryAt(0, 0.16));
    const sub = data.subhead ? phraseAt(data.subhead, entryAt(1, title + 0.78)) : title + 0.78;
    return {
      eyebrow: Math.max(0.05, title - 0.18),
      'hook-title': title,
      'hook-sub': sub,
      'asset-dock': after(sub, 0.45),
    };
  }

  if (template === 'comparison') {
    const left = phraseAt(data.left?.value || data.left?.label, entryAt(0, 0.16));
    const right = phraseAt(data.right?.value || data.right?.label, entryAt(1, left + 0.72));
    return {
      'cmp-left': left,
      'cmp-vs': Math.max(0.12, Math.min(right - 0.18, left + 0.36)),
      'cmp-right': right,
      'asset-dock': after(right, 0.55),
    };
  }

  if (template === 'stat-hero') {
    const value = phraseAt(data.value, entryAt(0, 0.14));
    const label = phraseAt(data.label, after(value, 0.42));
    const context = data.context ? phraseAt(data.context, entryAt(1, after(label, 0.48))) : after(label, 0.48);
    return {
      'stat-value': value,
      'stat-label': label,
      'stat-context': context,
      'asset-dock': after(context, 0.42),
    };
  }

  if (template === 'feature-list') {
    const card = phraseAt(data.title, entryAt(0, 0.12));
    const plan = {
      'feature-card': card,
      'feature-rule': after(card, 0.36),
      'asset-dock': after(card, 1.8),
    };
    (data.bullets || []).slice(0, 3).forEach((bullet, index) => {
      const fallback = entryAt(index + 1, card + 0.72 + index * 0.55);
      plan[`feature-item-${index}`] = phraseAt(bullet, fallback);
      plan['asset-dock'] = after(plan[`feature-item-${index}`], 0.38);
    });
    return plan;
  }

  if (template === 'outro') {
    const channel = phraseAt(data.channelName, entryAt(0, 0.45));
    const source = clampRevealTime(Math.min(channel + 0.82, duration - 2.15), duration);
    return {
      'out-cta': 0.12,
      'out-channel': channel,
      'out-source': source,
      'follow-card': clampRevealTime(Math.max(source + 0.55, duration - 3.25), duration),
    };
  }

  const card = phraseAt(data.statement, entryAt(0, 0.18));
  return {
    'callout-card': card,
    'asset-dock': after(card, 0.75),
  };
}

function parseSRTEntries(srt) {
  const raw = String(srt || '').replace(/\r/g, '').trim();
  if (!raw) return [];
  return raw.split(/\n\s*\n+/).map(block => {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    const timeLineIndex = lines.findIndex(line => line.includes('-->'));
    if (timeLineIndex < 0) return null;
    const [from, to] = lines[timeLineIndex].split('-->').map(part => part.trim());
    const text = lines.slice(timeLineIndex + 1).join(' ').trim();
    const start = srtToSec(from);
    const end = srtToSec(to);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return { start, end, text };
  }).filter(Boolean);
}

function normalizeWordTimingList(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.words) ? raw.words : [];
  return list.map(item => {
    const start = Number(item?.start);
    const end = Number(item?.end);
    const word = normalizeText(item?.word || item?.text || '');
    if (!word || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return { word, norm: normalizeMatchText(word), start, end };
  }).filter(Boolean);
}

function buildApproxWordTimings(entries) {
  const words = [];
  for (const entry of entries) {
    const parts = entry.text.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const totalChars = parts.reduce((sum, word) => sum + Math.max(1, word.length), 0);
    let acc = 0;
    for (const word of parts) {
      const start = entry.start + (acc / totalChars) * (entry.end - entry.start);
      acc += Math.max(1, word.length);
      const end = entry.start + (acc / totalChars) * (entry.end - entry.start);
      words.push({ word, norm: normalizeMatchText(word), start, end });
    }
  }
  return words;
}

function findPhraseStart(phrase, words, fallback) {
  const tokens = normalizeMatchText(phrase).split(/\s+/).filter(Boolean);
  const indexedWords = (words || []).filter(item => item.norm);
  if (!tokens.length || !indexedWords.length) return fallback;

  const maxLen = Math.min(6, tokens.length);
  for (let len = maxLen; len >= 2; len--) {
    for (let phraseOffset = 0; phraseOffset <= tokens.length - len; phraseOffset++) {
      const wanted = tokens.slice(phraseOffset, phraseOffset + len).join(' ');
      for (let i = 0; i <= indexedWords.length - len; i++) {
        const got = indexedWords.slice(i, i + len).map(item => item.norm).join(' ');
        if (got === wanted) return indexedWords[i].start;
      }
    }
  }

  const strong = tokens.find(token => /\d/.test(token) || token.length >= 4);
  if (strong) {
    const found = indexedWords.find(item => item.norm === strong);
    if (found) return found.start;
  }

  return fallback;
}

function normalizeMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9%$€£¥₫]+/g, ' ')
    .trim();
}

function clampRevealTime(value, duration) {
  const n = Number(value);
  const dur = Number(duration);
  const max = Math.max(0.05, (Number.isFinite(dur) ? dur : 6) - 0.35);
  if (!Number.isFinite(n)) return 0.12;
  return Math.max(0.05, Math.min(max, n));
}

export function inferTemplate(scene, sceneCount) {
  const stt = Number(scene?.stt) || 1;
  const text = normalizeText(`${scene?.voice || ''} ${scene?.visual || ''}`).toLowerCase();
  if (stt === 1) return 'hook';
  if (sceneCount && stt === Number(sceneCount)) return 'outro';
  if (/(so sánh|\bvs\b|versus|khác nhau|trước.+sau|đối lập|hơn kém|một bên|hai bên)/i.test(text)) return 'comparison';
  if (extractNumber(scene?.voice || scene?.visual)) return 'stat-hero';
  if (/(gồm|bao gồm|liệt kê|danh sách|thứ nhất|đầu tiên|tiếp theo|cuối cùng|các bước|mẹo|lý do|đặc điểm)/i.test(text)) return 'feature-list';
  if (/(cảnh báo|lưu ý|quan trọng|rủi ro|nguy cơ|không nên|đừng|phải nhớ|mấu chốt|điểm chính)/i.test(text)) return 'callout';
  return stt % 3 === 0 ? 'feature-list' : stt % 3 === 1 ? 'callout' : 'stat-hero';
}

function buildTemplateData(template, scene, sceneCount) {
  const voice = normalizeText(scene?.voice || '');
  const visual = normalizeText(scene?.visual || '');
  const phrases = extractPhrases(voice);
  const first = phrases[0] || voice || visual || 'Nội dung chính';
  if (template === 'hook') {
    return {
      headline: truncateSmart(first, 44),
      subhead: truncateSmart(phrases[1] || visualKeyword(visual) || '', 42),
    };
  }
  if (template === 'comparison') {
    const [left, right] = splitComparison(voice, visual);
    return {
      left: { label: left.label, value: truncateSmart(left.value, 24) },
      right: { label: right.label, value: truncateSmart(right.value, 24) },
    };
  }
  if (template === 'stat-hero') {
    const value = extractNumber(voice) || extractNumber(visual) || `${Number(scene?.stt) || 1}`;
    return {
      value: truncateSmart(value, 18),
      label: truncateSmart(removeFirstNumber(first, value) || first, 42),
      context: truncateSmart(phrases[1] || visualKeyword(visual), 48),
    };
  }
  if (template === 'feature-list') {
    return {
      title: truncateSmart(visualKeyword(visual) || first, 40),
      bullets: extractBullets(voice, visual),
    };
  }
  if (template === 'outro') {
    return {
      ctaTop: 'Theo dõi để xem tiếp',
      channelName: truncateSmart(phrases[0] || 'Video Pipeline', 30),
      source: sceneCount ? `Hoàn tất ${sceneCount} cảnh` : 'Hẹn gặp lại',
    };
  }
  return {
    tag: /(cảnh báo|rủi ro|nguy cơ)/i.test(voice + visual) ? 'Cảnh báo' : 'Điểm chính',
    statement: truncateSmart(first, 82),
  };
}

function extractBullets(voice, visual) {
  const raw = [
    ...extractPhrases(voice),
    ...String(visual || '').split(/(?:→|;|\n|\.\s+)/g),
  ].map(normalizeText).filter(Boolean);
  const seen = new Set();
  const bullets = [];
  for (const item of raw) {
    const short = truncateSmart(item.replace(/^(background|main elements|appearance order|text overlay)\s*:?/i, ''), 54);
    const key = short.toLowerCase();
    if (short.length < 6 || seen.has(key)) continue;
    seen.add(key);
    bullets.push(short);
    if (bullets.length >= 3) break;
  }
  while (bullets.length < 3) bullets.push(['Bối cảnh rõ ràng', 'Điểm nhấn chính', 'Kết luận dễ nhớ'][bullets.length]);
  return bullets;
}

function splitComparison(voice, visual) {
  const source = normalizeText(voice || visual);
  const parts = source.split(/\s+(?:so với|với|vs|VS|và|nhưng|còn)\s+/).map(s => truncateSmart(s, 26)).filter(Boolean);
  if (parts.length >= 2) {
    return [
      { label: 'Bên A', value: parts[0] },
      { label: 'Bên B', value: parts[1] },
    ];
  }
  return [
    { label: 'Trước', value: truncateSmart(extractPhrases(source)[0] || 'Vấn đề', 24) },
    { label: 'Sau', value: truncateSmart(extractPhrases(source)[1] || 'Giải pháp', 24) },
  ];
}

function extractPhrases(text) {
  return normalizeText(text)
    .split(/(?:[.!?…]+|\s+-\s+|,\s+|\s+nhưng\s+|\s+tuy nhiên\s+)/i)
    .map(s => s.trim())
    .filter(Boolean);
}

function visualKeyword(visual) {
  const clean = normalizeText(visual)
    .replace(/(?:background|main elements|appearance order|text overlay)\s*:?/ig, '')
    .replace(/[→|]/g, ' ');
  return truncateSmart(clean, 44);
}

function extractNumber(text) {
  const match = String(text || '').match(/(?:[$€£¥₫]\s*)?\d[\d.,]*(?:\s*(?:%|x|lần|tỷ|triệu|nghìn|k|m|b))?/i);
  return match ? match[0].replace(/\s+/g, ' ').trim() : '';
}

function removeFirstNumber(text, number) {
  return normalizeText(String(text || '').replace(number, '')).replace(/^[:\-–—,\s]+/, '');
}

function extractPalette(styleGuide) {
  const colors = [...String(styleGuide || '').matchAll(/#[0-9a-f]{6}\b/gi)]
    .map(m => m[0].toUpperCase())
    .filter((value, index, arr) => arr.indexOf(value) === index);
  const merged = [...colors, ...FALLBACK_COLORS];
  return {
    bg: merged[0],
    bg2: merged[1],
    accent: merged[2],
    accent2: merged[3],
    soft: merged[4],
    danger: merged[5],
  };
}

function srtToSec(value) {
  const [h = '0', m = '0', rest = '0,0'] = String(value || '').split(':');
  const [s = '0', ms = '0'] = rest.split(',');
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

function truncateSmart(value, max) {
  const text = normalizeText(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const at = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf(','));
  return `${(at > max * 0.55 ? cut.slice(0, at) : cut.slice(0, max)).trim()}...`;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function withAlpha(hex, alpha) {
  const clean = String(hex || '#000000').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(clean)) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
