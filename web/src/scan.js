// Scanning: live phone camera (needs https or localhost), photo/video upload, and sending pages to the server.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MAX_PAGES = 30;
let pages = []; // {blob, url} for photos, {blob, pdf: {name, pages}} for a PDF manual
const MAX_PDF_MB = 24; // Claude takes up to 32 MB per request; the PDF grows by a third when encoded
let stream = null, ctl = null, onGuide = null;

export function initScan({ onGuideReady }) { onGuide = onGuideReady; render(); }

function setStatus(msg, kind) {
  const el = $('status'); el.className = 'status' + (kind === 'err' ? ' err' : '');
  el.innerHTML = (kind === 'busy' ? '<span class="spinner"></span>' : '') + `<span></span>`; el.lastChild.textContent = msg;
}

/* ---------- live camera ---------- */
$('cam-start').onclick = async () => {
  if (stream) { stopCamera(); return; }
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('Live camera needs a secure connection. Open the https:// address shown in the terminal, or use Upload.', 'err'); return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false });
    $('video').srcObject = stream; $('camera').hidden = false; $('cam-start').textContent = 'Close camera'; setStatus('');
  } catch (e) {
    setStatus(e.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser settings, or use Upload.' : 'The camera could not start. Use Upload instead.', 'err');
  }
};
function stopCamera() { stream?.getTracks().forEach(t => t.stop()); stream = null; $('camera').hidden = true; $('cam-start').textContent = 'Open camera'; }
$('shutter').onclick = async () => {
  const v = $('video'); if (!v.videoWidth) return;
  if (pages.length >= MAX_PAGES) { setStatus(`Up to ${MAX_PAGES} pages per scan.`, 'err'); return; }
  const blob = await toJpeg(v);
  pages.push({ blob, url: URL.createObjectURL(blob) });
  $('flash').classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => $('flash').classList.remove('on')));
  navigator.vibrate?.(30);
  render();
};

/* ---------- uploads ---------- */
async function toJpeg(src, maxSide = 2000) {
  const isBlob = src instanceof Blob, bmp = isBlob ? await createImageBitmap(src) : src;
  const w = bmp.width || bmp.videoWidth, h = bmp.height || bmp.videoHeight, s = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
}
function signature(img) {
  const c = document.createElement('canvas'); c.width = c.height = 24; const x = c.getContext('2d');
  x.drawImage(img, 0, 0, 24, 24); const d = x.getImageData(0, 0, 24, 24).data, g = [];
  for (let i = 0; i < d.length; i += 4) g.push((d[i] + d[i + 1] + d[i + 2]) / 3);
  return g;
}
async function framesFromVideo(file) {
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto';
  const url = URL.createObjectURL(file); v.src = url;
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('video')); setTimeout(() => rej(new Error('video')), 15000); });
  const dur = isFinite(v.duration) ? v.duration : 10, room = MAX_PAGES - pages.length, samples = Math.min(90, Math.max(4, Math.ceil(dur / 0.6)));
  const out = []; let last = null;
  for (let i = 0; i < samples && out.length < room; i++) {
    v.currentTime = Math.min(dur - 0.05, ((i + 0.5) * dur) / samples);
    await new Promise(r => { v.onseeked = r; setTimeout(r, 2500); });
    const sig = signature(v);
    if (last && sig.reduce((s, val, k) => s + Math.abs(val - last[k]), 0) / sig.length < 9) continue; // same page as before
    last = sig; out.push(await toJpeg(v));
    setStatus(`Pulling pages from the video… ${out.length}`, 'busy');
  }
  URL.revokeObjectURL(url); return out;
}
// Turn a PDF into page pictures in the browser. Used when Claude will not open the PDF itself
// (encrypted or unusual files). Loaded only when needed.
async function pdfToJpegs(file, room) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [], n = Math.min(doc.numPages, room);
  for (let i = 1; i <= n; i++) {
    setStatus(`Turning PDF pages into pictures… ${i} of ${n}`, 'busy');
    const page = await doc.getPage(i), base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(3, 1800 / Math.max(base.width, base.height)) });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: x, viewport: vp }).promise;
    out.push(await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85)));
  }
  return { pages: out, total: doc.numPages };
}

// Rough page count, read from the PDF's own page objects (good enough for a label)
async function pdfPageCount(file) {
  const text = new TextDecoder('latin1').decode(await file.arrayBuffer());
  return (text.match(/\/Type\s*\/Page(?!s)/g) || []).length || null;
}
const isPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

$('files').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of files) {
    if (pages.length >= MAX_PAGES) { setStatus(`Up to ${MAX_PAGES} pages per scan.`, 'err'); break; }
    try {
      if (isPdf(f)) {
        const total = pages.filter(p => p.pdf).reduce((s, p) => s + p.blob.size, 0) + f.size;
        if (total > MAX_PDF_MB * 1024 * 1024) { setStatus(`The PDF is too big. Up to ${MAX_PDF_MB} MB per scan.`, 'err'); continue; }
        pages.push({ blob: f, pdf: { name: f.name, pages: await pdfPageCount(f) } });
        setStatus('');
      } else if (f.type.startsWith('video/')) {
        setStatus('Pulling pages from the video…', 'busy');
        const frames = await framesFromVideo(f);
        frames.forEach(b => pages.push({ blob: b, url: URL.createObjectURL(b) }));
        setStatus(`Added ${frames.length} pages from the video. Remove any blurry ones.`);
      } else {
        let b; try { b = await toJpeg(f); } catch (err) { b = f; }
        pages.push({ blob: b, url: URL.createObjectURL(b) }); setStatus('');
      }
    } catch (err) { setStatus(isPdf(f) ? 'That PDF could not be read.' : f.type.startsWith('video/') ? 'This video could not be read. Try photos of each page.' : 'That image could not be read.', 'err'); }
    render();
  }
});

function render() {
  $('thumbs').innerHTML = pages.map((p, i) => p.pdf
    ? `<div class="thumb pdf"><div class="pdf-tile"><b>PDF</b><small>${esc(p.pdf.name)}</small>${p.pdf.pages ? `<small>${p.pdf.pages} page${p.pdf.pages === 1 ? '' : 's'}</small>` : ''}</div><span>${i + 1}</span><button data-rm="${i}" aria-label="Remove ${esc(p.pdf.name)}">×</button></div>`
    : `<div class="thumb"><img src="${p.url}" alt="Page ${i + 1}"><span>${i + 1}</span><button data-rm="${i}" aria-label="Remove page ${i + 1}">×</button></div>`).join('');
  $('thumbs-empty').hidden = pages.length > 0;
  const n = pages.reduce((s, p) => s + (p.pdf ? p.pdf.pages || 1 : 1), 0);
  $('pages-label').textContent = `Pages · ${n}`;
  $('cam-count').textContent = `${pages.length} page${pages.length === 1 ? '' : 's'}`;
  $('analyze').disabled = !pages.length || !!ctl; $('clear').disabled = !pages.length || !!ctl;
}
$('thumbs').onclick = e => { const i = e.target.dataset?.rm; if (i == null) return; if (pages[i].url) URL.revokeObjectURL(pages[i].url); pages.splice(+i, 1); render(); };
$('clear').onclick = () => { pages.forEach(p => p.url && URL.revokeObjectURL(p.url)); pages = []; setStatus(''); render(); };

/* ---------- send to the server ---------- */
$('analyze').onclick = async () => {
  if (!pages.length || ctl) return;
  let rejected = null;
  stopCamera();
  ctl = new AbortController(); render(); $('stop').hidden = false;
  const n = pages.reduce((s, p) => s + (p.pdf ? p.pdf.pages || 1 : 1), 0);
  setStatus(`Reading ${n} page${n > 1 ? 's' : ''}. This usually takes 1–3 minutes.`, 'busy');
  const fd = new FormData(); pages.forEach((p, i) => fd.append('pages', p.blob, p.pdf ? p.pdf.name : `page-${i + 1}.jpg`));
  try {
    const r = await fetch('/api/analyze', { method: 'POST', body: fd, signal: ctl.signal });
    if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Server error ${r.status}`); }
    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', done = null;
    for (;;) {
      const { value, done: end } = await reader.read(); if (end) break;
      buf += dec.decode(value, { stream: true });
      let nl; while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.type === 'progress') setStatus(msg.phase === 'checking' ? 'Checking the 3D layout and fixing what does not fit…' : msg.phase === 'comparing' ? 'Comparing the 3D model with the drawings…' : msg.steps ? `Writing your guide… ${msg.steps} step${msg.steps > 1 ? 's' : ''} so far` : 'Reading the drawings…', 'busy');
        if (msg.type === 'error') throw Object.assign(new Error(msg.error), { code: msg.code, detail: msg.detail });
        if (msg.type === 'done') done = msg;
      }
    }
    if (!done) throw new Error('The server stopped before the guide was finished.');
    setStatus(`Done: ${done.guide.steps.length} steps.`);
    // start the next scan empty, so old pages are never sent with a different manual
    pages.forEach(p => p.url && URL.revokeObjectURL(p.url)); pages = [];
    onGuide?.(done.guide);
  } catch (e) {
    if (e.code === 'pdf_rejected') rejected = e.detail || 'unknown reason';
    else setStatus(e.name === 'AbortError' ? 'Stopped.' : e.message || 'Something went wrong.', e.name === 'AbortError' ? '' : 'err');
  } finally { ctl = null; $('stop').hidden = true; render(); }
  // Claude would not open the PDF: send its pages as pictures instead (no PDFs are left after this, so it runs once)
  if (rejected != null && await pdfAsPictures(rejected)) $('analyze').click();
};
async function pdfAsPictures(reason) {
  console.warn('Claude rejected the PDF:', reason);
  try {
    const next = [];
    for (const p of pages) {
      if (!p.pdf) { next.push(p); continue; }
      const { pages: imgs, total } = await pdfToJpegs(p.blob, MAX_PAGES - next.length);
      imgs.forEach(b => next.push({ blob: b, url: URL.createObjectURL(b) }));
      if (total > imgs.length) setStatus(`Only the first ${imgs.length} of ${total} PDF pages fit in one scan.`, 'err');
    }
    pages = next; render();
  } catch (err) {
    console.error(err);
    setStatus('This PDF could not be opened. It may be password protected. Upload photos or screenshots of the pages instead.', 'err');
    render(); return false;
  }
  return true;
}
$('stop').onclick = () => ctl?.abort();
export function leaveScan() { stopCamera(); }
