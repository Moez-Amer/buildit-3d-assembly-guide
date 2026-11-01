// Do two parts pass through each other? Works on every part: plain boards, turned or tilted boards, and shaped parts.
// Each primitive gets sample points on its surface and, where it is solid, a signed distance function (sdf:
// negative inside). A part sinks into another when one of its points is inside the other. Thin surfaces
// (grilles, domes) also get a side test, so a thin blade that crosses a grille is found too.
// All in millimetres, part coordinates unless named "world".
import { rotate, bladeDepth } from './guide.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return mul(a, 1 / l); };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const steps = (L, each, lo, hi) => clamp(Math.ceil(L / each), lo, hi);
const PI = Math.PI;

/** Undo rotate(v, rotDeg). */
export function unrotate(v, rotDeg) {
  let [x, y, z] = v;
  const [a, b, c] = rotDeg.map(d => (-d * PI) / 180);
  [y, z] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  [x, z] = [x * Math.cos(b) + z * Math.sin(b), -x * Math.sin(b) + z * Math.cos(b)];
  [x, y] = [x * Math.cos(c) - y * Math.sin(c), x * Math.sin(c) + y * Math.cos(c)];
  return [x, y, z];
}

/** Signed distance to a 2D polygon (negative inside). */
function sdPoly(poly, [px, py]) {
  let d = Infinity, s = 1;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[j], ex = bx - ax, ey = by - ay, wx = px - ax, wy = py - ay;
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1), 0, 1), dx = wx - ex * t, dy = wy - ey * t;
    d = Math.min(d, dx * dx + dy * dy);
    const c1 = py >= ay, c2 = py < by, c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

// Round parts are built along +y and turned onto their axis exactly like the viewer does (Quaternion.setFromUnitVectors).
function fromY(axis) {
  const [x, y, z] = axis;
  if (y < -0.999999) return v => [-v[0], -v[1], v[2]];
  const k = [z, 0, -x], s = Math.hypot(z, x), c = y; // k = Y × axis
  if (s < 1e-9) return v => v.slice();
  const u = mul(k, 1 / s);
  return v => add(add(mul(v, c), mul(cross(u, v), s)), mul(u, dot(u, v) * (1 - c)));
}
// (radius from the axis, height along the axis) of a point
const rh = (q, p) => { const d = sub(p, q.at), h = dot(d, q.axis); return [len(sub(d, mul(q.axis, h))), h]; };
const ring = (to, at, rho, h, n, a0 = 0) => Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * 2 * PI; return add(at, to([rho * Math.cos(a), h, rho * Math.sin(a)])); });

// closed (r, h) outlines, the same the viewer spins
function latheOutline(profile) {
  const p = profile.map(([r, h]) => [Math.max(0, r), h]);
  if (p[0][0] > 0.01) p.unshift([0, p[0][1]]);
  if (p[p.length - 1][0] > 0.01) p.push([0, p[p.length - 1][1]]);
  return p;
}
function shellOutline(q) {
  const R = q.d / 2, out = [], inn = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * (PI / 2);
    out.push([R * Math.cos(a), q.depth * Math.sin(a) + q.thick]);
    inn.push([Math.max(0, R - q.thick) * Math.cos(a), q.depth * Math.sin(a)]);
  }
  return [...out, ...inn.reverse()];
}
// dense points along an outline, for samples
function dense(poly, each = 12) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], n = steps(Math.hypot(b[0] - a[0], b[1] - a[1]), each, 1, 12);
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
function revolve(q, outline, turns = 18) {
  const to = fromY(q.axis), out = [];
  for (const [r, h] of dense(outline)) {
    if (r < 0.5) out.push(add(q.at, to([0, h, 0])));
    else out.push(...ring(to, q.at, r, h, Math.max(8, Math.min(turns, Math.round(r / 6)))));
  }
  return out;
}

// a straight stretch of a sweep: frame (T, N, B) with N as close to "up" as possible
function segFrame(a, b, up) {
  const T = norm(sub(b, a));
  let u = up;
  if (Math.abs(dot(u, T)) > 0.95) u = Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
  const N = norm(sub(u, mul(T, dot(u, T))));
  return { a, T, N, B: cross(T, N), L: len(sub(b, a)) };
}

// fan blade surface points, the same formula as the viewer
function bladePoints(q) {
  const R = q.d / 2, r0 = (q.hub / 2) * 0.85, pitch = (q.pitch * PI) / 180, sweep = (q.sweep * PI) / 180, out = [], to = fromY(q.axis);
  for (let k = 0; k < q.n; k++) {
    const th = (k / q.n) * 2 * PI;
    for (let i = 0; i <= 8; i++) {
      const s = i / 8, rho = r0 + s * (R - r0), c = q.width * Math.sqrt(Math.max(0, Math.sin(PI * (0.08 + 0.92 * s ** 1.5))));
      const ps = pitch * (1 - 0.35 * s), phi = th + sweep * s * s;
      for (let j = 0; j <= 4; j++) {
        const u = (j / 4) * 2 - 1, x = (u * c) / 2, h = x * Math.sin(ps) + (1 - u * u) * c * 0.06, a = phi + (x * Math.cos(ps)) / rho;
        out.push(add(q.at, to([rho * Math.cos(a), h, rho * Math.sin(a)])));
      }
    }
  }
  return out;
}

/** One primitive → { samples, sdf?, side? }, all in part coordinates. */
function prim(q) {
  if (q.type === 'box') {
    const half = q.size.map(v => v / 2), r = Math.min(q.r || 0, Math.min(...half) - 0.01), out = [];
    const n = half.map(h => steps(2 * h, 15, 1, 10));
    for (let ax = 0; ax < 3; ax++) for (const sgn of [-1, 1]) {
      const [u, v] = [0, 1, 2].filter(i => i !== ax);
      for (let i = 0; i <= n[u]; i++) for (let j = 0; j <= n[v]; j++) {
        const p = [0, 0, 0]; p[ax] = sgn * half[ax]; p[u] = -half[u] + (2 * half[u] * i) / n[u]; p[v] = -half[v] + (2 * half[v] * j) / n[v];
        out.push(add(rotate(p, q.rot), q.at));
      }
    }
    return { samples: out, sdf: p => {
      const d = unrotate(sub(p, q.at), q.rot).map((v, i) => Math.abs(v) - (half[i] - Math.max(0, r)));
      return Math.hypot(...d.map(v => Math.max(v, 0))) + Math.min(Math.max(...d), 0) - Math.max(0, r);
    } };
  }
  if (q.type === 'cyl' || q.type === 'lathe') {
    // a cylinder is a lathe with a two-point outline along from → to
    const L = q.type === 'cyl' ? len(sub(q.to, q.from)) : 0;
    const lq = q.type === 'cyl' ? { at: q.from, axis: norm(sub(q.to, q.from)), profile: [[q.d / 2, 0], [q.d2 / 2, L]] } : q;
    const outline = latheOutline(lq.profile);
    return { samples: revolve(lq, outline), sdf: p => sdPoly(outline, rh(lq, p)) };
  }
  if (q.type === 'sphere') {
    const r = q.d / 2, n = 48, out = [];
    for (let i = 0; i < n; i++) { const y = 1 - (2 * (i + 0.5)) / n, s = Math.sqrt(1 - y * y), a = i * 2.39996; out.push(add(q.at, mul([s * Math.cos(a), y, s * Math.sin(a)], r))); }
    return { samples: out, sdf: p => len(sub(p, q.at)) - r };
  }
  if (q.type === 'tube') {
    // a chain of capsules (the rounded bends are a little smaller than this, so allow for them)
    const r = q.d / 2, out = [];
    for (let i = 1; i < q.path.length; i++) {
      const a = q.path[i - 1], b = q.path[i], L = len(sub(b, a)), ax = norm(sub(b, a)), to = fromY(ax), m = steps(L, 15, 1, 24);
      for (let k = 0; k <= m; k++) out.push(...ring(to, add(a, mul(ax, (L * k) / m)), r, 0, 12));
    }
    return { samples: out, sdf: p => Math.min(...q.path.slice(1).map((b, i) => {
      const a = q.path[i], ab = sub(b, a), t = clamp(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1);
      return len(sub(p, add(a, mul(ab, t))));
    })) - r, loose: q.bend };
  }
  if (q.type === 'plate') {
    // flat outline with a thickness: a sweep along the thickness axis
    const n = { xy: [2, [1, 0, 0], [0, 1, 0]], xz: [1, [1, 0, 0], [0, 0, 1]], yz: [0, [0, 1, 0], [0, 0, 1]] }[q.plane];
    const [ax, U, V] = n, W = [0, 0, 0]; W[ax] = 1;
    const at = (u, v, w) => add(q.at, add(add(mul(U, u), mul(V, v)), mul(W, w)));
    const out = [];
    for (const [u, v] of dense(q.outline, 15)) for (const w of [-q.thick / 2, 0, q.thick / 2]) out.push(at(u, v, w));
    const [lo, hi] = [0, 1].map(k => [Math.min, Math.max][k](...q.outline.map(p => p[0])));
    const [lo2, hi2] = [0, 1].map(k => [Math.min, Math.max][k](...q.outline.map(p => p[1])));
    const gu = steps(hi - lo, 20, 1, 12), gv = steps(hi2 - lo2, 20, 1, 12);
    for (let i = 0; i <= gu; i++) for (let j = 0; j <= gv; j++) {
      const u = lo + ((hi - lo) * i) / gu, v = lo2 + ((hi2 - lo2) * j) / gv;
      if (sdPoly(q.outline, [u, v]) < 0) for (const w of [-q.thick / 2, q.thick / 2]) out.push(at(u, v, w));
    }
    return { samples: out, sdf: p => {
      const d = sub(p, q.at), dw = Math.abs(dot(d, W)) - q.thick / 2, d2 = sdPoly(q.outline, [dot(d, U), dot(d, V)]);
      return Math.min(Math.max(d2, dw), 0) + Math.hypot(Math.max(d2, 0), Math.max(dw, 0));
    } };
  }
  if (q.type === 'sweep') {
    const segs = q.path.slice(1).map((b, i) => segFrame(q.path[i], b, q.up)), prof = dense(q.profile, 10), out = [];
    for (const f of segs) {
      const m = steps(f.L, 15, 1, 24);
      for (let k = 0; k <= m; k++) for (const [u, v] of prof) out.push(add(add(f.a, mul(f.T, (f.L * k) / m)), add(mul(f.B, u), mul(f.N, v))));
    }
    return { samples: out, sdf: p => Math.min(...segs.map(f => {
      const d = sub(p, f.a), t = dot(d, f.T), dl = Math.abs(t - f.L / 2) - f.L / 2, d2 = sdPoly(q.profile, [dot(d, f.B), dot(d, f.N)]);
      return Math.min(Math.max(d2, dl), 0) + Math.hypot(Math.max(d2, 0), Math.max(dl, 0));
    })), loose: q.bend };
  }
  if (q.type === 'shell') {
    const outline = shellOutline(q), R = q.d / 2;
    return { samples: revolve(q, outline), sdf: p => sdPoly(outline, rh(q, p)),
      // the middle of the dome wall; a part with points on both sides goes through it
      side: p => { const [r, h] = rh(q, p); return r < R * 0.97 ? h - (q.depth * Math.sqrt(Math.max(0, 1 - (r / R) ** 2)) + q.thick / 2) : null; },
      thin: q.thick / 2, window: R * 0.15 + 20 };
  }
  if (q.type === 'grille') {
    const R = q.d / 2, hole = (q.hole || 0) / 2, hAt = r => q.depth * (1 - (r / R) ** 2), to = fromY(q.axis), out = [];
    out.push(...ring(to, q.at, R, 0, 40));
    for (let k = 1; k <= q.rings; k++) { const r = hole + ((R - hole) * k) / (q.rings + 1); out.push(...ring(to, q.at, r, hAt(r), 24)); }
    const spokes = Math.min(q.spokes, 36);
    for (let k = 0; k < spokes; k++) for (let i = 0; i <= 6; i++) {
      const r = Math.max(hole, R * 0.1) + ((R - Math.max(hole, R * 0.1)) * i) / 6, a = (k / spokes) * 2 * PI + ((q.twist * PI) / 180) * (r / R);
      out.push(add(q.at, to([r * Math.cos(a), hAt(r), r * Math.sin(a)])));
    }
    return { samples: out,
      // distance to the guard's surface: the wires are close together, so treat it as a thin dome
      sdf: p => {
        const [r, h] = rh(q, p);
        if (r > R) return Math.hypot(r - R, h) - q.rim / 2;
        if (r < hole) return Math.hypot(hole - r, h - hAt(hole)) - q.wire / 2;
        const slope = (2 * q.depth * r) / (R * R);
        return Math.abs(h - hAt(r)) / Math.sqrt(1 + slope * slope) - q.wire / 2;
      },
      side: p => { const [r, h] = rh(q, p); return r < R * 0.97 && r > hole + 2 ? h - hAt(r) : null; },
      thin: Math.max(q.wire, q.rim) / 2, window: R * 0.15 + 20 };
  }
  if (q.type === 'blades') {
    // too thin and twisted for a distance function: only points, checked against the other part
    const hub = { at: add(q.at, mul(q.axis, -bladeDepth(q) * 0.45)), axis: q.axis, profile: [[q.hub / 2, 0], [q.hub / 2, bladeDepth(q) * 0.9]] };
    const outline = latheOutline(hub.profile);
    return { samples: [...bladePoints(q), ...revolve(hub, outline)], sdf: p => sdPoly(outline, rh(hub, p)) };
  }
  return { samples: [] };
}

/** A panel's primitives with world samples and boxes, ready to test against another panel. */
export function solidOf(panel, part) {
  const shape = part.shape || [{ type: 'box', at: [0, 0, 0], size: part.size_mm || [18, 18, 18], rot: [0, 0, 0], r: 0 }];
  const toWorld = v => add(rotate(v, panel.rot), panel.pos), toLocal = v => unrotate(sub(v, panel.pos), panel.rot);
  const prims = shape.map(q => {
    const p = prim(q), world = p.samples.map(toWorld);
    const min = [0, 1, 2].map(i => Math.min(...world.map(w => w[i]))), max = [0, 1, 2].map(i => Math.max(...world.map(w => w[i])));
    return { ...p, type: q.type, world, min, max };
  }).filter(p => p.world.length);
  return { key: panel.key, prims, toLocal };
}

const near = (a, b, pad) => [0, 1, 2].every(i => a.min[i] - pad <= b.max[i] && b.min[i] - pad <= a.max[i]);

/**
 * How two panels meet. Returns { depth (mm, > 0 = they pass through each other), at (world point), cross (a thin
 * part goes right through a grille or dome), gap (closest distance found, mm) }.
 */
export function contact(A, B, pad = 3) {
  let depth = 0, at = null, gap = Infinity, cross = false;
  const test = (X, Y) => {
    for (const px of X.prims) for (const py of Y.prims) {
      if (!near(px, py, pad + 1)) continue;
      let above = false, below = false;
      for (const w of px.world) {
        if ([0, 1, 2].some(i => w[i] < py.min[i] - pad - 1 || w[i] > py.max[i] + pad + 1) && !py.side) continue;
        const l = Y.toLocal(w);
        if (py.sdf) {
          const d = py.sdf(l) + (py.loose ? Math.min(2, py.loose * 0.05) : 0);
          gap = Math.min(gap, d);
          if (-d > depth) { depth = -d; at = w; }
        }
        if (py.side) {
          // only points near the surface count: a part far behind and far in front is not crossing it
          const s = py.side(l), t = py.thin + 1.5;
          if (s != null && Math.abs(s) < py.window) {
            if (s > t) above = true; else if (s < -t) below = true;
            if (above && below && !cross) { cross = true; at = at || w; }
          }
        }
      }
    }
  };
  test(A, B); test(B, A);
  return { depth, at, gap, cross };
}
