// Geometry and count checks for a normalized guide. Shared by server (repair pass) and client (warnings).
// Each issue: { level: 'error'|'warn'|'info', code, step: 1-based step or null, msg, refs: [keys] }.
// error = the 3D model is certainly inconsistent; warn = probably wrong; info = worth a look.
import { PANEL } from './guide.js';

const TOUCH = 3;      // mm: boards closer than this count as touching
const OVERLAP = 1.5;  // mm: boards that sink into each other deeper than this overlap
const AX = { '+x': [0, 1], '-x': [0, -1], '+y': [1, 1], '-y': [1, -1], '+z': [2, 1], '-z': [2, -1] };

// Three.js Euler order XYZ: v' = Rx * Ry * Rz * v
function rotate(v, rotDeg) {
  let [x, y, z] = v;
  const [a, b, c] = rotDeg.map(d => (d * Math.PI) / 180);
  [x, y] = [x * Math.cos(c) - y * Math.sin(c), x * Math.sin(c) + y * Math.cos(c)];
  [x, z] = [x * Math.cos(b) + z * Math.sin(b), -x * Math.sin(b) + z * Math.cos(b)];
  [y, z] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  return [x, y, z];
}
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, s) => a.map(v => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = dir => { const [i, s] = AX[dir]; const v = [0, 0, 0]; v[i] = s; return v; };
const isRightAngles = rot => rot.every(d => Math.abs(d / 90 - Math.round(d / 90)) < 1e-6);
const r1 = v => Math.round(v);

export function checkGuide(g) {
  const out = [];
  const say = (level, code, step, msg, refs = []) => out.push({ level, code, step, msg, refs });
  const P = g.parts;
  const nm = id => `${P[id]?.name || 'Part'} (${id})`;

  // ---- world boxes of the boards in the finished piece
  const boards = g.panels.map(p => {
    const size = P[p.part].size_mm || [18, 18, 18];
    const toWorld = v => add(rotate(v, p.rot), p.pos);
    const corners = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push(toWorld([sx * size[0] / 2, sy * size[1] / 2, sz * size[2] / 2]));
    const min = [0, 1, 2].map(i => Math.min(...corners.map(c => c[i])));
    const max = [0, 1, 2].map(i => Math.max(...corners.map(c => c[i])));
    return { p, size, toWorld, min, max, exact: isRightAngles(p.rot), dirWorld: d => rotate(unit(d), p.rot) };
  });
  const byKey = Object.fromEntries(boards.map(b => [b.p.key, b]));
  const inside = (b, pt, tol = 0.5) => b.exact && [0, 1, 2].every(i => pt[i] > b.min[i] - tol && pt[i] < b.max[i] + tol);
  const boardAt = (pt, skip, tol) => boards.find(b => b !== skip && inside(b, pt, tol));

  // ---- inventory: boards
  for (const [id, part] of Object.entries(P)) {
    if (part.kind !== PANEL) continue;
    const n = g.panels.filter(p => p.part === id).length;
    if (n !== part.qty) say('error', 'board-count', null, `${nm(id)}: the parts list says ${part.qty}, but the 3D model has ${n}.`, [id]);
    if (!part.size_mm) say('warn', 'board-size', null, `${nm(id)} has no size. It is drawn as a small cube.`, [id]);
    else {
      const t = Math.min(...part.size_mm);
      if (t < 2 || t > 60) say('warn', 'board-thickness', null, `${nm(id)} is ${r1(t)} mm thick. Boards are usually 3 to 40 mm.`, [id]);
    }
  }

  // ---- boards: overlaps, contact, floor
  if (boards.length) {
    const floor = Math.min(...boards.map(b => b.min[1]));
    if (Math.abs(floor) > TOUCH) say('warn', 'floor', null, `The lowest board is ${r1(floor)} mm ${floor > 0 ? 'above' : 'below'} the floor.`);
  }
  for (let i = 0; i < boards.length; i++) {
    const a = boards[i];
    if (!a.exact) say('info', 'board-angle', a.p.step, `Board ${a.p.key} is turned at an angle, so its fit is not checked.`, [a.p.key]);
    let touches = a.min[1] <= TOUCH;
    for (let j = 0; j < boards.length; j++) {
      if (i === j) continue;
      const b = boards[j];
      const depth = [0, 1, 2].map(k => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]));
      if (j > i && a.exact && b.exact && depth.every(d => d > OVERLAP))
        say('error', 'overlap', Math.max(a.p.step, b.p.step), `Boards ${a.p.key} and ${b.p.key} pass through each other by ${r1(Math.min(...depth))} mm.`, [a.p.key, b.p.key]);
      if (depth.every(d => d > -TOUCH) && depth.filter(d => d > TOUCH).length >= 2) touches = true;
    }
    if (!touches) say('warn', 'floating', a.p.step, `Board ${a.p.key} (${P[a.p.part].name}) does not touch any other board or the floor.`, [a.p.key]);
  }

  // ---- inventory: hardware
  const placed = {};
  g.hardware.forEach(h => (placed[h.part] = (placed[h.part] || 0) + 1));
  for (const [id, part] of Object.entries(P)) {
    if (part.kind === PANEL) continue;
    const n = placed[id] || 0;
    if (n > part.qty) say('error', 'hw-count', null, `${nm(id)}: the parts list says ${part.qty}, but the 3D model uses ${n}.`, [id]);
    else if (n === 0 && part.qty > 0) say('info', 'hw-unplaced', null, `${nm(id)} is not shown in the 3D model.`, [id]);
    else if (n < part.qty) say('info', 'hw-spare', null, `${nm(id)}: ${part.qty - n} of ${part.qty} are not used in the 3D model (spares?).`, [id]);
  }

  // ---- each piece of hardware
  const seen = [];
  const camLocks = g.hardware.filter(h => P[h.part].kind === 'cam_lock' && byKey[h.panel]);
  const usedLocks = new Set();
  for (const h of g.hardware) {
    const b = byKey[h.panel], kind = P[h.part].kind;
    if (!b) continue;
    const [ax, s] = AX[h.dir];
    const half = b.size.map(v => v / 2);
    const label = `${P[h.part].name} on board ${h.panel}`;
    if (h.turn_step != null && h.turn_step < h.step) say('error', 'turn-order', h.turn_step, `A ${label} is turned before it goes in.`, [h.key]);
    if (kind === 'cam_lock' && h.turn_step == null) say('warn', 'turn-missing', h.step, `A ${label} is never turned.`, [h.key]);

    // on the board: the face named by dir, inside its outline
    if (Math.abs(h.at[ax] - s * half[ax]) > 2) say('warn', 'hw-face', h.step, `A ${label} is ${r1(Math.abs(h.at[ax] - s * half[ax]))} mm away from the ${h.dir} face it is said to go into.`, [h.key]);
    const off = [0, 1, 2].filter(i => i !== ax && Math.abs(h.at[i]) > half[i] + 0.5);
    if (off.length) { say('error', 'hw-off-board', h.step, `A ${label} is outside the board's edge.`, [h.key]); continue; }

    const at = h.at.slice(); at[ax] = s * half[ax];
    const world = b.toWorld(at), d = b.dirWorld(h.dir);
    if (seen.some(o => o.panel === h.panel && Math.hypot(...sub(o.world, world)) < 4)) say('error', 'hw-double', h.step, `Two pieces of hardware sit in the same spot on board ${h.panel}.`, [h.key]);
    seen.push({ panel: h.panel, world });
    if (!b.exact) continue;

    // does it reach the board it is meant to join?
    if (kind === 'dowel' || kind === 'cam_screw') {
      const into = boardAt(add(world, scale(d, 6)), b);
      if (!into) say('warn', 'hw-no-partner', h.step, `A ${label} does not point into another board.`, [h.key]);
      else if (kind === 'cam_screw') {
        // a cam lock in the receiving board should sit on the screw's line, 15–60 mm in
        const lock = camLocks.find(l => {
          if (l.panel !== into.p.key || usedLocks.has(l.key)) return false;
          const lb = byKey[l.panel], la = l.at.slice(), [lax, ls] = AX[l.dir]; la[lax] = ls * lb.size[lax] / 2;
          const q = sub(lb.toWorld(la), world), t = dot(q, d), ld = lb.dirWorld(l.dir);
          const lat = sub(sub(q, scale(d, t)), scale(ld, dot(q, ld)));
          return t > 12 && t < 60 && Math.hypot(...lat) < 8;
        });
        if (lock) usedLocks.add(lock.key);
        else if (camLocks.length) say('warn', 'cam-unpaired', h.step, `A ${label} has no cam lock in board ${into.p.key} to grab it.`, [h.key]);
      }
    } else if (kind === 'nail' || kind === 'screw') {
      const through = b.size[ax] + 5; // passes through this board into the next
      if (!boardAt(add(world, scale(d, -through)), b)) say('warn', 'hw-no-partner', h.step, `A ${label} does not go into another board behind it.`, [h.key]);
    } else if (kind === 'shelf_pin') {
      const tip = add(world, scale(d, 6));
      if (boardAt(tip, b, -0.5)) say('warn', 'pin-blocked', h.step, `A ${label} points into another board.`, [h.key]);
      else if (!boards.some(o => o !== b && o.exact && o.min[1] - tip[1] > -1 && o.min[1] - tip[1] < 8 && [0, 2].every(k => tip[k] > o.min[k] - 4 && tip[k] < o.max[k] + 4)))
        say('info', 'pin-free', h.step, `Nothing rests on a ${label}.`, [h.key]);
    }
  }
  for (const l of camLocks) if (!usedLocks.has(l.key) && g.hardware.some(h => P[h.part].kind === 'cam_screw'))
    say('warn', 'cam-unpaired', l.step, `A ${P[l.part].name} on board ${l.panel} has no cam screw to grab.`, [l.key]);

  // ---- steps: what goes in must be in that step's "take these parts" list
  g.steps.forEach((st, i) => {
    const n = i + 1, need = Object.fromEntries(st.need);
    const used = {};
    g.hardware.filter(h => h.step === n).forEach(h => (used[h.part] = (used[h.part] || 0) + 1));
    for (const [id, c] of Object.entries(used)) {
      const before = g.steps.slice(0, i).reduce((sum, s) => sum + (Object.fromEntries(s.need)[id] || 0), 0);
      const earlier = g.hardware.filter(h => h.part === id && h.step < n).length;
      if ((need[id] || 0) + Math.max(0, before - earlier) < c) say('warn', 'need-missing', n, `This step puts in ${c} × ${nm(id)}, but the list says to take ${need[id] || 0}.`, [id]);
    }
    for (const p of g.panels.filter(p => p.step === n)) {
      const taken = g.steps.slice(0, n).reduce((sum, s) => sum + (Object.fromEntries(s.need)[p.part] || 0), 0);
      const fitted = g.panels.filter(q => q.part === p.part && q.step <= n).length;
      if (taken < fitted && !g.hardware.some(h => h.panel === p.key && h.step < n)) say('info', 'need-board', n, `Board ${p.key} is fitted here but no step says to take ${nm(p.part)}.`, [p.key]);
    }
  });

  // merge repeats: same problem on several identical pieces becomes one line with a count
  const merged = new Map();
  for (const i of out) {
    const k = `${i.level}|${i.code}|${i.step}|${i.msg}`;
    if (merged.has(k)) { const m = merged.get(k); m.count++; m.refs.push(...i.refs); } else merged.set(k, { ...i, count: 1, refs: [...i.refs] });
  }
  const order = { error: 0, warn: 1, info: 2 };
  return [...merged.values()].sort((a, b) => order[a.level] - order[b.level] || (a.step ?? 0) - (b.step ?? 0));
}

/** Short summary for logs and the repair prompt. */
export const countIssues = issues => ({ error: issues.filter(i => i.level === 'error').length, warn: issues.filter(i => i.level === 'warn').length });

/** One line per issue, e.g. "step 3: A Cam screw on board AL ... (4 times)". */
export const issueLine = i => `${i.step ? `step ${i.step}` : 'whole guide'}: ${i.msg}${i.count > 1 ? ` (${i.count} times)` : ''}`;
