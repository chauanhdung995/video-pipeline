// server.js
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import multer from 'multer';

import { runPipeline, resumePipeline, listSessions, getSession, renderSingleScene, concatFinalVideo, regenSceneVoiceAndHTML } from './src/pipeline.js';
import { saveState, loadState, triggerRender, logEvent } from './src/utils/state.js';
import { generateSceneHTML, editSceneHTML } from './src/agents/sceneAgent.js';
import { getTemplatesForObjective, listVideoObjectives, normalizeVideoObjective } from './src/renderer/hyperframesTemplateSchemas.js';
import { getLarVoiceSampleStatus, listLarVoiceVoices } from './src/agents/ttsAgent.js';
import {
  listProjects, getProject, updateProject, upsertScene, getScene,
  importExistingSessions, syncFromState, deleteProject, deleteAllProjects,
} from './src/db/index.js';
import { getSettings, updateSettings } from './src/utils/settings.js';
import { SESS_DIR, UPLOADS_DIR, ensureDataDirs } from './src/utils/paths.js';
import { SERPER_SCRAPE_API_KEY } from './src/config/apiKeys.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
ensureDataDirs();

function markInterruptedRunningSessions() {
  if (!fs.existsSync(SESS_DIR)) return;
  for (const id of fs.readdirSync(SESS_DIR)) {
    const state = loadState(id);
    if (state?.status !== 'running') continue;
    state.status = 'error';
    state.lastError = 'Pipeline bị ngắt khi server dừng. Bấm Tiếp tục để chạy tiếp từ bước còn thiếu.';
    state.interruptedAt = Date.now();
    saveState(id, state);
    syncFromState(id, state);
    logEvent(id, {
      step: 0,
      msg: 'Pipeline bị ngắt do server restart; có thể bấm Tiếp tục để chạy tiếp.',
      detail: true,
    });
    console.warn(`[Startup] Marked interrupted running session ${id} as resumable`);
  }
}

function safeUploadName(originalName, fallback = 'upload') {
  const raw = path.basename(String(originalName || fallback));
  const ext = path.extname(raw).toLowerCase().replace(/[^a-z0-9.]/g, '') || '';
  const base = raw.slice(0, raw.length - ext.length)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 60) || fallback;
  return `${base}${ext}`;
}

function uniqueUploadName(dir, originalName, fallback = 'upload') {
  const safe = safeUploadName(originalName, fallback);
  const ext = path.extname(safe);
  const base = safe.slice(0, safe.length - ext.length) || fallback;
  let candidate = safe;
  let i = 2;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base}_${i}${ext}`;
    i += 1;
  }
  return candidate;
}

function uploadDisplayName(originalName, filename) {
  const source = String(originalName || filename || 'uploaded image');
  return path.basename(source, path.extname(source)).replace(/[_-]+/g, ' ').trim() || 'uploaded image';
}

function parseJsonField(value) {
  if (value && typeof value === 'object') return value;
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function parseBooleanField(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return true;
}

function buildStartOptions(body = {}, uploadedImages = []) {
  const {
    topic,
    larvoiceVoiceId,
    videoDurationSec,
    ttsSpeed,
    videoObjective,
    useTemplateMode,
  } = body;
  const trimmedTopic = String(topic || '').trim();
  const safeUseTemplateMode = parseBooleanField(useTemplateMode, true);
  const safeVideoObjective = normalizeVideoObjective(videoObjective);
  const allowedTemplates = getTemplatesForObjective(safeVideoObjective);
  if (safeUseTemplateMode && !allowedTemplates.length) {
    return { error: 'Mục tiêu video đã chọn chưa có template nào trong catalog', status: 400 };
  }
  const allowedVideoDurations = new Set([60, 120, 180, 240, 300]);
  const safeVideoDurationSec = allowedVideoDurations.has(Number(videoDurationSec)) ? Number(videoDurationSec) : 120;
  const safeTTSSpeed = Math.max(0.5, Math.min(2.0, Number(ttsSpeed) || 1.0));
  const safeLarVoiceVoiceId = Number(larvoiceVoiceId) || 1;
  if (!trimmedTopic) return { error: 'Thiếu chủ đề video', status: 400 };

  const backgroundMusic = parseJsonField(body.backgroundMusic) || body.backgroundMusic;
  const safeBackgroundMusic = backgroundMusic?.filename ? {
    name: String(backgroundMusic.name || backgroundMusic.filename).slice(0, 120),
    filename: safeUploadName(backgroundMusic.filename, 'background_music'),
  } : undefined;

  return {
    topic: trimmedTopic,
    larvoiceVoiceId: safeLarVoiceVoiceId,
    backgroundMusic: safeBackgroundMusic,
    videoObjective: safeVideoObjective,
    useTemplateMode: safeUseTemplateMode,
    enableSubtitles: parseBooleanField(body.enableSubtitles, true),
    videoDurationSec: safeVideoDurationSec,
    ttsSpeed: safeTTSSpeed,
    uploadedImages,
  };
}

function loadSceneWordTimings(sessionId, stt) {
  const wordsPath = path.join(SESS_DIR, sessionId, 'srt', `${stt}.words.json`);
  if (!fs.existsSync(wordsPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `logo${ext}`);
  },
});
const upload = multer({ storage: logoStorage });

const musicStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(SESS_DIR, req.params.id, 'music');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, safeUploadName(file.originalname, 'background_music')),
});
const musicUpload = multer({ storage: musicStorage, limits: { fileSize: 100 * 1024 * 1024 } });

function ensureStartSessionId(req) {
  if (!req._startSessionId) req._startSessionId = `sess_${Date.now()}`;
  return req._startSessionId;
}

const IMAGE_UPLOAD_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const startImageStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const sessionId = ensureStartSessionId(req);
    const dir = path.join(SESS_DIR, sessionId, 'images', 'uploaded');
    fs.mkdirSync(dir, { recursive: true });
    req._imageUploadDir = dir;
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const dir = req._imageUploadDir || path.join(SESS_DIR, ensureStartSessionId(req), 'images', 'uploaded');
    cb(null, uniqueUploadName(dir, file.originalname, 'uploaded_image'));
  },
});
const startImageUpload = multer({
  storage: startImageStorage,
  limits: { fileSize: 25 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!IMAGE_UPLOAD_EXTS.has(ext)) {
      return cb(new Error('Chỉ hỗ trợ ảnh .jpg, .jpeg, .png, .webp, .gif'));
    }
    cb(null, true);
  },
});

function uploadedImagesFromFiles(files = [], sessionId) {
  return (Array.isArray(files) ? files : []).map(file => ({
    title: uploadDisplayName(file.originalname, file.filename),
    name: uploadDisplayName(file.originalname, file.filename),
    originalName: file.originalname,
    filename: file.filename,
    src: `/sessions/${encodeURIComponent(sessionId)}/images/uploaded/${encodeURIComponent(file.filename)}`,
    path: file.path,
    width: 0,
    height: 0,
    source: 'upload',
  }));
}

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/sessions', express.static(SESS_DIR));

const clients = new Set();
wss.on('connection', ws => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

export function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of clients) if (c.readyState === 1) c.send(data);
}

function logProgress(sessionId, step, msg, extra = {}) {
  broadcast({ sessionId, type: 'progress', step, msg, ...extra });
}

function normalizeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Thiếu URL');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('URL không hợp lệ');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('URL phải bắt đầu bằng http:// hoặc https://');
  }
  return parsed.href;
}

// ─── Settings endpoints ───────────────────────────────────────────────────────

app.get('/api/settings', (_req, res) => {
  const settings = getSettings();
  res.json({
    logoPath: settings.logoPath,
    logoName: settings.logoPath ? path.basename(settings.logoPath) : '',
    logoExists: settings.logoPath ? fs.existsSync(settings.logoPath) : false,
  });
});

app.get('/api/larvoice/voices', async (_req, res) => {
  try {
    const voices = await listLarVoiceVoices();
    res.json({
      voices: voices.map(voice => ({
        ...voice,
        sample: getLarVoiceSampleStatus(voice.id),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/larvoice/sample', async (req, res) => {
  try {
    const larvoiceVoiceId = Number(req.body?.larvoiceVoiceId);
    if (!Number.isFinite(larvoiceVoiceId)) return res.status(400).json({ error: 'Thiếu LarVoice Voice ID' });
    const sample = getLarVoiceSampleStatus(larvoiceVoiceId);
    if (sample.status !== 'ready') {
      const code = sample.status === 'failed' ? 409 : 404;
      return res.status(code).json({ error: sample.error, sample });
    }
    res.json(sample);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/video-objectives', (_req, res) => {
  res.json({ objectives: listVideoObjectives() });
});

app.post('/api/crawl-url', async (req, res) => {
  let url;
  try {
    url = normalizeHttpUrl(req.body?.url);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    const scrapeRes = await fetch('https://scrape.serper.dev', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_SCRAPE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(60000),
    });
    const raw = await scrapeRes.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      return res.status(502).json({ error: `Scrape API trả về dữ liệu không phải JSON: ${raw.slice(0, 200)}` });
    }
    if (!scrapeRes.ok) {
      const msg = data?.message || data?.error || raw || `HTTP ${scrapeRes.status}`;
      return res.status(scrapeRes.status).json({ error: String(msg).replaceAll(SERPER_SCRAPE_API_KEY, '***').slice(0, 500) });
    }

    const text = String(data?.text || '').trim();
    if (!text) return res.status(502).json({ error: 'Scrape API không trả về trường text' });
    res.json({ text });
  } catch (error) {
    const message = error?.name === 'TimeoutError'
      ? 'Scrape API quá thời gian chờ'
      : String(error?.message || error).replaceAll(SERPER_SCRAPE_API_KEY, '***');
    res.status(500).json({ error: message });
  }
});

app.post('/api/settings/logo', upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Không có file' });
  const next = updateSettings({ logoPath: req.file.path });
  res.json({
    ok: true,
    path: next.logoPath,
    logoName: path.basename(next.logoPath),
  });
});

app.delete('/api/settings/logo', (_req, res) => {
  const next = updateSettings({ logoPath: '' });
  res.json({
    ok: true,
    path: next.logoPath,
    logoName: '',
  });
});

// ─── Pipeline endpoints (keep for start/resume) ───────────────────────────────

app.post('/api/projects/:id/upload-music', musicUpload.single('music'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Không có file nhạc' });
  res.json({
    ok: true,
    filename: req.file.filename,
    path: req.file.path,
  });
});

app.post('/api/start', async (req, res) => {
  const sessionId = `sess_${Date.now()}`;
  const options = buildStartOptions(req.body);
  if (options.error) return res.status(options.status || 400).json({ error: options.error });

  res.json({ sessionId });
  runPipeline({
    sessionId,
    ...options,
  }).catch(e => {
    console.error(`[Pipeline Error] ${sessionId}:`, e);
    broadcast({ sessionId, type: 'error', msg: e.message });
  });
});

app.post('/api/start-with-images', (req, res) => {
  startImageUpload.array('images', 20)(req, res, (uploadError) => {
    if (uploadError) return res.status(400).json({ error: uploadError.message });
    const sessionId = ensureStartSessionId(req);
    const uploadedImages = uploadedImagesFromFiles(req.files, sessionId);
    const options = buildStartOptions(req.body, uploadedImages);
    if (options.error) return res.status(options.status || 400).json({ error: options.error });

    res.json({ sessionId, uploadedImages });
    runPipeline({
      sessionId,
      ...options,
    }).catch(e => {
      console.error(`[Pipeline Error] ${sessionId}:`, e);
      broadcast({ sessionId, type: 'error', msg: e.message });
    });
  });
});

app.post('/api/resume/:id', async (req, res) => {
  const { larvoiceVoiceId } = req.body;
  const sessionId = req.params.id;
  res.json({ ok: true });
  resumePipeline({ sessionId, larvoiceVoiceId }).catch(e => {
    broadcast({ sessionId, type: 'error', msg: e.message });
  });
});

// Tiếp tục pipeline từ chỗ bị lỗi — load keys mới từ client nếu có, còn lại dùng keys đã lưu trong state
app.post('/api/projects/:id/resume', async (req, res) => {
  const sessionId = req.params.id;
  const state = loadState(sessionId);
  if (!state) return res.status(404).json({ error: 'Không tìm thấy dự án' });
  if (state.status === 'running') return res.status(409).json({ error: 'Pipeline đang chạy' });
  const { larvoiceVoiceId, ttsSpeed } = req.body || {};
  res.json({ ok: true });
  resumePipeline({ sessionId, larvoiceVoiceId, ttsSpeed }).catch(e => {
    console.error(`[Resume Error] ${sessionId}:`, e.message);
    broadcast({ sessionId, type: 'error', msg: e.message });
  });
});

app.delete('/api/projects/:id', (req, res) => {
  deleteProject(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/projects', (_req, res) => {
  deleteAllProjects();
  res.json({ ok: true });
});

// Legacy session list (used by resume modal)
app.get('/api/sessions', (req, res) => res.json(listSessions()));
app.get('/api/session/:id', (req, res) => res.json(getSession(req.params.id)));

// ─── Project browser ──────────────────────────────────────────────────────────

app.get('/api/projects', (_req, res) => res.json(listProjects()));

app.get('/api/projects/:id', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy' });
  const state = loadState(req.params.id);
  if (state) {
    p.useTemplateMode = state.useTemplateMode !== false;
    p.generationMode = state.generationMode || (p.useTemplateMode ? 'template' : 'ai-html');
  }
  res.json(p);
});

// Serve final video
app.get('/api/projects/:id/video', (req, res) => {
  const file = path.join(SESS_DIR, req.params.id, 'final.mp4');
  if (fs.existsSync(file)) res.sendFile(file);
  else res.status(404).json({ error: 'Chưa có video' });
});

// Serve individual scene video
app.get('/api/projects/:id/scenes/:stt/video', (req, res) => {
  const file = path.join(SESS_DIR, req.params.id, 'video', `${req.params.stt}.mp4`);
  if (fs.existsSync(file)) res.sendFile(file);
  else res.status(404).json({ error: 'Chưa có video cảnh này' });
});

// Serve scene HTML with file:// paths rewritten for iframe preview
app.get('/api/projects/:id/preview/:stt', (req, res) => {
  const htmlPath = path.join(SESS_DIR, req.params.id, 'html', `${req.params.stt}.html`);
  if (!fs.existsSync(htmlPath)) return res.status(404).send('Not found');
  let html = fs.readFileSync(htmlPath, 'utf8');
  // Rewrite file:// project-root paths
  html = html.replaceAll(pathToFileURL(`${__dirname}${path.sep}`).href, '/');
  html = html.replaceAll('file://' + __dirname + '/', '/');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Get scene HTML content for editor
app.get('/api/projects/:id/scenes/:stt', (req, res) => {
  const { id, stt } = req.params;
  const sc = getScene(id, Number(stt));
  if (!sc) return res.status(404).json({ error: 'Không tìm thấy cảnh' });
  const stateSc = loadState(id)?.scenes?.find(s => Number(s.stt) === Number(stt));
  if (stateSc?.templateData) sc.templateData = stateSc.templateData;
  if (stateSc?.htmlSpec) sc.htmlSpec = stateSc.htmlSpec;
  if (stateSc?.sfxPlan) sc.sfxPlan = stateSc.sfxPlan;
  if (stateSc?.imageCandidates) sc.imageCandidates = stateSc.imageCandidates;
  if (stateSc?.uploadedImageCandidates) sc.uploadedImageCandidates = stateSc.uploadedImageCandidates;
  if (stateSc?.imageRequired !== undefined) sc.imageRequired = stateSc.imageRequired;
  if (stateSc?.generationMode) sc.generationMode = stateSc.generationMode;
  if (stateSc?.useTemplateMode !== undefined) sc.useTemplateMode = stateSc.useTemplateMode;
  if (stateSc?.ttsVoice) sc.ttsVoice = stateSc.ttsVoice;
  const htmlPath = path.join(SESS_DIR, id, 'html', `${stt}.html`);
  sc.html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
  res.json(sc);
});

// Update scene fields and/or save HTML directly
app.put('/api/projects/:id/scenes/:stt', (req, res) => {
  const { id, stt } = req.params;
  const { voice, template, templateData, htmlSpec, sfxPlan, html } = req.body;

  // Update DB fields
  const dbFields = {};
  if (voice  !== undefined) dbFields.voice  = voice;
  if (template !== undefined) dbFields.template = template;
  if (Object.keys(dbFields).length) upsertScene(id, Number(stt), dbFields);

  // Also update state.json so pipeline resumability stays in sync
  const state = loadState(id);
  if (state?.scenes) {
    const sc = state.scenes.find(s => s.stt === Number(stt));
    if (sc) {
      if (voice  !== undefined) sc.voice  = voice;
      if (template !== undefined) sc.template = template;
      if (templateData !== undefined) sc.templateData = templateData;
      if (htmlSpec !== undefined) sc.htmlSpec = htmlSpec;
      if (sfxPlan !== undefined) sc.sfxPlan = Array.isArray(sfxPlan) ? sfxPlan : [];
    }
    saveState(id, state);
  }

  // Save HTML to disk
  if (html !== undefined) {
    const htmlPath = path.join(SESS_DIR, id, 'html', `${stt}.html`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    // Mark render_done=0 so re-render will pick it up
    upsertScene(id, Number(stt), { html_done: 1, render_done: 0 });
    if (state?.scenes) {
      const sc = state.scenes.find(s => s.stt === Number(stt));
      if (sc) {
        sc.htmlDone = true;
        sc.htmlEdited = true;
        sc.renderDone = false;
      }
      saveState(id, state);
    }
    // Remove stale silent video
    const silentPath = path.join(SESS_DIR, id, 'video', `${stt}_silent.mp4`);
    if (fs.existsSync(silentPath)) fs.unlinkSync(silentPath);
  }

  res.json({ ok: true });
});

// Regenerate scene HTML via AI, then broadcast result
app.post('/api/projects/:id/scenes/:stt/regen', async (req, res) => {
  const { id, stt } = req.params;
  const project = getProject(id);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });
  const sc = project.scenes.find(s => s.stt === Number(stt));
  if (!sc) return res.status(404).json({ error: 'Không tìm thấy cảnh' });

  // Compose deterministic HTML from the current voice/SRT/word timings/templateData.
  const state = loadState(id);
  const stateSc = state?.scenes?.find(s => s.stt === Number(stt));
  const sceneForComposer = {
    ...sc,
    ...(stateSc || {}),
    srt: stateSc?.srt ?? sc.srt ?? '',
    wordTimings: stateSc?.wordTimings || loadSceneWordTimings(id, Number(stt)),
  };
  const useTemplateMode = state?.useTemplateMode !== false;

  res.json({ ok: true });
  logProgress(id, 5, useTemplateMode
    ? `Đang compose lại HTML cảnh ${stt} từ TemplateData...`
    : `Đang gọi AI tạo lại HTML cảnh ${stt} từ htmlSpec...`);
  try {
    const html = await generateSceneHTML({
      scene: sceneForComposer,
      keys: { sessionId: id },
      onLog: (msg) => logProgress(id, 5, msg, { detail: true, stt: Number(stt) }),
      sceneCount: state?.scenes?.length || 0,
      useTemplateMode,
    });
    const htmlPath = path.join(SESS_DIR, id, 'html', `${stt}.html`);
    fs.writeFileSync(htmlPath, html);
    upsertScene(id, Number(stt), { html_done: 1, render_done: 0 });
    if (state?.scenes) {
      const s = state.scenes.find(s => s.stt === Number(stt));
      if (s) { s.htmlDone = true; s.htmlEdited = false; s.renderDone = false; }
      const sp = path.join(SESS_DIR, id, 'video', `${stt}_silent.mp4`);
      if (fs.existsSync(sp)) fs.unlinkSync(sp);
      saveState(id, state);
    }
    broadcast({ sessionId: id, type: 'scene_regenerated', stt: Number(stt) });
  } catch (e) {
    broadcast({ sessionId: id, type: 'error', msg: `Lỗi tạo lại cảnh ${stt}: ${e.message}` });
  }
});

// Edit existing scene HTML via AI prompt
app.post('/api/projects/:id/scenes/:stt/edit-html', async (req, res) => {
  const { id, stt } = req.params;
  const { editPrompt, currentHtml } = req.body;
  if (!editPrompt || !currentHtml) return res.status(400).json({ error: 'Thiếu editPrompt hoặc currentHtml' });
  const project = getProject(id);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });
  const state = loadState(id);
  const aiKeys = { sessionId: id };
  try {
    const html = await editSceneHTML({
      currentHtml,
      editPrompt,
      keys: aiKeys,
      onLog: (msg) => logProgress(id, 5, msg, { detail: true, stt: Number(stt) }),
    });
    res.json({ html });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Tạo lại TTS + SRT + HTML cho 1 cảnh khi user sửa voice
app.post('/api/projects/:id/scenes/:stt/regen-voice', async (req, res) => {
  const { id, stt } = req.params;
  const { voice } = req.body;
  if (!String(voice || '').trim()) return res.status(400).json({ error: 'Thiếu voice text' });
  const state = loadState(id);
  if (!state) return res.status(404).json({ error: 'Không tìm thấy dự án' });
  res.json({ ok: true });
  logProgress(id, 4, `Tạo lại TTS + HTML cảnh ${stt}...`);
  regenSceneVoiceAndHTML({
    sessionId: id,
    stt: Number(stt),
    newVoice: String(voice).trim(),
    onLog: (msg) => logProgress(id, 4, msg, { detail: true, stt: Number(stt) }),
  }).then(() => {
    broadcast({ sessionId: id, type: 'scene_regenerated', stt: Number(stt) });
  }).catch(e => {
    broadcast({ sessionId: id, type: 'error', msg: `Lỗi tạo lại voice cảnh ${stt}: ${e.message}` });
  });
});

// Re-render a single scene video (after HTML edit or regen) — chỉ render cảnh, KHÔNG tự concat
app.post('/api/projects/:id/scenes/:stt/rerender', async (req, res) => {
  const { id, stt } = req.params;
  res.json({ ok: true });
  renderSingleScene(id, Number(stt)).catch(e => {
    broadcast({ sessionId: id, type: 'error', msg: `Lỗi render cảnh ${stt}: ${e.message}` });
  });
});

// Trigger full B6+B7 render (user approved previews — new project flow)
app.post('/api/projects/:id/render', (req, res) => {
  const { id } = req.params;
  const state = loadState(id);
  if (!state) return res.status(404).json({ error: 'Không tìm thấy' });
  state.renderTriggered = true;
  saveState(id, state);
  syncFromState(id, state);
  const resumedPendingWait = triggerRender(id);
  if (!resumedPendingWait) {
    resumePipeline({ sessionId: id }).catch(e => {
      broadcast({ sessionId: id, type: 'error', msg: `Lỗi tiếp tục render: ${e.message}` });
    });
  }
  res.json({ ok: true });
});

// Concat only — B7 (dùng khi tất cả cảnh đã render xong, chỉ ghép lại video cuối)
app.post('/api/projects/:id/concat', (req, res) => {
  const { id } = req.params;
  res.json({ ok: true });
  concatFinalVideo(id).catch(e => {
    broadcast({ sessionId: id, type: 'error', msg: `Lỗi ghép video: ${e.message}` });
  });
});

// ─── Legacy video endpoint ────────────────────────────────────────────────────

app.get('/api/video/:id', (req, res) => {
  const file = path.join(SESS_DIR, req.params.id, 'final.mp4');
  if (fs.existsSync(file)) res.sendFile(file);
  else res.status(404).json({ error: 'Chưa có video' });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

importExistingSessions();
markInterruptedRunningSessions();

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, () => console.log(`▶ http://localhost:${PORT}`));
