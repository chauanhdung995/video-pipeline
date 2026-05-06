import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BLOCKS_DIR = path.join(ROOT, 'src', 'renderer', 'hyperframes', 'blocks');
const REGISTRY_DIR = path.join(BLOCKS_DIR, '_registry');
const REGISTRY_BASE = process.env.HYPERFRAMES_REGISTRY_URL || 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry';

const ITEM_DIR = {
  'hyperframes:block': 'blocks',
  'hyperframes:component': 'components',
  'hyperframes:example': 'examples',
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeJoin(base, target) {
  const resolved = path.resolve(base, target);
  const baseResolved = path.resolve(base);
  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
    throw new Error(`Unsafe registry target: ${target}`);
  }
  return resolved;
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchJson(url) {
  return JSON.parse((await fetchBuffer(url)).toString('utf8'));
}

function addBlockMarker(source, item) {
  if (/^\s*<!--\s*hyperframes-registry-item:/i.test(source.slice(0, 512))) return source;
  return `<!-- hyperframes-registry-item: ${item.name} -->\n${source}`;
}

function localTarget(item, file) {
  if (item.type === 'hyperframes:block') {
    if (file.type === 'hyperframes:composition') {
      return file.target.replace(/^compositions\//, '');
    }
    if (file.type === 'hyperframes:asset') {
      return file.target.replace(/^assets\//, 'assets/');
    }
    return file.target.replace(/^compositions\//, '');
  }

  if (item.type === 'hyperframes:component') {
    return file.target.replace(/^compositions\/components\//, 'components/');
  }

  if (item.type === 'hyperframes:example') {
    return path.join('examples', item.name, file.target);
  }

  return file.target;
}

async function installItem(itemRef) {
  const sourceDir = ITEM_DIR[itemRef.type];
  if (!sourceDir) return null;

  const item = await fetchJson(`${REGISTRY_BASE}/${sourceDir}/${itemRef.name}/registry-item.json`);
  const itemMetaPath = safeJoin(REGISTRY_DIR, path.join('items', sourceDir, `${item.name}.json`));
  ensureDir(path.dirname(itemMetaPath));
  fs.writeFileSync(itemMetaPath, `${JSON.stringify(item, null, 2)}\n`, 'utf8');

  const written = [];
  for (const file of item.files || []) {
    const sourceUrl = `${REGISTRY_BASE}/${sourceDir}/${item.name}/${file.path}`;
    const targetRel = localTarget(item, file);
    const targetPath = safeJoin(BLOCKS_DIR, targetRel);
    ensureDir(path.dirname(targetPath));

    let data = await fetchBuffer(sourceUrl);
    if (item.type === 'hyperframes:block' && file.type === 'hyperframes:composition' && /\.html$/i.test(file.path)) {
      data = Buffer.from(addBlockMarker(data.toString('utf8'), item), 'utf8');
    }

    fs.writeFileSync(targetPath, data);
    written.push(path.relative(BLOCKS_DIR, targetPath));
  }

  return {
    name: item.name,
    type: item.type,
    title: item.title || item.name,
    description: item.description || '',
    tags: item.tags || [],
    files: written,
  };
}

function writeReadme(summary) {
  const readme = `# Local HyperFrames Blocks

This folder is a local mirror of the official HyperFrames registry:

${REGISTRY_BASE}

Synced at: ${summary.syncedAt}

Counts:

- Blocks: ${summary.counts.blocks}
- Components: ${summary.counts.components}
- Examples: ${summary.counts.examples}

Runtime layout:

- \`*.html\`: installable HyperFrames block compositions.
- \`components/*.html\`: reusable snippets/components.
- \`assets/**\`: media required by block compositions.
- \`examples/**\`: full registry examples for reference when designing templates. These are not copied into render temp folders.
- \`_registry/**\`: registry metadata and item manifests.

Re-sync:

\`\`\`bash
npm run hyperframes:sync-blocks
\`\`\`
`;
  fs.writeFileSync(path.join(BLOCKS_DIR, 'README.md'), readme, 'utf8');
}

async function main() {
  ensureDir(BLOCKS_DIR);
  ensureDir(REGISTRY_DIR);

  const manifest = await fetchJson(`${REGISTRY_BASE}/registry.json`);
  fs.writeFileSync(path.join(REGISTRY_DIR, 'registry.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const wantedTypes = new Set(['hyperframes:block', 'hyperframes:component', 'hyperframes:example']);
  const refs = (manifest.items || []).filter(item => wantedTypes.has(item.type));
  const installed = [];

  for (const ref of refs) {
    process.stdout.write(`[hyperframes-registry] ${ref.type} ${ref.name}... `);
    const result = await installItem(ref);
    if (result) {
      installed.push(result);
      process.stdout.write(`${result.files.length} file(s)\n`);
    } else {
      process.stdout.write('skipped\n');
    }
  }

  const summary = {
    source: REGISTRY_BASE,
    syncedAt: new Date().toISOString(),
    counts: {
      blocks: installed.filter(item => item.type === 'hyperframes:block').length,
      components: installed.filter(item => item.type === 'hyperframes:component').length,
      examples: installed.filter(item => item.type === 'hyperframes:example').length,
      files: installed.reduce((sum, item) => sum + item.files.length, 0),
    },
    items: installed,
  };

  fs.writeFileSync(path.join(REGISTRY_DIR, 'index.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  writeReadme(summary);

  console.log(`Synced ${summary.counts.blocks} blocks, ${summary.counts.components} components, ${summary.counts.examples} examples (${summary.counts.files} files).`);
  console.log(`Target: ${BLOCKS_DIR}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
