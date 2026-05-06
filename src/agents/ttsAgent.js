import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { LARVOICE_API_KEY } from '../config/apiKeys.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LARVOICE_API_BASE = 'https://larvoice.com/api/v2';
const DEFAULT_LARVOICE_VOICE_ID = 1;
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 10 * 60 * 1000;
const VOICE_CACHE_MS = 10 * 60 * 1000;
const SAMPLE_DIR = path.resolve(__dirname, '../../public/voice-samples');
const SAMPLE_SPEED = 1.0;
const SAMPLE_MANIFEST_FILE = path.join(SAMPLE_DIR, '_manifest.json');
const SAMPLE_FAILED_FILE = path.join(SAMPLE_DIR, '_failed.json');
const SAMPLE_RETRY_DELAY_MS = 30000;

const FALLBACK_VOICES = [
  { id: 3473, name: 'Adam', language: 'vi', gender: 'male', topics: 'review,ads,dubbing', region: '' },
  { id: 3459, name: 'Ngạn Kể', language: 'vi', gender: 'male', topics: 'audiobook,storytelling,podcast', region: '' },
  { id: 3458, name: 'Quang Minh', language: 'vi', gender: 'male', topics: 'audiobook,storytelling,podcast', region: '' },
  { id: 1, name: 'Anh Quân', language: 'vi', gender: 'male', topics: 'audiobook,storytelling,podcast', region: '' },
  { id: 3397, name: 'Ngọc Huyền', language: 'vi', gender: 'female', topics: 'review', region: '' },
  { id: 2393, name: 'Jeee', language: 'en', gender: 'male', topics: 'review', region: '' },
  { id: 2392, name: 'Arnold', language: 'en', gender: 'male', topics: 'review', region: '' },
  { id: 2391, name: 'Sam', language: 'en', gender: 'male', topics: 'review', region: '' },
  { id: 2390, name: 'Glina', language: 'en', gender: 'male', topics: 'review', region: '' },
  { id: 1364, name: 'Mason', language: 'en', gender: 'male', topics: 'review', region: '' },
  { id: 1363, name: 'Ava', language: 'en', gender: 'female', topics: 'review', region: '' },
  { id: 184, name: 'Ella', language: 'en', gender: 'female', topics: 'review', region: '' },
];

let voiceCache = { at: 0, voices: [] };

const fmtMs = ms => ms < 60000
  ? `${(ms / 1000).toFixed(1)}s`
  : `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function ttsRetryDelayMs(error, attempt) {
  const message = String(error?.message || '');
  if (/429|rate|too many|server error/i.test(message)) {
    return Math.min(90000, 12000 * attempt);
  }
  return Math.min(30000, 3000 * attempt);
}

function clampSpeed(value) {
  return Math.max(0.5, Math.min(2.0, Number(value) || 1.0));
}

function larvoiceHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${LARVOICE_API_KEY}`,
    ...extra,
  };
}

function larvoiceUrl(pathOrUrl) {
  return /^https?:\/\//i.test(pathOrUrl)
    ? pathOrUrl
    : `${LARVOICE_API_BASE}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

async function larvoiceJson(pathOrUrl, { method = 'GET', body } = {}) {
  const res = await fetch(larvoiceUrl(pathOrUrl), {
    method,
    headers: larvoiceHeaders(body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`LarVoice trả về dữ liệu không phải JSON: ${raw.slice(0, 300)}`);
  }
  if (!res.ok || data?.success === false || data?.status === 'error') {
    throw new Error(`LarVoice HTTP ${res.status}: ${(data?.message || data?.error || raw).slice(0, 500)}`);
  }
  return data;
}

function normalizeGender(gender) {
  if (gender === 1 || gender === '1') return 'male';
  if (gender === 0 || gender === '0') return 'female';
  const value = String(gender || '').toLowerCase();
  if (value === 'male' || value === 'female') return value;
  return '';
}

function normalizeLanguage(raw) {
  const value = String(raw?.language || raw?.language_code || raw?.country || '').toLowerCase();
  if (value.startsWith('en') || value === 'us' || value === 'gb') return 'en';
  if (value.startsWith('vi') || value === 'vn') return 'vi';
  const name = String(raw?.language_name || '').toLowerCase();
  if (name.includes('anh') || name.includes('english')) return 'en';
  if (name.includes('việt') || name.includes('viet')) return 'vi';
  return value || 'vi';
}

function normalizeVoice(raw) {
  const id = Number(raw?.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    name: String(raw?.name || `Voice ${id}`).trim(),
    language: normalizeLanguage(raw),
    gender: normalizeGender(raw?.gender),
    region: String(raw?.region || '').trim(),
    topics: String(raw?.topics || '').trim(),
    audio: String(raw?.audio || '').trim(),
  };
}

function voiceLanguage(voiceId) {
  const id = Number(voiceId);
  const voice = voiceCache.voices.find(v => v.id === id) || FALLBACK_VOICES.find(v => v.id === id);
  return voice?.language === 'en' ? 'en' : 'vi';
}

export async function listLarVoiceVoices({ force = false } = {}) {
  if (!force && voiceCache.voices.length && Date.now() - voiceCache.at < VOICE_CACHE_MS) {
    return voiceCache.voices;
  }

  try {
    const voices = [];
    let page = 1;
    let lastPage = 1;
    do {
      const data = await larvoiceJson(`/voice?page=${page}&per_page=20`);
      const payload = data?.data || {};
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      voices.push(...rows.map(normalizeVoice).filter(Boolean));
      lastPage = Math.max(1, Number(payload?.last_page) || page);
      page += 1;
    } while (page <= lastPage);

    const filtered = voices.filter(v => v.language === 'vi' || v.language === 'en');
    if (!filtered.length) throw new Error('LarVoice không trả về voice tiếng Việt/tiếng Anh');
    voiceCache = { at: Date.now(), voices: filtered };
    return filtered;
  } catch (error) {
    if (voiceCache.voices.length) return voiceCache.voices;
    return FALLBACK_VOICES;
  }
}

function ttsPayload({ text, voiceId, language, speed }) {
  return {
    text: String(text || '').trim(),
    ref_voice_id: Number(voiceId),
    language,
    audio_format: 'mp3',
    quality: 'mini',
    split_by_newline: false,
    speed: clampSpeed(speed),
    run_speed: 1.0,
    pitch: 1.0,
    volume: 1.0,
    strength: 2.2,
    bass: 0,
    treble: 0,
    compress: 0,
    first_trim_ms: 0,
    last_trim_ms: 0,
  };
}

function normalizeTaskInfo(response) {
  const data = response?.data || response || {};
  return {
    uuid: data.uuid || data.task_id || response?.task_id,
    streamStatusUrl: data.stream_status_url || data.status_url || data.streamStatusUrl,
    downloadUrl: data.download_url || data.downloadUrl || data.url || data.audio_url,
    totalChunks: Number(data.total_chunks_expected || data.totalChunks || 1) || 1,
  };
}

function statusChunksDone(status) {
  if (Array.isArray(status?.chunks)) {
    return status.chunks.length > 0 && status.chunks.every(chunk => String(chunk?.status || '').toLowerCase() === 'done');
  }
  if (status?.chunks && typeof status.chunks === 'object') {
    const values = Object.values(status.chunks);
    return values.length > 0 && values.every(value => value === 1 || value === true || String(value).toLowerCase() === 'done');
  }
  return false;
}

async function waitLarVoiceTask(task, onLog) {
  if (!task.streamStatusUrl) return;

  const started = Date.now();
  while (Date.now() - started < MAX_POLL_MS) {
    await sleep(POLL_INTERVAL_MS);
    const status = await larvoiceJson(task.streamStatusUrl);
    const state = String(status?.status || status?.global_status || '').toLowerCase();
    onLog?.(`TTS: LarVoice state=${state || 'processing'}`);

    if (state === 'done' || state === 'completed' || state === 'success' || statusChunksDone(status)) {
      return;
    }
    if (state === 'failed' || state === 'error') {
      throw new Error(`LarVoice TTS thất bại: ${JSON.stringify(status).slice(0, 500)}`);
    }
  }
  throw new Error('LarVoice TTS quá thời gian chờ');
}

async function downloadAudio(url, outputPath) {
  const res = await fetch(url, { headers: larvoiceHeaders() });
  if (!res.ok) throw new Error(`LarVoice download HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
}

async function synthesizeLarVoice({ text, outputPath, voiceId, language, speed, onLog }) {
  const body = ttsPayload({ text, voiceId, language, speed });
  if (!body.text) throw new Error('Thiếu nội dung TTS');
  if (!Number.isFinite(body.ref_voice_id)) throw new Error('Thiếu LarVoice Voice ID');

  onLog?.(`TTS: Gửi yêu cầu LarVoice (voice=${body.ref_voice_id}, speed=${body.speed})...`);
  const createResponse = await larvoiceJson('/tts_stream', { method: 'POST', body });
  const task = normalizeTaskInfo(createResponse);
  if (!task.downloadUrl) {
    throw new Error(`LarVoice không trả về download_url: ${JSON.stringify(createResponse).slice(0, 500)}`);
  }
  onLog?.(`TTS: LarVoice task=${task.uuid || 'stream'} — chờ render...`);
  await waitLarVoiceTask(task, onLog);
  onLog?.('TTS: Tải audio từ LarVoice...');
  await downloadAudio(task.downloadUrl, outputPath);
}

async function synthesizeLarVoiceWithRetries(options, { retries = 4, retryDelayMs = SAMPLE_RETRY_DELAY_MS, onRetry } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await synthesizeLarVoice(options);
    } catch (error) {
      lastError = error;
      const retryable = /429|rate|Server Error|timeout|quá thời gian/i.test(error.message);
      if (!retryable || attempt === retries) break;
      onRetry?.(attempt, retries, error);
      await sleep(retryDelayMs);
    }
  }
  throw lastError;
}

function probeAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file]);
    let out = '';
    let err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('close', c => c === 0 ? resolve(parseFloat(out)) : reject(new Error(`ffprobe failed: ${err.slice(-300)}`)));
  });
}

function sampleTextFor(language) {
  if (language === 'en') {
    return 'Hello, this is a short English voice sample for previewing before choosing this LarVoice speaker.';
  }
  return 'Xin chào, đây là đoạn giọng mẫu tiếng Việt để bạn nghe thử trước khi chọn giọng LarVoice này.';
}

function speedKey(speed) {
  return clampSpeed(speed).toFixed(2).replace('.', 'p');
}

function sampleFilename(voiceId) {
  return `larvoice-${Number(voiceId)}-${speedKey(SAMPLE_SPEED)}.mp3`;
}

function sampleOutputPath(voiceId) {
  return path.join(SAMPLE_DIR, sampleFilename(voiceId));
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function readFailedSamples() {
  const failed = readJsonFile(SAMPLE_FAILED_FILE, []);
  return Array.isArray(failed) ? failed : [];
}

function sampleExists(outputPath) {
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
    return true;
  }
  return false;
}

export function getLarVoiceSampleStatus(voiceId) {
  const id = Number(voiceId) || DEFAULT_LARVOICE_VOICE_ID;
  const filename = sampleFilename(id);
  const outputPath = sampleOutputPath(id);
  if (sampleExists(outputPath)) {
    return { status: 'ready', url: `/voice-samples/${filename}` };
  }

  const failed = readFailedSamples().find(item => Number(item.id) === id);
  if (failed) {
    return { status: 'failed', error: failed.error || 'Không tạo được mp3 mẫu' };
  }

  return { status: 'missing', error: 'Chưa có file mp3 mẫu. Chạy npm run voice:samples để tạo trước.' };
}

async function runConcurrent(items, limit, fn) {
  const results = [];
  const executing = new Set();
  for (const item of items) {
    const promise = Promise.resolve().then(() => fn(item));
    results.push(promise);
    const tracked = promise.finally(() => executing.delete(tracked));
    executing.add(tracked);
    if (executing.size >= limit) await Promise.race(executing);
  }
  return Promise.all(results);
}

export async function generateLarVoiceSampleLibrary({
  force = false,
  concurrency = 1,
  retryDelayMs = SAMPLE_RETRY_DELAY_MS,
  onLog = console.log,
} = {}) {
  const voices = await listLarVoiceVoices({ force: true });
  const startedAt = new Date().toISOString();
  const failedById = new Map(readFailedSamples().map(item => [Number(item.id), item]));
  const ready = [];
  const failed = [];
  let done = 0;
  let skipped = 0;

  fs.mkdirSync(SAMPLE_DIR, { recursive: true });
  onLog(`LarVoice samples: ${voices.length} voice, speed=${SAMPLE_SPEED}, concurrency=${concurrency}`);

  await runConcurrent(voices, Math.max(1, Math.min(8, Number(concurrency) || 4)), async (voice) => {
    const id = Number(voice.id);
    const outputPath = sampleOutputPath(id);
    const filename = sampleFilename(id);

    if (!force && sampleExists(outputPath)) {
      skipped += 1;
      failedById.delete(id);
      ready.push({ id, name: voice.name, language: voice.language, file: filename, skipped: true });
      onLog(`[skip] ${id} ${voice.name}`);
      return;
    }

    try {
      onLog(`[tts] ${id} ${voice.name} (${voice.language})`);
      await synthesizeLarVoiceWithRetries(
        {
          text: sampleTextFor(voice.language),
          outputPath,
          voiceId: id,
          language: voice.language === 'en' ? 'en' : 'vi',
          speed: SAMPLE_SPEED,
        },
        {
          retryDelayMs,
          onRetry: (attempt, retries, error) => {
            onLog(`[retry] ${id} ${voice.name}: ${error.message} (${attempt}/${retries})`);
          },
        }
      );
      const duration = await probeAudioDuration(outputPath).catch(() => null);
      failedById.delete(id);
      ready.push({
        id,
        name: voice.name,
        language: voice.language,
        file: filename,
        duration,
        generatedAt: new Date().toISOString(),
      });
      done += 1;
      onLog(`[ok] ${id} ${voice.name}${duration ? ` ${duration.toFixed(2)}s` : ''}`);
    } catch (error) {
      const item = {
        id,
        name: voice.name,
        language: voice.language,
        gender: voice.gender,
        region: voice.region,
        topics: voice.topics,
        error: error.message,
        failedAt: new Date().toISOString(),
      };
      failedById.set(id, item);
      failed.push(item);
      onLog(`[fail] ${id} ${voice.name}: ${error.message}`);
    } finally {
      const allFailed = [...failedById.values()].sort((a, b) => Number(a.id) - Number(b.id));
      writeJsonFile(SAMPLE_FAILED_FILE, allFailed);
      writeJsonFile(SAMPLE_MANIFEST_FILE, {
        startedAt,
        updatedAt: new Date().toISOString(),
        sampleSpeed: SAMPLE_SPEED,
        sampleDir: SAMPLE_DIR,
        totalVoices: voices.length,
        generatedThisRun: done,
        skippedThisRun: skipped,
        failedThisRun: failed.length,
        readyCount: fs.readdirSync(SAMPLE_DIR).filter(file => /^larvoice-\d+-1p00\.mp3$/.test(file)).length,
        failedCount: allFailed.length,
        ready: ready.sort((a, b) => Number(a.id) - Number(b.id)),
      });
    }
  });

  const allFailed = [...failedById.values()].sort((a, b) => Number(a.id) - Number(b.id));
  return {
    total: voices.length,
    generated: done,
    skipped,
    failed: allFailed.length,
    sampleDir: SAMPLE_DIR,
    manifestFile: SAMPLE_MANIFEST_FILE,
    failedFile: SAMPLE_FAILED_FILE,
  };
}

/**
 * @param {string} text
 * @param {string} outputPath - đường dẫn file .mp3 đầu ra
 * @param {(msg:string)=>void} [onLog]
 * @param {{ larvoiceVoiceId?: number|string, ttsSpeed?: number|string }} [keys]
 */
export async function generateTTS(text, outputPath, onLog, keys = {}) {
  await listLarVoiceVoices();
  const voiceId = Number(keys.larvoiceVoiceId) || DEFAULT_LARVOICE_VOICE_ID;
  const language = voiceLanguage(voiceId);
  const ttsSpeed = clampSpeed(keys.ttsSpeed);
  const preview = String(text || '').slice(0, 60) + (String(text || '').length > 60 ? '...' : '');
  const t0 = Date.now();
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (attempt > 1) onLog?.(`TTS: Thử lại lần ${attempt}/${maxRetries}...`);
    try {
      onLog?.(`TTS: "${preview}"`);
      await synthesizeLarVoice({
        text,
        outputPath,
        voiceId,
        language,
        speed: ttsSpeed,
        onLog,
      });
      const duration = await probeAudioDuration(outputPath);
      const kb = (fs.statSync(outputPath).size / 1024).toFixed(0);
      onLog?.(`✓ TTS xong (LarVoice): ${duration.toFixed(1)}s audio (${kb} KB) | ${fmtMs(Date.now() - t0)}`);
      return { duration };
    } catch (err) {
      onLog?.(`TTS: Lỗi lần ${attempt}: ${err.message}`);
      if (attempt === maxRetries) throw err;
      const delayMs = ttsRetryDelayMs(err, attempt);
      onLog?.(`TTS: chờ ${fmtMs(delayMs)} rồi thử lại...`);
      await sleep(delayMs);
    }
  }
}
