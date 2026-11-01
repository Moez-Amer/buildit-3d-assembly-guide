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
// sized side views for fixings whose length and diameter matter (screw D vs E in a chair look alike otherwise)
function sized(part) {
  const k = part.kind, d = part.d_mm, len = part.len_mm;
  if (k === 'washer') {
    const ro = (d || 12) / 2, ri = ro * 0.53, w = ro * 2 + 4;
    return { w, h: w, svg: `<circle cx="${w / 2}" cy="${w / 2}" r="${ro}" fill="#C3C8CE" stroke="#777" stroke-width=".3"/><circle cx="${w / 2}" cy="${w / 2}" r="${ri}" fill="var(--bg, #fff)" stroke="#777" stroke-width=".3"/>` };
  }
  if (k === 'nut') {
    const m = d || 6, R = (m * 1.7) / Math.sqrt(3), w = R * 2 + 4, c = w / 2;
    const pts = Array.from({ length: 6 }, (_, i) => `${c + R * Math.cos((i * Math.PI) / 3)},${c + R * Math.sin((i * Math.PI) / 3)}`).join(' ');
    return { w, h: w, svg: `<polygon points="${pts}" fill="#C3C8CE" stroke="#777" stroke-width=".3"/><circle cx="${c}" cy="${c}" r="${m / 2}" fill="var(--bg, #fff)" stroke="#777" stroke-width=".3"/>` };
  }
  if (k === 'allen_bolt' || (k === 'bolt' && (d || len)) || (k === 'screw' && (d || len))) {
    const m = d || (k === 'screw' ? 3.8 : 6), L = len || (k === 'screw' ? 16 : 30);
    const hh = k === 'screw' ? m * 0.45 : k === 'bolt' ? m * 0.66 : m, hd = k === 'screw' ? m * 1.9 : k === 'bolt' ? m * 1.9 : m * 1.7;
    const H = hd + 4, cy = H / 2, x0 = 2, w = x0 + hh + L + 3;
    const thr = Array.from({ length: Math.floor(L / (m * 0.5)) }, (_, i) => `<path d="M${x0 + hh + 1 + i * m * 0.5} ${cy - m / 2} l${m * 0.25} ${m}" stroke="#6d737a" stroke-width=".35"/>`).join('');
    return { w, h: H, svg: `<rect x="${x0}" y="${cy - hd / 2}" width="${hh}" height="${hd}" fill="${k === 'allen_bolt' ? '#3a3d41' : '#C3C8CE'}" stroke="#777" stroke-width=".3"/><rect x="${x0 + hh}" y="${cy - m / 2}" width="${L}" height="${m}" fill="#A9AFB5"/>${thr}<text x="${x0 + hh + L / 2}" y="${H - 0.3}" font-size="2" text-anchor="middle" fill="currentColor">${L} mm</text>` };
  }
  return null;
}
const profileFor = part => sized(part) || PROFILES[part.kind];
export const hasProfile = (kind, part) => !!(part ? profileFor(part) : PROFILES[kind] || ['washer', 'nut', 'allen_bolt'].includes(kind));

let ppm = 3.78;
try { const v = parseFloat(localStorage.getItem('bw-ppm')); if (v > 2) ppm = v; } catch (e) { /* storage blocked */ }
const $ = id => document.getElementById(id);
let current = null;

function draw() {
  const P = profileFor(current); if (!P) return;
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
