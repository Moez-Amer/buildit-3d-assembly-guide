// 3D builders for boards and hardware. Everything is in millimetres.
// Hardware convention: built along +x, with x = 0 at the board surface and +x pointing out of the hole.
import * as THREE from 'three';

const PI = Math.PI;

let grain = null;
function grainTexture() {
  if (grain) return grain;
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 512);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const y0 = rnd() * 512, a = 0.03 + rnd() * 0.09, f = 0.01 + rnd() * 0.02, amp = 2 + rnd() * 6;
    x.strokeStyle = `rgba(110,72,30,${a})`; x.lineWidth = 0.6 + rnd() * 2.2; x.beginPath();
    for (let px = 0; px <= 256; px += 8) x.lineTo(px, y0 + Math.sin(px * f + i) * amp);
    x.stroke();
  }
  grain = new THREE.CanvasTexture(c); grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.colorSpace = THREE.SRGBColorSpace;
  return grain;
}

export function makeMaterials(colors) {
  return {
    wood: new THREE.MeshStandardMaterial({ color: colors.wood, map: grainTexture(), roughness: 0.72 }),
    hard: new THREE.MeshStandardMaterial({ color: '#8E6A45', roughness: 0.9 }),
    white: new THREE.MeshStandardMaterial({ color: '#F3F1EC', roughness: 0.8 }),
    hole: new THREE.MeshStandardMaterial({ color: '#2B2118', roughness: 1 }),
    beech: new THREE.MeshStandardMaterial({ color: '#E7CB92', roughness: 0.85 }),
    groove: new THREE.MeshStandardMaterial({ color: '#B8955C', roughness: 0.9 }),
    zinc: new THREE.MeshStandardMaterial({ color: '#D9DDE2', metalness: 0.15, roughness: 0.38 }),
    steel: new THREE.MeshStandardMaterial({ color: '#A9AFB5', metalness: 0.2, roughness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2F3337', roughness: 0.6 }),
    accent: new THREE.MeshStandardMaterial({ color: colors.accent, roughness: 0.5, emissive: new THREE.Color(colors.accent).multiplyScalar(0.35) }),
    edge: new THREE.LineBasicMaterial({ color: colors.edge, transparent: true, opacity: 0.55 })
  };
}

const FACE = { '+x': [0, 1], '-x': [0, -1], '+y': [1, 1], '-y': [1, -1], '+z': [2, 1], '-z': [2, -1] };
/** Rotation that turns the +x axis into the given direction. */
export function dirQuat(dir) {
  const e = { '+x': [0, 0, 0], '-x': [0, PI, 0], '+y': [0, 0, PI / 2], '-y': [0, 0, -PI / 2], '+z': [0, -PI / 2, 0], '-z': [0, PI / 2, 0] }[dir] || [0, 0, 0];
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(...e));
}
export function dirVec(dir) { const [a, s] = FACE[dir] || FACE['+y']; const v = [0, 0, 0]; v[a] = s; return new THREE.Vector3(...v); }
/** Put a point exactly on the given face of a box of size `size`. */
export function snapToFace(at, dir, size) { const [a, s] = FACE[dir] || FACE['+y']; const p = at.slice(); p[a] = s * size[a] / 2; return p; }

function disc(r, mat, pos, face) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 22), mat);
  const off = 0.25, p = pos.slice(); const [a, s] = FACE[face]; p[a] += s * off;
  m.position.set(...p);
  if (face === '+x') m.rotation.y = PI / 2; if (face === '-x') m.rotation.y = -PI / 2;
  if (face === '+y') m.rotation.x = -PI / 2; if (face === '-y') m.rotation.x = PI / 2;
  if (face === '-z') m.rotation.y = PI;
  return m;
}

/** A board with its pre-drilled holes. holes: [{face, at, d}] in board coordinates. */
export function makePanel(size, holes, finish, M) {
  const [w, h, d] = size, g = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, h, d);
  let mat;
  const thin = Math.min(w, h, d);
  if (finish === 'hardboard' || thin <= 4) {
    // white face is the largest face pointing +z or the one opposite the side hardware goes in; keep it simple: +z white
    mat = [M.hard, M.hard, M.hard, M.hard, M.white, M.hard];
  } else {
    mat = M.wood.clone(); mat.map = M.wood.map.clone(); mat.map.needsUpdate = true;
    const long = Math.max(w, h, d); mat.map.repeat.set(1, long / 600); mat.map.rotation = h >= w ? 0 : PI / 2;
  }
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.edge));
  for (const hole of holes) g.add(disc(Math.max(1, hole.d / 2), M.hole, snapToFace(hole.at, hole.face, size), hole.face));
  return g;
}

const cylX = (r, len, x0, mat, seg = 20) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.rotation.z = -PI / 2; m.position.x = x0 + len / 2; return m;
};

/** Hardware piece built along +x. Returns { group, spinnable } */
export function makeHardware(kind, M) {
  const g = new THREE.Group();
  if (kind === 'dowel') {
    g.add(cylX(4, 30, -12, M.beech));
    [-7, 0, 7, 13].forEach(x => g.add(cylX(4.08, 0.9, x - 0.45, M.groove)));
  } else if (kind === 'cam_screw') {
    g.add(cylX(2.6, 11, -11, M.steel));
    for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.55, 6, 18), M.steel); t.rotation.y = PI / 2; t.position.x = -10 + i * 1.8; g.add(t); }
    g.add(cylX(5.2, 1.6, 0, M.zinc, 6));
    g.add(cylX(3.3, 22, 1.6, M.zinc));
    g.add(cylX(2.4, 4, 23.6, M.zinc));
    const kb = new THREE.Mesh(new THREE.SphereGeometry(4.4, 20, 14), M.zinc); kb.position.x = 31.5; kb.scale.x = 0.85; g.add(kb);
  } else if (kind === 'cam_lock') {
    g.add(cylX(7.5, 12.6, -12, M.zinc, 28));
    const slot = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 11), M.dark); slot.position.x = 0.4; g.add(slot);
    const sh = new THREE.Shape(); sh.moveTo(0, 7); sh.lineTo(2.4, 3.5); sh.lineTo(-2.4, 3.5); sh.lineTo(0, 7);
    const ar = new THREE.Mesh(new THREE.ShapeGeometry(sh), M.dark); ar.rotation.y = PI / 2; ar.position.x = 0.66; g.add(ar);
    const notch = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 7), M.dark); notch.position.set(-5, 6.4, 0); g.add(notch);
  } else if (kind === 'nail') {
    g.add(cylX(2.2, 0.8, 0, M.steel));
    g.add(cylX(0.8, 18, -18, M.steel, 10));
    const pt = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2, 10), M.steel); pt.rotation.z = PI / 2; pt.position.x = -19; g.add(pt);
  } else if (kind === 'shelf_pin') {
    g.add(cylX(2.5, 14, -6, M.zinc, 14)); g.add(cylX(3.6, 1.2, 0, M.zinc, 14));
  } else if (kind === 'screw') {
    g.add(cylX(3.6, 1.6, 0, M.zinc));
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.4, 0.9), M.dark); s1.position.x = 1.6; g.add(s1);
    const s2 = s1.clone(); s2.rotation.x = PI / 2; g.add(s2);
    g.add(cylX(1.9, 16, -16, M.steel, 12));
    for (let i = 0; i < 7; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(2, 0.4, 5, 14), M.steel); t.rotation.y = PI / 2; t.position.x = -15 + i * 2.1; g.add(t); }
  } else if (kind === 'bolt') {
    g.add(cylX(5.5, 4, 0, M.zinc, 6)); g.add(cylX(3, 30, -30, M.steel, 14));
  } else if (kind === 'bracket') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(2, 20, 40), M.zinc); base.position.set(1, 0, 0); g.add(base);
    const up = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 2), M.zinc); up.position.set(22, 0, -21); g.add(up);
    const h1 = new THREE.Mesh(new THREE.CircleGeometry(2.4, 18), M.dark); h1.rotation.y = PI / 2; h1.position.set(2.1, 0, 8); g.add(h1);
    const h2 = new THREE.Mesh(new THREE.CircleGeometry(2.4, 18), M.dark); h2.position.set(28, 0, -19.9); g.add(h2);
  } else {
    const b = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), M.zinc); b.position.x = 5; g.add(b);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group: g, spinnable: ['cam_screw', 'screw', 'bolt'].includes(kind) };
}

/** Curved "turn clockwise" arrow lying in the y-z plane above a surface (+x is up out of the surface). */
export function makeTurnArrow(M) {
  const g = new THREE.Group(), a = PI * 1.4;
  const t = new THREE.Mesh(new THREE.TorusGeometry(15, 1.6, 8, 40, a), M.accent); g.add(t);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(3.6, 8, 16), M.accent);
  cone.position.set(Math.cos(a) * 15, Math.sin(a) * 15, 0);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-Math.sin(a), Math.cos(a), 0).normalize());
  g.add(cone);
  g.rotation.y = -PI / 2; // circle plane faces +x (out of the surface); drawn clockwise seen from outside
  const wrap = new THREE.Group(); wrap.add(g); wrap.position.x = 5; return wrap;
}

/** Hole diameter a hardware kind leaves in its board. 0 = none drawn. */
export const HOLE_FOR = { dowel: 8, cam_screw: 9, cam_lock: 15.4, shelf_pin: 5, screw: 0, nail: 0, bolt: 7, bracket: 0, other: 0 };
