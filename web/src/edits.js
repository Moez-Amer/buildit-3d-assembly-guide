// Small changes to a guide, so a repair can send only what changes instead of the whole guide again.
// Shape: { "edits": [ ... ] }, each edit one of
//   { "panel": "B1", "set": { "pos": [..], "rot": [..], "step": 3, "into": [..], "part": "B", "attach": {..} } }
//   { "hardware": "B1-S100-0", "set": { "panel": "G1", "at": [..], "dir": "-y", "step": 5, "turn_step": 6, "roll": 0, "part": "S100" } }
//   { "part": "C", "set": { "name", "qty", "kind", "size_mm", "shape", "look", "len_mm", "d_mm", "material", "color" } }
//   { "step": 4, "set": { "title", "text", "need", "tip", "warn", "confidence", "page" } }      (steps count from 1)
//   { "group": "frame", "set": { "panels", "until", "rot", "pos" } }
//   { "add": "panel" | "hardware" | "hole" | "group", "value": { ...as in the guide } }
//   { "add": "part", "id": "X", "value": { ... } }
//   { "remove": "panel" | "hardware" | "group", "key": "..." }   (removing a panel also removes its hardware and holes)
//   { "unclear": "note for the reader" }
import { normalizeGuide } from './guide.js';

const FIELDS = {
  panel: ['part', 'pos', 'rot', 'step', 'into', 'attach'],
  hardware: ['part', 'panel', 'at', 'dir', 'step', 'turn_step', 'roll'],
  part: ['name', 'qty', 'kind', 'size_mm', 'shape', 'look', 'finish', 'len_mm', 'd_mm', 'material', 'color', 'in_box', 'fitting'],
  step: ['title', 'text', 'need', 'tip', 'warn', 'confidence', 'page'],
  group: ['panels', 'until', 'rot', 'pos'],
};
const setFields = (target, set, allowed) => {
  let n = 0;
  for (const [k, v] of Object.entries(set || {})) if (allowed.includes(k)) { if (v === null && k === 'shape') delete target.shape; else target[k] = v; n++; }
  return n;
};

/** Is this reply an edit list (rather than a whole guide)? */
export const isEditList = j => !!j && Array.isArray(j.edits) && !Array.isArray(j.steps);

/**
 * Apply an edit list to a normalized guide. Returns { guide (normalized), applied, skipped: [why] }.
 * Edits that name something that does not exist are skipped, not guessed.
 */
export function applyEdits(guide, edits) {
  const g = structuredClone(guide);
  let applied = 0;
  const skipped = [];
  for (const e of Array.isArray(edits) ? edits : []) {
    if (!e || typeof e !== 'object') continue;
    const miss = what => skipped.push(`${what} not found`);
    if (e.panel != null && e.set) {
      const p = g.panels.find(x => x.key === String(e.panel));
      if (!p) { miss(`panel ${e.panel}`); continue; }
      const old = p.key;
      applied += setFields(p, e.set, FIELDS.panel);
      p.key = old;
    } else if (e.hardware != null && e.set) {
      const h = g.hardware.find(x => x.key === String(e.hardware));
      if (!h) { miss(`hardware ${e.hardware}`); continue; }
      applied += setFields(h, e.set, FIELDS.hardware);
    } else if (e.group != null && e.set) {
      const gr = (g.groups ||= []).find(x => x.key === String(e.group));
      if (!gr) { miss(`group ${e.group}`); continue; }
      applied += setFields(gr, e.set, FIELDS.group);
    } else if (e.part != null && e.set) {
      const p = g.parts[String(e.part)];
      if (!p) { miss(`part ${e.part}`); continue; }
      if (e.set.shape) delete p.size_mm; // size comes from the new shape
      applied += setFields(p, e.set, FIELDS.part);
    } else if (e.step != null && e.set) {
      const s = g.steps[Number(e.step) - 1];
      if (!s) { miss(`step ${e.step}`); continue; }
      applied += setFields(s, e.set, FIELDS.step);
    } else if (e.add && e.value && typeof e.value === 'object') {
      if (e.add === 'panel') g.panels.push(e.value);
      else if (e.add === 'hardware') g.hardware.push(e.value);
      else if (e.add === 'hole') g.holes.push(e.value);
      else if (e.add === 'group') (g.groups ||= []).push(e.value);
      else if (e.add === 'part' && e.id != null) g.parts[String(e.id)] = e.value;
      else { skipped.push(`cannot add ${e.add}`); continue; }
      applied++;
    } else if (e.remove && e.key != null) {
      const key = String(e.key);
      if (e.remove === 'panel' && g.panels.some(p => p.key === key)) {
        g.panels = g.panels.filter(p => p.key !== key);
        g.hardware = g.hardware.filter(h => h.panel !== key);
        g.holes = g.holes.filter(h => h.panel !== key);
      } else if (e.remove === 'hardware' && g.hardware.some(h => h.key === key)) g.hardware = g.hardware.filter(h => h.key !== key);
      else if (e.remove === 'group' && (g.groups || []).some(x => x.key === key)) g.groups = g.groups.filter(x => x.key !== key);
      else { miss(`${e.remove} ${key}`); continue; }
      applied++;
    } else if (typeof e.unclear === 'string') { g.unclear.push(e.unclear); applied++; }
    else skipped.push('edit not understood');
  }
  return { guide: normalizeGuide(g), applied, skipped };
}
