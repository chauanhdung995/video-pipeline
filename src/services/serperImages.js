import fetch from 'node-fetch';
import { SERPER_SCRAPE_API_KEY } from '../config/apiKeys.js';

const SERPER_IMAGES_URL = 'https://google.serper.dev/images';

export async function searchSerperImages(query, { num = 10 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];

  const res = await fetch(SERPER_IMAGES_URL, {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_SCRAPE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q, num: Math.max(1, Math.min(10, Number(num) || 10)) }),
    signal: AbortSignal.timeout(45000),
  });

  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Serper Images trả về dữ liệu không phải JSON: ${raw.slice(0, 200)}`);
  }

  if (!res.ok) {
    const message = data?.message || data?.error || raw || `HTTP ${res.status}`;
    throw new Error(String(message).replaceAll(SERPER_SCRAPE_API_KEY, '***').slice(0, 500));
  }

  return compactSerperImages(data);
}

export function compactSerperImages(data) {
  return (Array.isArray(data?.images) ? data.images : [])
    .map(item => ({
      title: String(item?.title || '').trim().slice(0, 180),
      imageUrl: String(item?.imageUrl || '').trim(),
      imageWidth: Number(item?.imageWidth) || 0,
      imageHeight: Number(item?.imageHeight) || 0,
    }))
    .filter(item => /^https?:\/\//i.test(item.imageUrl))
    .slice(0, 10);
}
