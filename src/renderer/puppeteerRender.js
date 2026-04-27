// src/renderer/puppeteerRender.js
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const AR_CONFIGS = {
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
  '1:1':  { w: 1080, h: 1080 },
  '4:5':  { w: 1080, h: 1350 },
};
const FPS = 30;
const fmtMs = ms => ms < 60000 ? `${(ms/1000).toFixed(1)}s` : `${Math.floor(ms/60000)}m${Math.round((ms%60000)/1000)}s`;

function getLaunchOptions() {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  return {
    headless: 'new',
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required'],
  };
}

/**
 * @param {string} htmlPath
 * @param {string} outputVideo
 * @param {number} durationSec
 * @param {(msg:string)=>void} [onLog]
 */
export async function renderSceneVideo(htmlPath, outputVideo, durationSec, onLog, outputAspectRatio = '9:16') {
  const { w: W, h: H } = AR_CONFIGS[outputAspectRatio] || AR_CONFIGS['9:16'];
  const totalFrames = Math.ceil(durationSec * FPS);
  const sceneName   = path.basename(htmlPath, '.html');
  const framesDir   = path.join(path.dirname(outputVideo), `frames_${sceneName}`);
  fs.mkdirSync(framesDir, { recursive: true });

  onLog?.(`Puppeteer: khởi động trình duyệt (${totalFrames} frames @ ${FPS}fps, ${durationSec.toFixed(1)}s)`);
  const t0 = Date.now();

  const browser = await puppeteer.launch(getLaunchOptions());

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

    const client = await page.createCDPSession();
    await client.send('Page.enable');
    await client.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 1 } });

    // Inject time-control BEFORE any page script runs
    await page.evaluateOnNewDocument(() => {
      window.__t = 0;
      window.__rafId = 0;
      window.__rafs = [];
      performance.now = () => window.__t;
      const _origDateNow = Date.now.bind(Date);
      window.__startDate = _origDateNow();
      Date.now = () => window.__startDate + window.__t;
      window.requestAnimationFrame = cb => { const id = ++window.__rafId; window.__rafs.push({ id, cb }); return id; };
      window.cancelAnimationFrame = id => { window.__rafs = window.__rafs.filter(r => r.id !== id); };
    });

    const absHtmlPath = path.resolve(htmlPath);
    onLog?.(`Puppeteer: loading HTML → file://${absHtmlPath}`);
    if (!fs.existsSync(absHtmlPath)) {
      throw new Error(`HTML file not found: ${absHtmlPath}`);
    }

    // Track pending requests to diagnose networkidle0 timeout
    const pendingRequests = new Set();
    page.on('request',  req => pendingRequests.add(req.url()));
    page.on('requestfinished', req => pendingRequests.delete(req.url()));
    page.on('requestfailed',   req => {
      const url = req.url();
      pendingRequests.delete(url);
      onLog?.(`Puppeteer: request FAILED — ${url} (${req.failure()?.errorText})`);
    });

    const tLoad = Date.now();
    try {
      await page.goto(`file://${absHtmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });
    } catch (err) {
      const pending = [...pendingRequests];
      onLog?.(`Puppeteer: navigation timeout sau ${fmtMs(Date.now() - tLoad)} — ${pending.length} request(s) đang chờ:`);
      pending.forEach(u => onLog?.(`  • ${u}`));
      onLog?.(`Puppeteer: thử fallback waitUntil=load...`);
      await page.goto(`file://${absHtmlPath}`, { waitUntil: 'load', timeout: 30000 });
      onLog?.(`Puppeteer: fallback load OK, tiếp tục...`);
    }
    await page.waitForFunction(() => document.fonts.ready, { timeout: 5000 }).catch(e => {
      onLog?.(`Puppeteer: fonts.ready timeout (bỏ qua): ${e.message}`);
    });
    onLog?.(`Puppeteer: HTML loaded | ${fmtMs(Date.now() - tLoad)}`);

    // Prime frame at t=0
    await page.evaluate(() => {
      const rafs = window.__rafs.splice(0);
      rafs.forEach(({ cb }) => { try { cb(0); } catch {} });
    });
    await new Promise(r => setTimeout(r, 200));

    onLog?.(`Puppeteer: capture ${totalFrames} frames...`);
    const tCapture = Date.now();
    const step = 1000 / FPS;
    const logEvery = Math.max(1, Math.ceil(totalFrames / 10));

    for (let i = 0; i < totalFrames; i++) {
      await page.evaluate(t => {
        window.__t = t;
        const rafs = window.__rafs.splice(0);
        rafs.forEach(({ cb }) => { try { cb(t); } catch {} });
      }, i * step);

      const buf = await page.screenshot({ type: 'jpeg', quality: 92, omitBackground: false });
      fs.writeFileSync(path.join(framesDir, `f_${String(i).padStart(6, '0')}.jpg`), buf);

      if ((i + 1) % logEvery === 0 || i === totalFrames - 1) {
        const pct = Math.round(((i + 1) / totalFrames) * 100);
        const elapsed = Date.now() - tCapture;
        const eta = i > 0 ? Math.round((elapsed / (i + 1)) * (totalFrames - i - 1) / 1000) : '?';
        onLog?.(`Capture: ${i + 1}/${totalFrames} frames (${pct}%) | ${fmtMs(elapsed)} | ETA ~${eta}s`);
      }
    }

    await browser.close();
    onLog?.(`✓ Capture xong | ${fmtMs(Date.now() - tCapture)}`);

    // ffmpeg: frames → mp4
    onLog?.(`ffmpeg: encode ${totalFrames} frames → MP4...`);
    const tEncode = Date.now();
    await new Promise((resolve, reject) => {
      const args = [
        '-y', '-framerate', String(FPS),
        '-i', path.join(framesDir, 'f_%06d.jpg'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-r', String(FPS), '-preset', 'veryfast',
        '-vf', `scale=${W}:${H}:flags=lanczos,setsar=1`,
        outputVideo,
      ];
      const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      p.stderr.on('data', d => err += d);
      p.on('close', c => {
        if (c === 0) {
          const mb = (fs.statSync(outputVideo).size / 1024 / 1024).toFixed(1);
          onLog?.(`✓ ffmpeg encode xong: ${mb} MB | ${fmtMs(Date.now() - tEncode)}`);
          resolve();
        } else {
          reject(new Error('ffmpeg frames→mp4: ' + err.slice(-400)));
        }
      });
    });

    fs.rmSync(framesDir, { recursive: true, force: true });
    onLog?.(`✓ Render cảnh xong | tổng ${fmtMs(Date.now() - t0)}`);
  } finally {
    if (browser.connected) await browser.close();
  }
}

export async function renderHtmlStill(htmlPath, outputImage, onLog, outputAspectRatio = '9:16', atMs = 1800) {
  const { w: W, h: H } = AR_CONFIGS[outputAspectRatio] || AR_CONFIGS['9:16'];
  const t0 = Date.now();

  onLog?.(`Puppeteer: khởi động trình duyệt để chụp thumbnail ${W}x${H}`);
  const browser = await puppeteer.launch(getLaunchOptions());

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

    await page.evaluateOnNewDocument(() => {
      window.__t = 0;
      window.__rafId = 0;
      window.__rafs = [];
      performance.now = () => window.__t;
      const _origDateNow = Date.now.bind(Date);
      window.__startDate = _origDateNow();
      Date.now = () => window.__startDate + window.__t;
      window.requestAnimationFrame = cb => { const id = ++window.__rafId; window.__rafs.push({ id, cb }); return id; };
      window.cancelAnimationFrame = id => { window.__rafs = window.__rafs.filter(r => r.id !== id); };
    });

    const absHtmlPath = path.resolve(htmlPath);
    if (!fs.existsSync(absHtmlPath)) throw new Error(`HTML file not found: ${absHtmlPath}`);

    await page.goto(`file://${absHtmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 }).catch(async () => {
      await page.goto(`file://${absHtmlPath}`, { waitUntil: 'load', timeout: 30000 });
    });
    await page.waitForFunction(() => document.fonts.ready, { timeout: 5000 }).catch(() => {});

    await page.evaluate(t => {
      window.__t = t;
      const rafs = window.__rafs.splice(0);
      rafs.forEach(({ cb }) => { try { cb(t); } catch {} });
    }, atMs);

    await new Promise(r => setTimeout(r, 150));
    fs.mkdirSync(path.dirname(outputImage), { recursive: true });
    await page.screenshot({ path: outputImage, type: 'jpeg', quality: 92, omitBackground: false });
    onLog?.(`✓ Đã chụp thumbnail | ${(fs.statSync(outputImage).size / 1024).toFixed(0)} KB | ${fmtMs(Date.now() - t0)}`);
  } finally {
    if (browser.connected) await browser.close();
  }
}
