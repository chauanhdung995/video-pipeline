import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SCENE_TEMPLATES, normalizeTemplateName, normalizeTemplateData } from './hyperframesTemplateSchemas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TPL_DIR = path.join(__dirname, 'hyperframes', 'templates');
const SFX_DIR = path.join(PROJECT_ROOT, 'assets', 'sfx');

const AR_CONFIGS = {
  '9:16': { w: 1080, h: 1920, label: 'portrait' },
};

const SFX_VOLUME_GAIN = 1.45;

export { SCENE_TEMPLATES };

const NAMED_COLORS = {
  cyan: '#06b6d4',
  mint: '#22c55e',
  white: '#ffffff',
  indigo: '#111827',
  blue: '#2563eb',
  purple: '#a855f7',
  red: '#ef4444',
  yellow: '#facc15',
};

const TEMPLATE_SFX = {
  hook: [
    { key: 'intro', file: 'transition/whoosh-soft.mp3', at: 0.08, volume: 0.26 },
    { key: 'headline', file: 'emphasis/chime.mp3', revealKey: 'hook-title', volume: 0.32 },
  ],
  comparison: [
    { key: 'left', file: 'emphasis/tick.mp3', revealKey: 'cmp-left', volume: 0.24 },
    { key: 'right', file: 'transition/pop.mp3', revealKey: 'cmp-right', volume: 0.30 },
  ],
  'comparison-vs': [
    { key: 'left', file: 'emphasis/tick.mp3', revealKey: 'cmp-left', volume: 0.24 },
    { key: 'versus', file: 'transition/pop.mp3', revealKey: 'cmp-vs', volume: 0.32 },
    { key: 'right', file: 'transition/whoosh-soft.mp3', revealKey: 'cmp-right', volume: 0.26 },
  ],
  'stat-hero': [
    { key: 'value', file: 'emphasis/ding.mp3', revealKey: 'stat-value', volume: 0.34 },
    { key: 'context', file: 'emphasis/chime.mp3', revealKey: 'stat-context', volume: 0.24 },
  ],
  'stat-pill': [
    { key: 'value', file: 'emphasis/ding.mp3', revealKey: 'stat-value', volume: 0.34 },
    { key: 'context', file: 'emphasis/chime.mp3', revealKey: 'stat-context', volume: 0.24 },
  ],
  'feature-list': [
    { key: 'card', file: 'transition/whoosh-soft.mp3', revealKey: 'feature-card', volume: 0.24 },
    { key: 'item1', file: 'emphasis/tick.mp3', revealKey: 'feature-item-0', volume: 0.22 },
    { key: 'item2', file: 'emphasis/tick.mp3', revealKey: 'feature-item-1', volume: 0.22 },
    { key: 'item3', file: 'emphasis/tick.mp3', revealKey: 'feature-item-2', volume: 0.22 },
  ],
  'feature-stack': [
    { key: 'title', file: 'transition/whoosh-soft.mp3', revealKey: 'title', volume: 0.24 },
    { key: 'item1', file: 'emphasis/tick.mp3', revealKey: 'stack-0', volume: 0.22 },
    { key: 'item2', file: 'emphasis/tick.mp3', revealKey: 'stack-1', volume: 0.22 },
    { key: 'item3', file: 'emphasis/tick.mp3', revealKey: 'stack-2', volume: 0.22 },
  ],
  callout: [
    { key: 'alert', file: 'alert/notification.mp3', revealKey: 'callout-card', volume: 0.32 },
  ],
  'news-card': [
    { key: 'card', file: 'transition/whoosh-soft.mp3', revealKey: 'news-card', volume: 0.24 },
    { key: 'alert', file: 'alert/notification.mp3', revealKey: 'news-card', offset: 0.18, volume: 0.26 },
  ],
  'news-alert-opener': [
    { key: 'alert', file: 'alert/notification.mp3', revealKey: 'bn-kicker', at: 0.05, volume: 0.36 },
    { key: 'headline', file: 'transition/swoosh.mp3', revealKey: 'bn-headline', volume: 0.30 },
    { key: 'timestamp', file: 'transition/pop.mp3', revealKey: 'bn-meta', volume: 0.11 },
  ],
  'issue-comparison': [
    { key: 'left', file: 'transition/pop.mp3', revealKey: 'bn-left', volume: 0.12 },
    { key: 'versus', file: 'transition/pop.mp3', revealKey: 'bn-vs', volume: 0.22 },
    { key: 'right', file: 'transition/whoosh-soft.mp3', revealKey: 'bn-right', volume: 0.20 },
    { key: 'verdict', file: 'emphasis/chime.mp3', revealKey: 'bn-verdict', volume: 0.18 },
  ],
  'news-bullet-list': [
    { key: 'card', file: 'transition/whoosh-soft.mp3', revealKey: 'bn-list-card', volume: 0.24 },
    { key: 'item1', file: 'transition/pop.mp3', revealKey: 'bn-list-item-0', volume: 0.10 },
    { key: 'item3', file: 'transition/pop.mp3', revealKey: 'bn-list-item-2', volume: 0.10 },
    { key: 'item5', file: 'transition/pop.mp3', revealKey: 'bn-list-item-4', volume: 0.10 },
  ],
  'event-timeline': [
    { key: 'title', file: 'transition/whoosh-soft.mp3', revealKey: 'bn-timeline-title', volume: 0.22 },
    { key: 'event1', file: 'transition/pop.mp3', revealKey: 'bn-event-0', volume: 0.10 },
    { key: 'event3', file: 'transition/pop.mp3', revealKey: 'bn-event-2', volume: 0.10 },
    { key: 'event5', file: 'transition/pop.mp3', revealKey: 'bn-event-4', volume: 0.10 },
  ],
  'quote-card': [
    { key: 'quote', file: 'transition/whoosh-soft.mp3', revealKey: 'bn-quote', volume: 0.24 },
    { key: 'speaker', file: 'emphasis/chime.mp3', revealKey: 'bn-speaker', volume: 0.24 },
  ],
  'visual-evidence': [
    { key: 'image', file: 'transition/whoosh-soft.mp3', revealKey: 'bn-evidence-image', volume: 0.26 },
    { key: 'caption', file: 'emphasis/chime.mp3', revealKey: 'bn-evidence-caption', volume: 0.24 },
  ],
  'key-number': [
    { key: 'value', file: 'emphasis/ding.mp3', revealKey: 'bn-key-value', volume: 0.34 },
    { key: 'context', file: 'emphasis/chime.mp3', revealKey: 'bn-key-context', volume: 0.22 },
  ],
  'follow-outro': [
    { key: 'cta', file: 'transition/whoosh-soft.mp3', revealKey: 'bn-follow-cta', volume: 0.24 },
    { key: 'subscribe', file: 'transition/pop.mp3', revealKey: 'bn-follow-card', volume: 0.30 },
    { key: 'finish', file: 'outro/tada.mp3', revealKey: 'bn-follow-summary', volume: 0.32 },
  ],
  'data-snapshot-chart': [
    { key: 'chart', file: 'transition/whoosh-soft.mp3', revealKey: 'bn-chart-panel', volume: 0.24 },
    { key: 'metric', file: 'emphasis/ding.mp3', revealKey: 'bn-chart-metric', volume: 0.30 },
  ],
  'source-check': [
    { key: 'title', file: 'alert/notification.mp3', revealKey: 'bn-source-title', volume: 0.26 },
    { key: 'confirmed', file: 'transition/pop.mp3', revealKey: 'bn-confirmed-0', volume: 0.10 },
    { key: 'unverified', file: 'transition/pop.mp3', revealKey: 'bn-unverified-0', volume: 0.12 },
  ],
  'live-update-ticker': [
    { key: 'alert', file: 'alert/notification.mp3', revealKey: 'bn-ticker-headline', volume: 0.32 },
    { key: 'update1', file: 'transition/pop.mp3', revealKey: 'bn-update-0', volume: 0.10 },
    { key: 'update2', file: 'transition/pop.mp3', revealKey: 'bn-update-1', volume: 0.10 },
  ],
  'location-context': [
    { key: 'map', file: 'transition/whoosh-soft.mp3', revealKey: 'bn-location-image', volume: 0.26 },
    { key: 'location', file: 'transition/pop.mp3', revealKey: 'bn-location-title', volume: 0.24 },
    { key: 'fact', file: 'transition/pop.mp3', revealKey: 'bn-location-fact-0', volume: 0.10 },
  ],
  'image-background-hero': [
    { key: 'image', file: 'transition/whoosh-soft.mp3', revealKey: 'photo-bg', volume: 0.28 },
    { key: 'title', file: 'emphasis/chime.mp3', revealKey: 'photo-title', volume: 0.32 },
  ],
  'image-inset-card': [
    { key: 'image', file: 'transition/pop.mp3', revealKey: 'inset-image', volume: 0.32 },
    { key: 'title', file: 'emphasis/chime.mp3', revealKey: 'inset-title', volume: 0.28 },
  ],
  'market-chart': [
    { key: 'chart', file: 'transition/whoosh-soft.mp3', revealKey: 'chart-panel', volume: 0.24 },
    { key: 'value', file: 'emphasis/ding.mp3', revealKey: 'chart-line', volume: 0.30 },
  ],
  'crypto-card-hero': [
    { key: 'wallet', file: 'transition/whoosh-soft.mp3', revealKey: 'wallet', volume: 0.26 },
    { key: 'card', file: 'transition/pop.mp3', revealKey: 'card', volume: 0.34 },
    { key: 'halo', file: 'emphasis/chime.mp3', revealKey: 'halo', volume: 0.28 },
    { key: 'stat', file: 'emphasis/ding.mp3', revealKey: 'stat-pill', volume: 0.34 },
  ],
  'onchain-payment': [
    { key: 'wallet', file: 'transition/whoosh-soft.mp3', revealKey: 'wallet', volume: 0.24 },
    { key: 'card', file: 'transition/pop.mp3', revealKey: 'card', volume: 0.32 },
    { key: 'halo', file: 'emphasis/chime.mp3', revealKey: 'halo', volume: 0.30 },
    { key: 'stat', file: 'emphasis/ding.mp3', revealKey: 'stat-pill', volume: 0.30 },
  ],
  'payment-network-halo': [
    { key: 'card', file: 'transition/pop.mp3', revealKey: 'card', volume: 0.28 },
    { key: 'halo', file: 'emphasis/chime.mp3', revealKey: 'halo', volume: 0.32 },
    { key: 'nodes', file: 'emphasis/tick.mp3', revealKey: 'icon-0', volume: 0.22 },
    { key: 'stat', file: 'emphasis/ding.mp3', revealKey: 'stat-pill', volume: 0.30 },
  ],
  'explainer-concept-hook': [
    { key: 'intro', file: 'transition/whoosh-soft.mp3', revealKey: 'ex-title', at: 0.08, volume: 0.22 },
    { key: 'term', file: 'transition/pop.mp3', revealKey: 'ex-term', volume: 0.24 },
    { key: 'definition', file: 'emphasis/chime.mp3', revealKey: 'ex-definition', volume: 0.22 },
  ],
  'explainer-problem-solution': [
    { key: 'problem', file: 'alert/notification.mp3', revealKey: 'ex-problem', volume: 0.20 },
    { key: 'bridge', file: 'transition/swoosh.mp3', revealKey: 'ex-bridge', volume: 0.22 },
    { key: 'solution', file: 'emphasis/chime.mp3', revealKey: 'ex-solution', volume: 0.24 },
  ],
  'explainer-process-steps': [
    { key: 'title', file: 'transition/whoosh-soft.mp3', revealKey: 'ex-process-title', volume: 0.20 },
    { key: 'step1', file: 'emphasis/tick.mp3', revealKey: 'ex-step-0', volume: 0.14 },
    { key: 'step3', file: 'emphasis/tick.mp3', revealKey: 'ex-step-2', volume: 0.14 },
    { key: 'result', file: 'emphasis/chime.mp3', revealKey: 'ex-process-result', volume: 0.20 },
  ],
  'explainer-cause-effect': [
    { key: 'cause', file: 'emphasis/tick.mp3', revealKey: 'ex-cause-0', volume: 0.14 },
    { key: 'arrow', file: 'transition/swoosh.mp3', revealKey: 'ex-causal-arrow', volume: 0.22 },
    { key: 'effect', file: 'transition/pop.mp3', revealKey: 'ex-effect-0', volume: 0.20 },
    { key: 'insight', file: 'emphasis/chime.mp3', revealKey: 'ex-causal-insight', volume: 0.20 },
  ],
  'explainer-analogy-bridge': [
    { key: 'abstract', file: 'transition/pop.mp3', revealKey: 'ex-abstract', volume: 0.18 },
    { key: 'bridge', file: 'transition/swoosh.mp3', revealKey: 'ex-analogy-bridge', volume: 0.22 },
    { key: 'analogy', file: 'transition/pop.mp3', revealKey: 'ex-analogy', volume: 0.18 },
    { key: 'takeaway', file: 'emphasis/chime.mp3', revealKey: 'ex-analogy-takeaway', volume: 0.20 },
  ],
  'explainer-data-proof': [
    { key: 'chart', file: 'transition/whoosh-soft.mp3', revealKey: 'ex-proof-chart', volume: 0.20 },
    { key: 'metric', file: 'emphasis/ding.mp3', revealKey: 'ex-proof-metric', volume: 0.28 },
    { key: 'insight', file: 'emphasis/chime.mp3', revealKey: 'ex-proof-insight', volume: 0.20 },
  ],
  'explainer-myth-fact': [
    { key: 'myth', file: 'alert/notification.mp3', revealKey: 'ex-myth', volume: 0.20 },
    { key: 'fact', file: 'emphasis/chime.mp3', revealKey: 'ex-fact', volume: 0.24 },
    { key: 'takeaway', file: 'transition/pop.mp3', revealKey: 'ex-myth-takeaway', volume: 0.18 },
  ],
  'explainer-recap-outro': [
    { key: 'title', file: 'transition/whoosh-soft.mp3', revealKey: 'ex-recap-title', volume: 0.20 },
    { key: 'item1', file: 'emphasis/tick.mp3', revealKey: 'ex-recap-item-0', volume: 0.14 },
    { key: 'cta', file: 'transition/pop.mp3', revealKey: 'ex-recap-cta', volume: 0.22 },
    { key: 'finish', file: 'outro/tada.mp3', revealKey: 'ex-recap-channel', volume: 0.28 },
  ],
  'explainer-image-context': [
    { key: 'image', file: 'transition/whoosh-soft.mp3', revealKey: 'ex-img-bg', volume: 0.22 },
    { key: 'title', file: 'emphasis/chime.mp3', revealKey: 'ex-img-title', volume: 0.24 },
    { key: 'caption', file: 'transition/pop.mp3', revealKey: 'ex-img-caption', volume: 0.16 },
  ],
  'explainer-image-annotations': [
    { key: 'image', file: 'transition/whoosh-soft.mp3', revealKey: 'ex-ann-image', volume: 0.20 },
    { key: 'pin1', file: 'emphasis/tick.mp3', revealKey: 'ex-ann-pin-0', volume: 0.14 },
    { key: 'pin2', file: 'emphasis/tick.mp3', revealKey: 'ex-ann-pin-1', volume: 0.14 },
    { key: 'caption', file: 'emphasis/chime.mp3', revealKey: 'ex-ann-caption', volume: 0.18 },
  ],
  'explainer-image-zoom': [
    { key: 'image', file: 'transition/whoosh-soft.mp3', revealKey: 'ex-zoom-image', volume: 0.20 },
    { key: 'lens', file: 'transition/pop.mp3', revealKey: 'ex-zoom-lens', volume: 0.22 },
    { key: 'detail', file: 'emphasis/chime.mp3', revealKey: 'ex-zoom-detail', volume: 0.20 },
  ],
  'explainer-image-timeline': [
    { key: 'image', file: 'transition/whoosh-soft.mp3', revealKey: 'ex-timeline-image', volume: 0.20 },
    { key: 'event1', file: 'emphasis/tick.mp3', revealKey: 'ex-img-event-0', volume: 0.14 },
    { key: 'event3', file: 'emphasis/tick.mp3', revealKey: 'ex-img-event-2', volume: 0.14 },
  ],
  'explainer-image-side-panel': [
    { key: 'image', file: 'transition/whoosh-soft.mp3', revealKey: 'ex-side-image', volume: 0.20 },
    { key: 'panel', file: 'transition/pop.mp3', revealKey: 'ex-side-panel', volume: 0.20 },
    { key: 'bullet1', file: 'emphasis/tick.mp3', revealKey: 'ex-side-bullet-0', volume: 0.14 },
  ],
  'explainer-image-recap': [
    { key: 'image', file: 'transition/whoosh-soft.mp3', revealKey: 'ex-recap-image', volume: 0.20 },
    { key: 'item1', file: 'emphasis/tick.mp3', revealKey: 'ex-img-recap-item-0', volume: 0.14 },
    { key: 'cta', file: 'outro/tada.mp3', revealKey: 'ex-img-recap-cta', volume: 0.24 },
  ],
  outro: [
    { key: 'cta', file: 'transition/whoosh-soft.mp3', revealKey: 'out-cta', volume: 0.24 },
    { key: 'finish', file: 'outro/tada.mp3', revealKey: 'out-channel', volume: 0.34 },
  ],
};

const SFX_DURATION_SEC = {
  'alert/notification.mp3': 0.476,
  'emphasis/chime.mp3': 1.892,
  'emphasis/ding.mp3': 2.952,
  'emphasis/tick.mp3': 3.709,
  'outro/tada.mp3': 2.508,
  'transition/pop.mp3': 0.288,
  'transition/swoosh.mp3': 0.360,
  'transition/whoosh-soft.mp3': 0.975,
};

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
  const duration = clampNumber(durationSec ?? estimateSceneDurationSec(scene?.srt), 1, 180);
  const visualSpec = parseVisualSpec(scene?.visual || '');
  const template = normalizeSceneTemplate(scene, sceneCount, visualSpec);
  if (scene && typeof scene === 'object') {
    scene.template = template;
  }

  const data = buildTemplateData(template, scene, visualSpec, sceneCount);
  const revealPlan = buildRevealPlan(template, data, scene, visualSpec, duration);
  const compositionId = `scene-${safeId(scene?.stt ?? 'x')}`;
  const shellHtml = renderShell({ channel: 'Video Pipeline', source: 'HyperFrames', aspect: ar.label });
  const sceneHtml = renderScene({ scene, template, data, visualSpec, revealPlan, duration });
  const audioHtml = renderTemplateSfx({ template, data, scene, revealPlan, duration });
  const css = buildStyles(ar, data.theme || {});
  const animJs = readTemplate('animations.js')
    .replace(/window\.__timelines\["news-video"\]/g, `window.__timelines[${JSON.stringify(compositionId)}]`);

  return readTemplate('base.html.tmpl')
    .replace('{{TITLE}}', escapeHtml(`Canh ${scene?.stt ?? ''}`))
    .replace(/\{\{COMPOSITION_ID\}\}/g, compositionId)
    .replace(/\{\{WIDTH\}\}/g, String(ar.w))
    .replace(/\{\{HEIGHT\}\}/g, String(ar.h))
    .replace(/\{\{TOTAL_DURATION\}\}/g, duration.toFixed(3))
    .replace('{{SHELL}}', shellHtml)
    .replace('{{AUDIO}}', audioHtml)
    .replace('{{SCENES}}', sceneHtml)
    .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}\n</style>`)
    .replace('<script src="animations.js"></script>', `<script>\n${animJs}\n</script>`);
}

export function inferTemplate(scene, sceneCount = 0) {
  return normalizeSceneTemplate(scene, sceneCount, parseVisualSpec(scene?.visual || ''));
}

export function normalizeSceneTemplate(scene, sceneCount = 0, visualSpec = parseVisualSpec(scene?.visual || '')) {
  const layout = normalizeMatchText(visualSpec.layout || '');
  const text = normalizeMatchText(`${scene?.voice || ''} ${scene?.visual || ''}`);
  const hasCryptoPayment = /(crypto|the crypto|the thanh toan|stablecoin|visa|on chain|onchain)/i.test(text);
  const hasHalo = /(halo|mang|network|on chain|onchain|visa)/i.test(text);
  const hasStatOverlay = visualSpec.textOverlay.some(item => /\d|%|\$|usd|vnd|trieu|ty/i.test(item.text));
  const layoutTemplate = inferTemplateFromLayout(layout, { hasCryptoPayment, hasHalo, hasStatOverlay });
  const explicit = normalizeTemplateName(scene?.template || scene?.templateData?.template || '');

  if (explicit) return explicit;
  if (layoutTemplate) return layoutTemplate;

  if (layout.includes('chart') || /(bieu do|chart|duong gia|line graph|market)/i.test(text)) return 'market-chart';
  if (layout.includes('image background') || layout.includes('photo background') || /(anh nen|background image|photo background)/i.test(text)) return 'image-background-hero';
  if (layout.includes('image') || layout.includes('photo') || /(anh minh hoa|image panel|photo card|hinh anh)/i.test(text)) return 'image-inset-card';
  if (layout.includes('split') || /(so sanh|\bvs\b|versus|truoc sau|doi lap|khac nhau)/i.test(text)) return 'comparison-vs';
  if (layout.includes('stack') || layout.includes('list') || /(gom|bao gom|danh sach|cac buoc|ly do|dac diem)/i.test(text)) return 'feature-stack';
  if (layout.includes('card') || /(tin tuc|news|nguon|source)/i.test(text)) return 'news-card';
  if (hasCryptoPayment && hasHalo) return 'onchain-payment';
  if (hasHalo) return 'payment-network-halo';
  if (hasStatOverlay) return 'stat-pill';

  const stt = Number(scene?.stt) || 1;
  if (sceneCount && stt === Number(sceneCount)) return 'outro';
  if (stt === 1) return 'hook';
  if (/(so sanh|\bvs\b|versus|khac nhau|truoc.+sau|doi lap|hon kem|mot ben|hai ben)/i.test(text)) return 'comparison-vs';
  if (extractNumber(scene?.voice || scene?.visual)) return 'stat-pill';
  if (/(canh bao|luu y|quan trong|rui ro|nguy co|khong nen|dung|phai nho|mau chot|diem chinh)/i.test(text)) return 'callout';
  return stt % 3 === 0 ? 'feature-stack' : stt % 3 === 1 ? 'news-card' : 'stat-pill';
}

function inferTemplateFromLayout(layout, { hasCryptoPayment = false, hasHalo = false, hasStatOverlay = false } = {}) {
  const value = normalizeMatchText(layout || '');
  if (!value) return '';
  if (/(outro|cta|ket thuc)$/.test(value)) return 'outro';
  if (/hero/.test(value)) return hasCryptoPayment ? 'crypto-card-hero' : hasStatOverlay ? 'stat-hero' : 'hook';
  if (/(chart|dashboard|graph|market|bieu do|duong gia)/.test(value)) return 'market-chart';
  if (/(image background|photo background|anh nen|full image|full photo)/.test(value)) return 'image-background-hero';
  if (/(image|photo|media|anh|hinh anh)/.test(value)) return 'image-inset-card';
  if (/(versus|\bvs\b|split|comparison|so sanh|doi lap)/.test(value)) return 'comparison-vs';
  if (/(stack|list|feature|steps|danh sach|cac buoc)/.test(value)) return 'feature-stack';
  if (/(orbit|halo|network|mang|onchain|on chain)/.test(value)) return hasCryptoPayment || hasHalo ? 'payment-network-halo' : 'feature-stack';
  if (/(phone|mockup|mobile|reveal|card)/.test(value)) return hasStatOverlay ? 'stat-pill' : 'news-card';
  return '';
}

export function parseVisualSpec(visual = '') {
  const raw = String(visual || '').trim();
  const normalizedRaw = raw.replace(
    /\s+((?:\d+\.\s*)?(?:LAYOUT|BACKGROUND|MAIN ELEMENTS|APPEARANCE ORDER|TEXT OVERLAY)(?:\s*\([^)]*\))?\s*:)/gi,
    '\n$1'
  );
  const sections = {};
  const re = /(?:^|\n)\s*(?:\d+\.\s*)?(LAYOUT|BACKGROUND|MAIN ELEMENTS|APPEARANCE ORDER|TEXT OVERLAY)(?:\s*\([^)]*\))?\s*:\s*([\s\S]*?)(?=\n\s*(?:\d+\.\s*)?(?:LAYOUT|BACKGROUND|MAIN ELEMENTS|APPEARANCE ORDER|TEXT OVERLAY)(?:\s*\([^)]*\))?\s*:|$)/gi;
  for (const match of normalizedRaw.matchAll(re)) {
    sections[match[1].toUpperCase()] = match[2].trim();
  }

  const layout = normalizeText((sections.LAYOUT || '').replace(/\.$/, '')).toLowerCase();
  const backgroundRaw = sections.BACKGROUND || '';
  const colors = Array.from(backgroundRaw.matchAll(/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/gi)).map(m => m[0]);

  return {
    raw,
    layout,
    background: {
      raw: backgroundRaw,
      direction: /doc|vertical|tren sang|top/i.test(backgroundRaw) ? 'vertical' : /ngang|horizontal|left|right/i.test(backgroundRaw) ? 'horizontal' : 'vertical',
      colors,
      pattern: /pattern|duong|giao dich|on-chain|on chain/i.test(backgroundRaw) ? backgroundRaw : '',
      opacity: parseOpacity(backgroundRaw) ?? 0.18,
    },
    elements: parseVisualElements(sections['MAIN ELEMENTS'] || ''),
    appearanceOrder: parseAppearanceOrder(sections['APPEARANCE ORDER'] || ''),
    textOverlay: parseTextOverlay(sections['TEXT OVERLAY'] || ''),
    sections,
  };
}

function parseVisualElements(raw) {
  const items = splitNumberedItems(raw);
  return items.map((item, idx) => {
    const xy = parseXY(item);
    const color = parseColor(item);
    const label = normalizeText(item.replace(/^\(?\d+\)?\s*/, '').split(/\s+x\s*=/i)[0].replace(/[;.]$/, ''));
    return {
      id: `element-${idx + 1}`,
      index: idx + 1,
      raw: item,
      label,
      kind: inferElementKind(item),
      x: xy.x,
      y: xy.y,
      color,
      timingPhrase: extractTimingPhrase(item),
    };
  });
}

function parseAppearanceOrder(raw) {
  return normalizeText(raw)
    .split(/\s*(?:→|->|=>|;|\n)\s*/g)
    .map(item => item.replace(/^\(?\d+\)?\s*/, '').trim())
    .filter(Boolean);
}

function parseTextOverlay(raw) {
  const parts = normalizeText(raw).split(/\s*;\s*/g).filter(Boolean);
  const overlays = [];
  for (const [partIndex, part] of parts.entries()) {
    const xy = parseXY(part);
    const quoted = Array.from(part.matchAll(/"([^"]+)"/g)).map(m => m[1].trim()).filter(Boolean);
    const texts = quoted.length ? quoted : [part.replace(/^.*?:\s*/, '').trim()].filter(Boolean);
    texts.forEach((text, idx) => {
      overlays.push({
        id: `text-${partIndex + 1}-${idx + 1}`,
        raw: part,
        text,
        x: xy.x,
        y: xy.y,
        color: parseColor(text) || parseColor(part),
        role: inferTextRole(text, part),
      });
    });
  }
  return overlays;
}

function buildTemplateData(template, scene, visualSpec, sceneCount) {
  const fallback = buildFallbackTemplateData(template, scene, visualSpec, sceneCount);
  const raw = scene?.templateData;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return normalizeTemplateData(template, raw, fallback);
  }
  return fallback;
}

function buildFallbackTemplateData(template, scene, visualSpec, sceneCount) {
  const voice = normalizeText(scene?.voice || '');
  const visual = normalizeText(scene?.visual || '');
  const phrases = extractPhrases(voice);
  const first = phrases[0] || voice || visual || 'Nội dung chính';
  const bgColors = visualSpec.background.colors;
  const theme = {
    bgTop: bgColors[0] || '#111827',
    bgBottom: bgColors[1] || '#2563eb',
    accent: bgColors.find(c => c.toLowerCase() === '#06b6d4') || '#06b6d4',
    mint: bgColors.find(c => c.toLowerCase() === '#22c55e') || '#22c55e',
    patternOpacity: visualSpec.background.opacity,
  };

  if (template === 'explainer-concept-hook') {
    const title = pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 44);
    return {
      template,
      theme,
      kicker: 'GIẢI THÍCH NHANH',
      title,
      subtitle: truncateSmart(phrases[1] || 'Một ý phức tạp, nhìn theo cách đơn giản hơn', 72),
      coreTerm: truncateSmart(extractKeyTerm(voice || visual) || title, 24),
      definition: truncateSmart(phrases[2] || phrases[1] || visualKeyword(visual), 84),
      icon: 'spark',
      blockRefs: ['kinetic-type', 'shimmer-sweep', 'grain-overlay'],
    };
  }

  if (template === 'explainer-problem-solution') {
    const [left, right] = splitComparison(voice, visual);
    return {
      template,
      theme,
      title: pickOverlayText(visualSpec, item => item.role === 'title') || 'Vấn đề nằm ở đâu?',
      problem: { label: 'Vấn đề', title: truncateSmart(left.value || first, 30), detail: truncateSmart(phrases[1] || 'Cách nhìn cũ làm mọi thứ khó hiểu hơn', 58), stat: '' },
      solution: { label: 'Cách hiểu đúng', title: truncateSmart(right.value || phrases[1] || 'Đổi góc nhìn', 30), detail: truncateSmart(phrases[2] || 'Tách khái niệm thành phần nhỏ, dễ kiểm chứng', 58), stat: '' },
      bridge: truncateSmart(phrases[2] || 'Chìa khóa là nhìn vào cơ chế phía sau', 64),
      blockRefs: ['flowchart', 'comparison-vs', 'shimmer-sweep'],
    };
  }

  if (template === 'explainer-process-steps') {
    return {
      template,
      theme,
      kicker: 'QUY TRÌNH',
      title: pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 42),
      steps: extractBullets(voice, visual).slice(0, 4).map((text, index) => ({ label: String(index + 1).padStart(2, '0'), text, detail: '' })),
      result: truncateSmart(phrases[3] || phrases[1] || 'Kết quả là một luồng dễ theo dõi hơn', 66),
      blockRefs: ['flowchart', 'grid-pixelate-wipe', 'shimmer-sweep'],
    };
  }

  if (template === 'explainer-cause-effect') {
    const bullets = extractBullets(voice, visual);
    return {
      template,
      theme,
      title: pickOverlayText(visualSpec, item => item.role === 'title') || 'Vì sao chuyện này xảy ra?',
      causes: bullets.slice(0, 3).map((text, index) => ({ label: String(index + 1), text, detail: '' })),
      effects: bullets.slice(1, 4).map((text, index) => ({ label: String(index + 1), text, detail: '' })),
      insight: truncateSmart(phrases[2] || 'Nguyên nhân nhỏ có thể tạo ra hệ quả lớn khi lặp lại đủ lâu', 76),
      blockRefs: ['flowchart', 'ripple-waves', 'shimmer-sweep'],
    };
  }

  if (template === 'explainer-analogy-bridge') {
    const [left, right] = splitComparison(voice, visual);
    return {
      template,
      theme,
      title: pickOverlayText(visualSpec, item => item.role === 'title') || 'Hãy nghĩ nó giống như...',
      abstract: { label: 'Khái niệm', title: truncateSmart(left.value || first, 28), detail: truncateSmart(phrases[1] || '', 54), stat: '' },
      analogy: { label: 'Ví dụ quen thuộc', title: truncateSmart(right.value || 'Một bản đồ chỉ đường', 28), detail: truncateSmart(phrases[2] || '', 54), stat: '' },
      bridge: truncateSmart(phrases[1] || 'Hai thứ khác nhau, nhưng cùng một logic', 56),
      takeaway: truncateSmart(phrases[2] || 'Ẩn dụ giúp người xem giữ lại ý chính', 64),
      blockRefs: ['flowchart', 'ui-3d-reveal', 'shimmer-sweep'],
    };
  }

  if (template === 'explainer-data-proof') {
    return {
      template,
      theme,
      kicker: 'BẰNG CHỨNG',
      title: pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 42),
      metric: pickOverlayText(visualSpec, item => item.role === 'stat') || extractNumber(voice) || extractNumber(visual) || '3x',
      metricLabel: 'tín hiệu chính',
      insight: truncateSmart(phrases[1] || 'Số liệu giúp kiểm tra trực giác ban đầu', 70),
      labels: ['A', 'B', 'C', 'D', 'E'],
      dataPoints: [18, 32, 27, 49, 72],
      blockRefs: ['data-chart', 'nyt-graph', 'shimmer-sweep'],
    };
  }

  if (template === 'explainer-myth-fact') {
    const [left, right] = splitComparison(voice, visual);
    return {
      template,
      theme,
      title: pickOverlayText(visualSpec, item => item.role === 'title') || 'Hiểu lầm phổ biến',
      myth: { label: 'Hiểu lầm', title: truncateSmart(left.value || first, 32), detail: truncateSmart(phrases[1] || 'Nghe hợp lý nhưng bỏ qua phần quan trọng', 58), stat: '' },
      fact: { label: 'Sự thật', title: truncateSmart(right.value || phrases[1] || 'Cơ chế mới là điểm chính', 32), detail: truncateSmart(phrases[2] || 'Nhìn vào điều kiện và hệ quả thực tế', 58), stat: '' },
      takeaway: truncateSmart(phrases[2] || 'Đừng nhớ câu trả lời, hãy nhớ nguyên lý', 62),
      blockRefs: ['flash-through-white', 'shimmer-sweep', 'macos-notification'],
    };
  }

  if (template === 'explainer-recap-outro') {
    return {
      template,
      theme,
      title: pickOverlayText(visualSpec, item => item.role === 'title') || 'Tóm lại',
      takeaways: extractBullets(voice, visual).slice(0, 3).map((text, index) => ({ label: String(index + 1), text, detail: '' })),
      cta: 'Theo dõi để hiểu nhanh hơn',
      channelName: 'Explainer',
      blockRefs: ['logo-outro', 'tiktok-follow', 'yt-lower-third'],
    };
  }

  if (template === 'explainer-image-context') {
    const title = pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 44);
    return {
      template,
      theme,
      kicker: 'BỐI CẢNH',
      title,
      subtitle: truncateSmart(phrases[1] || 'Bắt đầu bằng hình ảnh để người xem hiểu tình huống', 74),
      caption: truncateSmart(phrases[2] || phrases[1] || 'Ảnh minh họa bối cảnh chính', 64),
      imageSearch: { q: buildImageQuery(`${voice} ${visual}`, 'background'), intent: 'Full-screen editorial image or diagram background for an explainer context scene', orientation: 'portrait', prefer: ['editorial', 'diagram', 'context'], avoid: ['logo', 'icon', 'stock'] },
      image: { title: '', src: '', width: 0, height: 0, alt: title },
      overlay: { opacity: 0.62 },
      blockRefs: ['image-background-hero', 'shimmer-sweep', 'light-leak'],
    };
  }

  if (template === 'explainer-image-annotations') {
    const bullets = extractBullets(voice, visual).slice(0, 3);
    return {
      template,
      theme,
      kicker: 'NHÌN VÀO ẢNH',
      title: pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 40),
      imageSearch: { q: buildImageQuery(`${voice} ${visual}`, 'illustration'), intent: 'Readable image, chart, screenshot, or diagram that can support annotation pins', orientation: 'any', prefer: ['diagram', 'screenshot', 'photo'], avoid: ['logo', 'icon', 'clipart'] },
      image: { title: '', src: '', width: 0, height: 0, alt: truncateSmart(first, 52) },
      annotations: bullets.map((text, index) => ({ label: String(index + 1), text, x: [24, 68, 42][index] || 50, y: [30, 45, 68][index] || 55 })),
      caption: truncateSmart(phrases[2] || phrases[1] || '', 70),
      blockRefs: ['image-inset-card', 'macos-notification', 'shimmer-sweep'],
    };
  }

  if (template === 'explainer-image-zoom') {
    const title = pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 40);
    return {
      template,
      theme,
      kicker: 'CHI TIẾT',
      title,
      detailTitle: truncateSmart(phrases[1] || 'Điểm cần chú ý', 32),
      detail: truncateSmart(phrases[2] || 'Phóng to một vùng ảnh để giải thích cơ chế hoặc dấu hiệu quan trọng.', 76),
      zoomLabel: 'zoom',
      lens: { x: 58, y: 42, size: 250 },
      imageSearch: { q: buildImageQuery(`${voice} ${visual}`, 'illustration'), intent: 'Detailed image, chart, interface screenshot, or object photo that benefits from a zoom callout', orientation: 'any', prefer: ['detail', 'screenshot', 'chart'], avoid: ['logo', 'icon', 'stock'] },
      image: { title: '', src: '', width: 0, height: 0, alt: title },
      blockRefs: ['image-inset-card', 'ui-3d-reveal', 'shimmer-sweep'],
    };
  }

  if (template === 'explainer-image-timeline') {
    const title = pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 42);
    return {
      template,
      theme,
      kicker: 'DIỄN TIẾN',
      title,
      imageSearch: { q: buildImageQuery(`${voice} ${visual}`, 'background'), intent: 'Background image that sets the scene while a short explainer timeline overlays it', orientation: 'portrait', prefer: ['editorial', 'timeline context', 'photo'], avoid: ['logo', 'icon', 'clipart'] },
      image: { title: '', src: '', width: 0, height: 0, alt: title },
      events: extractBullets(voice, visual).slice(0, 4).map((title, index) => ({ time: String(index + 1).padStart(2, '0'), title, detail: '' })),
      caption: truncateSmart(phrases[2] || '', 60),
      overlay: { opacity: 0.58 },
      blockRefs: ['flowchart', 'image-background-hero', 'grid-pixelate-wipe'],
    };
  }

  if (template === 'explainer-image-side-panel') {
    const bullets = extractBullets(voice, visual).slice(0, 3);
    return {
      template,
      theme,
      kicker: 'GIẢI THÍCH',
      title: pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 42),
      panelTitle: truncateSmart(phrases[1] || 'Điều ảnh đang cho thấy', 34),
      body: truncateSmart(phrases[2] || phrases[1] || 'Tách ảnh và phần giải thích để người xem vừa nhìn vừa hiểu.', 78),
      bullets: bullets.map((text, index) => ({ label: String(index + 1), text, detail: '' })),
      imageSearch: { q: buildImageQuery(`${voice} ${visual}`, 'illustration'), intent: 'Strong explanatory photo, chart, or screenshot that works beside a text panel', orientation: 'any', prefer: ['photo', 'screenshot', 'chart'], avoid: ['logo', 'icon', 'clipart'] },
      image: { title: '', src: '', width: 0, height: 0, alt: truncateSmart(first, 52) },
      blockRefs: ['image-inset-card', 'app-showcase', 'shimmer-sweep'],
    };
  }

  if (template === 'explainer-image-recap') {
    return {
      template,
      theme,
      kicker: 'TÓM TẮT BẰNG HÌNH',
      title: pickOverlayText(visualSpec, item => item.role === 'title') || 'Nhìn lại ý chính',
      imageSearch: { q: buildImageQuery(`${voice} ${visual}`, 'illustration'), intent: 'Recap image or diagram that reinforces the final takeaways of an explainer', orientation: 'any', prefer: ['diagram', 'summary', 'photo'], avoid: ['logo', 'icon', 'stock'] },
      image: { title: '', src: '', width: 0, height: 0, alt: truncateSmart(first, 52) },
      takeaways: extractBullets(voice, visual).slice(0, 3).map((text, index) => ({ label: String(index + 1), text, detail: '' })),
      cta: 'Nhớ hình, nhớ ý chính',
      blockRefs: ['logo-outro', 'image-inset-card', 'yt-lower-third'],
    };
  }

  if (['crypto-card-hero', 'onchain-payment', 'payment-network-halo'].includes(template)) {
    const title = pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 42);
    const statTexts = visualSpec.textOverlay.filter(item => item.role === 'stat').map(item => item.text);
    const note = pickOverlayText(visualSpec, item => item.role === 'note') || visualSpec.textOverlay.find(item => /visa|on-chain|on chain/i.test(item.text))?.text || '';
    return {
      template,
      theme,
      title,
      statMain: statTexts[0] || extractNumber(voice) || '+',
      statSub: statTexts[1] || truncateSmart(phrases.find(p => /\d/.test(p)) || '', 28),
      note,
      elements: visualSpec.elements,
      cardLabel: /visa/i.test(`${voice} ${visual}`) ? 'VISA CRYPTO' : 'CRYPTO CARD',
    };
  }

  if (template === 'market-chart') {
    return {
      template,
      theme,
      title: pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 38),
      value: pickOverlayText(visualSpec, item => item.role === 'stat') || extractNumber(voice) || 'Tăng trưởng',
      context: truncateSmart(phrases[1] || visualKeyword(visual), 60),
    };
  }

  if (template === 'image-background-hero') {
    const title = pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 44);
    return {
      template,
      theme,
      kicker: 'Bối cảnh',
      title,
      subtitle: truncateSmart(phrases[1] || visualKeyword(visual), 72),
      source: '',
      imageSearch: { q: buildImageQuery(`${voice} ${visual}`, 'background'), intent: 'Full-screen vertical background image' },
      image: { title: '', src: '', width: 0, height: 0, alt: title },
      overlay: { opacity: 0.56 },
    };
  }

  if (template === 'image-inset-card') {
    const title = pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 46);
    return {
      template,
      theme,
      kicker: 'Hình ảnh',
      title,
      body: truncateSmart(phrases[1] || visualKeyword(visual), 88),
      source: '',
      imageSearch: { q: buildImageQuery(`${voice} ${visual}`, 'illustration'), intent: 'Inset image or chart that illustrates the scene' },
      image: { title: '', src: '', width: 0, height: 0, alt: title },
    };
  }

  if (template === 'news-card') {
    return {
      template,
      theme,
      kicker: 'Tin chính',
      title: pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 54),
      body: truncateSmart(phrases[1] || phrases[0] || visualKeyword(visual), 90),
    };
  }

  if (template === 'news-alert-opener') {
    return {
      template,
      theme,
      kicker: 'TIN NÓNG',
      headline: pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 52),
      subhead: truncateSmart(phrases[1] || visualKeyword(visual), 70),
      timestamp: 'Cập nhật mới',
      location: '',
      blockRefs: ['macos-notification', 'flash-through-white', 'shimmer-sweep'],
    };
  }

  if (template === 'issue-comparison') {
    const [left, right] = splitComparison(voice, visual);
    return {
      template,
      theme,
      title: 'Hai vấn đề cần so sánh',
      left: { label: left.label, title: truncateSmart(left.value, 28), detail: '', stat: '', color: 'red' },
      right: { label: right.label, title: truncateSmart(right.value, 28), detail: '', stat: '', color: 'cyan' },
      verdict: '',
      blockRefs: ['comparison-vs', 'shimmer-sweep'],
    };
  }

  if (template === 'news-bullet-list') {
    return {
      template,
      theme,
      kicker: 'CẦN BIẾT',
      title: pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 42),
      items: extractBullets(voice, visual).slice(0, 5),
      blockRefs: ['macos-notification', 'grid-pixelate-wipe', 'shimmer-sweep'],
    };
  }

  if (template === 'event-timeline') {
    return {
      template,
      theme,
      kicker: 'DIỄN BIẾN',
      title: pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 42),
      events: extractBullets(voice, visual).slice(0, 5).map((title, index) => ({ time: `T+${index}`, title, detail: '' })),
      source: '',
      blockRefs: ['flowchart', 'grid-pixelate-wipe'],
    };
  }

  if (template === 'quote-card') {
    return {
      template,
      theme,
      kicker: 'TRÍCH DẪN',
      quote: truncateSmart(first, 110),
      speaker: 'Nguồn tin',
      role: '',
      source: '',
      context: truncateSmart(phrases[1] || visualKeyword(visual), 70),
      blockRefs: ['x-post', 'reddit-post'],
    };
  }

  if (template === 'visual-evidence') {
    const title = pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 46);
    return {
      template,
      theme,
      kicker: 'BẰNG CHỨNG HÌNH ẢNH',
      title,
      caption: truncateSmart(phrases[1] || visualKeyword(visual), 82),
      source: '',
      imageSearch: { q: buildImageQuery(`${voice} ${visual}`, 'illustration'), intent: 'Evidence image, screenshot, document, or scene photo for a breaking-news visual proof card' },
      image: { title: '', src: '', width: 0, height: 0, alt: title },
      overlay: { opacity: 0.48 },
      blockRefs: ['image-inset-card', 'macos-notification', 'shimmer-sweep'],
    };
  }

  if (template === 'key-number') {
    const value = pickOverlayText(visualSpec, item => item.role === 'stat') || extractNumber(voice) || extractNumber(visual) || 'MOI';
    return {
      template,
      theme,
      kicker: 'CON SỐ NỔI BẬT',
      value: truncateSmart(value, 22),
      label: truncateSmart(removeFirstNumber(first, value) || first, 48),
      context: truncateSmart(phrases[1] || visualKeyword(visual), 64),
      source: '',
      blockRefs: ['data-chart', 'apple-money-count', 'shimmer-sweep'],
    };
  }

  if (template === 'follow-outro') {
    return {
      template,
      theme,
      ctaTop: 'Theo dõi để cập nhật tiếp',
      channelName: 'Breaking News',
      handle: '@breakingnews',
      subscriberText: 'Tin nóng mỗi ngày',
      summary: truncateSmart(phrases[0] || 'Cảm ơn bạn đã theo dõi', 54),
      platform: 'YouTube',
      blockRefs: ['yt-lower-third', 'tiktok-follow', 'logo-outro'],
    };
  }

  if (template === 'data-snapshot-chart') {
    return {
      template,
      theme,
      title: pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 42),
      subtitle: truncateSmart(phrases[1] || 'Cập nhật số liệu mới nhất', 64),
      metric: extractNumber(voice) || extractNumber(visual) || '72%',
      metricLabel: 'điểm nhấn',
      source: '',
      labels: ['T1', 'T2', 'T3', 'T4', 'T5'],
      dataPoints: [18, 31, 26, 44, 62],
      blockRefs: ['data-chart', 'nyt-graph'],
    };
  }

  if (template === 'source-check') {
    return {
      template,
      theme,
      kicker: 'KIỂM CHỨNG',
      title: pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 42),
      confirmed: extractBullets(voice, visual).slice(0, 2),
      unverified: ['Đang chờ xác nhận độc lập'],
      source: '',
      blockRefs: ['macos-notification', 'reddit-post'],
    };
  }

  if (template === 'live-update-ticker') {
    return {
      template,
      theme,
      label: 'LIVE',
      headline: pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 54),
      updates: extractBullets(voice, visual).slice(0, 5).map((title, index) => ({ time: `${index + 1}`, title, detail: '' })),
      timestamp: 'Cập nhật liên tục',
      source: '',
      blockRefs: ['macos-notification', 'whip-pan'],
    };
  }

  if (template === 'location-context') {
    const title = pickOverlayText(visualSpec, item => item.role === 'title') || truncateSmart(first, 44);
    return {
      template,
      theme,
      kicker: 'ĐỊA ĐIỂM',
      title,
      location: truncateSmart(visualKeyword(visual) || 'Khu vực liên quan', 42),
      caption: truncateSmart(phrases[1] || '', 72),
      facts: extractBullets(voice, visual).slice(0, 3),
      source: '',
      imageSearch: { q: buildImageQuery(`${voice} ${visual} map location`, 'illustration'), intent: 'Map, location photo, or annotated geographic context image for breaking news' },
      image: { title: '', src: '', width: 0, height: 0, alt: title },
      blockRefs: ['north-korea-locked-down', 'nyc-paris-flight', 'image-inset-card'],
    };
  }

  if (template === 'comparison-vs') {
    const [left, right] = splitComparison(voice, visual);
    return {
      template,
      theme,
      left: { label: left.label, value: truncateSmart(left.value, 24), color: 'cyan' },
      right: { label: right.label, value: truncateSmart(right.value, 24), color: 'purple', winner: false },
    };
  }

  if (template === 'feature-stack') {
    return {
      template,
      theme,
      title: pickOverlayText(visualSpec, item => item.role === 'title') || visualKeyword(visual) || truncateSmart(first, 40),
      bullets: extractBullets(voice, visual),
    };
  }

  if (template === 'stat-pill' || template === 'stat-hero') {
    const value = pickOverlayText(visualSpec, item => item.role === 'stat') || extractNumber(voice) || extractNumber(visual) || `${Number(scene?.stt) || 1}`;
    return {
      template,
      theme,
      value: truncateSmart(value, 20),
      label: truncateSmart(removeFirstNumber(first, value) || first, 42),
      context: truncateSmart(phrases[1] || visualKeyword(visual), 48),
    };
  }

  if (template === 'feature-list') {
    return { template, theme, title: truncateSmart(visualKeyword(visual) || first, 40), bullets: extractBullets(voice, visual) };
  }

  if (template === 'comparison') {
    const [left, right] = splitComparison(voice, visual);
    return { template, theme, left: { ...left, color: 'cyan' }, right: { ...right, color: 'purple' } };
  }

  if (template === 'outro') {
    return {
      template,
      theme,
      ctaTop: 'Theo dõi để xem tiếp',
      channelName: truncateSmart(phrases[0] || 'Bản Tin Nhanh', 30),
      source: sceneCount ? `Hoàn tất ${sceneCount} cảnh` : 'Hẹn gặp lại',
    };
  }

  if (template === 'callout') {
    return { template, theme, tag: /(canh bao|rui ro|nguy co)/i.test(normalizeMatchText(voice + visual)) ? 'Cảnh báo' : 'Điểm chính', statement: truncateSmart(first, 82) };
  }

  return { template: 'hook', theme, headline: truncateSmart(first, 44), subhead: truncateSmart(phrases[1] || visualKeyword(visual) || '', 42) };
}

function renderScene({ scene, template, data, visualSpec, revealPlan, duration }) {
  const id = safeId(scene?.stt ?? 'x');
  const inner = renderInner(template, data, visualSpec, revealPlan);
  return `
<div class="scene clip scene-template-${escapeAttr(template)}"
     id="scene-${id}"
     data-start="0"
     data-duration="${duration.toFixed(3)}"
     data-layout="${escapeAttr(template)}"
     style="--scene-dur:${duration.toFixed(3)}s;--vp-bg-top:${escapeAttr(data.theme?.bgTop || '#111827')};--vp-bg-bottom:${escapeAttr(data.theme?.bgBottom || '#2563eb')};--vp-accent:${escapeAttr(data.theme?.accent || '#06b6d4')};--vp-mint:${escapeAttr(data.theme?.mint || '#22c55e')};--vp-pattern-opacity:${Number(data.theme?.patternOpacity ?? .18)};--vp-bg-image:${backgroundImageValue(data.theme?.bgImage)};--vp-bg-fit:${escapeAttr(data.theme?.bgFit || 'cover')}">
  ${inner}
</div>`.trim();
}

function renderInner(template, data, visualSpec, revealPlan) {
  if (['crypto-card-hero', 'onchain-payment', 'payment-network-halo'].includes(template)) {
    return renderCryptoHero(data, visualSpec, revealPlan);
  }
  if (template === 'image-background-hero') return renderImageBackgroundHero(data, revealPlan);
  if (template === 'image-inset-card') return renderImageInsetCard(data, revealPlan);
  if (template === 'market-chart') return renderMarketChart(data, revealPlan);
  if (template === 'news-card') return renderNewsCard(data, revealPlan);
  if (template === 'news-alert-opener') return renderBreakingNewsAlertOpener(data, revealPlan);
  if (template === 'issue-comparison') return renderBreakingIssueComparison(data, revealPlan);
  if (template === 'news-bullet-list') return renderBreakingBulletList(data, revealPlan);
  if (template === 'event-timeline') return renderBreakingTimeline(data, revealPlan);
  if (template === 'quote-card') return renderBreakingQuoteCard(data, revealPlan);
  if (template === 'visual-evidence') return renderBreakingVisualEvidence(data, revealPlan);
  if (template === 'key-number') return renderBreakingKeyNumber(data, revealPlan);
  if (template === 'follow-outro') return renderBreakingFollowOutro(data, revealPlan);
  if (template === 'data-snapshot-chart') return renderBreakingDataSnapshotChart(data, revealPlan);
  if (template === 'source-check') return renderBreakingSourceCheck(data, revealPlan);
  if (template === 'live-update-ticker') return renderBreakingLiveUpdateTicker(data, revealPlan);
  if (template === 'location-context') return renderBreakingLocationContext(data, revealPlan);
  if (template === 'explainer-concept-hook') return renderExplainerConceptHook(data, revealPlan);
  if (template === 'explainer-problem-solution') return renderExplainerProblemSolution(data, revealPlan);
  if (template === 'explainer-process-steps') return renderExplainerProcessSteps(data, revealPlan);
  if (template === 'explainer-cause-effect') return renderExplainerCauseEffect(data, revealPlan);
  if (template === 'explainer-analogy-bridge') return renderExplainerAnalogyBridge(data, revealPlan);
  if (template === 'explainer-data-proof') return renderExplainerDataProof(data, revealPlan);
  if (template === 'explainer-myth-fact') return renderExplainerMythFact(data, revealPlan);
  if (template === 'explainer-recap-outro') return renderExplainerRecapOutro(data, revealPlan);
  if (template === 'explainer-image-context') return renderExplainerImageContext(data, revealPlan);
  if (template === 'explainer-image-annotations') return renderExplainerImageAnnotations(data, revealPlan);
  if (template === 'explainer-image-zoom') return renderExplainerImageZoom(data, revealPlan);
  if (template === 'explainer-image-timeline') return renderExplainerImageTimeline(data, revealPlan);
  if (template === 'explainer-image-side-panel') return renderExplainerImageSidePanel(data, revealPlan);
  if (template === 'explainer-image-recap') return renderExplainerImageRecap(data, revealPlan);
  if (template === 'comparison-vs') return renderComparisonVs(data, revealPlan);
  if (template === 'feature-stack') return renderFeatureStack(data, revealPlan);
  if (template === 'stat-pill') return renderStatPill(data, revealPlan);
  if (template === 'hook') return renderHook(data, revealPlan);
  if (template === 'stat-hero') return renderStatHero(data, revealPlan);
  if (template === 'feature-list') return renderFeatureList(data, revealPlan);
  if (template === 'comparison') return renderComparison(data, revealPlan);
  if (template === 'outro') return renderOutro(data, revealPlan);
  return renderCallout(data, revealPlan);
}

function renderCryptoHero(data, visualSpec, revealPlan) {
  const elements = data.elements || [];
  const wallet = findElement(elements, 'wallet') || { x: 540, y: 910 };
  const card = findElement(elements, 'card') || { x: 540, y: 840 };
  const halo = findElement(elements, 'halo') || { x: 540, y: 840 };
  const icons = elements.filter(e => e.kind === 'icon').slice(0, 3);
  while (icons.length < 3) {
    icons.push([{ label: 'Cà phê', x: 265, y: 510 }, { label: 'Siêu thị', x: 540, y: 455 }, { label: 'Đặt xe', x: 815, y: 510 }][icons.length]);
  }

  return `
<div class="vp-bg"></div>
<div class="vp-bg-pattern"></div>
<div class="vp-shell">
  ${anim('title', revealPlan, 'vp-title', 'vp-drop', escapeHtml(data.title))}
  ${anim('wallet', revealPlan, 'vp-crypto-wallet', 'vp-rise', '', `style="${posStyle(wallet, revealPlan.wallet)}"`)}
  ${anim('halo', revealPlan, 'vp-halo', 'vp-halo', '', `style="${posStyle(halo, revealPlan.halo)}"`)}
  ${icons.map((icon, idx) => anim(`icon-${idx}`, revealPlan, 'vp-consumer-icon', 'vp-pop', iconGlyph(icon), `style="${posStyle(icon, revealPlan[`icon-${idx}`])}"`)).join('\n')}
  ${anim('card', revealPlan, 'vp-crypto-card', 'vp-pop', '', `data-label="${escapeAttr(data.cardLabel)}" style="${posStyle(card, revealPlan.card)}"`)}
  <div class="vp-stat-pill vp-anim" data-anim-key="stat-pill" style="${delayStyle(revealPlan['stat-pill'], 'vp-pop')}">
    <div class="vp-stat-main">${escapeHtml(data.statMain)}</div>
    <div class="vp-stat-sub">${escapeHtml(data.statSub)}</div>
  </div>
  ${data.note ? anim('note', revealPlan, 'vp-note', 'vp-right', escapeHtml(data.note)) : ''}
</div>`.trim();
}

function renderImageBackgroundHero(data, revealPlan) {
  const src = imageSource(data) || data.theme?.bgImage || '';
  const alt = data.image?.alt || data.title || data.image?.title || '';
  const overlayOpacity = clampNumber(data.overlay?.opacity ?? 0.56, 0, 0.9);
  return `
<div class="vp-photo-bg vp-anim" data-anim-key="photo-bg" style="${delayStyle(revealPlan['photo-bg'], 'vp-rise')}">
  ${src ? `<img class="vp-photo-bg-img" src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">` : '<div class="vp-bg"></div>'}
</div>
<div class="vp-photo-scrim" style="--vp-photo-overlay:${overlayOpacity.toFixed(2)}"></div>
<div class="vp-photo-copy">
  ${data.kicker ? anim('photo-kicker', revealPlan, 'vp-photo-kicker', 'vp-drop', escapeHtml(data.kicker)) : ''}
  ${anim('photo-title', revealPlan, 'vp-photo-title shimmer-sweep-target', 'vp-pop', escapeHtml(data.title))}
  ${data.subtitle ? anim('photo-subtitle', revealPlan, 'vp-photo-subtitle', 'vp-rise', escapeHtml(data.subtitle)) : ''}
  ${data.source ? anim('photo-source', revealPlan, 'vp-photo-source', 'vp-rise', escapeHtml(data.source)) : ''}
</div>`.trim();
}

function renderImageInsetCard(data, revealPlan) {
  const src = imageSource(data);
  const alt = data.image?.alt || data.image?.title || data.title || '';
  return `
<div class="vp-bg"></div><div class="vp-bg-pattern"></div>
<div class="vp-inset-layout">
  <div class="vp-inset-photo-card vp-anim" data-anim-key="inset-image" style="${delayStyle(revealPlan['inset-image'], 'vp-pop')}">
    ${src ? `<img class="vp-inset-photo" src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">` : '<div class="vp-inset-photo-placeholder"></div>'}
    <div class="vp-inset-photo-shine"></div>
  </div>
  <div class="vp-inset-text">
    ${data.kicker ? anim('inset-kicker', revealPlan, 'vp-card-kicker', 'vp-drop', escapeHtml(data.kicker)) : ''}
    ${anim('inset-title', revealPlan, 'vp-inset-title shimmer-sweep-target', 'vp-rise', escapeHtml(data.title))}
    ${data.body ? anim('inset-body', revealPlan, 'vp-inset-body', 'vp-rise', escapeHtml(data.body)) : ''}
    ${data.source ? anim('inset-source', revealPlan, 'vp-inset-source', 'vp-rise', escapeHtml(data.source)) : ''}
  </div>
</div>`.trim();
}

function renderMarketChart(data, revealPlan) {
  return `
<div class="vp-bg"></div><div class="vp-bg-pattern"></div>
<div class="vp-market-chart">
  ${anim('title', revealPlan, 'vp-title', 'vp-drop', escapeHtml(data.title))}
  <div class="vp-glass-panel vp-anim" data-anim-key="chart-panel" style="${delayStyle(revealPlan['chart-panel'], 'vp-rise')}">
    <svg class="vp-chart-svg" viewBox="0 0 900 660">
      <polyline class="vp-chart-line" points="30,560 180,470 330,500 500,320 680,260 850,110" style="${delayStyle(revealPlan['chart-line'], 'vp-rise')}" />
      <circle class="vp-chart-dot" cx="850" cy="110" r="24"></circle>
    </svg>
    <div class="vp-card-title">${escapeHtml(data.value)}</div>
    <div class="vp-card-body">${escapeHtml(data.context)}</div>
  </div>
</div>`.trim();
}

function renderNewsCard(data, revealPlan) {
  return `<div class="vp-bg"></div><div class="vp-bg-pattern"></div>
<div class="vp-news-card">
  <div class="vp-glass-panel vp-anim" data-anim-key="news-card" style="${delayStyle(revealPlan['news-card'], 'vp-rise')}">
    <div class="vp-card-kicker">${escapeHtml(data.kicker)}</div>
    <div class="vp-card-title">${escapeHtml(data.title)}</div>
    <div class="vp-card-body">${escapeHtml(data.body)}</div>
  </div>
</div>`.trim();
}

function renderBreakingNewsAlertOpener(data, revealPlan) {
  const meta = [data.location, data.timestamp].filter(Boolean).join(' / ');
  return `<div class="bn-bg"></div><div class="bn-grid"></div><div class="bn-scan"></div>
<div class="bn-alert-opener">
  ${anim('bn-kicker', revealPlan, 'bn-live-pill', 'vp-drop', `<span></span>${escapeHtml(data.kicker)}`)}
  ${anim('bn-headline', revealPlan, 'bn-alert-headline shimmer-sweep-target', 'vp-pop', escapeHtml(data.headline))}
  ${data.subhead ? anim('bn-subhead', revealPlan, 'bn-alert-subhead', 'vp-rise', escapeHtml(data.subhead)) : ''}
  ${meta ? anim('bn-meta', revealPlan, 'bn-alert-meta', 'vp-rise', escapeHtml(meta)) : ''}
</div>
<div class="bn-bottom-ticker"><span>TIN NÓNG</span><span>${escapeHtml(data.headline)}</span></div>`.trim();
}

function renderBreakingIssueComparison(data, revealPlan) {
  return `<div class="bn-bg"></div><div class="bn-grid"></div>
<div class="bn-compare">
  ${data.title ? anim('bn-title', revealPlan, 'bn-section-title', 'vp-drop', escapeHtml(data.title)) : ''}
  <div class="bn-compare-row">
    ${renderBreakingIssueSide(data.left, 'bn-left', 'left', revealPlan)}
    ${anim('bn-vs', revealPlan, 'bn-vs', 'vp-pop', 'VS')}
    ${renderBreakingIssueSide(data.right, 'bn-right', 'right', revealPlan)}
  </div>
  ${data.verdict ? anim('bn-verdict', revealPlan, 'bn-verdict', 'vp-rise', escapeHtml(data.verdict)) : ''}
</div>`.trim();
}

function renderBreakingIssueSide(side = {}, key, sideName, revealPlan) {
  const classes = `bn-issue-card bn-issue-${sideName}${side.winner ? ' is-winner' : ''}`;
  const detail = side.detail || (side.value && side.value !== side.title ? side.value : '');
  const stat = side.stat || side.status || '';
  return `<div class="${classes} vp-anim" data-anim-key="${escapeAttr(key)}" style="${delayStyle(revealPlan[key], sideName === 'left' ? 'vp-left' : 'vp-right')}">
    <div class="bn-issue-label">${escapeHtml(side.label)}</div>
    <div class="bn-issue-title">${escapeHtml(side.title || side.value)}</div>
    ${detail ? `<div class="bn-issue-detail">${escapeHtml(detail)}</div>` : ''}
    ${stat ? `<div class="bn-issue-stat">${escapeHtml(stat)}</div>` : ''}
  </div>`;
}

function renderBreakingBulletList(data, revealPlan) {
  const items = (data.items || []).slice(0, 5);
  return `<div class="bn-bg"></div><div class="bn-grid"></div>
<div class="bn-list-wrap">
  <div class="bn-list-card vp-anim" data-anim-key="bn-list-card" style="${delayStyle(revealPlan['bn-list-card'], 'vp-rise')}">
    <div class="bn-list-kicker">${escapeHtml(data.kicker)}</div>
    <div class="bn-list-title">${escapeHtml(data.title)}</div>
    <div class="bn-list-items">
      ${items.map((item, i) => `<div class="bn-list-item vp-anim" data-anim-key="bn-list-item-${i}" style="${delayStyle(revealPlan[`bn-list-item-${i}`], 'vp-left')}">
        <div class="bn-list-num">${escapeHtml(item.label || String(i + 1).padStart(2, '0'))}</div>
        <div><div class="bn-list-text">${escapeHtml(item.text || item.title || item)}</div>${item.detail ? `<div class="bn-list-detail">${escapeHtml(item.detail)}</div>` : ''}</div>
      </div>`).join('\n')}
    </div>
  </div>
</div>`.trim();
}

function renderBreakingTimeline(data, revealPlan) {
  const events = (data.events || []).slice(0, 5);
  return `<div class="bn-bg"></div><div class="bn-grid"></div>
<div class="bn-timeline">
  <div class="bn-list-kicker">${escapeHtml(data.kicker)}</div>
  ${anim('bn-timeline-title', revealPlan, 'bn-section-title', 'vp-drop', escapeHtml(data.title))}
  <div class="bn-timeline-line"></div>
  <div class="bn-timeline-events">
    ${events.map((event, i) => `<div class="bn-timeline-event vp-anim" data-anim-key="bn-event-${i}" style="${delayStyle(revealPlan[`bn-event-${i}`], 'vp-left')}">
      <div class="bn-event-time">${escapeHtml(event.time || String(i + 1))}</div>
      <div class="bn-event-dot"></div>
      <div class="bn-event-copy"><div class="bn-event-title">${escapeHtml(event.title || event.text)}</div>${event.detail ? `<div class="bn-event-detail">${escapeHtml(event.detail)}</div>` : ''}</div>
    </div>`).join('\n')}
  </div>
  ${data.source ? `<div class="bn-source-line">${escapeHtml(data.source)}</div>` : ''}
</div>`.trim();
}

function renderBreakingQuoteCard(data, revealPlan) {
  return `<div class="bn-bg"></div><div class="bn-grid"></div>
<div class="bn-quote-layout">
  <div class="bn-list-kicker">${escapeHtml(data.kicker)}</div>
  <div class="bn-quote-card vp-anim" data-anim-key="bn-quote" style="${delayStyle(revealPlan['bn-quote'], 'vp-rise')}">
    <div class="bn-quote-mark">&ldquo;</div>
    <div class="bn-quote-text">${escapeHtml(data.quote)}</div>
  </div>
  <div class="bn-speaker vp-anim" data-anim-key="bn-speaker" style="${delayStyle(revealPlan['bn-speaker'], 'vp-right')}">
    <div class="bn-speaker-name">${escapeHtml(data.speaker)}</div>
    ${data.role ? `<div class="bn-speaker-role">${escapeHtml(data.role)}</div>` : ''}
    ${data.source ? `<div class="bn-source-line">${escapeHtml(data.source)}</div>` : ''}
  </div>
  ${data.context ? anim('bn-quote-context', revealPlan, 'bn-quote-context', 'vp-rise', escapeHtml(data.context)) : ''}
</div>`.trim();
}

function renderBreakingVisualEvidence(data, revealPlan) {
  const src = imageSource(data);
  const alt = data.image?.alt || data.image?.title || data.title || '';
  return `<div class="bn-bg"></div><div class="bn-grid"></div>
<div class="bn-evidence">
  <div class="bn-evidence-media vp-anim" data-anim-key="bn-evidence-image" style="${delayStyle(revealPlan['bn-evidence-image'], 'vp-pop')}">
    ${src ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">` : '<div class="bn-evidence-placeholder"><span>ẢNH</span><strong>BẰNG CHỨNG</strong></div>'}
    <div class="bn-evidence-frame"></div>
  </div>
  <div class="bn-evidence-copy">
    <div class="bn-list-kicker">${escapeHtml(data.kicker)}</div>
    ${anim('bn-evidence-title', revealPlan, 'bn-evidence-title', 'vp-drop', escapeHtml(data.title))}
    ${data.caption ? anim('bn-evidence-caption', revealPlan, 'bn-evidence-caption', 'vp-rise', escapeHtml(data.caption)) : ''}
    ${data.source ? anim('bn-evidence-source', revealPlan, 'bn-source-line', 'vp-rise', escapeHtml(data.source)) : ''}
  </div>
</div>`.trim();
}

function renderBreakingKeyNumber(data, revealPlan) {
  return `<div class="bn-bg"></div><div class="bn-grid"></div>
<div class="bn-key-number">
  ${anim('bn-key-kicker', revealPlan, 'bn-live-pill', 'vp-drop', `<span></span>${escapeHtml(data.kicker)}`)}
  ${anim('bn-key-value', revealPlan, 'bn-key-value shimmer-sweep-target', 'vp-pop', escapeHtml(data.value))}
  ${anim('bn-key-label', revealPlan, 'bn-key-label', 'vp-rise', escapeHtml(data.label))}
  ${data.context ? anim('bn-key-context', revealPlan, 'bn-key-context', 'vp-rise', escapeHtml(data.context)) : ''}
  ${data.source ? `<div class="bn-source-line">${escapeHtml(data.source)}</div>` : ''}
</div>`.trim();
}

function renderBreakingFollowOutro(data, revealPlan) {
  return `<div class="bn-bg"></div><div class="bn-grid"></div>
<div class="bn-follow">
  ${anim('bn-follow-cta', revealPlan, 'bn-follow-cta', 'vp-drop', escapeHtml(data.ctaTop))}
  <div class="bn-follow-card vp-anim" data-anim-key="bn-follow-card" style="${delayStyle(revealPlan['bn-follow-card'], 'vp-rise')}">
    <div class="bn-follow-avatar">${escapeHtml((data.channelName || 'B').trim().slice(0, 1).toUpperCase())}</div>
    <div class="bn-follow-info">
      <div class="bn-follow-channel">${escapeHtml(data.channelName)}</div>
      <div class="bn-follow-handle">${escapeHtml(data.handle)}</div>
      <div class="bn-follow-subs">${escapeHtml(data.subscriberText)}</div>
    </div>
    <div class="bn-follow-button">Theo dõi</div>
  </div>
  ${data.summary ? anim('bn-follow-summary', revealPlan, 'bn-follow-summary', 'vp-rise', escapeHtml(data.summary)) : ''}
</div>`.trim();
}

function renderBreakingDataSnapshotChart(data, revealPlan) {
  const points = normalizeChartPoints(data.dataPoints);
  const labels = Array.isArray(data.labels) && data.labels.length ? data.labels : points.map((_, i) => `T${i + 1}`);
  return `<div class="bn-bg"></div><div class="bn-grid"></div>
<div class="bn-chart">
  ${anim('bn-chart-title', revealPlan, 'bn-section-title', 'vp-drop', escapeHtml(data.title))}
  ${data.subtitle ? `<div class="bn-chart-subtitle">${escapeHtml(data.subtitle)}</div>` : ''}
  <div class="bn-chart-panel vp-anim" data-anim-key="bn-chart-panel" style="${delayStyle(revealPlan['bn-chart-panel'], 'vp-rise')}">
    <svg class="bn-chart-svg" viewBox="0 0 850 620">
      <g class="bn-chart-grid">${[130, 250, 370, 490].map(y => `<line x1="64" y1="${y}" x2="790" y2="${y}"></line>`).join('')}</g>
      <g class="bn-bars">${points.map((point, i) => renderChartBar(point, i, points)).join('')}</g>
      <polyline class="bn-chart-polyline" points="${chartPolyline(points)}" style="${delayStyle(revealPlan['bn-chart-line'], 'vp-rise')}"></polyline>
      <circle class="bn-chart-last-dot" cx="${chartLastPoint(points).x}" cy="${chartLastPoint(points).y}" r="16"></circle>
    </svg>
    <div class="bn-chart-labels">${labels.slice(0, points.length).map(label => `<span>${escapeHtml(label)}</span>`).join('')}</div>
    <div class="bn-chart-metric vp-anim" data-anim-key="bn-chart-metric" style="${delayStyle(revealPlan['bn-chart-metric'], 'vp-pop')}">
      <strong>${escapeHtml(data.metric)}</strong><span>${escapeHtml(data.metricLabel)}</span>
    </div>
  </div>
  ${data.source ? `<div class="bn-source-line">${escapeHtml(data.source)}</div>` : ''}
</div>`.trim();
}

function normalizeChartPoints(points) {
  const values = Array.isArray(points) ? points.map(Number).filter(Number.isFinite).slice(0, 8) : [];
  return values.length >= 2 ? values : [18, 31, 26, 44, 62];
}

function chartPoint(point, index, points) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1, max - min);
  const x = 90 + (index / Math.max(1, points.length - 1)) * 680;
  const y = 540 - ((point - min) / range) * 390;
  return { x: Math.round(x), y: Math.round(y) };
}

function chartPolyline(points) {
  return points.map((point, index) => {
    const p = chartPoint(point, index, points);
    return `${p.x},${p.y}`;
  }).join(' ');
}

function chartLastPoint(points) {
  return chartPoint(points[points.length - 1], points.length - 1, points);
}

function renderChartBar(point, index, points) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1, max - min);
  const h = 110 + ((point - min) / range) * 300;
  const count = points.length;
  const gap = 22;
  const width = Math.max(48, (650 - gap * (count - 1)) / count);
  const x = 92 + index * (width + gap);
  const y = 540 - h;
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${h.toFixed(1)}" rx="14"></rect>`;
}

function renderBreakingSourceCheck(data, revealPlan) {
  const confirmed = (data.confirmed || []).slice(0, 4);
  const unverified = (data.unverified || []).slice(0, 4);
  return `<div class="bn-bg"></div><div class="bn-grid"></div>
<div class="bn-source-check">
  <div class="bn-list-kicker">${escapeHtml(data.kicker)}</div>
  ${anim('bn-source-title', revealPlan, 'bn-section-title', 'vp-drop', escapeHtml(data.title))}
  <div class="bn-source-columns">
    <div class="bn-source-col">
      <div class="bn-source-col-title">Đã xác nhận</div>
      ${confirmed.map((item, i) => `<div class="bn-check-item is-confirmed vp-anim" data-anim-key="bn-confirmed-${i}" style="${delayStyle(revealPlan[`bn-confirmed-${i}`], 'vp-left')}"><span></span><div>${escapeHtml(item.text || item.title || item)}</div></div>`).join('\n')}
    </div>
    <div class="bn-source-col">
      <div class="bn-source-col-title">Cần thận trọng</div>
      ${unverified.map((item, i) => `<div class="bn-check-item is-pending vp-anim" data-anim-key="bn-unverified-${i}" style="${delayStyle(revealPlan[`bn-unverified-${i}`], 'vp-right')}"><span></span><div>${escapeHtml(item.text || item.title || item)}</div></div>`).join('\n')}
    </div>
  </div>
  ${data.source ? `<div class="bn-source-line">${escapeHtml(data.source)}</div>` : ''}
</div>`.trim();
}

function renderBreakingLiveUpdateTicker(data, revealPlan) {
  const updates = (data.updates || []).slice(0, 5);
  return `<div class="bn-bg"></div><div class="bn-grid"></div><div class="bn-scan"></div>
<div class="bn-live-update">
  <div class="bn-live-top">
    <div class="bn-live-pill"><span></span>${escapeHtml(data.label)}</div>
    ${data.timestamp ? `<div class="bn-live-time">${escapeHtml(data.timestamp)}</div>` : ''}
  </div>
  ${anim('bn-ticker-headline', revealPlan, 'bn-live-headline shimmer-sweep-target', 'vp-pop', escapeHtml(data.headline))}
  <div class="bn-update-feed">
    ${updates.map((update, i) => `<div class="bn-update-row vp-anim" data-anim-key="bn-update-${i}" style="${delayStyle(revealPlan[`bn-update-${i}`], 'vp-left')}">
      <div class="bn-update-time">${escapeHtml(update.time || String(i + 1))}</div>
      <div class="bn-update-text">${escapeHtml(update.title || update.text)}</div>
    </div>`).join('\n')}
  </div>
  ${data.source ? `<div class="bn-source-line">${escapeHtml(data.source)}</div>` : ''}
</div>
<div class="bn-bottom-ticker"><span>CẬP NHẬT</span><span>${escapeHtml(data.headline)}</span></div>`.trim();
}

function renderBreakingLocationContext(data, revealPlan) {
  const src = imageSource(data);
  const facts = (data.facts || []).slice(0, 3);
  return `<div class="bn-bg"></div><div class="bn-grid"></div>
<div class="bn-location">
  <div class="bn-location-map vp-anim" data-anim-key="bn-location-image" style="${delayStyle(revealPlan['bn-location-image'], 'vp-pop')}">
    ${src ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(data.title || data.location || '')}">` : '<div class="bn-map-placeholder"><div></div><div></div><div></div></div>'}
    <div class="bn-map-pin"></div>
  </div>
  <div class="bn-location-copy">
    <div class="bn-list-kicker">${escapeHtml(data.kicker)}</div>
    ${anim('bn-location-title', revealPlan, 'bn-section-title', 'vp-drop', escapeHtml(data.title))}
    ${data.location ? `<div class="bn-location-name">${escapeHtml(data.location)}</div>` : ''}
    ${data.caption ? `<div class="bn-location-caption">${escapeHtml(data.caption)}</div>` : ''}
    ${facts.map((fact, i) => `<div class="bn-location-fact vp-anim" data-anim-key="bn-location-fact-${i}" style="${delayStyle(revealPlan[`bn-location-fact-${i}`], 'vp-left')}"><span>${i + 1}</span>${escapeHtml(fact.text || fact.title || fact)}</div>`).join('\n')}
    ${data.source ? `<div class="bn-source-line">${escapeHtml(data.source)}</div>` : ''}
  </div>
</div>`.trim();
}

function renderExplainerBase(content) {
  return `<div class="ex-bg"></div><div class="ex-grid"></div><div class="ex-ambient"></div><div class="ex-noise"></div>${content}`.trim();
}

function renderExplainerKicker(textValue, className = 'ex-kicker') {
  return textValue ? `<div class="${className}">${escapeHtml(textValue)}</div>` : '';
}

function renderExplainerConceptHook(data, revealPlan) {
  return renderExplainerBase(`
<div class="ex-concept">
  ${renderExplainerKicker(data.kicker)}
  ${anim('ex-title', revealPlan, 'ex-title shimmer-sweep-target', 'vp-pop', escapeHtml(data.title))}
  ${data.subtitle ? anim('ex-subtitle', revealPlan, 'ex-subtitle', 'vp-rise', escapeHtml(data.subtitle)) : ''}
  <div class="ex-term-row">
    <div class="ex-icon vp-anim" data-anim-key="ex-icon" style="${delayStyle(revealPlan['ex-term'], 'vp-pop')}">${explainerIcon(data.icon)}</div>
    ${anim('ex-term', revealPlan, 'ex-term', 'vp-left', escapeHtml(data.coreTerm))}
  </div>
  ${data.definition ? anim('ex-definition', revealPlan, 'ex-definition', 'vp-rise', escapeHtml(data.definition)) : ''}
</div>`);
}

function renderExplainerProblemSolution(data, revealPlan) {
  return renderExplainerBase(`
<div class="ex-split">
  ${anim('ex-split-title', revealPlan, 'ex-section-title', 'vp-drop', escapeHtml(data.title))}
  <div class="ex-split-row">
    ${renderExplainerPane(data.problem, 'ex-problem', 'problem', revealPlan)}
    ${anim('ex-bridge', revealPlan, 'ex-bridge', 'vp-pop', `<span>${escapeHtml(data.bridge || 'vì vậy')}</span>`)}
    ${renderExplainerPane(data.solution, 'ex-solution', 'solution', revealPlan)}
  </div>
</div>`);
}

function renderExplainerPane(pane = {}, key, tone, revealPlan) {
  return `<div class="ex-pane ex-pane-${tone} vp-anim" data-anim-key="${escapeAttr(key)}" style="${delayStyle(revealPlan[key], tone === 'problem' ? 'vp-left' : 'vp-right')}">
    <div class="ex-pane-label">${escapeHtml(pane.label)}</div>
    <div class="ex-pane-title">${escapeHtml(pane.title || pane.value)}</div>
    ${pane.detail ? `<div class="ex-pane-detail">${escapeHtml(pane.detail)}</div>` : ''}
    ${pane.stat ? `<div class="ex-pane-stat">${escapeHtml(pane.stat)}</div>` : ''}
  </div>`;
}

function renderExplainerProcessSteps(data, revealPlan) {
  const steps = (data.steps || []).slice(0, 5);
  return renderExplainerBase(`
<div class="ex-process">
  ${renderExplainerKicker(data.kicker)}
  ${anim('ex-process-title', revealPlan, 'ex-section-title', 'vp-drop', escapeHtml(data.title))}
  <div class="ex-step-list">
    ${steps.map((step, i) => `<div class="ex-step vp-anim" data-anim-key="ex-step-${i}" style="${delayStyle(revealPlan[`ex-step-${i}`], 'vp-left')}">
      <div class="ex-step-num">${escapeHtml(step.label || String(i + 1).padStart(2, '0'))}</div>
      <div class="ex-step-copy"><div class="ex-step-title">${escapeHtml(step.text || step.title)}</div>${step.detail ? `<div class="ex-step-detail">${escapeHtml(step.detail)}</div>` : ''}</div>
    </div>`).join('\n')}
  </div>
  ${data.result ? anim('ex-process-result', revealPlan, 'ex-result-pill', 'vp-rise', escapeHtml(data.result)) : ''}
</div>`);
}

function renderExplainerCauseEffect(data, revealPlan) {
  const causes = (data.causes || []).slice(0, 4);
  const effects = (data.effects || []).slice(0, 4);
  return renderExplainerBase(`
<div class="ex-causal">
  ${anim('ex-causal-title', revealPlan, 'ex-section-title', 'vp-drop', escapeHtml(data.title))}
  <div class="ex-causal-grid">
    <div class="ex-causal-col">
      <div class="ex-col-label">Nguyên nhân</div>
      ${causes.map((item, i) => renderExplainerChip(item, `ex-cause-${i}`, revealPlan, 'vp-left')).join('\n')}
    </div>
    ${anim('ex-causal-arrow', revealPlan, 'ex-causal-arrow', 'vp-pop', '&rarr;')}
    <div class="ex-causal-col">
      <div class="ex-col-label">Hệ quả</div>
      ${effects.map((item, i) => renderExplainerChip(item, `ex-effect-${i}`, revealPlan, 'vp-right')).join('\n')}
    </div>
  </div>
  ${data.insight ? anim('ex-causal-insight', revealPlan, 'ex-insight', 'vp-rise', escapeHtml(data.insight)) : ''}
</div>`);
}

function renderExplainerChip(item = {}, key, revealPlan, effect) {
  return `<div class="ex-chip vp-anim" data-anim-key="${escapeAttr(key)}" style="${delayStyle(revealPlan[key], effect)}">
    <span>${escapeHtml(item.label || '')}</span>
    <strong>${escapeHtml(item.text || item.title || item.value || item)}</strong>
    ${item.detail ? `<em>${escapeHtml(item.detail)}</em>` : ''}
  </div>`;
}

function renderExplainerAnalogyBridge(data, revealPlan) {
  return renderExplainerBase(`
<div class="ex-analogy-wrap">
  ${anim('ex-analogy-title', revealPlan, 'ex-section-title', 'vp-drop', escapeHtml(data.title))}
  <div class="ex-analogy-grid">
    ${renderExplainerAnalogyCard(data.abstract, 'ex-abstract', 'abstract', revealPlan)}
    ${anim('ex-analogy-bridge', revealPlan, 'ex-analogy-connector', 'vp-pop', `<span>${escapeHtml(data.bridge || 'cùng logic')}</span>`)}
    ${renderExplainerAnalogyCard(data.analogy, 'ex-analogy', 'analogy', revealPlan)}
  </div>
  ${data.takeaway ? anim('ex-analogy-takeaway', revealPlan, 'ex-insight', 'vp-rise', escapeHtml(data.takeaway)) : ''}
</div>`);
}

function renderExplainerAnalogyCard(card = {}, key, tone, revealPlan) {
  return `<div class="ex-analogy-card ex-analogy-${tone} vp-anim" data-anim-key="${escapeAttr(key)}" style="${delayStyle(revealPlan[key], tone === 'abstract' ? 'vp-left' : 'vp-right')}">
    <div class="ex-card-icon">${tone === 'abstract' ? '&#9712;' : '&#9783;'}</div>
    <div class="ex-pane-label">${escapeHtml(card.label)}</div>
    <div class="ex-pane-title">${escapeHtml(card.title || card.value)}</div>
    ${card.detail ? `<div class="ex-pane-detail">${escapeHtml(card.detail)}</div>` : ''}
  </div>`;
}

function renderExplainerDataProof(data, revealPlan) {
  const points = normalizeChartPoints(data.dataPoints);
  const labels = Array.isArray(data.labels) && data.labels.length ? data.labels : points.map((_, i) => `M${i + 1}`);
  return renderExplainerBase(`
<div class="ex-proof">
  ${renderExplainerKicker(data.kicker)}
  ${anim('ex-proof-title', revealPlan, 'ex-section-title', 'vp-drop', escapeHtml(data.title))}
  <div class="ex-proof-panel vp-anim" data-anim-key="ex-proof-chart" style="${delayStyle(revealPlan['ex-proof-chart'], 'vp-rise')}">
    <div class="ex-proof-metric vp-anim" data-anim-key="ex-proof-metric" style="${delayStyle(revealPlan['ex-proof-metric'], 'vp-pop')}">
      <strong>${escapeHtml(data.metric)}</strong><span>${escapeHtml(data.metricLabel)}</span>
    </div>
    <svg class="ex-proof-svg" viewBox="0 0 850 560">
      <g class="ex-proof-grid">${[120, 220, 320, 420].map(y => `<line x1="70" y1="${y}" x2="790" y2="${y}"></line>`).join('')}</g>
      <polyline class="ex-proof-line" points="${chartPolyline(points)}"></polyline>
      ${points.map((point, i) => {
        const p = chartPoint(point, i, points);
        return `<circle class="ex-proof-dot" cx="${p.x}" cy="${p.y}" r="${i === points.length - 1 ? 16 : 11}"></circle>`;
      }).join('')}
    </svg>
    <div class="ex-proof-labels">${labels.slice(0, points.length).map(label => `<span>${escapeHtml(label)}</span>`).join('')}</div>
  </div>
  ${data.insight ? anim('ex-proof-insight', revealPlan, 'ex-insight', 'vp-rise', escapeHtml(data.insight)) : ''}
</div>`);
}

function renderExplainerMythFact(data, revealPlan) {
  return renderExplainerBase(`
<div class="ex-mythfact">
  ${anim('ex-myth-title', revealPlan, 'ex-section-title', 'vp-drop', escapeHtml(data.title))}
  <div class="ex-mythfact-grid">
    ${renderExplainerMythFactCard(data.myth, 'ex-myth', 'myth', revealPlan)}
    ${renderExplainerMythFactCard(data.fact, 'ex-fact', 'fact', revealPlan)}
  </div>
  ${data.takeaway ? anim('ex-myth-takeaway', revealPlan, 'ex-insight', 'vp-rise', escapeHtml(data.takeaway)) : ''}
</div>`);
}

function renderExplainerMythFactCard(card = {}, key, tone, revealPlan) {
  return `<div class="ex-mf-card ex-mf-${tone} vp-anim" data-anim-key="${escapeAttr(key)}" style="${delayStyle(revealPlan[key], tone === 'myth' ? 'vp-left' : 'vp-right')}">
    <div class="ex-mf-mark">${tone === 'myth' ? '&times;' : '&#10003;'}</div>
    <div class="ex-pane-label">${escapeHtml(card.label)}</div>
    <div class="ex-pane-title">${escapeHtml(card.title || card.value)}</div>
    ${card.detail ? `<div class="ex-pane-detail">${escapeHtml(card.detail)}</div>` : ''}
  </div>`;
}

function renderExplainerRecapOutro(data, revealPlan) {
  const items = (data.takeaways || []).slice(0, 4);
  return renderExplainerBase(`
<div class="ex-recap">
  ${anim('ex-recap-title', revealPlan, 'ex-recap-title shimmer-sweep-target', 'vp-pop', escapeHtml(data.title))}
  <div class="ex-recap-items">
    ${items.map((item, i) => `<div class="ex-recap-item vp-anim" data-anim-key="ex-recap-item-${i}" style="${delayStyle(revealPlan[`ex-recap-item-${i}`], 'vp-left')}">
      <span>${escapeHtml(item.label || String(i + 1))}</span><strong>${escapeHtml(item.text || item.title || item)}</strong>
    </div>`).join('\n')}
  </div>
  ${anim('ex-recap-cta', revealPlan, 'ex-recap-cta', 'vp-rise', escapeHtml(data.cta))}
  ${anim('ex-recap-channel', revealPlan, 'ex-recap-channel', 'vp-pop', escapeHtml(data.channelName))}
</div>`);
}

function renderExplainerImageShell(data, key, className, revealPlan) {
  const src = imageSource(data);
  const alt = data.image?.alt || data.image?.title || data.title || '';
  return `<div class="${className} vp-anim" data-anim-key="${escapeAttr(key)}" style="${delayStyle(revealPlan[key], 'vp-rise')}">
    ${src ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">` : '<div class="ex-img-placeholder"><span>ẢNH</span><strong>MINH HỌA</strong></div>'}
  </div>`;
}

function renderExplainerImageContext(data, revealPlan) {
  const src = imageSource(data);
  const alt = data.image?.alt || data.image?.title || data.title || '';
  const overlayOpacity = clampNumber(data.overlay?.opacity ?? 0.62, 0, 0.9);
  return `<div class="ex-image-bg vp-anim" data-anim-key="ex-img-bg" style="${delayStyle(revealPlan['ex-img-bg'], 'vp-rise')}">
  ${src ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">` : '<div class="ex-img-placeholder is-full"><span>ẢNH</span><strong>BỐI CẢNH</strong></div>'}
</div>
<div class="ex-image-scrim" style="--ex-photo-overlay:${overlayOpacity.toFixed(2)}"></div>
<div class="ex-photo-motion"></div>
<div class="ex-image-context">
  ${renderExplainerKicker(data.kicker)}
  ${anim('ex-img-title', revealPlan, 'ex-title shimmer-sweep-target', 'vp-pop', escapeHtml(data.title))}
  ${data.subtitle ? anim('ex-img-subtitle', revealPlan, 'ex-subtitle', 'vp-rise', escapeHtml(data.subtitle)) : ''}
  ${data.caption ? anim('ex-img-caption', revealPlan, 'ex-image-caption', 'vp-rise', escapeHtml(data.caption)) : ''}
</div>`.trim();
}

function renderExplainerImageAnnotations(data, revealPlan) {
  const annotations = (data.annotations || []).slice(0, 4);
  return renderExplainerBase(`
<div class="ex-image-annotations">
  <div class="ex-image-header">
    ${renderExplainerKicker(data.kicker)}
    ${anim('ex-ann-title', revealPlan, 'ex-section-title', 'vp-drop', escapeHtml(data.title))}
  </div>
  <div class="ex-ann-stage">
    ${renderExplainerImageShell(data, 'ex-ann-image', 'ex-ann-media', revealPlan)}
    ${annotations.map((item, i) => `<div class="ex-ann-pin vp-anim" data-anim-key="ex-ann-pin-${i}" style="${delayStyle(revealPlan[`ex-ann-pin-${i}`], 'vp-pop')};--pin-x:${Number(item.x)}%;--pin-y:${Number(item.y)}%">
      <span>${escapeHtml(item.label || String(i + 1))}</span>
      <strong>${escapeHtml(item.text || item.title)}</strong>
    </div>`).join('\n')}
  </div>
  ${data.caption ? anim('ex-ann-caption', revealPlan, 'ex-image-caption', 'vp-rise', escapeHtml(data.caption)) : ''}
</div>`);
}

function renderExplainerImageZoom(data, revealPlan) {
  const lens = data.lens || { x: 58, y: 42, size: 250 };
  return renderExplainerBase(`
<div class="ex-image-zoom">
  <div class="ex-image-header">
    ${renderExplainerKicker(data.kicker)}
    ${anim('ex-zoom-title', revealPlan, 'ex-section-title', 'vp-drop', escapeHtml(data.title))}
  </div>
  <div class="ex-zoom-layout">
    <div class="ex-zoom-media-wrap">
      ${renderExplainerImageShell(data, 'ex-zoom-image', 'ex-zoom-media', revealPlan)}
      <div class="ex-zoom-lens vp-anim" data-anim-key="ex-zoom-lens" style="${delayStyle(revealPlan['ex-zoom-lens'], 'vp-pop')};--lens-x:${Number(lens.x)}%;--lens-y:${Number(lens.y)}%;--lens-size:${Number(lens.size)}px"><span>${escapeHtml(data.zoomLabel || 'zoom')}</span></div>
    </div>
    <div class="ex-zoom-detail vp-anim" data-anim-key="ex-zoom-detail" style="${delayStyle(revealPlan['ex-zoom-detail'], 'vp-right')}">
      <div class="ex-pane-label">${escapeHtml(data.detailTitle)}</div>
      <div class="ex-pane-detail">${escapeHtml(data.detail)}</div>
    </div>
  </div>
</div>`);
}

function renderExplainerImageTimeline(data, revealPlan) {
  const events = (data.events || []).slice(0, 4);
  const src = imageSource(data);
  const alt = data.image?.alt || data.image?.title || data.title || '';
  const overlayOpacity = clampNumber(data.overlay?.opacity ?? 0.58, 0, 0.9);
  return `<div class="ex-image-bg vp-anim" data-anim-key="ex-timeline-image" style="${delayStyle(revealPlan['ex-timeline-image'], 'vp-rise')}">
  ${src ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">` : '<div class="ex-img-placeholder is-full"><span>ẢNH</span><strong>DIỄN TIẾN</strong></div>'}
</div>
<div class="ex-image-scrim" style="--ex-photo-overlay:${overlayOpacity.toFixed(2)}"></div>
<div class="ex-photo-motion"></div>
<div class="ex-image-timeline">
  ${renderExplainerKicker(data.kicker)}
  ${anim('ex-img-timeline-title', revealPlan, 'ex-section-title', 'vp-drop', escapeHtml(data.title))}
  <div class="ex-img-events">
    ${events.map((event, i) => `<div class="ex-img-event vp-anim" data-anim-key="ex-img-event-${i}" style="${delayStyle(revealPlan[`ex-img-event-${i}`], 'vp-left')}">
      <span>${escapeHtml(event.time || String(i + 1).padStart(2, '0'))}</span>
      <strong>${escapeHtml(event.title || event.text)}</strong>
      ${event.detail ? `<em>${escapeHtml(event.detail)}</em>` : ''}
    </div>`).join('\n')}
  </div>
  ${data.caption ? anim('ex-img-timeline-caption', revealPlan, 'ex-image-caption', 'vp-rise', escapeHtml(data.caption)) : ''}
</div>`.trim();
}

function renderExplainerImageSidePanel(data, revealPlan) {
  const bullets = (data.bullets || []).slice(0, 3);
  return renderExplainerBase(`
<div class="ex-side">
  <div class="ex-image-header">
    ${renderExplainerKicker(data.kicker)}
    ${anim('ex-side-title', revealPlan, 'ex-section-title', 'vp-drop', escapeHtml(data.title))}
  </div>
  <div class="ex-side-layout">
    ${renderExplainerImageShell(data, 'ex-side-image', 'ex-side-media', revealPlan)}
    <div class="ex-side-panel vp-anim" data-anim-key="ex-side-panel" style="${delayStyle(revealPlan['ex-side-panel'], 'vp-right')}">
      <div class="ex-pane-label">${escapeHtml(data.panelTitle)}</div>
      <div class="ex-side-body">${escapeHtml(data.body)}</div>
      <div class="ex-side-bullets">
        ${bullets.map((item, i) => `<div class="ex-side-bullet vp-anim" data-anim-key="ex-side-bullet-${i}" style="${delayStyle(revealPlan[`ex-side-bullet-${i}`], 'vp-left')}"><span>${escapeHtml(item.label || String(i + 1))}</span><strong>${escapeHtml(item.text || item.title)}</strong></div>`).join('\n')}
      </div>
    </div>
  </div>
</div>`);
}

function renderExplainerImageRecap(data, revealPlan) {
  const items = (data.takeaways || []).slice(0, 3);
  return renderExplainerBase(`
<div class="ex-image-recap">
  <div class="ex-image-header">
    ${renderExplainerKicker(data.kicker)}
    ${anim('ex-img-recap-title', revealPlan, 'ex-section-title', 'vp-drop', escapeHtml(data.title))}
  </div>
  ${renderExplainerImageShell(data, 'ex-recap-image', 'ex-recap-media', revealPlan)}
  <div class="ex-img-recap-items">
    ${items.map((item, i) => `<div class="ex-img-recap-item vp-anim" data-anim-key="ex-img-recap-item-${i}" style="${delayStyle(revealPlan[`ex-img-recap-item-${i}`], 'vp-left')}"><span>${escapeHtml(item.label || String(i + 1))}</span><strong>${escapeHtml(item.text || item.title || item)}</strong></div>`).join('\n')}
  </div>
  ${data.cta ? anim('ex-img-recap-cta', revealPlan, 'ex-recap-cta', 'vp-rise', escapeHtml(data.cta)) : ''}
</div>`);
}

function renderComparisonVs(data, revealPlan) {
  return `<div class="vp-bg"></div><div class="vp-bg-pattern"></div>
<div class="vp-comparison-vs">
  ${renderComparison(data, revealPlan)}
</div>`.trim();
}

function renderFeatureStack(data, revealPlan) {
  return `<div class="vp-bg"></div><div class="vp-bg-pattern"></div>
<div class="vp-feature-stack">
  ${anim('title', revealPlan, 'vp-card-title', 'vp-drop', escapeHtml(data.title))}
  ${(data.bullets || []).slice(0, 4).map((item, i) => `
    <div class="vp-stack-item vp-anim" data-anim-key="stack-${i}" style="${delayStyle(revealPlan[`stack-${i}`], 'vp-left')}">
      <div class="vp-stack-num">${i + 1}</div><div>${escapeHtml(item)}</div>
    </div>`).join('\n')}
</div>`.trim();
}

function renderStatPill(data, revealPlan) {
  return `<div class="vp-bg"></div><div class="vp-bg-pattern"></div>
<div class="layout-stat-hero">
  ${anim('stat-value', revealPlan, 'stat-value shimmer-sweep-target', 'vp-pop', escapeHtml(data.value))}
  ${anim('stat-label', revealPlan, 'stat-label', 'vp-rise', escapeHtml(data.label))}
  ${data.context ? anim('stat-context', revealPlan, 'stat-context', 'vp-rise', escapeHtml(data.context)) : ''}
</div>`.trim();
}

function renderHook(data, revealPlan) {
  return `<div class="bg gradient-news-dark"></div><div class="overlay" style="opacity:.55"></div>
<div class="layout-hook">
  ${anim('hook-title', revealPlan, 'hook-headline shimmer-sweep-target', 'vp-pop', escapeHtml(data.headline || data.title || ''))}
  ${data.subhead ? anim('hook-sub', revealPlan, 'hook-subhead', 'vp-rise', escapeHtml(data.subhead)) : ''}
</div>`.trim();
}

function renderStatHero(data, revealPlan) {
  return `<div class="layout-stat-hero">
  ${anim('stat-value', revealPlan, 'stat-value shimmer-sweep-target', 'vp-pop', escapeHtml(data.value))}
  ${anim('stat-label', revealPlan, 'stat-label', 'vp-rise', escapeHtml(data.label))}
  ${data.context ? anim('stat-context', revealPlan, 'stat-context', 'vp-rise', escapeHtml(data.context)) : ''}
</div>`.trim();
}

function renderFeatureList(data, revealPlan) {
  return `<div class="layout-feature-list">
  <div class="feat-card vp-anim" data-anim-key="feature-card" style="${delayStyle(revealPlan['feature-card'], 'vp-rise')}">
    <div class="feat-title">${escapeHtml(data.title)}</div>
    <div class="feat-rule"></div>
    <div class="feat-bullets">
      ${(data.bullets || []).map((b, i) => `<div class="feat-bullet vp-anim" data-anim-key="feature-item-${i}" style="${delayStyle(revealPlan[`feature-item-${i}`], 'vp-left')}"><div class="feat-dot"></div><div class="feat-text">${escapeHtml(b)}</div></div>`).join('\n')}
    </div>
  </div>
</div>`.trim();
}

function renderComparison(data, revealPlan) {
  return `<div class="layout-comparison">
  <div class="cmp-card cmp-left color-cyan vp-anim" data-anim-key="cmp-left" style="${delayStyle(revealPlan['cmp-left'], 'vp-left')}"><div class="cmp-label">${escapeHtml(data.left.label)}</div><div class="cmp-value">${escapeHtml(data.left.value)}</div></div>
  <div class="cmp-vs vp-anim" data-anim-key="cmp-vs" style="${delayStyle(revealPlan['cmp-vs'], 'vp-pop')}">VS</div>
  <div class="cmp-card cmp-right color-purple vp-anim" data-anim-key="cmp-right" style="${delayStyle(revealPlan['cmp-right'], 'vp-right')}"><div class="cmp-label">${escapeHtml(data.right.label)}</div><div class="cmp-value">${escapeHtml(data.right.value)}</div></div>
</div>`.trim();
}

function renderCallout(data, revealPlan) {
  return `<div class="layout-callout">
  <div class="callout-card vp-anim" data-anim-key="callout-card" style="${delayStyle(revealPlan['callout-card'], 'vp-rise')}">
    ${data.tag ? `<div class="callout-tag">${escapeHtml(data.tag)}</div>` : ''}
    <div class="callout-statement">${escapeHtml(data.statement)}</div>
  </div>
</div>`.trim();
}

function renderOutro(data, revealPlan) {
  return `<div class="layout-outro">
  ${anim('out-cta', revealPlan, 'out-cta-top', 'vp-drop', escapeHtml(data.ctaTop))}
  ${anim('out-channel', revealPlan, 'out-channel shimmer-sweep-target', 'vp-pop', escapeHtml(data.channelName))}
  <div class="out-underline"></div>
  ${anim('out-source', revealPlan, 'out-source', 'vp-rise', escapeHtml(data.source))}
</div>`.trim();
}

function anim(key, plan, className, effect, content = '', attrs = '') {
  return `<div class="${className} vp-anim" data-anim-key="${escapeAttr(key)}" ${attrs || `style="${delayStyle(plan?.[key], effect)}"`}>${content}</div>`;
}

function renderTemplateSfx({ template, data, scene, revealPlan, duration }) {
  const clips = TEMPLATE_SFX[template] || [];
  if (!clips.length) return '';

  const entries = parseSRTEntries(scene?.srt);
  const exactWords = normalizeWordTimingList(scene?.wordTimings);
  const words = exactWords.length ? exactWords : buildApproxWordTimings(entries);
  const timings = data?.sfx && typeof data.sfx === 'object' && !Array.isArray(data.sfx) ? data.sfx : {};

  const audioTags = clips.map((clip, index) => {
    const src = resolveSfxFileUrl(clip.file);
    if (!src) return '';
    const revealKey = clip.revealKey || clip.key;
    const defaultAt = Number.isFinite(Number(revealPlan?.[revealKey]))
      ? Number(revealPlan[revealKey])
      : Number.isFinite(Number(clip.at))
      ? Number(clip.at)
      : 0.12;
    const start = clampRevealTime(resolveSfxTiming(timings[clip.key], defaultAt, words) + Number(clip.offset || 0), duration);
    const volume = clampNumber((clip.volume ?? 0.28) * SFX_VOLUME_GAIN, 0, 0.85);
    const clipDuration = clampNumber(clip.duration ?? SFX_DURATION_SEC[clip.file] ?? 0.5, 0.05, 10);
    const end = Math.min(duration, start + clipDuration);
    const effectiveDuration = Math.max(0.05, end - start);
    const trackIndex = Math.max(4, Number.isFinite(Number(clip.track)) ? Number(clip.track) : 4 + index);
    return `<audio id="sfx-${safeId(template)}-${safeId(clip.key)}-${index}"
      data-sfx-template="${escapeAttr(template)}"
      data-sfx-key="${escapeAttr(clip.key)}"
      data-start="${start.toFixed(3)}"
      data-end="${end.toFixed(3)}"
      data-duration="${effectiveDuration.toFixed(3)}"
      data-layer="${trackIndex}"
      data-track-index="${trackIndex}"
      data-volume="${volume.toFixed(2)}"
      preload="auto"
      src="${escapeAttr(src)}"></audio>`;
  }).filter(Boolean);

  return audioTags.length ? audioTags.join('\n    ') : '';
}

function resolveSfxFileUrl(relativeFile) {
  const file = path.join(SFX_DIR, relativeFile);
  if (!fs.existsSync(file)) return '';
  return `/assets/sfx/${String(relativeFile).split(/[\\/]+/).map(encodeURIComponent).join('/')}`;
}

function resolveSfxTiming(spec, fallback, words) {
  if (typeof spec === 'number') return Number.isFinite(spec) ? spec : fallback;
  if (typeof spec === 'string') {
    const trimmed = spec.trim();
    if (!trimmed) return fallback;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : findPhraseStart(trimmed, words, fallback);
  }
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    const numeric = Number(spec.at ?? spec.start ?? spec.time);
    if (Number.isFinite(numeric)) return numeric;
    const phrase = String(spec.phrase ?? spec.atPhrase ?? spec.timingPhrase ?? '').trim();
    if (phrase) return findPhraseStart(phrase, words, fallback);
  }
  return fallback;
}

function buildRevealPlan(template, data, scene, visualSpec, duration) {
  const entries = parseSRTEntries(scene?.srt);
  const exactWords = normalizeWordTimingList(scene?.wordTimings);
  const words = exactWords.length ? exactWords : buildApproxWordTimings(entries);
  const entryAt = (index, fallback) => Number.isFinite(entries[index]?.start) ? entries[index].start : fallback;
  const phraseAt = (phrase, fallback) => clampRevealTime(findPhraseStart(phrase, words, fallback), duration);
  const phraseFor = (key, fallbackText = '') => data.timingPhrases?.[key] || fallbackText;
  const orderAt = (needle, fallback) => {
    const order = Array.isArray(data.appearanceOrder) && data.appearanceOrder.length ? data.appearanceOrder : visualSpec.appearanceOrder;
    const idx = order.findIndex(item => normalizeMatchText(item).includes(normalizeMatchText(needle)));
    return idx >= 0 ? 0.25 + idx * 0.55 : fallback;
  };

  if (['crypto-card-hero', 'onchain-payment', 'payment-network-halo'].includes(template)) {
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, 0.12));
    const wallet = phraseAt(phraseFor('wallet', 'ví'), orderAt('wallet', orderAt('ví', entryAt(1, title + 0.7))));
    const card = phraseAt(phraseFor('card', 'thẻ crypto'), orderAt('card', orderAt('thẻ', wallet + 0.45)));
    const icon = phraseAt(phraseFor('icons', phraseFor('icon', 'cà phê')), orderAt('icons', orderAt('icon', card + 0.8)));
    const halo = phraseAt(phraseFor('halo', 'Visa on-chain'), orderAt('halo', Math.max(icon + 0.8, duration * 0.72)));
    const stat = phraseAt(phraseFor('stat', data.statMain || data.statSub), orderAt('stat', orderAt('badge', Math.max(card + 1.4, duration * 0.56))));
    return {
      title,
      wallet,
      card,
      'icon-0': icon,
      'icon-1': phraseAt(phraseFor('icon1', 'siêu thị'), icon + 0.08),
      'icon-2': phraseAt(phraseFor('icon2', 'xe'), icon + 0.16),
      halo,
      'stat-pill': stat,
      note: phraseAt(phraseFor('note', data.note), Math.max(halo + 0.25, stat + 0.35)),
    };
  }

  if (template === 'news-alert-opener') {
    const headline = phraseAt(phraseFor('headline', data.headline), entryAt(0, 0.24));
    return {
      'bn-kicker': phraseAt(phraseFor('kicker', data.kicker), 0.06),
      'bn-headline': headline,
      'bn-subhead': phraseAt(phraseFor('subhead', data.subhead), entryAt(1, headline + 0.72)),
      'bn-meta': phraseAt(phraseFor('timestamp', data.timestamp || data.location), entryAt(2, headline + 1.25)),
    };
  }

  if (template === 'issue-comparison') {
    const left = phraseAt(phraseFor('left', data.left?.title || data.left?.label), entryAt(0, 0.22));
    const right = phraseAt(phraseFor('right', data.right?.title || data.right?.label), entryAt(1, left + 0.78));
    return {
      'bn-title': phraseAt(phraseFor('title', data.title), 0.08),
      'bn-left': left,
      'bn-vs': Math.max(0.12, Math.min(right - 0.18, left + 0.38)),
      'bn-right': right,
      'bn-verdict': phraseAt(phraseFor('verdict', data.verdict), entryAt(2, right + 0.72)),
    };
  }

  if (template === 'news-bullet-list') {
    const card = phraseAt(phraseFor('title', data.title), entryAt(0, 0.14));
    const plan = { 'bn-list-card': card };
    (data.items || []).slice(0, 5).forEach((item, i) => {
      plan[`bn-list-item-${i}`] = phraseAt(phraseFor(`item${i + 1}`, item.text || item.title), entryAt(i + 1, card + 0.62 + i * 0.42));
    });
    return plan;
  }

  if (template === 'event-timeline') {
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, 0.12));
    const plan = { 'bn-timeline-title': title };
    (data.events || []).slice(0, 5).forEach((event, i) => {
      plan[`bn-event-${i}`] = phraseAt(phraseFor(`event${i + 1}`, event.title || event.text), entryAt(i + 1, title + 0.65 + i * 0.48));
    });
    return plan;
  }

  if (template === 'quote-card') {
    const quote = phraseAt(phraseFor('quote', data.quote), entryAt(0, 0.18));
    return {
      'bn-quote': quote,
      'bn-speaker': phraseAt(phraseFor('speaker', data.speaker), entryAt(1, quote + 0.82)),
      'bn-quote-context': phraseAt(phraseFor('context', data.context), entryAt(2, quote + 1.25)),
    };
  }

  if (template === 'visual-evidence') {
    const image = phraseAt(phraseFor('image', data.title || data.image?.title), entryAt(0, 0.12));
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, image + 0.42));
    return {
      'bn-evidence-image': image,
      'bn-evidence-title': title,
      'bn-evidence-caption': phraseAt(phraseFor('caption', data.caption), entryAt(1, title + 0.7)),
      'bn-evidence-source': phraseAt(phraseFor('source', data.source), entryAt(2, title + 1.2)),
    };
  }

  if (template === 'key-number') {
    const value = phraseAt(phraseFor('value', data.value), entryAt(0, 0.16));
    return {
      'bn-key-kicker': phraseAt(phraseFor('kicker', data.kicker), 0.08),
      'bn-key-value': value,
      'bn-key-label': phraseAt(phraseFor('label', data.label), value + 0.44),
      'bn-key-context': phraseAt(phraseFor('context', data.context), entryAt(1, value + 0.92)),
    };
  }

  if (template === 'follow-outro') {
    return {
      'bn-follow-cta': 0.12,
      'bn-follow-card': phraseAt(phraseFor('channelName', data.channelName), entryAt(0, 0.62)),
      'bn-follow-summary': phraseAt(phraseFor('summary', data.summary), entryAt(1, 1.45)),
    };
  }

  if (template === 'data-snapshot-chart') {
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, 0.12));
    return {
      'bn-chart-title': title,
      'bn-chart-panel': phraseAt(phraseFor('chart', data.subtitle || data.title), entryAt(1, title + 0.55)),
      'bn-chart-line': phraseAt(phraseFor('metric', data.metric), entryAt(2, title + 1.0)),
      'bn-chart-metric': phraseAt(phraseFor('metric', data.metric), entryAt(2, title + 1.12)),
    };
  }

  if (template === 'source-check') {
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, 0.14));
    const plan = { 'bn-source-title': title };
    (data.confirmed || []).slice(0, 4).forEach((item, i) => {
      plan[`bn-confirmed-${i}`] = phraseAt(phraseFor(`confirmed${i + 1}`, item.text || item.title), entryAt(i + 1, title + 0.62 + i * 0.35));
    });
    (data.unverified || []).slice(0, 4).forEach((item, i) => {
      plan[`bn-unverified-${i}`] = phraseAt(phraseFor(`unverified${i + 1}`, item.text || item.title), entryAt(i + 3, title + 1.05 + i * 0.35));
    });
    return plan;
  }

  if (template === 'live-update-ticker') {
    const headline = phraseAt(phraseFor('headline', data.headline), entryAt(0, 0.18));
    const plan = { 'bn-ticker-headline': headline };
    (data.updates || []).slice(0, 5).forEach((update, i) => {
      plan[`bn-update-${i}`] = phraseAt(phraseFor(`update${i + 1}`, update.title || update.text), entryAt(i + 1, headline + 0.68 + i * 0.42));
    });
    return plan;
  }

  if (template === 'location-context') {
    const image = phraseAt(phraseFor('map', data.location || data.title), entryAt(0, 0.12));
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, image + 0.45));
    const plan = {
      'bn-location-image': image,
      'bn-location-title': title,
    };
    (data.facts || []).slice(0, 3).forEach((fact, i) => {
      plan[`bn-location-fact-${i}`] = phraseAt(phraseFor(`fact${i + 1}`, fact.text || fact.title), entryAt(i + 1, title + 0.72 + i * 0.42));
    });
    return plan;
  }

  if (template === 'explainer-concept-hook') {
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, 0.12));
    return {
      'ex-title': title,
      'ex-subtitle': phraseAt(phraseFor('subtitle', data.subtitle), entryAt(1, title + 0.55)),
      'ex-term': phraseAt(phraseFor('coreTerm', data.coreTerm), entryAt(1, title + 0.8)),
      'ex-icon': phraseAt(phraseFor('coreTerm', data.coreTerm), entryAt(1, title + 0.8)),
      'ex-definition': phraseAt(phraseFor('definition', data.definition), entryAt(2, title + 1.25)),
    };
  }

  if (template === 'explainer-problem-solution') {
    const problem = phraseAt(phraseFor('problem', data.problem?.title || data.problem?.label), entryAt(0, 0.16));
    const solution = phraseAt(phraseFor('solution', data.solution?.title || data.solution?.label), entryAt(1, problem + 0.9));
    return {
      'ex-split-title': phraseAt(phraseFor('title', data.title), 0.08),
      'ex-problem': problem,
      'ex-bridge': phraseAt(phraseFor('bridge', data.bridge), Math.max(problem + 0.42, solution - 0.24)),
      'ex-solution': solution,
    };
  }

  if (template === 'explainer-process-steps') {
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, 0.12));
    const plan = { 'ex-process-title': title };
    (data.steps || []).slice(0, 5).forEach((step, i) => {
      plan[`ex-step-${i}`] = phraseAt(phraseFor(`step${i + 1}`, step.text || step.title), entryAt(i + 1, title + 0.58 + i * 0.42));
    });
    plan['ex-process-result'] = phraseAt(phraseFor('result', data.result), entryAt(5, title + 2.35));
    return plan;
  }

  if (template === 'explainer-cause-effect') {
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, 0.12));
    const plan = { 'ex-causal-title': title, 'ex-causal-arrow': entryAt(1, title + 0.85) };
    (data.causes || []).slice(0, 4).forEach((item, i) => {
      plan[`ex-cause-${i}`] = phraseAt(phraseFor(`cause${i + 1}`, item.text || item.title), entryAt(i + 1, title + 0.55 + i * 0.28));
    });
    (data.effects || []).slice(0, 4).forEach((item, i) => {
      plan[`ex-effect-${i}`] = phraseAt(phraseFor(`effect${i + 1}`, item.text || item.title), entryAt(i + 2, title + 1.05 + i * 0.28));
    });
    plan['ex-causal-insight'] = phraseAt(phraseFor('insight', data.insight), entryAt(5, title + 2.45));
    return plan;
  }

  if (template === 'explainer-analogy-bridge') {
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, 0.12));
    const abstract = phraseAt(phraseFor('abstract', data.abstract?.title || data.abstract?.label), entryAt(0, title + 0.58));
    const analogy = phraseAt(phraseFor('analogy', data.analogy?.title || data.analogy?.label), entryAt(1, abstract + 0.82));
    return {
      'ex-analogy-title': title,
      'ex-abstract': abstract,
      'ex-analogy-bridge': phraseAt(phraseFor('bridge', data.bridge), Math.max(abstract + 0.4, analogy - 0.2)),
      'ex-analogy': analogy,
      'ex-analogy-takeaway': phraseAt(phraseFor('takeaway', data.takeaway), entryAt(2, analogy + 0.72)),
    };
  }

  if (template === 'explainer-data-proof') {
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, 0.12));
    const chart = phraseAt(phraseFor('chart', data.title), entryAt(1, title + 0.55));
    return {
      'ex-proof-title': title,
      'ex-proof-chart': chart,
      'ex-proof-metric': phraseAt(phraseFor('metric', data.metric), entryAt(2, chart + 0.55)),
      'ex-proof-insight': phraseAt(phraseFor('insight', data.insight), entryAt(3, chart + 1.12)),
    };
  }

  if (template === 'explainer-myth-fact') {
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, 0.12));
    const myth = phraseAt(phraseFor('myth', data.myth?.title || data.myth?.label), entryAt(0, title + 0.55));
    const fact = phraseAt(phraseFor('fact', data.fact?.title || data.fact?.label), entryAt(1, myth + 0.9));
    return {
      'ex-myth-title': title,
      'ex-myth': myth,
      'ex-fact': fact,
      'ex-myth-takeaway': phraseAt(phraseFor('takeaway', data.takeaway), entryAt(2, fact + 0.65)),
    };
  }

  if (template === 'explainer-recap-outro') {
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, 0.12));
    const plan = { 'ex-recap-title': title };
    (data.takeaways || []).slice(0, 4).forEach((item, i) => {
      plan[`ex-recap-item-${i}`] = phraseAt(phraseFor(`item${i + 1}`, item.text || item.title), entryAt(i + 1, title + 0.58 + i * 0.34));
    });
    plan['ex-recap-cta'] = phraseAt(phraseFor('cta', data.cta), entryAt(4, title + 2.0));
    plan['ex-recap-channel'] = phraseAt(phraseFor('channelName', data.channelName), entryAt(5, title + 2.45));
    return plan;
  }

  if (template === 'explainer-image-context') {
    const image = phraseAt(phraseFor('image', data.image?.title || data.title), entryAt(0, 0.08));
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, image + 0.38));
    return {
      'ex-img-bg': image,
      'ex-img-title': title,
      'ex-img-subtitle': phraseAt(phraseFor('subtitle', data.subtitle), entryAt(1, title + 0.62)),
      'ex-img-caption': phraseAt(phraseFor('caption', data.caption), entryAt(2, title + 1.1)),
    };
  }

  if (template === 'explainer-image-annotations') {
    const image = phraseAt(phraseFor('image', data.image?.title || data.title), entryAt(0, 0.1));
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, image + 0.38));
    const plan = { 'ex-ann-image': image, 'ex-ann-title': title };
    (data.annotations || []).slice(0, 4).forEach((item, i) => {
      plan[`ex-ann-pin-${i}`] = phraseAt(phraseFor(`annotation${i + 1}`, item.text || item.title), entryAt(i + 1, title + 0.52 + i * 0.34));
    });
    plan['ex-ann-caption'] = phraseAt(phraseFor('caption', data.caption), entryAt(5, title + 1.9));
    return plan;
  }

  if (template === 'explainer-image-zoom') {
    const image = phraseAt(phraseFor('image', data.image?.title || data.title), entryAt(0, 0.1));
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, image + 0.38));
    const lens = phraseAt(phraseFor('zoomLabel', data.zoomLabel || data.detailTitle), entryAt(1, title + 0.62));
    return {
      'ex-zoom-image': image,
      'ex-zoom-title': title,
      'ex-zoom-lens': lens,
      'ex-zoom-detail': phraseAt(phraseFor('detail', data.detail || data.detailTitle), entryAt(2, lens + 0.55)),
    };
  }

  if (template === 'explainer-image-timeline') {
    const image = phraseAt(phraseFor('image', data.image?.title || data.title), entryAt(0, 0.08));
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, image + 0.42));
    const plan = { 'ex-timeline-image': image, 'ex-img-timeline-title': title };
    (data.events || []).slice(0, 4).forEach((event, i) => {
      plan[`ex-img-event-${i}`] = phraseAt(phraseFor(`event${i + 1}`, event.title || event.text), entryAt(i + 1, title + 0.52 + i * 0.38));
    });
    plan['ex-img-timeline-caption'] = phraseAt(phraseFor('caption', data.caption), entryAt(5, title + 2.05));
    return plan;
  }

  if (template === 'explainer-image-side-panel') {
    const image = phraseAt(phraseFor('image', data.image?.title || data.title), entryAt(0, 0.1));
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, image + 0.38));
    const panel = phraseAt(phraseFor('panelTitle', data.panelTitle), entryAt(1, title + 0.58));
    const plan = { 'ex-side-image': image, 'ex-side-title': title, 'ex-side-panel': panel };
    (data.bullets || []).slice(0, 3).forEach((item, i) => {
      plan[`ex-side-bullet-${i}`] = phraseAt(phraseFor(`bullet${i + 1}`, item.text || item.title), entryAt(i + 2, panel + 0.42 + i * 0.32));
    });
    return plan;
  }

  if (template === 'explainer-image-recap') {
    const image = phraseAt(phraseFor('image', data.image?.title || data.title), entryAt(0, 0.1));
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, image + 0.4));
    const plan = { 'ex-recap-image': image, 'ex-img-recap-title': title };
    (data.takeaways || []).slice(0, 3).forEach((item, i) => {
      plan[`ex-img-recap-item-${i}`] = phraseAt(phraseFor(`item${i + 1}`, item.text || item.title), entryAt(i + 1, title + 0.55 + i * 0.36));
    });
    plan['ex-img-recap-cta'] = phraseAt(phraseFor('cta', data.cta), entryAt(4, title + 1.9));
    return plan;
  }

  if (template === 'image-background-hero') {
    const image = phraseAt(phraseFor('image', data.image?.title || data.title), entryAt(0, 0.08));
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, image + 0.42));
    return {
      'photo-bg': image,
      'photo-kicker': Math.max(0.05, title - 0.22),
      'photo-title': title,
      'photo-subtitle': phraseAt(phraseFor('subtitle', data.subtitle), entryAt(1, title + 0.72)),
      'photo-source': Math.max(title + 1.1, duration - 2.2),
    };
  }

  if (template === 'image-inset-card') {
    const image = phraseAt(phraseFor('image', data.image?.title || data.title), entryAt(0, 0.12));
    const title = phraseAt(phraseFor('title', data.title), entryAt(0, image + 0.5));
    return {
      'inset-image': image,
      'inset-kicker': Math.max(0.05, title - 0.2),
      'inset-title': title,
      'inset-body': phraseAt(phraseFor('body', data.body), entryAt(1, title + 0.72)),
      'inset-source': Math.max(title + 1.0, duration - 2.1),
    };
  }

  if (template === 'market-chart') return { title: phraseAt(phraseFor('title', data.title), entryAt(0, 0.12)), 'chart-panel': entryAt(1, 0.75), 'chart-line': phraseAt(phraseFor('value', data.value), entryAt(2, 1.1)) };
  if (template === 'news-card') return { 'news-card': phraseAt(phraseFor('title', data.title), entryAt(0, 0.15)) };
  if (template === 'feature-stack') {
    const plan = { title: phraseAt(phraseFor('title', data.title), entryAt(0, 0.12)) };
    (data.bullets || []).slice(0, 4).forEach((b, i) => plan[`stack-${i}`] = phraseAt(b, entryAt(i + 1, 0.7 + i * 0.5)));
    return plan;
  }
  if (template === 'comparison-vs' || template === 'comparison') {
    const left = phraseAt(phraseFor('left', data.left?.value || data.left?.label), entryAt(0, 0.16));
    const right = phraseAt(phraseFor('right', data.right?.value || data.right?.label), entryAt(1, left + 0.72));
    return { 'cmp-left': left, 'cmp-vs': Math.max(0.12, Math.min(right - 0.18, left + 0.36)), 'cmp-right': right };
  }
  if (template === 'feature-list') {
    const card = phraseAt(data.title, entryAt(0, 0.12));
    const plan = { 'feature-card': card };
    (data.bullets || []).slice(0, 4).forEach((b, i) => plan[`feature-item-${i}`] = phraseAt(b, entryAt(i + 1, card + 0.65 + i * 0.45)));
    return plan;
  }
  if (template === 'outro') return { 'out-cta': 0.12, 'out-channel': entryAt(0, 0.55), 'out-source': Math.max(1.2, duration - 3.1) };
  if (template === 'hook') {
    const title = phraseAt(phraseFor('headline', data.headline), entryAt(0, 0.12));
    return { 'hook-title': title, 'hook-sub': phraseAt(phraseFor('subhead', data.subhead), entryAt(1, title + 0.75)) };
  }
  if (template === 'stat-hero' || template === 'stat-pill') {
    const value = phraseAt(phraseFor('value', data.value), entryAt(0, 0.14));
    return { 'stat-value': value, 'stat-label': phraseAt(phraseFor('label', data.label), value + 0.42), 'stat-context': phraseAt(phraseFor('context', data.context), entryAt(1, value + 0.9)) };
  }
  return { 'callout-card': phraseAt(phraseFor('statement', data.statement), entryAt(0, 0.18)) };
}

function renderShell({ channel, source, aspect }) {
  return '';
}

function buildStyles(ar, theme) {
  const css = readTemplate('styles.css');
  return `:root{--vp-stage-w:${ar.w}px;--vp-stage-h:${ar.h}px;--vp-bg-top:${theme.bgTop || '#111827'};--vp-bg-bottom:${theme.bgBottom || '#2563eb'};--vp-accent:${theme.accent || '#06b6d4'};--vp-mint:${theme.mint || '#22c55e'}}\n${css}`;
}

function delayStyle(value, effect = 'vp-rise') {
  const delay = clampRevealTime(value, 180);
  return `--vp-delay:${delay.toFixed(3)}s;--vp-effect:${effect}`;
}

function posStyle(item, revealAt) {
  const x = Number.isFinite(Number(item?.x)) ? Number(item.x) : 540;
  const y = Number.isFinite(Number(item?.y)) ? Number(item.y) : 840;
  return `${delayStyle(revealAt, 'vp-pop')};left:${Math.round(x)}px;top:${Math.round(y)}px`;
}

function findElement(elements, kind) {
  return (elements || []).find(e => e.kind === kind);
}

function iconGlyph(icon) {
  const text = normalizeMatchText(icon?.label || icon?.raw || '');
  if (/ca phe|coffee|ly/.test(text)) return '&#9749;';
  if (/sieu thi|gio|cart|shop/.test(text)) return '&#128722;';
  if (/xe|car|app|dat xe/.test(text)) return '&#128663;';
  return '&#9679;';
}

function explainerIcon(value) {
  const text = normalizeMatchText(value);
  if (/data|chart|proof|so lieu/.test(text)) return '&#8756;';
  if (/process|step|flow|quy trinh/.test(text)) return '&#8594;';
  if (/myth|fact|truth|su that/.test(text)) return '&#10003;';
  if (/analogy|vi du|bridge/.test(text)) return '&#8776;';
  if (/problem|warning|risk|van de/.test(text)) return '!';
  return '&#10022;';
}

function imageSource(data = {}) {
  return String(data?.image?.src || data?.image?.imageUrl || data?.theme?.bgImage || '').trim();
}

function parseXY(text) {
  const match = String(text || '').match(/\bx\s*=\s*(-?\d+(?:\.\d+)?)\s*y\s*=\s*(-?\d+(?:\.\d+)?)/i);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: null, y: null };
}

function parseColor(text) {
  const hex = String(text || '').match(/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/i)?.[0];
  if (hex) return hex;
  const normalized = normalizeMatchText(text);
  for (const [name, color] of Object.entries(NAMED_COLORS)) {
    if (normalized.includes(name)) return color;
  }
  return '';
}

function parseOpacity(text) {
  const pct = String(text || '').match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
  if (pct) return Math.max(0, Math.min(1, Number(pct) / 100));
  const decimal = String(text || '').match(/opacity\s*(?:=|:)?\s*(0?\.\d+|1(?:\.0+)?)/i)?.[1];
  return decimal ? Number(decimal) : null;
}

function splitNumberedItems(raw) {
  return normalizeText(raw)
    .split(/\s*(?=\(\d+\)\s*)/g)
    .map(item => item.trim().replace(/;$/, ''))
    .filter(Boolean);
}

function inferElementKind(text) {
  const n = normalizeMatchText(text);
  if (/vi da|wallet/.test(n)) return 'wallet';
  if (/the crypto|the thanh toan|card/.test(n)) return 'card';
  if (/halo|visa|on chain|mang/.test(n)) return 'halo';
  if (/icon|ca phe|sieu thi|xe|app|gio/.test(n)) return 'icon';
  if (/badge|pill|so lieu/.test(n)) return 'stat';
  return 'object';
}

function extractTimingPhrase(text) {
  const clean = normalizeText(text).replace(/^\(?\d+\)?\s*/, '');
  return clean.split(/\s+(?:tai|x\s*=|mau|dat|nghieng)\b/i)[0].trim();
}

function inferTextRole(text, raw) {
  const n = normalizeMatchText(text);
  const context = normalizeMatchText(raw);
  if (/(?:\d|%|\$|usd|vnd|trieu|ty)/.test(n)) return /visa|on chain/.test(n) ? 'note' : 'stat';
  if (/visa|on chain|nguon|source/.test(n)) return 'note';
  if (/tren cung|title|tieu de|headline/.test(context) || text.length <= 36) return 'title';
  return 'body';
}

function pickOverlayText(visualSpec, predicate) {
  return visualSpec.textOverlay.find(predicate)?.text || '';
}

function readTemplate(file) {
  return fs.readFileSync(path.join(TPL_DIR, file), 'utf8');
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

function srtToSec(t) {
  const match = String(t || '').match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) return NaN;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

function clampRevealTime(value, duration) {
  const n = Number(value);
  const dur = Number(duration);
  const max = Math.max(0.05, (Number.isFinite(dur) ? dur : 6) - 0.35);
  if (!Number.isFinite(n)) return 0.12;
  return Math.max(0.05, Math.min(max, n));
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function extractPhrases(text) {
  return normalizeText(text)
    .split(/(?:[.!?…]+|\s+-\s+|,\s+|\s+nhung\s+|\s+tuy nhien\s+)/i)
    .map(s => s.trim())
    .filter(Boolean);
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
    if (bullets.length >= 4) break;
  }
  while (bullets.length < 3) bullets.push(['Bối cảnh rõ ràng', 'Điểm nhấn chính', 'Kết luận dễ nhớ'][bullets.length]);
  return bullets;
}

function splitComparison(voice, visual) {
  const source = normalizeText(voice || visual);
  const parts = source.split(/\s+(?:so với|với|vs|VS|và|nhưng|còn)\s+/).map(s => truncateSmart(s, 26)).filter(Boolean);
  if (parts.length >= 2) return [{ label: 'Bên A', value: parts[0] }, { label: 'Bên B', value: parts[1] }];
  return [{ label: 'Trước', value: truncateSmart(extractPhrases(source)[0] || 'Vấn đề', 24) }, { label: 'Sau', value: truncateSmart(extractPhrases(source)[1] || 'Giải pháp', 24) }];
}

function visualKeyword(visual) {
  return truncateSmart(normalizeText(visual)
    .replace(/(?:background|main elements|appearance order|text overlay|layout)\s*:?/ig, '')
    .replace(/[→|]/g, ' '), 44);
}

function buildImageQuery(text, mode = 'illustration') {
  const cleaned = normalizeMatchText(text)
    .split(/\s+/)
    .filter(word => word.length > 2 && !/^(mot|hai|ba|cac|cho|voi|nay|kia|khi|thi|la|va|nhung|trong|tren|duoi)$/.test(word))
    .slice(0, 8)
    .join(' ');
  const base = cleaned || 'business technology finance';
  return mode === 'background'
    ? `"${base}" photo OR editorial -logo -icon`
    : `"${base}" chart OR infographic OR photo -logo -icon`;
}

function extractNumber(text) {
  const match = String(text || '').match(/(?:[$€£¥₫]\s*)?[+-]?\d[\d.,]*(?:\s*(?:%|x|lần|tỷ|triệu|nghìn|k|m|b|usd|vnd))?/i);
  return match ? match[0].replace(/\s+/g, ' ').trim() : '';
}

function extractKeyTerm(text) {
  const quoted = String(text || '').match(/["“”']([^"“”']{3,40})["“”']/)?.[1];
  if (quoted) return quoted.trim();
  const clean = normalizeText(text);
  const match = clean.match(/\b(?:là|về|gọi là|khái niệm|concept)\s+([^,.!?;:]{3,40})/i)?.[1];
  if (match) return match.trim();
  return extractPhrases(clean).find(item => item.length >= 8 && item.length <= 34) || '';
}

function removeFirstNumber(text, value) {
  if (!value) return text;
  return normalizeText(text).replace(value, '').replace(/\s{2,}/g, ' ').trim();
}

function truncateSmart(text, max = 40) {
  const clean = normalizeText(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max + 1);
  const idx = cut.lastIndexOf(' ');
  return `${clean.slice(0, idx > max * .55 ? idx : max).trim()}...`;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9%$€£¥₫-]+/g, ' ')
    .trim();
}

function safeId(value) {
  return String(value || 'x').replace(/[^a-zA-Z0-9_-]/g, '-');
}

function backgroundImageValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'none';
  return `url("${raw.replace(/["\\]/g, '\\$&')}")`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, '&#96;');
}
