// src/db/index.js — SQLite database for project/scene management
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DB_PATH, SESS_DIR, ensureDataDirs } from '../utils/paths.js';

ensureDataDirs();

let _db = null;
const OUTPUT_ASPECT_RATIO = '9:16';

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
      output_aspect_ratio TEXT NOT NULL DEFAULT '9:16',
      video_objective TEXT NOT NULL DEFAULT 'mac-dinh',
      final_video  TEXT
    );
    CREATE TABLE IF NOT EXISTS scenes (
      project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      stt          INTEGER NOT NULL,
      voice        TEXT,
      visual       TEXT,
      template     TEXT,
      srt          TEXT,
      duration     REAL,
      audio_done   INTEGER NOT NULL DEFAULT 0,
      srt_done     INTEGER NOT NULL DEFAULT 0,
      html_done    INTEGER NOT NULL DEFAULT 0,
      render_done  INTEGER NOT NULL DEFAULT 0,
      updated_at   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (project_id, stt)
    );
  `);
  const projectCols = _db.prepare(`PRAGMA table_info(projects)`).all().map(col => col.name);
  if (!projectCols.includes('output_aspect_ratio')) {
    _db.exec(`ALTER TABLE projects ADD COLUMN output_aspect_ratio TEXT NOT NULL DEFAULT '9:16';`);
  }
  if (!projectCols.includes('video_objective')) {
    _db.exec(`ALTER TABLE projects ADD COLUMN video_objective TEXT NOT NULL DEFAULT 'mac-dinh';`);
  }
  const sceneCols = _db.prepare(`PRAGMA table_info(scenes)`).all().map(col => col.name);
  if (!sceneCols.includes('template')) {
    _db.exec(`ALTER TABLE scenes ADD COLUMN template TEXT;`);
  }
  return _db;
}

// ─── Project CRUD ─────────────────────────────────────────────────────────────

export function listProjects() {
  const projects = db()
    .prepare('SELECT id, topic, status, created_at, updated_at, output_aspect_ratio, video_objective FROM projects ORDER BY created_at DESC')
    .all();
  for (const project of projects) {
    const statePath = path.join(SESS_DIR, project.id, 'state.json');
    if (!fs.existsSync(statePath)) continue;
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (state.outputAspectRatio !== OUTPUT_ASPECT_RATIO) {
        state.outputAspectRatio = OUTPUT_ASPECT_RATIO;
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
      }
      if (project.output_aspect_ratio !== OUTPUT_ASPECT_RATIO) {
        project.output_aspect_ratio = OUTPUT_ASPECT_RATIO;
        updateProject(project.id, { output_aspect_ratio: OUTPUT_ASPECT_RATIO });
      }
      const stateObjective = state.videoObjective || 'mac-dinh';
      if (project.video_objective !== stateObjective) {
        project.video_objective = stateObjective;
        updateProject(project.id, { video_objective: stateObjective });
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
      if (state.outputAspectRatio !== OUTPUT_ASPECT_RATIO) {
        state.outputAspectRatio = OUTPUT_ASPECT_RATIO;
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
      }
      if (project.output_aspect_ratio !== OUTPUT_ASPECT_RATIO) {
        project.output_aspect_ratio = OUTPUT_ASPECT_RATIO;
        updateProject(id, { output_aspect_ratio: OUTPUT_ASPECT_RATIO });
      }
      const stateObjective = state.videoObjective || 'mac-dinh';
      if (project.video_objective !== stateObjective) {
        project.video_objective = stateObjective;
        updateProject(id, { video_objective: stateObjective });
      }
    } catch {}
  }
  project.scenes = db()
    .prepare('SELECT * FROM scenes WHERE project_id = ? ORDER BY stt')
    .all(id);
  return project;
}

export function createProject({ id, topic, createdAt, videoObjective }) {
  const now = createdAt || Date.now();
  db().prepare(`
    INSERT OR IGNORE INTO projects (id, topic, status, created_at, updated_at, output_aspect_ratio, video_objective)
    VALUES (?, ?, 'running', ?, ?, ?, ?)
  `).run(id, topic, now, now, OUTPUT_ASPECT_RATIO, videoObjective || 'mac-dinh');
}

export function updateProject(id, fields) {
  const allowed = ['status', 'final_video', 'output_aspect_ratio', 'video_objective'];
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
    const allowed = ['voice', 'visual', 'template', 'srt', 'duration', 'audio_done', 'srt_done', 'html_done', 'render_done'];
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
      createdAt: state.createdAt,
      videoObjective: state.videoObjective || 'mac-dinh',
    });
    updateProject(sessionId, {
      status: state.status || 'running',
      output_aspect_ratio: OUTPUT_ASPECT_RATIO,
      video_objective: state.videoObjective || 'mac-dinh',
      ...(state.finalVideo ? { final_video: state.finalVideo } : {}),
    });
    if (Array.isArray(state.scenes)) {
      for (const sc of state.scenes) {
        upsertScene(sessionId, sc.stt, {
          voice: sc.voice ?? '',
          visual: sc.visual ?? '',
          template: sc.template ?? '',
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
