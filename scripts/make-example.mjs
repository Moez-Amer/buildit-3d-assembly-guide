// Generates web/public/examples/bookcase.json in the Buildit guide format.
// Run: node scripts/make-example.mjs
// Coordinates: millimetres. x = left→right, y = up from floor, z = back(0)→front.
// Panel "pos" is the box centre. Hardware "at" is a point on the parent panel's surface, in that panel's own coordinates.
import { writeFileSync, mkdirSync } from 'node:fs';

const parts = {
  A: { name: 'Side panel', qty: 2, kind: 'panel', size_mm: [18, 1000, 280], look: 'The two longest boards. One face has two long rows of small holes.' },
  B: { name: 'Top / bottom', qty: 2, kind: 'panel', size_mm: [564, 18, 280], look: 'Four big round holes near the ends of one face. Small holes in both ends.' },
  C: { name: 'Fixed shelf', qty: 1, kind: 'panel', size_mm: [564, 18, 260], look: 'Looks like B, but 2 cm narrower front to back.' },
  D: { name: 'Back board', qty: 1, kind: 'panel', size_mm: [600, 1000, 3], finish: 'hardboard', look: 'Thin, bendy sheet. White on one side, brown on the other.' },
  E: { name: 'Loose shelf', qty: 1, kind: 'panel', size_mm: [562, 18, 260], look: 'Plain board with no holes at all.' },
  '101': { name: 'Wooden dowel', qty: 6, kind: 'dowel', look: 'Short wooden peg with grooves.' },
  '102': { name: 'Cam screw', qty: 12, kind: 'cam_screw', look: 'Metal pin. Thread at one end, round knob at the other.' },
  '103': { name: 'Cam lock', qty: 12, kind: 'cam_lock', look: 'Round metal cup with a slot and an arrow on top.' },
  '104': { name: 'Small nail', qty: 22, kind: 'nail', look: 'Thin nail with a flat head. One spare.' },
  '105': { name: 'Shelf pin', qty: 4, kind: 'shelf_pin', look: 'Short metal peg with a collar.' },
  '106': { name: 'Wall bracket', qty: 1, kind: 'bracket', look: 'Small L-shaped metal plate with two holes.' }
};

const panels = [
  { key: 'AL', part: 'A', pos: [9, 500, 140], step: 3 },
  { key: 'AR', part: 'A', pos: [591, 500, 140], step: 5 },
  { key: 'Bb', part: 'B', pos: [300, 49, 140], step: 3 },
  { key: 'C', part: 'C', pos: [300, 500, 130], step: 3 },
  { key: 'Bt', part: 'B', pos: [300, 991, 140], step: 3 },
  { key: 'D', part: 'D', pos: [300, 500, -1.5], step: 7 },
  { key: 'E', part: 'E', pos: [300, 261, 130], step: 8 }
];

// joints between side panels and boards, in side-panel coordinates
const JOINTS = [{ y: -451, zs: [90, -90], dz: 0 }, { y: 0, zs: [80, -100], dz: -10 }, { y: 491, zs: [90, -90], dz: 0 }];
const hardware = [];
const holes = [];

[['AL', 1, '+x', 1], ['AR', -1, '-x', 4]].forEach(([p, s, dir, step]) => {
  JOINTS.forEach(J => {
    J.zs.forEach(z => hardware.push({ part: '102', panel: p, at: [9 * s, J.y, z], dir, step }));
    hardware.push({ part: '101', panel: p, at: [9 * s, J.y, J.dz], dir, step });
  });
  [100, -100].forEach(z => hardware.push({ part: '105', panel: p, at: [9 * s, -250.5, z], dir, step: 8 }));
  // shelf-pin hole rows
  for (let k = -6; k <= 20; k++) {
    const y = -250.5 + 32 * k;
    if (y < -440 || y > 440 || JOINTS.some(J => Math.abs(J.y - y) < 40) || Math.abs(y + 250.5) < 1) continue;
    [100, -100].forEach(z => holes.push({ panel: p, face: dir, at: [9 * s, y, z], d: 5 }));
  }
});
// cam locks: top face of boards; arrow points to the nearest end (roll 0 = toward -x)
['Bb', 'C', 'Bt'].forEach(b => [-248, 248].forEach(x => [90, -90].forEach(z =>
  hardware.push({ part: '103', panel: b, at: [x, 9, z], dir: '+y', roll: x < 0 ? 0 : 180, step: 2, turn_step: 6 }))));
// matching holes in the board ends (screws + dowels slide in here)
['Bb', 'C', 'Bt'].forEach(b => [-1, 1].forEach(s => [90, 0, -90].forEach(z =>
  holes.push({ panel: b, face: s > 0 ? '+x' : '-x', at: [282 * s, 0, z], d: z === 0 ? 8 : 10 }))));
// nails through the back board (back face is -z)
[-291, 291].forEach(x => [-380, -225, -110, 110, 225, 380].forEach(y => hardware.push({ part: '104', panel: 'D', at: [x, y, -1.5], dir: '-z', step: 7 })));
[-451, 0, 491].forEach(y => [-200, 0, 200].forEach(x => hardware.push({ part: '104', panel: 'D', at: [x, y, -1.5], dir: '-z', step: 7 })));
hardware.push({ part: '106', panel: 'Bt', at: [0, 9, -118], dir: '+y', step: 9 });

const steps = [
  { title: 'Pegs and screws into one side', text: 'Lay one side panel A flat, rows of small holes facing up. Push a wooden dowel into each middle hole. Screw a cam screw into each outer hole by hand.', need: [['A', 1], ['101', 3], ['102', 6]], tip: "Stop turning when the screw's collar sits flat on the board. Too deep and the cam lock can't grab it." },
  { title: 'Cam locks into the boards', text: 'Push a cam lock into each of the 4 big round holes on B, B and C. Turn each one so its arrow points toward the nearest end.', need: [['B', 2], ['C', 1], ['103', 12]], tip: 'Arrows pointing the wrong way block the screws from sliding in.' },
  { title: 'Join the boards to the side', text: "Stand side panel A up, holes facing in. Slide the bottom B, the middle C and the top B onto its screws and pegs. Don't tighten anything yet.", need: [], tip: 'C is the narrower board. Line it up with the back edge, so its front sits 2 cm behind the front of A.' },
  { title: 'Get the second side ready', text: 'Do the same as step 1 with the other side panel A: 3 dowels and 6 cam screws.', need: [['A', 1], ['101', 3], ['102', 6]] },
  { title: 'Add the second side', text: 'Lower the second side onto the open ends of the boards, holes facing in. Press until every joint closes.', need: [], warn: 'Have a second person hold the frame steady.' },
  { title: 'Lock every joint', text: 'Turn every cam lock half a turn clockwise with a screwdriver. Each joint should pull tight.', need: [['103', 12]], tip: 'If a cam spins without tightening, its screw is too deep. Unscrew it a quarter turn.' },
  { title: 'Nail on the back board', text: 'Put the back board on the back, white side facing in. Hammer a nail into every side and board edge, about every 15 cm.', need: [['D', 1], ['104', 21]], tip: 'Measure corner to corner both ways first. Equal lengths mean the frame is square.' },
  { title: 'Fit the loose shelf', text: 'Push 4 shelf pins into holes at the same height on both sides. Rest the loose shelf E on top.', need: [['105', 4], ['E', 1]] },
  { title: 'Fix it to the wall', text: 'Screw the bracket to the top board, then into the wall behind it.', need: [['106', 1]], warn: "Tall furniture can tip over and injure children. Always fix it to the wall. Wall screws aren't included; pick ones that suit your wall." }
].map(s => ({ confidence: 'high', ...s }));

const guide = {
  version: 1, id: 'example-bookcase', example: true,
  product: 'Bookcase 60 × 100 cm (example)', summary: 'A two-shelf bookcase joined with cam locks, with a nailed back board.',
  people: 1, time_minutes: 40, tools: ['Phillips screwdriver', 'Hammer'],
  scene: { wall_step: 9 },
  parts, panels, holes, hardware, steps
};
mkdirSync(new URL('../web/public/examples/', import.meta.url), { recursive: true });
writeFileSync(new URL('../web/public/examples/bookcase.json', import.meta.url), JSON.stringify(guide, null, 1));
console.log(`wrote bookcase.json: ${panels.length} panels, ${hardware.length} hardware, ${holes.length} holes, ${steps.length} steps`);
