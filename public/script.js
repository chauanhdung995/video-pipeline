// public/script.js
'use strict';

// ─── Fixed output format: 9:16 Reels/TikTok ───────────────────────────────────
const OUTPUT_ASPECT_RATIO = '9:16';
const OUTPUT_AR = { w: 1080, h: 1920, cssRatio: '9/16', gridMinW: 160, modalPreviewW: 430 };

function applyAspectRatioCSS() {
  const ar = OUTPUT_AR;
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
  return OUTPUT_AR;
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

// ─── State ────────────────────────────────────────────────────────────────────
let currentId           = null;
let editingStt          = null;
let editingTargetType   = 'scene';
let editingUsesTemplateMode = true;
let ws                  = null;
let editorBusy          = false;
let backgroundMusic     = null; // { file, name, filename }
let uploadedImageFiles  = [];
let selectedVideoObjective = 'mac-dinh';
let regeneratingScenes  = new Set();
let videoObjectives     = [];

const $ = id => document.getElementById(id);
window.$ = $;
window.updateAllPreviewScales = updateAllPreviewScales;
window.updateIframeScale = updateIframeScale;
const VIDEO_DURATION_OPTIONS = [60, 120, 180, 240, 300];
const TTS_SPEED_OPTIONS = ['0.9', '1.0', '1.1', '1.2'];
let AVAILABLE_SCENE_TEMPLATES = [
  'hook',
  'comparison',
  'comparison-vs',
  'stat-hero',
  'stat-pill',
  'feature-list',
  'feature-stack',
  'callout',
  'news-card',
  'market-chart',
  'crypto-card-hero',
  'onchain-payment',
  'payment-network-halo',
  'outro',
];
const DURATION_HINTS = {
  60:  { scenes: '4-8', words: '210-270', note: 'AI ưu tiên hook nhanh, ít luận điểm, cảnh ngắn ở phần mở đầu và kết.' },
  120: { scenes: '6-12', words: '430-520', note: 'AI có đủ chỗ cho hook, vài luận điểm chính và kết luận gọn.' },
  180: { scenes: '8-16', words: '650-780', note: 'AI có thể xen kẽ cảnh giải thích dài với cảnh số liệu/ngắt nhịp ngắn.' },
  240: { scenes: '10-20', words: '850-1040', note: 'AI nên gom nội dung thành cụm, mỗi cụm dùng template phù hợp.' },
  300: { scenes: '12-24', words: '1060-1300', note: 'AI có thể triển khai sâu hơn nhưng vẫn giữ mỗi cảnh tập trung một ý.' },
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
    reloadPreviewIfOpen(msg.stt);
    appendLog(`✓ HTML cảnh ${msg.stt} xong`);
  } else if (msg.type === 'scene_render_done') {
    reloadSceneCard(msg.stt);
    appendLog(`✓ Render cảnh ${msg.stt} xong`);
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
const LS_LOGO_KEY      = 'pipeline_logo_name';
const LS_LARVOICE_VOICE = 'pipeline_larvoice_voice_id';
const LS_SUBTITLES     = 'pipeline_enable_subtitles';
const LS_VIDEO_DURATION = 'pipeline_video_duration';
const LS_TTS_SPEED      = 'pipeline_tts_speed';
const LS_VIDEO_OBJECTIVE = 'pipeline_video_objective';
const LS_USE_TEMPLATE_MODE = 'pipeline_use_template_mode';

function getDurationPlan(videoDurationSec) {
  const safeVideoDuration = VIDEO_DURATION_OPTIONS.includes(videoDurationSec) ? videoDurationSec : 120;
  return { videoDurationSec: safeVideoDuration, ...(DURATION_HINTS[safeVideoDuration] || DURATION_HINTS[120]) };
}

function updateDurationSummary() {
  const plan = getDurationPlan(Number($('videoDuration').value));
  $('durationSummary').textContent = `AI tự chia cảnh theo nội dung/template. Gợi ý: ${plan.scenes} cảnh, tổng khoảng ${plan.words} từ. ${plan.note}`;
}

async function loadVideoObjectives(preferredId = 'mac-dinh') {
  try {
    const data = await api('/api/video-objectives');
    videoObjectives = Array.isArray(data.objectives) ? data.objectives : [];
  } catch {
    videoObjectives = [{ id: 'mac-dinh', name: 'Mặc định', description: '', templates: AVAILABLE_SCENE_TEMPLATES, templateCount: AVAILABLE_SCENE_TEMPLATES.length }];
  }
  if (!videoObjectives.length) {
    videoObjectives = [{ id: 'mac-dinh', name: 'Mặc định', description: '', templates: AVAILABLE_SCENE_TEMPLATES, templateCount: AVAILABLE_SCENE_TEMPLATES.length }];
  }
  const select = $('videoObjective');
  select.innerHTML = videoObjectives.map(item => {
    const suffix = Number(item.templateCount) > 0 ? `${item.templateCount} template` : 'chưa có template';
    return `<option value="${esc(item.id)}">${esc(item.name)} — ${esc(suffix)}</option>`;
  }).join('');
  selectedVideoObjective = videoObjectives.some(item => item.id === preferredId) ? preferredId : 'mac-dinh';
  select.value = selectedVideoObjective;
  updateVideoObjectiveSelection();
}

function updateVideoObjectiveSelection() {
  const objective = videoObjectives.find(item => item.id === $('videoObjective').value)
    || videoObjectives.find(item => item.id === 'mac-dinh')
    || videoObjectives[0];
  selectedVideoObjective = objective?.id || 'mac-dinh';
  AVAILABLE_SCENE_TEMPLATES = Array.isArray(objective?.templates) ? objective.templates : [];
  const count = AVAILABLE_SCENE_TEMPLATES.length;
  if (!isTemplateModeEnabled()) {
    $('videoObjectiveHint').textContent = 'Tắt template: AI tự viết kịch bản, tạo htmlSpec chi tiết, rồi gọi AI tạo HTML cho từng cảnh.';
    return;
  }
  $('videoObjectiveHint').textContent = count
    ? `${objective.name}: AI chỉ được chọn ${count} template: ${AVAILABLE_SCENE_TEMPLATES.join(', ')}`
    : `${objective?.name || selectedVideoObjective}: chưa có template, không thể tạo video bằng mục tiêu này.`;
}

function isTemplateModeEnabled() {
  return $('useTemplateMode').value !== '0';
}

function updateTemplateModeUI() {
  const enabled = isTemplateModeEnabled();
  $('videoObjectiveGroup').classList.toggle('muted-setting', !enabled);
  $('videoObjective').disabled = !enabled;
  $('videoObjectiveHint').textContent = enabled
    ? $('videoObjectiveHint').textContent
    : 'Tắt template: AI tự viết kịch bản, tạo htmlSpec chi tiết, rồi gọi AI tạo HTML cho từng cảnh.';
  $('templateModeHint').textContent = enabled
    ? 'Bật template: AI chọn template và sinh templateData theo schema.'
    : 'Tắt template: AI sinh JSON mô tả HTML chi tiết + SFX plan, sau đó tạo HTML từng cảnh.';
  if (enabled) updateVideoObjectiveSelection();
}

async function crawlUrlToTopic() {
  const url = $('crawlUrl').value.trim();
  if (!url) return alert('Nhập URL bài viết cần crawl');

  const btn = $('btnCrawlUrl');
  const status = $('crawlStatus');
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Đang lấy...';
  status.textContent = 'Đang lấy nội dung bài viết...';

  try {
    const data = await api('/api/crawl-url', 'POST', { url });
    if (data?.error) throw new Error(data.error);
    const text = String(data?.text || '').trim();
    if (!text) throw new Error('Không lấy được nội dung trong trường text');
    $('topic').value = text;
    $('topic').focus();
    status.textContent = `Đã lấy ${text.length.toLocaleString()} ký tự từ URL`;
  } catch (error) {
    status.textContent = `Lỗi crawl: ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

function voiceOptionLabel(voice) {
  return String(voice?.name || '')
    .replace(/\s*\(\s*pro\s*\)\s*/gi, ' ')
    .replace(/\bpro\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || 'LarVoice';
}

async function loadLarVoiceVoices(preferredId = null) {
  const select = $('larvoiceVoiceId');
  select.disabled = true;
  select.innerHTML = '<option value="1">Đang tải danh sách giọng...</option>';
  try {
    const data = await api('/api/larvoice/voices');
    if (data?.error) throw new Error(data.error);
    const voices = Array.isArray(data?.voices) ? data.voices : [];
    if (!voices.length) throw new Error('Danh sách giọng rỗng');

    select.innerHTML = '';
    for (const [language, label] of [['vi', 'Tiếng Việt'], ['en', 'English']]) {
      const groupVoices = voices.filter(v => v.language === language);
      if (!groupVoices.length) continue;
      const group = document.createElement('optgroup');
      group.label = label;
      for (const voice of groupVoices) {
        const opt = document.createElement('option');
        opt.value = String(voice.id);
        opt.textContent = voiceOptionLabel(voice);
        group.appendChild(opt);
      }
      select.appendChild(group);
    }

    const desired = String(preferredId || localStorage.getItem(LS_LARVOICE_VOICE) || '1');
    if ([...select.options].some(option => option.value === desired)) {
      select.value = desired;
    } else if ([...select.options].some(option => option.value === '1')) {
      select.value = '1';
    }
    localStorage.setItem(LS_LARVOICE_VOICE, select.value);
  } catch (error) {
    select.innerHTML = '<option value="1">ID:1 - Anh Quân (VI)</option>';
    select.value = '1';
    console.warn('LarVoice voices:', error);
  } finally {
    select.disabled = false;
  }
}

async function previewLarVoice() {
  const voiceId = Number($('larvoiceVoiceId').value);
  if (!Number.isFinite(voiceId)) return alert('Chọn giọng đọc LarVoice');

  const btn = $('btnPreviewVoice');
  const audio = $('voicePreviewAudio');
  const resetPreviewButton = () => {
    btn.disabled = false;
    btn.textContent = '▶';
    btn.dataset.state = 'idle';
  };

  if (btn.dataset.state === 'playing' && !audio.paused) {
    audio.pause();
    audio.currentTime = 0;
    resetPreviewButton();
    return;
  }
  if (btn.dataset.state === 'loading') return;

  btn.dataset.state = 'loading';
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const data = await api('/api/larvoice/sample', 'POST', {
      larvoiceVoiceId: voiceId,
    });
    if (data?.error) throw new Error(data.error);
    audio.pause();
    audio.src = data.url;
    audio.currentTime = 0;
    audio.onended = () => {
      resetPreviewButton();
    };
    audio.onerror = () => {
      resetPreviewButton();
    };
    await audio.play().catch(error => {
      resetPreviewButton();
      throw error;
    });
    btn.disabled = false;
    btn.textContent = '⏸';
    btn.dataset.state = 'playing';
  } catch (error) {
    alert(`Không thể nghe thử giọng: ${error.message}\n\nFile nghe thử chỉ lấy từ thư mục local. Chạy npm run voice:samples để tạo/cập nhật mp3 mẫu.`);
    resetPreviewButton();
  }
}

async function initSettings() {
  const savedLarVoiceVoiceId = localStorage.getItem(LS_LARVOICE_VOICE) || '1';
  await loadLarVoiceVoices(savedLarVoiceVoiceId);

  await loadVideoObjectives(localStorage.getItem(LS_VIDEO_OBJECTIVE) || 'mac-dinh');
  const savedTemplateMode = localStorage.getItem(LS_USE_TEMPLATE_MODE);
  $('useTemplateMode').value = savedTemplateMode === '0' ? '0' : '1';
  updateTemplateModeUI();

  applyAspectRatioCSS();

  const savedSubtitles = localStorage.getItem(LS_SUBTITLES);
  if (savedSubtitles !== null) $('enableSubtitles').value = savedSubtitles;

  const savedVideoDuration = Number(localStorage.getItem(LS_VIDEO_DURATION));
  $('videoDuration').value = String(VIDEO_DURATION_OPTIONS.includes(savedVideoDuration) ? savedVideoDuration : 120);
  updateDurationSummary();

  const savedTTSSpeed = localStorage.getItem(LS_TTS_SPEED);
  $('ttsSpeed').value = TTS_SPEED_OPTIONS.includes(savedTTSSpeed) ? savedTTSSpeed : '1.0';

  const cachedLogoName = localStorage.getItem(LS_LOGO_KEY);
  if (cachedLogoName) $('logoName').textContent = cachedLogoName;

  try {
    const s = await api('/api/settings');
    applySettingsFromServer(s);
  } catch {}
}

// Lưu cấu hình TTS/API khi người dùng thay đổi
document.addEventListener('DOMContentLoaded', () => {
  $('btnCrawlUrl').addEventListener('click', crawlUrlToTopic);
  $('crawlUrl').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      crawlUrlToTopic();
    }
  });
  $('larvoiceVoiceId').addEventListener('change', () => {
    localStorage.setItem(LS_LARVOICE_VOICE, $('larvoiceVoiceId').value);
    const audio = $('voicePreviewAudio');
    audio.pause();
    audio.removeAttribute('src');
    $('btnPreviewVoice').disabled = false;
    $('btnPreviewVoice').textContent = '▶';
    $('btnPreviewVoice').dataset.state = 'idle';
  });
  $('btnPreviewVoice').addEventListener('click', previewLarVoice);
  $('videoObjective').addEventListener('change', () => {
    updateVideoObjectiveSelection();
    localStorage.setItem(LS_VIDEO_OBJECTIVE, selectedVideoObjective);
  });
  $('useTemplateMode').addEventListener('change', () => {
    localStorage.setItem(LS_USE_TEMPLATE_MODE, $('useTemplateMode').value);
    updateTemplateModeUI();
  });
  $('enableSubtitles').addEventListener('change', () => {
    localStorage.setItem(LS_SUBTITLES, $('enableSubtitles').value);
  });
  $('videoDuration').addEventListener('change', () => {
    localStorage.setItem(LS_VIDEO_DURATION, $('videoDuration').value);
    updateDurationSummary();
  });
  $('ttsSpeed').addEventListener('change', () => {
    localStorage.setItem(LS_TTS_SPEED, $('ttsSpeed').value);
  });
});

function applySettingsFromServer(settings) {
  const logoName = settings.logoName || (settings.logoPath ? basename(settings.logoPath) : 'Chưa chọn');
  $('logoName').textContent = logoName;
  localStorage.setItem(LS_LOGO_KEY, logoName);
  $('btnClearLogo').style.display = settings.logoPath ? 'inline-flex' : 'none';
}

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
  applyAspectRatioCSS();

  $('projTopic').textContent = p.topic;
  $('projDate').textContent  = fmtDate(p.created_at);
  setStatusBadge($('projStatus'), p.status);

  const isError     = p.status === 'error';
  const hasFinal    = p.status === 'done';
  const inPreview   = p.status === 'preview';
  const allSceneHtmlReady = p.scenes?.length > 0 && p.scenes.every(s => s.html_done);
  const allHtmlReady = p.scenes?.length > 0 && allSceneHtmlReady;
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
      const existing = [...$('sceneGrid').querySelectorAll('.scene-card')];
      const before = existing.find(c => Number(c.id.replace('sc-', '')) > stt);
      if (before) {
        $('sceneGrid').insertBefore(card, before);
      } else {
        $('sceneGrid').appendChild(card);
      }
    }
    requestAnimationFrame(updateAllPreviewScales);
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
    larvoiceVoiceId: Number($('larvoiceVoiceId').value) || 1,
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
function setEditorPreviewUnavailable(message = 'Chưa có HTML') {
  const loader = $('previewLoader');
  const frame = $('previewFrame');
  if (frame) {
    frame.removeAttribute('src');
    frame.style.visibility = 'hidden';
  }
  if (loader) {
    loader.textContent = message;
    loader.style.display = 'flex';
  }
}

function loadEditorPreview(stt) {
  const loader = $('previewLoader');
  const frame = $('previewFrame');
  if (loader) {
    loader.textContent = '⏳ Đang tải...';
    loader.style.display = 'flex';
  }
  if (frame) {
    frame.style.visibility = 'visible';
    frame.src = `/api/projects/${currentId}/preview/${stt}?t=${Date.now()}`;
  }
}

async function openEditor(stt) {
  editingTargetType = 'scene';
  editingStt = stt;
  editorBusy = false;
  editingUsesTemplateMode = true;
  $('editVoiceLabel').textContent = 'Voice (lời dẫn)';
  $('editTemplateDataLabel').classList.remove('hidden');
  $('editTemplateData').classList.remove('hidden');
  $('modalTitle').textContent = `Chỉnh sửa Cảnh ${stt}`;
  $('editVoice').value  = '';
  $('editTemplateData').value = '';
  $('editHtml').value   = '';
  setEditorPreviewUnavailable('Đang đọc dữ liệu cảnh...');
  resetEditorButtons();
  $('editorModal').showModal();
  const sc = await api(`/api/projects/${currentId}/scenes/${stt}`);
  editingUsesTemplateMode = sc.useTemplateMode !== false && sc.generationMode !== 'ai-html';
  $('editTemplateDataLabel').textContent = editingUsesTemplateMode ? 'TemplateData JSON' : 'HTML Spec JSON';
  $('editVoice').value  = sc.voice  ?? '';
  $('editTemplateData').value = JSON.stringify(
    editingUsesTemplateMode
      ? (sc.templateData || {})
      : { htmlSpec: sc.htmlSpec || {}, sfxPlan: sc.sfxPlan || [] },
    null,
    2
  );
  $('editHtml').value   = sc.html   ?? '';
  if ((sc.html || '').trim()) {
    loadEditorPreview(stt);
  } else {
    setEditorPreviewUnavailable(sc.html_done ? 'Không tìm thấy file HTML' : 'Chưa có HTML');
  }
  resetEditorButtons();
}

function readTemplateDataEditor() {
  const raw = $('editTemplateData').value.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON mô tả cảnh phải là object');
    }
    return parsed;
  } catch (error) {
    throw new Error(`JSON mô tả cảnh không hợp lệ: ${error.message}`);
  }
}

function readSceneJsonEditor() {
  const parsed = readTemplateDataEditor();
  if (editingUsesTemplateMode) return { templateData: parsed };
  const { sfxPlan, htmlSpec, ...rest } = parsed;
  return {
    htmlSpec: htmlSpec && typeof htmlSpec === 'object' && !Array.isArray(htmlSpec) ? htmlSpec : rest,
    sfxPlan: Array.isArray(sfxPlan) ? sfxPlan : [],
  };
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
  $('btnRegenVoice').classList.remove('hidden');
  $('btnRegenAI').textContent    = editingUsesTemplateMode ? '🧩 Compose lại HTML' : '🤖 AI tạo lại HTML';
  $('btnSaveHtml').textContent   = '💾 Lưu HTML';
  $('btnRerender').textContent   = '🎬 Render lại cảnh này';
  $('btnEditHtmlAI').textContent = '✏️ Sửa HTML với AI';
}

async function regenSceneVoice() {
  if (editorBusy || editingTargetType !== 'scene') return;
  const newVoice = $('editVoice').value.trim();
  if (!newVoice) return alert('Voice không được để trống');

  editorBusy = true;
  disableEditorBtns(true);
  $('btnRegenVoice').textContent = '⏳ Đang tạo TTS + HTML...';

  // Lưu voice + JSON mô tả cảnh mới vào DB/state trước
  let sceneJson;
  try {
    sceneJson = readSceneJsonEditor();
    await api(`/api/projects/${currentId}/scenes/${editingStt}`, 'PUT', {
      voice:  newVoice,
      ...sceneJson,
    });
  } catch (error) {
    editorBusy = false;
    resetEditorButtons();
    return alert(error.message);
  }

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

async function composeSceneHtml() {
  if (editorBusy) return;
  const stt = editingStt;
  editorBusy = true;
  disableEditorBtns(true);
  $('btnRegenAI').textContent = '⏳ Đang compose...';
  let sceneJson;
  try {
    sceneJson = readSceneJsonEditor();
    await api(`/api/projects/${currentId}/scenes/${stt}`, 'PUT', {
      voice:  $('editVoice').value,
      ...sceneJson,
    });
  } catch (error) {
    editorBusy = false;
    resetEditorButtons();
    return alert(error.message);
  }
  const resp = await api(`/api/projects/${currentId}/scenes/${stt}/regen`, 'POST');
  if (resp?.error) {
    editorBusy = false;
    resetEditorButtons();
    return alert(resp.error);
  }
  markSceneHtmlBusy(stt, editingUsesTemplateMode
    ? `[B5] Đang compose lại HTML cảnh ${stt} từ TemplateData...`
    : `[B5] Đang gọi AI tạo lại HTML cảnh ${stt} từ htmlSpec...`);
  closeEditor();
}

async function editSceneHtmlAI() {
  if (editorBusy) return;
  const prompt = $('editHtmlPrompt').value.trim();
  if (!prompt) return alert('Vui lòng nhập mô tả chỉnh sửa.');
  const currentHtml = $('editHtml').value.trim();
  if (!currentHtml) return alert('Không có HTML hiện tại để sửa.');
  let sceneJson;
  try {
    sceneJson = readSceneJsonEditor();
  } catch (error) {
    return alert(error.message);
  }
  editorBusy = true;
  disableEditorBtns(true);
  $('btnEditHtmlAI').textContent = '⏳ Đang sửa...';
  markSceneHtmlBusy(editingStt, `[B5] Đang AI chỉnh sửa HTML cảnh ${editingStt}...`);
  const resp = await api(`/api/projects/${currentId}/scenes/${editingStt}/edit-html`, 'POST', {
    editPrompt: prompt,
    currentHtml,
  });
  editorBusy = false;
  if (resp?.error) {
    unmarkSceneHtmlBusy(editingStt);
    resetEditorButtons();
    return alert(resp.error);
  }
  $('editHtml').value = resp.html;
  $('editHtmlPrompt').value = '';
  await api(`/api/projects/${currentId}/scenes/${editingStt}`, 'PUT', {
    voice:  $('editVoice').value,
    ...sceneJson,
    html:   resp.html,
  });
  unmarkSceneHtmlBusy(editingStt);
  loadEditorPreview(editingStt);
  reloadSceneCard(editingStt);
  resetEditorButtons();
  appendLog(`✓ AI đã sửa HTML cảnh ${editingStt}`);
}

function reloadPreviewIfOpen(stt) {
  if (editingStt !== stt) return;
  setEditorPreviewUnavailable('Đang cập nhật cảnh...');
  api(`/api/projects/${currentId}/scenes/${stt}`).then(sc => {
    editingUsesTemplateMode = sc.useTemplateMode !== false && sc.generationMode !== 'ai-html';
    $('editTemplateDataLabel').textContent = editingUsesTemplateMode ? 'TemplateData JSON' : 'HTML Spec JSON';
    $('editVoice').value = sc.voice ?? '';
    $('editTemplateData').value = JSON.stringify(
      editingUsesTemplateMode
        ? (sc.templateData || {})
        : { htmlSpec: sc.htmlSpec || {}, sfxPlan: sc.sfxPlan || [] },
      null,
      2
    );
    $('editHtml').value = sc.html ?? '';
    if ((sc.html || '').trim()) {
      loadEditorPreview(stt);
    } else {
      setEditorPreviewUnavailable(sc.html_done ? 'Không tìm thấy file HTML' : 'Chưa có HTML');
    }
    editorBusy = false;
    resetEditorButtons();
  });
}

async function saveSceneHtml() {
  if (editorBusy) return;
  disableEditorBtns(true);
  $('btnSaveHtml').textContent = '⏳ Đang lưu...';
  let sceneJson;
  try {
    sceneJson = readSceneJsonEditor();
    await api(`/api/projects/${currentId}/scenes/${editingStt}`, 'PUT', {
      voice:  $('editVoice').value,
      ...sceneJson,
      html:   $('editHtml').value,
    });
  } catch (error) {
    resetEditorButtons();
    return alert(error.message);
  }
  if (($('editHtml').value || '').trim()) {
    loadEditorPreview(editingStt);
  } else {
    setEditorPreviewUnavailable('Chưa có HTML');
  }
  reloadSceneCard(editingStt);
  resetEditorButtons();
  appendLog(`✓ Đã lưu HTML cảnh ${editingStt}`);
}

async function rerenderScene() {
  if (editorBusy) return;
  const stt = editingStt;
  editorBusy = true;
  disableEditorBtns(true);
  $('btnRerender').textContent = '⏳ Đang render...';
  let sceneJson;
  try {
    sceneJson = readSceneJsonEditor();
    await api(`/api/projects/${currentId}/scenes/${stt}`, 'PUT', {
      voice:  $('editVoice').value,
      ...sceneJson,
      html:   $('editHtml').value,
    });
  } catch (error) {
    editorBusy = false;
    resetEditorButtons();
    return alert(error.message);
  }
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
  window.open(`/api/projects/${currentId}/scenes/${stt}/video?t=${Date.now()}`, '_blank');
}

window.addEventListener('resize', () => {
  requestAnimationFrame(updateAllPreviewScales);
});

function sanitizeFilename(originalName) {
  const ext  = originalName.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
  const base = originalName.slice(0, originalName.length - ext.length);
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_').slice(0, 60) + ext;
}

function isSupportedImageFile(file) {
  return /\.(jpe?g|png|webp|gif)$/i.test(file?.name || '');
}

function imageDisplayName(file) {
  return String(file?.name || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim() || 'ảnh upload';
}

function renderUploadedImageList() {
  const count = uploadedImageFiles.length;
  $('imageUploadName').textContent = count ? `${count} ảnh đã chọn` : 'Chưa chọn';
  $('btnClearImages').style.display = count ? 'inline-flex' : 'none';
  $('uploadedImageList').innerHTML = uploadedImageFiles.map(file => `
    <div class="upload-item" title="${esc(file.name)}">
      <span>${esc(imageDisplayName(file))}</span>
    </div>
  `).join('');
}

$('imageFiles').onchange = e => {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (!files.length) return;

  const next = [...uploadedImageFiles];
  let skipped = 0;
  for (const file of files) {
    if (!isSupportedImageFile(file)) {
      skipped += 1;
      continue;
    }
    const exists = next.some(item =>
      item.name === file.name &&
      item.size === file.size &&
      item.lastModified === file.lastModified
    );
    if (!exists) next.push(file);
    if (next.length >= 20) break;
  }
  uploadedImageFiles = next.slice(0, 20);
  renderUploadedImageList();
  if (skipped) alert('Một số file bị bỏ qua. Chỉ hỗ trợ .jpg, .jpeg, .png, .webp, .gif.');
};

$('btnClearImages').onclick = () => {
  uploadedImageFiles = [];
  renderUploadedImageList();
};

$('musicFile').onchange = e => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;

  backgroundMusic = {
    file,
    filename: sanitizeFilename(file.name),
    name: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
  };
  $('musicName').textContent = backgroundMusic.name;
  $('btnClearMusic').style.display = 'inline-flex';
};

$('btnClearMusic').onclick = () => {
  backgroundMusic = null;
  $('musicName').textContent = 'Chưa chọn';
  $('btnClearMusic').style.display = 'none';
};

async function uploadProjectMusic(sessionId) {
  if (!backgroundMusic?.file) return;
  const form = new FormData();
  form.append('music', backgroundMusic.file, backgroundMusic.filename);
  await fetch(`/api/projects/${sessionId}/upload-music`, { method: 'POST', body: form });
}

async function startProjectRequest(payload) {
  if (!uploadedImageFiles.length) {
    return api('/api/start', 'POST', payload);
  }

  const form = new FormData();
  form.append('topic', payload.topic);
  form.append('larvoiceVoiceId', String(payload.larvoiceVoiceId));
  form.append('videoObjective', payload.videoObjective);
  form.append('useTemplateMode', payload.useTemplateMode ? 'true' : 'false');
  form.append('enableSubtitles', payload.enableSubtitles ? 'true' : 'false');
  form.append('videoDurationSec', String(payload.videoDurationSec));
  form.append('ttsSpeed', String(payload.ttsSpeed));
  if (payload.backgroundMusic) {
    form.append('backgroundMusic', JSON.stringify(payload.backgroundMusic));
  }
  for (const file of uploadedImageFiles) {
    form.append('images', file, file.name);
  }

  const r = await fetch('/api/start-with-images', { method: 'POST', body: form });
  const data = await r.json().catch(() => ({}));
  if (!r.ok && !data.error) data.error = `HTTP ${r.status}`;
  return data;
}

// ─── Start new project ────────────────────────────────────────────────────────
$('btnStart').onclick = async () => {
  updateVideoObjectiveSelection();
  const useTemplateMode = isTemplateModeEnabled();
  if (useTemplateMode && !AVAILABLE_SCENE_TEMPLATES.length) {
    return alert('Mục tiêu video đã chọn chưa có template nào. Hãy thêm template vào catalog hoặc chọn Mặc định.');
  }
  const topic = $('topic').value.trim();
  const larvoiceVoiceId = Number($('larvoiceVoiceId').value) || 1;
  const durationPlan = getDurationPlan(Number($('videoDuration').value));
  const ttsSpeed = Number($('ttsSpeed').value) || 1.0;
  if (!topic) return alert('Nhập chủ đề video');
  if (!larvoiceVoiceId) return alert('Chọn giọng đọc LarVoice');

  localStorage.setItem(LS_LARVOICE_VOICE, String(larvoiceVoiceId));
  localStorage.setItem(LS_VIDEO_OBJECTIVE, selectedVideoObjective);
  localStorage.setItem(LS_USE_TEMPLATE_MODE, useTemplateMode ? '1' : '0');

  const backgroundMusicMeta = backgroundMusic ? {
    name: backgroundMusic.name,
    filename: backgroundMusic.filename,
  } : undefined;

  const data = await startProjectRequest({
    topic,
    larvoiceVoiceId,
    backgroundMusic: backgroundMusicMeta,
    videoObjective: selectedVideoObjective,
    useTemplateMode,
    enableSubtitles: $('enableSubtitles').value === '1',
    videoDurationSec: durationPlan.videoDurationSec,
    ttsSpeed,
  });
  if (data.error) return alert(data.error);

  currentId = data.sessionId;
  uploadedImageFiles = [];
  renderUploadedImageList();

  if (backgroundMusic) {
    uploadProjectMusic(currentId).catch(e => console.warn('Music upload:', e));
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
updateSidebar();
