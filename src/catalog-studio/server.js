import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import multer from 'multer';
import { composeSceneHTML } from '../renderer/hyperframesTemplateSystem.js';
import { renderSceneVideo } from '../renderer/hyperframesRender.js';
import { mergeSceneAudio } from '../renderer/ffmpegMerge.js';
import { callAI } from '../services/aiRouter.js';
import { OPENAI_MODEL } from '../config/apiKeys.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CATALOG_ROOT = path.join(PROJECT_ROOT, 'src', 'renderer', 'hyperframes', 'catalog', 'objectives');
const BLOCKS_ROOT = path.join(PROJECT_ROOT, 'src', 'renderer', 'hyperframes', 'blocks');
const SFX_ROOT = path.join(PROJECT_ROOT, 'assets', 'sfx');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.CATALOG_STUDIO_PORT || 3001);
const DEFAULT_DURATION_SEC = 5;
const BLOCK_EXTS = ['.html'];
const SFX_EXTS = ['.mp3', '.wav', '.m4a', '.ogg'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

const app = express();

app.use(express.json({ limit: '20mb' }));
app.use(express.static(PUBLIC_DIR));
app.use('/assets', express.static(path.join(PROJECT_ROOT, 'assets')));
app.use('/sessions', express.static(path.join(PROJECT_ROOT, 'sessions')));
app.use('/blocks-static', express.static(BLOCKS_ROOT));
app.use('/catalog-files', express.static(CATALOG_ROOT, {
  etag: false,
  lastModified: false,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  },
}));

app.get('/favicon.ico', (_req, res) => res.status(204).end());

function toSlug(value, fallback = 'item') {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

function resolveCatalogPath(...segments) {
  const target = path.resolve(CATALOG_ROOT, ...segments);
  const root = path.resolve(CATALOG_ROOT);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw Object.assign(new Error('Đường dẫn catalog không hợp lệ'), { status: 400 });
  }
  return target;
}

function resolveBlockPath(file) {
  const rel = String(file || '').replace(/^\/+/, '');
  const target = path.resolve(BLOCKS_ROOT, rel);
  const root = path.resolve(BLOCKS_ROOT);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw Object.assign(new Error('Đường dẫn block không hợp lệ'), { status: 400 });
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw Object.assign(new Error('Không tìm thấy block'), { status: 404 });
  }
  return target;
}

function resolveSfxPath(file) {
  const rel = String(file || '').replace(/^\/+/, '');
  const target = path.resolve(SFX_ROOT, rel);
  const root = path.resolve(SFX_ROOT);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw Object.assign(new Error('Đường dẫn SFX không hợp lệ'), { status: 400 });
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw Object.assign(new Error('Không tìm thấy SFX'), { status: 404 });
  }
  return target;
}

function resolveNewLibraryPath(rootDir, relFile) {
  const rel = String(relFile || '').replace(/^\/+/, '');
  const target = path.resolve(rootDir, rel);
  const root = path.resolve(rootDir);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw Object.assign(new Error('Đường dẫn thư viện không hợp lệ'), { status: 400 });
  }
  return target;
}

function encodePathSegments(relPath) {
  return String(relPath || '').split('/').map(encodeURIComponent).join('/');
}

function safeLibraryFileName(value, fallback, allowedExts) {
  const raw = path.basename(String(value || fallback));
  const originalExt = path.extname(raw).toLowerCase();
  const ext = allowedExts.includes(originalExt) ? originalExt : allowedExts[0];
  const base = raw.slice(0, raw.length - originalExt.length)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || fallback;
  return `${base}${ext}`;
}

function safeFolderName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^-+|-+$/g, '')
    .replace(/(^|\/)\.+(?=\/|$)/g, '')
    .split('/')
    .filter(Boolean)
    .slice(0, 3)
    .join('/');
}

function uniqueRelPath(rootDir, folder, fileName) {
  const cleanFolder = safeFolderName(folder);
  const baseRel = cleanFolder ? `${cleanFolder}/${fileName}` : fileName;
  const ext = path.extname(baseRel);
  const stem = baseRel.slice(0, baseRel.length - ext.length);
  let rel = baseRel;
  let i = 2;
  while (fs.existsSync(resolveNewLibraryPath(rootDir, rel))) {
    rel = `${stem}-${i}${ext}`;
    i += 1;
  }
  return rel;
}

function normalizeLibraryRel({ file, folder, name, fallback, allowedExts }) {
  const rawFile = String(file || '').trim().replace(/^\/+/, '');
  const parts = rawFile ? rawFile.split('/') : [];
  const rawName = name || parts.pop() || fallback;
  const rawFolder = folder ?? parts.join('/');
  const fileName = safeLibraryFileName(rawName, fallback, allowedExts);
  const cleanFolder = safeFolderName(rawFolder);
  return cleanFolder ? `${cleanFolder}/${fileName}` : fileName;
}

function assertAllowedExtension(file, allowedExts, label) {
  const ext = path.extname(String(file || '')).toLowerCase();
  if (!allowedExts.includes(ext)) {
    throw Object.assign(new Error(`${label} phải có định dạng: ${allowedExts.join(', ')}`), { status: 400 });
  }
  return ext;
}

function removeEmptyParentDirs(filePath, rootDir) {
  const root = path.resolve(rootDir);
  let dir = path.dirname(path.resolve(filePath));
  while (dir !== root && dir.startsWith(root + path.sep)) {
    try {
      fs.rmdirSync(dir);
      dir = path.dirname(dir);
    } catch {
      break;
    }
  }
}

function assertObjectiveId(value) {
  const id = toSlug(value, '');
  if (!id) throw Object.assign(new Error('Thiếu objective id'), { status: 400 });
  return id;
}

function assertTemplateId(value) {
  const id = toSlug(value, '');
  if (!id) throw Object.assign(new Error('Thiếu template id'), { status: 400 });
  return id;
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { __invalidJson: true, error: error.message };
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readText(file, fallback = '') {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : fallback;
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, String(value ?? ''), 'utf8');
}

function fileInfo(file) {
  if (!fs.existsSync(file)) return { exists: false, size: 0, mtimeMs: 0 };
  const stat = fs.statSync(file);
  return { exists: true, size: stat.size, mtimeMs: stat.mtimeMs };
}

function safeListDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(item => item.isDirectory() && !item.name.startsWith('_') && !item.name.startsWith('.'))
    .map(item => item.name)
    .sort((a, b) => a.localeCompare(b));
}

function safeListFilesRecursive(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...safeListFilesRecursive(abs, rel));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function blockMeta(file) {
  const abs = resolveBlockPath(file);
  const html = readText(abs);
  const stat = fs.statSync(abs);
  const width = Number(html.match(/data-width=["'](\d+)["']/)?.[1] || html.match(/width=(\d+)/)?.[1] || 1080);
  const height = Number(html.match(/data-height=["'](\d+)["']/)?.[1] || html.match(/height=(\d+)/)?.[1] || 1920);
  const title = html.match(/<title>(.*?)<\/title>/i)?.[1]?.trim();
  return {
    file,
    label: file.replace(/\.html$/i, ''),
    title: title || file.replace(/\.html$/i, ''),
    width,
    height,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    url: `/blocks-static/${encodePathSegments(file)}`,
    type: /<!doctype html|<html[\s>]/i.test(html) ? 'composition' : 'component',
  };
}

function sfxMeta(file) {
  const abs = resolveSfxPath(file);
  const stat = fs.statSync(abs);
  return {
    file,
    label: file.replace(/\.(mp3|wav|m4a|ogg)$/i, ''),
    category: path.dirname(file) === '.' ? '' : path.dirname(file).replace(/\\/g, '/'),
    ext: path.extname(file).toLowerCase(),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    url: `/assets/sfx/${encodePathSegments(file)}?v=${Math.round(stat.mtimeMs)}`,
  };
}

function blockPreviewHtml(file) {
  const abs = resolveBlockPath(file);
  const html = readText(abs);
  const meta = blockMeta(file);
  const dir = path.dirname(file).replace(/\\/g, '/');
  const baseHref = `/blocks-static/${dir && dir !== '.' ? `${dir}/` : ''}`;
  if (/<!doctype html|<html[\s>]/i.test(html)) {
    const withBase = html.replace(/<head([^>]*)>/i, `<head$1>\n<base href="${escapeHtml(baseHref)}">`);
    const runner = `<script>
window.addEventListener("load", function () {
  requestAnimationFrame(function () {
    Object.values(window.__timelines || {}).forEach(function (timeline) {
      if (!timeline || typeof timeline.play !== "function") return;
      try {
        timeline.progress(0);
        timeline.play(0);
      } catch {}
    });
  });
});
</script>`;
    return /<\/body>/i.test(withBase) ? withBase.replace(/<\/body>/i, `${runner}\n</body>`) : `${withBase}\n${runner}`;
  }
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1080, height=1080">
  <title>${escapeHtml(meta.title)}</title>
  <base href="${escapeHtml(baseHref)}">
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    html, body { margin: 0; width: 1080px; height: 1080px; overflow: hidden; background: #08111f; color: #f8fafc; font-family: Inter, system-ui, sans-serif; }
    .component-preview { position: absolute; inset: 0; display: grid; place-items: center; padding: 80px; background: linear-gradient(180deg, #08111f, #15243a); }
    .preview-target { position: relative; padding: 34px 42px; border-radius: 8px; background: rgba(15,23,42,.82); border: 1px solid rgba(248,250,252,.18); font-size: 56px; font-weight: 900; text-align: center; }
    .component-name { position: absolute; left: 30px; bottom: 26px; color: #67e8f9; font-size: 24px; font-weight: 800; }
  </style>
</head>
<body>
  <div class="component-preview">
    <div class="preview-target shimmer-sweep-target">Component Preview</div>
    <div class="component-name">${escapeHtml(file)}</div>
  </div>
  ${html}
</body>
</html>`;
}

function objectiveDir(objectiveId) {
  return resolveCatalogPath(assertObjectiveId(objectiveId));
}

function templateDir(objectiveId, templateId) {
  return resolveCatalogPath(assertObjectiveId(objectiveId), assertTemplateId(templateId));
}

function catalogFileUrl(objectiveId, templateId, fileName) {
  const id = `${encodeURIComponent(objectiveId)}/${encodeURIComponent(templateId)}/${encodeURIComponent(fileName)}`;
  return `/catalog-files/${id}?v=${Date.now()}`;
}

function loadObjective(objectiveId) {
  const id = assertObjectiveId(objectiveId);
  const dir = objectiveDir(id);
  const metaPath = path.join(dir, 'objective.json');
  const meta = readJson(metaPath, {}) || {};
  return {
    id,
    name: String(meta.name || id),
    description: String(meta.description || ''),
    status: String(meta.status || (safeListDirs(dir).length ? 'ready' : 'empty')),
    dir,
    templateCount: safeListDirs(dir).length,
  };
}

function loadTemplateSummary(objectiveId, templateId) {
  const objective = assertObjectiveId(objectiveId);
  const template = assertTemplateId(templateId);
  const dir = templateDir(objective, template);
  const schemaPath = path.join(dir, 'schema.json');
  const schema = readJson(schemaPath, {}) || {};
  return {
    objective,
    template,
    schemaTemplate: schema.template || template,
    description: String(schema.description || ''),
    dir,
    files: {
      schema: fileInfo(schemaPath),
      demoJson: fileInfo(path.join(dir, 'demo.json')),
      templateHtml: fileInfo(path.join(dir, 'template.html.tmpl')),
      demoHtml: fileInfo(path.join(dir, 'demo.html')),
      demoMp4: fileInfo(path.join(dir, 'demo.mp4')),
    },
    urls: {
      demoHtml: `/api/templates/${encodeURIComponent(objective)}/${encodeURIComponent(template)}/demo-html?v=${Date.now()}`,
      demoMp4: catalogFileUrl(objective, template, 'demo.mp4'),
    },
  };
}

function parseEditedJson(label, value) {
  try {
    return JSON.parse(String(value || '').trim() || '{}');
  } catch (error) {
    throw Object.assign(new Error(`${label} không phải JSON hợp lệ: ${error.message}`), { status: 400 });
  }
}

function defaultSchema(objectiveId, templateId) {
  return {
    template: templateId,
    description: `Custom template for ${objectiveId}.`,
    templateData: {
      title: 'Tiêu đề mẫu',
      subtitle: 'Mô tả ngắn để xem trước bố cục.',
      eyebrow: 'CUSTOM',
      background: {
        type: 'gradient',
        colors: ['#08111f', '#15243a'],
        accent: '#22d3ee',
        mint: '#34d399',
        opacity: 0.16,
      },
      appearanceOrder: ['title', 'subtitle'],
      timingPhrases: {
        title: 'tiêu đề',
        subtitle: 'mô tả',
      },
      sfx: {
        intro: 0.08,
      },
    },
    files: {
      template: 'template.html.tmpl',
      demoJson: 'demo.json',
      demoHtml: 'demo.html',
      demoMp4: 'demo.mp4',
    },
  };
}

function defaultDemo(objectiveId, templateId, schema) {
  return {
    objective: objectiveId,
    template: templateId,
    scenes: [
      {
        stt: 1,
        voice: 'Đây là tiêu đề mẫu. Mô tả ngắn giúp kiểm tra bố cục trước khi dùng thật.',
        ttsVoice: 'Đây là tiêu đề mẫu. Mô tả ngắn giúp kiểm tra bố cục trước khi dùng thật.',
        template: templateId,
        templateData: schema.templateData || {},
        visual: `LAYOUT: ${templateId}. BACKGROUND: gradient. MAIN ELEMENTS: title, subtitle. TEXT OVERLAY: demo.`,
      },
    ],
  };
}

function defaultTemplateHtml(templateId) {
  return `<!--
Template: ${templateId}
Mode: folder renderer

Available placeholders:
- {{template}} / {{objective}} / {{duration}}
- {{templateData}} as formatted JSON
- {{scene}} as formatted JSON
- Dot paths, for example {{templateData.title}} or {{templateData.subtitle}}
-->
<section class="custom-template" data-template="{{template}}">
  <style>
    .custom-template {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 28px;
      padding: 96px;
      color: #f8fafc;
      font-family: Inter, system-ui, sans-serif;
      background:
        linear-gradient(145deg, rgba(34,211,238,.16) 0 18%, transparent 18%),
        linear-gradient(205deg, transparent 0 70%, rgba(245,158,11,.16) 70%),
        linear-gradient(180deg, #08111f, #15243a);
      overflow: hidden;
    }
    .custom-template::before {
      content: "";
      position: absolute;
      inset: -20%;
      background: linear-gradient(105deg, transparent 0 40%, rgba(103,232,249,.22) 48%, transparent 56%);
      filter: blur(22px);
      animation: custom-flow 9s ease-in-out infinite alternate;
    }
    .custom-card {
      position: relative;
      z-index: 1;
      padding: 36px;
      border-radius: 10px;
      background: rgba(15,23,42,.78);
      border: 1px solid rgba(248,250,252,.18);
      box-shadow: 0 34px 100px rgba(0,0,0,.34);
    }
    .custom-eyebrow {
      display: inline-flex;
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(34,211,238,.18);
      color: #67e8f9;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: .08em;
    }
    .custom-title {
      margin-top: 18px;
      font-size: 82px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: 0;
    }
    .custom-subtitle {
      margin-top: 18px;
      font-size: 36px;
      line-height: 1.18;
      font-weight: 700;
      color: rgba(226,232,240,.86);
    }
    @keyframes custom-flow {
      from { transform: translate3d(-18%, -4%, 0); }
      to { transform: translate3d(18%, 4%, 0); }
    }
  </style>
  <div class="custom-card">
    <div class="custom-eyebrow">{{templateData.eyebrow}}</div>
    <div class="custom-title">{{templateData.title}}</div>
    <div class="custom-subtitle">{{templateData.subtitle}}</div>
  </div>
</section>
`;
}

function defaultAiTemplateHtml(templateId) {
  return `<section class="ai-template ai-template-${templateId}" data-template="${templateId}">
  <style>
    .ai-template {
      position: absolute;
      inset: 0;
      width: 1080px;
      height: 1920px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 28px;
      padding: 96px;
      overflow: hidden;
      background: radial-gradient(circle at 50% 20%, rgba(59,130,246,.22), transparent 34%), #0a0a0f;
      color: #e4e4e7;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .ai-template::before {
      content: "";
      position: absolute;
      inset: -20%;
      background: linear-gradient(115deg, transparent 0 42%, rgba(96,165,250,.18) 50%, transparent 58%);
      filter: blur(20px);
      animation: ai-template-sweep 7s ease-in-out infinite alternate;
    }
    .ai-template__content {
      position: relative;
      z-index: 1;
      display: grid;
      gap: 20px;
      max-width: 860px;
    }
    .ai-template__eyebrow {
      color: #60a5fa;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .ai-template__title {
      font-size: 78px;
      line-height: 1.04;
      font-weight: 900;
      overflow-wrap: anywhere;
    }
    .ai-template__subtitle {
      color: #a1a1aa;
      font-size: 34px;
      line-height: 1.28;
      font-weight: 600;
    }
    @keyframes ai-template-sweep {
      from { transform: translateX(-18%); }
      to { transform: translateX(18%); }
    }
  </style>
  <div class="ai-template__content">
    <div class="ai-template__eyebrow">{{templateData.eyebrow}}</div>
    <div class="ai-template__title">{{templateData.title}}</div>
    <div class="ai-template__subtitle">{{templateData.subtitle}}</div>
  </div>
</section>
`;
}

function runtimeTemplateNames() {
  const source = readText(path.join(PROJECT_ROOT, 'src', 'renderer', 'hyperframesTemplateSystem.js'));
  const names = new Set([
    'hook',
    'comparison',
    'comparison-vs',
    'stat-hero',
    'stat-pill',
    'feature-list',
    'feature-stack',
    'callout',
    'news-card',
    'image-background-hero',
    'image-inset-card',
    'market-chart',
    'crypto-card-hero',
    'onchain-payment',
    'payment-network-halo',
    'outro',
  ]);
  for (const match of source.matchAll(/template\s*===\s*'([^']+)'/g)) names.add(match[1]);
  for (const match of source.matchAll(/\[\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\]\.includes\(template\)/g)) {
    names.add(match[1]);
    names.add(match[2]);
    names.add(match[3]);
  }
  return names;
}

function getPathValue(source, dotted) {
  return String(dotted || '').split('.').reduce((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) return acc[key];
    return '';
  }, source);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function replaceTemplatePlaceholders(input, context) {
  return String(input || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key) => {
    if (key === 'templateData') return escapeHtml(JSON.stringify(context.templateData || {}, null, 2));
    if (key === 'scene') return escapeHtml(JSON.stringify(context.scene || {}, null, 2));
    if (key in context) return escapeHtml(context[key]);
    const value = getPathValue(context, key);
    if (value && typeof value === 'object') return escapeHtml(JSON.stringify(value, null, 2));
    return escapeHtml(value);
  });
}

function wrapFolderTemplateHtml(inner, { template, objective, duration }) {
  if (/<!doctype html|<html[\s>]/i.test(inner)) return inner;
  const compositionId = `catalog-${template}`;
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="video-pipeline-html" content="catalog-studio-folder-v1">
  <meta name="viewport" content="width=1080, height=1920">
  <title>${escapeHtml(template)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Sora:wght@400;600;700;800&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    html, body { margin: 0; width: 1080px; height: 1920px; background: #08111f; overflow: hidden; }
    #stage {
      position: relative;
      width: 1080px;
      height: 1920px;
      overflow: hidden;
      background: #08111f;
      color: #f8fafc;
      font-family: Inter, system-ui, sans-serif;
    }
    .scene {
      position: absolute;
      inset: 0;
      opacity: 0;
      overflow: hidden;
    }
    .catalog-studio-label {
      position: absolute;
      left: 32px;
      bottom: 28px;
      z-index: 50;
      padding: 8px 10px;
      border-radius: 8px;
      background: rgba(8,17,31,.72);
      color: rgba(103,232,249,.9);
      font-size: 18px;
      font-weight: 800;
      letter-spacing: .04em;
    }
  </style>
</head>
<body>
  <div id="stage"
       data-hf-duration-owner="root"
       data-composition-id="${compositionId}"
       data-width="1080"
       data-height="1920"
       data-start="0"
       data-duration="${Number(duration).toFixed(3)}">
    <div class="scene clip"
         id="scene-1"
         data-start="0"
         data-duration="${Number(duration).toFixed(3)}"
         data-layout="${escapeHtml(template)}">
      ${inner}
      <div class="catalog-studio-label">${escapeHtml(objective)} / ${escapeHtml(template)}</div>
    </div>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    window.__timelines[${JSON.stringify(compositionId)}] = tl;
    tl.set(".scene", { opacity: 1 }, 0);
    tl.to(".scene", { opacity: 1, duration: ${Number(duration).toFixed(3)} }, 0);
  </script>
</body>
</html>`;
}

function buildFolderHtml({ objective, template, scene, schema, duration }) {
  const source = sanitizeTemplateHtmlForRender(readText(path.join(templateDir(objective, template), 'template.html.tmpl'), defaultTemplateHtml(template)));
  const context = {
    objective,
    template,
    duration: Number(duration).toFixed(3),
    scene,
    templateData: scene.templateData || schema.templateData || {},
  };
  return wrapFolderTemplateHtml(sanitizeTemplateHtmlForRender(replaceTemplatePlaceholders(source, context)), { objective, template, duration });
}

function loadDemoScene(objective, template) {
  const dir = templateDir(objective, template);
  const schema = readJson(path.join(dir, 'schema.json'), defaultSchema(objective, template));
  if (schema?.__invalidJson) {
    throw Object.assign(new Error(`schema.json không hợp lệ: ${schema.error}`), { status: 400 });
  }
  const demo = readJson(path.join(dir, 'demo.json'), defaultDemo(objective, template, schema));
  if (demo?.__invalidJson) {
    throw Object.assign(new Error(`demo.json không hợp lệ: ${demo.error}`), { status: 400 });
  }
  const scene = demo.scenes?.[0] || defaultDemo(objective, template, schema).scenes[0];
  scene.template = template;
  scene.templateData = scene.templateData && typeof scene.templateData === 'object'
    ? scene.templateData
    : (schema.templateData || {});
  return { schema, demo, scene };
}

function ensureObjectiveExists(objectiveId, name = '') {
  const id = assertObjectiveId(objectiveId);
  const dir = objectiveDir(id);
  if (fs.existsSync(dir)) return loadObjective(id);
  fs.mkdirSync(dir, { recursive: true });
  const meta = {
    id,
    name: String(name || id).trim() || id,
    description: 'Created from Catalog Studio AI generator.',
    status: 'ready',
  };
  writeJson(path.join(dir, 'objective.json'), meta);
  writeText(path.join(dir, 'README.md'), `# ${meta.name}\n\n${meta.description}\n\nStatus: ${meta.status}\n`);
  return loadObjective(id);
}

function parseMaybeJson(value, label) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(String(value || '').trim() || '{}');
  } catch (error) {
    throw Object.assign(new Error(`${label} AI trả về không phải JSON hợp lệ: ${error.message}`), { status: 502 });
  }
}

function cleanGeneratedTemplateHtml(value) {
  return String(value || '')
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function sanitizeTemplateHtmlForRender(value) {
  return String(value || '')
    .replace(/\brepeat\s*:\s*-\s*1\b/g, 'repeat: 2')
    .replace(/\brepeat\s*:\s*Infinity\b/g, 'repeat: 2')
    .replace(/\.repeat\(\s*-\s*1\s*\)/g, '.repeat(2)');
}

function normalizeAiTemplateResult(result, { objective, requestedTemplateName, prompt }) {
  const raw = result && typeof result === 'object' ? result : {};
  const schema = parseMaybeJson(raw.schemaJson || raw.schema || {}, 'schema.json');
  const demo = parseMaybeJson(raw.demoJson || raw.demo || {}, 'demo.json');
  const template = toSlug(
    requestedTemplateName || raw.templateId || raw.template || raw.name || schema.template || 'ai-template',
    'ai-template',
  );
  const description = String(raw.description || schema.description || prompt).trim().slice(0, 240);
  const templateData = schema.templateData && typeof schema.templateData === 'object'
    ? schema.templateData
    : {
        eyebrow: 'GIẢI THÍCH',
        title: 'Template tạo bằng AI',
        subtitle: String(prompt || 'Mẫu template 9:16 tạo từ mô tả người dùng.').slice(0, 160),
      };

  schema.template = template;
  schema.description = description || `AI generated folder template for ${objective}.`;
  schema.templateData = templateData;
  schema.files = {
    template: 'template.html.tmpl',
    demoJson: 'demo.json',
    demoHtml: 'demo.html',
    demoMp4: 'demo.mp4',
    ...(schema.files && typeof schema.files === 'object' ? schema.files : {}),
  };

  demo.objective = objective;
  demo.template = template;
  if (!Array.isArray(demo.scenes) || !demo.scenes.length) {
    demo.scenes = [defaultDemo(objective, template, schema).scenes[0]];
  }
  demo.scenes = demo.scenes.map((scene, index) => ({
    stt: Number(scene?.stt) || index + 1,
    voice: String(scene?.voice || scene?.ttsVoice || templateData.title || 'Đây là template tạo bằng AI.'),
    ttsVoice: String(scene?.ttsVoice || scene?.voice || templateData.title || 'Đây là template tạo bằng AI.'),
    template,
    templateData: scene?.templateData && typeof scene.templateData === 'object' ? scene.templateData : templateData,
    visual: String(scene?.visual || `LAYOUT: ${template}. BACKGROUND: HyperFrames portrait explainer. MAIN ELEMENTS: title, subtitle, visual accents. TEXT OVERLAY: ${templateData.title || template}.`),
  }));

  const templateHtml = sanitizeTemplateHtmlForRender(cleanGeneratedTemplateHtml(raw.templateHtml || raw.html || raw['template.html.tmpl'] || ''));
  return {
    template,
    schema,
    demo,
    templateHtml: templateHtml || sanitizeTemplateHtmlForRender(defaultAiTemplateHtml(template)),
  };
}

function blockRefFromFile(file) {
  const parts = String(file || '')
    .replace(/\.html$/i, '')
    .split('/')
    .filter(Boolean);
  if (!parts.length) return '';
  if (parts.at(-1) === 'index' && parts.length > 1) return parts.at(-2);
  return parts.at(-1);
}

function blockPromptEntry(item) {
  const file = String(item?.file || '');
  const ref = blockRefFromFile(file);
  return ref ? `${ref} (${path.posix.join('src/renderer/hyperframes/blocks', file)})` : '';
}

function sfxPromptEntry(item) {
  const file = String(item?.file || '');
  return file ? path.posix.join('assets/sfx', file) : '';
}

function buildAiTemplatePrompt({ objective, requestedTemplateName, description, blocks, sfx }) {
  const availableBlocks = blocks.slice(0, 50).map(blockPromptEntry).filter(Boolean).join(', ');
  const availableSfx = sfx.slice(0, 30).map(sfxPromptEntry).filter(Boolean).join(', ');
  const templateNameInstruction = requestedTemplateName
    ? `Use this exact template slug unless it is invalid: ${requestedTemplateName}`
    : 'Invent a concise kebab-case template slug that starts with the objective when useful.';

  return `You are generating a new HyperFrames folder template for Catalog Studio.

USER DESCRIPTION:
${description}

TARGET:
- Objective: ${objective}
- ${templateNameInstruction}
- Video ratio: 9:16 portrait, fixed 1080x1920.
- Output must be production-ready for a short explainer/social video template.
- Style must feel native to HyperFrames: dark polished surface, crisp hierarchy, restrained but visible motion, modern grid/noise/light sweep accents, strong mobile-safe typography.

AVAILABLE BLOCK REFS:
${availableBlocks || '(none)'}

AVAILABLE SFX FILES:
${availableSfx || '(none)'}

RETURN ONE JSON OBJECT WITH EXACT KEYS:
{
  "templateId": "kebab-case-template-id",
  "description": "short English description",
  "schemaJson": { ...object... },
  "demoJson": { ...object... },
  "templateHtml": "<section>...</section>"
}

HARD REQUIREMENTS FOR schemaJson:
- schemaJson.template must match templateId.
- schemaJson.description must describe when to use the template.
- schemaJson.templateData must include realistic Vietnamese demo text.
- Include useful fields for the layout. Prefer simple fields: eyebrow, title, subtitle, body, cards, steps, metric, image, background.
- If using blockRefs, put them in schemaJson.templateData.blockRefs and only use names from AVAILABLE BLOCK REFS.
- If the user pasted a block path like src/renderer/hyperframes/blocks/name.html, use the listed ref name for schemaJson.templateData.blockRefs.
- If the user pasted BLOCK_HTML_START/BLOCK_HTML_END content from Catalog Studio, treat it as available source HTML and adapt the useful markup/CSS directly into templateHtml when requested.
- If the user pasted an SFX path like assets/sfx/category/name.mp3, preserve that path in schemaJson.templateData.sfxRefs or sfxFiles when useful.
- Include appearanceOrder and timingPhrases when helpful.
- Include files.template="template.html.tmpl", files.demoJson="demo.json", files.demoHtml="demo.html", files.demoMp4="demo.mp4".

HARD REQUIREMENTS FOR demoJson:
- demoJson.objective must be "${objective}".
- demoJson.template must match templateId.
- demoJson.scenes must contain exactly one scene.
- The scene must include stt, voice, ttsVoice, template, templateData, visual.
- scene.templateData should match the same shape as schemaJson.templateData but may use more vivid demo text.

HARD REQUIREMENTS FOR templateHtml:
- Return a fragment, not a full HTML document: start with <section ...> and include internal <style> and optional <script>.
- The section must fill exactly 1080x1920 via position:absolute; inset:0; width:1080px; height:1920px; overflow:hidden.
- Use placeholders such as {{templateData.title}}, {{templateData.subtitle}}, {{templateData.steps.0.title}}. Do not rely on loops or raw JSON parsing.
- If using arrays, reference fixed indexes explicitly: 0, 1, 2, 3.
- Do not use external images unless via placeholder fields. For image templates, provide a fallback CSS gradient if image src is empty.
- Avoid text clipping for Vietnamese: no overflow:hidden on text containers; use line-height >= 1.15 and padding-top when needed.
- Use fixed px sizes, not vw/vh font scaling.
- Keep important text above the lower subtitle-safe zone; avoid key text below y=1540.
- Include subtle continuous motion after entrance: background drift, light sweep, floating particles, pulsing line, or slow parallax.
- Use CSS animations and, if needed, GSAP in window.addEventListener('load', ...). GSAP is already available in the wrapper.
- Do not use GSAP infinite repeats: never output repeat:-1, repeat: -1, .repeat(-1), or repeat: Infinity. HyperFrames strict rendering rejects infinite GSAP repeats. Prefer CSS infinite animations for ambient background motion, or use finite GSAP repeat values such as repeat: 2.
- Do not animate or set visibility/display on .scene, #scene-1, .clip, or #stage. HyperFrames manages those wrapper elements. Animate only elements inside your returned section.
- Do not include markdown fences or explanations.`;
}

function buildAiEditTemplatePrompt({ objective, template, instruction, current, blocks, sfx }) {
  const availableBlocks = blocks.slice(0, 50).map(blockPromptEntry).filter(Boolean).join(', ');
  const availableSfx = sfx.slice(0, 30).map(sfxPromptEntry).filter(Boolean).join(', ');

  return `You are editing an existing HyperFrames Catalog Studio folder template.

EDIT INSTRUCTION FROM USER:
${instruction}

TARGET TEMPLATE:
- Objective: ${objective}
- Template slug: ${template}
- Video ratio: 9:16 portrait, fixed 1080x1920.

CURRENT schema.json:
${current.schemaJson}

CURRENT demo.json:
${current.demoJson}

CURRENT template.html.tmpl:
${current.templateHtml}

AVAILABLE BLOCK REFS:
${availableBlocks || '(none)'}

AVAILABLE SFX FILES:
${availableSfx || '(none)'}

RETURN ONE JSON OBJECT WITH EXACT KEYS:
{
  "templateId": "${template}",
  "description": "short English description",
  "schemaJson": { ...full updated object... },
  "demoJson": { ...full updated object... },
  "templateHtml": "<section>...</section>"
}

RULES:
- This is an edit, not a new template. Keep templateId exactly "${template}".
- schemaJson.template must be "${template}".
- demoJson.objective must be "${objective}" and demoJson.template must be "${template}".
- demoJson.scenes must contain exactly one scene for preview.
- Return the full updated files, not a patch or explanation.
- Preserve useful existing fields unless the user requested changing them.
- If current templateHtml is only a runtime placeholder <pre data-template-data>, convert it into a real folder-renderable HTML fragment when the user asks for visual/design changes.
- templateHtml must be a fragment, not a full HTML document: start with <section ...> and include internal <style> and optional <script>.
- The section must fill exactly 1080x1920 via position:absolute; inset:0; width:1080px; height:1920px; overflow:hidden.
- Use placeholders such as {{templateData.title}}, {{templateData.subtitle}}, {{templateData.steps.0.title}}. Do not rely on loops or raw JSON parsing.
- If using arrays, reference fixed indexes explicitly: 0, 1, 2, 3.
- Do not use external images unless via placeholder fields.
- Keep HyperFrames style: polished dark/social-video look, crisp hierarchy, safe 9:16 spacing, subtle continuous motion, no text clipping for Vietnamese.
- Use fixed px font sizes, not viewport font scaling.
- Keep important text above the lower subtitle-safe zone; avoid key text below y=1540.
- If using blockRefs, only use names from AVAILABLE BLOCK REFS.
- If the user pasted a block path like src/renderer/hyperframes/blocks/name.html, use the listed ref name for schemaJson.templateData.blockRefs.
- If the user pasted BLOCK_HTML_START/BLOCK_HTML_END content from Catalog Studio, treat it as available source HTML and adapt the useful markup/CSS directly into templateHtml when requested.
- If the user pasted an SFX path like assets/sfx/category/name.mp3, preserve that path in schemaJson.templateData.sfxRefs or sfxFiles when useful.
- Do not use GSAP infinite repeats: never output repeat:-1, repeat: -1, .repeat(-1), or repeat: Infinity. HyperFrames strict rendering rejects infinite GSAP repeats. Prefer CSS infinite animations for ambient background motion, or use finite GSAP repeat values such as repeat: 2.
- Do not animate or set visibility/display on .scene, #scene-1, .clip, or #stage. HyperFrames manages those wrapper elements. Animate only elements inside your returned section.
- Do not include markdown fences or explanations.`;
}

function buildPreviewHtml({ objective, template, mode = 'auto', duration = DEFAULT_DURATION_SEC }) {
  const { schema, scene } = loadDemoScene(objective, template);
  const runtimeNames = runtimeTemplateNames();
  const selectedMode = mode === 'auto' ? (runtimeNames.has(template) ? 'runtime' : 'folder') : mode;
  const html = selectedMode === 'runtime'
    ? composeSceneHTML({ scene: { ...scene }, sceneCount: 1, durationSec: duration })
    : buildFolderHtml({ objective, template, scene, schema, duration });
  return { html, mode: selectedMode };
}

function rewritePreviewAssetUrls(html) {
  return String(html || '').replace(/(["'(])file:\/\/([^"'()]+?)(?=\1|[)"'])/g, (match, prefix, encodedPath) => {
    try {
      const abs = fileURLToPath(`file://${encodedPath}`);
      const safe = assertLocalPreviewFile(abs);
      return `${prefix}/api/local-file?path=${encodeURIComponent(safe)}`;
    } catch {
      return match;
    }
  });
}

function injectTemplatePreviewRunner(html) {
  const runner = `<script>
(function () {
  function revealStaticScene() {
    document.querySelectorAll(".scene, [data-layout], [data-template]").forEach(function (node) {
      node.style.opacity = "1";
      node.style.visibility = "visible";
    });
  }

  function playPreviewTimelines() {
    revealStaticScene();
    Object.values(window.__timelines || {}).forEach(function (timeline) {
      if (!timeline) return;
      try {
        if (typeof timeline.progress === "function") timeline.progress(0);
        if (typeof timeline.play === "function") timeline.play(0);
      } catch {}
    });
  }

  if (document.readyState === "complete") {
    requestAnimationFrame(playPreviewTimelines);
  } else {
    window.addEventListener("load", function () {
      requestAnimationFrame(playPreviewTimelines);
    });
  }
})();
</script>`;

  const source = String(html || '');
  if (source.includes('data-catalog-studio-preview-runner')) return source;
  const taggedRunner = runner.replace('<script>', '<script data-catalog-studio-preview-runner>');
  return /<\/body>/i.test(source)
    ? source.replace(/<\/body>/i, `${taggedRunner}\n</body>`)
    : `${source}\n${taggedRunner}`;
}

function assertLocalPreviewFile(value) {
  const abs = path.resolve(String(value || ''));
  const allowedRoots = [
    PROJECT_ROOT,
    path.join(PROJECT_ROOT, 'sessions'),
    path.join(PROJECT_ROOT, 'uploads'),
    path.join(PROJECT_ROOT, 'assets'),
    CATALOG_ROOT,
  ].map(item => path.resolve(item));
  if (!allowedRoots.some(root => abs === root || abs.startsWith(root + path.sep))) {
    throw Object.assign(new Error('File preview nằm ngoài workspace'), { status: 403 });
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw Object.assign(new Error('Không tìm thấy file preview'), { status: 404 });
  }
  return abs;
}

function createSilentAudio(outputPath, durationSec) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', String(durationSec),
      '-q:a', '9',
      '-acodec', 'libmp3lame',
      outputPath,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', chunk => err += chunk);
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg silent audio failed: ${err.slice(-600)}`)));
  });
}

async function renderTemplateDemo({ objective, template, mode, duration }) {
  const dir = templateDir(objective, template);
  const htmlPath = path.join(dir, 'demo.html');
  const silentPath = path.join(dir, 'demo_silent.mp4');
  const silenceAudioPath = path.join(dir, 'demo_silence.mp3');
  const mp4Path = path.join(dir, 'demo.mp4');
  const { html, mode: selectedMode } = buildPreviewHtml({ objective, template, mode, duration });
  writeText(htmlPath, html);
  await renderSceneVideo(htmlPath, silentPath, Number(duration), () => {});
  await createSilentAudio(silenceAudioPath, Number(duration));
  await mergeSceneAudio(silentPath, silenceAudioPath, mp4Path, htmlPath);
  fs.rmSync(silentPath, { force: true });
  fs.rmSync(silenceAudioPath, { force: true });
  fs.rmSync(path.join(dir, 'hyperframes_demo'), { recursive: true, force: true });
  return { selectedMode, summary: loadTemplateSummary(objective, template) };
}

function sendError(res, error) {
  const status = Number(error?.status) || 500;
  res.status(status).json({ error: error?.message || 'Lỗi không xác định' });
}

app.get('/api/config', (_req, res) => {
  res.json({
    port: PORT,
    catalogRoot: CATALOG_ROOT,
    aiModel: OPENAI_MODEL,
    runtimeTemplates: [...runtimeTemplateNames()].sort(),
  });
});

app.get('/api/library', (_req, res) => {
  try {
    res.json({
      blocks: safeListFilesRecursive(BLOCKS_ROOT)
        .filter(file => BLOCK_EXTS.includes(path.extname(file).toLowerCase()))
        .map(file => blockMeta(file)),
      sfx: safeListFilesRecursive(SFX_ROOT)
        .filter(file => SFX_EXTS.includes(path.extname(file).toLowerCase()))
        .map(file => sfxMeta(file)),
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/blocks/file', (req, res) => {
  try {
    const abs = resolveBlockPath(req.query.file);
    res.json({
      block: blockMeta(req.query.file),
      content: readText(abs),
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/blocks', (req, res) => {
  try {
    const rel = normalizeLibraryRel({
      file: req.body?.file,
      folder: req.body?.folder,
      name: req.body?.name,
      fallback: 'block',
      allowedExts: BLOCK_EXTS,
    });
    assertAllowedExtension(rel, BLOCK_EXTS, 'Block');
    const target = resolveNewLibraryPath(BLOCKS_ROOT, rel);
    if (fs.existsSync(target)) throw Object.assign(new Error('Block đã tồn tại'), { status: 409 });
    writeText(target, req.body?.content ?? `<!-- ${rel} -->\n<div class="custom-block" data-width="1080" data-height="1080">Custom block</div>\n`);
    res.json({ block: blockMeta(rel) });
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/blocks/file', (req, res) => {
  try {
    const currentRel = String(req.body?.file || '').replace(/^\/+/, '');
    let currentAbs = resolveBlockPath(currentRel);
    let nextRel = currentRel;

    if (req.body?.newFile || req.body?.name || req.body?.folder !== undefined) {
      nextRel = normalizeLibraryRel({
        file: req.body?.newFile,
        folder: req.body?.folder,
        name: req.body?.name,
        fallback: path.basename(currentRel),
        allowedExts: BLOCK_EXTS,
      });
      assertAllowedExtension(nextRel, BLOCK_EXTS, 'Block');
      const nextAbs = resolveNewLibraryPath(BLOCKS_ROOT, nextRel);
      if (nextAbs !== currentAbs) {
        if (fs.existsSync(nextAbs)) throw Object.assign(new Error('Tên block mới đã tồn tại'), { status: 409 });
        fs.mkdirSync(path.dirname(nextAbs), { recursive: true });
        fs.renameSync(currentAbs, nextAbs);
        removeEmptyParentDirs(currentAbs, BLOCKS_ROOT);
        currentAbs = nextAbs;
      }
    }

    if (req.body?.content !== undefined) {
      writeText(currentAbs, req.body.content);
    }
    res.json({ block: blockMeta(nextRel) });
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/blocks/file', (req, res) => {
  try {
    if (req.body?.confirm !== true) throw Object.assign(new Error('Cần confirm=true để xoá block'), { status: 400 });
    const abs = resolveBlockPath(req.body?.file);
    fs.rmSync(abs, { force: true });
    removeEmptyParentDirs(abs, BLOCKS_ROOT);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/blocks/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) throw Object.assign(new Error('Thiếu file block'), { status: 400 });
    assertAllowedExtension(req.file.originalname, BLOCK_EXTS, 'Block');
    const fileName = safeLibraryFileName(req.body?.name || req.file.originalname, 'block', BLOCK_EXTS);
    const replace = req.body?.replace === 'true' || req.body?.replace === true;
    const rel = replace
      ? normalizeLibraryRel({ file: fileName, folder: req.body?.folder, fallback: 'block', allowedExts: BLOCK_EXTS })
      : uniqueRelPath(BLOCKS_ROOT, req.body?.folder, fileName);
    const target = resolveNewLibraryPath(BLOCKS_ROOT, rel);
    if (fs.existsSync(target) && !replace) throw Object.assign(new Error('Block đã tồn tại'), { status: 409 });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, req.file.buffer);
    res.json({ block: blockMeta(rel) });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/blocks/preview', (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(blockPreviewHtml(req.query.file));
  } catch (error) {
    res.status(Number(error?.status) || 500).send(`<pre>${escapeHtml(error?.message || 'Lỗi block preview')}</pre>`);
  }
});

app.get('/api/sfx/file', (req, res) => {
  try {
    res.json({ sfx: sfxMeta(req.query.file) });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/sfx/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) throw Object.assign(new Error('Thiếu file SFX'), { status: 400 });
    assertAllowedExtension(req.file.originalname, SFX_EXTS, 'SFX');
    const fileName = safeLibraryFileName(req.body?.name || req.file.originalname, 'sound-effect', SFX_EXTS);
    const replace = req.body?.replace === 'true' || req.body?.replace === true;
    const rel = replace
      ? normalizeLibraryRel({ file: fileName, folder: req.body?.category, fallback: 'sound-effect', allowedExts: SFX_EXTS })
      : uniqueRelPath(SFX_ROOT, req.body?.category, fileName);
    const target = resolveNewLibraryPath(SFX_ROOT, rel);
    if (fs.existsSync(target) && !replace) throw Object.assign(new Error('SFX đã tồn tại'), { status: 409 });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, req.file.buffer);
    res.json({ sfx: sfxMeta(rel) });
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/sfx/file', (req, res) => {
  try {
    const currentRel = String(req.body?.file || '').replace(/^\/+/, '');
    const currentAbs = resolveSfxPath(currentRel);
    const currentExt = path.extname(currentRel).toLowerCase();
    const nextRel = normalizeLibraryRel({
      file: req.body?.newFile,
      folder: req.body?.category,
      name: req.body?.name,
      fallback: path.basename(currentRel),
      allowedExts: [currentExt],
    });
    assertAllowedExtension(nextRel, [currentExt], 'SFX');
    const nextAbs = resolveNewLibraryPath(SFX_ROOT, nextRel);
    if (nextAbs !== currentAbs) {
      if (fs.existsSync(nextAbs)) throw Object.assign(new Error('Tên SFX mới đã tồn tại'), { status: 409 });
      fs.mkdirSync(path.dirname(nextAbs), { recursive: true });
      fs.renameSync(currentAbs, nextAbs);
      removeEmptyParentDirs(currentAbs, SFX_ROOT);
    }
    res.json({ sfx: sfxMeta(nextRel) });
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/sfx/file', (req, res) => {
  try {
    if (req.body?.confirm !== true) throw Object.assign(new Error('Cần confirm=true để xoá SFX'), { status: 400 });
    const abs = resolveSfxPath(req.body?.file);
    fs.rmSync(abs, { force: true });
    removeEmptyParentDirs(abs, SFX_ROOT);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/objectives', (_req, res) => {
  try {
    const objectives = safeListDirs(CATALOG_ROOT).map(loadObjective);
    res.json({ objectives });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/objectives', (req, res) => {
  try {
    const id = toSlug(req.body?.id || req.body?.name, 'objective');
    const dir = objectiveDir(id);
    if (fs.existsSync(dir)) throw Object.assign(new Error('Objective đã tồn tại'), { status: 409 });
    fs.mkdirSync(dir, { recursive: true });
    const meta = {
      id,
      name: String(req.body?.name || id).trim() || id,
      description: String(req.body?.description || '').trim(),
      status: String(req.body?.status || 'empty').trim(),
    };
    writeJson(path.join(dir, 'objective.json'), meta);
    writeText(path.join(dir, 'README.md'), `# ${meta.name}\n\n${meta.description}\n\nStatus: ${meta.status}\n\nTemplate folders live directly inside this objective folder.\n`);
    res.json({ objective: loadObjective(id) });
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/objectives/:objective', (req, res) => {
  try {
    const id = assertObjectiveId(req.params.objective);
    const dir = objectiveDir(id);
    if (!fs.existsSync(dir)) throw Object.assign(new Error('Không tìm thấy objective'), { status: 404 });
    const meta = {
      id,
      name: String(req.body?.name || id).trim() || id,
      description: String(req.body?.description || '').trim(),
      status: String(req.body?.status || 'ready').trim(),
    };
    writeJson(path.join(dir, 'objective.json'), meta);
    if (!fs.existsSync(path.join(dir, 'README.md'))) {
      writeText(path.join(dir, 'README.md'), `# ${meta.name}\n\n${meta.description}\n\nStatus: ${meta.status}\n`);
    }
    res.json({ objective: loadObjective(id) });
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/objectives/:objective', (req, res) => {
  try {
    const id = assertObjectiveId(req.params.objective);
    if (req.body?.confirm !== true) throw Object.assign(new Error('Cần confirm=true để xoá objective'), { status: 400 });
    const dir = objectiveDir(id);
    if (!fs.existsSync(dir)) throw Object.assign(new Error('Không tìm thấy objective'), { status: 404 });
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/objectives/:objective/templates', (req, res) => {
  try {
    const objective = assertObjectiveId(req.params.objective);
    const dir = objectiveDir(objective);
    if (!fs.existsSync(dir)) throw Object.assign(new Error('Không tìm thấy objective'), { status: 404 });
    res.json({ objective: loadObjective(objective), templates: safeListDirs(dir).map(id => loadTemplateSummary(objective, id)) });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/objectives/:objective/templates', (req, res) => {
  try {
    const objective = assertObjectiveId(req.params.objective);
    const template = toSlug(req.body?.template || req.body?.name, 'template');
    const dir = templateDir(objective, template);
    if (!fs.existsSync(objectiveDir(objective))) throw Object.assign(new Error('Không tìm thấy objective'), { status: 404 });
    if (fs.existsSync(dir)) throw Object.assign(new Error('Template đã tồn tại'), { status: 409 });
    fs.mkdirSync(dir, { recursive: true });
    const schema = defaultSchema(objective, template);
    writeJson(path.join(dir, 'schema.json'), schema);
    writeJson(path.join(dir, 'demo.json'), defaultDemo(objective, template, schema));
    writeText(path.join(dir, 'template.html.tmpl'), defaultTemplateHtml(template));
    writeText(path.join(dir, 'demo.html'), buildPreviewHtml({ objective, template, mode: 'folder', duration: DEFAULT_DURATION_SEC }).html);
    if (!fs.existsSync(path.join(dir, 'demo.mp4'))) fs.writeFileSync(path.join(dir, 'demo.mp4'), '');
    res.json({ template: loadTemplateSummary(objective, template) });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/ai/templates', async (req, res) => {
  try {
    const objective = toSlug(req.body?.objective || req.body?.objectiveId || 'explainer', 'explainer');
    const requestedTemplateName = toSlug(req.body?.templateName || req.body?.template || '', '');
    const description = String(req.body?.prompt || req.body?.description || '').trim();
    const renderMp4 = req.body?.renderMp4 === true;

    if (description.length < 12) {
      throw Object.assign(new Error('Hãy nhập mô tả template chi tiết hơn một chút'), { status: 400 });
    }

    ensureObjectiveExists(objective, objective);
    const prompt = buildAiTemplatePrompt({
      objective,
      requestedTemplateName,
      description,
      blocks: safeListFilesRecursive(BLOCKS_ROOT)
        .filter(file => BLOCK_EXTS.includes(path.extname(file).toLowerCase()))
        .map(file => blockMeta(file)),
      sfx: safeListFilesRecursive(SFX_ROOT)
        .filter(file => SFX_EXTS.includes(path.extname(file).toLowerCase()))
        .map(file => sfxMeta(file)),
    });

    const { result, provider } = await callAI({
      prompt,
      isJson: true,
      onLog: msg => console.log(`[Catalog Studio AI] ${msg}`),
    });
    const generated = normalizeAiTemplateResult(result, { objective, requestedTemplateName, prompt: description });
    const dir = templateDir(objective, generated.template);

    if (fs.existsSync(dir)) {
      throw Object.assign(new Error(`Template ${objective}/${generated.template} đã tồn tại. Hãy đổi tên template.`), { status: 409 });
    }

    fs.mkdirSync(dir, { recursive: true });
    writeJson(path.join(dir, 'schema.json'), generated.schema);
    writeJson(path.join(dir, 'demo.json'), generated.demo);
    writeText(path.join(dir, 'template.html.tmpl'), generated.templateHtml);
    writeText(path.join(dir, 'demo.html'), buildPreviewHtml({
      objective,
      template: generated.template,
      mode: 'folder',
      duration: DEFAULT_DURATION_SEC,
    }).html);
    if (!fs.existsSync(path.join(dir, 'demo.mp4'))) fs.writeFileSync(path.join(dir, 'demo.mp4'), '');

    let renderResult = null;
    let renderError = '';
    if (renderMp4) {
      try {
        renderResult = await renderTemplateDemo({
          objective,
          template: generated.template,
          mode: 'folder',
          duration: DEFAULT_DURATION_SEC,
        });
      } catch (error) {
        renderError = error?.message || 'Render MP4 thất bại';
        console.warn(`[Catalog Studio AI] Render MP4 failed for ${objective}/${generated.template}: ${renderError}`);
      }
    }

    res.json({
      ok: true,
      provider,
      model: OPENAI_MODEL,
      objective: loadObjective(objective),
      template: loadTemplateSummary(objective, generated.template),
      rendered: Boolean(renderResult),
      renderError,
      selectedMode: renderResult?.selectedMode || 'folder',
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/ai/templates/:objective/:template/edit', async (req, res) => {
  try {
    const objective = assertObjectiveId(req.params.objective);
    const template = assertTemplateId(req.params.template);
    const instruction = String(req.body?.prompt || req.body?.instruction || '').trim();
    const renderMp4 = req.body?.renderMp4 === true;
    const dir = templateDir(objective, template);

    if (!fs.existsSync(dir)) throw Object.assign(new Error('Không tìm thấy template để sửa'), { status: 404 });
    if (instruction.length < 8) {
      throw Object.assign(new Error('Hãy nhập yêu cầu chỉnh sửa rõ hơn một chút'), { status: 400 });
    }

    const current = {
      schemaJson: String(req.body?.schemaJson ?? readText(path.join(dir, 'schema.json'), '{}')),
      demoJson: String(req.body?.demoJson ?? readText(path.join(dir, 'demo.json'), '{}')),
      templateHtml: String(req.body?.templateHtml ?? readText(path.join(dir, 'template.html.tmpl'), '')),
    };

    // Validate current JSON before sending it to AI so invalid editor state is caught early.
    parseEditedJson('schema.json hiện tại', current.schemaJson);
    parseEditedJson('demo.json hiện tại', current.demoJson);

    const prompt = buildAiEditTemplatePrompt({
      objective,
      template,
      instruction,
      current,
      blocks: safeListFilesRecursive(BLOCKS_ROOT)
        .filter(file => BLOCK_EXTS.includes(path.extname(file).toLowerCase()))
        .map(file => blockMeta(file)),
      sfx: safeListFilesRecursive(SFX_ROOT)
        .filter(file => SFX_EXTS.includes(path.extname(file).toLowerCase()))
        .map(file => sfxMeta(file)),
    });

    const { result, provider } = await callAI({
      prompt,
      isJson: true,
      onLog: msg => console.log(`[Catalog Studio AI Edit] ${msg}`),
    });
    const generated = normalizeAiTemplateResult(result, {
      objective,
      requestedTemplateName: template,
      prompt: instruction,
    });
    generated.schema.template = template;
    generated.demo.objective = objective;
    generated.demo.template = template;
    generated.demo.scenes = generated.demo.scenes.map(scene => ({ ...scene, template }));

    writeJson(path.join(dir, 'schema.json'), generated.schema);
    writeJson(path.join(dir, 'demo.json'), generated.demo);
    writeText(path.join(dir, 'template.html.tmpl'), generated.templateHtml);
    writeText(path.join(dir, 'demo.html'), buildPreviewHtml({
      objective,
      template,
      mode: 'folder',
      duration: DEFAULT_DURATION_SEC,
    }).html);
    if (!fs.existsSync(path.join(dir, 'demo.mp4'))) fs.writeFileSync(path.join(dir, 'demo.mp4'), '');

    let renderResult = null;
    let renderError = '';
    if (renderMp4) {
      try {
        renderResult = await renderTemplateDemo({
          objective,
          template,
          mode: 'folder',
          duration: DEFAULT_DURATION_SEC,
        });
      } catch (error) {
        renderError = error?.message || 'Render MP4 thất bại';
        console.warn(`[Catalog Studio AI Edit] Render MP4 failed for ${objective}/${template}: ${renderError}`);
      }
    }

    res.json({
      ok: true,
      provider,
      model: OPENAI_MODEL,
      template: loadTemplateSummary(objective, template),
      rendered: Boolean(renderResult),
      renderError,
      selectedMode: renderResult?.selectedMode || 'folder',
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/templates/:objective/:template', (req, res) => {
  try {
    const objective = assertObjectiveId(req.params.objective);
    const template = assertTemplateId(req.params.template);
    const dir = templateDir(objective, template);
    if (!fs.existsSync(dir)) throw Object.assign(new Error('Không tìm thấy template'), { status: 404 });
    res.json({
      summary: loadTemplateSummary(objective, template),
      files: {
        schemaJson: readText(path.join(dir, 'schema.json'), '{}'),
        demoJson: readText(path.join(dir, 'demo.json'), '{}'),
        templateHtml: readText(path.join(dir, 'template.html.tmpl'), ''),
      },
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/templates/:objective/:template', (req, res) => {
  try {
    const objective = assertObjectiveId(req.params.objective);
    const template = assertTemplateId(req.params.template);
    const dir = templateDir(objective, template);
    if (!fs.existsSync(dir)) throw Object.assign(new Error('Không tìm thấy template'), { status: 404 });

    const schema = parseEditedJson('schema.json', req.body?.schemaJson);
    const demo = parseEditedJson('demo.json', req.body?.demoJson);
    if (schema.template && toSlug(schema.template) !== template) {
      throw Object.assign(new Error(`schema.template phải khớp folder: ${template}`), { status: 400 });
    }
    if (demo.template && toSlug(demo.template) !== template) {
      throw Object.assign(new Error(`demo.template phải khớp folder: ${template}`), { status: 400 });
    }
    schema.template = template;
    demo.objective = objective;
    demo.template = template;
    if (Array.isArray(demo.scenes)) {
      demo.scenes = demo.scenes.map(scene => ({ ...scene, template }));
    }
    writeJson(path.join(dir, 'schema.json'), schema);
    writeJson(path.join(dir, 'demo.json'), demo);
    writeText(path.join(dir, 'template.html.tmpl'), req.body?.templateHtml ?? '');
    res.json({ summary: loadTemplateSummary(objective, template) });
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/templates/:objective/:template', (req, res) => {
  try {
    const objective = assertObjectiveId(req.params.objective);
    const template = assertTemplateId(req.params.template);
    if (req.body?.confirm !== true) throw Object.assign(new Error('Cần confirm=true để xoá template'), { status: 400 });
    const dir = templateDir(objective, template);
    if (!fs.existsSync(dir)) throw Object.assign(new Error('Không tìm thấy template'), { status: 404 });
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/templates/:objective/:template/demo-html', (req, res) => {
  try {
    const objective = assertObjectiveId(req.params.objective);
    const template = assertTemplateId(req.params.template);
    const htmlPath = path.join(templateDir(objective, template), 'demo.html');
    const html = fs.existsSync(htmlPath)
      ? readText(htmlPath)
      : buildPreviewHtml({ objective, template, mode: 'auto', duration: DEFAULT_DURATION_SEC }).html;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(injectTemplatePreviewRunner(rewritePreviewAssetUrls(html)));
  } catch (error) {
    res.status(Number(error?.status) || 500).send(`<pre>${escapeHtml(error?.message || 'Lỗi preview')}</pre>`);
  }
});

app.get('/api/local-file', (req, res) => {
  try {
    const file = assertLocalPreviewFile(req.query.path);
    res.sendFile(file);
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/templates/:objective/:template/render', async (req, res) => {
  try {
    const objective = assertObjectiveId(req.params.objective);
    const template = assertTemplateId(req.params.template);
    const mode = ['auto', 'runtime', 'folder'].includes(req.body?.mode) ? req.body.mode : 'auto';
    const duration = Math.max(1, Math.min(30, Number(req.body?.durationSec) || DEFAULT_DURATION_SEC));
    const result = await renderTemplateDemo({ objective, template, mode, duration });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/open-path', (req, res) => {
  try {
    const file = req.query.file ? path.resolve(String(req.query.file)) : CATALOG_ROOT;
    assertLocalPreviewFile(fs.statSync(file).isFile() ? file : path.join(file, 'objective.json'));
    res.json({ url: pathToFileURL(file).href });
  } catch (error) {
    sendError(res, error);
  }
});

app.listen(PORT, () => {
  console.log(`Catalog Studio running at http://localhost:${PORT}`);
  console.log(`Catalog root: ${CATALOG_ROOT}`);
});
