// The landing page's live preview: the example bookcase, building itself step by step while it slowly turns.
// Not interactive on purpose: on the landing page a drag or a pinch must scroll the page, not move the model.
import { Viewer } from './viewer/Viewer.js';
import { hardwareReady } from './viewer/parts3d.js';
import { normalizeGuide, isBoard, inBox } from './guide.js';
import { profileSvg } from './actualSize.js';

const $ = id => document.getElementById(id);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let viewer = null, guide = null, step = 0, timer = null, shown = false, onScreen = true;

async function start() {
  if (viewer) return;
  const [g] = await Promise.all([fetch('/examples/bookcase.json').then(r => r.json()), hardwareReady]);
  guide = normalizeGuide(g);
  viewer = new Viewer($('hero-canvas'), $('hero-labels'), { colors: { wood: tok('--wood'), accent: tok('--accent'), edge: tok('--edge') }, reducedMotion: RM });
  viewer.setInsets({ top: 30 }); // room for the step number in the corner
  viewer.hideLoose = true; // only the piece being built, not the boards still on the floor
  viewer.wideOnly = true; // always the whole piece, never the close-up
  viewer.load(guide); viewer.resize(); viewer.setLabels(true);
  viewer.ctrl.enabled = false; // no drag, zoom or tap: the page scrolls past it
  if (!RM) { viewer.ctrl.autoRotate = true; viewer.ctrl.autoRotateSpeed = 0.7; }
  $('hero-prog').innerHTML = guide.steps.map(() => '<i></i>').join('');
  $('hero-name').textContent = guide.product.replace(/\s*\(example\)\s*$/i, '');
  // what is in the box, as the parts list counts it (spares included)
  const qty = board => Object.values(guide.parts).filter(p => inBox(p) && isBoard(p) === board).reduce((n, p) => n + (p.qty || 1), 0);
  $('hero-facts').innerHTML = [`${qty(true)} boards`, `${qty(false)} fittings`, `${guide.steps.length} steps`, guide.time_minutes && `about ${guide.time_minutes} min`].filter(Boolean).map(t => `<span>${t}</span>`).join(' · ');
  // the "What's in our 3D guide" previews use the example's own parts: their pictures, and the cam screw at true size
  try {
    const th = viewer.thumbnails();
    // the placeholder becomes the picture; without one (no WebGL) the plain stock square stays
    document.querySelectorAll('.feats [data-thumb]').forEach(el => { const t = th[el.dataset.thumb]; if (t) { const img = new Image(); img.src = t; img.alt = ''; el.replaceWith(img); } });
  } catch (e) { console.warn('Part pictures not made:', e); }
  const screw = guide.parts['102'] && profileSvg(guide.parts['102']);
  if (screw) $('feat-size').innerHTML = screw;
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe($('hero-stage'));
  document.addEventListener('visibilitychange', sync);
  go(RM ? guide.steps.length : FIRST, true);
  sync();
}
// the loop starts where the frame is joined (steps 1-2 lie flat on the floor and fill the view with boards)
const FIRST = 3;
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function go(s, first) {
  // the wide view of the whole piece, not the build screen's close-up; glide there unless it is the first view
  step = s; viewer.setStep(s, true); viewer.detail = false; viewer.goCam(!!first);
  $('hero-step').innerHTML = `${s}<small>/ ${guide.steps.length}</small>`;
  $('hero-title').textContent = guide.steps[s - 1].title;
  const line = $('hero-title'); line.classList.remove('swap'); void line.offsetWidth; line.classList.add('swap');
  [...$('hero-prog').children].forEach((el, i) => (el.className = i < s - 1 ? 'done' : i === s - 1 ? 'cur' : ''));
  // the parts this step asks for, with the letters and numbers the manual uses
  const need = guide.steps[s - 1].need || [];
  $('hero-parts').innerHTML = need.length
    ? need.map(([id, n]) => `<li><code>${esc(id)}</code>${n} × ${esc(guide.parts[id]?.name || id)}</li>`).join('')
    : '<li class="none">No new parts: join the ones already placed</li>';
}
// next step every few seconds, round and round; still when the visitor prefers less motion
function tick() {
  clearTimeout(timer);
  if (RM || !running()) return;
  timer = setTimeout(() => { go(step >= guide.steps.length ? FIRST : step + 1); tick(); }, 4600);
}
const running = () => shown && onScreen && document.visibilityState === 'visible';
function sync() { if (!viewer) return; viewer.paused = !running(); if (running()) tick(); else clearTimeout(timer); }

export function showLanding(v) {
  shown = v;
  if (v && !viewer) start().catch(e => { console.warn('Preview not shown:', e); $('hero-stage').hidden = true; });
  else { if (v) { viewer.resize(); viewer.goCam(true); } sync(); }
}
