// src/renderer/ffmpegMerge.js - Bước 6b (ghép audio) + Bước 7 (xfade concat) + Bước 7b (karaoke subs)
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const AR_CONFIGS = {
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
  '1:1':  { w: 1080, h: 1080 },
  '4:5':  { w: 1080, h: 1350 },
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
export function buildKaraokeASS(scenes, xfadeDur = 0.5, outputAspectRatio = '9:16') {
  const { w: playResX, h: playResY } = AR_CONFIGS[outputAspectRatio] || AR_CONFIGS['9:16'];
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

function resolveExistingMedia(fileName, dir) {
  if (!fileName || !dir) return null;
  const mediaPath = path.join(dir, fileName);
  return fs.existsSync(mediaPath) ? mediaPath : null;
}

/**
 * Mix nhạc nền + sound effects vào video đã có voice audio.
 *
 * @param {string} inputVideo   - video đã ghép giọng đọc (final_nosub.mp4)
 * @param {string} outputVideo  - đầu ra
 * @param {{
 *   background_music: string|null,
 *   background_volume: number,
 *   sound_effects: Array<{file:string, time:number, volume:number}>,
 *   musicDir: string,
 *   sfxDir: string,
 * }} plan
 */
export async function mixMusicAndSFX(inputVideo, outputVideo, plan) {
  const { background_music, background_volume = 0.12, sound_effects = [], musicDir, sfxDir } = plan;
  const bgmPath = resolveExistingMedia(background_music, musicDir);
  const hasBGM = !!bgmPath;
  const validSFX = sound_effects
    .map((sfx, index) => {
      const sfxPath = resolveExistingMedia(sfx?.file, sfxDir);
      if (!sfxPath) return null;
      const time = Number(sfx.time);
      const volume = Number.isFinite(Number(sfx.volume)) ? Number(sfx.volume) : 1;
      if (!Number.isFinite(time) || time < 0) return null;
      return { ...sfx, file: sfx.file, path: sfxPath, time, volume, index };
    })
    .filter(Boolean);
  const hasSFX = validSFX.length > 0;

  if (!hasBGM && !hasSFX) {
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
  let audioInputIdx = 1;
  let mixInputs = '[0:a]';

  // Nhạc nền: loop + fade out
  if (hasBGM) {
    ffArgs.push('-stream_loop', '-1', '-i', bgmPath);
    filterParts.push(
      `[${audioInputIdx}:a]atrim=0:${totalDuration.toFixed(3)},` +
      `volume=${background_volume},` +
      `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=3[bgm]`
    );
    mixInputs += '[bgm]';
    audioInputIdx++;
  }

  // Sound effects: delay đến đúng timestamp
  for (let i = 0; i < validSFX.length; i++) {
    const sfx = validSFX[i];
    const delayMs = Math.round(sfx.time * 1000);
    ffArgs.push('-i', sfx.path);
    filterParts.push(
      `[${audioInputIdx}:a]adelay=${delayMs}|${delayMs},volume=${sfx.volume}[sfx${i}]`
    );
    mixInputs += `[sfx${i}]`;
    audioInputIdx++;
  }

  const totalMixInputs = 1 + (hasBGM ? 1 : 0) + validSFX.length;
  filterParts.push(
    `${mixInputs}amix=inputs=${totalMixInputs}:duration=first:normalize=0[aout]`
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

export async function mergeSceneAudio(silentVideo, audioFile, outputFile) {
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
