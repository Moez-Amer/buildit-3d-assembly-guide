import './styles.css';
import { normalizeGuide } from './guide.js';
import { initScan, leaveScan } from './scan.js';
import { openGuide, onBuildShown } from './build.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function show(view) {
  $('view-home').hidden = view !== 'home'; $('view-build').hidden = view !== 'build';
  if (view === 'build') { onBuildShown(); requestWake(); } else { leaveScan(); $('mode-tag').hidden = true; }
  scrollTo({ top: 0 });
}

async function loadGuide(id) {
  const url = id === 'example-bookcase' ? '/examples/bookcase.json' : `/api/guides/${encodeURIComponent(id)}`;
  const r = await fetch(url); if (!r.ok) throw new Error('Guide not found');
  return normalizeGuide(await r.json());
}

async function route() {
  const m = location.hash.match(/^#\/guide\/(.+)$/);
  if (!m) { show('home'); listGuides(); return; }
  try { const g = await loadGuide(decodeURIComponent(m[1])); show('build'); openGuide(g); }
  catch (e) { location.hash = ''; }
}
addEventListener('hashchange', route);
$('home-link').onclick = () => (location.hash = '');

async function listGuides() {
  let saved = [];
  try { const r = await fetch('/api/guides'); if (r.ok) saved = await r.json(); } catch (e) { /* server not running */ }
  const items = [{ id: 'example-bookcase', product: 'Bookcase 60 × 100 cm', note: 'Example guide', steps: 9 }, ...saved];
  $('guides').innerHTML = items.map(g => `<button class="gitem" data-id="${esc(g.id)}"><span><b>${esc(g.product)}</b><small>${esc(g.note || new Date(g.created).toLocaleString())} · ${g.steps} steps</small></span><span aria-hidden="true">→</span></button>`).join('');
}
$('guides').onclick = e => { const b = e.target.closest('[data-id]'); if (b) location.hash = `#/guide/${encodeURIComponent(b.dataset.id)}`; };

initScan({ onGuideReady: g => { location.hash = `#/guide/${encodeURIComponent(g.id)}`; } });

// keep the screen on while building
let wake = null;
async function requestWake() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => (wake = null)); } } catch (e) { /* not allowed */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('view-build').hidden) requestWake(); });

route();
