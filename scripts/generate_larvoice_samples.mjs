import { generateLarVoiceSampleLibrary } from '../src/agents/ttsAgent.js';

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const concurrencyArg = process.argv.find(arg => arg.startsWith('--concurrency='));
const concurrency = concurrencyArg ? Number(concurrencyArg.split('=')[1]) : 1;
const retryDelayArg = process.argv.find(arg => arg.startsWith('--retry-delay-ms='));
const retryDelayMs = retryDelayArg ? Number(retryDelayArg.split('=')[1]) : 30000;

const result = await generateLarVoiceSampleLibrary({
  force,
  concurrency,
  retryDelayMs,
  onLog: msg => console.log(msg),
});

console.log('');
console.log('LarVoice sample generation complete');
console.log(`Total: ${result.total}`);
console.log(`Generated: ${result.generated}`);
console.log(`Skipped: ${result.skipped}`);
console.log(`Failed: ${result.failed}`);
console.log(`Sample dir: ${result.sampleDir}`);
console.log(`Manifest: ${result.manifestFile}`);
console.log(`Failed list: ${result.failedFile}`);
