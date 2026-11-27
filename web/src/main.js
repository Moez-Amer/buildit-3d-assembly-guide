import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles.css';
import './site.css';
import { normalizeGuide } from './guide.js';
import { initScan, leaveScan } from './scan.js';
import { openGuide, onBuildShown, setBuildActive } from './build.js';
import { loadUser, currentUser, onUserChange, showSignin, rememberNext } from './account.js';
import { showLanding } from './landing.js';
import { legalPage } from './legal.js';
import { showManuals } from './manuals.js';
import { api, apiJson } from './api.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const VIEWS = ['landing', 'signin', 'home', 'manuals', 'build', 'legal', 'msg'];
const TITLES = { landing: 'Buildit · Flat-pack instructions in 3D', signin: 'Sign in · Buildit', home: 'My guides · Buildit', manuals: 'Available manuals · Buildit', legal: 'Buildit', msg: 'Buildit' };

let shownView = null, cameFrom = null;
function show(view, title) {
  VIEWS.forEach(v => ($('view-' + v).hidden = v !== view));
  document.body.dataset.view = view;
  $('land-links').hidden = view !== 'landing';
  $('nav-app').hidden = !currentUser() || view === 'home';
  $('nav-signin').hidden = !!currentUser() || view === 'signin';
  if (view === 'manuals') $('nav-manuals').setAttribute('aria-current', 'page'); else $('nav-manuals').removeAttribute('aria-current');
  if (view === 'home' || view === 'manuals' || view === 'landing') cameFrom = view; // where a guide's back button returns to
  $('foot').hidden = view === 'build';
  showLanding(view === 'landing');
  setBuildActive(view === 'build');
  if (view === 'build') { onBuildShown(); requestWake(); } else { leaveScan(); $('mode-tag').hidden = true; }
  document.title = title || TITLES[view];
  if (view !== shownView) {
    scrollTo({ top: 0 });
    // tell screen readers the page changed: move focus to the new content (not on the first load)
    if (shownView) $('main').focus({ preventScroll: true });
  }
  shownView = view;
}
function message(title, text, actions) {
  $('msg-t').textContent = title; $('msg-d').textContent = text;
  $('msg-a').innerHTML = actions.map(([label, href, primary]) => `<a class="btn${primary ? ' primary' : ''}" href="${href}">${esc(label)}</a>`).join('');
  show('msg', `${title} · Buildit`);
}

async function loadGuide(id) {
  if (id === 'example-bookcase') return normalizeGuide(await (await fetch('/examples/bookcase.json')).json());
  return normalizeGuide(await apiJson(`/api/guides/${encodeURIComponent(id)}`));
}

let routeNo = 0;
async function route() {
  const h = location.hash, n = ++routeNo, user = currentUser();
  let m;
  if (h === '' || h === '#' || h === '#/') return user ? (location.replace('#/app'), undefined) : show('landing');
  if ((m = h.match(/^#\/signin(?:\/([\w-]+))?$/))) {
    if (user && !m[1]) return location.replace('#/app');
    show('signin'); showSignin(m[1]); return;
  }
  if (h === '#/app') {
    if (!user) { rememberNext('#/app'); return location.replace('#/signin'); }
    show('home'); renderScanAccess(); listGuides(); return;
  }
  if (h === '#/manuals') { show('manuals'); showManuals(); return; }
  if ((m = h.match(/^#\/(privacy|imprint)$/))) {
    $('legal').innerHTML = legalPage(m[1]); show('legal', `${m[1] === 'privacy' ? 'Privacy' : 'Imprint'} · Buildit`); return;
  }
  if ((m = h.match(/^#\/guide\/([\w-]+)$/))) {
    const id = m[1];
    try {
      const g = await loadGuide(id);
      if (n !== routeNo) return; // the visitor moved on while it loaded
      show('build', `${g.product} · Buildit`);
      // back to the list it was opened from: Available manuals, My guides, or the home page
      const [back, href] = cameFrom === 'manuals' ? ['Available manuals', '#/manuals'] : user ? ['My guides', '#/app'] : ['Home', '#/'];
      $('build-back').setAttribute('aria-label', back); $('build-back').title = back;
      $('build-back').href = href;
      openGuide(g);
    } catch (e) {
      if (n !== routeNo) return;
      if (!user && e.status === 404) { rememberNext(h); message('Sign in to open this guide', 'Guides you made are only visible to you. Sign in with the email you used.', [['Sign in', '#/signin', true], ['Home', '#/']]); }
      else message('Guide not found', e.status === 404 ? 'This guide does not exist, or it belongs to another account.' : e.message, [[user ? 'My guides' : 'Home', user ? '#/app' : '#/', true]]);
    }
    return;
  }
  message('Page not found', 'There is nothing at this address.', [['Home', '#/', true]]);
}
addEventListener('hashchange', route);

// signing in from inside a guide comes back to that guide
$('ask-signin-link').addEventListener('click', () => rememberNext(location.hash));

// landing page: header links scroll to a section
document.addEventListener('click', e => {
  const b = e.target.closest('[data-scroll]'); if (!b) return;
  $(b.dataset.scroll)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});

/* ---------- my guides ---------- */
function renderScanAccess() {
  const u = currentUser(), open = !!u?.canScan || !!u?.ownKey;
  $('scan-closed').hidden = open; $('scan-open').hidden = !open; $('tips-card').hidden = !open;
  $('scan-card').querySelector('h2').textContent = open ? 'Scan a manual' : 'Scan your own manual';
  // own Anthropic API key: optional with scanning open to you, needed without it
  $('own-key').hidden = !u?.ownKey;
  if (u?.ownKey && !u.canScan) { $('own-key').open = true; $('own-key-sum').textContent = 'Your Anthropic API key (needed for now)'; }
}
async function listGuides() {
  const box = $('guides');
  box.innerHTML = '<p class="muted">Loading…</p>';
  let saved = [];
  try { saved = await apiJson('/api/guides'); }
  catch (e) { box.innerHTML = `<p class="status err">${esc(e.message)}</p>`; return; }
  const when = d => { try { return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
  const item = g => `<div class="gitem${g.old ? ' is-old' : ''}"><a href="#/guide/${encodeURIComponent(g.id)}"><b>${esc(g.product || 'Untitled guide')}</b><small>${esc(g.note || when(g.created))} · ${g.steps} steps</small></a>${g.id !== 'example-bookcase' ? `<button class="gdel" data-del="${esc(g.id)}" aria-label="Delete ${esc(g.product)}" title="Delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>` : ''}</div>`;
  const own = saved.filter(g => !g.old), old = saved.filter(g => g.old);
  box.closest('.home').classList.toggle('has-guides', own.length > 0);
  $('guides-h').textContent = own.length ? `Your guides (${own.length})` : 'Your guides';
  const none = currentUser()?.canScan ? 'No guides yet. Scan a manual to make your first one.' : 'No guides yet. Once scanning opens, the guides you make are kept here.';
  box.innerHTML = (own.length ? own.map(item).join('') : `<p class="empty">${none}</p>`)
    + `<p class="lbl" style="margin:10px 0 0">Example</p>` + item({ id: 'example-bookcase', product: 'Bookcase 60 × 100 cm', note: 'Example guide', steps: 9 })
    + (old.length ? `<details class="old"><summary>Older test guides (${old.length})</summary><div class="guides">${old.map(item).join('')}</div></details>` : '');
}
$('guides').onclick = async e => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  const name = b.closest('.gitem').querySelector('b').textContent;
  if (!confirm(`Delete "${name}"?\n\nThe guide and the manual pages it was made from are deleted for good.`)) return;
  b.disabled = true;
  try { await api(`/api/guides/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); listGuides(); }
  catch (err) { b.disabled = false; alert(err.message); }
};

// a finished scan opens its guide, unless the user went to read something else meanwhile (then it is in the list)
initScan({ onGuideReady: g => { if (shownView === 'home') location.hash = `#/guide/${encodeURIComponent(g.id)}`;  } });
onUserChange(() => { $('nav-app').hidden = !currentUser() || shownView === 'home'; });

// keep the screen on while building
let wake = null;
async function requestWake() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => (wake = null)); } } catch (e) { /* not allowed */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('view-build').hidden) requestWake(); });

loadUser().then(route);
