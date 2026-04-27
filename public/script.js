// public/script.js
'use strict';

// ─── Aspect ratio configs ─────────────────────────────────────────────────────
const ASPECT_RATIOS = {
  '9:16': { w: 1080, h: 1920, cssRatio: '9/16', gridMinW: 160, modalPreviewW: 430 },
  '16:9': { w: 1920, h: 1080, cssRatio: '16/9', gridMinW: 300, modalPreviewW: 520 },
  '1:1':  { w: 1080, h: 1080, cssRatio: '1/1',  gridMinW: 200, modalPreviewW: 430 },
  '4:5':  { w: 1080, h: 1350, cssRatio: '4/5',  gridMinW: 180, modalPreviewW: 410 },
};

function applyAIProviderUI(provider) {
  $('groupChato1').classList.toggle('hidden', provider !== 'chato1');
  $('groupGemini').classList.toggle('hidden', provider !== 'gemini');
  $('groupOpenAI').classList.toggle('hidden', provider !== 'openai');
}

function applyTTSProviderUI(provider) {
  const current = provider === 'vbee' ? 'vbee' : 'lucylab';
  $('groupLucyLab').classList.toggle('hidden', current !== 'lucylab');
  $('groupLucyVoice').classList.toggle('hidden', current !== 'lucylab');
  $('groupVbeeKey').classList.toggle('hidden', current !== 'vbee');
  $('groupVbeeAppId').classList.toggle('hidden', current !== 'vbee');
  $('groupVbeeVoiceCode').classList.toggle('hidden', current !== 'vbee');
}

function applyAspectRatioCSS(key) {
  const ar = ASPECT_RATIOS[key] || ASPECT_RATIOS['9:16'];
  activeAspectRatio = ASPECT_RATIOS[key] ? key : '9:16';
  const r  = document.documentElement;
  r.style.setProperty('--out-w',             ar.w + 'px');
  r.style.setProperty('--out-h',             ar.h + 'px');
  r.style.setProperty('--out-ar',            ar.cssRatio);
  r.style.setProperty('--out-w-num',         ar.w);
  r.style.setProperty('--out-h-num',         ar.h);
  r.style.setProperty('--grid-min-w',        ar.gridMinW + 'px');
  r.style.setProperty('--editor-preview-w',  ar.modalPreviewW + 'px');
  requestAnimationFrame(updateAllPreviewScales);
}

function getActiveAspectRatioConfig() {
  return ASPECT_RATIOS[activeAspectRatio] || ASPECT_RATIOS['9:16'];
}

function updateIframeScale(iframe, wrapper) {
  if (!iframe || !wrapper) return;
  const ar = getActiveAspectRatioConfig();
  const width = wrapper.clientWidth;
  const height = wrapper.clientHeight;
  if (!width || !height || !ar.w || !ar.h) return;
  if (wrapper.classList.contains('preview-wrap-large')) {
    iframe.style.transform = `scale(${Math.min(width / ar.w, height / ar.h)})`;
    return;
  }
  const scaleX = width / ar.w;
  const scaleY = height / ar.h;
  iframe.style.transform = `scale(${Math.min(scaleX, scaleY)})`;
}

function updateAllPreviewScales() {
  document.querySelectorAll('.iframe-wrap iframe').forEach(iframe => {
    updateIframeScale(iframe, iframe.closest('.iframe-wrap'));
  });
  updateIframeScale($('previewFrame'), $('previewFrame')?.closest('.preview-wrap'));
}

function getProjectAspectRatio(project) {
  return project?.output_aspect_ratio || project?.outputAspectRatio || '9:16';
}

// ─── State ────────────────────────────────────────────────────────────────────
let chato1Keys          = [];
let geminiKeys          = [];
let openaiKeys          = [];
let currentId           = null;
let editingStt          = null;
let editingTargetType   = 'scene';
let ws                  = null;
let editorBusy          = false;
let projectAssets       = []; // { file, name, type, aspectRatio, filename }
let selectedAspectRatio = '9:16';
let activeAspectRatio   = '9:16';
let selectedAIProvider  = 'chato1';
let selectedStyleId     = null; // null = default (id 1)
let regeneratingScenes  = new Set();

const $ = id => document.getElementById(id);
const VIDEO_DURATION_OPTIONS = [60, 120, 180, 240, 300];
const SCENE_DURATION_OPTIONS = [5, 7, 10, 12, 15, 20];
const WORD_TARGETS_DISPLAY = { 5:24, 7:34, 10:48, 12:58, 15:72, 20:96 };
const SCENE_DURATION_RULES = {
  60:  [5, 7, 10],
  120: [7, 10, 12, 15],
  180: [5, 7, 10, 12, 15],
  240: [10, 12, 15, 20],
  300: [10, 12, 15, 20],
};

// ─── WebSocket ────────────────────────────────────────────────────────────────
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.sessionId !== currentId) return;
    handleWS(msg);
  };
  ws.onclose = () => setTimeout(connectWS, 2000);
}

const STEP_LABELS = { 2:'B2 Kịch bản', 4:'B4 TTS+SRT', 5:'B5 HTML', 6:'B6 Render', 7:'B7 Ghép video' };

function handleWS(msg) {
  if (msg.type === 'progress') {
    appendLog(`[B${msg.step}] ${msg.msg}`);
    if (msg.detail) {
      setCurrentOp(msg.step, msg.msg);
      return;
    }
    setStep(msg.step, 'active');
    for (let i = 2; i < msg.step; i++) setStep(i, 'done');
    setCurrentOp(msg.step, msg.msg);
    if (msg.subtype === 'preview_ready') {
      setStep(5, 'done');
      clearCurrentOp();
      showPreviewReady();
      refreshProject();
      updateSidebar();
    }
    if (msg.done) { setStep(7, 'done'); clearCurrentOp(); showFinalVideo(); refreshProject(); updateSidebar(); }
  } else if (msg.type === 'scene_regenerated') {
    regeneratingScenes.delete(Number(msg.stt));
    reloadSceneCard(msg.stt);
    reloadPreviewIfOpen(msg.stt);
    appendLog(`✓ Tạo lại HTML cảnh ${msg.stt} hoàn thành`);
    clearCurrentOp();
    editorBusy = false;
  } else if (msg.type === 'scenes_ready') {
    refreshProject();
  } else if (msg.type === 'scene_html_ready') {
    reloadSceneCard(msg.stt);
    appendLog(`✓ HTML cảnh ${msg.stt} xong`);
  } else if (msg.type === 'scene_render_done') {
    reloadSceneCard(msg.stt);
    appendLog(`✓ Render cảnh ${msg.stt} xong`);
    clearCurrentOp();
    editorBusy = false;
    resetEditorButtons();
    refreshProject();
  } else if (msg.type === 'thumbnail_html_ready' || msg.type === 'thumbnail_image_ready') {
    reloadThumbnailCard();
    appendLog(`✓ Thumbnail ${msg.type === 'thumbnail_image_ready' ? 'ảnh' : 'HTML'} xong`);
  } else if (msg.type === 'thumbnail_updated' || msg.type === 'thumbnail_regenerated') {
    reloadThumbnailCard();
    reloadPreviewIfOpen('thumbnail');
    appendLog('✓ Thumbnail đã được cập nhật');
    clearCurrentOp();
    editorBusy = false;
    resetEditorButtons();
    refreshProject();
  } else if (msg.type === 'error') {
    clearRegeneratingSceneFromError(msg.msg);
    appendLog(`✗ LỖI: ${msg.msg}`);
    document.querySelectorAll('.step.active').forEach(el => el.classList.replace('active', 'error'));
    clearCurrentOp();
    editorBusy = false;
    resetEditorButtons();
  }
}

function clearRegeneratingSceneFromError(message) {
  const matched = String(message || '').match(/cảnh\s+(\d+)/i);
  if (!matched) return;
  const stt = Number(matched[1]);
  if (!regeneratingScenes.has(stt)) return;
  regeneratingScenes.delete(stt);
  reloadSceneCard(stt);
}

function markSceneHtmlBusy(stt, logMessage = '') {
  const sceneStt = Number(stt);
  if (!Number.isFinite(sceneStt)) return;
  regeneratingScenes.add(sceneStt);
  reloadSceneCard(sceneStt);
  if (logMessage) appendLog(logMessage);
}

function unmarkSceneHtmlBusy(stt) {
  const sceneStt = Number(stt);
  if (!Number.isFinite(sceneStt)) return;
  if (!regeneratingScenes.has(sceneStt)) return;
  regeneratingScenes.delete(sceneStt);
  reloadSceneCard(sceneStt);
}

function setCurrentOp(step, msg) {
  const el = $('currentOp');
  el.classList.remove('hidden');
  $('currentOpText').textContent = `${STEP_LABELS[step] ?? `B${step}`} — ${msg}`;
}
function clearCurrentOp() { $('currentOp').classList.add('hidden'); }

// ─── Settings ─────────────────────────────────────────────────────────────────
const LS_KEYS_KEY      = 'pipeline_chato1_keys';
const LS_LOGO_KEY      = 'pipeline_logo_name';
const LS_TTS_PROVIDER  = 'pipeline_tts_provider';
const LS_LUCYLAB_KEY   = 'pipeline_lucylab_key';
const LS_VOICE_ID      = 'pipeline_voice_id';
const LS_VBEE_KEY      = 'pipeline_vbee_key';
const LS_VBEE_APP_ID   = 'pipeline_vbee_app_id';
const LS_VBEE_VOICE    = 'pipeline_vbee_voice_code';
const LS_ASPECT_RATIO  = 'pipeline_aspect_ratio';
const LS_AI_PROVIDER   = 'pipeline_ai_provider';
const LS_GEMINI_KEYS   = 'pipeline_gemini_keys';
const LS_OPENAI_KEYS   = 'pipeline_openai_keys';
const LS_SUBTITLES     = 'pipeline_enable_subtitles';
const LS_VIDEO_DURATION = 'pipeline_video_duration';
const LS_SCENE_DURATION = 'pipeline_scene_duration';
const LS_TTS_SPEED      = 'pipeline_tts_speed';
const SCRIPT_SAMPLE = document.getElementById('scriptSampleContent')?.value || '';

function getDurationPlan(videoDurationSec, sceneDurationSec) {
  const safeVideoDuration = VIDEO_DURATION_OPTIONS.includes(videoDurationSec) ? videoDurationSec : 120;
  const allowedSceneDurations = SCENE_DURATION_RULES[safeVideoDuration] || SCENE_DURATION_OPTIONS;
  const fallbackSceneDuration = [15, 12, 10, 7, 5, 20].find(d => allowedSceneDurations.includes(d)) ?? allowedSceneDurations[0];
  const safeSceneDuration = allowedSceneDurations.includes(sceneDurationSec) ? sceneDurationSec : fallbackSceneDuration;
  const sceneCount = Math.max(1, Math.ceil(safeVideoDuration / safeSceneDuration));
  const wordsPerScene = WORD_TARGETS_DISPLAY[safeSceneDuration] ?? Math.max(8, Math.round(safeSceneDuration * 4.8));
  return { videoDurationSec: safeVideoDuration, sceneDurationSec: safeSceneDuration, sceneCount, wordsPerScene, allowedSceneDurations };
}

function syncSceneDurationOptions() {
  const videoDurationSec = Number($('videoDuration').value);
  const allowedSceneDurations = SCENE_DURATION_RULES[videoDurationSec] || SCENE_DURATION_OPTIONS;
  const sceneSelect = $('sceneDuration');
  [...sceneSelect.options].forEach(option => {
    const value = Number(option.value);
    option.disabled = !allowedSceneDurations.includes(value);
    option.hidden = !allowedSceneDurations.includes(value);
  });

  if (!allowedSceneDurations.includes(Number(sceneSelect.value))) {
    const preferred = [15, 12, 10, 7, 5, 20].find(d => allowedSceneDurations.includes(d)) ?? allowedSceneDurations[0];
    sceneSelect.value = String(preferred);
  }
}

function updateDurationSummary() {
  const plan = getDurationPlan(Number($('videoDuration').value), Number($('sceneDuration').value));
  const pacingNote = plan.videoDurationSec >= 300
    ? 'Video 5 phút: dùng cảnh dài 12-20 giây để trình bày ý sâu, giữ mạch nội dung ổn định.'
    : plan.videoDurationSec >= 240
    ? 'Video 4 phút: cảnh 12-20 giây cho phép giải thích rõ ràng từng luận điểm.'
    : plan.videoDurationSec >= 120
    ? 'Video 2 phút: cảnh 10-15 giây — nhịp vừa đủ để người xem tiếp thu tốt.'
    : 'Video 1 phút: cảnh ngắn 5-10 giây để tối ưu retention và nhịp nhanh.';
  $('durationSummary').textContent = `Ước tính ${plan.sceneCount} cảnh, ~${plan.wordsPerScene} từ/cảnh. ${pacingNote}`;
}

function detectInputMode(raw) {
  const text = String(raw || '').trim();
  if (!text) return { topic: '', scriptJson: null, isManualScript: false };

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { topic: text, scriptJson: null, isManualScript: false };
  }

  const scenes = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.scenes)
      ? parsed.scenes
      : Array.isArray(parsed?.script)
        ? parsed.script
        : null;
  if (!Array.isArray(scenes) || !scenes.length) {
    throw new Error('Nếu nhập JSON, nội dung phải có mảng "scenes" không rỗng hoặc là một array cảnh');
  }

  scenes.forEach((scene, index) => {
    const label = `Cảnh ${Number(scene?.stt ?? index + 1) || index + 1}`;
    if (!Number.isInteger(Number(scene?.stt ?? index + 1)) || Number(scene?.stt ?? index + 1) < 1) {
      throw new Error(`${label}: "stt" phải là số nguyên dương`);
    }
    if (!String(scene?.voice ?? '').trim()) {
      throw new Error(`${label}: thiếu "voice"`);
    }
    if (!String(scene?.visual ?? '').trim()) {
      throw new Error(`${label}: thiếu "visual"`);
    }
    if (scene?.assets != null && !Array.isArray(scene.assets)) {
      throw new Error(`${label}: "assets" phải là mảng nếu có`);
    }
  });

  if (parsed?.thumbnail != null) {
    if (typeof parsed.thumbnail !== 'object' || Array.isArray(parsed.thumbnail)) {
      throw new Error('"thumbnail" phải là object nếu có');
    }
    if (!String(parsed.thumbnail.prompt ?? '').trim()) {
      throw new Error('Thumbnail thiếu "prompt"');
    }
  }

  return { topic: '', scriptJson: text, isManualScript: true };
}

function openScriptSample() {
  $('scriptSampleModal').showModal();
}

async function copyScriptSample() {
  try {
    await navigator.clipboard.writeText(SCRIPT_SAMPLE);
    $('topic').value = SCRIPT_SAMPLE;
    $('scriptSampleModal').close();
  } catch {
    alert('Không thể sao chép tự động. Bạn có thể copy trực tiếp từ cửa sổ mẫu.');
  }
}

async function initSettings() {
  const savedKeys = localStorage.getItem(LS_KEYS_KEY);
  if (savedKeys) {
    try {
      chato1Keys = JSON.parse(savedKeys);
      renderKeyCount();
    } catch {}
  }

  const savedLucylabKey = localStorage.getItem(LS_LUCYLAB_KEY);
  if (savedLucylabKey) $('lucylabKey').value = savedLucylabKey;

  const savedVoiceId = localStorage.getItem(LS_VOICE_ID);
  if (savedVoiceId) $('voiceId').value = savedVoiceId;

  const savedVbeeKey = localStorage.getItem(LS_VBEE_KEY);
  if (savedVbeeKey) $('vbeeKey').value = savedVbeeKey;

  const savedVbeeAppId = localStorage.getItem(LS_VBEE_APP_ID);
  if (savedVbeeAppId) $('vbeeAppId').value = savedVbeeAppId;

  const savedVbeeVoiceCode = localStorage.getItem(LS_VBEE_VOICE);
  if (savedVbeeVoiceCode) $('vbeeVoiceCode').value = savedVbeeVoiceCode;

  const savedTTSProvider = localStorage.getItem(LS_TTS_PROVIDER) || 'lucylab';
  $('ttsProvider').value = savedTTSProvider;
  applyTTSProviderUI(savedTTSProvider);

  const savedAR = localStorage.getItem(LS_ASPECT_RATIO) || '9:16';
  selectedAspectRatio = savedAR;
  $('outputAspectRatio').value = savedAR;
  applyAspectRatioCSS(savedAR);

  const savedProvider = localStorage.getItem(LS_AI_PROVIDER) || 'chato1';
  selectedAIProvider = savedProvider;
  $('aiProvider').value = savedProvider;
  applyAIProviderUI(savedProvider);

  const savedGeminiKeys = localStorage.getItem(LS_GEMINI_KEYS);
  if (savedGeminiKeys) {
    try { geminiKeys = JSON.parse(savedGeminiKeys); renderGeminiCount(); } catch {}
  }

  const savedOpenAIKeys = localStorage.getItem(LS_OPENAI_KEYS);
  if (savedOpenAIKeys) {
    try { openaiKeys = JSON.parse(savedOpenAIKeys); renderOpenAICount(); } catch {}
  }

  const savedSubtitles = localStorage.getItem(LS_SUBTITLES);
  if (savedSubtitles !== null) $('enableSubtitles').value = savedSubtitles;

  const savedVideoDuration = Number(localStorage.getItem(LS_VIDEO_DURATION));
  $('videoDuration').value = String(VIDEO_DURATION_OPTIONS.includes(savedVideoDuration) ? savedVideoDuration : 120);

  const savedSceneDuration = Number(localStorage.getItem(LS_SCENE_DURATION));
  $('sceneDuration').value = String(SCENE_DURATION_OPTIONS.includes(savedSceneDuration) ? savedSceneDuration : 15);
  syncSceneDurationOptions();
  updateDurationSummary();

  const savedTTSSpeed = localStorage.getItem(LS_TTS_SPEED);
  if (savedTTSSpeed) $('ttsSpeed').value = savedTTSSpeed;

  const cachedLogoName = localStorage.getItem(LS_LOGO_KEY);
  if (cachedLogoName) $('logoName').textContent = cachedLogoName;

  try {
    const s = await api('/api/settings');
    applySettingsFromServer(s);
  } catch {}

  await loadStyles();
}

// ─── Style management ─────────────────────────────────────────────────────────

async function loadStyles() {
  try {
    const styles = await api('/api/styles');
    const sel = $('styleSelect');
    sel.innerHTML = '';
    for (const s of styles) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      opt.title = s.description || '';
      sel.appendChild(opt);
    }
    // Restore saved selection
    const saved = localStorage.getItem('pipeline_style_id');
    if (saved && [...sel.options].some(o => o.value === saved)) {
      sel.value = saved;
    }
    selectedStyleId = Number(sel.value) || null;
    updateDeleteStyleBtn();
  } catch {}
}

function updateDeleteStyleBtn() {
  const btn = $('btnDeleteStyle');
  // Hide delete button for style id=1 (built-in default)
  btn.style.display = (selectedStyleId && selectedStyleId !== 1) ? 'block' : 'none';
}

async function generateStyle() {
  const domain = $('styleDomainInput').value.trim();
  if (!domain) return alert('Nhập lĩnh vực / chủ đề');
  if (selectedAIProvider === 'chato1' && !chato1Keys.length) return alert('Thiếu Chato1 API keys');
  if (selectedAIProvider === 'gemini' && !geminiKeys.length) return alert('Thiếu Gemini API keys');
  if (selectedAIProvider === 'openai' && !openaiKeys.length) return alert('Thiếu OpenAI API keys');

  const btn = $('btnGenStyle');
  const status = $('styleGenStatus');
  btn.disabled = true;
  btn.textContent = '⏳ Đang tạo...';
  status.textContent = 'AI đang tạo phong cách — có thể mất 15-30 giây...';

  try {
    const data = await api('/api/styles/generate', 'POST', {
      domain,
      aiProvider: selectedAIProvider,
      chato1Keys: selectedAIProvider === 'chato1' ? chato1Keys : [],
      geminiKeys: selectedAIProvider === 'gemini' ? geminiKeys : [],
      openaiKeys: selectedAIProvider === 'openai' ? openaiKeys : [],
    });
    if (data.error) throw new Error(data.error);
    status.textContent = `✓ Đã tạo: "${data.name}"`;
    await loadStyles();
    // Auto-select the new style
    $('styleSelect').value = data.id;
    selectedStyleId = data.id;
    localStorage.setItem('pipeline_style_id', data.id);
    updateDeleteStyleBtn();
    setTimeout(() => document.getElementById('styleModal').close(), 800);
  } catch (e) {
    status.textContent = `✗ Lỗi: ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Tạo phong cách';
  }
}

// Lưu cấu hình TTS/API/khung hình khi người dùng thay đổi
document.addEventListener('DOMContentLoaded', () => {
  $('ttsProvider').addEventListener('change', () => {
    const provider = $('ttsProvider').value;
    localStorage.setItem(LS_TTS_PROVIDER, provider);
    applyTTSProviderUI(provider);
  });
  $('lucylabKey').addEventListener('change', () => {
    localStorage.setItem(LS_LUCYLAB_KEY, $('lucylabKey').value.trim());
  });
  $('voiceId').addEventListener('change', () => {
    localStorage.setItem(LS_VOICE_ID, $('voiceId').value.trim());
  });
  $('vbeeKey').addEventListener('change', () => {
    localStorage.setItem(LS_VBEE_KEY, $('vbeeKey').value.trim());
  });
  $('vbeeAppId').addEventListener('change', () => {
    localStorage.setItem(LS_VBEE_APP_ID, $('vbeeAppId').value.trim());
  });
  $('vbeeVoiceCode').addEventListener('change', () => {
    localStorage.setItem(LS_VBEE_VOICE, $('vbeeVoiceCode').value.trim());
  });
  $('outputAspectRatio').addEventListener('change', () => {
    selectedAspectRatio = $('outputAspectRatio').value;
    localStorage.setItem(LS_ASPECT_RATIO, selectedAspectRatio);
    applyAspectRatioCSS(selectedAspectRatio);
  });
  $('aiProvider').addEventListener('change', () => {
    selectedAIProvider = $('aiProvider').value;
    localStorage.setItem(LS_AI_PROVIDER, selectedAIProvider);
    applyAIProviderUI(selectedAIProvider);
  });
  $('enableSubtitles').addEventListener('change', () => {
    localStorage.setItem(LS_SUBTITLES, $('enableSubtitles').value);
  });
  $('videoDuration').addEventListener('change', () => {
    localStorage.setItem(LS_VIDEO_DURATION, $('videoDuration').value);
    syncSceneDurationOptions();
    localStorage.setItem(LS_SCENE_DURATION, $('sceneDuration').value);
    updateDurationSummary();
  });
  $('sceneDuration').addEventListener('change', () => {
    localStorage.setItem(LS_SCENE_DURATION, $('sceneDuration').value);
    updateDurationSummary();
  });
  $('ttsSpeed').addEventListener('change', () => {
    localStorage.setItem(LS_TTS_SPEED, $('ttsSpeed').value);
  });

  $('styleSelect').addEventListener('change', () => {
    selectedStyleId = Number($('styleSelect').value) || null;
    localStorage.setItem('pipeline_style_id', selectedStyleId);
    updateDeleteStyleBtn();
  });

  $('btnNewStyle').addEventListener('click', () => {
    $('styleDomainInput').value = '';
    $('styleGenStatus').textContent = '';
    document.getElementById('styleModal').showModal();
  });

  $('btnDeleteStyle').addEventListener('click', async () => {
    if (!selectedStyleId || selectedStyleId === 1) return;
    const name = $('styleSelect').selectedOptions[0]?.textContent;
    if (!confirm(`Xóa phong cách "${name}"?`)) return;
    await api(`/api/styles/${selectedStyleId}`, 'DELETE');
    await loadStyles();
  });
});

function renderKeyCount() {
  $('chato1Count').textContent = chato1Keys.length ? `${chato1Keys.length} keys` : 'Chưa nạp keys';
}
function renderGeminiCount() {
  $('geminiCount').textContent = geminiKeys.length ? `${geminiKeys.length} keys` : 'Chưa nạp keys';
}
function renderOpenAICount() {
  $('openaiCount').textContent = openaiKeys.length ? `${openaiKeys.length} keys` : 'Chưa nạp keys';
}

function applySettingsFromServer(settings) {
  const logoName = settings.logoName || (settings.logoPath ? basename(settings.logoPath) : 'Chưa chọn');
  $('logoName').textContent = logoName;
  localStorage.setItem(LS_LOGO_KEY, logoName);
  $('btnClearLogo').style.display = settings.logoPath ? 'inline-flex' : 'none';
}

// Chato1 file picker
$('chato1File').onchange = async e => {
  if (!e.target.files[0]) return;
  chato1Keys = await loadKeyFile(e.target.files[0]);
  renderKeyCount();
  localStorage.setItem(LS_KEYS_KEY, JSON.stringify(chato1Keys));
};

// Gemini file picker
$('geminiFile').onchange = async e => {
  if (!e.target.files[0]) return;
  geminiKeys = await loadKeyFile(e.target.files[0]);
  renderGeminiCount();
  localStorage.setItem(LS_GEMINI_KEYS, JSON.stringify(geminiKeys));
};

// OpenAI file picker
$('openaiFile').onchange = async e => {
  if (!e.target.files[0]) return;
  openaiKeys = await loadKeyFile(e.target.files[0]);
  renderOpenAICount();
  localStorage.setItem(LS_OPENAI_KEYS, JSON.stringify(openaiKeys));
};

// Logo file picker
$('logoFile').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';          // reset ngay để cho phép chọn lại cùng file
  if (!file) return;

  $('logoName').textContent = '⏳ Đang upload...';
  try {
    const form = new FormData();
    form.append('logo', file);
    const r = await fetch('/api/settings/logo', { method: 'POST', body: form });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.logoName) {
      $('logoName').textContent = data.logoName;
      localStorage.setItem(LS_LOGO_KEY, data.logoName);
      $('btnClearLogo').style.display = 'inline-flex';
    } else {
      $('logoName').textContent = localStorage.getItem(LS_LOGO_KEY) || 'Lỗi upload';
      alert('Lỗi upload logo: ' + (data.error || `HTTP ${r.status}`));
    }
  } catch (err) {
    $('logoName').textContent = localStorage.getItem(LS_LOGO_KEY) || 'Lỗi upload';
    alert('Lỗi upload logo: ' + err.message);
  }
};

$('btnClearLogo').onclick = async () => {
  if (!confirm('Xóa logo hiện tại để tạo video không logo?')) return;
  $('btnClearLogo').disabled = true;
  try {
    const data = await api('/api/settings/logo', 'DELETE');
    if (data?.error) throw new Error(data.error);
    $('logoName').textContent = 'Chưa chọn';
    localStorage.setItem(LS_LOGO_KEY, 'Chưa chọn');
    $('btnClearLogo').style.display = 'none';
  } catch (error) {
    alert(`Không thể xóa logo: ${error.message}`);
  } finally {
    $('btnClearLogo').disabled = false;
  }
};


// ─── Sidebar ──────────────────────────────────────────────────────────────────
async function updateSidebar() {
  const list = await api('/api/projects');
  const el   = $('projectList');
  if (!list.length) { el.innerHTML = '<div class="empty-list">Chưa có dự án</div>'; return; }
  el.innerHTML = list.map(p => `
    <div class="proj-item ${p.id === currentId ? 'active' : ''}" onclick="openProject('${p.id}')">
      <div class="sc-top" style="gap:6px">
        <div class="proj-item-topic" style="flex:1;min-width:0">${esc(p.topic)}</div>
        <button class="btn-del-proj" title="Xóa dự án" onclick="event.stopPropagation();deleteProjectUI('${p.id}')">✕</button>
      </div>
      <div class="proj-item-meta">
        <span class="badge badge-${p.status}">${statusLabel(p.status)}</span>
        <span class="proj-item-date">${fmtDate(p.created_at)}</span>
      </div>
    </div>
  `).join('');
}

// ─── Views ────────────────────────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(id).classList.add('active');
}


// ─── Open project ─────────────────────────────────────────────────────────────
async function openProject(id) {
  if ($('editorModal').open) closeEditor();
  currentId = id;
  showView('viewProject');
  $('sceneGrid').innerHTML = '';
  const _logEl = $('log'); if (_logEl) _logEl.textContent = '';
  $('finalVideo').classList.add('hidden');
  clearCurrentOp();
  document.querySelectorAll('.step').forEach(el => el.className = 'step');
  await refreshProject();
  updateSidebar();
}

async function refreshProject() {
  const p = await api(`/api/projects/${currentId}`);
  if (!p || p.error) return;
  applyAspectRatioCSS(getProjectAspectRatio(p));

  $('projTopic').textContent = p.topic;
  $('projDate').textContent  = fmtDate(p.created_at);
  setStatusBadge($('projStatus'), p.status);

  const isError     = p.status === 'error';
  const hasFinal    = p.status === 'done';
  const inPreview   = p.status === 'preview';
  const allSceneHtmlReady = p.scenes?.length > 0 && p.scenes.every(s => s.html_done);
  const allHtmlReady = p.scenes?.length > 0
    && allSceneHtmlReady
    && (!p.thumbnail || p.thumbnail.html_done);
  const allRendered = p.scenes?.length > 0 && p.scenes.every(s => s.render_done);
  const showRender  = isError || inPreview || hasFinal || allRendered || allHtmlReady;
  $('btnRender').classList.toggle('hidden', !showRender);
  $('btnDownload').classList.toggle('hidden', !hasFinal);
  if (isError) {
    $('btnRender').disabled = false;
    $('btnRender').textContent = '▶ Tiếp tục';
  } else if (hasFinal || allRendered) {
    $('btnRender').disabled = false;
    $('btnRender').textContent = '🔗 Ghép lại video';
  } else if (allHtmlReady || inPreview) {
    $('btnRender').disabled = false;
    $('btnRender').textContent = '🎬 Tạo Video';
  } else {
    $('btnRender').disabled = true;
    $('btnRender').textContent = '⏳ Đang chuẩn bị preview...';
  }
  if (hasFinal) {
    $('btnDownload').href     = `/api/projects/${currentId}/video`;
    $('btnDownload').download = `${currentId}.mp4`;
  }

  $('sceneGrid').innerHTML = '';
  if (p.scenes?.length) {
    p.scenes.forEach(sc => $('sceneGrid').appendChild(buildSceneCard(sc, p.status)));
  }
  if (shouldShowThumbnailCard(p.thumbnail, p.scenes, p.status)) {
    $('sceneGrid').appendChild(buildThumbnailCard(p.thumbnail, p.status));
  }

  if (hasFinal)  showFinalVideo();
  if (inPreview) showPreviewReady();

  if (p.scenes?.every(s => s.render_done)) { setStep(6, 'done'); setStep(7, p.status === 'done' ? 'done' : ''); }
  if (p.scenes?.every(s => s.html_done))   setStep(5, inPreview || hasFinal ? 'done' : 'active');
  if (p.scenes?.every(s => s.audio_done))  setStep(4, 'done');
  requestAnimationFrame(updateAllPreviewScales);
}

// ─── Scene card ───────────────────────────────────────────────────────────────
function buildSceneCard(sc, projStatus) {
  const card = document.createElement('div');
  card.className = 'scene-card';
  card.id = `sc-${sc.stt}`;
  const isRegenerating = regeneratingScenes.has(Number(sc.stt));
  const hasHtml  = sc.html_done;
  const hasVideo = sc.render_done;
  const isGenerating = !hasHtml && !isRegenerating && projStatus === 'running';
  const previewSrc = hasHtml ? `/api/projects/${currentId}/preview/${sc.stt}` : '';
  const badgeClass = isRegenerating    ? 'badge-html-regenerating'
    : hasVideo                         ? 'badge-done'
    : hasHtml                          ? 'badge-preview'
    : isGenerating                     ? 'badge-generating'
    : 'badge-pending';
  const badgeLabel = isRegenerating    ? '◉ HTML'
    : hasVideo                         ? '✓ Video'
    : hasHtml                          ? '◉ HTML'
    : isGenerating                     ? '⟳ HTML'
    : '○ Chờ';
  let iframeContent;
  if (hasHtml) {
    iframeContent = `<div class="iframe-loader" id="il-${sc.stt}">⏳ Đang tải...</div>
           <iframe src="${previewSrc}?t=${Date.now()}" scrolling="no"
             onload="$('il-${sc.stt}').style.display='none'; updateAllPreviewScales();"
             onerror="$('il-${sc.stt}').textContent='✗ Lỗi tải'"
           ></iframe>`;
  } else if (isGenerating) {
    iframeContent = `<div class="iframe-placeholder iframe-generating"><span class="scene-gen-spin">⟳</span>Đang tạo HTML...</div>`;
  } else {
    iframeContent = `<div class="iframe-placeholder">Chưa có HTML</div>`;
  }
  card.innerHTML = `
    <div class="sc-top">
      <span class="sc-num">Cảnh ${sc.stt}</span>
      <span class="sc-badge ${badgeClass}">${badgeLabel}</span>
    </div>
    <div class="iframe-wrap" id="iw-${sc.stt}">${iframeContent}</div>
    <p class="sc-voice">${esc(sc.voice?.slice(0, 80) ?? '')}${(sc.voice?.length ?? 0) > 80 ? '…' : ''}</p>
    <div class="sc-btns">
      <button class="btn-edit" onclick="openEditor(${sc.stt})">✏️ Sửa</button>
      ${hasVideo ? `<button class="btn-ghost-sm" onclick="watchScene(${sc.stt})">▶ Xem</button>` : ''}
    </div>
  `;
  return card;
}

function buildThumbnailCard(thumbnail, projStatus = '') {
  const card = document.createElement('div');
  card.className = 'scene-card thumbnail-card';
  card.id = 'thumbnail-card';
  const hasImage      = Boolean(thumbnail?.image_done);
  const hasHtml       = Boolean(thumbnail?.html_done);
  const isGenerating  = !hasHtml && !hasImage && projStatus === 'running';
  const badgeClass = hasImage ? 'badge-done' : hasHtml ? 'badge-preview' : isGenerating ? 'badge-generating' : 'badge-pending';
  const badgeLabel = hasImage ? '✓ Ảnh' : hasHtml ? '◉ HTML' : isGenerating ? '⟳ HTML' : '○ Chờ';
  let previewContent;
  if (hasImage) {
    previewContent = `<img class="thumbnail-preview" src="/api/projects/${currentId}/thumbnail/image?t=${Date.now()}" alt="Thumbnail preview">`;
  } else if (hasHtml) {
    previewContent = `<div class="iframe-loader" id="il-thumbnail">⏳ Đang tải...</div>
      <iframe src="/api/projects/${currentId}/thumbnail/preview?t=${Date.now()}" scrolling="no"
        onload="$('il-thumbnail').style.display='none'; updateAllPreviewScales();"
        onerror="$('il-thumbnail').textContent='✗ Lỗi tải'"
      ></iframe>`;
  } else if (isGenerating) {
    previewContent = `<div class="iframe-placeholder iframe-generating"><span class="scene-gen-spin">⟳</span>Đang tạo thumbnail...</div>`;
  } else {
    previewContent = `<div class="iframe-placeholder">Chưa có thumbnail</div>`;
  }
  card.innerHTML = `
    <div class="sc-top">
      <span class="sc-num">Thumbnail</span>
      <span class="sc-badge ${badgeClass}">${badgeLabel}</span>
    </div>
    <div class="iframe-wrap" id="iw-thumbnail">${previewContent}</div>
    <p class="sc-voice">${esc(thumbnail?.title ?? 'Thumbnail video')}</p>
    <div class="sc-btns">
      <button class="btn-edit" onclick="openThumbnailEditor()">✏️ Sửa</button>
      ${hasImage ? `<button class="btn-ghost-sm" onclick="downloadThumbnail()">⬇ Tải</button>` : ''}
    </div>
  `;
  return card;
}

function shouldShowThumbnailCard(thumbnail, scenes = [], projStatus = '') {
  if (!thumbnail?.title && !thumbnail?.prompt) return false;
  // Hiện card chờ ngay khi có data thumbnail và đang chạy pipeline
  if (projStatus === 'running') return Array.isArray(scenes) && scenes.length > 0;
  // Các trạng thái khác: hiện khi html đã xong
  return Boolean(thumbnail?.html_done);
}

function reloadSceneCard(stt) {
  api(`/api/projects/${currentId}`).then(p => {
    const sc = p?.scenes?.find(s => s.stt === stt);
    if (!sc) return;
    const card = buildSceneCard(sc, p.status);
    const old  = $(`sc-${stt}`);
    if (old) {
      old.replaceWith(card);
    } else {
      // Card chưa có trong DOM — chèn đúng vị trí theo stt
      const existing = [...$('sceneGrid').querySelectorAll('.scene-card:not(.thumbnail-card)')];
      const before = existing.find(c => Number(c.id.replace('sc-', '')) > stt);
      if (before) {
        $('sceneGrid').insertBefore(card, before);
      } else {
        const thumb = $('thumbnail-card');
        if (thumb) $('sceneGrid').insertBefore(card, thumb);
        else $('sceneGrid').appendChild(card);
      }
    }
    requestAnimationFrame(updateAllPreviewScales);
  });
}

function reloadThumbnailCard() {
  api(`/api/projects/${currentId}`).then(p => {
    const old = $('thumbnail-card');
    if (shouldShowThumbnailCard(p?.thumbnail, p?.scenes, p?.status)) {
      const card = buildThumbnailCard(p.thumbnail, p.status);
      if (old) old.replaceWith(card);
      else $('sceneGrid').appendChild(card);
      requestAnimationFrame(updateAllPreviewScales);
      return;
    }
    if (old) old.remove();
  });
}

// ─── Preview ready ────────────────────────────────────────────────────────────
function showPreviewReady() {
  $('btnRender').classList.remove('hidden');
  $('btnRender').disabled = false;
  $('btnRender').textContent = '🎬 Tạo Video';
}

function showFinalVideoConcat() {
  $('btnRender').classList.remove('hidden');
  $('btnRender').disabled = false;
  $('btnRender').textContent = '🔗 Ghép lại video';
}

// ─── Start render ─────────────────────────────────────────────────────────────
async function startRender() {
  $('btnRender').disabled = true;
  const p = await api(`/api/projects/${currentId}`);
  if (p.status === 'error') {
    continueProject();
    return;
  }
  const allRendered = p.scenes?.length > 0 && p.scenes.every(s => s.render_done);
  if (allRendered) {
    $('btnRender').textContent = '⏳ Đang ghép...';
    setCurrentOp(7, 'Đang ghép video cuối...');
    await api(`/api/projects/${currentId}/concat`, 'POST');
    appendLog('[B7] Bắt đầu ghép video...');
  } else {
    $('btnRender').textContent = '⏳ Đang render...';
    setStep(6, 'active');
    await api(`/api/projects/${currentId}/render`, 'POST');
    appendLog('[B6] Bắt đầu render video...');
  }
}

async function continueProject() {
  if (!currentId) return;
  $('btnRender').disabled = true;
  $('btnRender').textContent = '⏳ Đang tiếp tục...';
  // Reset step error indicators
  document.querySelectorAll('.step.error').forEach(el => el.classList.replace('error', 'active'));
  setCurrentOp(2, 'Tiếp tục pipeline từ chỗ bị lỗi...');
  const resp = await api(`/api/projects/${currentId}/resume`, 'POST', {
    chato1Keys:   chato1Keys.length  ? chato1Keys  : undefined,
    openaiKeys:   openaiKeys.length  ? openaiKeys  : undefined,
    geminiKeys:   geminiKeys.length  ? geminiKeys  : undefined,
    ttsProvider:  $('ttsProvider').value  || undefined,
    lucylabKey:   $('lucylabKey').value.trim()   || undefined,
    voiceId:      $('voiceId').value.trim()      || undefined,
    vbeeKey:      $('vbeeKey').value.trim()      || undefined,
    vbeeAppId:    $('vbeeAppId').value.trim()    || undefined,
    vbeeVoiceCode: $('vbeeVoiceCode').value.trim() || undefined,
    ttsSpeed:     Number($('ttsSpeed').value) || 1.0,
  });
  if (resp?.error) {
    clearCurrentOp();
    $('btnRender').disabled = false;
    $('btnRender').textContent = '▶ Tiếp tục';
    alert(`Không thể tiếp tục: ${resp.error}`);
  }
}


// ─── Scene editor ─────────────────────────────────────────────────────────────
async function openEditor(stt) {
  editingTargetType = 'scene';
  editingStt = stt;
  editorBusy = false;
  $('editVoiceLabel').textContent = 'Voice (lời dẫn)';
  $('editVisualLabel').textContent = 'Visual (mô tả AI tạo HTML)';
  $('modalTitle').textContent = `Chỉnh sửa Cảnh ${stt}`;
  $('editVoice').value  = '';
  $('editVisual').value = '';
  $('editHtml').value   = '';
  $('previewLoader').style.display = 'flex';
  $('previewFrame').src = `/api/projects/${currentId}/preview/${stt}?t=${Date.now()}`;
  resetEditorButtons();
  $('editorModal').showModal();
  const sc = await api(`/api/projects/${currentId}/scenes/${stt}`);
  $('editVoice').value  = sc.voice  ?? '';
  $('editVisual').value = sc.visual ?? '';
  $('editHtml').value   = sc.html   ?? '';
}

async function openThumbnailEditor() {
  editingTargetType = 'thumbnail';
  editingStt = 'thumbnail';
  editorBusy = false;
  $('editVoiceLabel').textContent = 'Tiêu đề thumbnail';
  $('editVisualLabel').textContent = 'Prompt thumbnail';
  $('modalTitle').textContent = 'Chỉnh sửa Thumbnail';
  $('editVoice').value  = '';
  $('editVisual').value = '';
  $('editHtml').value   = '';
  $('previewLoader').style.display = 'flex';
  $('previewFrame').src = `/api/projects/${currentId}/thumbnail/preview?t=${Date.now()}`;
  resetEditorButtons();
  $('editorModal').showModal();
  const thumbnail = await api(`/api/projects/${currentId}/thumbnail`);
  $('editVoice').value  = thumbnail.title  ?? '';
  $('editVisual').value = thumbnail.prompt ?? '';
  $('editHtml').value   = thumbnail.html   ?? '';
}

function closeEditor() {
  if ($('editorModal').open) $('editorModal').close();
  editingStt = null;
  editingTargetType = 'scene';
  editorBusy = false;
  resetEditorButtons();
}

function disableEditorBtns(disabled) {
  ['btnRegenAI', 'btnSaveHtml', 'btnRerender', 'btnEditHtmlAI', 'btnRegenVoice'].forEach(id => $(id).disabled = disabled);
}

function resetEditorButtons() {
  disableEditorBtns(false);
  const isThumbnail = editingTargetType === 'thumbnail';
  $('btnRegenVoice').classList.toggle('hidden', isThumbnail);
  $('btnRegenAI').textContent    = isThumbnail ? '🤖 AI tạo lại Thumbnail' : '🤖 AI tạo lại HTML';
  $('btnSaveHtml').textContent   = '💾 Lưu HTML';
  $('btnRerender').textContent   = isThumbnail ? '⬇ Tải Thumbnail' : '🎬 Render lại cảnh này';
  $('btnEditHtmlAI').textContent = isThumbnail ? '✏️ Sửa Thumbnail với AI' : '✏️ Sửa HTML với AI';
}

async function regenSceneVoice() {
  if (editorBusy || editingTargetType !== 'scene') return;
  const newVoice = $('editVoice').value.trim();
  if (!newVoice) return alert('Voice không được để trống');

  editorBusy = true;
  disableEditorBtns(true);
  $('btnRegenVoice').textContent = '⏳ Đang tạo TTS + HTML...';

  // Lưu voice + visual mới vào DB/state trước
  await api(`/api/projects/${currentId}/scenes/${editingStt}`, 'PUT', {
    voice:  newVoice,
    visual: $('editVisual').value,
  });

  const resp = await api(`/api/projects/${currentId}/scenes/${editingStt}/regen-voice`, 'POST', {
    voice: newVoice,
  });

  if (resp?.error) {
    editorBusy = false;
    resetEditorButtons();
    return alert(resp.error);
  }

  markSceneHtmlBusy(editingStt, `[B4] Đang tạo lại TTS + HTML cảnh ${editingStt} ở chế độ nền...`);
  closeEditor();
}

async function regenSceneAI() {
  if (editorBusy) return;
  if (editingTargetType === 'thumbnail') {
    editorBusy = true;
    disableEditorBtns(true);
    $('btnRegenAI').textContent = '⏳ Đang tạo...';
    await api(`/api/projects/${currentId}/thumbnail`, 'PUT', {
      title: $('editVoice').value,
      prompt: $('editVisual').value,
    });
    const resp = await api(`/api/projects/${currentId}/thumbnail/regen`, 'POST');
    if (resp?.error) {
      editorBusy = false;
      resetEditorButtons();
      return alert(resp.error);
    }
    appendLog('[B5] Đang tạo lại thumbnail ở chế độ nền...');
    closeEditor();
    return;
  }
  const stt = editingStt;
  editorBusy = true;
  disableEditorBtns(true);
  $('btnRegenAI').textContent = '⏳ Đang tạo...';
  await api(`/api/projects/${currentId}/scenes/${stt}`, 'PUT', {
    voice:  $('editVoice').value,
    visual: $('editVisual').value,
  });
  const resp = await api(`/api/projects/${currentId}/scenes/${stt}/regen`, 'POST');
  if (resp?.error) {
    editorBusy = false;
    resetEditorButtons();
    return alert(resp.error);
  }
  markSceneHtmlBusy(stt, `[B5] Đang tạo lại HTML cảnh ${stt} ở chế độ nền...`);
  closeEditor();
}

async function editSceneHtmlAI() {
  if (editorBusy) return;
  const prompt = $('editHtmlPrompt').value.trim();
  if (!prompt) return alert('Vui lòng nhập mô tả chỉnh sửa.');
  const currentHtml = $('editHtml').value.trim();
  if (!currentHtml) return alert('Không có HTML hiện tại để sửa.');
  editorBusy = true;
  disableEditorBtns(true);
  $('btnEditHtmlAI').textContent = '⏳ Đang sửa...';
  if (editingTargetType === 'scene') {
    markSceneHtmlBusy(editingStt, `[B5] Đang AI chỉnh sửa HTML cảnh ${editingStt}...`);
  }
  const endpoint = editingTargetType === 'thumbnail'
    ? `/api/projects/${currentId}/thumbnail/edit-html`
    : `/api/projects/${currentId}/scenes/${editingStt}/edit-html`;
  const resp = await api(endpoint, 'POST', {
    editPrompt: prompt,
    currentHtml,
  });
  editorBusy = false;
  if (resp?.error) {
    if (editingTargetType === 'scene') unmarkSceneHtmlBusy(editingStt);
    resetEditorButtons();
    return alert(resp.error);
  }
  $('editHtml').value = resp.html;
  $('editHtmlPrompt').value = '';
  $('previewLoader').style.display = 'flex';
  if (editingTargetType === 'thumbnail') {
    await api(`/api/projects/${currentId}/thumbnail`, 'PUT', {
      title:  $('editVoice').value,
      prompt: $('editVisual').value,
      html:   resp.html,
    });
    $('previewFrame').src = `/api/projects/${currentId}/thumbnail/preview?t=${Date.now()}`;
    reloadThumbnailCard();
  } else {
    await api(`/api/projects/${currentId}/scenes/${editingStt}`, 'PUT', {
      voice:  $('editVoice').value,
      visual: $('editVisual').value,
      html:   resp.html,
    });
    unmarkSceneHtmlBusy(editingStt);
    $('previewFrame').src = `/api/projects/${currentId}/preview/${editingStt}?t=${Date.now()}`;
    reloadSceneCard(editingStt);
  }
  resetEditorButtons();
  appendLog(editingTargetType === 'thumbnail' ? '✓ AI đã sửa thumbnail' : `✓ AI đã sửa HTML cảnh ${editingStt}`);
}

function reloadPreviewIfOpen(stt) {
  if (editingStt !== stt) return;
  $('previewLoader').style.display = 'flex';
  const previewUrl = stt === 'thumbnail'
    ? `/api/projects/${currentId}/thumbnail/preview?t=${Date.now()}`
    : `/api/projects/${currentId}/preview/${stt}?t=${Date.now()}`;
  const dataUrl = stt === 'thumbnail'
    ? `/api/projects/${currentId}/thumbnail`
    : `/api/projects/${currentId}/scenes/${stt}`;
  $('previewFrame').src = previewUrl;
  api(dataUrl).then(sc => {
    $('editVoice').value = sc.title ?? sc.voice ?? '';
    $('editVisual').value = sc.prompt ?? sc.visual ?? '';
    $('editHtml').value = sc.html ?? '';
    editorBusy = false;
    resetEditorButtons();
  });
}

async function saveSceneHtml() {
  if (editorBusy) return;
  disableEditorBtns(true);
  $('btnSaveHtml').textContent = '⏳ Đang lưu...';
  if (editingTargetType === 'thumbnail') {
    await api(`/api/projects/${currentId}/thumbnail`, 'PUT', {
      title:  $('editVoice').value,
      prompt: $('editVisual').value,
      html:   $('editHtml').value,
    });
  } else {
    await api(`/api/projects/${currentId}/scenes/${editingStt}`, 'PUT', {
      voice:  $('editVoice').value,
      visual: $('editVisual').value,
      html:   $('editHtml').value,
    });
  }
  $('previewLoader').style.display = 'flex';
  $('previewFrame').src = editingTargetType === 'thumbnail'
    ? `/api/projects/${currentId}/thumbnail/preview?t=${Date.now()}`
    : `/api/projects/${currentId}/preview/${editingStt}?t=${Date.now()}`;
  if (editingTargetType === 'thumbnail') reloadThumbnailCard();
  else reloadSceneCard(editingStt);
  resetEditorButtons();
  appendLog(editingTargetType === 'thumbnail' ? '✓ Đã lưu thumbnail' : `✓ Đã lưu HTML cảnh ${editingStt}`);
}

async function rerenderScene() {
  if (editorBusy) return;
  if (editingTargetType === 'thumbnail') {
    downloadThumbnail();
    return;
  }
  const stt = editingStt;
  editorBusy = true;
  disableEditorBtns(true);
  $('btnRerender').textContent = '⏳ Đang render...';
  await api(`/api/projects/${currentId}/scenes/${stt}`, 'PUT', {
    voice:  $('editVoice').value,
    visual: $('editVisual').value,
    html:   $('editHtml').value,
  });
  const resp = await api(`/api/projects/${currentId}/scenes/${stt}/rerender`, 'POST');
  if (resp?.error) {
    editorBusy = false;
    resetEditorButtons();
    return alert(resp.error);
  }
  appendLog(`[B6] Đang render lại cảnh ${stt} ở chế độ nền...`);
  closeEditor();
}

async function watchScene(stt) {
  window.open(`/api/projects/${currentId}/scenes/${stt}/video`, '_blank');
}

function downloadThumbnail() {
  window.open(`/api/projects/${currentId}/thumbnail/image?download=1`, '_blank');
}

window.addEventListener('resize', () => {
  requestAnimationFrame(updateAllPreviewScales);
});

// ─── Project assets ───────────────────────────────────────────────────────────
function getFileType(file) {
  if (file.name.toLowerCase().endsWith('.gif')) return 'gif';
  if (file.type.startsWith('video/')) return 'video';
  return 'image';
}

function formatRatio(w, h) {
  if (!w || !h) return '?';
  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
  const g = gcd(w, h);
  const rw = w / g, rh = h / g;
  const r = rw / rh;
  if (Math.abs(r - 16/9) < 0.05) return '16:9';
  if (Math.abs(r - 9/16) < 0.05) return '9:16';
  if (Math.abs(r - 4/3) < 0.05) return '4:3';
  if (Math.abs(r - 3/4) < 0.05) return '3:4';
  if (Math.abs(r - 1)   < 0.03) return '1:1';
  return `${rw}:${rh}`;
}

async function getAspectRatio(file, type) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    if (type === 'video') {
      const v = document.createElement('video');
      v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(formatRatio(v.videoWidth, v.videoHeight)); };
      v.onerror = () => { URL.revokeObjectURL(url); resolve('?'); };
      v.src = url;
    } else {
      const img = new Image();
      img.onload  = () => { URL.revokeObjectURL(url); resolve(formatRatio(img.naturalWidth, img.naturalHeight)); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve('?'); };
      img.src = url;
    }
  });
}

function sanitizeFilename(originalName) {
  const ext  = originalName.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
  const base = originalName.slice(0, originalName.length - ext.length);
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_').slice(0, 60) + ext;
}

function renderAssetList() {
  const el = $('assetList');
  if (!projectAssets.length) { el.innerHTML = ''; return; }
  el.innerHTML = projectAssets.map((a, i) => `
    <div class="asset-item">
      <input class="asset-item-name" value="${esc(a.name)}" placeholder="Mô tả nội dung file..."
        oninput="projectAssets[${i}].name=this.value">
      <span class="asset-item-meta">${a.type} ${a.aspectRatio}</span>
      <button class="asset-item-del" title="Xoá" onclick="removeAsset(${i})">✕</button>
    </div>
  `).join('');
}

function removeAsset(i) {
  projectAssets.splice(i, 1);
  renderAssetList();
}

$('assetFile').onchange = async e => {
  const files = Array.from(e.target.files);
  e.target.value = '';
  for (const file of files) {
    const type        = getFileType(file);
    const aspectRatio = await getAspectRatio(file, type);
    const filename    = sanitizeFilename(file.name);
    const name        = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    projectAssets.push({ file, name, type, aspectRatio, filename });
  }
  renderAssetList();
};

async function uploadProjectAssets(sessionId) {
  if (!projectAssets.length) return;
  const form = new FormData();
  projectAssets.forEach(a => form.append('files', a.file, a.filename));
  await fetch(`/api/projects/${sessionId}/upload-assets`, { method: 'POST', body: form });
}

// ─── Start new project ────────────────────────────────────────────────────────
$('btnStart').onclick = async () => {
  let inputMode;
  try {
    inputMode = detectInputMode($('topic').value);
  } catch (error) {
    return alert(error.message);
  }
  const topic = inputMode.topic;
  const scriptJson = inputMode.scriptJson;
  const ttsProvider = $('ttsProvider').value || 'lucylab';
  const lucylabKey = $('lucylabKey').value.trim();
  const voiceId    = $('voiceId').value.trim();
  const vbeeKey = $('vbeeKey').value.trim();
  const vbeeAppId = $('vbeeAppId').value.trim();
  const vbeeVoiceCode = $('vbeeVoiceCode').value.trim();
  const durationPlan = getDurationPlan(Number($('videoDuration').value), Number($('sceneDuration').value));
  const ttsSpeed = Number($('ttsSpeed').value) || 1.0;
  const usingManualScript = inputMode.isManualScript;
  if (!topic && !usingManualScript) return alert('Nhập chủ đề hoặc dán JSON kịch bản');
  if (!usingManualScript && selectedAIProvider === 'chato1' && !chato1Keys.length) return alert('Thiếu Chato1 keys');
  if (!usingManualScript && selectedAIProvider === 'gemini' && !geminiKeys.length) return alert('Thiếu Gemini API keys');
  if (!usingManualScript && selectedAIProvider === 'openai' && !openaiKeys.length) return alert('Thiếu OpenAI API keys');
  if (ttsProvider === 'lucylab' && !lucylabKey) return alert('Thiếu LucyLab API key');
  if (ttsProvider === 'vbee' && !vbeeKey) return alert('Thiếu Vbee API key');
  if (ttsProvider === 'vbee' && !vbeeAppId) return alert('Thiếu Vbee Project ID');
  if (ttsProvider === 'vbee' && !vbeeVoiceCode) return alert('Thiếu Vbee Voice ID');

  localStorage.setItem(LS_TTS_PROVIDER, ttsProvider);
  localStorage.setItem(LS_LUCYLAB_KEY, lucylabKey);
  if (voiceId) localStorage.setItem(LS_VOICE_ID, voiceId);
  localStorage.setItem(LS_VBEE_KEY, vbeeKey);
  localStorage.setItem(LS_VBEE_APP_ID, vbeeAppId);
  localStorage.setItem(LS_VBEE_VOICE, vbeeVoiceCode);

  const assetMeta = projectAssets.map(a => ({
    name: a.name, type: a.type, aspectRatio: a.aspectRatio, filename: a.filename,
  }));

  const data = await api('/api/start', 'POST', {
    topic,
    scriptJson,
    chato1Keys,
    ttsProvider,
    lucylabKey,
    voiceId: voiceId || undefined,
    vbeeKey: vbeeKey || undefined,
    vbeeAppId: vbeeAppId || undefined,
    vbeeVoiceCode: vbeeVoiceCode || undefined,
    projectAssets: assetMeta.length ? assetMeta : undefined,
    outputAspectRatio: selectedAspectRatio,
    aiProvider: selectedAIProvider,
    geminiKeys: selectedAIProvider === 'gemini' ? geminiKeys : undefined,
    openaiKeys: selectedAIProvider === 'openai' ? openaiKeys : undefined,
    enableSubtitles: $('enableSubtitles').value === '1',
    styleId: selectedStyleId || undefined,
    videoDurationSec: durationPlan.videoDurationSec,
    sceneDurationSec: durationPlan.sceneDurationSec,
    ttsSpeed,
  });
  if (data.error) return alert(data.error);

  currentId = data.sessionId;

  // Upload asset files in background — B5 won't start for ~1-2 minutes
  if (projectAssets.length) {
    uploadProjectAssets(currentId).catch(e => console.warn('Asset upload:', e));
  }

  await updateSidebar();
  await openProject(currentId);
  $('btnRender').classList.add('hidden');
  $('btnRender').disabled = true;
  $('btnRender').textContent = '⏳ Đang chuẩn bị preview...';
};

// ─── Final video ──────────────────────────────────────────────────────────────
function showFinalVideo() {
  const el = $('finalVideo');
  el.classList.remove('hidden');
  $('videoOut').src = `/api/projects/${currentId}/video?t=${Date.now()}`;
  setStatusBadge($('projStatus'), 'done');
}

// ─── Step indicators ──────────────────────────────────────────────────────────
function setStep(s, cls) {
  const el = document.querySelector(`.step[data-s="${s}"]`);
  if (el && cls) el.className = 'step ' + cls;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function appendLog(m) {
  const el = $('log');
  if (!el) return;
  el.textContent += m + '\n';
  el.scrollTop = el.scrollHeight;
}

async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(url, opts);
  if (r.status === 204) return {};
  return r.json().catch(() => ({}));
}

async function loadKeyFile(file) {
  const text = await file.text();
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function basename(s) {
  const parts = String(s || '').split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || s || '';
}

function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function statusLabel(s) {
  return { running:'Đang chạy', preview:'Chờ duyệt', done:'Hoàn thành', error:'Lỗi', pending:'Chờ' }[s] ?? s;
}

function setStatusBadge(el, status) {
  el.textContent = statusLabel(status);
  el.className = `badge badge-${status}`;
}

// ─── Delete project ───────────────────────────────────────────────────────────
async function deleteProjectUI(id) {
  if (!confirm('Xóa dự án này? Hành động không thể hoàn tác.')) return;
  await api(`/api/projects/${id}`, 'DELETE');
  if (currentId === id) {
    currentId = null;
    showView('viewNew');
  }
  updateSidebar();
}

async function deleteAllProjectsUI() {
  const list = await api('/api/projects');
  if (!list.length) return;
  if (!confirm(`Xóa tất cả ${list.length} dự án? Hành động không thể hoàn tác.`)) return;
  await api('/api/projects', 'DELETE');
  currentId = null;
  showView('viewNew');
  updateSidebar();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
connectWS();
initSettings();
renderKeyCount();
updateSidebar();
