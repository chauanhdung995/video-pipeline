// src/services/aiRouter.js
import fetch from 'node-fetch';
import {
  TROLLLLM_API_KEY,
  TROLLLLM_BASE_URL,
  TROLLLLM_MODEL,
  TROLLLLM_MAX_COMPLETION_TOKENS,
} from '../config/apiKeys.js';

const AI_CONCURRENCY_LIMIT = 10;
const MAX_TOKEN_RETRY_STEPS = [
  TROLLLLM_MAX_COMPLETION_TOKENS,
  32768,
  16384,
  8192,
  4096,
  2048,
].filter((value, index, arr) => Number.isFinite(Number(value)) && Number(value) > 0 && arr.indexOf(value) === index);
const TROLLLLM_MAX_REQUEST_RETRIES = 3;
let aiInFlight = 0;
const aiWaitQueue = [];

const fmt = ms => ms < 60000
  ? `${(ms / 1000).toFixed(1)}s`
  : `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;

/**
 * @param {{ prompt: string, isJson?: boolean, keys?: object, onLog?: (msg:string)=>void }} opts
 */
export async function callAI({ prompt, isJson = true, onLog }) {
  const log = (msg) => { console.log(`[AI] ${msg}`); onLog?.(msg); };
  const releaseConcurrency = await acquireAIConcurrency();

  try {
    log(`Prompt ${prompt.length.toLocaleString()} ký tự → TrollLLM ${TROLLLLM_MODEL}`);
    const t0 = Date.now();
    const result = await callTrollLLM(prompt, isJson, (chars) => {
      onLog?.(`AI đang xử lý... (${chars.toLocaleString()} ký tự)`);
    });
    const elapsed = Date.now() - t0;
    const size = typeof result === 'string' ? result.length : JSON.stringify(result).length;
    log(`✓ TrollLLM phản hồi ${size.toLocaleString()} ký tự | ${fmt(elapsed)}`);
    return { result, provider: 'trollllm' };
  } finally {
    releaseConcurrency();
  }
}

async function acquireAIConcurrency() {
  if (aiInFlight < AI_CONCURRENCY_LIMIT) {
    aiInFlight += 1;
    return releaseAIConcurrency;
  }

  await new Promise(resolve => aiWaitQueue.push(resolve));
  aiInFlight += 1;
  return releaseAIConcurrency;
}

function releaseAIConcurrency() {
  aiInFlight = Math.max(0, aiInFlight - 1);
  const next = aiWaitQueue.shift();
  if (next) next();
}

async function callTrollLLM(prompt, isJson, onChunk) {
  const finalPrompt = isJson
    ? `${prompt}\n\nCHỈ TRẢ VỀ JSON HỢP LỆ DUY NHẤT. KHÔNG DÙNG MARKDOWN, KHÔNG DÙNG BACKTICK.`
    : prompt;

  const { data, maxTokens } = await postChatCompletionWithTokenFallback(finalPrompt);
  const text = extractChatCompletionText(data).trim();
  onChunk?.(text.length);

  const lower = text.toLowerCase();
  if (data.error || lower.includes('an error occurred') || text.length < 2) {
    throw new Error(`Soft error từ TrollLLM: ${(data.error?.message || text).slice(0, 150)}`);
  }

  if (isJson) {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  }

  const cleaned = text.replace(/```html\n?/g, '').replace(/```srt\n?/g, '').replace(/```\n?/g, '').trim();
  if (cleaned.toLowerCase().includes('<!doctype') && !cleaned.toLowerCase().endsWith('</html>')) {
    throw new Error(`HTML bị cắt dở (${cleaned.length} ký tự, thiếu </html>; max_completion_tokens=${maxTokens}) — thử lại`);
  }
  return cleaned;
}

async function postChatCompletionWithTokenFallback(prompt) {
  let lastError = null;
  for (const maxTokens of MAX_TOKEN_RETRY_STEPS) {
    const result = await postChatCompletionWithRetries(prompt, maxTokens);
    if (result.ok) return { data: result.data, maxTokens };

    lastError = result.error;
    if (!shouldRetryWithLowerTokenLimit(result.status, result.safeError)) break;
  }

  throw lastError || new Error('TrollLLM request failed');
}

async function postChatCompletionWithRetries(prompt, maxTokens) {
  let last = null;
  for (let attempt = 1; attempt <= TROLLLLM_MAX_REQUEST_RETRIES; attempt += 1) {
    try {
      const res = await fetch(TROLLLLM_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TROLLLLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: TROLLLLM_MODEL,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_completion_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(600000),
      });

      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: { message: raw } };
      }

      if (res.ok) return { ok: true, data, status: res.status };

      const safeError = sanitizeProviderError(raw || JSON.stringify(data));
      const error = new Error(`TrollLLM HTTP ${res.status} (attempt=${attempt}/${TROLLLLM_MAX_REQUEST_RETRIES}, max_completion_tokens=${maxTokens}): ${safeError.slice(0, 500)}`);
      last = { ok: false, status: res.status, safeError, error };
      if (!isTransientProviderError(res.status, safeError) || attempt >= TROLLLLM_MAX_REQUEST_RETRIES) return last;
    } catch (error) {
      const safeError = sanitizeProviderError(error?.message || error);
      last = {
        ok: false,
        status: 0,
        safeError,
        error: new Error(`TrollLLM request error (attempt=${attempt}/${TROLLLLM_MAX_REQUEST_RETRIES}, max_completion_tokens=${maxTokens}): ${safeError.slice(0, 500)}`),
      };
      if (attempt >= TROLLLLM_MAX_REQUEST_RETRIES) return last;
    }

    await sleep(retryDelayMs(attempt));
  }
  return last;
}

function shouldRetryWithLowerTokenLimit(status, message) {
  if (Number(status) === 429 && /request failed|try again|rate|limit|token|context|too large|exceed/i.test(String(message || ''))) {
    return true;
  }
  if (![400, 413, 422].includes(Number(status))) return false;
  return /max[_ -]?completion[_ -]?tokens|max[_ -]?tokens|token|context|too large|limit|exceed/i.test(String(message || ''));
}

function isTransientProviderError(status, message) {
  const code = Number(status);
  if (code === 0 || code === 408 || code === 409 || code === 425 || code === 429 || code >= 500) return true;
  if (code === 403 && !String(message || '').trim()) return true;
  return /request failed|try again|temporar|timeout|rate|overload|busy|gateway|nginx/i.test(String(message || ''));
}

function retryDelayMs(attempt) {
  return Math.min(8000, 800 * (2 ** Math.max(0, attempt - 1)));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractChatCompletionText(data) {
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const content = choice?.message?.content ?? choice?.delta?.content ?? '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') return part;
      if (typeof part?.text === 'string') return part.text;
      if (typeof part?.content === 'string') return part.content;
      return '';
    }).join('');
  }
  if (typeof data?.output_text === 'string') return data.output_text;
  return '';
}

function sanitizeProviderError(value) {
  let text = String(value || '');
  for (const secret of [TROLLLLM_API_KEY]) {
    if (!secret) continue;
    text = text.replaceAll(secret, '***');
  }
  return text;
}
