import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

loadEnvFile(path.join(PROJECT_ROOT, '.env'));

export const TROLLLLM_API_KEY = env('TROLLLLM_API_KEY');
export const TROLLLLM_BASE_URL = env('TROLLLLM_BASE_URL', 'https://chat.trollllm.xyz/v1/chat/completions');
export const TROLLLLM_MODEL = env('TROLLLLM_MODEL', 'claude-opus-4-6');
export const TROLLLLM_MAX_COMPLETION_TOKENS = Number(env('TROLLLLM_MAX_COMPLETION_TOKENS', '65536'));

// Compatibility aliases for existing UI/status code that still imports OPENAI_*.
export const OPENAI_API_KEY = TROLLLLM_API_KEY;
export const OPENAI_MODEL = TROLLLLM_MODEL;

export const LARVOICE_API_KEY = env('LARVOICE_API_KEY');
export const SERPER_SCRAPE_API_KEY = env('SERPER_SCRAPE_API_KEY');

function env(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === null || value === '' ? fallback : value;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquoteEnvValue(value.trim());
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
