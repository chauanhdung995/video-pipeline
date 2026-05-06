import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
export const SFX_DIR = path.join(PROJECT_ROOT, 'assets', 'sfx');

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
let cachedCatalog = null;

const CATEGORY_HINTS = {
  transition: 'whoosh, swoosh, pop, scene change, card entrance, fast reveal',
  emphasis: 'ding, chime, tick, number reveal, keyword reveal, checklist beat',
  alert: 'notification, warning, breaking update, important callout',
  outro: 'ending, success, final CTA, payoff',
};

export function listSfxCatalog({ refresh = false } = {}) {
  if (cachedCatalog && !refresh) return cachedCatalog;
  if (!fs.existsSync(SFX_DIR)) {
    cachedCatalog = [];
    return cachedCatalog;
  }

  const files = [];
  walkAudioFiles(SFX_DIR, files);
  cachedCatalog = files
    .map(filePath => toCatalogItem(filePath))
    .filter(Boolean)
    .sort((a, b) => a.file.localeCompare(b.file));
  return cachedCatalog;
}

export function buildSfxCatalogForPrompt() {
  return listSfxCatalog().map(item => ({
    file: item.file,
    category: item.category,
    name: item.name,
    durationSec: item.durationSec,
    useFor: item.useFor,
  }));
}

export function isAllowedSfxFile(value) {
  const file = normalizeSfxFile(value);
  if (!file) return false;
  return listSfxCatalog().some(item => item.file === file);
}

export function normalizeSfxFile(value) {
  const raw = String(value || '').trim()
    .replace(/^\/?assets\/sfx\//i, '')
    .replace(/^sfx\//i, '')
    .replace(/\\/g, '/');
  if (!raw || raw.includes('..') || path.isAbsolute(raw)) return '';
  const ext = path.extname(raw).toLowerCase();
  if (!AUDIO_EXTS.has(ext)) return '';
  return raw;
}

export function getSfxDurationSec(value, fallback = 0.5) {
  const file = normalizeSfxFile(value);
  const found = listSfxCatalog().find(item => item.file === file);
  return Number.isFinite(found?.durationSec) && found.durationSec > 0 ? found.durationSec : fallback;
}

export function normalizeSfxPlan(plan = []) {
  const list = Array.isArray(plan) ? plan : [];
  const allowed = new Set(listSfxCatalog().map(item => item.file));
  return list.map((cue, index) => {
    const file = normalizeSfxFile(cue?.file || cue?.src || cue?.sound);
    if (!file || !allowed.has(file)) return null;
    const startSecRaw = Number(cue?.startSec ?? cue?.at ?? cue?.time);
    const volumeRaw = Number(cue?.volume);
    return {
      id: String(cue?.id || cue?.key || `sfx-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40) || `sfx-${index + 1}`,
      file,
      startSec: Number.isFinite(startSecRaw) ? Math.max(0, startSecRaw) : null,
      timingPhrase: String(cue?.timingPhrase || cue?.phrase || '').trim(),
      reason: String(cue?.reason || '').trim(),
      volume: Number.isFinite(volumeRaw) ? Math.max(0, Math.min(0.85, volumeRaw)) : 0.28,
    };
  }).filter(Boolean).slice(0, 5);
}

function walkAudioFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAudioFiles(fullPath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) continue;
    out.push(fullPath);
  }
}

function toCatalogItem(filePath) {
  const rel = path.relative(SFX_DIR, filePath).split(path.sep).join('/');
  if (!rel || rel.includes('..')) return null;
  const category = rel.split('/')[0] || 'general';
  const name = path.basename(rel, path.extname(rel)).replace(/[-_]+/g, ' ');
  const stat = fs.statSync(filePath);
  return {
    file: rel,
    category,
    name,
    durationSec: probeDurationSec(filePath),
    sizeBytes: stat.size,
    useFor: CATEGORY_HINTS[category] || 'short UI or motion accent',
  };
}

function probeDurationSec(filePath) {
  const result = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], {
    encoding: 'utf8',
    timeout: 1500,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const duration = Number.parseFloat(result.stdout);
  return Number.isFinite(duration) && duration > 0 ? Number(duration.toFixed(3)) : null;
}
