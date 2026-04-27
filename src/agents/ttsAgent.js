import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';

const LUCYLAB_API       = 'https://api.lucylab.io/json-rpc';
const VBEE_API          = 'https://vbee.vn/api/v1/tts';
const DEFAULT_VOICE_ID  = '24oEtXGic7NhDjXzmDbDvt';
const POLL_INTERVAL_MS  = 2000;

const fmtMs = ms => ms < 60000
  ? `${(ms / 1000).toFixed(1)}s`
  : `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;

async function lucylabRPC(apiKey, method, input) {
  const res = await fetch(LUCYLAB_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ method, input }),
  });
  if (!res.ok) throw new Error(`LucyLab HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  if (data.error) throw new Error(`LucyLab RPC error: ${JSON.stringify(data.error)}`);
  return data.result;
}

async function callVbeeTTS(apiKey, appId, text, voiceCode, speedRate = 1.0) {
  const res = await fetch(VBEE_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app_id: appId,
      response_type: 'direct',
      input_text: text,
      voice_code: voiceCode,
      audio_type: 'mp3',
      bitrate: 128,
      speed_rate: String(Number(speedRate).toFixed(1)),
    }),
  });
  if (!res.ok) throw new Error(`Vbee HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  if (Number(data?.status) !== 1 || !data?.result?.audio_link) {
    throw new Error(`Vbee API lỗi: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data.result;
}

function convertToMp3(src, dst) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-y', '-i', src, '-b:a', '192k', '-ar', '24000', dst],
      { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => err += d);
    p.on('close', c => c === 0 ? resolve() : reject(new Error('ffmpeg: ' + err.slice(-300))));
  });
}

function probeAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file]);
    let out = '';
    p.stdout.on('data', d => out += d);
    p.on('close', c => c === 0 ? resolve(parseFloat(out)) : reject(new Error('ffprobe failed')));
  });
}

function concatMp3Files(inputs, outputPath) {
  return new Promise((resolve, reject) => {
    const listFile = path.join(os.tmpdir(), `tts_concat_${Date.now()}.txt`);
    fs.writeFileSync(listFile, inputs.map(file => `file '${file.replace(/'/g, `'\\''`)}'`).join('\n'), 'utf8');
    const p = spawn('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputPath],
      { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => err += d);
    p.on('close', c => {
      if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
      c === 0 ? resolve() : reject(new Error('ffmpeg concat: ' + err.slice(-400)));
    });
  });
}

function sanitizeVbeeText(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
}

function splitVbeeText(text, maxLen = 220) {
  const normalized = sanitizeVbeeText(text);
  if (normalized.length <= maxLen) return [normalized];

  const sentences = normalized
    .split(/(?<=[.!?;:])\s+/)
    .map(part => part.trim())
    .filter(Boolean);

  if (!sentences.length) return [normalized];

  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }
    if (`${current} ${sentence}`.length <= maxLen) {
      current += ` ${sentence}`;
      continue;
    }
    chunks.push(current);
    current = sentence;
  }
  if (current) chunks.push(current);

  return chunks.flatMap(chunk => {
    if (chunk.length <= maxLen) return [chunk];
    const words = chunk.split(/\s+/);
    const parts = [];
    let part = '';
    for (const word of words) {
      if (!part) {
        part = word;
        continue;
      }
      if (`${part} ${word}`.length <= maxLen) {
        part += ` ${word}`;
      } else {
        parts.push(part);
        part = word;
      }
    }
    if (part) parts.push(part);
    return parts;
  });
}

async function synthesizeVbeeSingle({ apiKey, appId, voiceCode, text, outputPath, onLog, speedRate = 1.0 }) {
  onLog?.(`TTS: Gửi yêu cầu Vbee (voice=${voiceCode}, speed=${speedRate})...`);
  const result = await callVbeeTTS(apiKey, appId, text, voiceCode, speedRate);
  onLog?.(`TTS: request_id=${result.request_id} — tải audio...`);
  const audioRes = await fetch(result.audio_link);
  if (!audioRes.ok) throw new Error(`Vbee download audio HTTP ${audioRes.status}`);
  fs.writeFileSync(outputPath, Buffer.from(await audioRes.arrayBuffer()));
}

async function synthesizeVbee({ apiKey, appId, voiceCode, text, outputPath, onLog, speedRate = 1.0 }) {
  const sanitized = sanitizeVbeeText(text);
  try {
    await synthesizeVbeeSingle({ apiKey, appId, voiceCode, text: sanitized, outputPath, onLog, speedRate });
    return;
  } catch (error) {
    const looksLikeInputIssue = /1045/.test(error.message) || sanitized !== String(text || '').trim();
    if (!looksLikeInputIssue) throw error;
    onLog?.('TTS: Vbee từ chối chuỗi gốc, thử chuẩn hóa/chia nhỏ nội dung...');
  }

  const parts = splitVbeeText(sanitized);
  if (parts.length <= 1) {
    await synthesizeVbeeSingle({ apiKey, appId, voiceCode, text: sanitized, outputPath, onLog, speedRate });
    return;
  }

  const tempFiles = [];
  try {
    for (let i = 0; i < parts.length; i++) {
      const partPath = path.join(os.tmpdir(), `tts_vbee_${Date.now()}_${i + 1}.mp3`);
      tempFiles.push(partPath);
      onLog?.(`TTS: Vbee chia câu ${i + 1}/${parts.length}...`);
      await synthesizeVbeeSingle({ apiKey, appId, voiceCode, text: parts[i], outputPath: partPath, onLog, speedRate });
    }
    await concatMp3Files(tempFiles, outputPath);
  } finally {
    for (const file of tempFiles) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
}

/**
 * @param {string} text
 * @param {string} outputPath  — đường dẫn file .mp3 đầu ra
 * @param {(msg:string)=>void} [onLog]
 * @param {{ ttsProvider?: string, lucylabKey?: string, voiceId?: string, vbeeKey?: string, vbeeAppId?: string, vbeeVoiceCode?: string }} [keys]
 */
export async function generateTTS(text, outputPath, onLog, keys = {}) {
  const ttsProvider = keys.ttsProvider || 'lucylab';
  const apiKey  = keys.lucylabKey;
  const voiceId = keys.voiceId || DEFAULT_VOICE_ID;
  const vbeeKey = keys.vbeeKey;
  const vbeeAppId = keys.vbeeAppId;
  const vbeeVoiceCode = keys.vbeeVoiceCode;
  const ttsSpeed = Math.max(0.5, Math.min(2.0, Number(keys.ttsSpeed) || 1.0));

  const preview = text.slice(0, 60) + (text.length > 60 ? '…' : '');
  const t0 = Date.now();
  const MAX_RETRIES = 3;

  if (ttsProvider === 'vbee') {
    if (!vbeeKey) throw new Error('Thiếu Vbee API key — nhập key trên giao diện');
    if (!vbeeAppId) throw new Error('Thiếu Vbee Project ID — nhập trên giao diện');
    if (!vbeeVoiceCode) throw new Error('Thiếu Vbee Voice ID — nhập trên giao diện');
  } else if (!apiKey) {
    throw new Error('Thiếu LucyLab API key — nhập key trên giao diện');
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 1) onLog?.(`TTS: Thử lại lần ${attempt}/${MAX_RETRIES}...`);
    try {
      onLog?.(`TTS: "${preview}"`);

      if (ttsProvider === 'vbee') {
        await synthesizeVbee({
          apiKey: vbeeKey,
          appId: vbeeAppId,
          voiceCode: vbeeVoiceCode,
          text,
          outputPath,
          onLog,
          speedRate: ttsSpeed,
        });
        const duration = await probeAudioDuration(outputPath);
        const kb = (fs.statSync(outputPath).size / 1024).toFixed(0);
        onLog?.(`✓ TTS xong (Vbee): ${duration.toFixed(1)}s audio (${kb} KB) | ${fmtMs(Date.now() - t0)}`);
        return { duration };
      }

      // 1. Tạo job (hoặc tái dùng export đang pending)
      onLog?.(`TTS: Gửi yêu cầu LucyLab (voice=${voiceId}, speed=${ttsSpeed})...`);
      let projectExportId;
      try {
        ({ projectExportId } = await lucylabRPC(apiKey, 'ttsLongText', {
          text,
          userVoiceId: voiceId,
          speed: ttsSpeed,
        }));
      } catch (rpcErr) {
        // API không cho tạo job mới khi đã có export đang chờ — tái dùng ID đó
        let existing;
        try { existing = JSON.parse(rpcErr.message.replace(/^LucyLab RPC error: /, '')); } catch {}
        if (existing?.data?.existingExportId) {
          projectExportId = existing.data.existingExportId;
          onLog?.(`TTS: Phát hiện export đang pending (${projectExportId}) — tái dùng...`);
        } else {
          throw rpcErr;
        }
      }
      onLog?.(`TTS: Export ID=${projectExportId} — đang chờ render...`);

      // 2. Poll đến khi hoàn thành
      let audioUrl = null;
      while (true) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        const status = await lucylabRPC(apiKey, 'getExportStatus', { projectExportId });
        onLog?.(`TTS: state=${status.state}`);
        if (status.state === 'completed') {
          audioUrl = status.result?.url ?? status.result?.mp3Url
                   ?? status.url ?? status.audioUrl ?? status.download_url ?? status.downloadUrl
                   ?? status.output?.url ?? status.file_url ?? status.fileUrl;
          if (!audioUrl) throw new Error(`LucyLab completed nhưng không có URL. Response: ${JSON.stringify(status)}`);
          break;
        }
        if (status.state === 'failed') throw new Error('LucyLab TTS thất bại (state=failed)');
      }

      // 3. Tải file audio (WAV)
      onLog?.(`TTS: Tải audio từ CDN...`);
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) throw new Error(`Download audio HTTP ${audioRes.status}`);
      const buffer = Buffer.from(await audioRes.arrayBuffer());

      // 4. Lưu WAV tạm → convert sang MP3
      const tmpWav = path.join(os.tmpdir(), `tts_lucy_${Date.now()}.wav`);
      try {
        fs.writeFileSync(tmpWav, buffer);
        await convertToMp3(tmpWav, outputPath);
      } finally {
        if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav);
      }

      const duration = await probeAudioDuration(outputPath);
      const kb = (fs.statSync(outputPath).size / 1024).toFixed(0);
      onLog?.(`✓ TTS xong: ${duration.toFixed(1)}s audio (${kb} KB) | ${fmtMs(Date.now() - t0)}`);
      return { duration };

    } catch (err) {
      onLog?.(`TTS: Lỗi lần ${attempt}: ${err.message}`);
      if (attempt === MAX_RETRIES) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}
