// 3D builders for boards and hardware. Everything is in millimetres.
// Hardware convention: built along +x, with x = 0 at the board surface and +x pointing out of the hole.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bladeDepth } from '../guide.js';

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
    metal: new THREE.MeshStandardMaterial({ color: '#B9BEC3', metalness: 0.55, roughness: 0.35 }),
    black: new THREE.MeshStandardMaterial({ color: '#2A2C2F', metalness: 0.3, roughness: 0.5 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#8E9196', roughness: 1 }),
    plastic: new THREE.MeshStandardMaterial({ color: '#E6E4DF', roughness: 0.45 }),
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

function woodMat(M, long, upright) {
  const m = M.wood.clone(); m.map = M.wood.map.clone(); m.map.needsUpdate = true;
  m.map.repeat.set(1, long / 600); m.map.rotation = upright ? 0 : PI / 2; return m;
}
function shapeMat(name, color, M, long, upright) {
  let m = name === 'wood' ? woodMat(M, long, upright) : name === 'hardboard' ? M.hard : M[name] || M.wood;
  if (color) { m = m.clone(); m.color.set(color); }
  return m;
}
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
const V = a => new THREE.Vector3(...a);
const PLANE_BASIS = { xy: [X, Y, new THREE.Vector3(0, 0, 1)], xz: [X, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)], yz: [Y, new THREE.Vector3(0, 0, 1), X] };

/** Mesh along a straight line from a to b (a cylinder or a square bar). */
function rodMesh(a, b, r1, r2, mat, square) {
  const A = V(a), B = V(b), dir = B.clone().sub(A), L = Math.max(0.1, dir.length());
  const geo = square ? new THREE.BoxGeometry(r1 * 2, L, r1 * 2) : new THREE.CylinderGeometry(r2, r1, L, 28);
  const m = new THREE.Mesh(geo, mat);
  m.quaternion.setFromUnitVectors(Y, dir.normalize()); m.position.copy(A.add(B).multiplyScalar(0.5));
  return m;
}

/** A path through points with rounded corners of radius `bend`. */
function curvePath(pts, bend) {
  const path = new THREE.CurvePath();
  let start = pts[0].clone();
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (i === pts.length - 1) { path.add(new THREE.LineCurve3(start, p)); break; }
    const inD = p.clone().sub(pts[i - 1]), outD = pts[i + 1].clone().sub(p);
    const cut = Math.min(bend, inD.length() / 2, outD.length() / 2);
    const a = p.clone().sub(inD.normalize().multiplyScalar(cut)), b = p.clone().add(outD.normalize().multiplyScalar(cut));
    if (a.distanceTo(start) > 0.01) path.add(new THREE.LineCurve3(start, a));
    if (cut > 0.01) path.add(new THREE.QuadraticBezierCurve3(a, p.clone(), b));
    start = b;
  }
  return path;
}

/** A round tube along a path with rounded bends. */
function tubeMeshes(q, mat) {
  const pts = q.path.map(V), r = q.d / 2, out = [];
  if (q.square) {
    for (let i = 1; i < pts.length; i++) out.push(rodMesh(q.path[i - 1], q.path[i], r, r, mat, true));
    for (let i = 1; i < pts.length - 1; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(q.d, q.d, q.d), mat); c.position.copy(pts[i]); out.push(c); }
    return out;
  }
  const path = curvePath(pts, q.bend);
  const len = path.getLength();
  out.push(new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(24, Math.round(len / 6)), r, 20, false), mat));
  for (const [t, s] of [[0, -1], [1, 1]]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat);
    cap.position.copy(path.getPointAt(t)); cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), path.getTangentAt(t).multiplyScalar(s));
    out.push(cap);
  }
  return out;
}

const twoSided = m => { const c = m.clone(); c.side = THREE.DoubleSide; return c; };
/** Place a mesh built along +y at `at`, pointing along `axis`. */
function aligned(m, q) { m.quaternion.setFromUnitVectors(Y, V(q.axis)); m.position.set(...q.at); return m; }

/** Profile [[r,h],..] spun around +y, closed at both ends. */
function latheGeo(profile, seg = 48) {
  const p = profile.map(([r, h]) => new THREE.Vector2(Math.max(0, r), h));
  if (p[0].x > 0.01) p.unshift(new THREE.Vector2(0, p[0].y));
  if (p[p.length - 1].x > 0.01) p.push(new THREE.Vector2(0, p[p.length - 1].y));
  return new THREE.LatheGeometry(p, seg);
}

/** Thin dome: rim of diameter d at h = 0, top at h = depth (built along +y). Open at the rim. */
function shellGeo(q) {
  const R = q.d / 2, out = [], inn = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * (PI / 2);
    out.push(new THREE.Vector2(R * Math.cos(a), q.depth * Math.sin(a) + q.thick));
    inn.push(new THREE.Vector2(Math.max(0, R - q.thick) * Math.cos(a), q.depth * Math.sin(a)));
  }
  return new THREE.LatheGeometry([...out, ...inn.reverse(), out[0]], 56);
}

/** Any closed cross-section (profile [[u,v],..]) pulled along a path; v points toward q.up. */
function sweepGeo(q) {
  const path = curvePath(q.path.map(V), q.bend), n = Math.max(12, Math.min(240, Math.round(path.getLength() / 8)));
  const P = path.getSpacedPoints(n), T = P.map((_, i) => P[Math.min(i + 1, n)].clone().sub(P[Math.max(i - 1, 0)]).normalize());
  // rotation-minimising frames, starting from "up"
  let up = V(q.up);
  if (Math.abs(up.dot(T[0])) > 0.95) up = Math.abs(T[0].y) < 0.9 ? Y.clone() : new THREE.Vector3(0, 0, 1);
  const N = [up.clone().sub(T[0].clone().multiplyScalar(up.dot(T[0]))).normalize()];
  for (let i = 1; i <= n; i++) { const v = N[i - 1].clone(); N.push(v.sub(T[i].clone().multiplyScalar(v.dot(T[i]))).normalize()); }
  const B = T.map((t, i) => t.clone().cross(N[i]));
  const prof = q.profile, m = prof.length, at = (i, [u, v]) => P[i].clone().addScaledVector(B[i], u).addScaledVector(N[i], v);
  // split the profile at sharp corners so edges stay crisp and round parts stay smooth
  const edge = j => new THREE.Vector2(prof[(j + 1) % m][0] - prof[j][0], prof[(j + 1) % m][1] - prof[j][1]).normalize();
  const cols = [], cIn = [], cOut = [];
  for (let j = 0; j < m; j++) {
    const sharp = edge((j - 1 + m) % m).dot(edge(j)) < Math.cos((35 * PI) / 180);
    cIn[j] = cols.push(j) - 1; cOut[j] = sharp ? cols.push(j) - 1 : cIn[j];
  }
  const pos = [], idx = [], C = cols.length;
  for (let i = 0; i <= n; i++) for (const j of cols) pos.push(...at(i, prof[j]).toArray());
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = i * C + cOut[j], b = i * C + cIn[(j + 1) % m], c = a + C, d = b + C;
    idx.push(a, c, b, b, c, d);
  }
  // end caps with their own vertices
  const tri = THREE.ShapeUtils.triangulateShape(prof.map(([u, v]) => new THREE.Vector2(u, v)), []);
  for (const i of [0, n]) {
    const o = pos.length / 3;
    prof.forEach(p => pos.push(...at(i, p).toArray()));
    tri.forEach(([a, b, c]) => idx.push(o + a, o + b, o + c));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** Fan blades around a hub, built along +y (the axis). */
function bladesGeo(q) {
  const R = q.d / 2, r0 = (q.hub / 2) * 0.85, pitch = (q.pitch * PI) / 180, sweep = (q.sweep * PI) / 180, geos = [];
  const NS = 22, NU = 10;
  for (let k = 0; k < q.n; k++) {
    const pos = [], idx = [], th = (k / q.n) * 2 * PI;
    for (let i = 0; i <= NS; i++) {
      const s = i / NS, rho = r0 + s * (R - r0);
      const c = q.width * Math.sqrt(Math.max(0, Math.sin(PI * (0.08 + 0.92 * s ** 1.5)))); // paddle: narrow root, wide middle, round tip
      const ps = pitch * (1 - 0.35 * s), phi = th + sweep * s * s;
      for (let j = 0; j <= NU; j++) {
        const u = (j / NU) * 2 - 1, x = (u * c) / 2;
        const h = x * Math.sin(ps) + (1 - u * u) * c * 0.06; // tilt + a little camber
        const a = phi + (x * Math.cos(ps)) / rho;
        pos.push(rho * Math.cos(a), h, rho * Math.sin(a));
      }
    }
    for (let i = 0; i < NS; i++) for (let j = 0; j < NU; j++) {
      const a = i * (NU + 1) + j, b = a + 1, c = a + NU + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    geos.push(g);
  }
  return mergeGeometries(geos);
}
function hubGeo(q) {
  const r = q.hub / 2, h = bladeDepth(q) * 0.9;
  return latheGeo([[r, -h / 2], [r, h * 0.15], [r * 0.75, h * 0.4], [0, h / 2]]);
}

/** Domed wire guard: rim at h = 0, rings and spokes rising to `depth` at the centre (built along +y). */
function grilleGeo(q) {
  const R = q.d / 2, hAt = rho => q.depth * (1 - (rho / R) ** 2), geos = [], wr = q.wire / 2;
  const ring = (rho, r) => {
    const pts = []; for (let i = 0; i < 72; i++) { const a = (i / 72) * 2 * PI; pts.push(new THREE.Vector3(rho * Math.cos(a), hAt(rho), rho * Math.sin(a))); }
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 144, r, 6, true));
  };
  const hole = (q.hole || 0) / 2;
  ring(R, q.rim / 2);
  if (hole) ring(hole, wr * 1.5);
  for (let k = 1; k <= q.rings; k++) ring(hole + ((R - hole) * k) / (q.rings + 1), wr);
  // a solid badge in the middle, unless the centre is open
  const badge = hole || (q.spokes ? R * 0.1 : 0), tw = (q.twist * PI) / 180;
  for (let k = 0; k < q.spokes; k++) {
    const pts = [], a0 = (k / q.spokes) * 2 * PI;
    for (let i = 0; i <= 16; i++) { const rho = badge + ((R - badge) * i) / 16, a = a0 + tw * (rho / R); pts.push(new THREE.Vector3(rho * Math.cos(a), hAt(rho), rho * Math.sin(a))); }
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, wr, 5, false));
  }
  if (badge && !hole) { const b = new THREE.CylinderGeometry(badge * 1.2, badge * 1.2, q.wire * 2, 32); b.translate(0, q.depth, 0); geos.push(b.toNonIndexed()); }
  return mergeGeometries(geos.map(g => (g.index ? g.toNonIndexed() : g)));
}

/** A part made of shape primitives (see guide.js). Coordinates are the part's own, in mm. */
export function makeShape(part, holes, M) {
  const g = new THREE.Group(), def = part.material || (part.finish === 'hardboard' ? 'hardboard' : 'wood');
  for (const q of part.shape) {
    const name = q.mat || def, color = q.color || part.color;
    let meshes = [];
    if (q.type === 'box') {
      const [w, h, d] = q.size, r = Math.min(q.r, Math.min(w, h, d) / 2 - 0.01);
      const geo = r > 0.5 ? new RoundedBoxGeometry(w, h, d, 4, r) : new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(geo, shapeMat(name, color, M, Math.max(w, h, d), h >= w));
      m.position.set(...q.at); m.rotation.set(...q.rot.map(v => (v * PI) / 180)); meshes.push(m);
      if (r <= 0.5 && name !== 'fabric') { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.edge); e.position.copy(m.position); e.rotation.copy(m.rotation); g.add(e); }
    } else if (q.type === 'cyl') {
      const L = Math.hypot(...q.to.map((v, i) => v - q.from[i]));
      meshes.push(rodMesh(q.from, q.to, q.d / 2, q.d2 / 2, shapeMat(name, color, M, L, true)));
    } else if (q.type === 'tube') {
      meshes = tubeMeshes(q, shapeMat(name, color, M, 600, true));
    } else if (q.type === 'plate') {
      const sh = new THREE.Shape(q.outline.map(([u, v]) => new THREE.Vector2(u, v)));
      // rounded edges: the bevel starts r inside the outline, so the part keeps the traced size and thickness
      const r = q.r || 0;
      const geo = new THREE.ExtrudeGeometry(sh, r > 0.5
        ? { depth: Math.max(0.1, q.thick - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelOffset: -r, bevelSegments: 4, curveSegments: 16 }
        : { depth: q.thick, bevelEnabled: false, curveSegments: 16 });
      geo.translate(0, 0, r > 0.5 ? -(q.thick - 2 * r) / 2 : -q.thick / 2);
      const [bu, bv, bn] = PLANE_BASIS[q.plane];
      geo.applyMatrix4(new THREE.Matrix4().makeBasis(bu, bv, bn));
      const us = q.outline.map(p => p[0]), vs = q.outline.map(p => p[1]);
      const m = new THREE.Mesh(geo, shapeMat(name, color, M, Math.max(Math.max(...us) - Math.min(...us), Math.max(...vs) - Math.min(...vs)), true));
      m.position.set(...q.at); meshes.push(m);
      if (name !== 'fabric' && !(r > 0.5)) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), M.edge); e.position.copy(m.position); g.add(e); }
    } else if (q.type === 'sphere') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(q.d / 2, 28, 18), shapeMat(name, color, M, q.d, true));
      m.position.set(...q.at); meshes.push(m);
    } else if (q.type === 'lathe') {
      const hs = q.profile.map(p => p[1]);
      meshes.push(aligned(new THREE.Mesh(latheGeo(q.profile), twoSided(shapeMat(name, color, M, Math.max(...hs) - Math.min(...hs), true))), q));
    } else if (q.type === 'shell') meshes.push(aligned(new THREE.Mesh(shellGeo(q), twoSided(shapeMat(name, color, M, q.d, true))), q));
    else if (q.type === 'sweep') meshes.push(new THREE.Mesh(sweepGeo(q), twoSided(shapeMat(name, color, M, 600, true))));
    else if (q.type === 'blades') {
      const mt = twoSided(shapeMat(name, color, M, q.d, true));
      meshes.push(aligned(new THREE.Mesh(bladesGeo(q), mt), q), aligned(new THREE.Mesh(hubGeo(q), mt), q));
    } else if (q.type === 'grille') meshes.push(aligned(new THREE.Mesh(grilleGeo(q), shapeMat(name, color, M, q.d, true)), q));
    meshes.forEach(m => { m.castShadow = m.receiveShadow = true; g.add(m); });
  }
  for (const hole of holes) g.add(disc(Math.max(1, hole.d / 2), M.hole, hole.at, hole.face));
  return g;
}

/** Any solid part: a shaped part, or a plain board. */
export function makeBody(part, holes, M) {
  if (part.shape) return makeShape(part, holes, M);
  const size = part.size_mm || [400, 18, 300];
  const finish = part.finish || (part.material === 'hardboard' ? 'hardboard' : null) || (Math.min(...size) <= 4 ? 'hardboard' : null);
  const g = makePanel(size, holes, finish, M);
  if (part.material && !['wood', 'hardboard'].includes(part.material) || part.color) {
    g.children[0].material = shapeMat(part.material || 'wood', part.color, M, Math.max(...size), size[1] >= size[0]);
  }
  return g;
}

const cylX = (r, len, x0, mat, seg = 20) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.rotation.z = -PI / 2; m.position.x = x0 + len / 2; return m;
};

/** Washer thickness for a given outer diameter (used to stack a screw on top of its washer). */
export const washerThick = d => Math.max(1, d * 0.12);
const threads = (g, r, len, M) => { const n = Math.max(3, Math.floor(len / (r * 0.9))); for (let i = 0; i < n; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.2, 5, 16), M.steel); t.rotation.y = PI / 2; t.position.x = -len + (i + 0.5) * (len / n); g.add(t); } };

/** Hardware piece built along +x. size = { len, d } in mm (null = typical). Returns { group, spinnable } */
export function makeHardware(kind, M, size = {}) {
  const g = new THREE.Group();
  const L = size.len, D = size.d;
  if (kind === 'dowel') {
    const len = L || 30, r = (D || 8) / 2;
    g.add(cylX(r, len, -len * 0.4, M.beech));
    for (let i = 1; i < 5; i++) g.add(cylX(r * 1.02, 0.9, -len * 0.4 + (i * len) / 5 - 0.45, M.groove));
  } else if (kind === 'allen_bolt') {
    const d = D || 6, len = L || 30, hr = d * 0.85, hh = d;
    g.add(cylX(hr, hh, 0, M.black, 28));
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.32, d * 0.32, 0.6, 6), M.dark); sock.rotation.z = -PI / 2; sock.position.x = hh + 0.05; g.add(sock);
    g.add(cylX(d / 2 * 0.86, len, -len, M.steel, 16)); threads(g, d / 2 * 0.9, len, M);
  } else if (kind === 'washer') {
    const ro = (D || 12) / 2, ri = ro * 0.53, t = washerThick(ro * 2);
    const geo = new THREE.LatheGeometry([new THREE.Vector2(ri, 0), new THREE.Vector2(ro, 0), new THREE.Vector2(ro, t), new THREE.Vector2(ri, t), new THREE.Vector2(ri, 0)], 32);
    const m = new THREE.Mesh(geo, M.zinc); m.rotation.z = -PI / 2; g.add(m);
  } else if (kind === 'nut') {
    const d = D || 6, af = d * 1.7, h = d * 0.8;
    g.add(cylX(af / Math.sqrt(3), h, 0, M.zinc, 6));
    const hole = new THREE.Mesh(new THREE.CircleGeometry(d / 2, 18), M.dark); hole.rotation.y = PI / 2; hole.position.x = h + 0.05; g.add(hole);
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
    const d = D || 3.8, len = L || 16, k = d / 3.8;
    g.add(cylX(3.6 * k, 1.6 * k, 0, M.zinc));
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.8 * k, 4.4 * k, 0.9 * k), M.dark); s1.position.x = 1.6 * k; g.add(s1);
    const s2 = s1.clone(); s2.rotation.x = PI / 2; g.add(s2);
    g.add(cylX(d / 2, len, -len, M.steel, 12)); threads(g, d / 2 * 1.05, len, M);
  } else if (kind === 'bolt') {
    const d = D || 6, len = L || 30;
    g.add(cylX(d * 0.95, d * 0.66, 0, M.zinc, 6)); g.add(cylX(d / 2, len, -len, M.steel, 14));
  } else if (kind === 'bracket') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(2, 20, 40), M.zinc); base.position.set(1, 0, 0); g.add(base);
    const up = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 2), M.zinc); up.position.set(22, 0, -21); g.add(up);
    const h1 = new THREE.Mesh(new THREE.CircleGeometry(2.4, 18), M.dark); h1.rotation.y = PI / 2; h1.position.set(2.1, 0, 8); g.add(h1);
    const h2 = new THREE.Mesh(new THREE.CircleGeometry(2.4, 18), M.dark); h2.position.set(28, 0, -19.9); g.add(h2);
  } else {
    const b = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), M.zinc); b.position.x = 5; g.add(b);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group: g, spinnable: ['cam_screw', 'screw', 'bolt', 'allen_bolt', 'nut'].includes(kind) };
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
export const HOLE_FOR = { dowel: 8, cam_screw: 9, cam_lock: 15.4, shelf_pin: 5, screw: 0, nail: 0, bolt: 7, allen_bolt: 0, washer: 0, nut: 0, bracket: 0, other: 0 };
