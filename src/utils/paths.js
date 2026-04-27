import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.join(__dirname, '../..');
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : ROOT_DIR;

export const SESS_DIR = path.join(DATA_DIR, 'sessions');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
export const DB_PATH = path.join(DATA_DIR, 'pipeline.db');

export function ensureDataDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(SESS_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
