// src/agents/musicAgent.js — Bước B7 music planning
// Nhận SRT tổng hợp + danh sách SFX + BGM đã lọc theo keyword → 1 AI call → placement plan.
import { callAI } from '../services/aiRouter.js';

function srtToMs(t) {
  const [h, m, rest] = t.split(':');
  const [s, ms] = rest.split(',');
  return (+h) * 3600000 + (+m) * 60000 + (+s) * 1000 + (+ms);
}

function msToSRT(ms) {
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  const s  = Math.floor((ms % 60000) / 1000);
  const mm = ms % 1000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(mm).padStart(3,'0')}`;
}

/** Build SRT với absolute timestamps từ tất cả cảnh. */
export function buildAbsoluteSRT(scenes, xfadeDur = 0.5) {
  const lines = [];
  let offsetMs = 0;
  let idx = 1;

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    if (!sc.srt) continue;

    for (const block of sc.srt.trim().split(/\n\n+/)) {
      const bLines = block.split('\n');
      const [fromStr, toStr] = (bLines[1] || '').split(' --> ').map(t => t?.trim());
      if (!fromStr || !toStr) continue;
      const text = bLines.slice(2).join(' ');
      lines.push(`${idx}`, `${msToSRT(srtToMs(fromStr) + offsetMs)} --> ${msToSRT(srtToMs(toStr) + offsetMs)}`, text, '');
      idx++;
    }

    if (sc.duration != null) {
      offsetMs += Math.round(sc.duration * 1000) - (i < scenes.length - 1 ? Math.round(xfadeDur * 1000) : 0);
    }
  }
  return lines.join('\n');
}

/**
 * Một AI call: SRT tổng hợp + SFX files + BGM files → placement plan.
 *
 * @returns {Promise<{
 *   background_music: string|null,
 *   background_volume: number,
 *   sound_effects: Array<{file:string, time:number, volume:number}>
 * }>}
 */
export async function decideMusicPlan({ scenes, sfxFiles, bgmFiles, topic, keys, onLog }) {
  const absSRT = buildAbsoluteSRT(scenes, 0.5);
  const totalDuration = scenes.reduce((sum, sc, i) =>
    sum + (sc.duration ?? 0) - (i < scenes.length - 1 ? 0.5 : 0), 0);

  const sfxList = sfxFiles.length
    ? sfxFiles.map(f => `- ${f.name}${f.duration != null ? ` (${f.duration}s)` : ''}`).join('\n')
    : '(none)';
  const bgmList = bgmFiles.length
    ? bgmFiles.map(f => `- ${f.name}${f.duration != null ? ` (${f.duration}s)` : ''}`).join('\n')
    : '(none)';

  const prompt = `You are a sound designer for a short Vietnamese TikTok/Reels video (${totalDuration.toFixed(1)}s total).
Topic: "${topic}"

Full video SRT subtitles (absolute timestamps from video start):
${absSRT}

Available background music files:
${bgmList}

Available sound effect files:
${sfxList}

Task:
1. Select the BEST background music file for this video's mood/topic (or null if none fit).
2. Select sound effects to insert at specific timestamps. Choose moments where audio reinforces the content: transitions, key facts being stated, emphasis points. Be selective — only where it genuinely adds value (3-8 effects max).
3. Set volumes: background music 0.08-0.15 (subtle, won't drown voice), sound effects 0.6-1.0.

Important timing rules:
- "time" is seconds from video start (e.g. 3.5 means 3.5 seconds into the video)
- Match sound effects to the SRT timestamps where the relevant content is spoken
- Sound effect duration must fit before the next major content moment (check durations)
- Don't stack multiple sound effects within 1 second of each other

Return ONLY valid JSON, no explanation:
{
  "background_music": "exact filename or null",
  "background_volume": 0.12,
  "sound_effects": [
    {"file": "exact filename", "time": 2.5, "volume": 0.8},
    {"file": "exact filename", "time": 8.0, "volume": 0.7}
  ]
}`;

  const { result } = await callAI({ prompt, isJson: true, keys, onLog });

  const sfxNames = new Set(sfxFiles.map(f => f.name));
  const bgmNames = new Set(bgmFiles.map(f => f.name));

  const plan = {
    background_music: null,
    background_volume: typeof result.background_volume === 'number'
      ? Math.min(0.3, Math.max(0, result.background_volume)) : 0.12,
    sound_effects: [],
  };

  if (result.background_music && result.background_music !== 'null') {
    plan.background_music = bgmNames.has(result.background_music) ? result.background_music : null;
    if (!plan.background_music) onLog?.(`⚠ BGM "${result.background_music}" không có trong danh sách`);
  }

  plan.sound_effects = (Array.isArray(result.sound_effects) ? result.sound_effects : [])
    .filter(sfx => {
      if (!sfx?.file || typeof sfx.time !== 'number') return false;
      if (!sfxNames.has(sfx.file)) {
        onLog?.(`⚠ SFX "${sfx.file}" không có trong danh sách — bỏ qua`);
        return false;
      }
      return true;
    })
    .map(sfx => ({
      file: sfx.file,
      time: Math.max(0, sfx.time),
      volume: typeof sfx.volume === 'number' ? Math.min(1, Math.max(0, sfx.volume)) : 0.8,
    }));

  onLog?.(`BGM: ${plan.background_music || 'không có'} | SFX: ${plan.sound_effects.length} điểm`);
  return plan;
}
