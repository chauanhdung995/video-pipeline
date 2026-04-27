// server.js
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';

import { pathToFileURL } from 'url';
import { runPipeline, resumePipeline, listSessions, getSession, renderSingleScene, concatFinalVideo, renderProjectThumbnail, regenSceneVoiceAndHTML } from './src/pipeline.js';
import { saveState, loadState, triggerRender } from './src/utils/state.js';
import { generateSceneHTML, generateThumbnailHTML, editSceneHTML, editThumbnailHTML } from './src/agents/sceneAgent.js';
import { normalizeUserScriptInput } from './src/agents/scriptAgent.js';
import {
  listProjects, getProject, updateProject, upsertScene, getScene,
  importExistingSessions, syncFromState, deleteProject, deleteAllProjects,
  listStyles, getStyle, createStyle, deleteStyle,
} from './src/db/index.js';
import { DEFAULT_STYLE_GUIDE } from './src/agents/sceneAgent.js';
import { getSettings, updateSettings } from './src/utils/settings.js';
import { SESS_DIR, UPLOADS_DIR, ensureDataDirs } from './src/utils/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
ensureDataDirs();

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `logo${ext}`);
  },
});
const upload = multer({ storage: logoStorage });

const assetStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(SESS_DIR, req.params.id, 'assets');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, file.originalname),
});
const assetUpload = multer({ storage: assetStorage, limits: { fileSize: 100 * 1024 * 1024 } });

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/sessions', express.static(SESS_DIR));

// Serve brand specificities (hardcoded folder)
app.use('/brand-specificities', express.static(path.join(__dirname, 'brand-specificities')));

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

// ─── Settings endpoints ───────────────────────────────────────────────────────

app.get('/api/settings', (_req, res) => {
  const settings = getSettings();
  res.json({
    logoPath: settings.logoPath,
    logoName: settings.logoPath ? path.basename(settings.logoPath) : '',
    logoExists: settings.logoPath ? fs.existsSync(settings.logoPath) : false,
  });
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


// ─── Style endpoints ──────────────────────────────────────────────────────────

const STYLE_GEN_PROMPT = (domain, exampleStyleGuide) => `Tạo style guide cho video ngắn (TikTok/Reels/Shorts) với chủ đề lĩnh vực: "${domain}"

Style guide được dùng để hướng dẫn AI tạo HTML animation cảnh video. Cần bao gồm đầy đủ 7 section theo thứ tự:
1. MÀU - bảng màu primary + gradient phù hợp lĩnh vực
2. FONT SIZE - gợi ý font và kích thước px
3. TIẾNG VIỆT — BẮT BUỘC (giữ nguyên rules)
4. TEXT EFFECT PRESETS - các hiệu ứng text với màu đã chọn
5. DOMAIN ICONS/EMOJIS - SVG inline + emoji đặc thù lĩnh vực
6. AMBIENT GỢI Ý - tsParticles/bokeh phù hợp
7. MAPPING CONCEPT → VISUAL - mapping cụ thể cho lĩnh vực

Ví dụ về style guide cho lĩnh vực "Tài chính / Crypto":
---
${exampleStyleGuide}
---

Bây giờ hãy tạo style guide tương tự cho lĩnh vực: "${domain}"

Trả về JSON hợp lệ với đúng 3 trường:
{
  "name": "Tên phong cách ngắn gọn (≤ 30 ký tự)",
  "description": "Mô tả 1 câu về phong cách và sự phù hợp",
  "styleGuide": "... nội dung text đầy đủ 7 section (KHÔNG lồng JSON, KHÔNG dùng backtick)..."
}

TIẾNG VIỆT section BẮT BUỘC phải có nguyên văn:
• Mọi text element PHẢI dùng class="txt" (đã định nghĩa trong CSS template).
• KHÔNG dùng overflow:hidden trên container chứa text — dấu tiếng Việt phía trên (ắ, ế, ổ...) sẽ bị cắt.
• Nếu dùng inline style: thêm line-height:1.5;overflow:visible;padding-top:0.15em.
• Tránh đặt text sát phần tử khác phía trên — để margin-top tối thiểu 20px để dấu không bị che.

CHỈ TRẢ VỀ JSON, KHÔNG GIẢI THÍCH, KHÔNG MARKDOWN.`;

app.get('/api/styles', (_req, res) => {
  res.json(listStyles());
});

app.post('/api/styles/generate', async (req, res) => {
  const { domain, aiProvider, chato1Keys: c1Keys, geminiKeys: gmKeys, openaiKeys: oaKeys } = req.body;
  if (!domain?.trim()) return res.status(400).json({ error: 'Thiếu domain' });

  const keys = {
    aiProvider: aiProvider || 'chato1',
    chato1: c1Keys || [],
    geminiKeys: gmKeys || [],
    openaiKeys: oaKeys || [],
  };
  if (keys.aiProvider === 'chato1' && !keys.chato1.length)
    return res.status(400).json({ error: 'Thiếu Chato1 API keys' });
  if (keys.aiProvider === 'gemini' && !keys.geminiKeys.length)
    return res.status(400).json({ error: 'Thiếu Gemini API keys' });
  if (keys.aiProvider === 'openai' && !keys.openaiKeys.length)
    return res.status(400).json({ error: 'Thiếu OpenAI API keys' });

  try {
    const { callAI } = await import('./src/services/aiRouter.js');
    const prompt = STYLE_GEN_PROMPT(domain.trim(), DEFAULT_STYLE_GUIDE);
    const { result } = await callAI({ prompt, isJson: true, keys });
    if (!result.name || !result.styleGuide)
      return res.status(500).json({ error: 'AI trả về thiếu trường name/styleGuide' });

    const id = createStyle({
      name: result.name,
      description: result.description || '',
      styleGuide: result.styleGuide,
    });
    res.json({ id, name: result.name, description: result.description || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/styles/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === 1) return res.status(400).json({ error: 'Không thể xóa phong cách mặc định' });
  deleteStyle(id);
  res.json({ ok: true });
});

// ─── Pipeline endpoints (keep for start/resume) ───────────────────────────────

app.post('/api/projects/:id/upload-assets', assetUpload.array('files'), (req, res) => {
  res.json({ ok: true, count: req.files?.length ?? 0 });
});

app.post('/api/start', async (req, res) => {
  const {
    topic,
    scriptJson,
    chato1Keys,
    openaiKeys,
    ttsProvider,
    lucylabKey,
    voiceId,
    vbeeKey,
    vbeeAppId,
    vbeeVoiceCode,
    projectAssets,
    outputAspectRatio,
    aiProvider,
    geminiKeys,
    enableSubtitles,
    styleId,
    videoDurationSec,
    sceneDurationSec,
    ttsSpeed,
  } = req.body;
  const provider = aiProvider || 'chato1';
  const resolvedTTSProvider = ttsProvider || 'lucylab';
  const trimmedTopic = String(topic || '').trim();
  let manualScript;
  if (scriptJson != null && String(scriptJson).trim()) {
    try {
      manualScript = normalizeUserScriptInput(JSON.parse(String(scriptJson)));
    } catch (error) {
      return res.status(400).json({ error: `JSON kịch bản không hợp lệ: ${error.message}` });
    }
  }
  const allowedVideoDurations = new Set([60, 120, 180, 240, 300]);
  const safeVideoDurationSec = allowedVideoDurations.has(Number(videoDurationSec)) ? Number(videoDurationSec) : 120;
  const sceneDurationRules = {
    60:  [5, 7, 10],
    120: [7, 10, 12, 15],
    180: [5, 7, 10, 12, 15],
    240: [10, 12, 15, 20],
    300: [10, 12, 15, 20],
  };
  const allowedSceneDurations = sceneDurationRules[safeVideoDurationSec] || [7, 10, 12, 15];
  const preferredSceneDuration = [15, 12, 10, 7, 5, 20].find(d => allowedSceneDurations.includes(d)) ?? allowedSceneDurations[0];
  const requestedSceneDuration = Number(sceneDurationSec);
  const safeSceneDurationSec = allowedSceneDurations.includes(requestedSceneDuration)
    ? requestedSceneDuration
    : preferredSceneDuration;
  const safeTTSSpeed = Math.max(0.5, Math.min(2.0, Number(ttsSpeed) || 1.0));
  if (!trimmedTopic && !manualScript) return res.status(400).json({ error: 'Thiếu topic hoặc JSON kịch bản' });
  if (!manualScript && provider === 'chato1' && !chato1Keys?.length)
    return res.status(400).json({ error: 'Thiếu Chato1 API keys' });
  if (!manualScript && provider === 'gemini' && !geminiKeys?.length)
    return res.status(400).json({ error: 'Thiếu Gemini API keys' });
  if (!manualScript && provider === 'openai' && !openaiKeys?.length)
    return res.status(400).json({ error: 'Thiếu OpenAI API keys' });
  if (resolvedTTSProvider === 'lucylab' && !lucylabKey)
    return res.status(400).json({ error: 'Thiếu LucyLab API key' });
  if (resolvedTTSProvider === 'vbee' && !vbeeKey)
    return res.status(400).json({ error: 'Thiếu Vbee API key' });
  if (resolvedTTSProvider === 'vbee' && !vbeeAppId)
    return res.status(400).json({ error: 'Thiếu Vbee Project ID' });
  if (resolvedTTSProvider === 'vbee' && !vbeeVoiceCode)
    return res.status(400).json({ error: 'Thiếu Vbee Voice ID' });

  const styleRow = styleId ? getStyle(styleId) : null;
  const styleGuide = styleRow?.style_guide ?? DEFAULT_STYLE_GUIDE;

  const sessionId = `sess_${Date.now()}`;

  // Enrich asset metadata with predicted file:// URLs (files uploaded separately right after)
  const enrichedAssets = (projectAssets || []).map(a => ({
    ...a,
    fileUrl: pathToFileURL(path.join(SESS_DIR, sessionId, 'assets', a.filename)).href,
  }));

  res.json({ sessionId });
  runPipeline({
    sessionId,
    topic: trimmedTopic || manualScript?.thumbnail?.title || 'Kịch bản thủ công',
    script: manualScript?.scenes,
    thumbnail: manualScript?.thumbnail,
    chato1Keys,
    openaiKeys: openaiKeys?.length ? openaiKeys : undefined,
    ttsProvider: resolvedTTSProvider,
    lucylabKey,
    voiceId,
    vbeeKey,
    vbeeAppId,
    vbeeVoiceCode,
    projectAssets: enrichedAssets.length ? enrichedAssets : undefined,
    outputAspectRatio: outputAspectRatio || '9:16',
    aiProvider: provider,
    geminiKeys: geminiKeys?.length ? geminiKeys : undefined,
    enableSubtitles: enableSubtitles !== false,
    styleGuide,
    videoDurationSec: safeVideoDurationSec,
    sceneDurationSec: safeSceneDurationSec,
    ttsSpeed: safeTTSSpeed,
  }).catch(e => {
    console.error(`[Pipeline Error] ${sessionId}:`, e);
    broadcast({ sessionId, type: 'error', msg: e.message });
  });
});

app.post('/api/resume/:id', async (req, res) => {
  const { chato1Keys, openaiKeys, ttsProvider, lucylabKey, voiceId, vbeeKey, vbeeAppId, vbeeVoiceCode } = req.body;
  const sessionId = req.params.id;
  res.json({ ok: true });
  resumePipeline({ sessionId, chato1Keys, openaiKeys, ttsProvider, lucylabKey, voiceId, vbeeKey, vbeeAppId, vbeeVoiceCode }).catch(e => {
    broadcast({ sessionId, type: 'error', msg: e.message });
  });
});

// Tiếp tục pipeline từ chỗ bị lỗi — load keys mới từ client nếu có, còn lại dùng keys đã lưu trong state
app.post('/api/projects/:id/resume', async (req, res) => {
  const sessionId = req.params.id;
  const state = loadState(sessionId);
  if (!state) return res.status(404).json({ error: 'Không tìm thấy dự án' });
  if (state.status === 'running') return res.status(409).json({ error: 'Pipeline đang chạy' });
  const { chato1Keys, openaiKeys, geminiKeys, ttsProvider, lucylabKey, voiceId, vbeeKey, vbeeAppId, vbeeVoiceCode, ttsSpeed } = req.body || {};
  res.json({ ok: true });
  resumePipeline({ sessionId, chato1Keys, openaiKeys, geminiKeys, ttsProvider, lucylabKey, voiceId, vbeeKey, vbeeAppId, vbeeVoiceCode, ttsSpeed }).catch(e => {
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

app.get('/api/projects/:id/thumbnail/image', (req, res) => {
  const file = path.join(SESS_DIR, req.params.id, 'thumbnail', 'thumbnail.jpg');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Chưa có thumbnail' });
  if (req.query.download === '1') return res.download(file, `${req.params.id}-thumbnail.jpg`);
  return res.sendFile(file);
});

// Serve scene HTML with file:// paths rewritten for iframe preview
app.get('/api/projects/:id/preview/:stt', (req, res) => {
  const htmlPath = path.join(SESS_DIR, req.params.id, 'html', `${req.params.stt}.html`);
  if (!fs.existsSync(htmlPath)) return res.status(404).send('Not found');
  let html = fs.readFileSync(htmlPath, 'utf8');
  // Rewrite file:// project-root paths
  html = html.replaceAll('file://' + __dirname + '/', '/');
  // Rewrite file:// brand-specificities paths → /brand-specificities/
  const brandDir = path.join(__dirname, 'brand-specificities');
  html = html.replaceAll(pathToFileURL(brandDir).href.replace(/\/?$/, '/'), '/brand-specificities/');
  html = html.replaceAll('file://' + brandDir.replace(/\/?$/, '/'), '/brand-specificities/');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.get('/api/projects/:id/thumbnail/preview', (req, res) => {
  const htmlPath = path.join(SESS_DIR, req.params.id, 'html', 'thumbnail.html');
  if (!fs.existsSync(htmlPath)) return res.status(404).send('Not found');
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replaceAll('file://' + __dirname + '/', '/');
  const brandDir = path.join(__dirname, 'brand-specificities');
  html = html.replaceAll(pathToFileURL(brandDir).href.replace(/\/?$/, '/'), '/brand-specificities/');
  html = html.replaceAll('file://' + brandDir.replace(/\/?$/, '/'), '/brand-specificities/');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Get scene HTML content for editor
app.get('/api/projects/:id/scenes/:stt', (req, res) => {
  const { id, stt } = req.params;
  const sc = getScene(id, Number(stt));
  if (!sc) return res.status(404).json({ error: 'Không tìm thấy cảnh' });
  const htmlPath = path.join(SESS_DIR, id, 'html', `${stt}.html`);
  sc.html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
  res.json(sc);
});

app.get('/api/projects/:id/thumbnail', (req, res) => {
  const state = loadState(req.params.id);
  if (!state?.thumbnail) return res.status(404).json({ error: 'Không tìm thấy thumbnail' });
  const htmlPath = path.join(SESS_DIR, req.params.id, 'html', 'thumbnail.html');
  res.json({
    title: state.thumbnail.title || '',
    prompt: state.thumbnail.prompt || '',
    html_done: Boolean(state.thumbnail.htmlDone),
    image_done: Boolean(state.thumbnail.imageDone),
    html: fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '',
  });
});

// Update scene fields (voice, visual) and/or save HTML directly
app.put('/api/projects/:id/scenes/:stt', (req, res) => {
  const { id, stt } = req.params;
  const { voice, visual, html } = req.body;

  // Update DB fields
  const dbFields = {};
  if (voice  !== undefined) dbFields.voice  = voice;
  if (visual !== undefined) dbFields.visual = visual;
  if (Object.keys(dbFields).length) upsertScene(id, Number(stt), dbFields);

  // Also update state.json so pipeline resumability stays in sync
  const state = loadState(id);
  if (state?.scenes) {
    const sc = state.scenes.find(s => s.stt === Number(stt));
    if (sc) {
      if (voice  !== undefined) sc.voice  = voice;
      if (visual !== undefined) sc.visual = visual;
    }
    saveState(id, state);
  }

  // Save HTML to disk
  if (html !== undefined) {
    const htmlPath = path.join(SESS_DIR, id, 'html', `${stt}.html`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    // Mark render_done=0 so re-render will pick it up
    upsertScene(id, Number(stt), { render_done: 0 });
    if (state?.scenes) {
      const sc = state.scenes.find(s => s.stt === Number(stt));
      if (sc) sc.renderDone = false;
      saveState(id, state);
    }
    // Remove stale silent video
    const silentPath = path.join(SESS_DIR, id, 'video', `${stt}_silent.mp4`);
    if (fs.existsSync(silentPath)) fs.unlinkSync(silentPath);
  }

  res.json({ ok: true });
});

app.put('/api/projects/:id/thumbnail', async (req, res) => {
  const { id } = req.params;
  const { title, prompt, html } = req.body;
  const state = loadState(id);
  if (!state) return res.status(404).json({ error: 'Không tìm thấy dự án' });

  state.thumbnail = {
    ...(state.thumbnail || {}),
    ...(title !== undefined ? { title } : {}),
    ...(prompt !== undefined ? { prompt } : {}),
  };

  if (html !== undefined) {
    const htmlPath = path.join(SESS_DIR, id, 'html', 'thumbnail.html');
    fs.writeFileSync(htmlPath, html, 'utf8');
    state.thumbnail.htmlDone = true;
    state.thumbnail.imageDone = false;
    saveState(id, state);
    await renderProjectThumbnail(id);
  } else {
    saveState(id, state);
  }

  broadcast({ sessionId: id, type: 'thumbnail_updated' });
  res.json({ ok: true });
});

// Regenerate scene HTML via AI, then broadcast result
app.post('/api/projects/:id/scenes/:stt/regen', async (req, res) => {
  const { id, stt } = req.params;
  const project = getProject(id);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });
  const sc = project.scenes.find(s => s.stt === Number(stt));
  if (!sc) return res.status(404).json({ error: 'Không tìm thấy cảnh' });

  // Load SRT from file/state for full scene context
  const state = loadState(id);
  const stateSc = state?.scenes?.find(s => s.stt === Number(stt));
  const sceneForAI = { ...sc, srt: stateSc?.srt ?? sc.srt ?? '' };

  res.json({ ok: true });
  logProgress(id, 5, `Đang tạo lại HTML cảnh ${stt}...`);
  try {
    const sceneProjectAssets = state?.sceneAssetsMap?.[Number(stt)] ?? [];
    const aiKeys = {
      sessionId: id,
      aiProvider: state?.aiProvider || 'chato1',
      chato1: state?.chato1Keys || project.chato1_keys || [],
      geminiKeys: state?.geminiKeys || [],
      openaiKeys: state?.openaiKeys || [],
    };
    const html = await generateSceneHTML({
      scene: sceneForAI,
      keys: aiKeys,
      onLog: (msg) => logProgress(id, 5, msg, { detail: true, stt: Number(stt) }),
      projectAssets: sceneProjectAssets,
      outputAspectRatio: state?.outputAspectRatio || '9:16',
      styleGuide: state?.styleGuide || DEFAULT_STYLE_GUIDE,
    });
    const htmlPath = path.join(SESS_DIR, id, 'html', `${stt}.html`);
    fs.writeFileSync(htmlPath, html);
    upsertScene(id, Number(stt), { html_done: 1, render_done: 0 });
    if (state?.scenes) {
      const s = state.scenes.find(s => s.stt === Number(stt));
      if (s) { s.htmlDone = true; s.renderDone = false; }
      const sp = path.join(SESS_DIR, id, 'video', `${stt}_silent.mp4`);
      if (fs.existsSync(sp)) fs.unlinkSync(sp);
      saveState(id, state);
    }
    broadcast({ sessionId: id, type: 'scene_regenerated', stt: Number(stt) });
  } catch (e) {
    broadcast({ sessionId: id, type: 'error', msg: `Lỗi tạo lại cảnh ${stt}: ${e.message}` });
  }
});

app.post('/api/projects/:id/thumbnail/regen', async (req, res) => {
  const { id } = req.params;
  const state = loadState(id);
  if (!state) return res.status(404).json({ error: 'Không tìm thấy dự án' });
  if (!state.thumbnail?.prompt) return res.status(400).json({ error: 'Thiếu prompt thumbnail' });

  res.json({ ok: true });
  logProgress(id, 5, 'Đang tạo lại thumbnail...');
  try {
    const aiKeys = {
      sessionId: id,
      aiProvider: state.aiProvider || 'chato1',
      chato1: state.chato1Keys || [],
      geminiKeys: state.geminiKeys || [],
      openaiKeys: state.openaiKeys || [],
    };
    const html = await generateThumbnailHTML({
      title: state.thumbnail.title || state.topic || 'Thumbnail',
      prompt: state.thumbnail.prompt,
      keys: aiKeys,
      onLog: (msg) => logProgress(id, 5, msg, { detail: true, target: 'thumbnail' }),
      projectAssets: state.projectAssets || [],
      outputAspectRatio: state.outputAspectRatio || '9:16',
      styleGuide: state.styleGuide || DEFAULT_STYLE_GUIDE,
    });
    fs.writeFileSync(path.join(SESS_DIR, id, 'html', 'thumbnail.html'), html, 'utf8');
    state.thumbnail.htmlDone = true;
    state.thumbnail.imageDone = false;
    saveState(id, state);
    await renderProjectThumbnail(id);
    broadcast({ sessionId: id, type: 'thumbnail_regenerated' });
  } catch (e) {
    broadcast({ sessionId: id, type: 'error', msg: `Lỗi tạo lại thumbnail: ${e.message}` });
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
  const aiKeys = {
    sessionId: id,
    aiProvider: state?.aiProvider || 'chato1',
    chato1: state?.chato1Keys || project.chato1_keys || [],
    geminiKeys: state?.geminiKeys || [],
    openaiKeys: state?.openaiKeys || [],
  };
  try {
    const html = await editThumbnailHTML({
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

app.post('/api/projects/:id/thumbnail/edit-html', async (req, res) => {
  const { id } = req.params;
  const { editPrompt, currentHtml } = req.body;
  if (!editPrompt || !currentHtml) return res.status(400).json({ error: 'Thiếu editPrompt hoặc currentHtml' });
  const state = loadState(id);
  if (!state) return res.status(404).json({ error: 'Không tìm thấy dự án' });
  const aiKeys = {
    sessionId: id,
    aiProvider: state.aiProvider || 'chato1',
    chato1: state.chato1Keys || [],
    geminiKeys: state.geminiKeys || [],
    openaiKeys: state.openaiKeys || [],
  };
  try {
    const html = await editSceneHTML({
      currentHtml,
      editPrompt,
      keys: aiKeys,
      onLog: (msg) => logProgress(id, 5, msg, { detail: true, target: 'thumbnail' }),
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

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, () => console.log(`▶ http://localhost:${PORT}`));
