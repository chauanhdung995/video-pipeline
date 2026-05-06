// src/pipeline.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { broadcast } from '../server.js';
import { generateScript, generateFreeformScript, generateTemplateDataForScript, preferImageTemplatesForScript } from './agents/scriptAgent.js';
import { downloadImagesForScenePlans, normalizeUploadedImages } from './services/imageAssets.js';
import { generateTTS } from './agents/ttsAgent.js';
import { transcribeToSRT } from './agents/whisperAgent.js';
import { generateSceneHTML } from './agents/sceneAgent.js';
import { renderSceneVideo } from './renderer/hyperframesRender.js';
import { mergeSceneAudio, concatScenesWithXFade, buildKaraokeASS, burnSubtitlesAndLogo, burnLogoOnly, mixBackgroundMusic, hasAudioStream } from './renderer/ffmpegMerge.js';
import { inferTemplate } from './renderer/hyperframesTemplateSystem.js';
import { loadState, saveState, logEvent, waitForRenderTrigger } from './utils/state.js';
import { syncFromState } from './db/index.js';
import { getSettings } from './utils/settings.js';
import { SESS_DIR } from './utils/paths.js';
import { correctSubtitleArtifacts } from './utils/subtitleCorrection.js';

const fmtMs = ms => ms < 60000
  ? `${(ms / 1000).toFixed(1)}s`
  : `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;

const TTS_SRT_CONCURRENCY = Math.max(3, Math.min(6, Number(process.env.TTS_SRT_CONCURRENCY) || 3));
const OUTPUT_ASPECT_RATIO = '9:16';

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

// ─── Public entry points ──────────────────────────────────────────────────────

export async function runPipeline({
  sessionId,
  topic,
  script,
  larvoiceVoiceId,
  backgroundMusic,
  enableSubtitles,
  videoDurationSec,
  ttsSpeed,
  videoObjective,
  useTemplateMode,
  uploadedImages,
}) {
  const dir = path.join(SESS_DIR, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  ['audio', 'srt', 'html', 'video', 'music', 'images'].forEach(d =>
    fs.mkdirSync(path.join(dir, d), { recursive: true })
  );
  const safeUploadedImages = normalizeUploadedImages(uploadedImages);
  const initState = {
    sessionId,
    topic,
    larvoiceVoiceId: Number(larvoiceVoiceId) || 1,
    status: 'running',
    createdAt: Date.now(),
    backgroundMusic,
    videoObjective: videoObjective || 'mac-dinh',
    useTemplateMode: useTemplateMode !== false,
    generationMode: useTemplateMode === false ? 'ai-html' : 'template',
    outputAspectRatio: OUTPUT_ASPECT_RATIO,
    enableSubtitles: enableSubtitles !== false,
    videoDurationSec: Number(videoDurationSec) || 120,
    ttsSpeed: Number(ttsSpeed) || 1.0,
    uploadedImages: safeUploadedImages,
    imageRequired: safeUploadedImages.length > 0 || requestMentionsImages(topic),
    script: Array.isArray(script) ? script : undefined,
  };
  if (safeUploadedImages.length) {
    fs.writeFileSync(path.join(dir, 'uploaded_images.json'), JSON.stringify(safeUploadedImages, null, 2));
  }
  save(sessionId, initState);
  await executePipeline(sessionId, { topic, larvoiceVoiceId: initState.larvoiceVoiceId });
}

export async function resumePipeline({ sessionId, larvoiceVoiceId, ttsSpeed }) {
  const state = loadState(sessionId);
  if (!state) throw new Error('Session không tồn tại');
  if (larvoiceVoiceId)       state.larvoiceVoiceId = Number(larvoiceVoiceId) || 1;
  if (ttsSpeed)            state.ttsSpeed    = Number(ttsSpeed);
  state.status = 'running';
  state.lastError = null;
  save(sessionId, state);
  await executePipeline(sessionId, state);
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

function loadWordTimings(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function scriptNeedsTemplateData(script, useTemplateMode = true) {
  if (useTemplateMode === false) return false;
  return Array.isArray(script) && script.some(scene =>
    !scene?.templateData ||
    typeof scene.templateData !== 'object' ||
    Array.isArray(scene.templateData)
  );
}

function requestMentionsImages(text = '') {
  return /\b(ảnh|hình ảnh|hình minh họa|minh họa|photo|photos|image|images|screenshot|ảnh chụp|visual evidence|bằng chứng hình ảnh)\b/i
    .test(String(text || ''));
}

function scriptNeedsImageAssets(script, forceImages = false) {
  if (!Array.isArray(script)) return false;
  return script.some(scene => {
    const hasCandidates = Array.isArray(scene?.imageCandidates) && scene.imageCandidates.length > 0;
    const hasUploadedCandidates = Array.isArray(scene?.uploadedImageCandidates) && scene.uploadedImageCandidates.length > 0;
    const asksForImage = forceImages ||
      scene?.imageRequired === true ||
      Boolean(scene?.['keyword-image'] || scene?.keywordImage) ||
      Boolean(scene?.['uploaded-image-url'] || scene?.uploadedImageUrl);
    return asksForImage && !hasCandidates && !hasUploadedCandidates;
  });
}

function sceneHtmlNeedsTimedRefresh(htmlPath, scene = {}, sceneCount = 0) {
  if (!fs.existsSync(htmlPath)) return false;
  const html = fs.readFileSync(htmlPath, 'utf8');
  const hasCurrentTemplateSystem = html.includes('data-vp-html-version="hyperframes-template-system-v1"');
  if (hasCurrentTemplateSystem) {
    if (!html.includes('data-sfx-template=')) return true;
    if (html.includes('data-duration="auto"') || html.includes('data-end="NaN"')) return true;
    const currentTemplate = html.match(/\bdata-layout="([^"]+)"/)?.[1] || '';
    const expectedTemplate = inferTemplate(scene, sceneCount);
    return Boolean(expectedTemplate && currentTemplate !== expectedTemplate);
  }

  // Only auto-refresh HTML that looks like our generated HyperFrames template.
  // This upgrades older sessions without overwriting arbitrary custom HTML.
  return html.includes('data-vp-html-version="hyperframes-timed-v2"') ||
    (html.includes('data-composition-id="scene-') &&
    html.includes('window.__timelines') &&
    html.includes('hf-anim'));
}

async function composeAndSaveSceneHTML({ dir, sessionId, scene, state, log, reason }) {
  const stt = Number(scene?.stt);
  const srtPath = path.join(dir, 'srt', `${stt}.srt`);
  const wordsPath = path.join(dir, 'srt', `${stt}.words.json`);
  const htmlPath = path.join(dir, 'html', `${stt}.html`);

  if (!scene.srt && fs.existsSync(srtPath)) {
    scene.srt = fs.readFileSync(srtPath, 'utf8');
  }

  const wordTimings = loadWordTimings(wordsPath);
  if (wordTimings.length) {
    scene.wordTimings = wordTimings;
    log?.(`Cảnh ${stt}: nạp ${wordTimings.length} mốc thời gian từng từ`);
  }

  log?.(`Cảnh ${stt}: ${reason || 'compose lại HTML HyperFrames'}...`);
  const html = await generateSceneHTML({
    scene,
    keys: { sessionId },
    onLog: log,
    sceneCount: state.scenes?.length || 0,
    useTemplateMode: state.useTemplateMode !== false,
  });

  fs.writeFileSync(htmlPath, html, 'utf8');
  scene.htmlDone = true;
  scene.htmlEdited = false;
  scene.renderDone = false;
  save(sessionId, state);
  broadcast({ sessionId, type: 'scene_html_ready', stt });
  return true;
}

async function executePipeline(sessionId, { topic, larvoiceVoiceId }) {
  const dir   = path.join(SESS_DIR, sessionId);
  const state = loadState(sessionId);
  state.uploadedImages = normalizeUploadedImages(state.uploadedImages);
  state.useTemplateMode = state.useTemplateMode !== false;
  state.generationMode = state.useTemplateMode ? 'template' : 'ai-html';
  state.imageRequired = state.imageRequired === true ||
    state.uploadedImages.length > 0 ||
    requestMentionsImages(state.topic || topic || '');
  const keys  = {
    sessionId,
    larvoiceVoiceId: Number(state.larvoiceVoiceId || larvoiceVoiceId) || 1,
    ttsSpeed: Number(state.ttsSpeed) || 1.0,
  };
  state.outputAspectRatio = OUTPUT_ASPECT_RATIO;

  try {
    // ── B2: Kịch bản ──────────────────────────────────────────────────────────
    let script = state.script;
    if (!script) {
      progress(sessionId, 2, state.useTemplateMode
        ? '⏳ Đang tạo kịch bản phân cảnh...'
        : '⏳ Đang tạo kịch bản + JSON mô tả HTML từng cảnh...');
      const log2 = makeLogger(sessionId, 2);
      const t0 = Date.now();

      if (state.useTemplateMode) {
        const generated = await generateScript({
          topic,
          keys,
          onLog: log2,
          videoDurationSec: Number(state.videoDurationSec) || 120,
          videoObjective: state.videoObjective || 'mac-dinh',
          uploadedImages: state.uploadedImages,
          requireImages: state.imageRequired,
        });
        let plannedScenes = generated.scenes;
        state.scriptPlan = plannedScenes;
        fs.writeFileSync(path.join(dir, 'script_plan.json'), JSON.stringify(plannedScenes, null, 2));
        save(sessionId, state);

        progress(sessionId, 2, '⏳ Đang resolve ảnh upload/Serper cho template cần hình...');
        const imageResolved = await downloadImagesForScenePlans({
          scenes: plannedScenes,
          sessionId,
          sessionDir: dir,
          videoObjective: state.videoObjective || 'mac-dinh',
          uploadedImages: state.uploadedImages,
          forceImages: false,
          onLog: log2,
        });
        plannedScenes = imageResolved.scenes;
        state.scriptPlan = plannedScenes;
        fs.writeFileSync(path.join(dir, 'script_plan.json'), JSON.stringify(plannedScenes, null, 2));
        save(sessionId, state);

        progress(sessionId, 2, '⏳ Đang tạo JSON templateData theo mẫu + ảnh local...');
        const finalized = await generateTemplateDataForScript({
          scenes: plannedScenes,
          keys,
          onLog: log2,
          videoObjective: state.videoObjective || 'mac-dinh',
          uploadedImages: state.uploadedImages,
        });
        script = finalized.scenes;
      } else {
        const generated = await generateFreeformScript({
          topic,
          keys,
          onLog: log2,
          videoDurationSec: Number(state.videoDurationSec) || 120,
          uploadedImages: state.uploadedImages,
          requireImages: state.imageRequired,
        });
        script = generated.scenes;
        state.scriptPlan = script;
        fs.writeFileSync(path.join(dir, 'script_plan.json'), JSON.stringify(script, null, 2));
        if (state.imageRequired || script.some(scene => scene.imageRequired || scene['keyword-image'] || scene.keywordImage || scene['uploaded-image-url'] || scene.uploadedImageUrl)) {
          progress(sessionId, 2, '⏳ Đang resolve ảnh upload/Serper cho nhánh AI HTML...');
          const imageResolved = await downloadImagesForScenePlans({
            scenes: script,
            sessionId,
            sessionDir: dir,
            videoObjective: state.videoObjective || 'mac-dinh',
            uploadedImages: state.uploadedImages,
            forceImages: state.imageRequired,
            onLog: log2,
          });
          script = imageResolved.scenes;
          state.scriptPlan = script;
          fs.writeFileSync(path.join(dir, 'script_plan.json'), JSON.stringify(script, null, 2));
        }
      }
      state.script = script;
      fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify(script, null, 2));
      save(sessionId, state);
      progress(sessionId, 2, `✓ Kịch bản: ${script.length} cảnh | ${fmtMs(Date.now() - t0)}`);
    } else {
      progress(sessionId, 2, `✓ Kịch bản đã có: ${script.length} cảnh (bỏ qua)`);
      if (!fs.existsSync(path.join(dir, 'script.json'))) {
        fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify(script, null, 2));
      }
      save(sessionId, state);
      if (scriptNeedsTemplateData(script, state.useTemplateMode)) {
        const log2 = makeLogger(sessionId, 2);
        progress(sessionId, 2, '⏳ Kịch bản cũ chưa có templateData — resolve ảnh và hoàn thiện JSON...');
        script = preferImageTemplatesForScript(script, {
          requireImages: state.imageRequired,
          videoObjective: state.videoObjective || 'mac-dinh',
          uploadedImages: state.uploadedImages,
          onLog: log2,
        });
        const imageResolved = await downloadImagesForScenePlans({
          scenes: script,
          sessionId,
          sessionDir: dir,
          videoObjective: state.videoObjective || 'mac-dinh',
          uploadedImages: state.uploadedImages,
          forceImages: false,
          onLog: log2,
        });
        const finalized = await generateTemplateDataForScript({
          scenes: imageResolved.scenes,
          keys,
          onLog: log2,
          videoObjective: state.videoObjective || 'mac-dinh',
          uploadedImages: state.uploadedImages,
        });
        script = finalized.scenes;
        state.script = script;
        fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify(script, null, 2));
        save(sessionId, state);
      }
      if (!state.useTemplateMode && scriptNeedsImageAssets(script, state.imageRequired)) {
        const log2 = makeLogger(sessionId, 2);
        progress(sessionId, 2, '⏳ Kịch bản AI HTML cũ cần ảnh — resolve upload/Serper...');
        const imageResolved = await downloadImagesForScenePlans({
          scenes: script,
          sessionId,
          sessionDir: dir,
          videoObjective: state.videoObjective || 'mac-dinh',
          uploadedImages: state.uploadedImages,
          forceImages: state.imageRequired,
          onLog: log2,
        });
        script = imageResolved.scenes;
        state.script = script;
        state.scriptPlan = script;
        fs.writeFileSync(path.join(dir, 'script_plan.json'), JSON.stringify(script, null, 2));
        fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify(script, null, 2));
        save(sessionId, state);
      }
    }

    // Khởi tạo state.scenes — save + broadcast ngay để frontend hiện loading cards
    state.scenes = state.scenes || script.map(s => ({
      stt: s.stt,
      voice: s.voice,
      ttsVoice: s.ttsVoice || s.voice,
      targetDurationSec: s.targetDurationSec,
      visual: s.visual,
      template: s.template,
      generationMode: s.generationMode || (state.useTemplateMode ? 'template' : 'ai-html'),
      useTemplateMode: state.useTemplateMode !== false,
      imageRequired: s.imageRequired === true,
      ...(s['keyword-image'] || s.keywordImage ? {
        'keyword-image': s['keyword-image'] || s.keywordImage,
        keywordImage: s.keywordImage || s['keyword-image'],
      } : {}),
      ...(s['uploaded-image-url'] || s.uploadedImageUrl ? {
        'uploaded-image-url': s['uploaded-image-url'] || s.uploadedImageUrl,
        uploadedImageUrl: s.uploadedImageUrl || s['uploaded-image-url'],
      } : {}),
      ...(s['uploaded-image-name'] || s.uploadedImageName ? {
        'uploaded-image-name': s['uploaded-image-name'] || s.uploadedImageName,
        uploadedImageName: s.uploadedImageName || s['uploaded-image-name'],
      } : {}),
      templateData: s.templateData,
      htmlSpec: s.htmlSpec,
      sfxPlan: s.sfxPlan,
      imageCandidates: Array.isArray(s.imageCandidates) ? s.imageCandidates : undefined,
      uploadedImageCandidates: Array.isArray(s.uploadedImageCandidates) ? s.uploadedImageCandidates : undefined,
    }));
    syncScriptVisualAssetsToScenes(state.scenes, script);
    const total  = state.scenes.length;
    save(sessionId, state);
    broadcast({ sessionId, type: 'scenes_ready', total });

    // ── B4+B5: TTS song song → HTML kick-off ngay khi SRT sẵn ────────────────
    // Mỗi scene xong TTS+Whisper → gửi HTML ngay, không chờ scene tiếp theo TTS xong.
    // HTML các scene chạy song song với nhau và với TTS các scene sau.
    progress(sessionId, 4, `⏳ TTS + HTML ${total} cảnh (LarVoice tối đa ${TTS_SRT_CONCURRENCY} cảnh song song)...`);
    const htmlDoneCount = state.scenes.filter(s => s.htmlDone).length;
    if (htmlDoneCount > 0) makeLogger(sessionId, 4)(`${htmlDoneCount} cảnh đã có HTML — bỏ qua`);

    const htmlPromises = [];

    await runConcurrent(state.scenes, TTS_SRT_CONCURRENCY, async (sc) => {
      const audioPath = path.join(dir, 'audio', `${sc.stt}.mp3`);
      const srtPath   = path.join(dir, 'srt',   `${sc.stt}.srt`);
      const wordsPath = path.join(dir, 'srt',   `${sc.stt}.words.json`);
      const log4      = makeLogger(sessionId, 4);

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
        const rawWordTimings = loadWordTimings(wordsPath);
        const corrected = correctSubtitleArtifacts(srtRaw, sc.voice, rawWordTimings);
        if (corrected.srt !== srtRaw) {
          fs.writeFileSync(srtPath, corrected.srt, 'utf8');
          log4(`Whisper: đã align SRT theo kịch bản voice`);
          srtRaw = corrected.srt;
        }
        if (corrected.wordTimings?.length) {
          fs.writeFileSync(wordsPath, JSON.stringify(corrected.wordTimings, null, 2), 'utf8');
        }
        sc.srt    = srtRaw;
        sc.srtDone = true;
        const wordTimings = corrected.wordTimings?.length ? corrected.wordTimings : loadWordTimings(wordsPath);
        if (wordTimings.length) {
          sc.wordTimings = wordTimings;
          log4(`Whisper: đã lưu ${wordTimings.length} mốc thời gian từng từ đã align`);
        }
        save(sessionId, state);
      } else if (!sc.srt && fs.existsSync(srtPath)) {
        // Resume: load SRT từ disk nếu chưa có trong memory
        sc.srt = fs.readFileSync(srtPath, 'utf8');
      }
      if (!sc.wordTimings) {
        const wordTimings = loadWordTimings(wordsPath);
        if (wordTimings.length) {
          sc.wordTimings = wordTimings;
          save(sessionId, state);
        }
      }

      // SRT đã có → kick off HTML ngay (không await, chạy song song với TTS tiếp theo)
      const htmlPath = path.join(dir, 'html', `${sc.stt}.html`);
      const htmlStale = sceneHtmlNeedsTimedRefresh(htmlPath, sc, total);
      if (!sc.htmlDone || !fs.existsSync(htmlPath) || htmlStale) {
        const log5 = makeLogger(sessionId, 5);

        progress(sessionId, 5, htmlStale
          ? `⏳ HTML cảnh ${sc.stt}/${total} là bản cũ — compose lại với timing/SFX...`
          : `⏳ Đang compose HTML HyperFrames cảnh ${sc.stt}/${total}...`);
        htmlPromises.push(
          generateSceneHTML({
            scene: sc,
            keys,
            onLog: log5,
            sceneCount: total,
            useTemplateMode: state.useTemplateMode !== false,
          })
            .then(html => {
              fs.writeFileSync(htmlPath, html);
              sc.htmlDone = true;
              sc.htmlEdited = false;
              save(sessionId, state);
              progress(sessionId, 5, `✓ HTML cảnh ${sc.stt}/${total} xong`);
              broadcast({ sessionId, type: 'scene_html_ready', stt: sc.stt });
            })
        );
      }
    });

    progress(sessionId, 4, `✓ TTS + SRT hoàn thành cho ${total} cảnh`);

    // Chờ tất cả HTML hoàn thành (một số đã xong trong lúc TTS chạy)
    if (htmlPromises.length > 0) await Promise.all(htmlPromises);
    progress(sessionId, 5, `✓ Tất cả ${total} cảnh đã có HTML`);

    // ── B5.5: Chờ user xem trước ──────────────────────────────────────────────
    if (!loadState(sessionId)?.renderTriggered) {
      progress(sessionId, 5, '🔍 HTML sẵn sàng — đang chờ bạn xem trước và bấm Tạo Video...', {
        subtype: 'preview_ready',
        scenes: state.scenes.map(s => ({ stt: s.stt, voice: s.voice })),
      });
      state.status = 'preview';
      save(sessionId, state);
      await waitForRenderTrigger(sessionId);
      state.status = 'running';
      save(sessionId, state);
      progress(sessionId, 6, '▶ Bắt đầu render video...');
    }

    // ── B6: Render ────────────────────────────────────────────────────────────
    const renderConcurrency = Math.max(1, Math.min(2, Number(process.env.HYPERFRAMES_SCENE_CONCURRENCY) || 1));
    progress(sessionId, 6, `⏳ Render ${total} cảnh thành video (tối đa ${renderConcurrency} song song)...`);
    let renderDone = state.scenes.filter(s => s.renderDone).length;
    if (renderDone > 0) makeLogger(sessionId, 6)(`${renderDone} cảnh đã render — bỏ qua`);

    await runConcurrent(state.scenes, renderConcurrency, async (sc) => {
      await renderOneScene(dir, sessionId, sc, state, makeLogger(sessionId, 6));
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
  const htmlPath = path.join(dir, 'html', `${sc.stt}.html`);
  if (!sc.htmlDone || !fs.existsSync(htmlPath) || sceneHtmlNeedsTimedRefresh(htmlPath, sc, state.scenes?.length || 0)) {
    await composeAndSaveSceneHTML({
      dir,
      sessionId,
      scene: sc,
      state,
      log,
      reason: 'HTML cũ chưa có timing/SFX, compose lại trước khi render',
    });
  }
  await renderOneScene(dir, sessionId, sc, state, log);

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
  const wordsPath = path.join(dir, 'srt',   `${stt}.words.json`);
  const htmlPath  = path.join(dir, 'html',  `${stt}.html`);

  const keys = {
    sessionId,
    larvoiceVoiceId: Number(state.larvoiceVoiceId) || 1,
    ttsSpeed:      Number(state.ttsSpeed) || 1.0,
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
  const rawWordTimings = loadWordTimings(wordsPath);
  const corrected = correctSubtitleArtifacts(srtRaw, newVoice, rawWordTimings);
  if (corrected.srt !== srtRaw) {
    fs.writeFileSync(srtPath, corrected.srt, 'utf8');
    srtRaw = corrected.srt;
  }
  if (corrected.wordTimings?.length) {
    fs.writeFileSync(wordsPath, JSON.stringify(corrected.wordTimings, null, 2), 'utf8');
  }
  sc.srt     = srtRaw;
  sc.srtDone = true;
  const wordTimings = corrected.wordTimings?.length ? corrected.wordTimings : loadWordTimings(wordsPath);
  if (wordTimings.length) {
    sc.wordTimings = wordTimings;
    onLog?.(`Whisper: đã lưu ${wordTimings.length} mốc thời gian từng từ`);
  } else {
    sc.wordTimings = null;
  }
  save(sessionId, state);

  // Bước 3: HTML với SRT mới
  onLog?.(`Tạo HTML cảnh ${stt}...`);
  const html = await generateSceneHTML({
    scene: sc,
    keys,
    onLog,
    sceneCount:       state.scenes?.length || 0,
    useTemplateMode:  state.useTemplateMode !== false,
  });

  fs.writeFileSync(htmlPath, html);
  sc.htmlDone   = true;
  sc.htmlEdited = false;
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
      await renderOneScene(dir, sessionId, sc, state, log6);
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

async function renderOneScene(dir, sessionId, sc, state, log) {
  const audioPath   = path.join(dir, 'audio', `${sc.stt}.mp3`);
  const htmlPath    = path.join(dir, 'html',  `${sc.stt}.html`);
  const renderedScene = path.join(dir, 'video', `${sc.stt}_rendered.mp4`);
  const legacySilentVideo = path.join(dir, 'video', `${sc.stt}_silent.mp4`);
  const voiceScene  = path.join(dir, 'video', `${sc.stt}_voice.mp4`);
  const finalScene  = path.join(dir, 'video', `${sc.stt}.mp4`);
  const htmlStale = sceneHtmlNeedsTimedRefresh(htmlPath, sc, state.scenes?.length || 0);

  if (!sc.htmlDone || !fs.existsSync(htmlPath) || htmlStale) {
    await composeAndSaveSceneHTML({
      dir,
      sessionId,
      scene: sc,
      state,
      log,
      reason: htmlStale
        ? 'HTML không khớp template/timing/SFX hiện tại, compose lại trước khi render'
        : 'HTML thiếu, compose lại trước khi render',
    });
  }

  if (sc.renderDone && fs.existsSync(finalScene)) {
    log(`Cảnh ${sc.stt}: đã render — bỏ qua`);
    return;
  }

  log(`Cảnh ${sc.stt}: đo thời lượng audio...`);
  const duration = await getAudioDuration(audioPath);
  log(`Cảnh ${sc.stt}: audio ${duration.toFixed(1)}s`);

  if (fs.existsSync(renderedScene)) fs.unlinkSync(renderedScene);
  if (fs.existsSync(legacySilentVideo)) fs.unlinkSync(legacySilentVideo);
  if (fs.existsSync(finalScene)) fs.unlinkSync(finalScene);

  await renderSceneVideo(htmlPath, renderedScene, duration, log, { voiceAudioPath: audioPath });

  if (fs.existsSync(voiceScene)) fs.unlinkSync(voiceScene);
  if (await hasAudioStream(renderedScene)) {
    fs.copyFileSync(renderedScene, finalScene);
    log(`Cảnh ${sc.stt}: ✓ HyperFrames đã render voice + SFX`);
  } else {
    log(`Cảnh ${sc.stt}: HyperFrames chưa có audio stream, fallback merge voice + SFX...`);
    await mergeSceneAudio(renderedScene, audioPath, finalScene, htmlPath);
  }
  if (fs.existsSync(voiceScene)) fs.unlinkSync(voiceScene);

  const mb = (fs.statSync(finalScene).size / 1024 / 1024).toFixed(1);
  log(`Cảnh ${sc.stt}: ✓ scene xong (${mb} MB)`);

  sc.duration   = duration;
  sc.renderDone = true;
  save(sessionId, state);
}

function syncScriptVisualAssetsToScenes(scenes = [], script = []) {
  const byStt = new Map((Array.isArray(script) ? script : []).map(scene => [Number(scene?.stt), scene]));
  for (const scene of Array.isArray(scenes) ? scenes : []) {
    const planned = byStt.get(Number(scene?.stt));
    if (!planned) continue;
    for (const key of [
      'imageRequired',
      'imageCandidates',
      'uploadedImageCandidates',
      'htmlSpec',
      'sfxPlan',
      'generationMode',
      'useTemplateMode',
      'keywordImage',
      'uploadedImageUrl',
      'uploadedImageName',
    ]) {
      if (planned[key] !== undefined) scene[key] = planned[key];
    }
    for (const key of ['keyword-image', 'uploaded-image-url', 'uploaded-image-name']) {
      if (planned[key] !== undefined) scene[key] = planned[key];
    }
  }
}

async function waitForFile(filePath, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(filePath)) return true;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return fs.existsSync(filePath);
}

async function buildFinalVideo(dir, sessionId, state, log) {
  const fresh             = loadState(sessionId);
  const scenes            = fresh?.scenes ?? state.scenes;
  const enableSubtitles   = (fresh?.enableSubtitles ?? state.enableSubtitles) !== false;

  log(`XFade concat ${scenes.length} cảnh (xfade 0.5s)...`);
  progress(sessionId, 7, `⏳ Ghép ${scenes.length} cảnh với XFade...`);
  const sceneFiles = scenes.map(s => path.join(dir, 'video', `${s.stt}.mp4`));
  const durations  = scenes.map(s => s.duration);
  const concatOut  = path.join(dir, 'final_nosub.mp4');
  await concatScenesWithXFade(sceneFiles, durations, concatOut, 0.5);
  log(`✓ Concat xong`);

  // ── Nhạc nền upload ───────────────────────────────────────────────────────
  let videoForSubs = concatOut;

  const uploadedMusic = fresh?.backgroundMusic ?? state.backgroundMusic ?? null;
  const musicDir = path.join(dir, 'music');
  const uploadedMusicFile = uploadedMusic?.filename || null;
  const uploadedMusicPath = uploadedMusicFile ? path.join(musicDir, uploadedMusicFile) : null;
  const hasUploadedMusic = uploadedMusicPath ? await waitForFile(uploadedMusicPath) : false;
  const plan = {
    background_music: hasUploadedMusic ? uploadedMusicFile : null,
    background_volume: 0.12,
    musicDir,
  };

  if (hasUploadedMusic) {
    log(`Dùng nhạc nền upload: ${uploadedMusic.name || uploadedMusicFile}`);
  } else if (uploadedMusicFile) {
    log(`Không tìm thấy file nhạc nền upload "${uploadedMusicFile}" — bỏ qua nhạc nền`);
  } else {
    log(`Không có nhạc nền upload — bỏ qua nhạc nền`);
  }

  if (plan.background_music) {
    const mixedOut = path.join(dir, 'final_nosub_music.mp4');
    progress(sessionId, 7, `⏳ Mix nhạc nền...`);
    await mixBackgroundMusic(concatOut, mixedOut, plan);
    log(`✓ Đã mix nhạc nền`);
    videoForSubs = mixedOut;
  } else {
    log(`Không có nhạc nền — bỏ qua mix audio`);
  }

  const finalOut  = path.join(dir, 'final.mp4');
  const LOGO_FILE = getSettings().logoPath;

  if (enableSubtitles) {
    const assContent = buildKaraokeASS(scenes, 0.5);
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
