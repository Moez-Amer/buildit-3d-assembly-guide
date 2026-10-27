// Buildwise API server: sends manual pages to Claude and stores the guides it returns.
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYZE_PROMPT, ASK_PROMPT, REPAIR_PROMPT } from './prompt.js';
import { normalizeGuide } from '../web/src/guide.js';
import { checkGuide, countIssues, issueLine } from '../web/src/check.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, 'data', 'guides');
const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const ASK_MODEL = process.env.CLAUDE_ASK_MODEL || 'claude-haiku-5-5';
const REPAIR = process.env.CHECK_REPAIR !== '0'; // second pass that fixes problems the automatic check finds
await mkdir(DATA, { recursive: true });

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 24 * 1024 * 1024, files: 30 } });
app.use(express.json({ limit: '1mb' }));

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const needKey = res => res.status(503).json({ error: 'No Claude API key yet. Add ANTHROPIC_API_KEY to the .env file and restart the server.' });

app.get('/api/health', (_req, res) => res.json({ ok: true, ai: !!client, model: MODEL }));

/* Scan → guide. Streams NDJSON lines: {type:"progress"}, then {type:"done", guide} or {type:"error"}. */
const takePages = (req, res, next) => upload.array('pages', 30)(req, res, err => (err ? res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: friendly(err) }) : next()));
app.post('/api/analyze', takePages, async (req, res) => {
  if (!client) return needKey(res);
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No pages were sent.' });
  res.setHeader('content-type', 'application/x-ndjson'); res.setHeader('cache-control', 'no-cache');
  const send = obj => res.write(JSON.stringify(obj) + '\n');
  send({ type: 'progress', steps: 0 });

  // PDFs go to Claude as documents (sharp drawings, real page numbers); everything else as photos
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

  let aborted = false, stream = null;
  res.on('close', () => { aborted = true; stream?.abort?.(); });
  const ask = async (messages, onText) => {
    stream = client.messages.stream({ model: MODEL, max_tokens: 64000, messages });
    if (onText) stream.on('text', onText);
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new Error('Claude declined to read these photos. Try clearer photos of the manual pages.');
    if (msg.stop_reason === 'max_tokens') throw new Error('The guide was too long to finish. Try fewer pages at once.');
    return msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  };
  try {
    let text = '', lastSent = 0;
    const first = [{ role: 'user', content }];
    const raw = await ask(first, delta => {
      text += delta;
      const steps = (text.match(/"title"\s*:/g) || []).length;
      if (steps !== lastSent) { lastSent = steps; send({ type: 'progress', steps }); }
    });
    if (aborted) return;
    const json = parseJson(raw);
    if (!json) throw new Error('The AI reply was not valid JSON. Try again, or scan fewer pages at once.');
    let guide = normalizeGuide(json), checks = checkGuide(guide), repaired = false;
    const before = countIssues(checks);
    console.log(`analyze: ${guide.steps.length} steps, check: ${before.error} errors, ${before.warn} warnings`);

    // pass 2: ask Claude to fix what the check found; keep the fix only if it is better and keeps the steps
    if (REPAIR && before.error + before.warn > 0) {
      send({ type: 'progress', steps: guide.steps.length, phase: 'checking' });
      try {
        const fixRaw = await ask([...first, { role: 'assistant', content: raw },
          { role: 'user', content: REPAIR_PROMPT(checks.filter(i => i.level !== 'info').map(issueLine)) }]);
        if (aborted) return;
        const fixJson = parseJson(fixRaw);
        if (fixJson) {
          const g2 = normalizeGuide(fixJson), c2 = checkGuide(g2), after = countIssues(c2);
          console.log(`repair: ${after.error} errors, ${after.warn} warnings`);
          if (g2.steps.length === guide.steps.length && (after.error < before.error || (after.error === before.error && after.warn < before.warn))) {
            guide = g2; checks = c2; repaired = true;
          }
        }
      } catch (e) { if (aborted) return; console.warn('repair pass failed:', e.message); }
    }

    guide.id = randomUUID().slice(0, 8);
    const stored = { ...guide, created: new Date().toISOString(), pages: files.length, model: MODEL, check: { ...countIssues(checks), repaired } };
    await writeFile(path.join(DATA, `${guide.id}.json`), JSON.stringify(stored, null, 1));
    send({ type: 'done', guide: stored });
  } catch (e) {
    console.error('analyze failed:', e?.status || '', e?.message);
    const pdfRejected = files.some(isPdf) && e?.status === 400 && /pdf|document/i.test(e?.message || '');
    if (!aborted) send({ type: 'error', error: friendly(e), ...(pdfRejected ? { code: 'pdf_rejected', detail: apiReason(e) } : {}) });
  }
  res.end();
});

app.post('/api/ask', async (req, res) => {
  if (!client) return needKey(res);
  const { question, ...ctx } = req.body || {};
  if (!question) return res.status(400).json({ error: 'Ask a question first.' });
  try {
    const msg = await client.messages.create({ model: ASK_MODEL, max_tokens: 400, messages: [{ role: 'user', content: ASK_PROMPT(ctx, String(question).slice(0, 500)) }] });
    res.json({ answer: msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim() });
  } catch (e) { res.status(502).json({ error: friendly(e) }); }
});

app.get('/api/guides', async (_req, res) => {
  const out = [];
  for (const f of (await readdir(DATA)).filter(f => f.endsWith('.json'))) {
    try { const g = JSON.parse(await readFile(path.join(DATA, f), 'utf8')); out.push({ id: g.id, product: g.product, created: g.created, steps: g.steps.length }); } catch { /* skip broken file */ }
  }
  res.json(out.sort((a, b) => String(b.created).localeCompare(String(a.created))));
});
app.get('/api/guides/:id', async (req, res) => {
  if (!/^[\w-]+$/.test(req.params.id)) return res.status(400).end();
  try { res.type('json').send(await readFile(path.join(DATA, `${req.params.id}.json`), 'utf8')); }
  catch { res.status(404).json({ error: 'Guide not found' }); }
});

// production: serve the built web app
const dist = path.join(here, '..', 'dist');
app.use(express.static(dist));
app.get(/^\/(?!api\/).*/, (_req, res, next) => res.sendFile(path.join(dist, 'index.html'), err => err && next()));

function parseJson(text) {
  const tries = [text, text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1], text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)];
  for (const t of tries) { if (!t) continue; try { return JSON.parse(t); } catch { /* next */ } }
  return null;
}
// the API's own error text, without the SDK's status prefix and JSON wrapper
function apiReason(e) { return String(e?.error?.error?.message || e?.message || 'unknown reason').replace(/^\d{3}\s*/, '').slice(0, 200); }
function friendly(e) {
  const s = e?.status;
  if (s === 401) return 'The Claude API key was rejected. Check ANTHROPIC_API_KEY in .env.';
  if (s === 429) return 'Too many requests to Claude right now. Wait a minute and try again.';
  if (e?.code === 'LIMIT_FILE_SIZE') return 'A file is too big. Up to 24 MB each.';
  if (e?.code === 'LIMIT_FILE_COUNT' || e?.code === 'LIMIT_UNEXPECTED_FILE') return 'Too many files. Up to 30 per scan.';
  if (s === 413 || /too large|too many pages/i.test(e?.message)) return 'Too much at once. Try fewer pages, or split the PDF.';
  if (s === 400 && /pdf|document/i.test(e?.message)) return `Claude could not open that PDF (${apiReason(e)}).`;
  if (s === 529 || s >= 500) return 'Claude is busy right now. Try again in a minute.';
  return e?.message || 'Something went wrong.';
}

app.listen(PORT, () => console.log(`Buildwise API on http://localhost:${PORT}  (AI: ${client ? MODEL : 'off, no API key'})`));
