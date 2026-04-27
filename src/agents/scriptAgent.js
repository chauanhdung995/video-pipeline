// src/agents/scriptAgent.js - Bước 2: Tạo kịch bản JSON
import { callAI } from '../services/aiRouter.js';

const WORD_TARGETS_BY_SCENE_DURATION = {
  5:  24,
  7:  34,
  10: 48,
  12: 58,
  15: 72,
  20: 96,
};

function buildDurationPlan(videoDurationSec = 120, sceneDurationSec = 15) {
  const safeVideoDurationSec = [60, 120, 180, 240, 300].includes(Number(videoDurationSec)) ? Number(videoDurationSec) : 120;
  const sceneDurationRules = {
    60:  [5, 7, 10],
    120: [7, 10, 12, 15],
    180: [5, 7, 10, 12, 15],
    240: [10, 12, 15, 20],
    300: [10, 12, 15, 20],
  };
  const allowedSceneDurations = sceneDurationRules[safeVideoDurationSec] || [7, 10, 12, 15];
  // Ưu tiên 15s > 12s > 10s > 7s > 5s > 20s khi cần chọn mặc định
  const preferredSceneDuration = [15, 12, 10, 7, 5, 20].find(d => allowedSceneDurations.includes(d)) ?? allowedSceneDurations[0];
  const safeSceneDurationSec = allowedSceneDurations.includes(Number(sceneDurationSec))
    ? Number(sceneDurationSec)
    : preferredSceneDuration;
  const sceneCount = Math.max(1, Math.ceil(safeVideoDurationSec / safeSceneDurationSec));
  const wordsPerScene = WORD_TARGETS_BY_SCENE_DURATION[safeSceneDurationSec]
    ?? Math.max(12, Math.round(safeSceneDurationSec * 4.8));
  const minWordsPerScene = Math.max(10, wordsPerScene - 4);
  const maxWordsPerScene = wordsPerScene + 6;
  const totalWordsTarget = sceneCount * wordsPerScene;
  const structureGuide = safeVideoDurationSec >= 240
    ? 'Structure: introduction, main points grouped by topic, short illustrative examples, closing summary.'
    : safeVideoDurationSec >= 120
    ? 'Structure: hook → 2-3 clearly developed main points → concise conclusion.'
    : 'Structure: fast hook, brief development, tight message close.';
  return {
    safeVideoDurationSec,
    safeSceneDurationSec,
    sceneCount,
    wordsPerScene,
    minWordsPerScene,
    maxWordsPerScene,
    totalWordsTarget,
    structureGuide,
  };
}

const VOICE_PROMPT = `You are a Vietnamese educational video scriptwriter.

Write the voice narration for the topic: "{{TOPIC}}"

{{PROJECT_ASSETS_BLOCK}}

DURATION PARAMETERS:
- Total: ~{{VIDEO_DURATION_SEC}}s | Per scene: ~{{SCENE_DURATION_SEC}}s | Scene count: {{SCENE_COUNT}}
- Words/scene: {{MIN_WORDS_PER_SCENE}}-{{MAX_WORDS_PER_SCENE}} words (target ~{{WORDS_PER_SCENE}} words)
- {{STRUCTURE_GUIDE}}
- TTS reads faster than written text — write ENOUGH words, never cut below the minimum

REQUIREMENTS:
- EXACTLY {{SCENE_COUNT}} scenes, numbered 1→{{SCENE_COUNT}}
- Each scene 1-3 sentences, concise, clear rhythm, natural conversational tone
- Videos ≥3 min: introduce issue → explain → example → conclusion

LANGUAGE: All "voice" content MUST be written in Vietnamese.

RETURN JSON:
{
  "scenes":[{"stt":1,"voice":"...","assets":[]}],
  "thumbnail":{"title":"Short powerful title in Vietnamese","prompt":"Static cinematic thumbnail description: background, subject, text overlay, layout."}
}
RETURN JSON ONLY.`;

const VISUAL_PROMPT = `You are a visual director for {{RATIO_LABEL}} ({{W}}×{{H}}px) video animation.

APPROVED VOICE SCRIPT (write visuals matching each scene):
{{VOICE_SCENES}}

STYLE GUIDE (MUST use these colors and visual identity; do not use crypto dark navy+gold if domain is different):
{{STYLE_GUIDE}}

PREFERRED LAYOUTS FOR {{RATIO_LABEL}}: {{PREFERRED_LAYOUTS}}

TASK: Write DETAILED "visual" descriptions for EACH scene. Every visual MUST include all 4 parts:
1. BACKGROUND: color/gradient/pattern per domain style guide
2. MAIN ELEMENTS (≤5 elements): specific names + exact on-screen positions
3. APPEARANCE ORDER: sequence using "→" (which appears first; simultaneous items noted explicitly)
4. TEXT OVERLAY: short keywords/numbers (no long sentences), position, color

MANDATORY RULES:
• Each scene = DIFFERENT layout pattern — do not repeat 2 consecutive scenes: HERO / SPLIT / STACK / ORBIT / CHART / PHONE MOCKUP / DASHBOARD / VERSUS / REVEAL
• Colors MUST follow style guide — never use crypto dark navy on non-crypto domains
• Ambient background chosen to match domain and scene mood
• Visuals directly tied to keywords in the voice — never generic

RETURN JSON:
{"scenes":[{"stt":1,"visual":"..."}]}
RETURN JSON ONLY.`;

const AR_LABELS = {
  '9:16': { w: 1080, h: 1920, label: 'portrait, TikTok/Reels' },
  '16:9': { w: 1920, h: 1080, label: 'landscape, YouTube' },
  '1:1':  { w: 1080, h: 1080, label: 'square, Instagram' },
  '4:5':  { w: 1080, h: 1350, label: 'portrait, Instagram Portrait' },
};

const PREFERRED_LAYOUTS = {
  '9:16': 'HERO, STACK, PHONE MOCKUP, REVEAL, ORBIT',
  '16:9': 'SPLIT, TIMELINE, CHART, DASHBOARD, VERSUS',
  '1:1':  'HERO, ORBIT, STACK, REVEAL',
  '4:5':  'HERO, STACK, PHONE MOCKUP, REVEAL',
};

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

function normalizeScenesInput(input) {
  const script = extractScenesArray(input);
  if (!script.length) throw new Error('JSON kịch bản đang rỗng');

  return script.map((scene, index) => {
    const stt = Number(scene?.stt ?? index + 1);
    const voice = String(scene?.voice ?? '').trim();
    const visual = String(scene?.visual ?? '').trim();
    const ttsVoice = scene?.ttsVoice == null ? undefined : String(scene.ttsVoice).trim();
    const assets = Array.isArray(scene?.assets)
      ? scene.assets.map(item => String(item ?? '').trim()).filter(Boolean)
      : [];

    if (!Number.isInteger(stt) || stt < 1) {
      throw new Error(`Cảnh ${index + 1} có "stt" không hợp lệ`);
    }
    if (!voice) {
      throw new Error(`Cảnh ${stt} thiếu "voice"`);
    }
    if (!visual) {
      throw new Error(`Cảnh ${stt} thiếu "visual"`);
    }

    return {
      stt,
      voice,
      visual,
      ttsVoice: ttsVoice || voice,
      assets,
    };
  });
}

function normalizeThumbnailInput(input, scenes) {
  const fallbackTitle = String(input?.title ?? scenes?.[0]?.voice ?? '').trim().slice(0, 120) || 'Thumbnail video';
  const prompt = String(input?.prompt ?? '').trim();
  if (!prompt) return null;
  return {
    title: fallbackTitle,
    prompt,
  };
}

export function normalizeUserScriptInput(input) {
  const scenes = normalizeScenesInput(input);
  const thumbnail = normalizeThumbnailInput(input?.thumbnail, scenes);
  return { scenes, thumbnail };
}

function normalizeVoiceScenes(input) {
  const arr = extractScenesArray(input);
  if (!arr.length) throw new Error('JSON voice rỗng');
  return arr.map((scene, index) => {
    const stt = Number(scene?.stt ?? index + 1);
    const voice = String(scene?.voice ?? '').trim();
    const assets = Array.isArray(scene?.assets)
      ? scene.assets.map(item => String(item ?? '').trim()).filter(Boolean)
      : [];
    if (!Number.isInteger(stt) || stt < 1) throw new Error(`Cảnh ${index + 1} có "stt" không hợp lệ`);
    if (!voice) throw new Error(`Cảnh ${stt} thiếu "voice"`);
    return { stt, voice, ttsVoice: voice, assets };
  });
}

function normalizeVisualScenes(input) {
  const arr = extractScenesArray(input);
  return arr.map((scene, index) => ({
    stt: Number(scene?.stt ?? index + 1),
    visual: String(scene?.visual ?? '').trim(),
  })).filter(s => s.visual);
}

// Tạo voice cho toàn bộ kịch bản — export riêng để orchestrator có thể chạy song song với TTS
export async function generateVoice({ topic, keys, onLog, projectAssets = [], videoDurationSec = 120, sceneDurationSec = 15 }) {
  const plan = buildDurationPlan(videoDurationSec, sceneDurationSec);
  onLog?.(`Voice: "${topic}" | ${plan.sceneCount} cảnh x ${plan.safeSceneDurationSec}s`);

  let assetsBlock = '';
  if (projectAssets.length) {
    const list = projectAssets.map(a => `${a.name} | ${a.type} | ${a.aspectRatio}`).join('\n');
    assetsBlock = `PROJECT ASSETS (assign to appropriate scenes — names must be exact):\n${list}\nAdd "assets":[] to each scene. Each asset appears in 1-2 scenes.`;
  }

  const voicePromptFilled = VOICE_PROMPT
    .replace('{{TOPIC}}', topic)
    .replaceAll('{{VIDEO_DURATION_SEC}}', String(plan.safeVideoDurationSec))
    .replaceAll('{{SCENE_DURATION_SEC}}', String(plan.safeSceneDurationSec))
    .replaceAll('{{SCENE_COUNT}}', String(plan.sceneCount))
    .replaceAll('{{WORDS_PER_SCENE}}', String(plan.wordsPerScene))
    .replaceAll('{{MIN_WORDS_PER_SCENE}}', String(plan.minWordsPerScene))
    .replaceAll('{{MAX_WORDS_PER_SCENE}}', String(plan.maxWordsPerScene))
    .replace('{{STRUCTURE_GUIDE}}', plan.structureGuide)
    .replace('{{PROJECT_ASSETS_BLOCK}}', assetsBlock);

  let voiceScenes, thumbnail;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const retry = attempt > 1 ? `\n\nNOTE: MUST return exactly ${plan.sceneCount} scenes.` : '';
    const { result } = await callAI({ prompt: voicePromptFilled + retry, isJson: true, keys, onLog });
    voiceScenes = normalizeVoiceScenes(result);
    thumbnail = normalizeThumbnailInput(result?.thumbnail, voiceScenes);
    if (voiceScenes.length === plan.sceneCount) break;
    onLog?.(`Voice: ${voiceScenes.length} cảnh, mục tiêu ${plan.sceneCount}${attempt < 2 ? ' — thử lại' : ''}`);
  }
  if (!voiceScenes?.length) throw new Error('Không tạo được voice');
  onLog?.(`✓ Voice: ${voiceScenes.length} cảnh`);

  const fallbackThumb = `Static thumbnail for video "${topic}". Cinematic layout, clear subject, short text overlay.`;
  return {
    voiceScenes,
    thumbnail: thumbnail || { title: topic.slice(0, 120), prompt: fallbackThumb },
  };
}

// Tạo visual từ voice đã có — export riêng để orchestrator chạy song song với TTS
export async function generateVisuals({ voiceScenes, keys, onLog, styleGuide = '', outputAspectRatio = '9:16' }) {
  onLog?.('Visual: đang tạo...');
  const ar = AR_LABELS[outputAspectRatio] || AR_LABELS['9:16'];
  const voiceScenesText = voiceScenes.map(s => `Cảnh ${s.stt}: "${s.voice}"`).join('\n');
  const visualPromptFilled = VISUAL_PROMPT
    .replaceAll('{{RATIO_LABEL}}', ar.label)
    .replaceAll('{{W}}', ar.w)
    .replaceAll('{{H}}', ar.h)
    .replace('{{VOICE_SCENES}}', voiceScenesText)
    .replace('{{STYLE_GUIDE}}', styleGuide || 'Choose a palette fitting the topic. Do not use crypto gold if the domain is unrelated.')
    .replace('{{PREFERRED_LAYOUTS}}', PREFERRED_LAYOUTS[outputAspectRatio] || PREFERRED_LAYOUTS['9:16']);

  try {
    const { result } = await callAI({ prompt: visualPromptFilled, isJson: true, keys, onLog });
    const visualScenes = normalizeVisualScenes(result);
    onLog?.(`✓ Visual: ${visualScenes.length} cảnh`);
    return visualScenes;
  } catch (e) {
    onLog?.(`⚠ Visual thất bại (${e.message}) — dùng fallback`);
    return [];
  }
}

// Ghép voice + visual thành scenes hoàn chỉnh
export function mergeScenes(voiceScenes, visualScenes) {
  return voiceScenes.map(vs => ({
    ...vs,
    visual: visualScenes.find(v => v.stt === vs.stt)?.visual
      || `Domain-appropriate background. Hero text: main keyword from scene ${vs.stt} voice. Fade in from center.`,
  }));
}

// Wrapper tuần tự — dùng khi không cần tối ưu song song
export async function generateScript({ topic, keys, onLog, projectAssets = [], videoDurationSec = 120, sceneDurationSec = 15, styleGuide = '', outputAspectRatio = '9:16' }) {
  onLog?.(`Tạo kịch bản: "${topic}"`);
  const { voiceScenes, thumbnail } = await generateVoice({ topic, keys, onLog, projectAssets, videoDurationSec, sceneDurationSec });
  const visualScenes = await generateVisuals({ voiceScenes, keys, onLog, styleGuide, outputAspectRatio });
  return { scenes: mergeScenes(voiceScenes, visualScenes), thumbnail };
}
