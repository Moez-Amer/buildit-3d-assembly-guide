// Buildit API server: sends manual pages to the AI model and stores the guides it returns.
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { mkdir, readFile, writeFile, readdir, appendFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYZE_PROMPT, ASK_PROMPT, REPAIR_PROMPT, COMPARE_INTRO, COMPARE_PROMPT } from './prompt.js';
import { renderGuide } from './render.js';
import { scanModel, askModel } from './ai.js';
import { authRoutes, currentUser, requireUser, sameSiteOnly, canScan, isAdmin, limiter, checkConfig, DEV } from './auth.js';
import { db, addGuide, guideRow, guidesOf, knownGuideIds, deleteUser, libraryRows, setLibrary } from './db.js';
import { normalizeGuide } from '../web/src/guide.js';
import { countIssues, issueLine } from '../web/src/check.js';
import { autoFix } from '../web/src/autofix.js';
import { applyEdits, isEditList } from '../web/src/edits.js';
import { getSupabase, supabaseConfigured } from './supabase.js';
import { syncGuide, mirror } from './guide-sync.js';
import { deleteProcessedGuide } from './guide-store.js';
import { saveRatingCloud, deleteRatingsCloud } from './rating-store.js';
import { ratingOf, saveRating, deleteRatingsOfGuide, ratingSummary, ratingComments } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, 'data', 'guides');
const RAW = path.join(here, 'data', 'raw');
const PAGES = path.join(here, 'data', 'pages'); // the manual each guide was made from, to show next to its steps
// the library ("Available manuals") is in the repo, so every copy has it: library/manuals.json, guides/, covers/
const LIB = path.join(here, '..', 'library'), LIB_GUIDES = path.join(LIB, 'guides'), COVERS = path.join(LIB, 'covers');
// a guide's file: server/data when this computer made it, else the library copy
const guideFile = id => { const own = path.join(DATA, `${id}.json`), lib = path.join(LIB_GUIDES, `${id}.json`); return existsSync(own) || !existsSync(lib) ? own : lib; };
const PORT = Number(process.env.PORT || 8787);
const REPAIR = process.env.CHECK_REPAIR !== '0'; // second pass that fixes problems the automatic check finds
// third pass: the model compares pictures of the 3D model with the manual. Off unless RENDER_COMPARE=1: on 14 scans it
// never corrected a real instruction error, and its pictures show the assembly too small to check (frames the loose parts too)
const COMPARE = process.env.RENDER_COMPARE === '1';
checkConfig();
// the library list in the repo decides what is listed: rows for guides this database has not seen, and the names
await (async function seedLibrary() {
  let list = [];
  try { list = JSON.parse(await readFile(path.join(LIB, 'manuals.json'), 'utf8')); } catch { return; }
  for (const m of list) {
    try {
      if (!guideRow(m.id)) addGuide({ ...JSON.parse(await readFile(guideFile(m.id), 'utf8')), public: true }, null);
      setLibrary(m.id, true, { title: m.title, article: m.article ?? null });
    } catch (e) { console.log(`library: ${m.id} left out (${e.message})`); }
  }
})();
await mkdir(DATA, { recursive: true });

// keep a copy of the server's messages in server/data/server.log (scan progress, costs, errors)
const logFile = path.join(here, 'data', 'server.log');
for (const level of ['log', 'warn', 'error']) {
  const print = console[level].bind(console);
  console[level] = (...args) => { print(...args); appendFile(logFile, `${new Date().toISOString()} ${args.join(' ')}\n`).catch(() => {}); };
}
// Validate client settings at startup. The connection test verifies table access.
if (supabaseConfigured()) {
  getSupabase();
  console.log('Supabase guide storage enabled');
} else {
  console.log(
      'Supabase guide storage off: set SUPABASE_URL and SUPABASE_SECRET_KEY to enable it'
  );
}
// guides made before accounts existed belong to nobody: only admins see them
{
  const known = knownGuideIds();
  for (const f of (await readdir(DATA)).filter(f => f.endsWith('.json'))) {
    if (known.has(f.slice(0, -5))) continue;
    try { const g = JSON.parse(await readFile(path.join(DATA, f), 'utf8')); addGuide({ ...g, id: f.slice(0, -5) }, null); } catch { /* broken file */ }
  }
}

const app = express();
app.disable('x-powered-by');
// behind a proxy (Caddy, nginx, a host's load balancer) the visitor's address is in X-Forwarded-For. TRUST_PROXY is the
// number of proxies in front of this server (usually 1). Only a number: "true" would let anyone fake their address.
const hops = process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 0;
if (!Number.isInteger(hops) || hops < 0) { console.error('Not starting: TRUST_PROXY must be a number of proxies, like 1.'); process.exit(1); }
if (hops) app.set('trust proxy', hops);
let warnedProxy = false;
app.use((req, _res, next) => {
  if (!hops && !warnedProxy && req.headers['x-forwarded-for']) { warnedProxy = true; console.warn('Requests come through a proxy but TRUST_PROXY is not set: all visitors share one rate limit.'); }
  next();
});
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()', 'Cross-Origin-Opener-Policy': 'same-origin' });
  if (!DEV) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 24 * 1024 * 1024, files: 60 } });
app.use('/api', express.json({ limit: '1mb' }), sameSiteOnly, currentUser, (_req, res, next) => { res.set('cache-control', 'no-store'); next(); });
authRoutes(app);

const ai = scanModel(), asker = askModel();
const MODEL = ai?.model;
const needKey = res => res.status(503).json({ error: 'No AI API key yet. Add ANTHROPIC_API_KEY (or the SCAN_* settings) to the .env file and restart the server.' });

app.get('/api/health', (_req, res) => res.json({ ok: true, ai: !!ai, ...(DEV ? { model: MODEL } : {}) }));

// who may open a guide: everyone for library guides, the owner, and admins for guides from before accounts.
// Anything else answers "not found", so nobody learns which guide ids exist.
const canView = (user, row) => !!row && (row.public === 1 || (user && (row.owner === user.id || (!row.owner && isAdmin(user)))));
const viewable = (req, res, next) => {
  if (!/^[\w-]+$/.test(req.params.id)) return res.status(400).end();
  if (!canView(req.user, guideRow(req.params.id))) return res.status(404).json({ error: 'Guide not found' });
  next();
};
// the original manual (a third party's document, and what someone photographed at home) stays with whoever scanned
// it. Admins see it only for guides that belong to nobody (from before accounts, and the library); another person's
// manual stays theirs, admin or not. A library guide is open to everyone; the manual it was made from is not.
const ownsGuide = (user, row) => !!(user && row && (row.owner === user.id || (!row.owner && isAdmin(user))));
const manualViewable = (req, res, next) => {
  if (!/^[\w-]+$/.test(req.params.id)) return res.status(400).end();
  if (!ownsGuide(req.user, guideRow(req.params.id))) return res.status(404).end();
  next();
};
const scanning = new Set(); // one scan at a time per account
// the ask box costs money per question: per account, per address, and for the whole site per day (ASK_DAILY_LIMIT)
const asks = limiter(40, 60 * 60e3), askIps = limiter(60, 60 * 60e3), askDay = limiter(Number(process.env.ASK_DAILY_LIMIT) || 500, 864e5);
const MAX_UPLOAD = 80 * 1024 * 1024; // all pages of one scan together

/* Scan → guide. Streams NDJSON lines: {type:"progress"}, then {type:"done", guide} or {type:"error"}. */
const takePages = (req, res, next) => upload.array('pages', 60)(req, res, err => (err ? res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: friendly(err) }) : next()));
app.post('/api/analyze', requireUser, (req, res, next) => {
  if (!canScan(req.user)) return res.status(403).json({ error: 'Scanning your own manual is not open yet.', code: 'no_scan' });
  if (!ai) return needKey(res);
  const size = Number(req.headers['content-length']);
  if (!size) return res.status(411).json({ error: 'The upload had no size. Try again.' });
  if (size > MAX_UPLOAD) return res.status(413).json({ error: 'Too much at once: up to 80 MB per scan. Try fewer pages.' });
  // taken before the upload is read, so two uploads at the same moment cannot both start
  if (scanning.has(req.user.id)) return res.status(409).json({ error: 'A scan is already running for your account. Wait for it to finish.' });
  scanning.add(req.user.id); res.on('close', () => scanning.delete(req.user.id));
  next();
}, takePages, async (req, res) => {
  const user = req.user;
  const files = req.files || [];
  console.log(`analyze: ${files.length} file(s), ${(files.reduce((n, f) => n + f.size, 0) / 1e6).toFixed(1)} MB → ${MODEL}`);
  if (!files.length) return res.status(400).json({ error: 'No pages were sent.' });
  res.setHeader('content-type', 'application/x-ndjson'); res.setHeader('cache-control', 'no-cache');
  const send = obj => res.write(JSON.stringify(obj) + '\n');
  send({ type: 'progress', steps: 0 });

  // PDFs go to the model as documents (sharp drawings, real page numbers); everything else as photos
  const isPdf = f => f.mimetype === 'application/pdf' || /\.pdf$/i.test(f.originalname || '');
  const pdfBytes = files.filter(isPdf).reduce((s, f) => s + f.size, 0);
  if (pdfBytes > 24 * 1024 * 1024) { res.end(JSON.stringify({ type: 'error', error: 'The PDF is too big. Up to 24 MB per scan.' }) + '\n'); return; }
  const content = [];
  let photo = 0;
  files.forEach(f => {
    if (isPdf(f)) {
      if (!f.buffer.subarray(0, 1024).toString('latin1').includes('%PDF')) return;
      content.push({ type: 'text', text: `Manual PDF "${String(f.originalname).slice(0, 80)}":` });
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.buffer.toString('base64') } });
    } else {
      content.push({ type: 'text', text: `Photo ${++photo}:` });
      content.push({ type: 'image', source: { type: 'base64', media_type: f.mimetype === 'image/png' ? 'image/png' : 'image/jpeg', data: f.buffer.toString('base64') } });
    }
  });
  if (!content.length) { res.end(JSON.stringify({ type: 'error', error: 'That PDF could not be read.' }) + '\n'); return; }
  // cache the pages + prompt so the repair pass does not pay for the images twice
  content.push({ type: 'text', text: ANALYZE_PROMPT, cache_control: { type: 'ephemeral' } });

  let aborted = false;
  const stop = new AbortController();
  res.on('close', () => { if (!res.writableFinished) console.log('analyze: the browser closed the connection, scan stopped'); aborted = true; stop.abort(); });
  // what each call cost: tokens from the API's own usage report, priced in server/ai.js
  const calls = [];
  let thinking = 0;
  // every reply is kept in server/data/raw/<scan id>-<pass>.txt, so a scan that fails can be looked at without paying again
  const scanId = randomUUID().replace(/-/g, '').slice(0, 12);
  const keepRaw = (pass, text) => mkdir(RAW, { recursive: true }).then(() => writeFile(path.join(RAW, `${scanId}-${pass}.txt`), text)).catch(() => {});
  const ask = (pass, messages, onText) => ai.ask(messages, { onText, signal: stop.signal, onThink: () => {
    // the model reasons before it writes: show that it is alive (at most every 5 s)
    if (Date.now() - thinking > 5000) { if (!thinking) console.log(`${pass}: model is thinking`); thinking = Date.now(); if (pass === 'read') send({ type: 'progress', steps: 0, phase: 'thinking' }); }
  }, onUsage: u => {
    calls.push({ pass, ...u });
    console.log(`${pass}: ${u.input} in, ${u.cached} cached, ${u.cacheWrite} cache write, ${u.output} out → ${u.usd == null ? 'no price' : '$' + u.usd.toFixed(4)} (${u.source})`);
  } }).then(async text => { await keepRaw(pass, text); return text; });
  let saved = false;
  try {
    let text = '', lastSent = 0;
    const first = [{ role: 'user', content }];
    const raw = await ask('read', first, delta => {
      text += delta;
      const steps = (text.match(/"title"\s*:/g) || []).length;
      if (steps !== lastSent) { lastSent = steps; send({ type: 'progress', steps }); }
    });
    if (aborted) return;
    const json = parseJson(raw);
    if (!json) throw new Error('The AI reply was not valid JSON. Try again, or scan fewer pages at once.');
    // safe corrections in code first (web/src/autofix.js): free, and the AI only sees what is left
    const autofixed = [];
    const tidy = g => { const r = autoFix(g); autofixed.push(...r.fixes); r.fixes.forEach(f => console.log('autofix:', f)); return [r.guide, r.issues]; };
    let [guide, checks] = tidy(normalizeGuide(json)), repaired = false;
    const before = countIssues(checks);
    // Share AI-extracted tools after the first complete, validated response.
    if (guide.tools.length > 0) {
    send({ type: 'tools', tools: guide.tools });
    }
    console.log(`analyze: ${guide.steps.length} steps, check: ${before.error} errors, ${before.warn} warnings`);
    // a repair or compare reply: a list of edits (asked for), or a whole guide (accepted too)
    const readReply = text => {
      const j = parseJson(text);
      if (!j) return null;
      if (!isEditList(j)) return { guide: normalizeGuide(j), how: 'whole guide' };
      const r = applyEdits(guide, j.edits);
      if (r.skipped.length) console.log('edits skipped:', r.skipped.join('; '));
      return { guide: r.guide, how: `${r.applied} edits` };
    };
    // errors first (the list is sorted); a long list is cut so the repair stays short, the rest waits for the next scan
    const issueList = list => {
      const lines = list.filter(i => i.level !== 'info').map(i => `${issueLine(i)}${i.refs.length ? ` [${[...new Set(i.refs)].slice(0, 8).join(', ')}]` : ''}`);
      return lines.length > 60 ? [...lines.slice(0, 60), `... and ${lines.length - 60} more warnings like these: fix the same kind of mistake everywhere it occurs.`] : lines;
    };

    // pass 2: ask the model to fix what is left; keep the fix only if it is better and keeps the steps
    if (REPAIR && before.error + before.warn > 0) {
      send({ type: 'progress', steps: guide.steps.length, phase: 'checking' });
      try {
        const fixRaw = await ask('repair', [...first, { role: 'assistant', content: JSON.stringify(guide) },
          { role: 'user', content: REPAIR_PROMPT(issueList(checks)) }]);
        if (aborted) return;
        const fix = readReply(fixRaw);
        if (fix) {
          const [g2, c2] = tidy(fix.guide), after = countIssues(c2);
          console.log(`repair (${fix.how}): ${after.error} errors, ${after.warn} warnings`);
          if (g2.steps.length === guide.steps.length && (after.error < before.error || (after.error === before.error && after.warn < before.warn))) {
            guide = g2; checks = c2; repaired = true;
          }
        } else console.log('repair: reply was not valid JSON');
      } catch (e) { if (aborted) return; console.warn('repair pass failed:', e.message); }
    }

    // pass 3: render the 3D model and let the model compare it with the drawings; keep the fix only if the check is not worse
    let compared = null;
    if (COMPARE) {
      send({ type: 'progress', steps: guide.steps.length, phase: 'comparing' });
      try {
        const views = await renderGuide(guide, renderBase());
        if (aborted) return;
        const label = v => v.step === 0 ? '3D model: all parts laid out on the floor (parts check).'
          : `3D model at the end of step ${v.step} ("${guide.steps[v.step - 1].title}"${guide.steps[v.step - 1].page != null ? `, manual page ${guide.steps[v.step - 1].page}` : ''}).`;
        const cmpRaw = await ask('compare', [...first, { role: 'assistant', content: JSON.stringify(guide) }, { role: 'user', content: [
          { type: 'text', text: COMPARE_INTRO },
          ...views.flatMap(v => [{ type: 'text', text: label(v) }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: v.data } }]),
          { type: 'text', text: COMPARE_PROMPT }] }]);
        if (aborted) return;
        compared = { views: views.length, changed: false };
        const cmp = /^\s*NO_CHANGES\s*$/.test(cmpRaw) ? null : readReply(cmpRaw);
        if (cmp) {
          const [g3, c3] = tidy(cmp.guide), now = countIssues(checks), after = countIssues(c3);
          console.log(`compare (${cmp.how}): ${after.error} errors, ${after.warn} warnings`);
          // warnings may move (a box becomes a real shape and is checked more closely); errors must not grow
          if (g3.steps.length !== guide.steps.length) compared.dropped = 'different number of steps';
          else if (after.error > now.error) compared.dropped = `more errors (${now.error} → ${after.error})`;
          else { guide = g3; checks = c3; compared.changed = true; }
          if (compared.dropped) console.log('compare: fix dropped,', compared.dropped);
        } else { compared.reply = /NO_CHANGES/.test(cmpRaw) ? 'no changes' : 'not valid JSON'; console.log('compare:', compared.reply); }
      } catch (e) { if (aborted) return; console.warn('compare pass skipped:', e.message); }
    }

    guide.id = scanId;
    delete guide.example; // only the built-in example may hide the accuracy notes, never a scan (or text planted in a manual)
    const total = calls.every(c => c.usd != null) ? Math.round(calls.reduce((s, c) => s + c.usd, 0) * 10000) / 10000 : null;
    console.log(`scan cost: ${total == null ? 'incomplete (a call had no price)' : '$' + total.toFixed(4)}`);
    const stored = { ...guide, created: new Date().toISOString(), pages: files.length, model: MODEL, check: { ...countIssues(checks), autofixed, repaired, compared }, cost: { usd: total, calls } };
    // keep the manual: the PDF itself, or the page pictures when they were made from a PDF (photos are not in page order)
    try {
      const dir = path.join(PAGES, guide.id), pdf = files.find(isPdf);
      if (pdf) { await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, 'manual.pdf'), pdf.buffer); stored.manual = { pdf: true }; }
      else if (req.body?.from_pdf === '1') {
        await mkdir(dir, { recursive: true });
        await Promise.all(files.map((f, i) => writeFile(path.join(dir, `${String(i + 1).padStart(3, '0')}.jpg`), f.buffer)));
        stored.manual = { images: files.length };
      }
    } catch (e) { console.warn('manual pages not saved:', e.message); }
    await writeFile(path.join(DATA, `${guide.id}.json`), JSON.stringify(stored, null, 1));
    // registered last: if the account was deleted while the scan ran, this fails on the missing owner and the
    // files above are removed again (finally, below)
    try { addGuide(stored, user.id); } catch { throw Object.assign(new Error('Your account was deleted, so the guide was not kept.'), { code: 'gone' }); }
    saved = true;
    const shown = isAdmin(user) ? stored : (({ cost, model, check, ...rest }) => rest)(stored);
    send({ type: 'done', guide: shown });
    // the copy in Supabase after the person has their guide: a slow or failed cloud write never holds them up
    mirror(`saved guide ${stored.id}`, () => syncGuide(stored));
  } catch (e) {
    if (!aborted) console.error('analyze failed:', e?.status || '', e?.message, e?.status ? '' : `\n${String(e?.stack || '').split('\n').slice(1, 4).join('\n')}`);
    const pdfRejected = files.some(isPdf) && e?.status === 400 && /pdf|document/i.test(e?.message || '');
    if (!aborted) send({ type: 'error', error: friendly(e), ...(pdfRejected ? { code: 'pdf_rejected', detail: apiReason(e) } : {}) });
  } finally {
    // a scan that did not end in a saved guide (stopped, failed, account gone) leaves nothing behind
    if (!saved) await removeGuide(scanId).catch(() => {});
  }
  res.end();
});

// "Stuck on this step?": the browser sends only the guide, the step and the question; the context comes from the stored guide
app.post('/api/ask', requireUser, async (req, res) => {
  if (!asker) return needKey(res);
  const { guide: id, step, question } = req.body || {};
  if (typeof question !== 'string') return res.status(400).json({ error: 'Ask a question first.' });
  const q = question.trim();
  if (!q) return res.status(400).json({ error: 'Ask a question first.' });
  if (q.length > 500) return res.status(400).json({ error: 'Please keep the question under 500 characters.' });
  if (!asks(req.user.id) || !askIps(req.ip)) return res.status(429).json({ error: 'That is a lot of questions in one hour. Try again a little later.' });
  if (!askDay('all')) { console.warn('ask: daily limit reached'); return res.status(503).json({ error: 'The help box is resting for today. Try again tomorrow.' }); }
  let g;
  try {
    if (id === 'example-bookcase') g = JSON.parse(await readFile(path.join(here, '..', 'web', 'public', 'examples', 'bookcase.json'), 'utf8'));
    else if (typeof id === 'string' && /^[\w-]+$/.test(id) && canView(req.user, guideRow(id))) g = JSON.parse(await readFile(guideFile(id), 'utf8'));
  } catch { /* not found below */ }
  if (!g) return res.status(404).json({ error: 'Guide not found' });
  const n = Math.max(0, Math.min(g.steps.length, Number.parseInt(step, 10) || 0)), s = g.steps[n - 1];
  const ctx = { product: g.product, step_number: n, total_steps: g.steps.length,
    step: s ? { title: s.title, text: s.text, tip: s.tip, warn: s.warn, need: (s.need || []).map(([p, k]) => ({ id: p, qty: k, name: g.parts?.[p]?.name })) } : 'Parts check before building',
    previous: g.steps[n - 2]?.text || null, next: g.steps[n]?.text || null };
  try {
    const answer = await asker.ask([{ role: 'user', content: ASK_PROMPT(ctx, q) }]);
    res.json({ answer: answer.trim() });
  } catch (e) { res.status(502).json({ error: friendly(e) }); }
});

// the signed-in user's guides (admins also see the guides from before accounts)
app.get('/api/guides', requireUser, (req, res) => {
  const own = guidesOf(req.user.id);
  const old = isAdmin(req.user) ? db.prepare('SELECT id, product, steps, created FROM guides WHERE owner IS NULL AND public = 0 ORDER BY created DESC').all() : [];
  res.json([...own, ...old.map(g => ({ ...g, old: true }))]);
});
// library guides ("Available manuals"): free to open, no account needed. One card per guide, read from its file
// (kept until the file changes) plus the example bookcase.
const cards = new Map();
const EXAMPLE = path.join(here, '..', 'web', 'public', 'examples');
async function card(id, file, extra = {}) {
  const { mtimeMs } = await stat(file);
  let c = cards.get(id);
  if (!c || c.mtimeMs !== mtimeMs) {
    const g = JSON.parse(await readFile(file, 'utf8')), parts = Object.values(g.parts || {});
    const count = board => parts.filter(p => (p.kind === 'panel') === board).reduce((n, p) => n + (Number(p.qty) || 1), 0);
    c = { mtimeMs, product: String(g.product || '').replace(/^\s*ok\.\s*/i, ''), summary: g.summary || '', steps: g.steps?.length || 0,
      minutes: Number(g.time_minutes) || null, people: Number(g.people) || null, boards: count(true), fittings: count(false), tools: g.tools || [] };
    cards.set(id, c);
  }
  const { mtimeMs: _m, ...rest } = c;
  return { id, ...rest, ...extra };
}
const coverUrl = async id => { try { return `/api/library/${id}/cover.jpg?v=${Math.round((await stat(path.join(COVERS, `${id}.jpg`))).mtimeMs)}`; } catch { return null; } };
app.get('/api/library', async (_req, res) => {
  const out = [];
  for (const r of libraryRows()) {
    try { out.push(await card(r.id, guideFile(r.id), { title: r.title || null, article: r.article || null, cover: await coverUrl(r.id) })); }
    catch { /* listed, but its file is gone: leave it out */ }
  }
  out.forEach(c => (c.title ||= c.product));
  out.sort((a, b) => a.title.localeCompare(b.title));
  try {
    const ex = await card('example-bookcase', path.join(EXAMPLE, 'bookcase.json'), { example: true, article: null,
      cover: existsSync(path.join(EXAMPLE, 'bookcase-cover.jpg')) ? '/examples/bookcase-cover.jpg' : null });
    out.unshift({ ...ex, title: ex.product.replace(/\s*\(example\)\s*$/i, '') });
  } catch { /* no example */ }
  res.set('Cache-Control', 'no-cache').json(out);
});
app.get('/api/library/:id/cover.jpg', viewable, (req, res) => {
  res.sendFile(path.join(COVERS, `${req.params.id}.jpg`), { maxAge: '30d' }, err => err && res.status(404).end());
});
// delete a guide and the manual it was made from (only the owner)
app.delete('/api/guides/:id', requireUser, async (req, res) => {
  const row = /^[\w-]+$/.test(req.params.id) ? guideRow(req.params.id) : null;
  if (!row || !(row.owner === req.user.id || (!row.owner && !row.public && isAdmin(req.user)))) return res.status(404).json({ error: 'Guide not found' });
  await removeGuide(row.id);
  res.json({ ok: true });
});
// delete the account: its guides, manuals, ratings and sessions
app.delete('/api/me', requireUser, async (req, res) => {
  for (const g of guidesOf(req.user.id)) await removeGuide(g.id);
  deleteUser(req.user); // its ratings go with it (ON DELETE CASCADE)
  const who = req.user.id;
  mirror('deleted the ratings of a deleted account', () => deleteRatingsCloud({ userId: who }));
  res.append('Set-Cookie', '__Host-bi_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  console.log('account deleted');
  res.json({ ok: true });
});
async function removeGuide(id) {
  await rm(path.join(DATA, `${id}.json`), { force: true });
  await rm(path.join(PAGES, id), { recursive: true, force: true });
  // the model's raw replies for this scan (server/data/raw/<id>-<pass>.txt)
  try { for (const f of await readdir(RAW)) if (f.startsWith(`${id}-`)) await rm(path.join(RAW, f), { force: true }); } catch { /* no raw folder */ }
  db.prepare('DELETE FROM guides WHERE id = ?').run(id);
  deleteRatingsOfGuide(id);
  // and the copies in Supabase
  mirror(`deleted guide ${id}`, () => deleteProcessedGuide(id));
  mirror(`deleted the ratings of guide ${id}`, () => deleteRatingsCloud({ guideId: id }));
}

/* ---------- ratings: one per person and guide, changed by saving again ---------- */
// only for a guide the person can open (the example too), and only signed in, so each rating is one real person's
const EXAMPLE_ID = 'example-bookcase';
const rateable = (user, id) => id === EXAMPLE_ID || canView(user, guideRow(id));
const rates = limiter(30, 60 * 60e3); // saves per account per hour
const ratingRoute = (req, res, next) => {
  if (!/^[\w-]{1,64}$/.test(req.params.id) || !rateable(req.user, req.params.id)) return res.status(404).json({ error: 'Guide not found' });
  next();
};
app.get('/api/guides/:id/rating', requireUser, ratingRoute, (req, res) => {
  res.json({ rating: ratingOf(req.params.id, req.user.id) });
});
app.put('/api/guides/:id/rating', requireUser, ratingRoute, async (req, res) => {
  const { stars, comment = '' } = req.body || {};
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return res.status(400).json({ error: 'Choose 1 to 5 stars.' });
  if (typeof comment !== 'string') return res.status(400).json({ error: 'Bad request.' });
  // plain text only: control characters out (line breaks stay), at most 500 characters
  const text = comment.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
  if (text.length > 500) return res.status(400).json({ error: 'Please keep the comment under 500 characters.' });
  if (!rates(req.user.id)) return res.status(429).json({ error: 'That is a lot of ratings in one hour. Try again later.' });
  let g = {};
  try { g = JSON.parse(await readFile(req.params.id === EXAMPLE_ID ? path.join(EXAMPLE, 'bookcase.json') : guideFile(req.params.id), 'utf8')); } catch { /* names stay empty */ }
  const row = saveRating({ guideId: req.params.id, userId: req.user.id, stars, comment: text,
    product: String(g.furniture || g.product || '').slice(0, 100) || null, company: g.company ? String(g.company).slice(0, 60) : null });
  mirror(`saved a rating of guide ${row.guide_id}`, () => saveRatingCloud(row));
  res.json({ rating: { stars: row.stars, comment: row.comment, updated: row.updated } });
});
// all ratings combined, for admins: per guide (count, average, stars) and the newest comments, without who wrote them
app.get('/api/ratings', requireUser, (req, res) => {
  if (!isAdmin(req.user)) return res.status(404).json({ error: 'Not found' });
  res.json({ guides: ratingSummary(), comments: ratingComments() });
});
// the manual a guide was made from: the PDF, or page n as a picture
app.get('/api/guides/:id/manual.pdf', manualViewable, (req, res) => {
  res.sendFile(path.join(PAGES, req.params.id, 'manual.pdf'), err => err && res.status(404).end());
});
app.get('/api/guides/:id/page/:n', manualViewable, (req, res) => {
  if (!/^\d{1,3}$/.test(req.params.n)) return res.status(400).end();
  res.sendFile(path.join(PAGES, req.params.id, `${req.params.n.padStart(3, '0')}.jpg`), err => err && res.status(404).end());
});
app.get('/api/guides/:id', viewable, async (req, res) => {
  try {
    const g = JSON.parse(await readFile(guideFile(req.params.id), 'utf8'));
    // what a scan cost and how the checks went is for admins only
    if (!isAdmin(req.user)) { delete g.cost; delete g.model; delete g.check; }
    if (!ownsGuide(req.user, guideRow(req.params.id))) delete g.manual; // see manualViewable
    res.json(g);
  }
  catch { res.status(404).json({ error: 'Guide not found' }); }
});

// production: serve the built web app
const dist = path.join(here, '..', 'dist');
// where the compare pass loads web/render.html: this server once the app is built, else the Vite dev server
const renderBase = () => process.env.RENDER_URL || (existsSync(path.join(dist, 'render.html')) ? `http://localhost:${PORT}` : `https://localhost:${process.env.WEB_PORT || 5173}`);
// the page itself: only our own scripts; styles inline (the step card sets a few); pictures from data:/blob: URLs
const CSP = ["default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'",
  "font-src 'self'", "img-src 'self' data: blob:", "media-src 'self' blob:", "connect-src 'self' blob: data:",
  "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
app.use((req, res, next) => { if (!req.path.startsWith('/api/')) res.set('Content-Security-Policy', CSP); next(); });
app.use(express.static(dist));
app.get(/^\/(?!api\/).*/, (_req, res, next) => res.sendFile(path.join(dist, 'index.html'), err => err && next()));

// anything that throws: a short JSON answer, never the stack trace
app.use((err, _req, res, _next) => {
  console.error('request failed:', err?.message);
  if (res.headersSent) return res.end();
  const s = err?.status && err.status < 500 ? err.status : 500;
  res.status(s).json({ error: s === 413 ? 'That is too large.' : s === 400 ? 'Bad request.' : 'Something went wrong.' });
});

function parseJson(text) {
  const tries = [text, text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1], text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)];
  for (const t of tries) { if (!t) continue; try { return JSON.parse(t); } catch { /* next */ } }
  return null;
}
// the API's own error text, without the SDK's status prefix and JSON wrapper
function apiReason(e) { return String(e?.error?.error?.message || e?.message || 'unknown reason').replace(/^\d{3}\s*/, '').slice(0, 200); }
function friendly(e) {
  const s = e?.status;
  if (s === 401) return e?.where ? `${e.where} rejected the key (${apiReason(e)}). Check SCAN_API_KEY in .env.` : 'Claude rejected the key. Check ANTHROPIC_API_KEY in .env.';
  if (s === 402) return 'The AI account is out of credit. Top it up and try again.';
  if (s === 429) return 'Too many requests to the AI right now. Wait a minute and try again.';
  if (e?.code === 'LIMIT_FILE_SIZE') return 'A file is too big. Up to 24 MB each.';
  if (e?.code === 'LIMIT_FILE_COUNT' || e?.code === 'LIMIT_UNEXPECTED_FILE') return 'Too many files. Up to 60 per scan.';
  if (s === 413 || /too large|too many pages/i.test(e?.message)) return 'Too much at once. Try fewer pages, or split the PDF.';
  if (s === 400 && /pdf|document/i.test(e?.message)) return `The AI could not open that PDF (${apiReason(e)}).`;
  if (s === 529 || s >= 500) return 'The AI is busy right now. Try again in a minute.';
  return e?.message || 'Something went wrong.';
}

app.listen(PORT, () => console.log(`Buildit API on http://localhost:${PORT}  (AI: ${ai ? MODEL : 'off, no API key'})`))
  .on('error', e => {
    // usually a Buildit server that is still running in another terminal
    if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use: Buildit is probably still running somewhere else. Stop it (Ctrl+C in that terminal, or: lsof -ti :${PORT} | xargs kill) and start again.`);
    else console.error('Server could not start:', e.message);
    process.exit(1);
  });
