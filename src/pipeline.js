// src/pipeline.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { broadcast } from '../server.js';
import { generateScript } from './agents/scriptAgent.js';
import { normalizeTTSVoices } from './agents/ttsNormalizeAgent.js';
import { generateTTS } from './agents/ttsAgent.js';
import { transcribeToSRT } from './agents/whisperAgent.js';
import { generateSceneHTML, generateThumbnailHTML, DEFAULT_STYLE_GUIDE } from './agents/sceneAgent.js';
import { renderSceneVideo, renderHtmlStill } from './renderer/puppeteerRender.js';
import { mergeSceneAudio, concatScenesWithXFade, buildKaraokeASS, burnSubtitlesAndLogo, burnLogoOnly, mixMusicAndSFX } from './renderer/ffmpegMerge.js';
import { loadState, saveState, logEvent, waitForRenderTrigger } from './utils/state.js';
import { syncFromState } from './db/index.js';
import { getSettings } from './utils/settings.js';
import { decideMusicPlan } from './agents/musicAgent.js';
import { extractAssetKeywords } from './agents/assetKeywordsAgent.js';
import { loadMediaCache, searchByKeywords, entryFileURL, BRAND_DIR, SFX_DIR, BGM_DIR } from './utils/assetSearch.js';
import { SESS_DIR } from './utils/paths.js';

const fmtMs = ms => ms < 60000
  ? `${(ms / 1000).toFixed(1)}s`
  : `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;

// ─── Broadcast helpers ────────────────────────────────────────────────────────

/**
 * Main progress event — updates step indicator + appends to log.
 */
function progress(sessionId, step, msg, extra = {}) {
  console.log(`[${sessionId}] [B${step}] ${msg}`);
  logEvent(sessionId, { step, msg, ...extra });
  broadcast({ sessionId, type: 'progress', step, msg, ...extra });
}

/**
 * Detail log — appends to log only, does NOT change step indicator.
 * Used for sub-step messages (AI streaming, frame counts, etc.).
 */
function makeLogger(sessionId, step) {
  return (msg) => {
    console.log(`[${sessionId}] [B${step}]   ${msg}`);
    logEvent(sessionId, { step, msg, detail: true });
    broadcast({ sessionId, type: 'progress', step, msg, detail: true });
  };
}

function save(sessionId, state) {
  saveState(sessionId, state);
  syncFromState(sessionId, state);
}

// ─── SRT spelling correction via voice script ────────────────────────────────

function editDist(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function normWord(w) {
  return w.toLowerCase().replace(/[.,!?;:'"…""''–—]/g, '');
}

/**
 * Sửa lỗi chính tả trong SRT bằng cách align greedy với kịch bản voice.
 * Với mỗi từ whisper, quét cửa sổ trượt trong script để tìm từ gần nhất.
 * Ngưỡng: edit distance ≤ floor(wordLen/3) + 1, tối đa 3.
 */
function correctSRTWithVoice(srtContent, voiceScript) {
  if (!voiceScript || !srtContent) return srtContent;

  const scriptWords = voiceScript.trim().split(/\s+/).map(normWord).filter(Boolean);
  if (!scriptWords.length) return srtContent;

  // Parse SRT thành blocks
  const rawBlocks = srtContent.trim().split(/\n\n+/);
  const blocks = rawBlocks.map(b => {
    const lines = b.split('\n');
    const words = lines.slice(2).join(' ').trim().split(/\s+/).filter(Boolean);
    return { header: lines.slice(0, 2), words };
  });

  // Lấy toàn bộ từ whisper (flattened)
  const allWhisper = blocks.flatMap(b => b.words);

  // Greedy alignment: với mỗi whisper word, quét WINDOW=6 từ tiếp theo trong script
  const WINDOW = 6;
  let sPtr = 0; // con trỏ vào scriptWords
  const corrected = allWhisper.map(raw => {
    const nRaw = normWord(raw);
    const maxThresh = Math.min(3, Math.floor(nRaw.length / 3) + 1);

    let bestDist = Infinity, bestIdx = -1;
    const limit = Math.min(sPtr + WINDOW, scriptWords.length);
    for (let si = sPtr; si < limit; si++) {
      const d = editDist(nRaw, scriptWords[si]);
      if (d < bestDist) { bestDist = d; bestIdx = si; }
    }

    if (bestDist <= maxThresh && bestIdx >= 0) {
      // Giữ hoa/thường đầu câu của raw, dùng nội dung từ script
      const scriptRaw = voiceScript.trim().split(/\s+/).filter(Boolean)[bestIdx] || raw;
      sPtr = bestIdx + 1;
      // Giữ ký tự hoa đầu nếu raw hoa đầu
      if (raw[0] === raw[0].toUpperCase() && raw[0] !== raw[0].toLowerCase()) {
        return scriptRaw[0].toUpperCase() + scriptRaw.slice(1);
      }
      return scriptRaw;
    }
    return raw;
  });

  // Gán lại từ đã sửa về blocks
  let wIdx = 0;
  return blocks.map(b => {
    const newWords = corrected.slice(wIdx, wIdx + b.words.length);
    wIdx += b.words.length;
    return [...b.header, newWords.join(' ')].join('\n');
  }).join('\n\n') + '\n';
}

// ─── Public entry points ──────────────────────────────────────────────────────

export async function runPipeline({ sessionId, topic, script, thumbnail, chato1Keys, openaiKeys, ttsProvider, lucylabKey, voiceId, vbeeKey, vbeeAppId, vbeeVoiceCode, projectAssets, outputAspectRatio, aiProvider, geminiKeys, enableSubtitles, styleGuide, videoDurationSec, sceneDurationSec, ttsSpeed }) {
  const dir = path.join(SESS_DIR, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  ['scenes', 'audio', 'srt', 'html', 'video', 'assets', 'thumbnail'].forEach(d =>
    fs.mkdirSync(path.join(dir, d), { recursive: true })
  );
  const initState = {
    sessionId,
    topic,
    chato1Keys,
    openaiKeys,
    ttsProvider: ttsProvider || 'lucylab',
    lucylabKey,
    voiceId,
    vbeeKey,
    vbeeAppId,
    vbeeVoiceCode,
    status: 'running',
    createdAt: Date.now(),
    projectAssets,
    outputAspectRatio: outputAspectRatio || '9:16',
    aiProvider: aiProvider || 'chato1',
    geminiKeys,
    enableSubtitles: enableSubtitles !== false,
    styleGuide: styleGuide || null,
    videoDurationSec: Number(videoDurationSec) || 120,
    sceneDurationSec: Number(sceneDurationSec) || 15,
    ttsSpeed: Number(ttsSpeed) || 1.0,
    script: Array.isArray(script) ? script : undefined,
    thumbnail: thumbnail || undefined,
  };
  save(sessionId, initState);
  await executePipeline(sessionId, { topic, chato1Keys, openaiKeys, ttsProvider, lucylabKey, voiceId, vbeeKey, vbeeAppId, vbeeVoiceCode });
}

export async function resumePipeline({ sessionId, chato1Keys, openaiKeys, geminiKeys, ttsProvider, lucylabKey, voiceId, vbeeKey, vbeeAppId, vbeeVoiceCode, ttsSpeed }) {
  const state = loadState(sessionId);
  if (!state) throw new Error('Session không tồn tại');
  if (chato1Keys?.length)  state.chato1Keys  = chato1Keys;
  if (openaiKeys?.length)  state.openaiKeys  = openaiKeys;
  if (geminiKeys?.length)  state.geminiKeys  = geminiKeys;
  if (ttsProvider)         state.ttsProvider = ttsProvider;
  if (lucylabKey)          state.lucylabKey  = lucylabKey;
  if (voiceId)             state.voiceId     = voiceId;
  if (vbeeKey)             state.vbeeKey     = vbeeKey;
  if (vbeeAppId)           state.vbeeAppId   = vbeeAppId;
  if (vbeeVoiceCode)       state.vbeeVoiceCode = vbeeVoiceCode;
  if (ttsSpeed)            state.ttsSpeed    = Number(ttsSpeed);
  state.status = 'running';
  save(sessionId, state);
  await executePipeline(sessionId, state);
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

// Build a map { stt → [projectAsset, ...] } from script's assets field
function buildSceneAssetsMap(script, projectAssets) {
  if (!projectAssets?.length || !script?.length) return {};
  const byName = new Map(projectAssets.map(a => [a.name.toLowerCase().trim(), a]));
  const map = {};
  for (const sc of script) {
    map[sc.stt] = (sc.assets || [])
      .map(name => byName.get(name.toLowerCase().trim()))
      .filter(Boolean);
  }
  return map;
}

function buildDefaultThumbnail(topic, scenes = []) {
  const title = String(topic || scenes[0]?.voice || 'Thumbnail video').trim().slice(0, 120) || 'Thumbnail video';
  const sceneSummary = scenes.slice(0, 3)
    .map(sc => `Cảnh ${sc.stt}: ${sc.visual || sc.voice}`)
    .join(' | ');
  return {
    title,
    prompt: `Thumbnail tĩnh cinematic cho video "${title}". Chủ đề chính: ${title}. Bám sát các ý nổi bật sau: ${sceneSummary || 'Nội dung giáo dục ngắn gọn, rõ ràng'}. Bố cục phải có 1 chủ thể chính nổi bật, nền có chiều sâu, text overlay ngắn và rất dễ đọc, tương phản mạnh, phù hợp ảnh thumbnail.`,
    htmlDone: false,
    imageDone: false,
  };
}

function normalizeThumbnailState(thumbnail, topic, scenes = []) {
  const fallback = buildDefaultThumbnail(topic, scenes);
  return {
    title: String(thumbnail?.title || fallback.title).trim().slice(0, 120) || fallback.title,
    prompt: String(thumbnail?.prompt || fallback.prompt).trim() || fallback.prompt,
    htmlDone: Boolean(thumbnail?.htmlDone),
    imageDone: Boolean(thumbnail?.imageDone),
  };
}

async function executePipeline(sessionId, { topic, chato1Keys, openaiKeys, ttsProvider, lucylabKey, voiceId, vbeeKey, vbeeAppId, vbeeVoiceCode }) {
  const dir   = path.join(SESS_DIR, sessionId);
  const state = loadState(sessionId);
  const keys  = {
    sessionId,
    chato1: chato1Keys,
    openaiKeys,
    ttsProvider: state.ttsProvider || ttsProvider || 'lucylab',
    lucylabKey,
    voiceId,
    vbeeKey,
    vbeeAppId,
    vbeeVoiceCode,
    ttsSpeed: Number(state.ttsSpeed) || 1.0,
    aiProvider: state.aiProvider || 'chato1',
    geminiKeys: state.geminiKeys,
  };
  const projectAssets     = state.projectAssets || [];
  const outputAspectRatio = state.outputAspectRatio || '9:16';
  const styleGuide        = state.styleGuide || undefined;

  try {
    // ── B2: Kịch bản ──────────────────────────────────────────────────────────
    let script = state.script;
    let thumbnail = state.thumbnail;
    if (!script) {
      progress(sessionId, 2, '⏳ Đang tạo kịch bản JSON...');
      const log2 = makeLogger(sessionId, 2);
      const t0 = Date.now();
      const generated = await generateScript({
        topic,
        keys,
        onLog: log2,
        projectAssets,
        videoDurationSec: Number(state.videoDurationSec) || 120,
        sceneDurationSec: Number(state.sceneDurationSec) || 15,
      });
      script = generated.scenes;
      thumbnail = generated.thumbnail;
      try {
        script = await normalizeTTSVoices({ scenes: script, keys, onLog: log2 });
      } catch (e) {
        log2(`Chuẩn hóa TTS thất bại, dùng voice gốc cho TTS: ${e.message}`);
        script = script.map(sc => ({ ...sc, ttsVoice: sc.voice }));
      }
      state.script = script;
      state.thumbnail = normalizeThumbnailState(thumbnail, topic, script);
      fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify(script, null, 2));
      save(sessionId, state);
      progress(sessionId, 2, `✓ Kịch bản: ${script.length} cảnh | ${fmtMs(Date.now() - t0)}`);
    } else {
      progress(sessionId, 2, `✓ Kịch bản đã có: ${script.length} cảnh (bỏ qua)`);
      if (!fs.existsSync(path.join(dir, 'script.json'))) {
        fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify(script, null, 2));
      }
      state.thumbnail = normalizeThumbnailState(thumbnail, topic, script);
      save(sessionId, state);
    }

    // Build per-scene asset map (idempotent — safe on resume)
    if (!state.sceneAssetsMap && projectAssets.length) {
      state.sceneAssetsMap = buildSceneAssetsMap(script, projectAssets);
      save(sessionId, state);
    }
    const sceneAssetsMap = state.sceneAssetsMap || {};

    // Khởi tạo state.scenes — save + broadcast ngay để frontend hiện loading cards
    state.scenes = state.scenes || script.map(s => ({ stt: s.stt, voice: s.voice, ttsVoice: s.ttsVoice || s.voice, visual: s.visual }));
    const total  = state.scenes.length;
    save(sessionId, state);
    broadcast({ sessionId, type: 'scenes_ready', total });

    // Keywords + brand cache chuẩn bị trước vòng TTS (chỉ cần script, không cần audio)
    if (!state.assetKeywords) {
      progress(sessionId, 5, '⏳ AI phân tích kịch bản → keywords tài nguyên...');
      const log25 = makeLogger(sessionId, 5);
      state.assetKeywords = await extractAssetKeywords({ script, keys, onLog: log25 });
      save(sessionId, state);
      progress(sessionId, 5, '✓ Keywords tài nguyên xong');
    } else {
      makeLogger(sessionId, 5)('Keywords tài nguyên đã có (bỏ qua)');
    }
    const brandCache = await loadMediaCache(BRAND_DIR);

    // ── B4+B5: TTS tuần tự → HTML kick-off ngay khi SRT sẵn ─────────────────
    // Mỗi scene xong TTS+Whisper → gửi HTML ngay, không chờ scene tiếp theo TTS xong.
    // HTML các scene chạy song song với nhau và với TTS các scene sau.
    progress(sessionId, 4, `⏳ TTS + HTML ${total} cảnh (HTML được gửi ngay khi SRT sẵn)...`);
    const htmlDoneCount = state.scenes.filter(s => s.htmlDone).length;
    if (htmlDoneCount > 0) makeLogger(sessionId, 4)(`${htmlDoneCount} cảnh đã có HTML — bỏ qua`);

    const htmlPromises = [];

    for (const sc of state.scenes) {
      const audioPath = path.join(dir, 'audio', `${sc.stt}.mp3`);
      const srtPath   = path.join(dir, 'srt',   `${sc.stt}.srt`);
      const log4      = makeLogger(sessionId, 4);

      // TTS (tuần tự do giới hạn API)
      if (!sc.audioDone || !fs.existsSync(audioPath)) {
        progress(sessionId, 4, `⏳ TTS cảnh ${sc.stt}/${total}...`);
        await generateTTS(sc.ttsVoice || sc.voice, audioPath, log4, keys);
        await padAudioWithSilence(audioPath, INTER_SCENE_SILENCE_MS, log4);
        sc.audioDone = true;
        save(sessionId, state);
      } else {
        log4(`TTS cảnh ${sc.stt}: đã có (bỏ qua)`);
      }

      // Whisper → SRT (tuần tự)
      if (!sc.srtDone || !fs.existsSync(srtPath)) {
        progress(sessionId, 4, `⏳ Whisper cảnh ${sc.stt}/${total}...`);
        await transcribeToSRT(audioPath, srtPath, log4);
        let srtRaw = fs.readFileSync(srtPath, 'utf8');
        const srtFixed = correctSRTWithVoice(srtRaw, sc.voice);
        if (srtFixed !== srtRaw) {
          fs.writeFileSync(srtPath, srtFixed, 'utf8');
          log4(`Whisper: đã sửa chính tả SRT theo kịch bản voice`);
          srtRaw = srtFixed;
        }
        sc.srt    = srtRaw;
        sc.srtDone = true;
        save(sessionId, state);
      } else if (!sc.srt && fs.existsSync(srtPath)) {
        // Resume: load SRT từ disk nếu chưa có trong memory
        sc.srt = fs.readFileSync(srtPath, 'utf8');
      }

      // SRT đã có → kick off HTML ngay (không await, chạy song song với TTS tiếp theo)
      const htmlPath = path.join(dir, 'html', `${sc.stt}.html`);
      if (!sc.htmlDone || !fs.existsSync(htmlPath)) {
        const log5 = makeLogger(sessionId, 5);
        const sceneKeywords = state.assetKeywords?.brand_assets?.[String(sc.stt)] ?? [];
        const allMatched = searchByKeywords(sceneKeywords, brandCache, 5)
          .map(entry => ({ ...entry, url: entryFileURL(BRAND_DIR, entry.name) }));
        const useCharacter = sc.stt % 3 === 1;
        const matchedAssets = useCharacter
          ? allMatched
          : allMatched.filter(a => !a.name.toLowerCase().includes('character'));
        const sceneProjectAssets = sceneAssetsMap[sc.stt] || [];

        progress(sessionId, 5, `⏳ AI đang tạo HTML cảnh ${sc.stt}/${total}...`);
        htmlPromises.push(
          generateSceneHTML({ scene: sc, keys, onLog: log5, brandAssets: matchedAssets, projectAssets: sceneProjectAssets, outputAspectRatio, styleGuide })
            .then(html => {
              fs.writeFileSync(htmlPath, html);
              sc.htmlDone = true;
              save(sessionId, state);
              progress(sessionId, 5, `✓ HTML cảnh ${sc.stt}/${total} xong`);
              broadcast({ sessionId, type: 'scene_html_ready', stt: sc.stt });
            })
        );
      }
    }

    progress(sessionId, 4, `✓ TTS + SRT hoàn thành cho ${total} cảnh`);

    // Chờ tất cả HTML hoàn thành (một số đã xong trong lúc TTS chạy)
    if (htmlPromises.length > 0) await Promise.all(htmlPromises);
    progress(sessionId, 5, `✓ Tất cả ${total} cảnh đã có HTML`);

    // ── B5-T: Thumbnail ─────────────────────────────────────────────────────
    const thumb = normalizeThumbnailState(state.thumbnail, state.topic, state.scenes);
    const thumbnailHtmlPath = path.join(dir, 'html', 'thumbnail.html');
    const thumbnailImagePath = path.join(dir, 'thumbnail', 'thumbnail.jpg');
    state.thumbnail = thumb;

    if (!thumb.htmlDone || !fs.existsSync(thumbnailHtmlPath)) {
      progress(sessionId, 5, '⏳ AI đang tạo HTML thumbnail...');
      const thumbnailHtml = await generateThumbnailHTML({
        title: thumb.title,
        prompt: thumb.prompt,
        keys,
        onLog: makeLogger(sessionId, 5),
        projectAssets,
        outputAspectRatio,
        styleGuide,
      });
      fs.writeFileSync(thumbnailHtmlPath, thumbnailHtml, 'utf8');
      thumb.htmlDone = true;
      thumb.imageDone = false;
      save(sessionId, state);
      progress(sessionId, 5, '✓ HTML thumbnail xong');
      broadcast({ sessionId, type: 'thumbnail_html_ready' });
    }

    if (!thumb.imageDone || !fs.existsSync(thumbnailImagePath)) {
      progress(sessionId, 5, '⏳ Đang render ảnh thumbnail...');
      await renderHtmlStill(thumbnailHtmlPath, thumbnailImagePath, makeLogger(sessionId, 5), outputAspectRatio);
      thumb.imageDone = true;
      save(sessionId, state);
      progress(sessionId, 5, '✓ Thumbnail xong');
      broadcast({ sessionId, type: 'thumbnail_image_ready' });
    }

    // ── B5.5: Chờ user xem trước ──────────────────────────────────────────────
    if (!loadState(sessionId)?.renderTriggered) {
      progress(sessionId, 5, '🔍 HTML sẵn sàng — đang chờ bạn xem trước và bấm Tạo Video...', {
        subtype: 'preview_ready',
        scenes: state.scenes.map(s => ({ stt: s.stt, voice: s.voice })),
        thumbnail: { title: state.thumbnail?.title || '' },
      });
      state.status = 'preview';
      save(sessionId, state);
      await waitForRenderTrigger(sessionId);
      state.status = 'running';
      save(sessionId, state);
      progress(sessionId, 6, '▶ Bắt đầu render video...');
    }

    // ── B6: Render (2 concurrent) ─────────────────────────────────────────────
    progress(sessionId, 6, `⏳ Render ${total} cảnh thành video (tối đa 2 song song)...`);
    let renderDone = state.scenes.filter(s => s.renderDone).length;
    if (renderDone > 0) makeLogger(sessionId, 6)(`${renderDone} cảnh đã render — bỏ qua`);

    await runConcurrent(state.scenes, 3, async (sc) => {
      await renderOneScene(dir, sessionId, sc, state, makeLogger(sessionId, 6), outputAspectRatio);
    });
    progress(sessionId, 6, `✓ Tất cả ${total} cảnh đã render xong`);

    // ── B7: Ghép + phụ đề + logo ──────────────────────────────────────────────
    await buildFinalVideo(dir, sessionId, state, makeLogger(sessionId, 7));

    state.status     = 'done';
    state.finalVideo = path.join(dir, 'final.mp4');
    save(sessionId, state);

    const mb = (fs.statSync(state.finalVideo).size / 1024 / 1024).toFixed(1);
    progress(sessionId, 7, `✓ Hoàn thành! final.mp4 (${mb} MB)`, { done: true });

  } catch (e) {
    state.status    = 'error';
    state.lastError = e.message;
    save(sessionId, state);
    broadcast({ sessionId, type: 'error', msg: e.message });
    throw e;
  }
}

// ─── Re-render single scene ───────────────────────────────────────────────────

export async function renderSingleScene(sessionId, stt) {
  const dir   = path.join(SESS_DIR, sessionId);
  const state = loadState(sessionId);
  if (!state) throw new Error('Session không tồn tại');

  const sc = state.scenes?.find(s => s.stt === Number(stt));
  if (!sc) throw new Error(`Không tìm thấy cảnh ${stt}`);

  const log = makeLogger(sessionId, 6);
  progress(sessionId, 6, `⏳ Render lại cảnh ${stt}...`);

  sc.renderDone = false;
  await renderOneScene(dir, sessionId, sc, state, log, state.outputAspectRatio || '9:16');

  syncFromState(sessionId, state);
  progress(sessionId, 6, `✓ Cảnh ${stt} render xong`);
  broadcast({ sessionId, type: 'scene_render_done', stt: Number(stt) });
}

// Tạo lại TTS + SRT + HTML cho 1 cảnh (dùng khi user sửa voice)
export async function regenSceneVoiceAndHTML({ sessionId, stt, newVoice, onLog }) {
  const dir   = path.join(SESS_DIR, sessionId);
  const state = loadState(sessionId);
  if (!state) throw new Error('Session không tồn tại');

  const sc = state.scenes?.find(s => s.stt === Number(stt));
  if (!sc) throw new Error(`Không tìm thấy cảnh ${stt}`);

  const audioPath = path.join(dir, 'audio', `${stt}.mp3`);
  const srtPath   = path.join(dir, 'srt',   `${stt}.srt`);
  const htmlPath  = path.join(dir, 'html',  `${stt}.html`);

  const keys = {
    sessionId,
    ttsProvider:   state.ttsProvider  || 'lucylab',
    lucylabKey:    state.lucylabKey,
    voiceId:       state.voiceId,
    vbeeKey:       state.vbeeKey,
    vbeeAppId:     state.vbeeAppId,
    vbeeVoiceCode: state.vbeeVoiceCode,
    ttsSpeed:      Number(state.ttsSpeed) || 1.0,
    aiProvider:    state.aiProvider   || 'chato1',
    chato1:        state.chato1Keys   || [],
    geminiKeys:    state.geminiKeys   || [],
    openaiKeys:    state.openaiKeys   || [],
  };

  sc.voice      = newVoice;
  sc.ttsVoice   = newVoice;
  sc.audioDone  = false;
  sc.srtDone    = false;
  sc.htmlDone   = false;
  sc.renderDone = false;
  save(sessionId, state);

  // Bước 1: TTS
  onLog?.(`TTS cảnh ${stt}...`);
  await generateTTS(newVoice, audioPath, onLog, keys);
  await padAudioWithSilence(audioPath, INTER_SCENE_SILENCE_MS, onLog);
  sc.audioDone = true;
  save(sessionId, state);

  // Bước 2: Whisper → SRT
  onLog?.(`Whisper cảnh ${stt}...`);
  await transcribeToSRT(audioPath, srtPath, onLog);
  let srtRaw = fs.readFileSync(srtPath, 'utf8');
  const srtFixed = correctSRTWithVoice(srtRaw, newVoice);
  if (srtFixed !== srtRaw) {
    fs.writeFileSync(srtPath, srtFixed, 'utf8');
    srtRaw = srtFixed;
  }
  sc.srt     = srtRaw;
  sc.srtDone = true;
  save(sessionId, state);

  // Bước 3: HTML với SRT mới
  onLog?.(`Tạo HTML cảnh ${stt}...`);
  const brandCache = await loadMediaCache(BRAND_DIR);
  const sceneKeywords = state.assetKeywords?.brand_assets?.[String(stt)] ?? [];
  const allMatched = searchByKeywords(sceneKeywords, brandCache, 5)
    .map(entry => ({ ...entry, url: entryFileURL(BRAND_DIR, entry.name) }));
  const useCharacter = Number(stt) % 3 === 1;
  const matchedBrandAssets = useCharacter
    ? allMatched
    : allMatched.filter(a => !a.name.toLowerCase().includes('character'));
  const sceneProjectAssets = state.sceneAssetsMap?.[Number(stt)] || [];

  const html = await generateSceneHTML({
    scene: sc,
    keys,
    onLog,
    brandAssets:      matchedBrandAssets,
    projectAssets:    sceneProjectAssets,
    outputAspectRatio: state.outputAspectRatio || '9:16',
    styleGuide:       state.styleGuide || DEFAULT_STYLE_GUIDE,
  });

  fs.writeFileSync(htmlPath, html);
  sc.htmlDone   = true;
  sc.renderDone = false;

  // Xóa video cũ để tránh dùng bản stale khi ghép
  [
    path.join(dir, 'video', `${stt}_silent.mp4`),
    path.join(dir, 'video', `${stt}.mp4`),
  ].forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });

  save(sessionId, state);
  broadcast({ sessionId, type: 'scene_html_ready', stt: Number(stt) });
}

export async function concatFinalVideo(sessionId) {
  const dir   = path.join(SESS_DIR, sessionId);
  const state = loadState(sessionId);
  if (!state) throw new Error('Session không tồn tại');

  // Tự động render các cảnh có HTML mới nhưng chưa render (vd: sau khi sửa voice/HTML)
  const needsRender = (state.scenes || []).filter(sc => {
    const videoPath = path.join(dir, 'video', `${sc.stt}.mp4`);
    return sc.htmlDone && (!sc.renderDone || !fs.existsSync(videoPath));
  });
  if (needsRender.length > 0) {
    progress(sessionId, 6, `⏳ Tự động render ${needsRender.length} cảnh chưa render trước khi ghép...`);
    const log6 = makeLogger(sessionId, 6);
    for (const sc of needsRender) {
      sc.renderDone = false;
      await renderOneScene(dir, sessionId, sc, state, log6, state.outputAspectRatio || '9:16');
    }
    progress(sessionId, 6, `✓ Render xong ${needsRender.length} cảnh`);
  }

  // Reset trạng thái để UI không hiển thị video cũ trong khi đang ghép
  state.status     = 'building';
  state.finalVideo = null;
  save(sessionId, state);
  syncFromState(sessionId, state);

  try {
    const log = makeLogger(sessionId, 7);
    progress(sessionId, 7, `⏳ Ghép video cuối...`);
    await buildFinalVideo(dir, sessionId, state, log);

    state.status     = 'done';
    state.finalVideo = path.join(dir, 'final.mp4');
    state.lastError  = null;
    save(sessionId, state);
    syncFromState(sessionId, state);

    const mb = (fs.statSync(state.finalVideo).size / 1024 / 1024).toFixed(1);
    progress(sessionId, 7, `✓ Hoàn thành! final.mp4 (${mb} MB)`, { done: true });
  } catch (e) {
    state.status    = 'error';
    state.lastError = e.message;
    save(sessionId, state);
    syncFromState(sessionId, state);
    broadcast({ sessionId, type: 'error', msg: e.message });
    throw e;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function renderOneScene(dir, sessionId, sc, state, log, outputAspectRatio = '9:16') {
  const audioPath   = path.join(dir, 'audio', `${sc.stt}.mp3`);
  const htmlPath    = path.join(dir, 'html',  `${sc.stt}.html`);
  const silentVideo = path.join(dir, 'video', `${sc.stt}_silent.mp4`);
  const finalScene  = path.join(dir, 'video', `${sc.stt}.mp4`);

  if (sc.renderDone && fs.existsSync(finalScene)) {
    log(`Cảnh ${sc.stt}: đã render — bỏ qua`);
    return;
  }

  log(`Cảnh ${sc.stt}: đo thời lượng audio...`);
  const duration = await getAudioDuration(audioPath);
  log(`Cảnh ${sc.stt}: audio ${duration.toFixed(1)}s`);

  if (fs.existsSync(silentVideo)) fs.unlinkSync(silentVideo);

  await renderSceneVideo(htmlPath, silentVideo, duration, log, outputAspectRatio);

  log(`Cảnh ${sc.stt}: merge audio...`);
  await mergeSceneAudio(silentVideo, audioPath, finalScene);

  const mb = (fs.statSync(finalScene).size / 1024 / 1024).toFixed(1);
  log(`Cảnh ${sc.stt}: ✓ merge xong (${mb} MB)`);

  sc.duration   = duration;
  sc.renderDone = true;
  save(sessionId, state);
}

export async function renderProjectThumbnail(sessionId) {
  const dir = path.join(SESS_DIR, sessionId);
  const state = loadState(sessionId);
  if (!state) throw new Error('Session không tồn tại');
  const thumbnailHtmlPath = path.join(dir, 'html', 'thumbnail.html');
  const thumbnailImagePath = path.join(dir, 'thumbnail', 'thumbnail.jpg');
  if (!fs.existsSync(thumbnailHtmlPath)) throw new Error('Thumbnail HTML chưa tồn tại');

  state.thumbnail = normalizeThumbnailState(state.thumbnail, state.topic, state.scenes);
  await renderHtmlStill(thumbnailHtmlPath, thumbnailImagePath, makeLogger(sessionId, 5), state.outputAspectRatio || '9:16');
  state.thumbnail.imageDone = true;
  state.thumbnail.htmlDone = true;
  save(sessionId, state);
  return thumbnailImagePath;
}

async function buildFinalVideo(dir, sessionId, state, log) {
  const fresh             = loadState(sessionId);
  const scenes            = fresh?.scenes ?? state.scenes;
  const outputAspectRatio = fresh?.outputAspectRatio ?? state.outputAspectRatio ?? '9:16';
  const enableSubtitles   = (fresh?.enableSubtitles ?? state.enableSubtitles) !== false;

  log(`XFade concat ${scenes.length} cảnh (xfade 0.5s)...`);
  progress(sessionId, 7, `⏳ Ghép ${scenes.length} cảnh với XFade...`);
  const sceneFiles = scenes.map(s => path.join(dir, 'video', `${s.stt}.mp4`));
  const durations  = scenes.map(s => s.duration);
  const concatOut  = path.join(dir, 'final_nosub.mp4');
  await concatScenesWithXFade(sceneFiles, durations, concatOut, 0.5);
  log(`✓ Concat xong`);

  // ── Nhạc nền + sound effects ──────────────────────────────────────────────
  const planFile = path.join(dir, 'music_plan.json');
  let videoForSubs = concatOut;

  // Load SFX + BGM cache (chỉ scan nếu thư mục tồn tại)
  const [sfxCache, bgmCache] = await Promise.all([
    loadMediaCache(SFX_DIR),
    loadMediaCache(BGM_DIR),
  ]);

  if (sfxCache.length > 0 || bgmCache.length > 0) {
    let plan;

    if (fs.existsSync(planFile)) {
      plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
      log(`Dùng kế hoạch nhạc đã có: ${plan.background_music || 'không có nhạc nền'}, ${plan.sound_effects?.length ?? 0} SFX`);
    } else {
      progress(sessionId, 7, `⏳ AI đang chọn nhạc nền và sound effect...`);
      const log7 = makeLogger(sessionId, 7);
      const keys = {
        aiProvider: fresh?.aiProvider ?? state.aiProvider ?? 'chato1',
        chato1: fresh?.chato1Keys ?? state.chato1Keys,
        openaiKeys: fresh?.openaiKeys ?? state.openaiKeys,
        geminiKeys: fresh?.geminiKeys ?? state.geminiKeys,
        sessionId,
      };

      // Dùng keywords từ B2.5 để lọc file trước khi gửi AI
      const assetKw   = fresh?.assetKeywords ?? state.assetKeywords ?? {};
      const sfxKw     = assetKw.sfx_keywords  ?? [];
      const bgmKw     = assetKw.bgm_keywords  ?? [];
      const sfxFiles  = sfxKw.length ? searchByKeywords(sfxKw, sfxCache, 5) : sfxCache.slice(0, 20);
      const bgmFiles  = bgmKw.length ? searchByKeywords(bgmKw, bgmCache, 5) : bgmCache.slice(0, 10);

      plan = await decideMusicPlan({
        scenes,
        sfxFiles,
        bgmFiles,
        topic: fresh?.topic ?? state.topic ?? '',
        keys,
        onLog: log7,
      });
      plan.sfxDir = SFX_DIR;
      plan.musicDir = BGM_DIR;
      fs.writeFileSync(planFile, JSON.stringify(plan, null, 2), 'utf8');
    }

    if (plan.background_music || plan.sound_effects?.length > 0) {
      const mixedOut = path.join(dir, 'final_nosub_music.mp4');
      progress(sessionId, 7, `⏳ Ghép nhạc nền + ${plan.sound_effects?.length ?? 0} sound effect...`);
      await mixMusicAndSFX(concatOut, mixedOut, plan);
      log(`✓ Đã mix nhạc nền + sound effects`);
      videoForSubs = mixedOut;
    } else {
      log(`AI không chọn nhạc nền hay SFX nào — bỏ qua`);
    }
  }

  const finalOut  = path.join(dir, 'final.mp4');
  const LOGO_FILE = getSettings().logoPath;

  if (enableSubtitles) {
    const assContent = buildKaraokeASS(scenes, 0.5, outputAspectRatio);
    const entries    = (assContent.match(/^Dialogue:/gm) || []).length;
    log(`Burn phụ đề karaoke (${entries} entries)...`);
    progress(sessionId, 7, `⏳ Chèn ${entries} phụ đề karaoke...`);
    const assFile = path.join(dir, 'subtitles.ass');
    fs.writeFileSync(assFile, assContent, 'utf8');
    await burnSubtitlesAndLogo(videoForSubs, assFile, LOGO_FILE, finalOut);
    log(`✓ Subtitle + logo xong`);
  } else {
    log(`Phụ đề bị tắt — chỉ overlay logo (nếu có)`);
    progress(sessionId, 7, `⏳ Overlay logo...`);
    await burnLogoOnly(videoForSubs, LOGO_FILE, finalOut);
    log(`✓ Logo xong`);
  }
}

async function runConcurrent(items, limit, fn) {
  const results = [];
  const executing = new Set();
  for (const item of items) {
    const p = fn(item);
    results.push(p);
    const e = p.finally(() => executing.delete(e));
    executing.add(e);
    if (executing.size >= limit) await Promise.race(executing);
  }
  return Promise.all(results);
}

async function getAudioDuration(file) {
  const { spawn } = await import('child_process');
  return new Promise((res, rej) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file]);
    let out = '';
    p.stdout.on('data', d => out += d);
    p.on('close', c => c === 0 ? res(parseFloat(out)) : rej(new Error('ffprobe failed')));
  });
}

// Thêm silence vào đuôi audio để tạo khoảng nghỉ tự nhiên giữa các cảnh.
// xfade overlap = 500ms → silence 700ms → ~200ms thực sự im giữa 2 voice.
const INTER_SCENE_SILENCE_MS = 700;

async function padAudioWithSilence(audioPath, ms, onLog) {
  const { spawn } = await import('child_process');
  const tmp = audioPath + '_pad.mp3';
  const dur = (ms / 1000).toFixed(3);
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', [
      '-y', '-i', audioPath,
      '-af', `apad=pad_dur=${dur}`,
      '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '24000',
      tmp,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => err += d);
    p.on('close', c => {
      if (c === 0) {
        fs.renameSync(tmp, audioPath);
        onLog?.(`TTS: đã thêm ${ms}ms silence vào đuôi audio`);
        res();
      } else {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        rej(new Error('padAudio ffmpeg: ' + err.slice(-300)));
      }
    });
  });
}

export function listSessions() {
  if (!fs.existsSync(SESS_DIR)) return [];
  return fs.readdirSync(SESS_DIR).map(id => {
    const s = loadState(id);
    return s ? { id, topic: s.topic, status: s.status, createdAt: s.createdAt } : null;
  }).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}

export function getSession(id) {
  return loadState(id);
}
