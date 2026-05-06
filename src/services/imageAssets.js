import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { searchSerperImages } from './serperImages.js';
import { templateNeedsImage } from '../renderer/hyperframesTemplateSchemas.js';

const IMAGE_EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export function sceneImageKeyword(scene = {}) {
  return String(
    scene['keyword-image'] ||
    scene.keywordImage ||
    scene.imageKeyword ||
    scene.templateData?.imageSearch?.q ||
    ''
  ).trim();
}

export function sceneUploadedImageUrl(scene = {}) {
  return String(
    scene['uploaded-image-url'] ||
    scene.uploadedImageUrl ||
    scene.imageUrl ||
    scene.templateData?.image?.src ||
    scene.templateData?.background?.src ||
    ''
  ).trim();
}

export function normalizeUploadedImages(uploadedImages = []) {
  return (Array.isArray(uploadedImages) ? uploadedImages : [])
    .map((item, index) => {
      const src = String(item?.src || item?.url || '').trim();
      if (!src) return null;
      const originalName = String(item?.originalName || item?.name || item?.filename || '').trim();
      const title = String(item?.title || originalName || `uploaded image ${index + 1}`).trim();
      return {
        title,
        name: String(item?.name || title).trim(),
        originalName,
        filename: String(item?.filename || basenameFromSrc(src) || originalName).trim(),
        src,
        path: String(item?.path || '').trim(),
        width: Number(item?.width) || 0,
        height: Number(item?.height) || 0,
        source: 'upload',
      };
    })
    .filter(Boolean);
}

export async function downloadImagesForScenePlans({
  scenes,
  sessionId,
  sessionDir,
  videoObjective = 'mac-dinh',
  uploadedImages = [],
  forceImages = false,
  onLog,
} = {}) {
  const inputScenes = Array.isArray(scenes) ? scenes : [];
  const uploadedPool = normalizeUploadedImages(uploadedImages);
  let changed = false;

  for (const scene of inputScenes) {
    const sceneRequiresImage = forceImages ||
      scene?.imageRequired === true ||
      scene?.requiresImage === true ||
      Boolean(sceneImageKeyword(scene)) ||
      Boolean(sceneUploadedImageUrl(scene)) ||
      templateNeedsImage(scene.template, videoObjective);
    if (!sceneRequiresImage) continue;

    const selectedUpload = findUploadedImage(uploadedPool, sceneUploadedImageUrl(scene));
    if (selectedUpload) {
      scene['uploaded-image-url'] = selectedUpload.src;
      scene.uploadedImageUrl = selectedUpload.src;
      scene['uploaded-image-name'] = selectedUpload.name || selectedUpload.title || selectedUpload.filename || '';
      scene.uploadedImageName = scene['uploaded-image-name'];
      scene.uploadedImageCandidates = [selectedUpload];
      scene.imageCandidates = mergeImageCandidates([selectedUpload], scene.imageCandidates);
      changed = true;
      onLog?.(`Cảnh ${scene.stt}: dùng ảnh upload "${selectedUpload.name || selectedUpload.filename || selectedUpload.src}"`);
      continue;
    }

    const existingKeyword = sceneImageKeyword(scene);
    if (!existingKeyword && uploadedPool.length) {
      scene.uploadedImageCandidates = uploadedPool;
      scene.imageCandidates = mergeImageCandidates(uploadedPool, scene.imageCandidates);
      scene.imageRequired = true;
      changed = true;
      onLog?.(`Cảnh ${scene.stt}: có ${uploadedPool.length} ảnh upload để AI chọn, bỏ qua Serper vì keyword-image rỗng`);
      continue;
    }

    const keyword = existingKeyword || buildFallbackKeyword(scene);
    if (!keyword) continue;

    const imageDir = path.join(sessionDir, 'images', String(scene.stt));
    fs.mkdirSync(imageDir, { recursive: true });

    onLog?.(`Cảnh ${scene.stt}: Serper Images keyword-image "${keyword}"`);
    let results = [];
    try {
      results = await searchSerperImages(keyword, { num: 10 });
    } catch (error) {
      onLog?.(`Cảnh ${scene.stt}: lỗi Serper Images: ${String(error?.message || error).slice(0, 180)}`);
      continue;
    }

    const localImages = [];
    for (const candidate of results) {
      try {
        const local = await downloadImageCandidate(candidate, imageDir, sessionId, scene.stt);
        if (local) localImages.push(local);
      } catch (error) {
        onLog?.(`Cảnh ${scene.stt}: bỏ ảnh lỗi "${candidate.title || candidate.imageUrl}": ${String(error?.message || error).slice(0, 120)}`);
      }
      if (localImages.length >= 8) break;
    }

    scene['keyword-image'] = keyword;
    scene.keywordImage = keyword;
    scene.imageRequired = true;
    scene.imageCandidates = mergeImageCandidates(localImages, scene.imageCandidates);
    changed = true;
    onLog?.(`Cảnh ${scene.stt}: tải được ${localImages.length}/${results.length} ảnh dùng được`);
  }

  return { scenes: inputScenes, changed };
}

async function downloadImageCandidate(candidate, imageDir, sessionId, stt) {
  const url = String(candidate?.imageUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 VideoPipeline/1.0',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentType = String(res.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (contentType && !contentType.startsWith('image/')) throw new Error(`content-type ${contentType}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 2048) throw new Error('file quá nhỏ');

  const ext = IMAGE_EXT_BY_TYPE[contentType] || extFromUrl(url) || '.jpg';
  const filename = uniqueFilename(
    imageDir,
    `${safeImageTitle(candidate.title || 'image')} ${Number(candidate.imageWidth) || 0}x${Number(candidate.imageHeight) || 0}${ext}`
  );
  const filePath = path.join(imageDir, filename);
  fs.writeFileSync(filePath, buffer);

  return {
    title: String(candidate.title || '').trim(),
    src: publicSessionImagePath(sessionId, stt, filename),
    path: filePath,
    width: Number(candidate.imageWidth) || 0,
    height: Number(candidate.imageHeight) || 0,
  };
}

function buildFallbackKeyword(scene = {}) {
  const source = String(scene.voice || '');
  return source
    .replace(/[^\p{L}\p{N}\s%$€£¥₫.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

function publicSessionImagePath(sessionId, stt, filename) {
  return `/sessions/${encodeURIComponent(sessionId)}/images/${encodeURIComponent(String(stt))}/${encodeURIComponent(filename)}`;
}

function findUploadedImage(uploadedImages, src) {
  const wanted = normalizeSrcForCompare(src);
  if (!wanted) return null;
  return uploadedImages.find(item => normalizeSrcForCompare(item.src) === wanted) || null;
}

function mergeImageCandidates(...groups) {
  const merged = [];
  const seen = new Set();
  for (const group of groups) {
    for (const item of Array.isArray(group) ? group : []) {
      const src = String(item?.src || '').trim();
      if (!src || seen.has(src)) continue;
      seen.add(src);
      merged.push(item);
    }
  }
  return merged;
}

function normalizeSrcForCompare(src) {
  const raw = String(src || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, 'http://local');
    return decodeURIComponent(parsed.pathname);
  } catch {
    return raw.split('?')[0].split('#')[0];
  }
}

function basenameFromSrc(src) {
  try {
    return path.basename(new URL(src, 'http://local').pathname);
  } catch {
    return path.basename(String(src || ''));
  }
}

function extFromUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? (ext === '.jpeg' ? '.jpg' : ext) : '';
  } catch {
    return '';
  }
}

function safeImageTitle(value) {
  return String(value || 'image')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[#?%*:|"<>/\\]+/g, ' ')
    .replace(/[^\w\s.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'image';
}

function uniqueFilename(dir, name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let candidate = name;
  let i = 2;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base} ${i}${ext}`;
    i += 1;
  }
  return candidate;
}
