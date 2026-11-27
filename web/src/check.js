// Geometry and count checks for a normalized guide. Shared by server (repair pass) and client (warnings).
// Each issue: { level: 'error'|'warn'|'info', code, step: 1-based step or null, msg, refs: [keys] }.
// error = the 3D model is certainly inconsistent; warn = probably wrong; info = worth a look.
import { PANEL, rotate, shapeBoxes } from './guide.js';
import { solidOf, contact } from './collide.js';

const TOUCH = 3;      // mm: boards closer than this count as touching
const OVERLAP = 1.5;  // mm: boards that sink into each other deeper than this overlap
const SINK = 3;       // mm: the same for shaped or tilted parts (their surfaces are sampled, so allow a little more)
const AX = { '+x': [0, 1], '-x': [0, -1], '+y': [1, 1], '-y': [1, -1], '+z': [2, 1], '-z': [2, -1] };

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, s) => a.map(v => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = dir => { const [i, s] = AX[dir]; const v = [0, 0, 0]; v[i] = s; return v; };
const isRightAngles = rot => rot.every(d => Math.abs(d / 90 - Math.round(d / 90)) < 1e-6);
const r1 = v => Math.round(v);
// 2D (x, z) convex hull, counter-clockwise (monotone chain)
function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => { const h = []; for (const q of list) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); } h.pop(); return h; };
  return p.length < 3 ? p : [...half(p), ...half(p.reverse())];
}
// how far point q lies outside the convex polygon (0 or less = inside)
function beyond(poly, q) {
  if (poly.length < 3) return Math.min(...poly.map(v => Math.hypot(v[0] - q[0], v[1] - q[1])));
  let out = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    out = Math.max(out, -((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / len);
  }
  return out;
}

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
    // shaped parts: one world box per primitive (a little loose when turned, good enough for contact checks)
    const shape = P[p.part].shape, local = shape ? shapeBoxes(shape) : null;
    const boxes = local ? local.map(lb => {
      const c = [];
      for (const x of [lb.min[0], lb.max[0]]) for (const y of [lb.min[1], lb.max[1]]) for (const z of [lb.min[2], lb.max[2]]) c.push(toWorld([x, y, z]));
      return { min: [0, 1, 2].map(i => Math.min(...c.map(q => q[i]))), max: [0, 1, 2].map(i => Math.max(...c.map(q => q[i]))) };
    }) : [{ min, max }];
    return { p, size, toWorld, min, max, boxes, local, shaped: !!shape, exact: !shape && isRightAngles(p.rot), dirWorld: d => rotate(unit(d), p.rot) };
  });
  const byKey = Object.fromEntries(boards.map(b => [b.p.key, b]));
  const inBox = (bx, pt, tol) => [0, 1, 2].every(i => pt[i] > bx.min[i] - tol && pt[i] < bx.max[i] + tol);
  const inside = (b, pt, tol = 0.5) => (b.shaped ? b.boxes.some(bx => inBox(bx, pt, tol)) : b.exact && inBox(b, pt, tol));
  const gap = (a, b) => Math.max(...[0, 1, 2].map(k => Math.max(a.min[k], b.min[k]) - Math.min(a.max[k], b.max[k])));
  const boardAt = (pt, skip, tol) => boards.find(b => b !== skip && inside(b, pt, tol));
  // for a screw that misses: what is around it, so the repair knows which way to move it
  const missHint = (world, back, b, len) => {
    for (let t = 0; t <= 10; t++) { const o = boardAt(add(world, scale(back, -t)), b); if (o) return ` It points at ${o.p.key} instead: turn it round, or put it on the far side of ${o.p.key}.`; }
    for (let t = 2; t <= 300; t += 2) { const o = boardAt(add(world, scale(back, t)), b); if (o) return ` The next part behind it, ${o.p.key}, is ${t} mm away${len ? ` and it is ${len} mm long` : ''}.`; }
    return '';
  };

  // ---- inventory: boards
  for (const [id, part] of Object.entries(P)) {
    if (part.kind !== PANEL) continue;
    const n = g.panels.filter(p => p.part === id).length;
    if (n !== part.qty) say('error', 'board-count', null, `${nm(id)}: the parts list says ${part.qty}, but the 3D model has ${n}.`, [id]);
    if (part.shape) {
      // several thin boxes in one part: probably boards that come separately in the box (a drawer drawn as one finished box)
      const boards = part.shape.filter(q => q.type === 'box' && Math.min(...q.size) <= 25 && Math.max(...q.size) >= 150);
      if (boards.length >= 3) say('warn', 'merged-boards', null, `${nm(id)} is drawn as ${boards.length} boards in one part. If they come as separate boards in the box, give each board its own part and panel, so the steps that join them can be shown.`, [id]);
      continue;
    }
    if (!part.size_mm) say('warn', 'board-size', null, `${nm(id)} has no size. It is drawn as a small cube.`, [id]);
    else {
      const t = Math.min(...part.size_mm);
      if (t < 2 || t > 60) say('warn', 'board-thickness', null, `${nm(id)} is ${r1(t)} mm thick. Boards are usually 3 to 40 mm; if it is not a flat board (a cushion, base, wheel, cylinder or frame), give it a "shape".`, [id]);
    }
  }

  // ---- boards: overlaps, contact, floor
  if (boards.length) {
    const floor = Math.min(...boards.flatMap(b => b.boxes.map(x => x.min[1])));
    if (Math.abs(floor) > TOUCH) say('warn', 'floor', null, `The lowest board is ${r1(floor)} mm ${floor > 0 ? 'above' : 'below'} the floor.`);
  }
  // shaped or tilted parts: test their real surfaces (collide.js), once per pair
  const solid = b => (b.solid ||= solidOf(b.p, P[b.p.part]));
  const contacts = new Map();
  const contactOf = (a, b) => {
    const k = a.p.key < b.p.key ? `${a.p.key}|${b.p.key}` : `${b.p.key}|${a.p.key}`;
    if (!contacts.has(k)) contacts.set(k, gap(a, b) < TOUCH + 1 ? contact(solid(a), solid(b), TOUCH) : null);
    return contacts.get(k);
  };
  const joined = (a, b) => (a.p.into || []).includes(b.p.key) || (b.p.into || []).includes(a.p.key);
  const where = pt => `near [${pt.map(r1).join(', ')}] mm`;
  for (let i = 0; i < boards.length; i++) {
    const a = boards[i];
    let touches = a.min[1] <= TOUCH;
    for (let j = 0; j < boards.length; j++) {
      if (i === j) continue;
      const b = boards[j];
      const depth = [0, 1, 2].map(k => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]));
      if (a.exact && b.exact) {
        if (j > i && !joined(a, b) && depth.every(d => d > OVERLAP))
          say('error', 'overlap', Math.max(a.p.step, b.p.step), `Boards ${a.p.key} and ${b.p.key} pass through each other by ${r1(Math.min(...depth))} mm.`, [a.p.key, b.p.key]);
        if (depth.every(d => d > -TOUCH) && depth.filter(d => d > TOUCH).length >= 2) touches = true;
        continue;
      }
      const c = contactOf(a, b);
      if (!c) continue;
      if (c.gap < TOUCH || c.depth > 0 || c.cross) touches = true;
      if (j > i && !joined(a, b) && (c.cross || c.depth > SINK)) {
        const how = c.cross ? 'go through each other' : `pass through each other by ${r1(c.depth)} mm`;
        say('error', 'overlap', Math.max(a.p.step, b.p.step), `Parts ${a.p.key} and ${b.p.key} ${how}${c.at ? ' ' + where(c.at) : ''}.`, [a.p.key, b.p.key]);
      }
    }
    if (!touches) say('warn', 'floating', a.p.step, `Board ${a.p.key} (${P[a.p.part].name}) does not touch any other board or the floor.`, [a.p.key]);
  }

  // ---- standing on its own while it is built: what stands in its final place after a step must not tip over.
  // One side panel with shelves sticking out of it falls; a manual builds that lying down, which is a group here.
  // Weight = the boards' volume, feet = where they touch the floor. Boards in a group lie on the floor in the group's
  // pose and are left out, and so is everything from the step that fixes the piece to the wall.
  if (boards.length) {
    const floorY = Math.min(...boards.flatMap(b => b.boxes.map(x => x.min[1])));
    const onFloor = x => x.min[1] - floorY <= TOUCH;
    const inGroup = (b, n) => (g.groups || []).some(gr => gr.panels.includes(b.p.key) && b.p.step <= n && n < gr.until);
    const otherBox = b => P[b.p.part].in_box === false; // furniture from another box is simply there
    // shaped parts: their pieces' boxes, at a third (a tube or a leg fills little of its box)
    const weights = b => (b.shaped
      ? b.boxes.map(x => ({ w: 0.3 * [0, 1, 2].reduce((v, i) => v * Math.max(1, x.max[i] - x.min[i]), 1), c: [0, 1, 2].map(i => (x.min[i] + x.max[i]) / 2) }))
      : [{ w: b.size[0] * b.size[1] * b.size[2], c: b.p.pos }]);
    const last = g.scene?.wall_step ? g.scene.wall_step - 1 : g.steps.length;
    // one line per stretch of steps in which the same piece (growing as boards are added) cannot stand
    const runs = [];
    let open = [];
    for (let n = 1; n <= last; n++) {
      const standing = boards.filter(b => otherBox(b) || (b.p.step <= n && !inGroup(b, n)));
      // boards that touch hold together: one piece each
      const up = new Map(standing.map(b => [b, b]));
      const top = b => (up.get(b) === b ? b : top(up.get(b)));
      for (let i = 0; i < standing.length; i++) for (let j = i + 1; j < standing.length; j++)
        if (gap(standing[i], standing[j]) < TOUCH + 1) up.set(top(standing[i]), top(standing[j]));
      const pieces = new Map();
      standing.forEach(b => pieces.set(top(b), [...(pieces.get(top(b)) || []), b]));
      const tipping = [];
      for (const mem of pieces.values()) {
        if (mem.length < 2 || mem.every(otherBox)) continue;
        const feet = mem.flatMap(b => b.boxes.filter(onFloor).flatMap(x => [[x.min[0], x.min[2]], [x.max[0], x.min[2]], [x.max[0], x.max[2]], [x.min[0], x.max[2]]]));
        if (!feet.length) continue; // resting on nothing: the floating check says so
        const ws = mem.flatMap(weights), W = ws.reduce((s, m) => s + m.w, 0);
        const mid = [0, 2].map(i => ws.reduce((s, m) => s + m.w * m.c[i], 0) / W);
        const out = beyond(hull(feet), mid);
        if (out > 10) tipping.push({ mem, out, feet: mem.filter(b => b.boxes.some(onFloor)) });
      }
      open = tipping.map(t => {
        const run = open.find(r => r.mem.some(b => t.mem.includes(b)));
        if (run) return Object.assign(run, { end: n, mem: t.mem, feet: t.feet, out: Math.max(run.out, t.out) });
        const fresh = { start: n, end: n, ...t };
        runs.push(fresh);
        return fresh;
      });
    }
    for (const r of runs) {
      const keys = r.mem.map(b => b.p.key), named = keys.length > 8 ? `${keys.slice(0, 8).join(', ')} and ${keys.length - 8} more` : keys.join(', ');
      say('warn', 'tips-over', r.start, `${r.end > r.start ? `From this step to step ${r.end}` : 'After this step'}, ${named} would fall over: the piece stands on the floor only on ${r.feet.map(b => b.p.key).join(', ')}, and ${r1(r.out)} mm of its weight hangs beyond that. A person cannot build it like this. If the manual builds it lying down (on its side, back or front), add a group for these boards with "rot" and "until" = the step where it is stood up.`, keys);
    }
  }

  // ---- inventory: hardware
  const placed = {};
  g.hardware.forEach(h => (placed[h.part] = (placed[h.part] || 0) + 1));
  const usedIn = id => g.steps.map((st, i) => (st.need.some(([n]) => n === id) ? i + 1 : 0)).filter(Boolean);
  const FIXINGS = ['dowel', 'cam_screw', 'cam_lock', 'nail', 'shelf_pin', 'screw', 'bolt', 'allen_bolt', 'washer', 'nut', 'bracket', 'knob', 'foot', 'cap'];
  for (const [id, part] of Object.entries(P)) {
    if (part.kind === PANEL) continue;
    const n = placed[id] || 0, steps = usedIn(id);
    // no name and no kind: the reader cannot tell what it is, and the viewer draws a plain block
    if (part.name === 'Part' && part.kind === 'other') say('error', 'part-unknown', steps[0] ?? null, `Part ${id} has no name or kind in the parts list${steps.length ? ` (it is used in step ${steps.join(', ')})` : ''}.`, [id]);
    else if (part.kind === 'other' && !part.shape && n > 0) say('info', 'part-block', null, `${nm(id)} is drawn as a plain block: give it a kind (knob, foot, cap, ...) or a "shape".`, [id]);
    if (n > part.qty) say('error', 'hw-count', null, `${nm(id)}: the parts list says ${part.qty}, but the 3D model uses ${n}.`, [id]);
    else if (n === 0 && part.qty > 1 && steps.length && FIXINGS.includes(part.kind))
      say('warn', 'hw-unplaced', steps[0], `${nm(id)}: ${part.qty} are used in step ${steps.join(', ')}, but none are shown in the 3D model.`, [id]);
    else if (n === 0 && part.qty > 0) say('info', 'hw-unplaced', null, `${nm(id)} is not shown in the 3D model.`, [id]);
    else if (n < part.qty) say('info', 'hw-spare', null, `${nm(id)}: ${part.qty - n} of ${part.qty} are not used in the 3D model (spares?).`, [id]);
    // brackets come in many forms (hooks, cradles, clips): the built-in angle fits wall and corner angles only
    if (part.kind === 'bracket' && !part.shape && n > 0 && !/\b(wall|angle|corner|anti[- ]?tip|tip[- ]?over|l[- ]?shaped)\b/i.test(`${part.name} ${part.look || ''}`))
      say('warn', 'plain-fitting', g.hardware.find(h => h.part === id).step, `${nm(id)} is drawn as a plain angle bracket. Draw its real form as a "shape" from the manual's drawing of it.`, [id]);
  }

  // ---- each piece of hardware
  const seen = [];
  // a head that sits inside another part cannot be fitted (and cannot be seen): a cap or bolt head buried in a cushion
  const buriedIn = (pt, own) => boards.find(o => o !== own && [0, 1, 2].every(i => pt[i] > o.min[i] - 1 && pt[i] < o.max[i] + 1) &&
    (o.shaped || !o.exact ? solid(o).prims.some(q => q.sdf && q.sdf(solid(o).toLocal(pt)) < -2) : inBox(o, pt, -2)));
  const HEADS = ['screw', 'bolt', 'allen_bolt', 'cap', 'knob', 'foot'];
  const camLocks = g.hardware.filter(h => P[h.part].kind === 'cam_lock' && byKey[h.panel]);
  const usedLocks = new Set();
  // a cam lock in the receiving board should sit on the screw's line, 12–60 mm in
  const pairLock = (h, label, world, d, into) => {
    const lock = camLocks.find(l => {
      if (l.panel !== into.p.key || usedLocks.has(l.key)) return false;
      const lb = byKey[l.panel], la = l.at.slice(), [lax, ls] = AX[l.dir];
      if (!lb.shaped) la[lax] = ls * lb.size[lax] / 2;
      const q = sub(lb.toWorld(la), world), t = dot(q, d), ld = lb.dirWorld(l.dir);
      const lat = sub(sub(q, scale(d, t)), scale(ld, dot(q, ld)));
      return t > 12 && t < 60 && Math.hypot(...lat) < 8;
    });
    if (lock) usedLocks.add(lock.key);
    else if (camLocks.length) say('warn', 'cam-unpaired', h.step, `A ${label} has no cam lock in board ${into.p.key} to grab it.`, [h.key]);
  };
  for (const h of g.hardware) {
    const b = byKey[h.panel], kind = P[h.part].kind;
    if (!b) continue;
    const [ax, s] = AX[h.dir];
    const half = b.size.map(v => v / 2);
    const label = `${P[h.part].name} on board ${h.panel}`;
    if (h.turn_step != null && h.turn_step < h.step) say('error', 'turn-order', h.turn_step, `A ${label} is turned before it goes in.`, [h.key]);
    if (kind === 'cam_lock' && h.turn_step == null) say('warn', 'turn-missing', h.step, `A ${label} is never turned.`, [h.key]);
    const stacks = ['washer', 'nut', 'cap', 'knob', 'other'].includes(kind); // these sit on another fixing by design (a cap on a bolt head, a knob on its screw)
    // a screw next to a bracket on the same board holds that bracket: it only has to go into this board
    const holdsBracket = ['screw', 'nail'].includes(kind) && g.hardware.some(o => o !== h && o.panel === h.panel && P[o.part].kind === 'bracket' && Math.hypot(...sub(o.at, h.at)) < 40);

    if (b.shaped) {
      // on a shaped part: the point must be on (or very near) one of its pieces
      const miss = Math.min(...b.local.map(lb => Math.max(0, ...[0, 1, 2].map(i => Math.max(lb.min[i] - h.at[i], h.at[i] - lb.max[i])))));
      if (miss > 3) { say('error', 'hw-off-board', h.step, `A ${label} is ${r1(miss)} mm away from the part.`, [h.key]); continue; }
      const world = b.toWorld(h.at), d = b.dirWorld(h.dir);
      if (!stacks && seen.some(o => o.panel === h.panel && !o.stacks && Math.hypot(...sub(o.world, world)) < 4)) say('error', 'hw-double', h.step, `Two pieces of hardware sit in the same spot on part ${h.panel}.`, [h.key]);
      seen.push({ panel: h.panel, world, stacks });
      if (HEADS.includes(kind)) { const o = buriedIn(add(world, scale(d, 3)), b); if (o) say('warn', 'hw-buried', h.step, `A ${label} sits inside ${o.p.key}: it cannot be fitted there and is hidden in the 3D view.`, [h.key]); }
      if (['screw', 'bolt', 'allen_bolt', 'nail', 'dowel', 'cam_screw'].includes(kind) && !holdsBracket) {
        // it should reach another part: forwards for pegs, backwards (through this part) for screws and bolts
        const sign = kind === 'dowel' || kind === 'cam_screw' ? 1 : -1;
        let hit = null;
        for (let t = 2; t <= 90 && !hit; t += 2) hit = boardAt(add(world, scale(d, sign * t)), b);
        if (!hit) say('warn', 'hw-no-partner', h.step, `A ${label} does not reach another part.${sign < 0 ? missHint(world, scale(d, -1), b, P[h.part].len_mm) : ''}`, [h.key]);
        else if (kind === 'cam_screw') pairLock(h, label, world, d, hit);
      }
      continue;
    }

    // on the board: the face named by dir, inside its outline
    if (Math.abs(h.at[ax] - s * half[ax]) > 2) say('warn', 'hw-face', h.step, `A ${label} is ${r1(Math.abs(h.at[ax] - s * half[ax]))} mm away from the ${h.dir} face it is said to go into.`, [h.key]);
    const off = [0, 1, 2].filter(i => i !== ax && Math.abs(h.at[i]) > half[i] + 0.5);
    if (off.length) { say('error', 'hw-off-board', h.step, `A ${label} is outside the board's edge.`, [h.key]); continue; }

    const at = h.at.slice(); at[ax] = s * half[ax];
    const world = b.toWorld(at), d = b.dirWorld(h.dir);
    if (!stacks && seen.some(o => o.panel === h.panel && !o.stacks && Math.hypot(...sub(o.world, world)) < 4)) say('error', 'hw-double', h.step, `Two pieces of hardware sit in the same spot on board ${h.panel}.`, [h.key]);
    seen.push({ panel: h.panel, world, stacks });
    if (HEADS.includes(kind)) { const o = buriedIn(add(world, scale(d, 3)), b); if (o) say('warn', 'hw-buried', h.step, `A ${label} sits inside ${o.p.key}: it cannot be fitted there and is hidden in the 3D view.`, [h.key]); }
    if (!b.exact) continue;

    // does it reach the board it is meant to join?
    if (kind === 'dowel' || kind === 'cam_screw') {
      const into = boardAt(add(world, scale(d, 6)), b);
      if (!into) say('warn', 'hw-no-partner', h.step, `A ${label} does not point into another board.`, [h.key]);
      else if (kind === 'cam_screw') pairLock(h, label, world, d, into);
    } else if ((kind === 'nail' || kind === 'screw' || kind === 'bolt' || kind === 'allen_bolt') && !holdsBracket) {
      const through = b.size[ax] + 5; // passes through this board into the next
      const hits = kind === 'nail' || kind === 'screw' ? [through] : Array.from({ length: 30 }, (_, i) => through + i * 2);
      if (!hits.some(t => boardAt(add(world, scale(d, -t)), b))) say('warn', 'hw-no-partner', h.step, `A ${label} does not go into another board behind it.${missHint(world, scale(d, -1), b, P[h.part].len_mm)}`, [h.key]);
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
    for (const p of g.panels.filter(p => p.step === n && P[p.part].in_box !== false)) { // other-box furniture is not taken from the box
      const taken = g.steps.slice(0, n).reduce((sum, s) => sum + (Object.fromEntries(s.need)[p.part] || 0), 0);
      const fitted = g.panels.filter(q => q.part === p.part && q.step <= n).length;
      if (taken < fitted && !g.hardware.some(h => h.panel === p.key && h.step < n)) say('info', 'need-board', n, `Board ${p.key} is fitted here but no step says to take ${nm(p.part)}.`, [p.key]);
    }
  });

  // ---- steps the 3D view cannot show: nothing new arrives, moves into place or turns
  const shown = new Set([...g.panels.map(p => p.step), ...g.hardware.flatMap(h => [h.step, h.turn_step]), ...(g.groups || []).map(gr => gr.until), g.scene?.wall_step]);
  g.steps.forEach((st, i) => {
    if (!shown.has(i + 1)) say('warn', 'step-empty', i + 1, 'Nothing changes in the 3D view in this step. Follow the text and the paper manual.');
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
