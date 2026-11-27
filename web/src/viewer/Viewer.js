// Data-driven 3D assembly viewer. Feed it a normalized guide (see ../guide.js).
// Step 0 is "check your parts": every board lies on the floor. Step n (1..N) plays guide.steps[n-1].
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { makeMaterials, makeBody, makeHardware, makeTurnArrow, dirQuat, dirVec, snapToFace, washerThick, HOLE_FOR } from './parts3d.js';
import { PANEL } from '../guide.js';

const PI = Math.PI;
const DUR = 1.3;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// dark parts need a stronger glow, or the yellow mixes with the black into brown and the part looks brown
const glowGain = m => { const c = m.color || new THREE.Color(1, 1, 1), l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; return 1 + 2.6 * Math.max(0, 0.6 - l); };
// head height of a screw or bolt, as the hardware models draw it (parts3d.js)
const headHeight = p => p.kind === 'allen_bolt' ? (p.d_mm || 6) : p.kind === 'bolt' ? (p.d_mm || 6) * 0.66 : 1.7 * (p.d_mm || 3.8) / 3.8;
const UP_ROT = { '+y': [0, 0, 0], '-y': [PI, 0, 0], '+x': [0, 0, PI / 2], '-x': [0, 0, -PI / 2], '+z': [-PI / 2, 0, 0], '-z': [PI / 2, 0, 0] };

export class Viewer {
  constructor(canvas, labelsEl, { colors, reducedMotion = false } = {}) {
    this.canvas = canvas; this.labelsEl = labelsEl; this.colors = colors; this.RM = reducedMotion;
    this.cur = 0; this.detail = true; this.showLabels = true; this.objs = []; this.byKey = {}; this.t0 = 0;
    this.animationPaused = false;
    this.pausedAt = 0;
    this.onPick = null; this.flash = null; this.tween = null;

    const R = this.R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    R.setPixelRatio(Math.min(devicePixelRatio, 2)); R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    const S = this.S = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(32, 1, 0.005, 40);
    S.add(new THREE.HemisphereLight(0xffffff, 0x7d8178, 0.62 * PI));
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 0.7 * PI);
    sun.position.set(1.2, 3, 2.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
    Object.assign(sun.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 0.5, far: 9 });
    S.add(sun);
    const fill = new THREE.DirectionalLight(0xfff4e6, 0.25 * PI); fill.position.set(-2, 1.5, -1.5); S.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.2 }));
    floor.rotation.x = -PI / 2; floor.receiveShadow = true; S.add(floor);
    this.root = new THREE.Group(); this.root.scale.setScalar(0.001); S.add(this.root);
    this.M = makeMaterials(colors);

    // Camera: drag turns; right-drag, middle-drag or Shift/Ctrl/Cmd-drag moves (pans); the wheel, a trackpad scroll or
    // pinch zooms toward the point under the pointer; two fingers on a touch screen pinch and move; double-click centres.
    const C = this.ctrl = new OrbitControls(this.cam, canvas);
    C.enableDamping = true; C.dampingFactor = 0.12; C.rotateSpeed = 0.85; C.panSpeed = 1;
    C.maxPolarAngle = PI * 0.56; C.minDistance = 0.05; C.maxDistance = 8;
    C.enableZoom = false; // our own zoom below: toward the pointer and smooth on mice and trackpads alike
    C.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    C.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    C.addEventListener('start', () => { this.tween = null; this.moved = true; canvas.classList.add('dragging'); this.onMove?.(); });
    C.addEventListener('end', () => canvas.classList.remove('dragging'));
    this.moved = false; this.zoomGoal = null; this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
    canvas.addEventListener('wheel', e => {
      if (!C.enabled) return; // the landing page preview lets the page scroll
      e.preventDefault();
      const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      // a trackpad pinch arrives as a ctrl+wheel with small steps; a mouse notch is about 100 px
      const f = Math.exp(Math.max(-150, Math.min(150, px)) * (e.ctrlKey ? 0.012 : 0.0024));
      this.zoomBy(f, e.clientX, e.clientY);
    }, { passive: false });
    // Shift shows the "move" cursor, because Shift-drag pans
    const shift = e => canvas.classList.toggle('panning', e.shiftKey || e.ctrlKey || e.metaKey);
    addEventListener('keydown', shift); addEventListener('keyup', shift);

    // tap to identify; double-click (or double-tap) to turn around the point you clicked
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
    const hitAt = (x, y) => {
      const r = canvas.getBoundingClientRect();
      ptr.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, this.cam);
      for (const h of ray.intersectObjects(this.root.children, true)) {
        if (!h.object.isMesh) continue;
        let o = h.object; while (o && !o.userData.obj) o = o.parent;
        if (o && o.visible && o.userData.obj.part) return { obj: o.userData.obj, point: h.point };
      }
      return null;
    };
    canvas.addEventListener('pointerdown', e => (down = [e.clientX, e.clientY, e.button]));
    canvas.addEventListener('pointerup', e => {
      if (!down || down[2] !== 0 || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      this.onPick?.(hitAt(e.clientX, e.clientY)?.obj.part || null);
    });
    canvas.addEventListener('dblclick', e => {
      if (!C.enabled) return;
      const h = hitAt(e.clientX, e.clientY);
      if (h) { this.centreOn(h.point, 0.7); this.moved = true; this.onMove?.(); }
    });

    // a resize (phone toolbar showing or hiding, window dragged) keeps a view the user set up; otherwise it re-frames
    this.resize(); addEventListener('resize', () => { this.resize(); if (this.guide && !this.moved) this.goCam(true); });
    // paused while its screen is hidden, so two viewers (landing page, build screen) never both draw
    this.paused = false;
    const loop = now => { requestAnimationFrame(loop); if (!this.paused) this.frame(now); };
    requestAnimationFrame(loop);
  }

  /* ---------- building the scene from a guide ---------- */
  load(guide) {
    this.guide = guide; this.N = guide.steps.length;
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    this.objs = []; this.byKey = {}; this.matCache = {};
    const P = guide.parts;

    // holes per panel: explicit + made by hardware
    const holesOf = {};
    guide.panels.forEach(p => (holesOf[p.key] = []));
    guide.holes.forEach(h => holesOf[h.panel]?.push(h));
    guide.hardware.forEach(h => { const d = HOLE_FOR[P[h.part].kind] || 0; if (d) holesOf[h.panel].push({ face: h.dir, at: h.at, d }); });
    this.holesOf = holesOf;

    // panels: final pose, then a flat "on the floor" pose for step 0
    const finalBox = new THREE.Box3();
    const panels = guide.panels.map(p => {
      const size = P[p.part].size_mm || [400, 18, 300];
      const Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rot.map(d => (d * PI) / 180)));
      const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(...size));
      box.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p.pos), Q, new THREE.Vector3(1, 1, 1)));
      finalBox.union(box);
      return { p, size, Q };
    });
    this.finalBox = finalBox.isEmpty() ? new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(600, 800, 300)) : finalBox;
    // how far in and out the camera may go, from the size of the finished piece (metres; the scene is in mm × 0.001)
    const R = this.finalBox.getSize(new THREE.Vector3()).length() / 2000;
    this.ctrl.minDistance = Math.max(0.02, R * 0.04); this.ctrl.maxDistance = Math.max(3, R * 9);

    // floor layout in front of the finished piece
    const fb = this.finalBox;
    const order = panels.slice().sort((a, b) =>
      a.p.part.localeCompare(b.p.part, undefined, { numeric: true }) ||
      a.p.step - b.p.step
    );
    for (let i = 0; i < order.length; i++) {
      const it = order[i];
      // lay it flat with its busiest face up
      const counts = {}; holesOf[it.p.key].forEach(h => (counts[h.face] = (counts[h.face] || 0) + 1));
      guide.hardware.filter(h => h.panel === it.p.key).forEach(h => (counts[h.dir] = (counts[h.dir] || 0) + 3));
      // shaped parts (frames, seats) stand upright as they are built, which is easiest to recognise;
      // flat ones (grilles, blades, table tops) lie on their thin side so they do not hide the parts behind them
      const thin = it.size.indexOf(Math.min(...it.size)), flat = it.size[thin] < 0.35 * Math.max(...it.size);
      let up = P[it.p.part].shape ? (flat ? ['+x', '+y', '+z'][thin] : '+y') : Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!up) { const i = it.size.indexOf(Math.min(...it.size)); up = ['+x', '+y', '+z'][i]; }
      const TQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...UP_ROT[up]));
      const fp = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(...it.size)).applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(TQ));
      const w = fp.max.x - fp.min.x, d = fp.max.z - fp.min.z, h = fp.max.y - fp.min.y;
      it.footprint = { w, d, h };
      it.trayQ = TQ;
    }

    // Group identical boards while keeping their original orientations.
    const gap = 60;
    const groups = [];

    for (const it of order) {
      const last = groups[groups.length - 1];

      if (last && last.part === it.p.part) {
        last.items.push(it);
      } else {
        groups.push({ part: it.p.part, items: [it] });
      }
    }

    for (const group of groups) {
      group.w = group.items.reduce(
        (sum, it) => sum + it.footprint.w, 0
      ) + (group.items.length - 1) * gap;

      group.d = Math.max(...group.items.map(it => it.footprint.d));
    }

    const rowMax = Math.max(
      1800,
      (fb.max.x - fb.min.x) * 2.4,
      ...groups.map(group => group.w)
    );

    const placed = [];

    for (const group of groups) {
      const xs = [0, ...placed.map(p => p.x + p.w + gap)];
      const zs = [0, ...placed.map(p => p.z + p.d + gap)];

      let best = null;

      for (const z of zs) {
        for (const x of xs) {
          if (x + group.w > rowMax + 0.001) continue;

          const overlaps = placed.some(p =>
            x < p.x + p.w + gap &&
            x + group.w + gap > p.x &&
            z < p.z + p.d + gap &&
            z + group.d + gap > p.z
          );

          if (overlaps) continue;

          if (!best || z < best.z || (z === best.z && x < best.x)) {
            best = { x, z };
          }
        }
      }

      if (!best) {
        best = {
          x: 0,
          z: Math.max(0, ...placed.map(p => p.z + p.d + gap))
        };
      }

      placed.push({ ...best, w: group.w, d: group.d });

      let offsetX = best.x;

      for (const it of group.items) {
        const { w, d, h } = it.footprint;

        it.trayP = new THREE.Vector3(
          fb.min.x - 250 + offsetX + w / 2,
          h / 2,
          fb.max.z + 220 + best.z + d / 2
        );

        offsetX += w + gap;
      }
    }

    // groups the manual builds in another position (lying flat, on its back): one turn for the whole group, then
    // set down on the floor under its final place (or at its pos). Each board uses it from its own step until "until".
    const worldBox = it => new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(...it.size))
      .applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...it.p.pos), it.Q, new THREE.Vector3(1, 1, 1)));
    const corners = b => [0, 1, 2, 3, 4, 5, 6, 7].map(i => new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
    // a group set down under its final place must not sink into parts that are already standing there
    // (the seat turned upside down on top of the chair base): then it goes beside the build, groups side by side
    const offFloorBefore = (key, until) => panels.filter(it => it.p.key !== key && it.p.step < until);
    let besideX = this.finalBox.max.x + 250;
    const poses = (guide.groups || []).map(gr => {
      const mem = panels.filter(it => gr.panels.includes(it.p.key));
      if (!mem.length) return null;
      const box = new THREE.Box3(); mem.forEach(it => box.union(worldBox(it)));
      const c = box.getCenter(new THREE.Vector3());
      const Rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(...gr.rot.map(d => (d * PI) / 180)));
      const rb = new THREE.Box3(); mem.forEach(it => corners(worldBox(it)).forEach(v => rb.expandByPoint(v.sub(c).applyQuaternion(Rq))));
      const rc = rb.getCenter(new THREE.Vector3());
      let to = gr.pos ? new THREE.Vector3(...gr.pos) : c;
      const at = t => rb.clone().translate(new THREE.Vector3(t.x - rc.x, -rb.min.y, t.z - rc.z));
      const others = offFloorBefore(null, gr.until).filter(it => !gr.panels.includes(it.p.key)).map(worldBox);
      if (!gr.pos && others.some(b => b.clone().expandByScalar(-2).intersectsBox(at(to)))) {
        const w = rb.max.x - rb.min.x; to = new THREE.Vector3(besideX + w / 2, 0, c.z); besideX += w + 250;
      }
      const shift = new THREE.Vector3(to.x - rc.x, -rb.min.y, to.z - rc.z);
      return { gr, place: it => ({ P: new THREE.Vector3(...it.p.pos).sub(c).applyQuaternion(Rq).add(shift), Q: Rq.clone().multiply(it.Q) }) };
    }).filter(Boolean);
    const keyframes = it => {
      const final = { P: new THREE.Vector3(...it.p.pos), Q: it.Q };
      const mine = poses.filter(x => x.gr.panels.includes(it.p.key) && x.gr.until > it.p.step).sort((a, b) => a.gr.until - b.gr.until);
      const kfs = [{ s: 0, P: it.trayP, Q: it.trayQ }];
      let s = it.p.step;
      for (const x of mine) { if (x.gr.until <= s && kfs.length > 1) continue; kfs.push({ s, ...x.place(it) }); s = x.gr.until; }
      kfs.push({ s, ...final });
      return kfs;
    };

    for (const it of panels) {
      const part = P[it.p.part];
      const o = this.addObj({ key: it.p.key, part: it.p.part, kind: PANEL, parent: null, size: it.size,
        build: () => makeBody(part, holesOf[it.p.key], this.M),
        kfs: keyframes(it), arc: 260 });
      let ghost;
      if (part.shape) {
        // see-through copy of the real shape, so a curved part shows where it is going
        const gm = new THREE.MeshBasicMaterial({ color: this.colors.accent, transparent: true, opacity: 0.22, depthWrite: false });
        ghost = makeBody({ ...part }, [], this.M);
        ghost.traverse(m => { if (m.isMesh) { m.material = gm; m.castShadow = false; } if (m.isLineSegments) m.visible = false; });
      } else {
        ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...it.size)),
          new THREE.LineDashedMaterial({ color: this.colors.accent, dashSize: 14, gapSize: 10 }));
        ghost.computeLineDistances();
      }
      ghost.position.set(...it.p.pos); ghost.quaternion.copy(it.Q); ghost.visible = false;
      this.root.add(ghost); o.ghost = ghost;
    }
    const sizeOf = Object.fromEntries(panels.map(it => [it.p.key, it.size]));
    const shapedOf = Object.fromEntries(panels.map(it => [it.p.key, !!P[it.p.part].shape]));
    // a washer at the same spot as a screw or bolt: the screw head sits on top of it
    const atOf = h => (shapedOf[h.panel] ? h.at : snapToFace(h.at, h.dir, sizeOf[h.panel]));
    const washers = guide.hardware.filter(h => P[h.part].kind === 'washer');
    // one model per part, copied for every piece: the copies share their geometry, so hundreds of screws stay light
    const models = {};
    const modelOf = part => { const t = models[part] ||= makeHardware(P[part].kind, this.M, { len: P[part].len_mm, d: P[part].d_mm }, P[part]); return { group: t.group.clone(true), spinnable: t.spinnable }; };
    for (const h of guide.hardware) {
      const part = P[h.part], kind = part.kind, at = atOf(h);
      const Q = dirQuat(h.dir).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (h.roll * PI) / 180));
      const Pp = new THREE.Vector3(...at);
      const sameSpot = x => x.panel === h.panel && x.dir === h.dir && Math.hypot(...atOf(x).map((v, i) => v - at[i])) < 3;
      if (['screw', 'bolt', 'allen_bolt', 'cap'].includes(kind)) {
        const w = washers.find(sameSpot);
        if (w) Pp.add(dirVec(h.dir).multiplyScalar(washerThick(P[w.part].d_mm || 12)));
      }
      if (kind === 'cap') {
        // a cover cap sits on the head of the bolt or screw in the same hole, not inside it
        const b = guide.hardware.find(x => x !== h && ['screw', 'bolt', 'allen_bolt'].includes(P[x.part].kind) && sameSpot(x));
        if (b) Pp.add(dirVec(h.dir).multiplyScalar(headHeight(P[b.part])));
      }
      const from = Pp.clone().add(dirVec(h.dir).multiplyScalar(kind === 'nail' ? 45 : 65 + (part.len_mm || 0) * 0.6));
      const o = this.addObj({ key: h.key, part: h.part, kind, parent: h.panel, build: () => modelOf(h.part), matKey: `${h.part}|${h.step}`,
        kfs: [{ s: h.step, P: Pp, Q, fromP: from }], turnStep: h.turn_step });
      o.outDir = dirVec(h.dir);
    }
    // wall for the "fix to wall" step
    if (guide.scene.wall_step) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(fb.max.x - fb.min.x + 1200, Math.max(1600, fb.max.y + 600)),
        new THREE.MeshStandardMaterial({ color: '#D9DCD5', roughness: 1, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      wall.receiveShadow = true; wall.position.set((fb.min.x + fb.max.x) / 2, Math.max(1600, fb.max.y + 600) / 2, fb.min.z - 6);
      this.root.add(wall); this.wall = wall;
    } else this.wall = null;
    // a turn arrow on the first part that turns in each step
    const turnSteps = {};
    this.objs.forEach(o => { if (o.turnStep && !turnSteps[o.turnStep]) turnSteps[o.turnStep] = o; });
    this.turnArrows = Object.entries(turnSteps).map(([s, o]) => { const a = makeTurnArrow(this.M); o.group.add(a); return { s: +s, a, o }; });

    this.planSteps();
    this.setStep(0, true);
  }

  addObj(o) {
    o.group = new THREE.Group(); const built = o.build();
    o.inner = built.group || built; o.spinnable = !!built.spinnable;
    o.group.add(o.inner); o.group.userData.obj = o;
    o.mats = [];
    // each object gets its own materials so it can glow on its own; pieces of the same part that come in the same step
    // glow together, so they share them (fewer materials for the GPU to switch between)
    const shared = o.matKey ? (this.matCache[o.matKey] ||= new Map()) : null;
    const own = x => { let c = shared?.get(x); if (!c) { c = x.clone(); shared?.set(x, c); } return c; };
    o.inner.traverse(m => {
      if (!m.isMesh || m.material === this.M.hole) return;
      m.material = Array.isArray(m.material) ? m.material.map(own) : own(m.material);
      [].concat(m.material).forEach(x => x.emissive && !o.mats.includes(x) && o.mats.push(x));
    });
    (o.parent ? this.byKey[o.parent].group : this.root).add(o.group);
    this.objs.push(o); this.byKey[o.key] = o; o.delay = 0;
    return o;
  }

  /** Stagger timings, labels and camera framing for every step. */
  planSteps() {
    this.plan = [];
    for (let s = 0; s <= this.N; s++) {
      const moving = this.objs.filter(o => o.kind === PANEL && s > 0 && o.kfs.some((k, i) => i > 0 && k.s === s));
      const added = this.objs.filter(o => o.kind !== PANEL && o.kfs[0].s === s);
      const turning = this.objs.filter(o => o.turnStep === s);
      moving.forEach((o, i) => (o.delay = i * 0.3));
      const hwStart = moving.length ? moving.length * 0.3 + 0.9 : 0, gap = Math.min(0.12, 1.6 / Math.max(1, added.length));
      // insert hardware panel by panel so the eye can follow
      added.slice().sort((a, b) => (a.parent > b.parent ? 1 : a.parent < b.parent ? -1 : 0)).forEach((o, i) => (o.delay = hwStart + i * gap));
      const span = Math.max(0, ...moving.map(o => o.delay), ...added.map(o => o.delay));

      // labels
      const labels = [];
      if (s === 0) this.objs.filter(o => o.kind === PANEL).forEach(o => labels.push({ o, text: o.part, big: true }));
      else {
        const seen = new Set();

        for (const o of [...moving, ...added]) {
          seen.add(o.part);

          labels.push({
            o,
            text: o.part,
            isNew: true,
            compact: o.kind !== PANEL
          });
        }
        if (turning[0]) labels.push({ o: turning[0], text: '½ turn clockwise', isNew: true });
        const hosts = new Set(added.map(o => o.parent));

        hosts.forEach(k => {
          const p = this.byKey[k];

          if (p && !labels.some(l => l.o === p)) {
            labels.push({ o: p, text: p.part });
          }
        });
      }
      // boards this step works on (moved, or getting fittings): never hidden as loose
      const involved = new Set([...moving, ...[...added, ...turning].map(o => this.byKey[o.parent]).filter(Boolean)]);
      this.plan.push({ moving, added, turning, span, labels, involved });
    }
    // cameras need world positions: evaluate each step's end state
    for (let s = 0; s <= this.N; s++) {
      this.applyState(s, Infinity);
      this.root.updateMatrixWorld(true);
      const pl = this.plan[s];
      const focus = s === 0 ? this.objs.filter(o => o.kind === PANEL) : [...pl.moving, ...pl.added, ...pl.turning];
      const all = this.objs.filter(o => o.group.visible);
      const placed = all.filter(o => o.kind !== PANEL || !o.kfs[1] || o.kfs[1].s <= s); // off the floor: fitted or in its group
      const wide = this.boxOf(all.length ? all : this.objs);
      const outs = [...pl.added, ...pl.turning].map(o => o.outDir.clone().applyQuaternion(o.group.parent.getWorldQuaternion(new THREE.Quaternion())));
      const avg = outs.reduce((a, v) => a.add(v), new THREE.Vector3());
      let dir = new THREE.Vector3(0.45, 0.62, 0.85);
      if (avg.length() > 0.3 * outs.length && outs.length) { avg.normalize(); dir = avg.clone().multiplyScalar(1.1).add(new THREE.Vector3(0.3, 0.55, 0.35)); if (avg.y > 0.8) dir.add(new THREE.Vector3(0.1, 0, 0.6)); }
      if (s === 0) dir = new THREE.Vector3(0, 0.8, 0.62);
      const fbox = this.boxOf(focus.length ? focus : s > 0 && placed.length ? placed : all); // nothing new: look at what is built
      const cam = { wide: this.camFrom(s === 0 ? fbox : focus.length && pl.moving.length ? wide : fbox.union ? fbox : wide, dir, 1.05) };
      if (s > 0 && !pl.moving.length && (pl.added.length || pl.turning.length)) {
        const first = (pl.added[0] || pl.turning[0]);
        const p0 = first.group.getWorldPosition(new THREE.Vector3());
        const near = [...pl.added, ...pl.turning].filter(o => o.group.getWorldPosition(new THREE.Vector3()).distanceTo(p0) < 0.16);
        // close-up with context: the fittings plus the part of their board around them (up to 25 cm each way),
        // so it is clear which board and which edge they go into
        const nb = this.boxOf(near), ctx = nb.clone();
        new Set(near.map(o => o.parent)).forEach(k => { const b = this.byKey[k]; if (b) ctx.union(this.boxOf([b]).intersect(nb.clone().expandByScalar(0.25))); });
        // look at the face these fittings go into (caps on both sides of a chair would otherwise average to "from the front")
        const outsNear = near.map(o => o.outDir.clone().applyQuaternion(o.group.parent.getWorldQuaternion(new THREE.Quaternion())));
        const an = outsNear.reduce((a, v) => a.add(v), new THREE.Vector3());
        const dNear = an.length() > 0.5 * outsNear.length ? an.normalize().multiplyScalar(1.1).add(new THREE.Vector3(0.3, 0.55, 0.35)) : dir;
        cam.detail = this.camFrom(ctx, dNear, 1.5, 0.14);
        cam.wide = this.camFrom(fbox.clone().union(this.boxOf(near)), dir, 1.1);
      }
      const kfAt = o => o.kfs.find(k => k.s === s) || o.kfs[o.kfs.length - 1];
      if (s > 0 && pl.moving.length) cam.wide = this.camFrom(this.boxOf(placed), new THREE.Vector3(0.75, 0.48, 0.85).add(pl.moving.some(o => kfAt(o).P.z < this.finalBox.min.z + 10) ? new THREE.Vector3(-1.4, 0, -1.6) : new THREE.Vector3()), 1.05);
      // the whole piece as it stands after this step (the landing preview keeps it in view at every step)
      const standing = this.objs.filter(o => o.kind === PANEL && o.group.visible);
      cam.whole = this.camFrom(this.boxOf(standing.length ? standing : all), new THREE.Vector3(0.75, 0.5, 0.95), 1.08);
      pl.cam = cam;
      const view = this.wideOnly ? cam.whole : cam.detail || cam.wide; // the view the tags are first seen in
      const eye = view.target.clone().add(view.dir.clone().multiplyScalar((view.r / Math.tan((this.cam.fov * PI) / 360)) * 1.05));
      const boards = this.objs.filter(o => o.kind === PANEL && o.group.visible), boxes = new Map(boards.map(o => [o, new THREE.Box3().setFromObject(o.inner)]));
      for (const l of pl.labels) {
        if (s > 0 && l.o.kind === PANEL && l.o.group.visible) {
          l.anchor = this.anchorFor(
            l.o,
            eye,
            boards.filter(x => x !== l.o).map(x => boxes.get(x))
          );
        }
      }
    }
  }
  /** Where on board o its tag goes (in o.group's own coordinates): the candidate spot the eye sees first and that is
   *  furthest from other boards, so a side panel's tag does not sit where a shelf joins it and read as the shelf's. */
  anchorFor(o, eye, others) {
    const b = new THREE.Box3().setFromObject(o.inner), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    const ax = [0, 1, 2].sort((i, j) => s.getComponent(j) - s.getComponent(i));
    const shown = m => { for (let x = m; x; x = x.parent) if (!x.visible) return false; return true; };
    const ray = new THREE.Raycaster(), offs = [0, -0.3, 0.3];
    let best = null;
    for (const u of offs) for (const w of offs) {
      const p = c.clone();
      p.setComponent(ax[0], c.getComponent(ax[0]) + u * s.getComponent(ax[0]));
      p.setComponent(ax[1], c.getComponent(ax[1]) + w * s.getComponent(ax[1]));
      ray.set(eye, p.clone().sub(eye).normalize());
      const hit = ray.intersectObjects(this.root.children, true).find(h => h.object.isMesh && shown(h.object));
      let owner = hit?.object; while (owner && !owner.userData.obj) owner = owner.parent;
      const seen = owner?.userData.obj === o;
      const clear = others.length ? Math.min(0.25, ...others.map(ob => ob.distanceToPoint(p))) : 0.25;
      const score = (seen ? 10 : 0) + clear * 8 - (Math.abs(u) + Math.abs(w)) * 0.5;
      if (!best || score > best.score) best = { score, p };
    }
    return o.group.worldToLocal(best.p.clone());
  }
  boxOf(objs) { const b = new THREE.Box3(); objs.forEach(o => b.expandByObject(o.group)); return b.isEmpty() ? new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 0.6, 0.3)) : b; }
  camFrom(box, dir, pad, minR = 0.12) {
    const c = box.getCenter(new THREE.Vector3()), r = Math.max(minR, (box.getSize(new THREE.Vector3()).length() / 2) * pad);
    return { target: c, dir: dir.clone().normalize(), r };
  }

  /** Put every object where it is at step s; p = seconds into the step (Infinity = finished). */
  applyState(s, el) {
    for (const o of this.objs) {
      let k = null; for (const f of o.kfs) if (f.s <= s) k = f;
      if (!k) { o.group.visible = false; continue; }
      const idx = o.kfs.indexOf(k), isNew = k.s === s && s > 0;
      // hideLoose (landing preview): boards still lying on the floor are left out once building has started
      if (this.hideLoose && s > 0 && idx === 0 && o.kind === PANEL && o.kfs.length > 1 && !this.plan?.[s]?.involved.has(o)) { o.group.visible = false; continue; }
      if (isNew && idx === 0 && o.parent && el < o.delay) { o.group.visible = false; continue; }
      o.group.visible = true;
      const p = !isNew || this.RM ? 1 : ease(Math.min(1, Math.max(0, (el - o.delay) / DUR)));
      if (isNew) {
        const prev = idx > 0 ? o.kfs[idx - 1] : null;
        o.group.position.lerpVectors(prev ? prev.P : k.fromP || k.P, k.P, p);
        if (prev && o.arc) o.group.position.y += Math.sin(p * PI) * o.arc;
        o.group.quaternion.copy(prev ? prev.Q : k.Q).slerp(k.Q, p);
        o.inner.rotation.x = o.spinnable ? (1 - p) * 6 * PI : 0;
      } else { o.group.position.copy(k.P); o.group.quaternion.copy(k.Q); o.inner.rotation.x = 0; }
      if (o.turnStep) {
        const tp = s > o.turnStep ? 1 : s < o.turnStep ? 0 : this.RM ? 1 : ease(Math.min(1, Math.max(0, (el - o.delay) / DUR)));
        o.inner.rotation.x = -PI * tp;
      }
      if (o.ghost) o.ghost.visible = s === o.kfs[o.kfs.length - 1].s && s > 0 && !this.RM && el < o.delay + DUR * 0.98;
    }
    (this.turnArrows || []).forEach(t => (t.a.visible = t.s === s));
    if (this.wall) this.wall.visible = s >= this.guide.scene.wall_step;
  }

  /* ---------- per-frame ---------- */
  frame(now) {
    if (!this.guide) return;
    const pl = this.plan[this.cur], cycle = DUR + pl.span + 2.2;
    const el = this.RM || this.finished
      ? Infinity
      : this.animationPaused
        ? this.pausedAt
        : ((now - this.t0) / 1000) % cycle;
    this.applyState(this.cur, el);
    const pulse = 0.5 + 0.5 * Math.sin(now / 260), acc = new THREE.Color(this.colors.accent);
    const fresh = this.finished ? new Set() : new Set([...pl.moving, ...pl.added, ...pl.turning]);
    for (const o of this.objs) {
      const glow = this.cur > 0 && fresh.has(o)
      ? (o.kind === PANEL ? 0.05 + 0.1 * pulse : 0.15 + 0.85 * pulse)
      : 0;
      const f = this.flash && this.flash.part === o.part && now < this.flash.until ? 0.55 * pulse + 0.2 : 0;
      o.mats.forEach(m => m.emissive.copy(acc).multiplyScalar(Math.max(glow, f) * (m.userData.glowGain ??= glowGain(m))));
    }
    if (this.tween) {
      const p = Math.min(1, (now - this.tween.start) / (this.tween.ms || 900)), e = ease(p);
      this.cam.position.lerpVectors(this.tween.p0, this.tween.p1, e); this.ctrl.target.lerpVectors(this.tween.t0, this.tween.t1, e);
      if (p >= 1) this.tween = null;
    }
    // zoom glides: each frame takes a share of what is left, so a wheel notch eases in instead of jumping
    if (this.zoomGoal) {
      const z = this.zoomGoal, left = Math.log(z.f);
      const step = Math.abs(left) < 0.003 || this.RM ? z.f : Math.exp(left * 0.28);
      this.applyZoom(step, z.x, z.y); z.f /= step;
      if (z.f === 1 || Math.abs(Math.log(z.f)) < 1e-4) this.zoomGoal = null;
    }
    this.ctrl.update(); this.R.render(this.S, this.cam); this.placeLabels();
  }

  /* ---------- controls ---------- */
  setStep(s, instant = false) {
    this.cur = Math.max(0, Math.min(this.N, s)); this.detail = true; this.finished = false; this.t0 = performance.now();
    this.animationPaused = false;
    this.pausedAt = 0;
    this.buildLabels(); this.goCam(instant);
  }
  hasDetail() { return !this.finished && !!this.plan?.[this.cur]?.cam.detail; }
  setDetail(v) { this.detail = v; this.goCam(false); }
  replay() {
    this.t0 = performance.now();
    this.animationPaused = false;
    this.pausedAt = 0;
    this.goCam(false);
  }

  toggleAnimationPause() {
    const now = performance.now();
    const cycle = DUR + this.plan[this.cur].span + 2.2;

    if (this.animationPaused) {
      this.t0 = now - this.pausedAt * 1000;
      this.animationPaused = false;
    } else {
      this.pausedAt = ((now - this.t0) / 1000) % cycle;
      this.animationPaused = true;
    }

    return this.animationPaused;
  }
  setLabels(v) { this.showLabels = v; this.buildLabels(); }
  flashPart(part) { this.flash = { part, until: performance.now() + 1800 }; }
  isVisible(part) { return this.objs.some(o => o.part === part && o.group.visible); }
  setColors(colors) {
    this.colors = colors; this.M.edge.color.set(colors.edge);
    this.objs.forEach(o => { if (o.ghost) o.ghost.material.color.set(colors.accent); if (o.kind === PANEL) o.mats.forEach(m => m.map && m.color.set(colors.wood)); });
  }
  goCam(instant) {
    const c = this.plan[this.cur].cam, v = this.finished && this.finCam ? this.finCam : this.wideOnly ? c.whole : this.detail && c.detail ? c.detail : c.wide;
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1, I = this.insets;
    const fh = Math.max(0.35, (h - I.top - I.bottom) / h), fw = Math.max(0.35, (w - I.left - I.right) / w);
    const tv = Math.tan((this.cam.fov * PI) / 360) * fh, th = Math.tan((this.cam.fov * PI) / 360) * (this.cam.aspect || 1) * fw;
    const dist = Math.max(v.r / tv, v.r / th) * 1.05;
    const P = v.target.clone().add(v.dir.clone().multiplyScalar(dist));
    this.zoomGoal = null; this.moved = false;
    if (instant || this.RM) { this.cam.position.copy(P); this.ctrl.target.copy(v.target); this.tween = null; }
    else this.tween = { start: performance.now(), p0: this.cam.position.clone(), p1: P, t0: this.ctrl.target.clone(), t1: v.target.clone() };
  }
  /** Zoom by factor f (<1 = closer) toward the screen point x, y (client pixels); the centre of the view if left out. */
  zoomBy(f, x, y) {
    const r = this.canvas.getBoundingClientRect();
    if (x == null) { x = r.left + r.width / 2; y = r.top + r.height / 2; }
    this.tween = null; this.moved = true; this.onMove?.();
    const g = this.zoomGoal;
    this.zoomGoal = { f: (g ? g.f : 1) * f, x, y };
  }
  applyZoom(f, x, y) {
    const C = this.ctrl, cam = this.cam, r = this.canvas.getBoundingClientRect();
    const d = cam.position.distanceTo(C.target);
    const nd = Math.max(C.minDistance, Math.min(C.maxDistance, d * f));
    if (!d || nd === d) return;
    f = nd / d;
    // the point under the pointer, at the depth of the point we turn around: it stays under the pointer
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, cam);
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, C.target);
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3()) || C.target.clone();
    cam.position.sub(p).multiplyScalar(f).add(p);
    C.target.sub(p).multiplyScalar(f).add(p);
  }
  /** Turn around point p from now on, gliding there; k < 1 also moves closer. */
  centreOn(p, k = 1) {
    const C = this.ctrl, off = this.cam.position.clone().sub(C.target);
    const d = Math.max(C.minDistance, Math.min(C.maxDistance, off.length() * k));
    this.zoomGoal = null;
    this.tween = { start: performance.now(), ms: 600, p0: this.cam.position.clone(), p1: p.clone().add(off.setLength(d)), t0: C.target.clone(), t1: p.clone() };
  }
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight; if (!w || !h) return;
    this.R.setSize(w, h, false); this.cam.aspect = w / h;
    // shiftX moves the picture sideways (a share of the width), e.g. to leave room for a caption over one side
    // insets: px covered by controls on each side; the picture's centre moves to the middle of what is left
    const I = this.insets, ox = w * (this.shiftX || 0) - (I.left - I.right) / 2, oy = -(I.top - I.bottom) / 2;
    if (ox || oy) this.cam.setViewOffset(w, h, ox, oy, w, h); else this.cam.clearViewOffset();
    this.cam.updateProjectionMatrix();
  }
  /** Px of the canvas covered by controls ({top, right, bottom, left}); camera framing keeps the model clear of them. */
  setInsets(i) { this.insets = { top: 0, right: 0, bottom: 0, left: 0, ...i }; this.resize(); }
  /** The finished piece from the front, slowly turning: no labels, nothing glowing. */
  setFinished(instant = false) {
    this.cur = this.N; this.finished = true; this.detail = false; this.t0 = performance.now();
    this.applyState(this.N, Infinity); this.root.updateMatrixWorld(true);
    const box = this.boxOf(this.objs.filter(o => o.group.visible && o.kind === PANEL));
    this.finCam = this.camFrom(box, new THREE.Vector3(0.75, 0.5, 0.95), 1.08);
    this.buildLabels(); this.goCam(instant);
  }

  /* ---------- labels ---------- */
  buildLabels() {
    this.labelsEl.innerHTML = ''; this.labelEls = [];
    if (!this.showLabels || !this.plan || this.finished) return;
    for (const l of this.plan[this.cur].labels) {
      const el = document.createElement('div');
      el.className = 'lab'
        + (l.isNew ? ' new' : '')
        + (l.big ? ' big' : '')
        + (l.compact ? ' compact' : '');
      el.textContent = l.text;
      this.labelsEl.append(el);
      this.labelEls.push({ el, o: l.o, anchor: l.anchor });
    }
  }
  placeLabels() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, v = new THREE.Vector3(), items = [];
    for (const L of this.labelEls || []) {
      const { el, o } = L;
      if (!o.group.visible) { el.hidden = true; continue; }
      if (L.anchor) v.copy(L.anchor).applyMatrix4(o.group.matrixWorld);
      else if (o.kind === PANEL) new THREE.Box3().setFromObject(o.inner).getCenter(v);
      else o.group.getWorldPosition(v);
      v.project(this.cam);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { el.hidden = true; continue; }
      el.hidden = false; L.x = ((v.x + 1) / 2) * w; L.y = ((1 - v.y) / 2) * h;
      if (!L.w) { L.w = el.offsetWidth; L.h = el.offsetHeight; }
      items.push(L);
    }
    // tags never cover each other: one that would overlap a tag lower down is lifted, and its stem grows to its spot
    items.sort((a, b) => b.y - a.y);
    const placed = [];
    for (const L of items) {
      let lift = 0;
      for (let k = 0; k < 8; k++) {
        const bottom = L.y - 9 - lift, top = bottom - L.h, left = L.x - L.w / 2, right = L.x + L.w / 2;
        const hit = placed.find(r => left < r.right + 4 && right > r.left - 4 && top < r.bottom + 4 && bottom > r.top - 4);
        if (!hit) { placed.push({ left, right, top, bottom }); break; }
        lift += bottom - hit.top + 4;
      }
      const dx = Math.min(0, w - 4 - (L.x + L.w / 2)) || Math.max(0, 4 - (L.x - L.w / 2));
      L.el.style.left = L.x + 'px'; L.el.style.top = L.y + 'px'; L.el.style.setProperty('--lift', lift + 'px'); L.el.style.setProperty('--dx', dx + 'px');
    }
  }

  /* ---------- part thumbnails ---------- */
  thumbnails() {
    const out = {}, tc = document.createElement('canvas'); tc.width = tc.height = 220;
    const tr = new THREE.WebGLRenderer({ canvas: tc, antialias: true, alpha: true, preserveDrawingBuffer: true });
    const ts = new THREE.Scene(); ts.add(new THREE.HemisphereLight(0xffffff, 0x8b8f86, 0.9 * PI));
    const l = new THREE.DirectionalLight(0xffffff, 0.6 * PI); l.position.set(1, 2, 1.5); ts.add(l);
    const tcam = new THREE.PerspectiveCamera(28, 1, 0.1, 100000);
    for (const [id, part] of Object.entries(this.guide.parts)) {
      let obj;
      if (part.kind === PANEL) {
        const inst = this.guide.panels.find(p => p.part === id);
        obj = makeBody(part, inst ? this.holesOf[inst.key] : [], this.M);
        const o = this.objs.find(x => x.key === inst?.key); if (o) obj.quaternion.copy(o.kfs[0].Q);
      } else { obj = makeHardware(part.kind, this.M, { len: part.len_mm, d: part.d_mm }, part).group; obj.rotation.set(0.35, -0.5, part.kind === 'cam_lock' ? PI / 2 + 0.3 : 0.25); }
      const holder = new THREE.Group(); holder.add(obj); ts.add(holder);
      const box = new THREE.Box3().setFromObject(holder), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
      const dir = part.kind === PANEL ? new THREE.Vector3(0.55, 1, 1.15) : new THREE.Vector3(0.3, 0.55, 1);
      tcam.position.copy(c.clone().add(dir.normalize().multiplyScalar((size / 2 / Math.tan((14 * PI) / 180)) * 1.02))); tcam.lookAt(c);
      tr.render(ts, tcam); out[id] = tc.toDataURL('image/png'); ts.remove(holder);
    }
    tr.dispose();
    return out;
  }
}
