// Data-driven 3D assembly viewer. Feed it a normalized guide (see ../guide.js).
// Step 0 is "check your parts": every board lies on the floor. Step n (1..N) plays guide.steps[n-1].
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { makeMaterials, makeBody, makeHardware, makeTurnArrow, dirQuat, dirVec, snapToFace, washerThick, HOLE_FOR } from './parts3d.js';
import { PANEL } from '../guide.js';

const PI = Math.PI;
const DUR = 1.3;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const UP_ROT = { '+y': [0, 0, 0], '-y': [PI, 0, 0], '+x': [0, 0, PI / 2], '-x': [0, 0, -PI / 2], '+z': [-PI / 2, 0, 0], '-z': [PI / 2, 0, 0] };

export class Viewer {
  constructor(canvas, labelsEl, { colors, reducedMotion = false } = {}) {
    this.canvas = canvas; this.labelsEl = labelsEl; this.colors = colors; this.RM = reducedMotion;
    this.cur = 0; this.detail = true; this.showLabels = true; this.objs = []; this.byKey = {}; this.t0 = 0;
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

    const C = this.ctrl = new OrbitControls(this.cam, canvas);
    C.enableDamping = true; C.dampingFactor = 0.09; C.maxPolarAngle = PI * 0.56; C.minDistance = 0.05; C.maxDistance = 8;
    C.addEventListener('start', () => { this.tween = null; });

    // tap to identify
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
    canvas.addEventListener('pointerdown', e => (down = [e.clientX, e.clientY]));
    canvas.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const r = canvas.getBoundingClientRect();
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, this.cam);
      for (const h of ray.intersectObjects(this.root.children, true)) {
        if (!h.object.isMesh) continue;
        let o = h.object; while (o && !o.userData.obj) o = o.parent;
        if (o && o.visible && o.userData.obj.part) { this.onPick?.(o.userData.obj.part); return; }
      }
      this.onPick?.(null);
    });

    this.resize(); addEventListener('resize', () => { this.resize(); this.goCam(true); });
    const loop = now => { requestAnimationFrame(loop); this.frame(now); };
    requestAnimationFrame(loop);
  }

  /* ---------- building the scene from a guide ---------- */
  load(guide) {
    this.guide = guide; this.N = guide.steps.length;
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    this.objs = []; this.byKey = {};
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

    // floor layout in front of the finished piece
    const fb = this.finalBox, rowMax = Math.max(1800, (fb.max.x - fb.min.x) * 2.4);
    let cx = fb.min.x - 250, cz = fb.max.z + 220, rowDepth = 0;
    const order = panels.slice().sort((a, b) => a.p.step - b.p.step);
    for (const it of order) {
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
      if (cx + w > fb.min.x - 250 + rowMax) { cx = fb.min.x - 250; cz += rowDepth + 60; rowDepth = 0; }
      it.trayP = new THREE.Vector3(cx + w / 2, h / 2, cz + d / 2); it.trayQ = TQ;
      cx += w + 60; rowDepth = Math.max(rowDepth, d);
    }

    for (const it of panels) {
      const part = P[it.p.part];
      const o = this.addObj({ key: it.p.key, part: it.p.part, kind: PANEL, parent: null, size: it.size,
        build: () => makeBody(part, holesOf[it.p.key], this.M),
        kfs: [{ s: 0, P: it.trayP, Q: it.trayQ }, { s: it.p.step, P: new THREE.Vector3(...it.p.pos), Q: it.Q }], arc: 260 });
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
    for (const h of guide.hardware) {
      const part = P[h.part], kind = part.kind, at = atOf(h);
      const Q = dirQuat(h.dir).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (h.roll * PI) / 180));
      const Pp = new THREE.Vector3(...at);
      if (['screw', 'bolt', 'allen_bolt'].includes(kind)) {
        const w = washers.find(x => x.panel === h.panel && x.dir === h.dir && Math.hypot(...atOf(x).map((v, i) => v - at[i])) < 3);
        if (w) Pp.add(dirVec(h.dir).multiplyScalar(washerThick(P[w.part].d_mm || 12)));
      }
      const from = Pp.clone().add(dirVec(h.dir).multiplyScalar(kind === 'nail' ? 45 : 65 + (part.len_mm || 0) * 0.6));
      const o = this.addObj({ key: h.key, part: h.part, kind, parent: h.panel, build: () => makeHardware(kind, this.M, { len: part.len_mm, d: part.d_mm }),
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
    o.inner.traverse(m => {
      if (!m.isMesh || m.material === this.M.hole) return;
      m.material = Array.isArray(m.material) ? m.material.map(x => x.clone()) : m.material.clone();
      [].concat(m.material).forEach(x => x.emissive && o.mats.push(x));
    });
    (o.parent ? this.byKey[o.parent].group : this.root).add(o.group);
    this.objs.push(o); this.byKey[o.key] = o; o.delay = 0;
    return o;
  }

  /** Stagger timings, labels and camera framing for every step. */
  planSteps() {
    this.plan = [];
    for (let s = 0; s <= this.N; s++) {
      const moving = this.objs.filter(o => o.kind === PANEL && o.kfs[1]?.s === s && s > 0);
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
          if (seen.has(o.part)) continue; seen.add(o.part);
          labels.push({ o, text: o.kind === PANEL ? o.part : `${o.part} ${this.guide.parts[o.part].name.toLowerCase()}`, isNew: true });
        }
        if (turning[0]) labels.push({ o: turning[0], text: '½ turn clockwise', isNew: true });
        const hosts = new Set(added.map(o => o.parent));
        hosts.forEach(k => { const p = this.byKey[k]; if (p && !seen.has(p.part)) { labels.push({ o: p, text: p.part }); seen.add(p.part); } });
      }
      this.plan.push({ moving, added, turning, span, labels });
    }
    // cameras need world positions: evaluate each step's end state
    for (let s = 0; s <= this.N; s++) {
      this.applyState(s, Infinity);
      this.root.updateMatrixWorld(true);
      const pl = this.plan[s];
      const focus = s === 0 ? this.objs.filter(o => o.kind === PANEL) : [...pl.moving, ...pl.added, ...pl.turning];
      const all = this.objs.filter(o => o.group.visible);
      const placed = all.filter(o => o.kind !== PANEL || !o.kfs[1] || o.kfs[1].s <= s);
      const wide = this.boxOf(all.length ? all : this.objs);
      const outs = [...pl.added, ...pl.turning].map(o => o.outDir.clone().applyQuaternion(o.group.parent.getWorldQuaternion(new THREE.Quaternion())));
      const avg = outs.reduce((a, v) => a.add(v), new THREE.Vector3());
      let dir = new THREE.Vector3(0.45, 0.62, 0.85);
      if (avg.length() > 0.3 * outs.length && outs.length) { avg.normalize(); dir = avg.clone().multiplyScalar(1.1).add(new THREE.Vector3(0.3, 0.55, 0.35)); if (avg.y > 0.8) dir.add(new THREE.Vector3(0.1, 0, 0.6)); }
      if (s === 0) dir = new THREE.Vector3(0, 0.8, 0.62);
      const fbox = this.boxOf(focus.length ? focus : all);
      const cam = { wide: this.camFrom(s === 0 ? fbox : focus.length && pl.moving.length ? wide : fbox.union ? fbox : wide, dir, 1.05) };
      if (s > 0 && !pl.moving.length && (pl.added.length || pl.turning.length)) {
        const first = (pl.added[0] || pl.turning[0]);
        const p0 = first.group.getWorldPosition(new THREE.Vector3());
        const near = [...pl.added, ...pl.turning].filter(o => o.group.getWorldPosition(new THREE.Vector3()).distanceTo(p0) < 0.16);
        cam.detail = this.camFrom(this.boxOf(near), dir, 2.4, 0.09);
        cam.wide = this.camFrom(fbox.clone().union(this.boxOf(near)), dir, 1.1);
      }
      if (s > 0 && pl.moving.length) cam.wide = this.camFrom(this.boxOf(placed), new THREE.Vector3(0.75, 0.48, 0.85).add(pl.moving.some(o => o.kfs[1].P.z < this.finalBox.min.z + 10) ? new THREE.Vector3(-1.4, 0, -1.6) : new THREE.Vector3()), 1.05);
      pl.cam = cam;
    }
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
      if (o.ghost) o.ghost.visible = s === o.kfs[1]?.s && s > 0 && !this.RM && el < o.delay + DUR * 0.98;
    }
    (this.turnArrows || []).forEach(t => (t.a.visible = t.s === s));
    if (this.wall) this.wall.visible = s >= this.guide.scene.wall_step;
  }

  /* ---------- per-frame ---------- */
  frame(now) {
    if (!this.guide) return;
    const pl = this.plan[this.cur], cycle = DUR + pl.span + 2.2;
    const el = this.RM ? Infinity : ((now - this.t0) / 1000) % cycle;
    this.applyState(this.cur, el);
    const pulse = 0.5 + 0.5 * Math.sin(now / 260), acc = new THREE.Color(this.colors.accent);
    const fresh = new Set([...pl.moving, ...pl.added, ...pl.turning]);
    for (const o of this.objs) {
      const glow = this.cur > 0 && fresh.has(o) ? (o.kind === PANEL ? 0.05 + 0.1 * pulse : 0.2 + 0.3 * pulse) : 0;
      const f = this.flash && this.flash.part === o.part && now < this.flash.until ? 0.55 * pulse + 0.2 : 0;
      o.mats.forEach(m => m.emissive.copy(acc).multiplyScalar(Math.max(glow, f)));
    }
    if (this.tween) {
      const p = Math.min(1, (now - this.tween.start) / 900), e = ease(p);
      this.cam.position.lerpVectors(this.tween.p0, this.tween.p1, e); this.ctrl.target.lerpVectors(this.tween.t0, this.tween.t1, e);
      if (p >= 1) this.tween = null;
    }
    this.ctrl.update(); this.R.render(this.S, this.cam); this.placeLabels();
  }

  /* ---------- controls ---------- */
  setStep(s, instant = false) {
    this.cur = Math.max(0, Math.min(this.N, s)); this.detail = true; this.t0 = performance.now();
    this.buildLabels(); this.goCam(instant);
  }
  hasDetail() { return !!this.plan?.[this.cur]?.cam.detail; }
  setDetail(v) { this.detail = v; this.goCam(false); }
  replay() { this.t0 = performance.now(); this.goCam(false); }
  setLabels(v) { this.showLabels = v; this.buildLabels(); }
  flashPart(part) { this.flash = { part, until: performance.now() + 1800 }; }
  isVisible(part) { return this.objs.some(o => o.part === part && o.group.visible); }
  setColors(colors) {
    this.colors = colors; this.M.edge.color.set(colors.edge);
    this.objs.forEach(o => { if (o.ghost) o.ghost.material.color.set(colors.accent); if (o.kind === PANEL) o.mats.forEach(m => m.map && m.color.set(colors.wood)); });
  }
  goCam(instant) {
    const c = this.plan[this.cur].cam, v = this.detail && c.detail ? c.detail : c.wide;
    const tv = Math.tan((this.cam.fov * PI) / 360), th = tv * (this.cam.aspect || 1);
    const dist = Math.max(v.r / tv, v.r / th) * 1.05;
    const P = v.target.clone().add(v.dir.clone().multiplyScalar(dist));
    if (instant || this.RM) { this.cam.position.copy(P); this.ctrl.target.copy(v.target); this.tween = null; }
    else this.tween = { start: performance.now(), p0: this.cam.position.clone(), p1: P, t0: this.ctrl.target.clone(), t1: v.target.clone() };
  }
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight; if (!w || !h) return;
    this.R.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }

  /* ---------- labels ---------- */
  buildLabels() {
    this.labelsEl.innerHTML = ''; this.labelEls = [];
    if (!this.showLabels || !this.plan) return;
    for (const l of this.plan[this.cur].labels) {
      const el = document.createElement('div');
      el.className = 'lab' + (l.isNew ? ' new' : '') + (l.big ? ' big' : ''); el.textContent = l.text;
      this.labelsEl.append(el); this.labelEls.push({ el, o: l.o });
    }
  }
  placeLabels() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, v = new THREE.Vector3();
    for (const { el, o } of this.labelEls || []) {
      if (!o.group.visible) { el.hidden = true; continue; }
      if (o.kind === PANEL) { const b = new THREE.Box3().setFromObject(o.inner); v.set((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2); }
      else o.group.getWorldPosition(v);
      v.project(this.cam);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { el.hidden = true; continue; }
      el.hidden = false; el.style.left = ((v.x + 1) / 2) * w + 'px'; el.style.top = ((1 - v.y) / 2) * h + 'px';
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
      } else { obj = makeHardware(part.kind, this.M, { len: part.len_mm, d: part.d_mm }).group; obj.rotation.set(0.35, -0.5, part.kind === 'cam_lock' ? PI / 2 + 0.3 : 0.25); }
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
