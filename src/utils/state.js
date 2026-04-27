// src/utils/state.js
import fs from 'fs';
import path from 'path';
import { SESS_DIR, ensureDataDirs } from './paths.js';

ensureDataDirs();

function stateFile(id) { return path.join(SESS_DIR, id, 'state.json'); }
function logFile(id) { return path.join(SESS_DIR, id, 'events.log'); }

export function saveState(id, state) {
  const f = stateFile(id);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(state, null, 2));
}

export function loadState(id) {
  const f = stateFile(id);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

export function logEvent(id, event) {
  const f = logFile(id);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n');
}

// ─── Render trigger (pipeline pause/resume after preview) ───────────────────
const _renderTriggers = new Map();

export function waitForRenderTrigger(sessionId) {
  // If already triggered (e.g. server restart + resume), skip wait
  const state = loadState(sessionId);
  if (state?.renderTriggered) return Promise.resolve();
  return new Promise(resolve => _renderTriggers.set(sessionId, resolve));
}

export function triggerRender(sessionId) {
  const resolve = _renderTriggers.get(sessionId);
  if (resolve) { _renderTriggers.delete(sessionId); resolve(); return true; }
  return false;
}
