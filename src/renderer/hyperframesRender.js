import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const FPS = 30;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const LOCAL_BLOCKS_DIR = path.join(__dirname, 'hyperframes', 'blocks');
const PROJECT_SFX_DIR = path.join(PROJECT_ROOT, 'assets', 'sfx');
const HYPERFRAMES_RENDER_TIMEOUT_MS = Number(process.env.HYPERFRAMES_RENDER_TIMEOUT_MS || 12 * 60 * 1000);
const HYPERFRAMES_EXIT_GRACE_MS = Number(process.env.HYPERFRAMES_EXIT_GRACE_MS || 5000);

const HYPERFRAMES_CONFIG = {
  $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
  registry: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry',
  paths: {
    blocks: 'blocks',
    components: 'blocks/components',
    assets: 'blocks/assets',
  },
};

const fmtMs = ms => ms < 60000
  ? `${(ms / 1000).toFixed(1)}s`
  : `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;

/**
 * Render a HyperFrames-compatible HTML composition to MP4.
 * Template SFX and narration voice are rendered by HyperFrames when present.
 */
export async function renderSceneVideo(htmlPath, outputVideo, durationSec, onLog, options = {}) {
  const t0 = Date.now();
  const sceneName = path.basename(htmlPath, '.html');
  const compositionDir = path.join(path.dirname(outputVideo), `hyperframes_${sceneName}`);
  fs.rmSync(compositionDir, { recursive: true, force: true });
  fs.mkdirSync(compositionDir, { recursive: true });

  const sourceHtml = fs.readFileSync(htmlPath, 'utf8');
  const voiceSrc = copyVoiceAudio(compositionDir, options.voiceAudioPath);
  const html = injectVoiceAudio(
    forceCompositionDuration(rewriteProjectAssetPaths(sourceHtml, compositionDir), durationSec),
    voiceSrc,
    durationSec
  );
  const compositionId = extractCompositionId(html) || `scene-${sceneName}`;
  copyLocalBlocks(compositionDir);
  copyProjectSfx(compositionDir);
  fs.writeFileSync(path.join(compositionDir, 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(compositionDir, 'hyperframes.json'), JSON.stringify(HYPERFRAMES_CONFIG, null, 2), 'utf8');
  fs.writeFileSync(path.join(compositionDir, 'meta.json'), JSON.stringify({
    id: compositionId,
    name: `Scene ${sceneName}`,
    createdAt: new Date().toISOString(),
  }, null, 2), 'utf8');

  onLog?.(`HyperFrames: render cảnh ${sceneName} (${durationSec.toFixed(2)}s @ ${FPS}fps)`);
  try {
    await runHyperframesRender({
      compositionDir,
      outputVideo,
      onLog,
      strict: true,
    });
  } catch (error) {
    if (!shouldRetryWithoutStrict(error)) throw error;
    onLog?.('HyperFrames: strict lint chặn HTML AI, thử render lại non-strict bằng screenshot capture...');
    fs.rmSync(outputVideo, { force: true });
    await runHyperframesRender({
      compositionDir,
      outputVideo,
      onLog,
      strict: false,
    });
  }

  const mb = (fs.statSync(outputVideo).size / 1024 / 1024).toFixed(1);
  onLog?.(`✓ HyperFrames render xong: ${mb} MB | ${fmtMs(Date.now() - t0)}`);
}

function extractCompositionId(html) {
  const match = String(html || '').match(/data-composition-id="([^"]+)"/);
  return match?.[1] || '';
}

function forceCompositionDuration(html, durationSec) {
  const duration = Math.max(0.1, Number(durationSec) || 1).toFixed(3);
  return html
    .replace(/(<[^>]*data-hf-duration-owner="root"[^>]*data-duration=")[^"]+(")/, `$1${duration}$2`)
    .replace(/(<[^>]*data-hf-duration-owner="scene"[^>]*data-duration=")[^"]+(")/, `$1${duration}$2`)
    .replace(/(<div id="stage"[\s\S]*?data-duration=")[^"]+(")/, `$1${duration}$2`)
    .replace(/(<div class="scene[^"]*"[\s\S]*?data-duration=")[^"]+(")/, `$1${duration}$2`);
}

function copyLocalBlocks(compositionDir) {
  if (!fs.existsSync(LOCAL_BLOCKS_DIR)) return;
  const target = path.join(compositionDir, 'blocks');
  fs.cpSync(LOCAL_BLOCKS_DIR, target, {
    recursive: true,
    filter: source => {
      const rel = path.relative(LOCAL_BLOCKS_DIR, source);
      if (!rel) return true;
      const first = rel.split(path.sep)[0];
      return first !== 'examples' && first !== '_registry';
    },
  });
}

function copyProjectSfx(compositionDir) {
  if (!fs.existsSync(PROJECT_SFX_DIR)) return;
  const target = path.join(compositionDir, 'assets', 'sfx');
  fs.cpSync(PROJECT_SFX_DIR, target, { recursive: true });
}

function copyVoiceAudio(compositionDir, voiceAudioPath) {
  if (!voiceAudioPath) return '';
  if (!fs.existsSync(voiceAudioPath)) {
    throw new Error(`Không tìm thấy voice audio: ${voiceAudioPath}`);
  }
  const ext = path.extname(voiceAudioPath).toLowerCase() || '.mp3';
  const relPath = `assets/voice/narration${ext}`;
  const target = path.join(compositionDir, relPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(voiceAudioPath, target);
  return relPath;
}

function rewriteProjectAssetPaths(html, compositionDir) {
  let out = String(html || '').replace(/(["'(])\/assets\/sfx\//g, '$1assets/sfx/');
  out = out.replace(/(["'(])file:\/\/([^"'()]+?)(?=\1|[)"'])/g, (match, prefix, relPath) => {
    const rewritten = copyLocalFileUrlAsset(`file://${relPath}`, compositionDir);
    return rewritten ? `${prefix}${rewritten}` : match;
  });
  out = out.replace(/(["'(])\/sessions\/([^"'()]+?\/images\/[^"'()]+?)(?=\1|[)"'])/g, (match, prefix, relPath) => {
    const rewritten = copySessionImageAsset(relPath, compositionDir);
    return rewritten ? `${prefix}${rewritten}` : match;
  });
  return out;
}

function copyLocalFileUrlAsset(fileUrl, compositionDir) {
  try {
    const source = path.resolve(fileURLToPath(fileUrl));
    const projectRoot = path.resolve(PROJECT_ROOT);
    if (source !== projectRoot && !source.startsWith(projectRoot + path.sep)) return '';
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return '';

    const rel = path.relative(projectRoot, source);
    const targetRel = path.join('assets', 'local-files', rel);
    const target = path.join(compositionDir, targetRel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    return targetRel.split(path.sep).map(encodeURIComponent).join('/');
  } catch {
    return '';
  }
}

function copySessionImageAsset(relPath, compositionDir) {
  try {
    const decoded = decodeURIComponent(relPath);
    const source = path.resolve(PROJECT_ROOT, 'sessions', decoded);
    const sessionsRoot = path.resolve(PROJECT_ROOT, 'sessions');
    if (source !== sessionsRoot && !source.startsWith(sessionsRoot + path.sep)) return '';
    if (!fs.existsSync(source)) return '';

    const targetRel = path.join('assets', 'session-images', decoded);
    const target = path.join(compositionDir, targetRel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    return targetRel.split(path.sep).map(encodeURIComponent).join('/');
  } catch {
    return '';
  }
}

function injectVoiceAudio(html, voiceSrc, durationSec) {
  if (!voiceSrc) return html;
  const duration = Math.max(0.1, Number(durationSec) || 1).toFixed(3);
  const voiceTag = `<audio id="voiceover"
      data-start="0"
      data-end="${duration}"
      data-duration="${duration}"
      data-layer="1"
      data-track-index="1"
      data-volume="1"
      preload="auto"
      src="${escapeAttr(voiceSrc)}"></audio>`;
  const withoutOldVoice = String(html || '').replace(/\s*<audio\b[^>]*\bid=(?:"voiceover"|'voiceover')[\s\S]*?<\/audio>/i, '');
  if (/<div id="stage"[^>]*>/i.test(withoutOldVoice)) {
    return withoutOldVoice.replace(/(<div id="stage"[^>]*>)/i, `$1\n    ${voiceTag}`);
  }
  return withoutOldVoice.replace(/(<body[^>]*>)/i, `$1\n    ${voiceTag}`);
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function runHyperframesRender({ compositionDir, outputVideo, onLog, strict = true }) {
  return new Promise((resolve, reject) => {
    const args = [
      'hyperframes',
      'render',
      compositionDir,
      '--output',
      outputVideo,
      '--fps',
      String(FPS),
      '--quality',
      'standard',
      '--workers',
      '1',
    ];
    if (strict) args.push('--strict');

    const proc = spawn('npx', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      detached: true,
    });

    let stderr = '';
    let renderLog = '';
    let settled = false;
    let sawCompleted = false;
    let completionTimer = null;
    const hardTimeout = setTimeout(() => {
      fail(new Error(`hyperframes render timeout after ${fmtMs(HYPERFRAMES_RENDER_TIMEOUT_MS)}: ${stderr.slice(-800)}`));
    }, HYPERFRAMES_RENDER_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(hardTimeout);
      if (completionTimer) clearTimeout(completionTimer);
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      terminateProcessGroup(proc);
      reject(error);
    };

    const succeed = async ({ terminate = false } = {}) => {
      if (settled) return;
      try {
        await waitForStableFile(outputVideo, { minBytes: 1024, stableMs: 1000, timeoutMs: 10000 });
      } catch (error) {
        fail(error);
        return;
      }
      if (settled) return;
      settled = true;
      cleanup();
      if (terminate) terminateProcessGroup(proc);
      resolve();
    };

    const scheduleCompletedFallback = () => {
      sawCompleted = true;
      if (completionTimer) clearTimeout(completionTimer);
      completionTimer = setTimeout(() => {
        onLog?.(`HyperFrames: process chưa thoát sau khi completed, xác nhận file output rồi đóng process treo...`);
        succeed({ terminate: true });
      }, HYPERFRAMES_EXIT_GRACE_MS);
    };

    const handleOutput = (chunk, isStderr = false) => {
      const text = chunk.toString();
      if (isStderr) stderr += text;
      renderLog += text;
      for (const line of text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
        onLog?.(`HyperFrames: ${line}`);
        if (isHyperframesCompletedLine(line)) {
          scheduleCompletedFallback();
        }
      }
    };

    proc.stdout.on('data', chunk => handleOutput(chunk));
    proc.stderr.on('data', chunk => handleOutput(chunk, true));
    proc.on('error', fail);
    proc.on('close', code => {
      if (settled) return;
      if (code === 0) {
        succeed();
        return;
      }
      if (sawCompleted && fs.existsSync(outputVideo)) {
        succeed();
        return;
      }
      const detail = (stderr || renderLog).slice(-1200);
      fail(new Error(`hyperframes render failed (${code}): ${detail}`));
    });
  });
}

function shouldRetryWithoutStrict(error) {
  const message = String(error?.message || '');
  return /Aborting render due to lint issues/i.test(message) ||
    /missing_timeline_registry|non_deterministic_code|gsap_infinite_repeat|requestanimationframe_in_composition/i.test(message);
}

function isHyperframesCompletedLine(line) {
  return /\bRender complete\b/i.test(line) ||
    /(?:^|\s|·)completed\s*$/i.test(line);
}

function waitForStableFile(filePath, { minBytes = 1, stableMs = 1000, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let lastSize = -1;
    let stableSince = 0;

    const poll = () => {
      let stat = null;
      try {
        stat = fs.statSync(filePath);
      } catch {
        stat = null;
      }

      const size = stat?.size || 0;
      if (size >= minBytes && size === lastSize) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince >= stableMs) {
          resolve();
          return;
        }
      } else {
        stableSince = 0;
        lastSize = size;
      }

      if (Date.now() - start > timeoutMs) {
        reject(new Error(`hyperframes completed but output file is not stable: ${filePath}`));
        return;
      }
      setTimeout(poll, 250);
    };

    poll();
  });
}

function terminateProcessGroup(proc) {
  if (!proc?.pid) return;
  try {
    process.kill(-proc.pid, 'SIGTERM');
  } catch {
    try {
      proc.kill('SIGTERM');
    } catch {}
  }
}
