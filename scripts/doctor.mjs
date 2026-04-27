import { spawnSync } from 'child_process';
import { resolvePythonCommand } from '../src/utils/python.js';

const nodeMajor = Number(process.versions.node.split('.')[0]);

function runCheck(label, command, args = []) {
  try {
    const result = spawnSync(command, args, { encoding: 'utf8' });
    if (result.status === 0) {
      const output = `${result.stdout || ''}${result.stderr || ''}`.trim().split('\n')[0] || 'OK';
      console.log(`OK  ${label}: ${output}`);
      return true;
    }

    const output = `${result.stdout || ''}${result.stderr || ''}`.trim().split('\n')[0] || 'Loi khong ro';
    console.log(`FAIL ${label}: ${output}`);
    return false;
  } catch (error) {
    console.log(`FAIL ${label}: ${error.message}`);
    return false;
  }
}

let ok = true;

if (nodeMajor < 20 || nodeMajor >= 25) {
  console.log(`WARN Node.js: version ${process.versions.node} nam ngoai dai khuyen nghi 20-24.`);
}

ok = runCheck('Node.js', 'node', ['--version']) && ok;
ok = runCheck('npm', 'npm', ['--version']) && ok;
ok = runCheck('ffmpeg', 'ffmpeg', ['-version']) && ok;
ok = runCheck('ffprobe', 'ffprobe', ['-version']) && ok;

let python;
try {
  python = resolvePythonCommand();
  ok = runCheck('Python', python.command, [...python.args, '--version']) && ok;
  ok = runCheck('faster-whisper', python.command, [...python.args, '-c', 'import faster_whisper; print("faster-whisper OK")']) && ok;
} catch (error) {
  console.log(`FAIL Python: ${error.message}`);
  ok = false;
}

if (!ok) {
  console.error('\nMoi truong chua san sang. Hay chay lai script setup.');
  process.exit(1);
}

console.log('\nMoi truong da san sang.');
