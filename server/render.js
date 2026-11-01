// Renders a guide's 3D model to pictures with a headless browser (web/render.html), for the compare pass.
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Chrome: RENDER_BROWSER, else the newest Chromium that Playwright has downloaded (npx playwright-core install chromium)
function findBrowser() {
  if (process.env.RENDER_BROWSER) return process.env.RENDER_BROWSER;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'), path.join(os.homedir(), '.cache', 'ms-playwright')].filter(Boolean);
  const inside = ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-win64/chrome.exe', 'chrome-win/chrome.exe'];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const dirs = readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of dirs) for (const f of inside) if (existsSync(path.join(root, d, f))) return path.join(root, d, f);
  }
  return null;
}

/** Steps to show: the parts check, then up to `max - 1` steps spread over the guide, always including the last. */
export function pickSteps(n, max = 8) {
  if (n <= max - 1) return [0, ...Array.from({ length: n }, (_, i) => i + 1)];
  const out = new Set([0]);
  for (let i = 1; i < max; i++) out.add(Math.round((i * n) / (max - 1)));
  return [...out].sort((a, b) => a - b);
}

/**
 * Pictures of the guide at a few steps: [{ step, data (base64 JPEG) }].
 * baseUrl serves web/render.html (the Vite dev server, or this server in production).
 */
export async function renderGuide(guide, baseUrl, max = 8) {
  const { chromium } = await import('playwright-core');
  const exe = findBrowser();
  if (!exe) throw new Error('no Chrome for rendering (set RENDER_BROWSER or run: npx playwright-core install chromium)');
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 960, height: 720 }, ignoreHTTPSErrors: true, reducedMotion: 'reduce' })).newPage();
    await page.goto(`${baseUrl}/render.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.renderReady, null, { timeout: 30000 });
    const n = await page.evaluate(g => window.showGuide(g), guide);
    const card = await page.$('#stage-card'), out = [];
    for (const step of pickSteps(n, max)) {
      await page.evaluate(s => window.showStep(s), step);
      out.push({ step, data: (await card.screenshot({ type: 'jpeg', quality: 80 })).toString('base64') });
    }
    return out;
  } finally { await browser.close(); }
}
