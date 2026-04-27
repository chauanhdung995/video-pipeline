// src/db/index.js — SQLite database for project/scene management
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DEFAULT_STYLE_GUIDE } from '../agents/sceneAgent.js';
import { DB_PATH, SESS_DIR, ensureDataDirs } from '../utils/paths.js';

ensureDataDirs();

let _db = null;

function db() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id           TEXT PRIMARY KEY,
      topic        TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending',
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      chato1_keys  TEXT NOT NULL DEFAULT '[]',
      output_aspect_ratio TEXT NOT NULL DEFAULT '9:16',
      final_video  TEXT
    );
    CREATE TABLE IF NOT EXISTS scenes (
      project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      stt          INTEGER NOT NULL,
      voice        TEXT,
      visual       TEXT,
      srt          TEXT,
      duration     REAL,
      audio_done   INTEGER NOT NULL DEFAULT 0,
      srt_done     INTEGER NOT NULL DEFAULT 0,
      html_done    INTEGER NOT NULL DEFAULT 0,
      render_done  INTEGER NOT NULL DEFAULT 0,
      updated_at   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (project_id, stt)
    );
    CREATE TABLE IF NOT EXISTS video_styles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      style_guide TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
  `);
  // Seed default style if table is empty
  const count = _db.prepare('SELECT COUNT(*) as n FROM video_styles').get().n;
  if (count === 0) {
    _db.prepare('INSERT INTO video_styles (name, description, style_guide, created_at) VALUES (?, ?, ?, ?)')
      .run('Tài chính / Crypto', 'Phong cách cinematic tối với màu vàng gold, phù hợp cho video về crypto, chứng khoán, tài chính', DEFAULT_STYLE_GUIDE, Date.now());
  }
  const projectCols = _db.prepare(`PRAGMA table_info(projects)`).all().map(col => col.name);
  if (!projectCols.includes('output_aspect_ratio')) {
    _db.exec(`ALTER TABLE projects ADD COLUMN output_aspect_ratio TEXT NOT NULL DEFAULT '9:16';`);
  }
  return _db;
}

// ─── Project CRUD ─────────────────────────────────────────────────────────────

export function listProjects() {
  const projects = db()
    .prepare('SELECT id, topic, status, created_at, updated_at, output_aspect_ratio FROM projects ORDER BY created_at DESC')
    .all();
  for (const project of projects) {
    const statePath = path.join(SESS_DIR, project.id, 'state.json');
    if (!fs.existsSync(statePath)) continue;
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      const stateAspectRatio = state.outputAspectRatio || '9:16';
      if (project.output_aspect_ratio !== stateAspectRatio) {
        project.output_aspect_ratio = stateAspectRatio;
        updateProject(project.id, { output_aspect_ratio: stateAspectRatio });
      }
    } catch {}
  }
  return projects;
}

export function getProject(id) {
  const project = db().prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return null;
  const statePath = path.join(SESS_DIR, id, 'state.json');
  let state = null;
  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      const stateAspectRatio = state.outputAspectRatio || '9:16';
      if (project.output_aspect_ratio !== stateAspectRatio) {
        project.output_aspect_ratio = stateAspectRatio;
        updateProject(id, { output_aspect_ratio: stateAspectRatio });
      }
    } catch {}
  }
  project.chato1_keys = JSON.parse(project.chato1_keys || '[]');
  project.scenes = db()
    .prepare('SELECT * FROM scenes WHERE project_id = ? ORDER BY stt')
    .all(id);
  const thumbnailHtmlPath = path.join(SESS_DIR, id, 'html', 'thumbnail.html');
  const thumbnailImagePath = path.join(SESS_DIR, id, 'thumbnail', 'thumbnail.jpg');
  if (state?.thumbnail || fs.existsSync(thumbnailHtmlPath) || fs.existsSync(thumbnailImagePath)) {
    project.thumbnail = {
      title: state?.thumbnail?.title || '',
      prompt: state?.thumbnail?.prompt || '',
      html_done: Boolean(state?.thumbnail?.htmlDone) || fs.existsSync(thumbnailHtmlPath),
      image_done: Boolean(state?.thumbnail?.imageDone) || fs.existsSync(thumbnailImagePath),
    };
  } else {
    project.thumbnail = null;
  }
  return project;
}

export function createProject({ id, topic, chato1Keys, createdAt, outputAspectRatio }) {
  const now = createdAt || Date.now();
  db().prepare(`
    INSERT OR IGNORE INTO projects (id, topic, status, created_at, updated_at, chato1_keys, output_aspect_ratio)
    VALUES (?, ?, 'running', ?, ?, ?, ?)
  `).run(id, topic, now, now, JSON.stringify(chato1Keys ?? []), outputAspectRatio || '9:16');
}

export function updateProject(id, fields) {
  const allowed = ['status', 'final_video', 'chato1_keys', 'output_aspect_ratio'];
  const sets = Object.keys(fields)
    .filter(k => allowed.includes(k))
    .map(k => `${k} = @${k}`)
    .join(', ');
  if (!sets) return;
  db().prepare(`UPDATE projects SET ${sets}, updated_at = @now WHERE id = @id`)
    .run({ ...fields, now: Date.now(), id });
}

// ─── Scene CRUD ───────────────────────────────────────────────────────────────

export function getScene(projectId, stt) {
  return db()
    .prepare('SELECT * FROM scenes WHERE project_id = ? AND stt = ?')
    .get(projectId, stt);
}

export function upsertScene(projectId, stt, fields) {
  const now = Date.now();
  const existing = getScene(projectId, stt);
  if (existing) {
    const allowed = ['voice', 'visual', 'srt', 'duration', 'audio_done', 'srt_done', 'html_done', 'render_done'];
    const sets = Object.keys(fields)
      .filter(k => allowed.includes(k))
      .map(k => `${k} = @${k}`)
      .join(', ');
    if (sets) {
      db().prepare(`UPDATE scenes SET ${sets}, updated_at = @now WHERE project_id = @pid AND stt = @stt`)
        .run({ ...fields, now, pid: projectId, stt });
    }
  } else {
    const cols = ['project_id', 'stt', 'updated_at', ...Object.keys(fields)];
    const vals = cols.map(c => `@${c}`).join(', ');
    db().prepare(`INSERT OR IGNORE INTO scenes (${cols.join(', ')}) VALUES (${vals})`)
      .run({ project_id: projectId, stt, updated_at: now, ...fields });
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function deleteProject(id) {
  db().prepare('DELETE FROM projects WHERE id = ?').run(id);
  const dir = path.join(SESS_DIR, id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

export function deleteAllProjects() {
  const ids = db().prepare('SELECT id FROM projects').all().map(r => r.id);
  db().prepare('DELETE FROM projects').run();
  for (const id of ids) {
    const dir = path.join(SESS_DIR, id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ─── Sync from pipeline state object (called after each saveState) ────────────

export function syncFromState(sessionId, state) {
  if (!state) return;
  try {
    createProject({
      id: sessionId,
      topic: state.topic,
      chato1Keys: state.chato1Keys,
      createdAt: state.createdAt,
      outputAspectRatio: state.outputAspectRatio || '9:16',
    });
    updateProject(sessionId, {
      status: state.status || 'running',
      output_aspect_ratio: state.outputAspectRatio || '9:16',
      ...(state.finalVideo ? { final_video: state.finalVideo } : {}),
    });
    if (Array.isArray(state.scenes)) {
      for (const sc of state.scenes) {
        upsertScene(sessionId, sc.stt, {
          voice: sc.voice ?? '',
          visual: sc.visual ?? '',
          srt: sc.srt ?? '',
          duration: sc.duration ?? null,
          audio_done: sc.audioDone ? 1 : 0,
          srt_done: sc.srtDone ? 1 : 0,
          html_done: sc.htmlDone ? 1 : 0,
          render_done: sc.renderDone ? 1 : 0,
        });
      }
    }
  } catch (e) {
    console.warn('[DB] syncFromState failed:', e.message);
  }
}

// ─── Video Styles CRUD ────────────────────────────────────────────────────────

export function listStyles() {
  return db().prepare('SELECT id, name, description, created_at FROM video_styles ORDER BY id ASC').all();
}

export function getStyle(id) {
  return db().prepare('SELECT * FROM video_styles WHERE id = ?').get(id);
}

export function createStyle({ name, description, styleGuide }) {
  const now = Date.now();
  const result = db()
    .prepare('INSERT INTO video_styles (name, description, style_guide, created_at) VALUES (?, ?, ?, ?)')
    .run(name, description || '', styleGuide, now);
  return result.lastInsertRowid;
}

export function deleteStyle(id) {
  db().prepare('DELETE FROM video_styles WHERE id = ?').run(id);
}

// ─── Import existing sessions from disk on startup ────────────────────────────

export function importExistingSessions() {
  if (!fs.existsSync(SESS_DIR)) return;
  const ids = fs.readdirSync(SESS_DIR).filter(d =>
    fs.existsSync(path.join(SESS_DIR, d, 'state.json'))
  );
  for (const id of ids) {
    try {
      const existing = db().prepare('SELECT id FROM projects WHERE id = ?').get(id);
      if (existing) continue;
      const raw = fs.readFileSync(path.join(SESS_DIR, id, 'state.json'), 'utf8');
      const state = JSON.parse(raw);
      syncFromState(id, state);
    } catch {}
  }
}
