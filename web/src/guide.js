// The Buildit guide format, shared by the AI server and the 3D viewer.
//
// Units are millimetres. World axes: x = left→right, y = up from the floor, z = back (0) → front.
//   parts:    { "<id>": { name, qty, kind, size_mm?, look?, finish?, material?, color?, shape?, len_mm?, d_mm? } }
//             kind = panel (any solid part: board, frame, leg, seat) | dowel | cam_screw | cam_lock | nail | shelf_pin
//                    | screw | bolt | allen_bolt | washer | nut | bracket | other
//             shape (optional, panel only): list of primitives in the part's own coordinates. Without it the part
//             is a plain box of size_mm. With it, size_mm is computed from the shape and the shape is re-centred.
//               {type:"box", at, size, rot?, r?}          r = corner radius (cushions, rounded edges)
//               {type:"cyl", from, to, d, d2?}             rod, round leg, disc; d2 = diameter at "to" (taper)
//               {type:"tube", path:[[x,y,z],..], d, bend?, square?}   bent round (or square) tube along a path
//               {type:"plate", plane:"xy"|"xz"|"yz", outline:[[u,v],..], thick, at?, r?}   flat part with any outline;
//                                                       r = rounded edges (padded backrests and seats traced from the drawing)
//               {type:"sphere", at, d}
//               {type:"lathe", at, axis?, profile:[[r,h],..]}   turned/round body: profile (radius r at height h along
//                                                       axis) spun around the axis; legs, knobs, hubs, motor housings
//               {type:"shell", at, axis?, d, depth, thick?}   thin dome (rim circle centred at "at", bulging along axis)
//               {type:"sweep", path:[[x,y,z],..], profile:[[u,v],..], bend?, up?}   any cross-section pulled along a
//                                                       path (curved armrests, bent plywood); v points toward "up"
//               {type:"blades", at, axis?, n, d, hub?, width?, pitch?, sweep?}   fan blades around a hub
//               {type:"grille", at, axis?, d, depth?, rings?, spokes?, wire?, twist?, hole?}   domed wire guard
//                                                       (hole = diameter of an open centre, e.g. for a motor shaft)
//             axis = "+x".."-z" or [x,y,z]: lathe default "+y", the others "+z" (facing the front).
//             every primitive may have mat (wood|hardboard|metal|black|white|fabric|plastic) and color "#rrggbb".
//             len_mm / d_mm (hardware only): shaft length and diameter (outer diameter for washers).
//   panels:   [{ key, part, pos:[x,y,z] (box centre in the finished piece), rot?:[deg,deg,deg], step, into?:[keys] }]
//             into = panels this one really goes inside (a pole in a socket, a shaft in a hub): their overlap is meant.
//             step = the step where the board goes into its final place. Before that it lies on the floor.
//   hardware: [{ key?, part, panel, at:[x,y,z] (point on the panel surface, panel coordinates),
//                dir:"+x"|"-x"|"+y"|"-y"|"+z"|"-z" (which way the hole faces), step, turn_step?, roll? }]
//   holes:    [{ panel, face, at:[x,y,z], d }]   extra pre-drilled holes (hardware holes are added automatically)
//   steps:    [{ title, text, tip?, warn?, need:[[partId, qty]], confidence?, page? }]   (step 1 = steps[0])

export const PANEL = 'panel';
export const HW_KINDS = ['dowel', 'cam_screw', 'cam_lock', 'nail', 'shelf_pin', 'screw', 'bolt', 'allen_bolt', 'washer', 'nut', 'bracket', 'other'];
export const MATS = ['wood', 'hardboard', 'metal', 'black', 'white', 'fabric', 'plastic'];
export const SHAPES = ['box', 'cyl', 'tube', 'plate', 'sphere', 'lathe', 'shell', 'sweep', 'blades', 'grille'];
export const KINDS = [PANEL, ...HW_KINDS];
export const DIRS = ['+x', '-x', '+y', '-y', '+z', '-z'];

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const vec = (v, d = [0, 0, 0]) => (Array.isArray(v) && v.length >= 3 ? v.slice(0, 3).map((x, i) => num(x, d[i])) : d.slice());
const str = (v, d = '') => (v == null ? d : String(v));
const clampInt = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.round(num(v, d))));
const pos = (v, d, lo = 0.5, hi = 5000) => Math.min(hi, Math.max(lo, num(v, d)));
const optNum = (v, lo, hi) => (v == null || !Number.isFinite(Number(v)) ? null : Math.min(hi, Math.max(lo, Number(v))));
const color = v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
const mat = v => (MATS.includes(v) ? v : null);

/** Rotate a vector by Euler angles in degrees, Three.js order XYZ (v' = Rx * Ry * Rz * v). */
export function rotate(v, rotDeg) {
  let [x, y, z] = v;
  const [a, b, c] = rotDeg.map(d => (d * Math.PI) / 180);
  [x, y] = [x * Math.cos(c) - y * Math.sin(c), x * Math.sin(c) + y * Math.cos(c)];
  [x, z] = [x * Math.cos(b) + z * Math.sin(b), -x * Math.sin(b) + z * Math.cos(b)];
  [y, z] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  return [x, y, z];
}

const PLANE_AXES = { xy: [0, 1, 2], xz: [0, 2, 1], yz: [1, 2, 0] }; // [u axis, v axis, thickness axis]
const AXES = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };
/** Unit vector from "+x".."-z" or [x,y,z]. */
function axisOf(v, d) {
  if (AXES[v]) return AXES[v].slice();
  const a = vec(v, [0, 0, 0]), L = Math.hypot(...a);
  return L > 1e-6 ? a.map(x => x / L) : d.slice();
}
const pts2 = (v, max) => (Array.isArray(v) ? v : []).filter(Array.isArray).slice(0, max).map(p => [num(p[0]), num(p[1])]);
const pts3 = (v, max) => (Array.isArray(v) ? v : []).filter(Array.isArray).slice(0, max).map(p => vec(p));

function normShape(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const q of list.slice(0, 60)) {
    if (!q || !SHAPES.includes(q.type)) continue;
    const base = { type: q.type, mat: mat(q.mat), color: color(q.color) };
    if (q.type === 'box') out.push({ ...base, at: vec(q.at), size: vec(q.size, [20, 20, 20]).map(v => pos(v, 20)), rot: vec(q.rot), r: Math.max(0, num(q.r, 0)) });
    else if (q.type === 'cyl') { const d = pos(q.d, 20); out.push({ ...base, from: vec(q.from), to: vec(q.to, [0, 100, 0]), d, d2: optNum(q.d2, 0, 5000) ?? d }); }
    else if (q.type === 'tube') {
      const path = pts3(q.path, 32);
      if (path.length < 2) continue;
      const d = pos(q.d, 20); out.push({ ...base, path, d, bend: Math.max(0, num(q.bend, d * 1.5)), square: !!q.square });
    } else if (q.type === 'plate') {
      const outline = pts2(q.outline, 96);
      if (outline.length < 3) continue;
      const thick = pos(q.thick, 18);
      out.push({ ...base, plane: PLANE_AXES[q.plane] ? q.plane : 'xy', outline, thick, at: vec(q.at), r: Math.min(thick * 0.49, Math.max(0, num(q.r, 0))) });
    } else if (q.type === 'sphere') out.push({ ...base, at: vec(q.at), d: pos(q.d, 20) });
    else if (q.type === 'lathe') {
      const profile = pts2(q.profile, 64).map(([r, h]) => [Math.max(0, r), h]);
      if (profile.length < 2) continue;
      out.push({ ...base, at: vec(q.at), axis: axisOf(q.axis, [0, 1, 0]), profile });
    } else if (q.type === 'shell') {
      const d = pos(q.d, 300);
      out.push({ ...base, at: vec(q.at), axis: axisOf(q.axis, [0, 0, 1]), d, depth: Math.min(d, Math.max(0, num(q.depth, d * 0.15))), thick: pos(q.thick, 2, 0.5, 50) });
    } else if (q.type === 'sweep') {
      const path = pts3(q.path, 32), profile = pts2(q.profile, 64);
      if (path.length < 2 || profile.length < 3) continue;
      out.push({ ...base, path, profile, bend: Math.max(0, num(q.bend, 30)), up: axisOf(q.up, [0, 1, 0]) });
    } else if (q.type === 'blades') {
      const d = pos(q.d, 300);
      out.push({ ...base, at: vec(q.at), axis: axisOf(q.axis, [0, 0, 1]), d, n: clampInt(q.n, 1, 12, 3),
        hub: Math.min(d * 0.8, pos(q.hub, d * 0.18)), width: Math.min(d, pos(q.width, d * 0.3)),
        pitch: Math.min(70, Math.max(-70, num(q.pitch, 25))), sweep: Math.min(90, Math.max(-90, num(q.sweep, 15))), thick: pos(q.thick, 2, 0.5, 30) });
    } else if (q.type === 'grille') {
      const d = pos(q.d, 300), wire = pos(q.wire, 2, 0.5, 20);
      out.push({ ...base, at: vec(q.at), axis: axisOf(q.axis, [0, 0, 1]), d, depth: Math.min(d, Math.max(0, num(q.depth, d * 0.12))),
        rings: clampInt(q.rings, 0, 40, 6), spokes: clampInt(q.spokes, 0, 120, 32), wire, rim: pos(q.rim, wire * 2.5, 0.5, 40),
        twist: Math.min(180, Math.max(-180, num(q.twist, 0))), hole: Math.min(d * 0.9, Math.max(0, num(q.hole, 0))) });
    }
  }
  return out.length ? out : null;
}

/** Axis-aligned boxes (in part coordinates) that cover each primitive. Tubes give one box per straight run. */
export function shapeBoxes(shape) {
  const boxes = [];
  const fromPts = (pts, pad = [0, 0, 0]) => boxes.push({
    min: [0, 1, 2].map(i => Math.min(...pts.map(p => p[i])) - pad[i]), max: [0, 1, 2].map(i => Math.max(...pts.map(p => p[i])) + pad[i])
  });
  // box around a round rod from a to b with radius r (a flat disc when a = b: then `axis` gives its direction)
  const rod = (a, b, r, axis = null) => {
    const ax = b.map((v, i) => v - a[i]), L = Math.hypot(...ax);
    const u = L > 1e-6 ? ax.map(v => v / L) : axis || [0, 0, 0];
    fromPts([a, b], u.map(v => r * Math.sqrt(Math.max(0, 1 - v ** 2))));
  };
  const along = (q, h) => q.at.map((v, i) => v + q.axis[i] * h);
  for (const q of shape || []) {
    if (q.type === 'box') {
      const c = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) c.push(rotate([sx * q.size[0] / 2, sy * q.size[1] / 2, sz * q.size[2] / 2], q.rot).map((v, i) => v + q.at[i]));
      fromPts(c);
    } else if (q.type === 'cyl') rod(q.from, q.to, Math.max(q.d, q.d2) / 2, [0, 1, 0]);
    else if (q.type === 'lathe') {
      for (let i = 1; i < q.profile.length; i++) {
        const [r0, h0] = q.profile[i - 1], [r1, h1] = q.profile[i];
        rod(along(q, h0), along(q, h1), Math.max(r0, r1, 0.5), q.axis);
      }
    } else if (q.type === 'shell') rod(q.at, along(q, q.depth + q.thick), q.d / 2);
    else if (q.type === 'grille') rod(along(q, -q.rim / 2), along(q, q.depth + q.wire), q.d / 2 + q.rim / 2);
    else if (q.type === 'blades') { const h = bladeDepth(q) / 2; rod(along(q, -h), along(q, h), q.d / 2); }
    else if (q.type === 'sweep') {
      const r = Math.max(...q.profile.map(p => Math.hypot(...p)));
      for (let i = 1; i < q.path.length; i++) fromPts([q.path[i - 1], q.path[i]], [r, r, r]);
    } else if (q.type === 'tube') {
      for (let i = 1; i < q.path.length; i++) fromPts([q.path[i - 1], q.path[i]], [q.d / 2, q.d / 2, q.d / 2]);
    } else if (q.type === 'plate') {
      const [u, v, n] = PLANE_AXES[q.plane], pts = [];
      for (const [a, b] of q.outline) for (const s of [-1, 1]) { const p = q.at.slice(); p[u] += a; p[v] += b; p[n] += (s * q.thick) / 2; pts.push(p); }
      fromPts(pts);
    } else if (q.type === 'sphere') fromPts([q.at], [q.d / 2, q.d / 2, q.d / 2]);
  }
  return boxes;
}

/** How far fan blades reach along their axis (pitch + hub), centred on "at". */
export const bladeDepth = q => Math.max(q.width * Math.abs(Math.sin((q.pitch * Math.PI) / 180)) + q.thick + q.width * 0.1, q.hub * 0.7);

function shiftShape(shape, c) {
  const m = p => p.map((v, i) => v - c[i]);
  return shape.map(q => q.type === 'cyl' ? { ...q, from: m(q.from), to: m(q.to) } : q.type === 'tube' || q.type === 'sweep' ? { ...q, path: q.path.map(m) } : { ...q, at: m(q.at) });
}

export function normalizeGuide(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Guide is not an object');
  const steps = (Array.isArray(raw.steps) ? raw.steps : []).map((s, i) => ({
    title: str(s.title, `Step ${i + 1}`).slice(0, 120),
    text: str(s.text ?? s.instruction),
    tip: s.tip ? str(s.tip) : null,
    warn: s.warn || s.warning ? str(s.warn ?? s.warning) : null,
    need: (Array.isArray(s.need) ? s.need : Array.isArray(s.parts) ? s.parts.map(p => [p.id, p.qty]) : [])
      .map(n => (Array.isArray(n) ? [str(n[0]), clampInt(n[1], 0, 999, 1)] : [str(n?.id), clampInt(n?.qty, 0, 999, 1)]))
      .filter(n => n[0]),
    confidence: ['high', 'medium', 'low'].includes(s.confidence) ? s.confidence : 'medium',
    page: s.page ?? s.manual_page ?? null
  }));
  if (!steps.length) throw new Error('Guide has no steps');
  const N = steps.length;

  const parts = {}, shift = {};
  const rawParts = Array.isArray(raw.parts) ? Object.fromEntries(raw.parts.map(p => [p.id, p])) : raw.parts || {};
  for (const [id, p] of Object.entries(rawParts)) {
    if (!id) continue;
    const shape0 = normShape(p.shape);
    const kind = KINDS.includes(p.kind) ? p.kind : (shape0 || (Array.isArray(p.size_mm) && p.size_mm.length === 3) ? PANEL : 'other');
    const part = parts[str(id)] = {
      name: str(p.name, 'Part').slice(0, 60), qty: clampInt(p.qty, 0, 999, 1), kind,
      size_mm: Array.isArray(p.size_mm) && p.size_mm.length >= 3 ? p.size_mm.slice(0, 3).map(v => Math.max(1, num(v, 18))) : null,
      look: str(p.look ?? p.note), finish: p.finish ? str(p.finish) : null,
      material: mat(p.material), color: color(p.color)
    };
    if (kind === PANEL && shape0) {
      // size and centre come from the shape, so the rest of the app can treat the part as a box around it
      const bx = shapeBoxes(shape0);
      const min = [0, 1, 2].map(i => Math.min(...bx.map(b => b.min[i]))), max = [0, 1, 2].map(i => Math.max(...bx.map(b => b.max[i])));
      const c = min.map((v, i) => (v + max[i]) / 2);
      const moved = c.some(v => Math.abs(v) > 0.01);
      part.shape = moved ? shiftShape(shape0, c) : shape0;
      part.size_mm = max.map((v, i) => Math.max(1, v - min[i]));
      if (moved) shift[str(id)] = c;
    }
    if (kind !== PANEL) {
      part.size_mm = null;
      part.len_mm = optNum(p.len_mm, 1, 600); part.d_mm = optNum(p.d_mm, 1, 200);
    }
  }

  const keys = new Set();
  const uniq = k => { let key = k, n = 2; while (keys.has(key)) key = `${k}-${n++}`; keys.add(key); return key; };
  const panels = (Array.isArray(raw.panels) ? raw.panels : []).filter(p => parts[p.part]?.kind === PANEL).map((p, i) => {
    const rot = vec(p.rot), c = shift[str(p.part)];
    let at = vec(p.pos);
    if (c) at = rotate(c, rot).map((v, k) => v + at[k]); // keep the part where it was after re-centring its shape
    return { key: uniq(str(p.key, `${p.part}${i}`)), part: str(p.part), pos: at, rot, step: clampInt(p.step, 1, N, 1),
      into: Array.isArray(p.into) ? p.into.map(k => str(k)).slice(0, 12) : [] };
  });
  const panelKeys = new Set(panels.map(p => p.key));
  panels.forEach(p => (p.into = p.into.filter(k => k !== p.key && panelKeys.has(k))));
  const partOf = Object.fromEntries(panels.map(p => [p.key, p.part]));
  const local = (panel, v) => { const c = shift[partOf[panel]]; return c ? v.map((x, i) => x - c[i]) : v; };
  const hardware = (Array.isArray(raw.hardware) ? raw.hardware : [])
    .filter(h => parts[h.part] && parts[h.part].kind !== PANEL && panelKeys.has(str(h.panel)))
    .map((h, i) => ({
      key: uniq(str(h.key, `${h.panel}-${h.part}-${i}`)), part: str(h.part), panel: str(h.panel), at: local(str(h.panel), vec(h.at)),
      dir: DIRS.includes(h.dir) ? h.dir : '+y', step: clampInt(h.step, 1, N, 1),
      turn_step: h.turn_step != null ? clampInt(h.turn_step, 1, N, 1) : null, roll: num(h.roll, 0)
    }));
  const holes = (Array.isArray(raw.holes) ? raw.holes : []).filter(h => panelKeys.has(str(h.panel)))
    .map(h => ({ panel: str(h.panel), face: DIRS.includes(h.face) ? h.face : '+y', at: local(str(h.panel), vec(h.at)), d: Math.max(2, num(h.d, 5)) }));

  // make sure every part used anywhere exists
  for (const s of steps) for (const [id] of s.need) if (!parts[id]) parts[id] = { name: 'Part', qty: 1, kind: 'other', size_mm: null, look: '', finish: null, material: null, color: null, len_mm: null, d_mm: null };

  return {
    version: 1, id: str(raw.id, ''), example: !!raw.example,
    product: str(raw.product, 'Your furniture').slice(0, 100), summary: str(raw.summary),
    people: clampInt(raw.people, 1, 4, 1), time_minutes: clampInt(raw.time_minutes, 0, 600, 0),
    tools: Array.isArray(raw.tools) ? raw.tools.map(t => str(t)).slice(0, 8) : [],
    scene: { wall_step: raw.scene?.wall_step ? clampInt(raw.scene.wall_step, 1, N, N) : null },
    unclear: Array.isArray(raw.unclear) ? raw.unclear.map(u => str(u)) : [],
    parts, panels, hardware, holes, steps
  };
}

/** Which step (1-based) first uses each part, for "comes in at step N". */
export function firstUse(guide) {
  const out = {};
  guide.steps.forEach((s, i) => s.need.forEach(([id]) => { if (out[id] == null) out[id] = i + 1; }));
  guide.panels.forEach(p => { if (out[p.part] == null || out[p.part] > p.step) out[p.part] = p.step; });
  guide.hardware.forEach(h => { if (out[h.part] == null || out[h.part] > h.step) out[h.part] = h.step; });
  return out;
}
