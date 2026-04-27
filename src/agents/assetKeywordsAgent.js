// src/agents/assetKeywordsAgent.js — Bước B2.5
// Một AI call: đọc toàn bộ script → trả về keywords per scene (brand assets)
// + keywords chung cho SFX + keywords chung cho BGM.
import { callAI } from '../services/aiRouter.js';

/**
 * @param {{
 *   script: Array<{stt:number, voice:string, visual:string}>,
 *   keys: object,
 *   onLog?: (msg:string)=>void
 * }} opts
 * @returns {Promise<{
 *   brand_assets: Record<string, string[]>,
 *   sfx_keywords: string[],
 *   bgm_keywords: string[]
 * }>}
 */
export async function extractAssetKeywords({ script, keys, onLog }) {
  const sceneSummary = script.map(sc =>
    `Scene ${sc.stt}:\n  Voice: "${sc.voice}"\n  Visual: "${sc.visual}"`
  ).join('\n\n');

  const prompt = `You are a media asset coordinator for a short-form Vietnamese news/finance video.
Analyze the following video script and return keyword suggestions for finding matching media assets.

Script:
${sceneSummary}

Return a JSON object with exactly these three keys:

1. "brand_assets": object where each key is a scene number (string) and value is an array of up to 5 English keywords to search for relevant brand/background assets for that scene.

BRAND ASSET LIBRARY — two types of files, naming conventions below:

TYPE A — CHARACTER (mascot named "ema"):
Files follow pattern: "character ema [emotion/action].png"
Keyword = the emotion or action word(s) in the filename.
Available emotions/actions in the library:
  unbelievable, smiling, sad, cold shivering, begging, suspicious, explaining,
  secret, crying, throwing money, oxygen, cheerful talking, magnifying, thinking,
  anger, glasses, panicking, market crash, enlightened, phone market, praying, surprise
→ When the scene has a character reaction, pick 1-2 emotion/action words from this list.
  Example: scene about market crash → ["panicking", "market crash"]
  Example: scene about good news → ["smiling", "cheerful"]
  Example: scene about a confusing concept → ["thinking", "unbelievable"]

TYPE B — BACKGROUND / VIDEO / GIF:
Files follow pattern: "[descriptive concept] background" (the word "background" appears at the end).
→ Use concept words that would appear in background filenames: "background" + relevant theme.
  Example: scene about blockchain → ["blockchain background", "crypto background"]
  Example: scene about data/charts → ["chart background", "data background"]
  Example: scene about city/street → ["city background"]

For each scene, suggest a MIX of both types when relevant (e.g. 2 character keywords + 2 background keywords).

2. "sfx_keywords": array of up to 5 English keywords for searching sound effects across the entire video. Think about sounds that match key moments: transitions, emphasis, theme sounds.

3. "bgm_keywords": array of up to 3 English keywords for searching background music. Pick keywords that match the overall mood/tone of the video using vocabulary from the BGM library below.

BGM LIBRARY — 8 categories (pick keywords from these names):
- Minimal/chill background: "minimal" "chill" "clean"
- Market volatility/tension: "volatility" "tension" "trading" "cinematic"
- AI/fintech/futuristic: "fintech" "futuristic" "digital" "technology"
- Dark/hack/scam/risk: "dark" "cyberpunk" "suspense" "glitch" "risk"
- Long-term investment/calm: "investment" "calm" "stable" "wealth"
- News/update/neutral: "news" "broadcast" "neutral" "update"
- Cyberpunk/hardcore/neon: "neon" "immersive" "hardcore"
- Data/chart/dashboard: "dashboard" "analysis" "chart" "data"

Rules:
- All keywords must be in English
- Keywords should be single words or short 2-word phrases
- For brand/SFX keywords: descriptive, matching likely filenames
- For bgm_keywords: use vocabulary from the BGM library above (e.g. "volatility", "cyberpunk", "minimal" — NOT generic music terms like "upbeat", "piano", "fast")

Example output format (for a video about crypto market crash):
{
  "brand_assets": {
    "1": ["thinking", "suspicious", "crypto background"],
    "2": ["panicking", "market crash", "chart background"],
    "3": ["crying", "sad", "dark background"],
    "4": ["smiling", "throwing money", "city background"],
    "5": ["cheerful", "phone market", "blockchain background"]
  },
  "sfx_keywords": ["click", "whoosh", "coin", "alert", "typing"],
  "bgm_keywords": ["volatility", "cinematic", "trading"]
}`;

  const { result } = await callAI({ prompt, isJson: true, keys, onLog });

  // Validate + normalize
  const brandAssets = {};
  for (const sc of script) {
    const k = String(sc.stt);
    const raw = result?.brand_assets?.[k] ?? result?.brand_assets?.[sc.stt] ?? [];
    brandAssets[k] = Array.isArray(raw) ? raw.slice(0, 5).map(String) : [];
  }

  const sfxKeywords = Array.isArray(result?.sfx_keywords)
    ? result.sfx_keywords.slice(0, 5).map(String) : [];
  const bgmKeywords = Array.isArray(result?.bgm_keywords)
    ? result.bgm_keywords.slice(0, 3).map(String) : [];

  onLog?.(`Keywords brand: ${Object.values(brandAssets).flat().join(', ')}`);
  onLog?.(`Keywords SFX: ${sfxKeywords.join(', ')} | BGM: ${bgmKeywords.join(', ')}`);

  return { brand_assets: brandAssets, sfx_keywords: sfxKeywords, bgm_keywords: bgmKeywords };
}
