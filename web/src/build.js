// The build screen: top bar with Parts · Build · Done, the 3D stage, and the step panel with its fixed next-step button.
import { Viewer } from './viewer/Viewer.js';
import { furnitureDimensions } from './furnitureDimensions.js';
import { hardwareReady } from './viewer/parts3d.js';
import { PANEL, firstUse } from './guide.js';
import { checkGuide } from './check.js';
import { openActual, hasProfile } from './actualSize.js';
import { manualPage, pageNumber, hasManual } from './manual.js';
import { api } from './api.js';
import { currentUser } from './account.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const colors = () => ({ wood: tok('--wood'), accent: tok('--accent'), edge: tok('--edge') });
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TOUCH = matchMedia('(pointer: coarse)').matches;
const ICON_WARN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>';
const ICON_TIP = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/></svg>';
const ICON_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

let viewer = null, guide = null, cur = 0, done = false, thumbs = {}, first = {}, issues = [], ticks = new Set();

function sizeText(p) {
  if (p.kind === PANEL && p.size_mm) { const s = p.size_mm.slice().sort((a, b) => b - a); return `${p.shape ? 'about ' : ''}${s.map(v => Math.round(v)).join(' × ')} mm`; }
  const r = v => Math.round(v * 10) / 10;
  if (p.kind === 'washer' && p.d_mm) return `${r(p.d_mm)} mm across`;
  if (p.d_mm && p.len_mm) return `${r(p.d_mm)} × ${r(p.len_mm)} mm`;
  if (p.len_mm) return `${r(p.len_mm)} mm long`;
  return '';
}
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } } };

let modelsLoaded = false;
export function openGuide(g) {
  // the hardware models load once (a small file); the first guide waits for them, at most a moment
  if (!modelsLoaded) { hardwareReady.then(() => { modelsLoaded = true; openGuide(g); }); return; }
  guide = g; first = firstUse(g); done = false;
  // carry on where you stopped last time
  cur = 0; const s = parseInt(store.get('bw-step-' + g.id), 10); if (s > 0 && s <= g.steps.length) cur = s;
  try { ticks = new Set(JSON.parse(store.get('bi-ticks-' + g.id) || '[]')); } catch { ticks = new Set(); }
  try { issues = checkGuide(g).filter(i => i.level !== 'info'); } catch (e) { issues = []; console.warn('Guide check failed', e); }
  if (!viewer) {
    viewer = new Viewer($('stage'), $('labels'), { colors: colors(), reducedMotion: RM });
    if (import.meta.env.DEV) window.builditViewer = viewer; // for the performance and screenshot tests
    viewer.onPick = part => (part ? showInfo(part) : ($('info').hidden = true));
    viewer.onMove = () => { viewer.ctrl.autoRotate = false; $('z-fit').classList.add('moved'); };
  }
  viewer.resize();
  viewer.load(g);
  thumbs = viewer.thumbnails();
  $('p-name').textContent = g.example ? g.product.replace(/\s*\(example\)\s*$/i, '') : g.product;
  const m = [`${g.steps.length} steps`];
  if (g.time_minutes) m.push(`about ${g.time_minutes} min`);
  if (g.people >= 2) m.push('2 people needed');
  $('p-meta').textContent = m.join(' · ');
  $('mode-tag').hidden = !g.example;
  const signedIn = !!currentUser();
  $('ask-signin').hidden = signedIn; $('ask-form').hidden = !signedIn;
  renderBench();
  showCoach();
  render();
}

// the camera frames the model in the part of the stage that the legend, tool buttons and tip do not cover
function layoutStage() {
  if (!viewer) return;
  const st = $('stage-card').getBoundingClientRect(); if (!st.height) return;
  const lg = $('hud2'), top = Math.max(16, lg.hidden ? 0 : lg.getBoundingClientRect().bottom - st.top) + 8;
  const lows = [...$('stage-card').querySelectorAll('.tools, .zoom')];
  if (!$('hint').hidden && $('hint').parentElement === $('stage-card')) lows.push($('hint'));
  const bottom = st.bottom - Math.min(...lows.map(e => e.getBoundingClientRect().top)) + 8;
  viewer.setInsets({ top, bottom });
}
// on phones the tip sits at the top of the step panel instead of over the model
const narrow = matchMedia('(max-width: 959px)');
function placeCoach() {
  const h = $('hint');
  if (narrow.matches) { if (h.parentElement !== $('side-body')) $('side-body').prepend(h); }
  else if (h.parentElement !== $('stage-card')) $('stage-card').insertBefore(h, $('stage-card').querySelector('.tools'));
}
const reframe = () => { placeCoach(); layoutStage(); if (viewer && guide && !viewer.moved) viewer.goCam(true); };
narrow.addEventListener?.('change', reframe);
addEventListener('resize', () => { if (!$('view-build').hidden) reframe(); });

// "The 3D view may be wrong here": problems the automatic check found in this step (or in the whole guide, at step 0)
function checkBox(step) {
  const list = issues.filter(i => (step === 0 ? i.step == null : i.step === step));
  if (!list.length) return '';
  const head = step === 0 ? 'The automatic check found problems in this guide. Compare each step with the paper manual.'
    : 'The 3D view may be wrong in this step. Follow the paper manual if they differ.';
  const items = list.map(i => `<li>${esc(i.msg)}${i.count > 1 ? ` (${i.count} times)` : ''}</li>`).join('');
  return `<div class="callout check">${ICON_WARN}<div><span>${head}</span><details><summary>What looks wrong</summary><ul>${items}</ul></details></div></div>`;
}

// one part as a row: picture, the manual's letter or number, name and size, count
const partRow = (id, q, tag = 'button') => {
  const p = guide.parts[id] || {}, sz = sizeText(p);
  return `<${tag} class="npart" data-find="${esc(id)}"${tag === 'button' ? ` aria-label="Show ${esc(id)}, ${esc(p.name)} in 3D"` : ''}>${thumbs[id] ? `<img src="${thumbs[id]}" alt="">` : '<span class="noimg"></span>'}<code>${esc(id)}</code><span class="nm"><b>${esc(p.name)}</b>${sz ? `<small>${sz}</small>` : ''}</span><span class="q">${q}×</span></${tag}>`;
};

function preparationInfo() {
  const dimensions = furnitureDimensions(guide);
  const tools = Array.isArray(guide.tools)
    ? guide.tools.filter(t => typeof t === 'string' && t.trim())
    : [];

  if (!dimensions && !tools.length) return '';

  let html = '<section class="prep-info">';

  if (dimensions) {
    const d = dimensions;
    html += `
      <h3>Furniture dimensions</h3>
      <p><strong>Width × Height × Depth:</strong>
        ${d.width_cm} × ${d.height_cm} × ${d.depth_cm} cm</p>
      <p><strong>Wall projection:</strong> ${d.wall_m2.toFixed(2)} m²</p>
      <p><strong>Floor projection:</strong> ${d.floor_m2.toFixed(2)} m²</p>
      <p class="muted">Calculated from the generated 3D model.
        Verify dimensions against the original manual.
        Projections do not necessarily represent occupied floor or wall space.</p>
    `;
  }

  if (tools.length) {
    html += `
      <h3>Tools you may need</h3>
      <ul>${tools.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <p class="muted">AI-identified tools. Verify against the original manual.</p>
    `;
  }

  html += '</section>';
  return html;
}


function partsCheck() {
  const ids = Object.keys(guide.parts), boards = ids.filter(id => guide.parts[id].kind === PANEL), fits = ids.filter(id => guide.parts[id].kind !== PANEL);
  const count = list => list.reduce((n, id) => n + (guide.parts[id].qty || 1), 0);
  const row = id => `<div class="prow">${partRow(id, guide.parts[id].qty || 1)}${hasProfile(guide.parts[id].kind, guide.parts[id]) ? `<button class="act" data-act="${esc(id)}">Actual size</button>` : ''}<button class="tick" role="checkbox" data-tick="${esc(id)}" aria-checked="${ticks.has(id)}" aria-label="Found ${esc(id)}, ${esc(guide.parts[id].name)}"><i>${ICON_CHECK}</i></button></div>`;
  const found = ids.filter(id => ticks.has(id)).length;
  return `<h2 class="step-title">Check the box</h2>
    <p class="instr">Unpack everything and lay it out. Tick each part as you find it. Tap a part to see it in 3D.</p>
    ${preparationInfo()}
    <p class="conf" id="found-n">Found ${found} of ${ids.length}</p>
    ${boards.length ? `<p class="sub-h">Boards <small>${count(boards)}</small></p><div class="need">${boards.map(row).join('')}</div>` : ''}
    ${fits.length ? `<p class="sub-h">Fittings <small>${count(fits)}</small></p><div class="need">${fits.map(row).join('')}</div>` : ''}
    <div class="callout tip">${ICON_TIP}<span>Keep the hardware bags closed until a step asks for them. Small parts roll away.</span></div>
    ${checkBox(0)}`;
}

function stepPanel(s) {
  const N = guide.steps.length, pn = hasManual(guide) ? pageNumber(s.page) : null;
  // a step the automatic check flags is never shown as "read clearly"
  const conf = s.confidence === 'high' && issues.some(i => i.step === cur) ? 'medium' : s.confidence;
  const confColor = { high: 'var(--ok)', medium: '#C98A00', low: 'var(--warn)' }[conf];
  const confText = { high: 'Read clearly from the manual', medium: 'Partly guessed. Check the manual', low: 'Unclear in the scan. Check the manual' }[conf];
  const need = s.need.map(([id, q]) => partRow(id, q)).join('');
  const next = cur < N ? guide.steps[cur] : null;
  return `<h2 class="step-title">${esc(s.title)}</h2>
    <p class="instr">${esc(s.text)}</p>
    ${need ? `<p class="sub-h">You need</p><div class="need">${need}</div>` : ''}
    ${s.warn ? `<div class="callout warn">${ICON_WARN}<span>${esc(s.warn)}</span></div>` : ''}
    ${s.tip ? `<div class="callout tip">${ICON_TIP}<span>${esc(s.tip)}</span></div>` : ''}
    ${checkBox(cur)}
    ${guide.example ? '' : `<p class="conf"><i style="background:${confColor}"></i>${confText}${s.page && !pn ? ` · manual page ${esc(s.page)}` : ''}</p>`}
    ${pn ? `<details class="mpage" id="mpage"${pageOpen ? ' open' : ''}><summary>Compare with the manual · page ${pn}</summary><a target="_blank" rel="noopener"><img alt="Manual page ${pn}"></a></details>` : ''}
    <p class="upnext">${next ? `Up next · step ${cur + 1}<b>${esc(next.title)}</b>` : 'This is the last step.'}</p>`;
}

function donePanel() {
  const N = guide.steps.length, wall = guide.scene?.wall_step;
  const home = currentUser() ? ['#/app', 'Back to my guides'] : ['#/', 'Back to the home page'];
  return `<h2 class="step-title">All ${N} steps done</h2>
    <p class="instr">Before you use it:</p>
    <ul class="done-list"><li>Check that every screw and lock is tight.</li><li>Make sure it stands level and does not wobble.</li>${wall ? `<li>Fix it to the wall, as in step ${wall}, before you put anything on it.</li>` : ''}</ul>
    <p class="muted" style="margin:0">A small fitting left over? Makers often pack a spare. A board or a big part left over means a step was missed: go back through the steps.</p>
    <div class="done-acts"><a class="btn" href="${home[0]}">${home[1]}</a></div>`;
}

function render() {
  const N = guide.steps.length, s = cur > 0 ? guide.steps[cur - 1] : null;
  // a picture of progress you can also tap; keyboard users use Back/Next and the arrow keys, so the strip is not a tab stop
  $('progress').innerHTML = Array.from({ length: N + 1 }, (_, i) => `<button tabindex="-1" title="${i ? `Step ${i}` : 'Parts check'}" class="${done || i < cur ? 'done' : i === cur ? 'cur' : ''}" data-i="${i}"${!done && i === cur ? ' aria-current="step"' : ''}></button>`).join('');
  const el = $('step');
  el.innerHTML = done ? donePanel() : s ? stepPanel(s) : partsCheck();
  if (!RM) { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); }
  $('side-body').scrollTop = 0;
  if (s && !done) showPage(hasManual(guide) ? pageNumber(s.page) : null);

  // tabs
  const tab = done ? 'done' : cur === 0 ? 'parts' : 'build';
  document.querySelectorAll('#tabs [data-tab]').forEach(b => (b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  $('nav-n').textContent = cur > 0 && !done ? `${cur}/${N}` : '';
  // the stage: big step number, "new" legend
  $('hud').className = 'snum' + (done || cur === 0 ? ' word' : '');
  $('hud').innerHTML = done ? 'Finished' : cur === 0 ? 'Lay the parts out like this' : `${cur}<small>/ ${N}</small>`;
  $('hud2').hidden = done || cur === 0;
  // buttons
  $('prev').disabled = cur === 0 && !done;
  $('next-t').textContent = done ? 'Start again' : cur === 0 ? "Everything's here" : cur === N ? 'Finish' : 'Done, next step';
  $('sr-step').textContent = done ? 'All steps done' : cur === 0 ? 'Parts check' : `Step ${cur} of ${N}: ${s.title}`;
  $('info').hidden = true; $('ask-out').hidden = true;
  $('z-fit').classList.remove('moved');

  placeCoach(); layoutStage();
  if (done) { viewer.setFinished(); if (!RM) { viewer.ctrl.autoRotate = true; viewer.ctrl.autoRotateSpeed = 0.8; } }
  else { viewer.setStep(cur); viewer.ctrl.autoRotate = false; }
  updatePauseButton();
  $('b-pause').hidden = done || cur === 0 || RM; // with reduced motion there is no animation to pause
  $('ask').hidden = done;
  $('b-zoom').hidden = done || !viewer.hasDetail(); $('b-zoom').setAttribute('aria-pressed', 'true');
  markBench(s);
  if (guide.id && !done) { store.set('bw-step-' + guide.id, cur); if (cur > 0) store.set('bw-last-' + guide.id, cur); }
}

// the manual page next to the step: stays open from step to step once opened
let pageOpen = false;
function showPage(n) {
  const el = $('mpage');
  if (!el) return;
  const fill = async () => {
    const url = await manualPage(guide, n);
    if ($('mpage') !== el) return; // moved on to another step meanwhile
    const img = el.querySelector('img'), a = el.querySelector('a');
    if (url) { img.src = url; a.href = url; } else el.querySelector('summary').textContent = `Manual page ${n} is not available`;
  };
  el.addEventListener('toggle', () => { pageOpen = el.open; if (el.open) fill(); });
  if (el.open) fill();
}

/* ---------- all parts (drawer) ---------- */
function renderBench() {
  $('bench').innerHTML = Object.entries(guide.parts).map(([id, p]) => `
    <div class="pc" data-pc="${esc(id)}">
      <button class="img" data-find="${esc(id)}" aria-label="Find ${esc(p.name)} in 3D">${thumbs[id] ? `<img src="${thumbs[id]}" alt="">` : ''}</button>
      <div class="top"><span class="id">${esc(id)}</span><span class="qty">${p.qty}×</span></div>
      <div class="nm">${esc(p.name)}</div>${sizeText(p) ? `<div class="sz">${sizeText(p)}</div>` : ''}
      ${p.look ? `<div class="lk">${esc(p.look)}</div>` : ''}
      ${hasProfile(p.kind, p) ? `<button class="ibtn act" data-act="${esc(id)}">Actual size</button>` : ''}
    </div>`).join('');
}
// the parts this step takes are outlined, with how many
function markBench(s) {
  const needed = new Map(s && !done ? s.need : []);
  document.querySelectorAll('#bench .pc').forEach(el => {
    const id = el.dataset.pc, n = needed.get(id);
    el.classList.toggle('on', n != null);
    el.querySelector('.badge')?.remove();
    if (n != null) el.insertAdjacentHTML('afterbegin', `<span class="badge">use ${n}</span>`);
  });
}
let drawerOpener = null;
function openDrawer() {
  drawerOpener = document.activeElement;
  $('pd').hidden = false; document.querySelector('.wrap').inert = true; $('pd-x').focus();
}
function closeDrawer(focusBack = true) {
  if ($('pd').hidden) return;
  $('pd').hidden = true; document.querySelector('.wrap').inert = false;
  if (focusBack && drawerOpener?.isConnected) drawerOpener.focus();
}
$('b-parts').onclick = openDrawer;
$('pd-x').onclick = () => closeDrawer();
$('pd').addEventListener('click', e => { if (e.target === $('pd')) closeDrawer(); });

function showInfo(id, note) {
  const p = guide.parts[id]; if (!p) return;
  $('info').innerHTML = `${thumbs[id] ? `<img src="${thumbs[id]}" alt="">` : ''}<div><div class="ttl"><code>${esc(id)}</code>${esc(p.name)}</div>
    ${sizeText(p) ? `<div class="muted" style="font-size:13px">${sizeText(p)}</div>` : ''}
    ${note ? `<div class="muted" style="font-size:13px">${esc(note)}</div>` : ''}
    ${hasProfile(p.kind, p) ? `<button class="ibtn" data-act="${esc(id)}">See actual size</button>` : ''}</div>`;
  $('info').hidden = false;
  viewer.flashPart(id);
}

/* ---------- moving between steps ---------- */
function go(i) { done = false; cur = Math.max(0, Math.min(guide.steps.length, i)); render(); }
function finish() { done = true; cur = guide.steps.length; render(); }
$('prev').onclick = () => (done ? go(guide.steps.length) : go(cur - 1));
$('next').onclick = () => (done ? go(0) : cur === guide.steps.length ? finish() : go(cur + 1));
$('progress').onclick = e => { const i = e.target.dataset?.i; if (i != null) go(+i); };
$('tabs').onclick = e => {
  const t = e.target.closest('[data-tab]')?.dataset.tab; if (!t || !guide) return;
  if (t === 'parts') go(0);
  else if (t === 'done') finish();
  else go(cur > 0 ? cur : Math.max(1, parseInt(store.get('bw-last-' + guide.id), 10) || 1));
};

/* ---------- 3D view controls ---------- */
$('b-labels').onclick = () => { const v = $('b-labels').getAttribute('aria-pressed') !== 'true'; $('b-labels').setAttribute('aria-pressed', v); viewer.setLabels(v); };
function updatePauseButton() {
  const paused = viewer.animationPaused;
  const btn = $('b-pause');

  btn.querySelector('span').textContent = paused ? 'Resume' : 'Pause';
  btn.querySelector('.i-pause').toggleAttribute('hidden', paused);
  btn.querySelector('.i-play').toggleAttribute('hidden', !paused);
  btn.setAttribute('aria-pressed', String(paused));
  btn.title = paused ? 'Resume animation (P)' : 'Pause animation (P)';
}

$('b-pause').onclick = () => {
  viewer.toggleAnimationPause();
  updatePauseButton();
};

$('b-replay').onclick = () => {
  viewer.replay();
  updatePauseButton();
};
$('b-zoom').onclick = () => { const v = $('b-zoom').getAttribute('aria-pressed') !== 'true'; $('b-zoom').setAttribute('aria-pressed', v); viewer.setDetail(v); };
$('z-in').onclick = () => viewer.zoomBy(0.72);
$('z-out').onclick = () => viewer.zoomBy(1 / 0.72);
$('z-fit').onclick = () => { viewer.goCam(false); $('z-fit').classList.remove('moved'); };

// how to move the view: a tip the first time, and the ? button any time
const COACH = TOUCH
  ? ['Drag to turn', 'Pinch to zoom', 'Two fingers to move', 'Double-tap to centre']
  : ['Drag to turn', 'Scroll to zoom', 'Right-drag or <kbd>Shift</kbd>-drag to move', 'Double-click to centre', '<kbd>←</kbd><kbd>→</kbd> steps'];
const HELP = TOUCH
  ? [['Drag', 'Turn the view'], ['Pinch', 'Zoom in or out'], ['Two-finger drag', 'Move the view'], ['Double-tap', 'Turn around that point'], ['Tap a part', 'See its letter and name']]
  : [['Drag', 'Turn the view'], ['Scroll or pinch', 'Zoom toward the pointer'], ['Right-drag, <kbd>Shift</kbd>-drag', 'Move the view'], ['Double-click', 'Turn around that point'],
     ['<kbd>+</kbd><kbd>−</kbd>', 'Zoom in or out'], ['<kbd>0</kbd>', "Back to the step's view"], ['<kbd>R</kbd>', 'Replay the step'], ['<kbd>P</kbd>', 'Pause or resume the animation'], ['<kbd>L</kbd>', 'Labels on or off'], ['<kbd>←</kbd><kbd>→</kbd>', 'Previous or next step']];
$('coach-list').innerHTML = COACH.map(t => `<li>${t}</li>`).join('');
$('help-list').innerHTML = HELP.map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join('');
function showCoach() { $('hint').hidden = store.get('bi-coach') === '1'; }
$('coach-x').onclick = () => { $('hint').hidden = true; store.set('bi-coach', '1'); layoutStage(); if (!viewer.moved) viewer.goCam(false); };

addEventListener('keydown', e => {
  if ($('view-build').hidden || !guide) return;
  if (!$('pd').hidden) { if (e.key === 'Escape') closeDrawer(); return; }
  if (!$('ov').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  const k = e.key;
  if (k === 'ArrowRight') { if (done) return; cur === guide.steps.length ? finish() : go(cur + 1); }
  else if (k === 'ArrowLeft') done ? go(guide.steps.length) : go(cur - 1);
  else if (k === '+' || k === '=') viewer.zoomBy(0.72);
  else if (k === '-' || k === '_') viewer.zoomBy(1 / 0.72);
  else if (k === '0') $('z-fit').click();
  else if (k === 'r' || k === 'R') {
    viewer.replay();
    updatePauseButton();
  }
  else if ((k === 'p' || k === 'P') && !done && cur > 0 && !RM) {
    viewer.toggleAnimationPause();
    updatePauseButton();
  }
  else if (k === 'l' || k === 'L') $('b-labels').click();
  else return;
  e.preventDefault();
});

document.addEventListener('click', e => {
  if (!guide) return;
  const t = e.target.closest?.('[data-tick]');
  if (t) {
    const id = t.dataset.tick, on = !ticks.has(id);
    on ? ticks.add(id) : ticks.delete(id);
    t.setAttribute('aria-checked', on);
    store.set('bi-ticks-' + guide.id, JSON.stringify([...ticks]));
    const n = $('found-n'); if (n) n.textContent = `Found ${Object.keys(guide.parts).filter(x => ticks.has(x)).length} of ${Object.keys(guide.parts).length}`;
    return;
  }
  const a = e.target.closest?.('[data-act]'), f = e.target.closest?.('[data-find]');
  const inDrawer = !!e.target.closest?.('#pd');
  if (a) { if (inDrawer) { closeDrawer(false); $('b-parts').focus(); } openActual(a.dataset.act, guide.parts[a.dataset.act]); return; }
  if (f) {
    if (inDrawer) closeDrawer();
    const id = f.dataset.find;
    showInfo(id, !viewer.isVisible(id) && first[id] > cur ? `Comes in at step ${first[id]}` : '');
  }
});

// "Stuck on this step?" → server → Claude
$('ask-form').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('ask-input').value.trim(); if (!q || !guide) return;
  const out = $('ask-out'); out.hidden = false; out.textContent = 'Thinking…'; $('ask-btn').disabled = true;
  try {
    const r = await api('/api/ask', { method: 'POST', body: { guide: guide.id, step: cur, question: q } });
    out.textContent = (await r.json()).answer;
  } catch (err) { out.textContent = err.message || 'Could not get an answer.'; }
  finally { $('ask-btn').disabled = false; }
});

// the 3D view draws only while the build screen is open
export function setBuildActive(v) { if (viewer) viewer.paused = !v; if (!v) closeDrawer(false); }
export function onBuildShown() { if (!viewer) return; placeCoach(); layoutStage(); viewer.goCam(true); }
