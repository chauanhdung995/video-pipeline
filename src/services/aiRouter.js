// src/services/aiRouter.js
import fetch from 'node-fetch';

const AI_CONCURRENCY_LIMIT = 10;
let aiInFlight = 0;
const aiWaitQueue = [];

const fmt = ms => ms < 60000 ? `${(ms/1000).toFixed(1)}s` : `${Math.floor(ms/60000)}m${Math.round((ms%60000)/1000)}s`;

const _providerSessionState = new Map(); // provider -> Map(sessionId -> { entries, order, cursor })

/**
 * @param {{ prompt: string, isJson?: boolean, keys: object, onLog?: (msg:string)=>void }} opts
 */
export async function callAI({ prompt, isJson = true, keys, onLog }) {
  const provider = keys.aiProvider || 'chato1';
  const log = (msg) => { console.log(`[AI] ${msg}`); onLog?.(msg); };

  const releaseConcurrency = await acquireAIConcurrency();
  try {
    // ── Gemini ──────────────────────────────────────────────────────────────
    if (provider === 'gemini') {
      const keyList = keys.geminiKeys;
      if (!keyList?.length) throw new Error('Không có Gemini API keys');
      log(`Prompt ${prompt.length.toLocaleString()} ký tự → Gemini 2.5 Flash (${keyList.length} keys)`);
      const t0 = Date.now();
      const result = await callGeminiWithRotation(keyList, prompt, isJson, log);
      const elapsed = Date.now() - t0;
      const size = typeof result === 'string' ? result.length : JSON.stringify(result).length;
      log(`✓ Gemini phản hồi ${size.toLocaleString()} ký tự | ${fmt(elapsed)}`);
      return { result, provider: 'gemini' };
    }

    if (provider === 'openai') {
      const keyList = keys.openaiKeys;
      if (!keyList?.length) throw new Error('Không có OpenAI API keys');
      log(`Prompt ${prompt.length.toLocaleString()} ký tự → OpenAI gpt-5.3-codex (${keyList.length} keys)`);
      return callSessionProvider({
        provider: 'openai',
        label: 'OpenAI',
        keyList,
        prompt,
        isJson,
        sessionId: keys.sessionId ? String(keys.sessionId) : '',
        log,
        callWithKey: (apiKey) => callOpenAI(apiKey, prompt, isJson, (chars) => {
          onLog?.(`AI đang stream... (${chars.toLocaleString()} ký tự)`);
        }),
      });
    }

    // ── Chato1 (default) ────────────────────────────────────────────────────
    const keyList = keys.chato1;
    if (!keyList?.length) throw new Error('Không có Chato1 API keys');
    log(`Prompt ${prompt.length.toLocaleString()} ký tự → model gpt-5-3 (${keyList.length} keys)`);
    return callSessionProvider({
      provider: 'chato1',
      label: 'Chato1',
      keyList,
      prompt,
      isJson,
      sessionId: keys.sessionId ? String(keys.sessionId) : '',
      log,
      callWithKey: (apiKey) => callChato1(apiKey, prompt, isJson, (chars) => {
        onLog?.(`AI đang stream... (${chars.toLocaleString()} ký tự)`);
      }),
    });
  } finally {
    releaseConcurrency();
  }
}

function callSessionProviderWithoutSession({ label, provider, keyList, log, callWithKey }) {
  return (async () => {
    let lastErr;
    for (const [idx, key] of keyList.entries()) {
      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          if (attempt > 0) log(`Thử lại lần ${attempt} (key #${idx + 1})...`);
          else log(`Gọi AI với key #${idx + 1}/${keyList.length}...`);

          const t0 = Date.now();
          const result = await callWithKey(key);
          const elapsed = Date.now() - t0;
          const size = typeof result === 'string' ? result.length : JSON.stringify(result).length;
          log(`✓ AI phản hồi ${size.toLocaleString()} ký tự | ${fmt(elapsed)}`);
          return { result, provider };
        } catch (e) {
          lastErr = e;
          const msg = e.message.toLowerCase();
          if (msg.includes('403') || msg.includes('401') || msg.includes('credits') || msg.includes('quota')) {
            log(`⚠ Key #${idx + 1} hết hạn/quota — chuyển key tiếp theo`);
            break;
          }
          log(`⚠ Key #${idx + 1} lỗi lần ${attempt + 1}: ${e.message.slice(0, 120)}`);
          if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        }
      }
    }
    throw new Error(`Tất cả ${label} key đều lỗi. Lỗi cuối: ${lastErr?.message}`);
  })();
}

function callSessionProvider({ provider, label, keyList, prompt, sessionId, log, callWithKey }) {
  if (!sessionId) {
    return callSessionProviderWithoutSession({ label, provider, keyList, log, callWithKey });
  }

  return (async () => {
    const maxAttempts = 3;
    let lastErr;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const choice = acquireProviderKey(provider, sessionId, keyList);
      if (!choice) {
        throw new Error(buildProviderSessionError(provider, sessionId, keyList, label, lastErr));
      }

      const { key, index, release } = choice;
      try {
        log(`Gọi AI với key #${index + 1}/${keyList.length} (lần ${attempt}/${maxAttempts}, session ${sessionId})...`);
        const t0 = Date.now();
        const result = await callWithKey(key);
        const elapsed = Date.now() - t0;
        const size = typeof result === 'string' ? result.length : JSON.stringify(result).length;
        log(`✓ AI phản hồi ${size.toLocaleString()} ký tự | ${fmt(elapsed)}`);
        return { result, provider };
      } catch (e) {
        lastErr = e;
        disableProviderKey(provider, sessionId, key, e.message);
        log(`⚠ Key #${index + 1} lỗi và bị loại khỏi session ${sessionId}: ${e.message.slice(0, 160)}`);
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 1200));
        }
      } finally {
        release();
      }
    }

    throw new Error(buildProviderSessionError(provider, sessionId, keyList, label, lastErr));
  })();
}

function getProviderSessions(provider) {
  if (!_providerSessionState.has(provider)) _providerSessionState.set(provider, new Map());
  return _providerSessionState.get(provider);
}

function getProviderSession(provider, sessionId, keyList) {
  const sessions = getProviderSessions(provider);
  let pool = sessions.get(sessionId);
  if (!pool) {
    pool = { entries: new Map(), order: [], cursor: 0 };
    sessions.set(sessionId, pool);
  }

  pool.order = keyList.slice();
  for (const key of keyList) {
    if (!pool.entries.has(key)) {
      pool.entries.set(key, { disabled: false, inFlight: 0, lastError: '' });
    }
  }

  for (const existingKey of Array.from(pool.entries.keys())) {
    if (!keyList.includes(existingKey)) pool.entries.delete(existingKey);
  }

  if (pool.cursor >= pool.order.length) pool.cursor = 0;
  return pool;
}

function acquireProviderKey(provider, sessionId, keyList) {
  const pool = getProviderSession(provider, sessionId, keyList);
  if (!pool.order.length) return null;

  let chosenKey = null;
  let chosenIndex = -1;
  let lowestInFlight = Infinity;

  for (let offset = 0; offset < pool.order.length; offset++) {
    const idx = (pool.cursor + offset) % pool.order.length;
    const key = pool.order[idx];
    const entry = pool.entries.get(key);
    if (!entry || entry.disabled) continue;
    if (entry.inFlight < lowestInFlight) {
      lowestInFlight = entry.inFlight;
      chosenKey = key;
      chosenIndex = idx;
      if (lowestInFlight === 0) break;
    }
  }

  if (!chosenKey) return null;

  const entry = pool.entries.get(chosenKey);
  entry.inFlight += 1;
  pool.cursor = (chosenIndex + 1) % pool.order.length;

  return {
    key: chosenKey,
    index: chosenIndex,
    release: () => {
      const currentPool = getProviderSessions(provider).get(sessionId);
      const currentEntry = currentPool?.entries.get(chosenKey);
      if (currentEntry) currentEntry.inFlight = Math.max(0, currentEntry.inFlight - 1);
    },
  };
}

function disableProviderKey(provider, sessionId, key, errorMessage) {
  const pool = getProviderSessions(provider).get(sessionId);
  const entry = pool?.entries.get(key);
  if (!entry) return;
  entry.disabled = true;
  entry.lastError = errorMessage;
}

function buildProviderSessionError(provider, sessionId, keyList, label, lastErr) {
  const pool = getProviderSessions(provider).get(sessionId);
  const failedKeys = keyList.filter(key => pool?.entries.get(key)?.disabled).length;
  const suffix = lastErr?.message ? ` Lỗi cuối: ${lastErr.message}` : '';
  return `Session ${sessionId}: không còn ${label} key khả dụng (${failedKeys}/${keyList.length} key đã bị loại).${suffix}`;
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

// ─── Gemini rotation ─────────────────────────────────────────────────────────

// Per-key rate-limit state (lives for the lifetime of the Node process).
// Gemini free tier: 10 RPM per key → cool down 65s after a 429.
const _geminiState = new Map(); // key → { cooldownUntil: number }

function geminiState(key) {
  if (!_geminiState.has(key)) _geminiState.set(key, { cooldownUntil: 0 });
  return _geminiState.get(key);
}

async function callGeminiWithRotation(keyList, prompt, isJson, onLog) {
  const COOLDOWN_MS = 65_000; // slightly over 1 minute
  let lastErr;
  // max passes = keys × 3 to avoid infinite loops while still allowing retries
  const maxPasses = keyList.length * 3;

  for (let pass = 0; pass < maxPasses; pass++) {
    const now = Date.now();

    // Find first key not in cooldown; track soonest cooldown expiry for wait
    let chosen = null;
    let soonestExpiry = Infinity;

    for (const key of keyList) {
      const st = geminiState(key);
      if (st.cooldownUntil === Infinity) continue; // permanently invalid
      if (now >= st.cooldownUntil) { chosen = key; break; }
      soonestExpiry = Math.min(soonestExpiry, st.cooldownUntil);
    }

    if (!chosen) {
      if (soonestExpiry === Infinity) throw new Error('Tất cả Gemini key đều không hợp lệ');
      const waitMs = soonestExpiry - Date.now() + 500;
      onLog(`⏳ Tất cả ${keyList.length} Gemini key đang bị rate limit — chờ ${Math.ceil(waitMs / 1000)}s...`);
      await new Promise(r => setTimeout(r, Math.max(0, waitMs)));
      continue; // re-evaluate after waiting
    }

    const idx = keyList.indexOf(chosen) + 1;
    onLog(`Gọi Gemini key #${idx}/${keyList.length}...`);

    try {
      return await callGemini(chosen, prompt, isJson, onLog);
    } catch (e) {
      lastErr = e;
      const msg = e.message.toLowerCase();

      // Rate limit (429 / RESOURCE_EXHAUSTED / quota)
      if (msg.includes('429') || msg.includes('resource_exhausted') ||
          msg.includes('quota') || msg.includes('rate_limit') || msg.includes('rate limit')) {
        geminiState(chosen).cooldownUntil = Date.now() + COOLDOWN_MS;
        onLog(`⚠ Key #${idx} rate limit — nghỉ ${COOLDOWN_MS / 1000}s, thử key tiếp theo`);
        continue;
      }

      // Invalid / expired key — skip permanently
      if (msg.includes('401') || msg.includes('403') || msg.includes('api_key') ||
          msg.includes('invalid_argument') || msg.includes('permission_denied')) {
        geminiState(chosen).cooldownUntil = Infinity;
        onLog(`⚠ Key #${idx} không hợp lệ — bỏ qua vĩnh viễn`);
        continue;
      }

      // Transient error — brief pause then retry (counts against maxPasses)
      onLog(`⚠ Key #${idx} lỗi tạm thời: ${e.message.slice(0, 100)} — thử lại sau 3s`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  throw new Error(`Tất cả ${keyList.length} Gemini key đều thất bại. Lỗi cuối: ${lastErr?.message}`);
}

// ─── Gemini single call ───────────────────────────────────────────────────────

async function callGemini(apiKey, prompt, isJson, onLog) {
  const model = 'gemini-2.5-flash';
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  onLog?.(`Gửi yêu cầu đến Gemini 2.5 Flash...`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      ...(isJson ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    }),
    signal: AbortSignal.timeout(300000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  let text = '';
  let lastChunkLog = 0;
  const decoder = new TextDecoder();

  for await (const chunk of res.body) {
    const lines = decoder.decode(chunk, { stream: true }).split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (delta) {
          text += delta;
          if (text.length - lastChunkLog >= 800) {
            lastChunkLog = text.length;
            onLog?.(`Gemini đang stream... (${text.length.toLocaleString()} ký tự)`);
          }
        }
      } catch { /* skip malformed SSE line */ }
    }
  }

  if (text.trim().length < 10) throw new Error('Gemini trả về nội dung rỗng');

  if (isJson) {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  }
  const cleaned = text.replace(/```html\n?/g, '').replace(/```srt\n?/g, '').replace(/```\n?/g, '').trim();
  if (cleaned.toLowerCase().includes('<!doctype') && !cleaned.toLowerCase().endsWith('</html>')) {
    throw new Error(`HTML bị cắt dở (${cleaned.length} ký tự, thiếu </html>) — thử lại`);
  }
  return cleaned;
}

// ─── Chato1 ───────────────────────────────────────────────────────────────────

async function callChato1(apiKey, prompt, isJson, onChunk) {
  const res = await fetch('https://chat01.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-5-3',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      ...(isJson ? { response_format: { type: 'json_object' } } : { temperature: 0.7 }),
    }),
    signal: AbortSignal.timeout(300000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText.replace(new RegExp(apiKey, 'g'), '***').slice(0, 200)}`);
  }

  let text = '';
  let lastChunkLog = 0;
  const decoder = new TextDecoder();

  for await (const chunk of res.body) {
    const lines = decoder.decode(chunk, { stream: true }).split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          if (text.length - lastChunkLog >= 800) {
            lastChunkLog = text.length;
            onChunk?.(text.length);
          }
        }
      } catch { /* skip malformed SSE line */ }
    }
  }

  const lower = text.toLowerCase();
  if (lower.includes('**error**') || lower.includes('please try again') ||
      lower.includes('an error occurred') || text.trim().length < 10) {
    throw new Error(`Soft error từ AI: ${text.slice(0, 150)}`);
  }

  if (isJson) {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  }
  const cleaned = text.replace(/```html\n?/g, '').replace(/```srt\n?/g, '').replace(/```\n?/g, '').trim();
  if (cleaned.toLowerCase().includes('<!doctype') && !cleaned.toLowerCase().endsWith('</html>')) {
    throw new Error(`HTML bị cắt dở (${cleaned.length} ký tự, thiếu </html>) — thử lại`);
  }
  return cleaned;
}

async function callOpenAI(apiKey, prompt, isJson, onChunk) {
  const finalPrompt = isJson
    ? `${prompt}\n\nCHỈ TRẢ VỀ JSON HỢP LỆ DUY NHẤT. KHÔNG DÙNG MARKDOWN, KHÔNG DÙNG BACKTICK.`
    : prompt;
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5.3-codex',
      input: finalPrompt,
      text: { format: { type: 'text' }, verbosity: 'medium' },
    }),
    signal: AbortSignal.timeout(300000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText.replace(new RegExp(apiKey, 'g'), '***').slice(0, 200)}`);
  }

  const data = await res.json();
  const text = extractOpenAIText(data).trim();
  onChunk?.(text.length);

  const lower = text.toLowerCase();
  if (data.error || lower.includes('an error occurred') || text.length < 2) {
    throw new Error(`Soft error từ OpenAI: ${(data.error?.message || text).slice(0, 150)}`);
  }

  if (isJson) {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  }

  const cleaned = text.replace(/```html\n?/g, '').replace(/```srt\n?/g, '').replace(/```\n?/g, '').trim();
  if (cleaned.toLowerCase().includes('<!doctype') && !cleaned.toLowerCase().endsWith('</html>')) {
    throw new Error(`HTML bị cắt dở (${cleaned.length} ký tự, thiếu </html>) — thử lại`);
  }
  return cleaned;
}

function extractOpenAIText(data) {
  const output = Array.isArray(data?.output) ? data.output : [];
  let text = '';

  for (const item of output) {
    if (item?.type !== 'message') continue;
    for (const part of item.content || []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') {
        text += part.text;
      }
    }
  }

  if (!text && typeof data?.output_text === 'string') text = data.output_text;
  return text;
}
