// Page for the server's compare pass: shows one guide, one step at a time, with no animation.
import './styles.css';
import * as THREE from 'three';
import { Viewer } from './viewer/Viewer.js';
import { normalizeGuide } from './guide.js';

const viewer = new Viewer(document.getElementById('stage'), document.getElementById('labels'),
  { colors: { wood: '#D6B98E', accent: '#FFB300', edge: '#2A2520' }, reducedMotion: true });
const frames = n => new Promise(done => { const f = () => (n-- <= 0 ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); });

window.showGuide = async g => { viewer.load(normalizeGuide(g)); await frames(3); return viewer.N; };
// wide view of the whole piece at the end of step s (0 = parts on the floor)
window.showStep = async s => {
  if (s > 0) {
    // frame everything that is in place, like the manual's step drawings, not the close-up the app uses
    viewer.applyState(s, Infinity); viewer.root.updateMatrixWorld(true);
    viewer.plan[s].cam = { wide: viewer.camFrom(viewer.boxOf(viewer.objs.filter(o => o.group.visible)), new THREE.Vector3(0.45, 0.62, 0.85), 1.05) };
  }
  viewer.setStep(s, true); viewer.detail = false; viewer.goCam(true); await frames(3);
};
window.renderReady = true;
