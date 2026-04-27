// src/utils/assetSearch.js
// Scan thư mục tài nguyên, cache metadata (ffprobe duration), tìm kiếm theo keyword.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../..');

export const BRAND_DIR = path.join(ROOT_DIR, 'brand-specificities');
export const SFX_DIR   = path.join(ROOT_DIR, 'sound-effect');
export const BGM_DIR   = path.join(ROOT_DIR, 'background-music');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.svg']);
const GIF_EXT   = new Set(['.gif']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);

function getMediaType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (IMAGE_EXT.has(ext)) return 'image';
  if (GIF_EXT.has(ext))   return 'gif';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  return null;
}

function probeDuration(filePath) {
  return new Promise(resolve => {
    const p = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    let out = '';
    p.stdout.on('data', d => out += d);
    p.on('close', () => {
      const n = parseFloat(out);
      resolve(isNaN(n) ? null : Math.round(n * 100) / 100);
    });
  });
}

/**
 * Scan thư mục, probe duration cho gif/video/audio, lưu cache.
 * Cache file: {dir}/.media-cache.json
 */
export async function loadMediaCache(dir) {
  if (!fs.existsSync(dir)) return [];

  const cacheFile = path.join(dir, '.media-cache.json');
  const allFiles  = fs.readdirSync(dir).filter(f => getMediaType(f) !== null);

  // Kiểm tra cache còn hợp lệ không (cùng danh sách file)
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      const cachedNames = new Set((cached.files || []).map(f => f.name));
      if (allFiles.every(f => cachedNames.has(f)) && cached.files.length === allFiles.length) {
        return cached.files;
      }
    } catch {}
  }

  // Rebuild cache
  console.log(`[assetSearch] Scanning ${dir} (${allFiles.length} files)...`);
  const entries = [];
  for (const filename of allFiles) {
    const type = getMediaType(filename);
    const entry = { name: filename, type };
    if (type === 'gif' || type === 'video' || type === 'audio') {
      entry.duration = await probeDuration(path.join(dir, filename));
    }
    entries.push(entry);
  }

  fs.writeFileSync(cacheFile, JSON.stringify({ files: entries }, null, 2), 'utf8');
  console.log(`[assetSearch] Cache saved: ${entries.length} entries`);
  return entries;
}

/**
 * Tìm files khớp với danh sách keywords.
 * Mỗi keyword tối đa maxPerKeyword kết quả.
 * Trả về mảng không trùng lặp.
 */
export function searchByKeywords(keywords, entries, maxPerKeyword = 5) {
  const seen  = new Set();
  const found = [];

  for (const kw of keywords) {
    // Tách keyword thành từng từ đơn, bỏ từ ngắn ≤ 2 ký tự
    const words = kw.toLowerCase()
      .split(/[\s\-_]+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length > 2);
    if (!words.length) continue;

    let count = 0;
    for (const entry of entries) {
      if (count >= maxPerKeyword) break;
      if (seen.has(entry.name)) continue;
      const entryNorm = entry.name.toLowerCase().replace(/[\s\-_.]+/g, '');
      // Match nếu BẤT KỲ từ nào trong keyword có trong tên file
      if (words.some(w => entryNorm.includes(w))) {
        seen.add(entry.name);
        found.push(entry);
        count++;
      }
    }
  }
  return found;
}

/**
 * Format entry thành chuỗi mô tả để gửi AI.
 * VD: "bitcoin chart rising.png (image)" hoặc "explosion.mp4 (video, 3.2s)"
 */
export function formatEntryForAI(entry) {
  const dur = entry.duration != null ? `, ${entry.duration}s` : '';
  return `${entry.name} (${entry.type}${dur})`;
}

/**
 * Trả về file:// URL của file trong thư mục để dùng trong HTML.
 * pathToFileURL xử lý đúng khoảng trắng và ký tự tiếng Việt.
 */
export function entryFileURL(dir, filename) {
  return pathToFileURL(path.join(dir, filename)).href;
}
