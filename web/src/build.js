// The build screen: 3D stage + step card + parts bench.
import { Viewer } from './viewer/Viewer.js';
import { PANEL, firstUse } from './guide.js';
import { checkGuide } from './check.js';
import { openActual, hasProfile } from './actualSize.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const colors = () => ({ wood: tok('--wood'), accent: tok('--accent'), edge: tok('--edge') });
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ICON_WARN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>';
const ICON_TIP = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/></svg>';

let viewer = null, guide = null, cur = 0, thumbs = {}, first = {}, issues = [];

function sizeText(p) {
  if (p.kind === PANEL && p.size_mm) { const s = p.size_mm.slice().sort((a, b) => b - a); return `${s.map(v => Math.round(v)).join(' × ')} mm`; }
  return '';
}

export function openGuide(g) {
  guide = g; cur = 0; first = firstUse(g);
  try { issues = checkGuide(g).filter(i => i.level !== 'info'); } catch (e) { issues = []; console.warn('Guide check failed', e); }
  if (!viewer) {
    viewer = new Viewer($('stage'), $('labels'), { colors: colors(), reducedMotion: RM });
    viewer.onPick = part => (part ? showInfo(part) : ($('info').hidden = true));
    $('stage').addEventListener('pointerdown', () => ($('hint').hidden = true), { once: true });
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => viewer.setColors(colors()));
  }
  viewer.resize();
  viewer.load(g);
  thumbs = viewer.thumbnails();
  $('p-name').textContent = g.product;
  const m = [`${g.steps.length} steps`];
  if (g.time_minutes) m.push(`about ${g.time_minutes} min`);
  m.push(g.people >= 2 ? '2 people needed' : '1 person');
  g.tools.forEach(t => m.push(t));
  $('p-meta').innerHTML = m.map(t => `<span>${esc(t)}</span>`).join('');
  $('mode-tag').hidden = !g.example;
  render();
}

// "The 3D view may be wrong here": problems the automatic check found in this step (or in the whole guide, at step 0)
function checkBox(step) {
  const list = issues.filter(i => (step === 0 ? i.step == null : i.step === step));
  if (!list.length) return '';
  const head = step === 0 ? 'The automatic check found problems in this guide. Compare each step with the paper manual.'
    : 'The 3D view may be wrong in this step. Follow the paper manual if they differ.';
  const items = list.map(i => `<li>${esc(i.msg)}${i.count > 1 ? ` (${i.count} times)` : ''}</li>`).join('');
  return `<div class="callout check">${ICON_WARN}<div><span>${head}</span><details><summary>What looks wrong</summary><ul>${items}</ul></details></div></div>`;
}

function render() {
  const N = guide.steps.length, s = cur > 0 ? guide.steps[cur - 1] : null;
  $('progress').innerHTML = Array.from({ length: N + 1 }, (_, i) => `<button class="${i < cur ? 'done' : i === cur ? 'cur' : ''}" data-i="${i}" aria-label="${i === 0 ? 'Parts check' : 'Step ' + i}"></button>`).join('');
  if (!s) {
    $('step').innerHTML = `<div class="step-head"><div class="num">0<small>/${N}</small></div><h2>Check your parts</h2></div>
      <p class="instr">Unpack everything and lay it out. Match every board and bag to the pictures below. Tap a part in 3D to see its letter.</p>
      <div class="callout tip">${ICON_TIP}<span>Keep the hardware bags closed until a step asks for them. Small parts roll away.</span></div>
      ${checkBox(0)}`;
  } else {
    // a step the automatic check flags is never shown as "read clearly"
    const conf = s.confidence === 'high' && issues.some(i => i.step === cur) ? 'medium' : s.confidence;
    const confColor = { high: 'var(--ok)', medium: 'var(--accent)', low: 'var(--warn)' }[conf];
    const confText = { high: 'Read clearly from the manual', medium: 'Partly guessed. Check the manual', low: 'Unclear in the scan. Check the manual' }[conf];
    const need = s.need.map(([id, q]) => `<button class="npart" data-find="${esc(id)}">${thumbs[id] ? `<img src="${thumbs[id]}" alt="">` : ''}<span><span class="q">× ${q}</span> <b style="font-family:var(--f-mono)">${esc(id)}</b><br><span class="n">${esc(guide.parts[id]?.name)}</span></span></button>`).join('');
    $('step').innerHTML = `<div class="step-head"><div class="num">${cur}<small>/${N}</small></div><h2>${esc(s.title)}</h2></div>
      <p class="instr">${esc(s.text)}</p>
      ${need ? `<div><p class="lbl">Take these now</p><div class="need">${need}</div></div>` : ''}
      ${s.warn ? `<div class="callout warn">${ICON_WARN}<span>${esc(s.warn)}</span></div>` : ''}
      ${s.tip ? `<div class="callout tip">${ICON_TIP}<span>${esc(s.tip)}</span></div>` : ''}
      ${checkBox(cur)}
      ${guide.example ? '' : `<div class="conf"><i style="background:${confColor}"></i>${confText}${s.page ? ` · manual page ${esc(s.page)}` : ''}</div>`}`;
  }
  $('prev').disabled = cur === 0;
  $('next').textContent = cur === 0 ? 'Start building →' : cur === N ? 'Start over' : 'Next step →';
  $('hud').textContent = cur === 0 ? 'Parts check' : `Step ${cur} of ${N}`;
  $('hud2').hidden = cur === 0;
  $('info').hidden = true; $('ask-out').hidden = true;
  viewer.setStep(cur);
  $('b-zoom').hidden = !viewer.hasDetail(); $('b-zoom').setAttribute('aria-pressed', 'true');
  renderBench(s);
  try { if (guide.id) localStorage.setItem('bw-step-' + guide.id, cur); } catch (e) { /* ignore */ }
}

function renderBench(s) {
  const needed = new Map(s ? s.need : []);
  $('bench').innerHTML = Object.entries(guide.parts).map(([id, p]) => `
    <div class="pc ${needed.has(id) || cur === 0 ? 'on' : ''}">
      ${needed.has(id) ? `<span class="badge">use ${needed.get(id)}</span>` : ''}
      <button class="img" data-find="${esc(id)}" aria-label="Find ${esc(p.name)} in 3D">${thumbs[id] ? `<img src="${thumbs[id]}" alt="">` : ''}</button>
      <div class="top"><span class="id">${esc(id)}</span><span class="qty">× ${p.qty}</span></div>
      <div class="nm">${esc(p.name)}</div>${sizeText(p) ? `<div class="sz">${sizeText(p)}</div>` : ''}
      ${p.look ? `<div class="lk">${esc(p.look)}</div>` : ''}
      ${hasProfile(p.kind) ? `<button class="act" data-act="${esc(id)}">Actual size</button>` : ''}
    </div>`).join('');
}

function showInfo(id, note) {
  const p = guide.parts[id]; if (!p) return;
  $('info').innerHTML = `${thumbs[id] ? `<img src="${thumbs[id]}" alt="">` : ''}<div><div><b>${esc(id)}</b> · ${esc(p.name)}</div>
    ${sizeText(p) ? `<div class="muted" style="font-size:13px">${sizeText(p)}</div>` : ''}
    ${note ? `<div class="muted" style="font-size:12px">${esc(note)}</div>` : ''}
    ${hasProfile(p.kind) ? `<button class="tbtn" style="margin-top:6px;height:32px" data-act="${esc(id)}">See actual size</button>` : ''}</div>`;
  $('info').hidden = false; $('hint').hidden = true;
  viewer.flashPart(id);
}

function go(i) { cur = Math.max(0, Math.min(guide.steps.length, i)); render(); }
$('prev').onclick = () => go(cur - 1);
$('next').onclick = () => go(cur === guide.steps.length ? 0 : cur + 1);
$('progress').onclick = e => { const i = e.target.dataset?.i; if (i != null) go(+i); };
addEventListener('keydown', e => {
  if ($('view-build').hidden || !$('ov').hidden || e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight') go(cur + 1); if (e.key === 'ArrowLeft') go(cur - 1);
});
document.addEventListener('click', e => {
  if (!guide) return;
  const a = e.target.closest?.('[data-act]'), f = e.target.closest?.('[data-find]');
  if (a) { openActual(a.dataset.act, guide.parts[a.dataset.act]); return; }
  if (f) {
    const id = f.dataset.find;
    showInfo(id, !viewer.isVisible(id) && first[id] > cur ? `Comes in at step ${first[id]}` : '');
    $('stage-card').scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'nearest' });
  }
});
$('b-labels').onclick = () => { const v = $('b-labels').getAttribute('aria-pressed') !== 'true'; $('b-labels').setAttribute('aria-pressed', v); viewer.setLabels(v); };
$('b-replay').onclick = () => viewer.replay();
$('b-zoom').onclick = () => { const v = $('b-zoom').getAttribute('aria-pressed') !== 'true'; $('b-zoom').setAttribute('aria-pressed', v); viewer.setDetail(v); };

// "Stuck on this step?" → server → Claude
$('ask-form').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('ask-input').value.trim(); if (!q || !guide) return;
  const out = $('ask-out'); out.hidden = false; out.textContent = 'Thinking…'; $('ask-btn').disabled = true;
  const s = guide.steps[cur - 1];
  try {
    const r = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      question: q, product: guide.product, step_number: cur, total_steps: guide.steps.length,
      step: s ? { title: s.title, text: s.text, tip: s.tip, warn: s.warn, need: s.need.map(([id, n]) => ({ id, qty: n, name: guide.parts[id]?.name })) } : 'Parts check before building',
      previous: guide.steps[cur - 2]?.text || null, next: guide.steps[cur]?.text || null }) });
    const j = await r.json();
    out.textContent = r.ok ? j.answer : j.error || 'Could not get an answer.';
  } catch (err) { out.textContent = 'Could not reach the Buildwise server. Is it running?'; }
  finally { $('ask-btn').disabled = false; }
});

export function onBuildShown() { viewer?.resize(); viewer && viewer.goCam(true); }
