import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../..');

function isRunnable(command, args = ['--version']) {
  try {
    const result = spawnSync(command, args, { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function resolvePythonCommand() {
  const envPython = process.env.VIDEO_PIPELINE_PYTHON;
  if (envPython && fs.existsSync(envPython)) {
    return { command: envPython, args: [] };
  }

  const venvPython = process.platform === 'win32'
    ? path.join(ROOT_DIR, '.venv', 'Scripts', 'python.exe')
    : path.join(ROOT_DIR, '.venv', 'bin', 'python');

  if (fs.existsSync(venvPython)) {
    return { command: venvPython, args: [] };
  }

  const candidates = process.platform === 'win32'
    ? [
        { command: 'py', args: ['-3.11'] },
        { command: 'python', args: [] },
      ]
    : [
        { command: 'python3.11', args: [] },
        { command: 'python3', args: [] },
        { command: 'python', args: [] },
      ];

  for (const candidate of candidates) {
    if (isRunnable(candidate.command, [...candidate.args, '--version'])) {
      return candidate;
    }
  }

  throw new Error('Không tìm thấy Python. Hãy chạy script setup trước.');
}
