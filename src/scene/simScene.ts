import * as THREE from 'three';
import gsap from 'gsap';
import { buildEarth, addEarthLights, EarthGroup } from './earthBuilder';
import { SimAnalytics } from '../types';
import { weaponById } from '../data';
import { regionFor } from '../data';

interface SimConfig {
  stageEl: HTMLElement;
  getSelectedWeapon: () => string;
  onAnalyticsUpdate: (data: SimAnalytics) => void;
  onTargetCoords: (text: string) => void;
  onLog: (msg: string, kind: string) => void;
  triggerGlitch: () => void;
}

export interface SimController {
  dispose: () => void;
  resizeCanvas: () => void;
}

export function initSimScene(config: SimConfig): SimController {
  const { stageEl, getSelectedWeapon, onAnalyticsUpdate, onTargetCoords, onLog, triggerGlitch } = config;

  const canvasEl = document.createElement('canvas');
  canvasEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  stageEl.prepend(canvasEl);

  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1.8;

  const simScene = new THREE.Scene();
  const simCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  simCamera.position.set(0, 0, 4.6);

  const earth: EarthGroup = buildEarth(1.4);
  simScene.add(earth);
  addEarthLights(simScene);

  const sgeo = new THREE.BufferGeometry();
  const pcount = 800;
  const ppos = new Float32Array(pcount * 3);
  for (let i = 0; i < pcount; i++) {
    const u = Math.random(), v = Math.random();
    const θ = 2*Math.PI*u, φ = Math.acos(2*v-1), r = 15*(0.6+0.4*Math.random());
    ppos[i*3] = r*Math.sin(φ)*Math.cos(θ); ppos[i*3+1] = r*Math.sin(φ)*Math.sin(θ); ppos[i*3+2] = r*Math.cos(φ);
  }
  sgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  const smat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.03, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
  simScene.add(new THREE.Points(sgeo, smat));

  const rotation = { x: 0.25, y: 1.2 };
  let isDragging = false;
  let lastMouse: { x: number; y: number } | null = null;
  let animId: number;

  const analytics: SimAnalytics = { casualties: 0, radius: 0, cost: 0, halflife: 0, sparkHistory: [] };

  function resizeCanvas() {
    const r = stageEl.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    renderer.setSize(r.width, r.height, false);
    simCamera.aspect = r.width / r.height;
    simCamera.updateProjectionMatrix();
  }

  function deployAt(e: PointerEvent) {
    const rect = canvasEl.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top)  / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, simCamera);
    const hits = ray.intersectObject(earth.sphere, false);
    if (!hits.length) { onLog('▸ MISS · vacuum impact', 'warn'); return; }

    earth.updateWorldMatrix(true, false);
    const localP = earth.worldToLocal(hits[0].point.clone());
    const v = localP.clone().normalize();
    const lat = Math.asin(v.y) * 180 / Math.PI;
    const lon = Math.atan2(v.z, v.x) * 180 / Math.PI;
    const region = regionFor(lat, lon);
    onTargetCoords(`${lat.toFixed(1)}°, ${lon.toFixed(1)}° · ${region}`);

    const w = weaponById(getSelectedWeapon());
    if (!w) return;
    const intensity = w.stats.YIELD;
    const isLaser = w.cat === 'lasers';
    const color = isLaser ? 0x7dff8e : 0xdc2626;

    const exGeo = new THREE.SphereGeometry(0.04, 16, 16);
    const exMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const ex = new THREE.Mesh(exGeo, exMat);
    ex.position.copy(v).multiplyScalar(1.41);
    earth.add(ex);
    gsap.to(ex.scale, { x: 6+intensity*16, y: 6+intensity*16, z: 6+intensity*16, duration: 0.9, ease: 'expo.out' });
    gsap.to(exMat, { opacity: 0, duration: 1.6, ease: 'power2.out', onComplete: () => earth.remove(ex) });

    const rGeo = new THREE.RingGeometry(0.04, 0.08, 32);
    const rMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const rMesh = new THREE.Mesh(rGeo, rMat);
    rMesh.position.copy(v).multiplyScalar(1.42);
    rMesh.lookAt(0, 0, 0); rMesh.rotateY(Math.PI);
    earth.add(rMesh);
    gsap.to(rMesh.scale, { x: 8+intensity*22, y: 8+intensity*22, z: 1, duration: 1.8, ease: 'power2.out' });
    gsap.to(rMat, { opacity: 0, duration: 1.8, ease: 'power2.out', onComplete: () => earth.remove(rMesh) });

    const cGeo = new THREE.SphereGeometry(0.018, 8, 8);
    const cMat = new THREE.MeshBasicMaterial({ color });
    const crater = new THREE.Mesh(cGeo, cMat);
    crater.position.copy(v).multiplyScalar(1.41);
    earth.add(crater);

    if (isLaser) {
      const beamPts = [
        new THREE.Vector3().copy(v).multiplyScalar(4.5),
        new THREE.Vector3().copy(v).multiplyScalar(1.4)
      ];
      const beamGeo = new THREE.BufferGeometry().setFromPoints(beamPts);
      const beamMat = new THREE.LineBasicMaterial({ color: 0x7dff8e, transparent: true, opacity: 1 });
      const beam = new THREE.Line(beamGeo, beamMat);
      earth.add(beam);
      gsap.to(beamMat, { opacity: 0, duration: 1.2, ease: 'power2.out', onComplete: () => earth.remove(beam) });
    }

    const density = (region === 'INTL. WATERS' || region === 'ARCTIC SHELF' || region === 'ANTARCTIC') ? 5
                  : region === 'OCEANIA' ? 80 : 320;
    const radiusKm = 5 + intensity * 95;
    const newCas  = Math.round(Math.PI * radiusKm * radiusKm * density * (0.4 + Math.random() * 0.5));
    const newCost = Math.round(newCas * (180000 + Math.random() * 250000));
    const halflifeDays = w.cat === 'nukes' ? Math.round(40 + intensity * 18000) : w.cat === 'lasers' ? 1 : 30;

    analytics.casualties += newCas;
    analytics.radius      = radiusKm;
    analytics.cost       += newCost;
    analytics.halflife    = Math.max(analytics.halflife, halflifeDays);
    analytics.sparkHistory.push(newCas);
    if (analytics.sparkHistory.length > 30) analytics.sparkHistory.shift();

    onAnalyticsUpdate({ ...analytics });
    onLog(`▸ ${w.code} · ${region} · ${newCas.toLocaleString()} souls · r=${radiusKm.toFixed(0)}km`, isLaser ? 'ok' : 'warn');
    triggerGlitch();
  }

  canvasEl.addEventListener('pointerdown', (e) => {
    isDragging = false;
    lastMouse = { x: e.clientX, y: e.clientY };
    canvasEl.setPointerCapture(e.pointerId);
  });
  canvasEl.addEventListener('pointermove', (e) => {
    if (!lastMouse) return;
    const dx = e.clientX - lastMouse.x, dy = e.clientY - lastMouse.y;
    if (Math.hypot(dx, dy) > 4) {
      isDragging = true;
      rotation.y += dx * 0.005;
      rotation.x += dy * 0.005;
      rotation.x = Math.max(-1.2, Math.min(1.2, rotation.x));
      lastMouse = { x: e.clientX, y: e.clientY };
    }
  });
  canvasEl.addEventListener('pointerup', (e) => {
    if (!isDragging) deployAt(e);
    lastMouse = null;
  });
  canvasEl.addEventListener('pointerleave', () => { lastMouse = null; });

  function animateSim() {
    animId = requestAnimationFrame(animateSim);
    earth.rotation.x += (rotation.x - earth.rotation.x) * 0.15;
    earth.rotation.y += (rotation.y - earth.rotation.y) * 0.15;
    if (!isDragging) rotation.y += 0.0015;
    renderer.render(simScene, simCamera);
  }
  animateSim();
  resizeCanvas();

  function dispose() {
    cancelAnimationFrame(animId);
    renderer.dispose();
    if (canvasEl.parentElement) canvasEl.parentElement.removeChild(canvasEl);
  }

  return { dispose, resizeCanvas };
}
