// Draws hardware at true size on screen (after a one-time bank-card calibration).
const PROFILES = {
  dowel: { w: 34, h: 12, svg: `<rect x="2" y="2" width="30" height="8" rx="2.2" fill="#E7CB92" stroke="#7a5c2c" stroke-width=".4"/>${[8, 14, 20, 26].map(x => `<line x1="${x}" y1="2.2" x2="${x}" y2="9.8" stroke="#a9824a" stroke-width=".5"/>`).join('')}` },
  cam_screw: { w: 52, h: 12, svg: `<rect x="2" y="3.4" width="11" height="5.2" fill="#9AA0A6"/>${[3, 5, 7, 9, 11].map(x => `<path d="M${x} 3 l1 6" stroke="#6d737a" stroke-width=".5"/>`).join('')}<rect x="13" y=".8" width="1.6" height="10.4" fill="#C3C8CE" stroke="#777" stroke-width=".3"/><rect x="14.6" y="2.7" width="22" height="6.6" fill="#C3C8CE" stroke="#777" stroke-width=".3"/><rect x="36.6" y="3.6" width="4" height="4.8" fill="#C3C8CE"/><ellipse cx="44.5" cy="6" rx="4" ry="4.4" fill="#C3C8CE" stroke="#777" stroke-width=".3"/>` },
  cam_lock: { w: 38, h: 18, svg: `<circle cx="9" cy="9" r="7.5" fill="#C3C8CE" stroke="#777" stroke-width=".3"/><rect x="3.5" y="8.3" width="11" height="1.4" fill="#2F3337"/><path d="M16 9 l-3.4 2.3 v-4.6z" fill="#2F3337"/><rect x="21" y="3" width="15" height="12" fill="#C3C8CE" stroke="#777" stroke-width=".3"/><rect x="31" y="6" width="5" height="6" fill="#2F3337"/><text x="9" y="17.6" font-size="2" text-anchor="middle" fill="currentColor">top</text><text x="28.5" y="17.6" font-size="2" text-anchor="middle" fill="currentColor">side</text>` },
  nail: { w: 24, h: 8, svg: `<rect x="1.5" y="1.8" width=".9" height="4.4" fill="#8F969D"/><rect x="2.4" y="3.2" width="18" height="1.6" fill="#8F969D"/><path d="M20.4 3.2 l2 .8 -2 .8z" fill="#8F969D"/>` },
  shelf_pin: { w: 18, h: 10, svg: `<rect x="2" y="2.5" width="14" height="5" rx="1" fill="#C3C8CE" stroke="#777" stroke-width=".3"/><rect x="7" y="1.4" width="1.2" height="7.2" fill="#AEB4BA"/>` },
  screw: { w: 22, h: 10, svg: `<rect x="1" y="1.4" width="1.6" height="7.2" fill="#C3C8CE" stroke="#777" stroke-width=".3"/><rect x="2.6" y="3.1" width="16" height="3.8" fill="#A9AFB5"/>${[4, 6, 8, 10, 12, 14, 16].map(x => `<path d="M${x} 2.9 l1 4.2" stroke="#6d737a" stroke-width=".4"/>`).join('')}<path d="M18.6 3.1 l2.2 1.9 -2.2 1.9z" fill="#A9AFB5"/>` },
  bolt: { w: 40, h: 14, svg: `<rect x="1" y="1.5" width="4" height="11" fill="#C3C8CE" stroke="#777" stroke-width=".3"/><rect x="5" y="4" width="30" height="6" fill="#A9AFB5"/>` },
  bracket: { w: 46, h: 46, svg: `<path d="M3 3 h2 v38 h38 v2 h-40z" fill="#C3C8CE" stroke="#777" stroke-width=".3"/><text x="23" y="28" font-size="3" text-anchor="middle" fill="currentColor">side view · 40 × 40</text>` }
};
export const hasProfile = kind => !!PROFILES[kind];

let ppm = 3.78;
try { const v = parseFloat(localStorage.getItem('bw-ppm')); if (v > 2) ppm = v; } catch (e) { /* storage blocked */ }
const $ = id => document.getElementById(id);
let current = null;

function draw() {
  const P = PROFILES[current.kind]; if (!P) return;
  $('ov-svg').innerHTML = `<svg width="${P.w * ppm}" height="${P.h * ppm}" viewBox="0 0 ${P.w} ${P.h}" style="color:var(--muted)">${P.svg}</svg>`;
  $('cardbox').style.width = 85.6 * ppm + 'px'; $('cardbox').style.height = 53.98 * ppm + 'px';
}
export function openActual(id, part) {
  current = part; $('ov-t').textContent = `${id} · ${part.name}, actual size`;
  $('ov-d').textContent = 'Lay the real part on the drawing. If it matches, you have the right one. Sizes are typical for this kind of part; check the manual if yours differs.';
  $('cal').value = ppm; draw(); $('ov').hidden = false; $('ov-x').focus();
}
$('cal').addEventListener('input', e => { ppm = parseFloat(e.target.value); try { localStorage.setItem('bw-ppm', ppm); } catch (err) { /* ignore */ } draw(); });
$('ov-x').addEventListener('click', () => ($('ov').hidden = true));
$('ov').addEventListener('click', e => { if (e.target === $('ov')) $('ov').hidden = true; });
addEventListener('keydown', e => { if (e.key === 'Escape') $('ov').hidden = true; });
