// The Buildwise guide format, shared by the AI server and the 3D viewer.
//
// Units are millimetres. World axes: x = left→right, y = up from the floor, z = back (0) → front.
//   parts:    { "<id>": { name, qty, kind, size_mm?, look?, finish? } }
//             kind = panel | dowel | cam_screw | cam_lock | nail | shelf_pin | screw | bolt | bracket | other
//   panels:   [{ key, part, pos:[x,y,z] (box centre in the finished piece), rot?:[deg,deg,deg], step }]
//             step = the step where the board goes into its final place. Before that it lies on the floor.
//   hardware: [{ key?, part, panel, at:[x,y,z] (point on the panel surface, panel coordinates),
//                dir:"+x"|"-x"|"+y"|"-y"|"+z"|"-z" (which way the hole faces), step, turn_step?, roll? }]
//   holes:    [{ panel, face, at:[x,y,z], d }]   extra pre-drilled holes (hardware holes are added automatically)
//   steps:    [{ title, text, tip?, warn?, need:[[partId, qty]], confidence?, page? }]   (step 1 = steps[0])

export const PANEL = 'panel';
export const HW_KINDS = ['dowel', 'cam_screw', 'cam_lock', 'nail', 'shelf_pin', 'screw', 'bolt', 'bracket', 'other'];
export const KINDS = [PANEL, ...HW_KINDS];
export const DIRS = ['+x', '-x', '+y', '-y', '+z', '-z'];

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const vec = (v, d = [0, 0, 0]) => (Array.isArray(v) && v.length >= 3 ? v.slice(0, 3).map((x, i) => num(x, d[i])) : d.slice());
const str = (v, d = '') => (v == null ? d : String(v));
const clampInt = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.round(num(v, d))));

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

  const parts = {};
  const rawParts = Array.isArray(raw.parts) ? Object.fromEntries(raw.parts.map(p => [p.id, p])) : raw.parts || {};
  for (const [id, p] of Object.entries(rawParts)) {
    if (!id) continue;
    const kind = KINDS.includes(p.kind) ? p.kind : (Array.isArray(p.size_mm) && p.size_mm.length === 3 ? PANEL : 'other');
    parts[str(id)] = {
      name: str(p.name, 'Part').slice(0, 60), qty: clampInt(p.qty, 0, 999, 1), kind,
      size_mm: Array.isArray(p.size_mm) ? p.size_mm.map(v => Math.max(1, num(v, 18))) : null,
      look: str(p.look ?? p.note), finish: p.finish ? str(p.finish) : null
    };
  }

  const keys = new Set();
  const uniq = k => { let key = k, n = 2; while (keys.has(key)) key = `${k}-${n++}`; keys.add(key); return key; };
  const panels = (Array.isArray(raw.panels) ? raw.panels : []).filter(p => parts[p.part]?.kind === PANEL).map((p, i) => ({
    key: uniq(str(p.key, `${p.part}${i}`)), part: str(p.part), pos: vec(p.pos), rot: vec(p.rot), step: clampInt(p.step, 1, N, 1)
  }));
  const panelKeys = new Set(panels.map(p => p.key));
  const hardware = (Array.isArray(raw.hardware) ? raw.hardware : [])
    .filter(h => parts[h.part] && parts[h.part].kind !== PANEL && panelKeys.has(str(h.panel)))
    .map((h, i) => ({
      key: uniq(str(h.key, `${h.panel}-${h.part}-${i}`)), part: str(h.part), panel: str(h.panel), at: vec(h.at),
      dir: DIRS.includes(h.dir) ? h.dir : '+y', step: clampInt(h.step, 1, N, 1),
      turn_step: h.turn_step != null ? clampInt(h.turn_step, 1, N, 1) : null, roll: num(h.roll, 0)
    }));
  const holes = (Array.isArray(raw.holes) ? raw.holes : []).filter(h => panelKeys.has(str(h.panel)))
    .map(h => ({ panel: str(h.panel), face: DIRS.includes(h.face) ? h.face : '+y', at: vec(h.at), d: Math.max(2, num(h.d, 5)) }));

  // make sure every part used anywhere exists
  for (const s of steps) for (const [id] of s.need) if (!parts[id]) parts[id] = { name: 'Part', qty: 1, kind: 'other', size_mm: null, look: '', finish: null };

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
