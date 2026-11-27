// The library ("Available manuals" on the website): guides anyone can open without an account.
// It lives in the repo, so every copy of the project has it: library/manuals.json (the list: id, title, article),
// library/guides/<id>.json (the guides) and library/covers/<id>.jpg (a picture of each finished piece).
// The server reads the list at start (seedLibrary in server/index.js).
//   node scripts/library.mjs                                   list the library and the guides not in it
//   node scripts/library.mjs add <id> [--title "…"] [--article "…"]   copy a guide from server/data into the library
//   node scripts/library.mjs remove <id>                       take it out (the guide in server/data stays)
//   node scripts/library.mjs covers [id …]                     cover pictures of the finished pieces (npm run dev must run)
// A library guide is public: what the scan cost, the model, the check report and the link to the original manual are
// left out, and the original manual itself never goes in.
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, setLibrary, guideRow, addGuide } from '../server/db.js';
import { findBrowser } from '../server/render.js';
import { supabaseConfigured } from '../server/supabase.js';
import { setProcessedGuidePublic } from '../server/guide-store.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(root, 'server', 'data', 'guides');
const LIB = path.join(root, 'library'), LIB_GUIDES = path.join(LIB, 'guides'), LIB_COVERS = path.join(LIB, 'covers'), LIST = path.join(LIB, 'manuals.json');
const [cmd, ...rest] = process.argv.slice(2);
// the copy in Supabase (server/guide-sync.js) gets the same public setting, when Supabase is set up
async function cloudPublic(id, on) {
  if (!supabaseConfigured()) return;
  try { await setProcessedGuidePublic(id, on); } catch (e) { console.log(`Supabase not updated: ${e.message}`); }
}
const flag = name => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const ids = rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--'));

const readList = async () => { try { return JSON.parse(await readFile(LIST, 'utf8')); } catch { return []; } };
const writeList = list => writeFile(LIST, JSON.stringify(list.sort((a, b) => a.title.localeCompare(b.title)), null, 2) + '\n');
// the guide's own file: server/data when this computer made it, else the library copy
const guideFile = id => [path.join(DATA, `${id}.json`), path.join(LIB_GUIDES, `${id}.json`)].find(existsSync);

/** A guide as stored in the library: without the admin-only fields, one part, board, fitting or step per line (readable diffs). */
function libraryJson(g) {
  const { cost, model, check, manual, ...pub } = g;
  const line = v => JSON.stringify(v);
  const field = ([k, v]) => {
    if (Array.isArray(v) && v.some(x => x && typeof x === 'object')) return `  ${line(k)}: [\n${v.map(x => `    ${line(x)}`).join(',\n')}\n  ]`;
    if (k === 'parts' && v && typeof v === 'object') return `  ${line(k)}: {\n${Object.entries(v).map(([id, p]) => `    ${line(id)}: ${line(p)}`).join(',\n')}\n  }`;
    return `  ${line(k)}: ${line(v)}`;
  };
  return `{\n${Object.entries(pub).map(field).join(',\n')}\n}\n`;
}

if (!cmd) {
  const list = await readList();
  console.log(`In the library (${list.length}):`);
  for (const m of list) console.log(`  ${m.id.padEnd(12)} ${m.title}${m.article ? `  [${m.article}]` : ''}${existsSync(path.join(LIB_COVERS, `${m.id}.jpg`)) ? '' : '  (no cover yet)'}`);
  const listed = new Set(list.map(m => m.id));
  const others = db.prepare('SELECT id, product, steps, created FROM guides ORDER BY product').all().filter(r => !listed.has(r.id));
  console.log(`\nOther guides on this computer (${others.length}):`);
  for (const r of others) console.log(`  ${r.id.padEnd(12)} ${String(r.steps).padStart(3)} steps  ${(r.created || '').slice(0, 10)}  ${r.product}`);
} else if (cmd === 'add') {
  if (ids.length !== 1) { console.log('Usage: node scripts/library.mjs add <id> [--title "…"] [--article "…"]'); process.exit(1); }
  const id = ids[0], file = guideFile(id);
  if (!file) { console.log(`No guide ${id} in server/data/guides or library/guides.`); process.exit(1); }
  const g = JSON.parse(await readFile(file, 'utf8'));
  await mkdir(LIB_GUIDES, { recursive: true });
  await writeFile(path.join(LIB_GUIDES, `${id}.json`), libraryJson(g));
  const list = (await readList()).filter(m => m.id !== id), old = (await readList()).find(m => m.id === id);
  const title = flag('title') || old?.title || String(g.product || id).replace(/^\s*ok\.\s*/i, ''), article = flag('article') ?? old?.article ?? null;
  list.push({ id, title, ...(article ? { article } : {}) });
  await writeList(list);
  if (!guideRow(id)) addGuide({ ...g, public: true }, null);
  setLibrary(id, true, { title, article });
  await cloudPublic(id, true);
  console.log(`Added ${id} as "${title}". Make its cover: node scripts/library.mjs covers ${id}`);
} else if (cmd === 'remove') {
  if (ids.length !== 1) { console.log('Usage: node scripts/library.mjs remove <id>'); process.exit(1); }
  const id = ids[0];
  await writeList((await readList()).filter(m => m.id !== id));
  await rm(path.join(LIB_GUIDES, `${id}.json`), { force: true });
  await rm(path.join(LIB_COVERS, `${id}.jpg`), { force: true });
  setLibrary(id, false);
  await cloudPublic(id, false);
  console.log(`Removed ${id} from the library.`);
} else if (cmd === 'covers') {
  await covers(ids.length ? ids : [...(await readList()).map(m => m.id), 'example-bookcase']);
} else {
  console.log('Commands: (none) | add <id> | remove <id> | covers [id …]'); process.exit(1);
}

// renders each guide's finished piece on label stock, with web/render.html in a headless Chrome
async function covers(list) {
  const { chromium } = await import('playwright-core');
  const exe = findBrowser();
  if (!exe) { console.log('No Chrome found. Set RENDER_BROWSER or run: npx playwright-core install chromium'); process.exit(1); }
  const base = process.env.XCHECK_URL || `https://localhost:${process.env.WEB_PORT || 5173}`;
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 960, height: 720 }, ignoreHTTPSErrors: true, reducedMotion: 'reduce' })).newPage();
    page.on('pageerror', e => console.log('page error:', e.message));
    try { await page.goto(`${base}/render.html`, { waitUntil: 'domcontentloaded', timeout: 15000 }); }
    catch { console.log(`Nothing answers at ${base}. Start the app first: npm run dev`); process.exit(1); }
    await page.waitForFunction(() => window.renderReady, null, { timeout: 30000 });
    // the card shows the picture on label stock: same colour here, so the edges do not show
    await page.evaluate(() => {
      const card = document.getElementById('stage-card');
      document.body.style.background = card.style.background = '#F6F3EC';
      card.style.height = '720px'; dispatchEvent(new Event('resize')); // the stage fills its card; give the card its size
    });
    await mkdir(LIB_COVERS, { recursive: true });
    for (const id of list) {
      const example = id === 'example-bookcase';
      const file = example ? path.join(root, 'web', 'public', 'examples', 'bookcase.json') : guideFile(id);
      if (!file) { console.log(`skip ${id}: no guide file`); continue; }
      await page.evaluate(g => window.showGuide(g), JSON.parse(await readFile(file, 'utf8')));
      await page.evaluate(() => window.showFinished());
      const jpg = await page.locator('#stage-card').screenshot({ type: 'jpeg', quality: 82 });
      await writeFile(example ? path.join(root, 'web', 'public', 'examples', 'bookcase-cover.jpg') : path.join(LIB_COVERS, `${id}.jpg`), jpg);
      console.log(`cover ${id}: ${Math.round(jpg.length / 1024)} KB`);
    }
  } finally { await browser.close(); }
}
