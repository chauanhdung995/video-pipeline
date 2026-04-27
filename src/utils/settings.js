// src/utils/settings.js
import fs from 'fs';
import path from 'path';
import { ROOT_DIR, SETTINGS_FILE, ensureDataDirs } from './paths.js';

ensureDataDirs();

const DEFAULTS = {
  logoPath: path.join(ROOT_DIR, 'Logo Ema Done.png'),
};

export function getSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function updateSettings(patch) {
  const current = getSettings();
  const next = { ...current, ...patch };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
