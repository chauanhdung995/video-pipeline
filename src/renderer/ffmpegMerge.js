// src/renderer/ffmpegMerge.js - Bước 6b (ghép audio) + Bước 7 (xfade concat) + Bước 7b (karaoke subs)
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const AR_CONFIGS = {
  '9:16': { w: 1080, h: 1920 },
};

// ─── SRT / ASS helpers ───────────────────────────────────────────────────────

function parseSRTLines(srt) {
  return srt.trim().split(/\n\n+/).map(b => {
    const lines = b.split('\n');
    const [from, to] = (lines[1] || '').split(' --> ').map(t => t.trim());
    return { from, to, text: lines.slice(2).join(' ') };
  }).filter(x => x.from && x.to);
}

function srtToMs(t) {
  const [h, m, rest] = t.split(':');
  const [s, ms] = rest.split(',');
  return (+h) * 3600000 + (+m) * 60000 + (+s) * 1000 + (+ms);
}

function msToASS(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.round((ms % 1000) / 10);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Tạo nội dung file ASS từ tất cả cảnh.
 * - Chữ đang đọc: vàng (#F7B500)
 * - Chữ còn lại (trước và sau): trắng — KHÔNG tích lũy vàng
 * Mỗi từ là một Dialogue event riêng, chỉ active trong khoảng thời gian nó được đọc.
 * Timing từng từ phân bổ tỷ lệ theo số ký tự.
 */
export function buildKaraokeASS(scenes, xfadeDur = 0.5) {
  const { w: playResX, h: playResY } = AR_CONFIGS['9:16'];
  // ASS màu: AABBGGRR — #F7B500 → &H0000B5F7 | trắng → &H00FFFFFF
  const YELLOW = '&H0000B5F7&';
  const WHITE  = '&H00FFFFFF&';

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // PrimaryColour=trắng (default), OutlineColour=đen, BackColour=đen mờ
    // Bold=-1, Alignment=2 (bottom-center), MarginV=110
    'Style: Default,Be Vietnam Pro,68,&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,3,2,2,20,20,110,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const dialogues = [];
  let offsetMs = 0;

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    if (sc.srt) {
      for (const entry of parseSRTLines(sc.srt)) {
        const fromAbs = srtToMs(entry.from) + offsetMs;
        const toAbs   = srtToMs(entry.to)   + offsetMs;
        const words = entry.text.trim().split(/\s+/).filter(Boolean);
        if (!words.length) continue;

        const totalChars = words.reduce((sum, w) => sum + w.length, 0) || 1;
        const totalDur   = toAbs - fromAbs;

        // Tính điểm bắt đầu từng từ theo tỷ lệ ký tự
        const wordStarts = [];
        let t = fromAbs;
        for (const w of words) {
          wordStarts.push(t);
          t += Math.max(30, Math.round((w.length / totalChars) * totalDur));
        }

        // Mỗi từ: một Dialogue event riêng, hiển thị toàn bộ dòng,
        // chỉ tô vàng đúng từ đang được đọc, các từ còn lại trắng
        for (let wi = 0; wi < words.length; wi++) {
          const start = wordStarts[wi];
          const end   = wi < words.length - 1 ? wordStarts[wi + 1] : toAbs;

          const text = words.map((w, j) => {
            if (j === wi) return `{\\1c${YELLOW}}${w}{\\1c${WHITE}}`;
            return w;
          }).join(' ');

          dialogues.push(
            `Dialogue: 0,${msToASS(start)},${msToASS(end)},Default,,0,0,0,,${text}`
          );
        }
      }
    }

    // Tính offset cho cảnh tiếp theo: duration trừ xfade overlap
    if (sc.duration != null) {
      const overlapMs = i < scenes.length - 1 ? Math.round(xfadeDur * 1000) : 0;
      offsetMs += Math.round(sc.duration * 1000) - overlapMs;
    }
  }

  return header + '\n' + dialogues.join('\n') + '\n';
}

/**
 * Burn subtitle ASS + logo watermark vào video (2 pass riêng biệt).
 * Logo: góc trên-phải, width=110px.
 */
export async function burnSubtitlesAndLogo(inputVideo, assFile, logoFile, outputVideo) {
  const tmpVideo = outputVideo + '_tmp.mp4';

  // Pass 1: burn ASS subtitles
  const escapedAss = assFile.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
  await runFF([
    '-i', inputVideo,
    '-vf', `subtitles=filename='${escapedAss}'`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    tmpVideo,
  ]);

  if (logoFile && fs.existsSync(logoFile)) {
    await runFF([
      '-i', tmpVideo,
      '-i', logoFile,
      '-filter_complex', '[1:v]scale=110:-1[logo];[0:v][logo]overlay=W-w-24:24[out]',
      '-map', '[out]', '-map', '0:a',
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      outputVideo,
    ]);
  } else {
    fs.copyFileSync(tmpVideo, outputVideo);
  }

  fs.unlinkSync(tmpVideo);
}

function runFF(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => err += d);
    p.on('close', c => c === 0 ? resolve() : reject(new Error('ffmpeg: ' + err.slice(-500))));
  });
}

function probeDuration(file) {
  return new Promise((res, rej) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file]);
    let out = '';
    let err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('close', c => {
      if (c !== 0) {
        rej(new Error(`ffprobe failed: ${err.slice(-300) || file}`));
        return;
      }
      const duration = parseFloat(out);
      if (!Number.isFinite(duration) || duration <= 0) {
        rej(new Error(`ffprobe duration không hợp lệ cho ${file}`));
        return;
      }
      res(duration);
    });
  });
}

export function hasAudioStream(file) {
  return new Promise(resolve => {
    const p = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=index',
      '-of', 'csv=p=0',
      file,
    ]);
    let out = '';
    p.stdout.on('data', d => out += d);
    p.on('close', c => resolve(c === 0 && out.trim().length > 0));
    p.on('error', () => resolve(false));
  });
}

function extractSceneSfxClips(htmlPath) {
  if (!htmlPath || !fs.existsSync(htmlPath)) return [];
  const html = fs.readFileSync(htmlPath, 'utf8');
  return Array.from(html.matchAll(/<audio\b[^>]*data-sfx-template=[^>]*>/gi))
    .map((match, index) => {
      const tag = match[0];
      const src = readHtmlAttr(tag, 'src');
      const file = resolveSfxSource(src, htmlPath);
      const start = Math.max(0, Number(readHtmlAttr(tag, 'data-start')) || 0);
      const volumeRaw = Number(readHtmlAttr(tag, 'data-volume'));
      const volume = Number.isFinite(volumeRaw) ? Math.max(0, Math.min(1, volumeRaw)) : 0.28;
      if (!file || !fs.existsSync(file)) return null;
      return { index, file, start, volume };
    })
    .filter(Boolean);
}

function readHtmlAttr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = String(tag || '').match(re);
  return decodeHtmlAttr(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}

function decodeHtmlAttr(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function resolveSfxSource(src, htmlPath) {
  const raw = String(src || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/assets/sfx/')) return path.join(PROJECT_ROOT, decodeURI(raw.slice(1)));
  if (raw.startsWith('assets/sfx/')) return path.join(PROJECT_ROOT, decodeURI(raw));
  if (raw.startsWith('file://')) {
    try { return fileURLToPath(raw); } catch { return ''; }
  }
  if (/^https?:\/\//i.test(raw)) return '';
  return path.resolve(path.dirname(htmlPath), decodeURI(raw));
}

function resolveExistingMedia(fileName, dir) {
  if (!fileName || !dir) return null;
  const mediaPath = path.join(dir, fileName);
  return fs.existsSync(mediaPath) ? mediaPath : null;
}

/**
 * Mix nhạc nền vào video đã có voice audio.
 * Scene-level SFX live as <audio data-sfx-...> cues in each HyperFrames
 * HTML file. HyperFrames should render them directly; mergeSceneAudio only
 * falls back to reading those cues if the rendered video has no audio stream.
 */
export async function mixBackgroundMusic(inputVideo, outputVideo, plan) {
  const { background_music, background_volume = 0.12, musicDir } = plan;
  const bgmPath = resolveExistingMedia(background_music, musicDir);
  const hasBackgroundMusic = !!bgmPath;

  if (!hasBackgroundMusic) {
    fs.copyFileSync(inputVideo, outputVideo);
    return;
  }

  // Đo tổng thời lượng video để fade-out nhạc nền
  let totalDuration;
  try {
    totalDuration = await probeDuration(inputVideo);
  } catch {
    // Nếu không đo được duration, bỏ qua nhạc và dùng video gốc
    fs.copyFileSync(inputVideo, outputVideo);
    return;
  }
  const fadeOutStart  = Math.max(0, totalDuration - 3);

  const ffArgs = ['-i', inputVideo];
  const filterParts = [];

  // Nhạc nền: loop + fade out
  ffArgs.push('-stream_loop', '-1', '-i', bgmPath);
  filterParts.push(
    `[1:a]atrim=0:${totalDuration.toFixed(3)},` +
    `volume=${background_volume},` +
    `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=3[bgm]`,
    `[0:a][bgm]amix=inputs=2:duration=first:normalize=0[aout]`
  );

  ffArgs.push(
    '-filter_complex', filterParts.join(';'),
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k',
    outputVideo
  );

  await runFF(ffArgs);
}

/**
 * Overlay logo lên video mà không burn subtitle.
 * Dùng khi người dùng tắt phụ đề nhưng vẫn muốn watermark logo.
 */
export async function burnLogoOnly(inputVideo, logoFile, outputVideo) {
  if (logoFile && fs.existsSync(logoFile)) {
    await runFF([
      '-i', inputVideo, '-i', logoFile,
      '-filter_complex', '[1:v]scale=110:-1[logo];[0:v][logo]overlay=W-w-24:24[out]',
      '-map', '[out]', '-map', '0:a',
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      outputVideo,
    ]);
  } else {
    fs.copyFileSync(inputVideo, outputVideo);
  }
}

export async function mergeSceneAudio(silentVideo, audioFile, outputFile, htmlPath = '') {
  const hasSceneAudio = await hasAudioStream(silentVideo);
  const sfxClips = hasSceneAudio ? [] : extractSceneSfxClips(htmlPath);

  if (hasSceneAudio || sfxClips.length) {
    const inputs = ['-i', silentVideo, '-i', audioFile];
    sfxClips.forEach(clip => inputs.push('-i', clip.file));

    const filters = [];
    const mixLabels = [];
    if (hasSceneAudio) {
      filters.push('[0:a]volume=1[a0]');
      mixLabels.push('[a0]');
    }
    filters.push('[1:a]volume=1[voice]');
    mixLabels.push('[voice]');
    sfxClips.forEach((clip, idx) => {
      const inputIndex = idx + 2;
      const delayMs = Math.max(0, Math.round(clip.start * 1000));
      filters.push(`[${inputIndex}:a]adelay=${delayMs}:all=1,volume=${clip.volume.toFixed(3)}[sfx${idx}]`);
      mixLabels.push(`[sfx${idx}]`);
    });
    filters.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=longest:normalize=0[aout]`);

    await runFF([
      ...inputs,
      '-filter_complex', filters.join(';'),
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-shortest', outputFile
    ]);
    return;
  }

  await runFF([
    '-i', silentVideo, '-i', audioFile,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-shortest', outputFile
  ]);
}

/**
 * Ghép nhiều cảnh lại bằng xfade + acrossfade 0.5s (mặc định).
 * Dùng ffprobe đo duration thực tế của từng cảnh để offset chính xác.
 */
export async function concatScenesWithXFade(sceneFiles, _durations, outputFile, xfadeDur = 0.5) {
  if (sceneFiles.length === 1) {
    fs.copyFileSync(sceneFiles[0], outputFile);
    return;
  }

  // Đo duration chính xác
  const dur = [];
  for (const f of sceneFiles) dur.push(await probeDuration(f));

  const n = sceneFiles.length;
  const inputs = sceneFiles.flatMap(f => ['-i', f]);

  // Build filter: chain xfade
  let vFilter = '';
  let aFilter = '';
  let offset = 0;

  for (let i = 0; i < n - 1; i++) {
    offset += dur[i] - xfadeDur;
    const vIn1 = i === 0 ? '[0:v]' : `[vx${i - 1}]`;
    const vIn2 = `[${i + 1}:v]`;
    const vOut = i === n - 2 ? '[vout]' : `[vx${i}]`;
    vFilter += `${vIn1}${vIn2}xfade=transition=fade:duration=${xfadeDur}:offset=${offset.toFixed(3)}${vOut};`;

    const aIn1 = i === 0 ? '[0:a]' : `[ax${i - 1}]`;
    const aIn2 = `[${i + 1}:a]`;
    const aOut = i === n - 2 ? '[aout]' : `[ax${i}]`;
    aFilter += `${aIn1}${aIn2}acrossfade=d=${xfadeDur}:c1=tri:c2=nofade${aOut};`;
  }

  const filter = vFilter + aFilter.slice(0, -1);

  await runFF([
    ...inputs,
    '-filter_complex', filter,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    outputFile
  ]);
}
