import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolvePythonCommand } from '../utils/python.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WHISPER_SCRIPT = path.join(__dirname, '..', 'utils', 'whisper_generate.py');

const fmtMs = ms => ms < 60000 ? `${(ms/1000).toFixed(1)}s` : `${Math.floor(ms/60000)}m${Math.round((ms%60000)/1000)}s`;

/**
 * @param {string} audioPath
 * @param {string} srtPath
 * @param {(msg:string)=>void} [onLog]
 */
export async function transcribeToSRT(audioPath, srtPath, onLog) {
  onLog?.(`Whisper: ${path.basename(audioPath)}`);
  const t0 = Date.now();

  return new Promise((resolve, reject) => {
    const python = resolvePythonCommand();
    const proc = spawn(python.command, [...python.args, WHISPER_SCRIPT, audioPath, srtPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let err = '';
    proc.stderr.on('data', d => {
      err += d;
      const line = d.toString().trim();
      if (line && !line.startsWith('Traceback') && !line.startsWith('  File')) {
        onLog?.(`Whisper: ${line}`);
      }
    });

    proc.on('close', code => {
      if (code === 0 && fs.existsSync(srtPath)) {
        const srt = fs.readFileSync(srtPath, 'utf8');
        const blocks = srt.trim().split(/\n\n+/).length;
        onLog?.(`✓ Whisper xong: ${blocks} dòng phụ đề | ${fmtMs(Date.now() - t0)}`);
        resolve();
      } else {
        const fullErr = `whisper_generate.py exit ${code}: ${err.slice(0, 500)}`;
        onLog?.(`✗ Whisper lỗi: ${fullErr.slice(0, 200)}`);
        console.error('[Whisper] ✗', fullErr);
        reject(new Error(fullErr));
      }
    });

    proc.on('error', e => {
      onLog?.(`✗ Whisper spawn lỗi: ${e.message}`);
      console.error('[Whisper] ✗ spawn:', e);
      reject(e);
    });
  });
}
