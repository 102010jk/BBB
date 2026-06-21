import * as THREE from 'three';
import gsap from 'gsap';
import { buildEarth, addEarthLights, EarthGroup } from './earthBuilder';
import { SimAnalytics } from '../types';
import { weaponById } from '../data';
import { regionFor } from '../data';
import { sound } from '../audio/sound';

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
  reset: () => void;
}

export function initSimScene(config: SimConfig): SimController {
  const { stageEl, getSelectedWeapon, onAnalyticsUpdate, onTargetCoords, onLog, triggerGlitch } = config;

  const canvasEl = document.createElement('canvas');
  canvasEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  stageEl.prepend(canvasEl);

  // 2D impact flash overlay (color set per shot).
  const flashEl = document.createElement('div');
  flashEl.className = 'sim-flash';
  stageEl.appendChild(flashEl);

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

  // Persistent impact markers (craters) so the sandbox can be purged on reset.
  const craters: THREE.Mesh[] = [];
  const CRATER_CAP = 60;
  const CAM_HOME = new THREE.Vector3(0, 0, 4.6);

  function flashStage(color: string, intensity: number) {
    flashEl.style.background = `radial-gradient(ellipse at center, ${color} 0%, transparent 70%)`;
    gsap.killTweensOf(flashEl);
    gsap.fromTo(flashEl,
      { opacity: Math.min(0.85, 0.3 + intensity * 0.6) },
      { opacity: 0, duration: 0.5 + intensity * 0.4, ease: 'power2.out' }
    );
  }

  function shakeCamera(intensity: number) {
    const amp = 0.04 + intensity * 0.16;
    gsap.killTweensOf(simCamera.position);
    const tl = gsap.timeline({
      onComplete: () => simCamera.position.copy(CAM_HOME),
    });
    for (let i = 0; i < 5; i++) {
      tl.to(simCamera.position, {
        x: CAM_HOME.x + (Math.random() - 0.5) * amp,
        y: CAM_HOME.y + (Math.random() - 0.5) * amp,
        duration: 0.05,
        ease: 'power1.inOut',
      });
    }
    tl.to(simCamera.position, { x: CAM_HOME.x, y: CAM_HOME.y, duration: 0.08, ease: 'power2.out' });
  }

  function clearCraters() {
    craters.forEach(c => {
      earth.remove(c);
      c.geometry.dispose();
      (c.material as THREE.Material).dispose();
    });
    craters.length = 0;
  }

  function reset() {
    clearCraters();
    analytics.casualties = 0;
    analytics.radius = 0;
    analytics.cost = 0;
    analytics.halflife = 0;
    analytics.sparkHistory = [];
    onAnalyticsUpdate({ ...analytics });
    onTargetCoords('—');
    onLog('▸ SANDBOX PURGED · registry zeroed', 'ok');
    sound.play('lock');
  }

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
    // -v.z matches the earth texture's longitude convention (east = +lon).
    const lon = Math.atan2(-v.z, v.x) * 180 / Math.PI;
    const region = regionFor(lat, lon);
    onTargetCoords(`${lat.toFixed(1)}°, ${lon.toFixed(1)}° · ${region}`);

    const w = weaponById(getSelectedWeapon());
    if (!w) return;
    const intensity = w.stats.YIELD;
    const isLaser = w.cat === 'lasers';
    const color = isLaser ? 0x7dff8e : 0xdc2626;

    // Core fireball
    const exGeo = new THREE.SphereGeometry(0.04, 16, 16);
    const exMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const ex = new THREE.Mesh(exGeo, exMat);
    ex.position.copy(v).multiplyScalar(1.41);
    earth.add(ex);
    gsap.to(ex.scale, { x: 6+intensity*16, y: 6+intensity*16, z: 6+intensity*16, duration: 0.9, ease: 'expo.out' });
    gsap.to(exMat, { opacity: 0, duration: 1.6, ease: 'power2.out', onComplete: () => { earth.remove(ex); exGeo.dispose(); exMat.dispose(); } });

    // Hot white flash core for high-yield strikes
    if (!isLaser && intensity > 0.45) {
      const coreGeo = new THREE.SphereGeometry(0.05, 16, 16);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.copy(v).multiplyScalar(1.41);
      earth.add(core);
      gsap.to(core.scale, { x: 4+intensity*10, y: 4+intensity*10, z: 4+intensity*10, duration: 0.35, ease: 'expo.out' });
      gsap.to(coreMat, { opacity: 0, duration: 0.5, ease: 'power2.out', onComplete: () => { earth.remove(core); coreGeo.dispose(); coreMat.dispose(); } });
    }

    // Expanding shockwave ring
    const rGeo = new THREE.RingGeometry(0.04, 0.08, 48);
    const rMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const rMesh = new THREE.Mesh(rGeo, rMat);
    rMesh.position.copy(v).multiplyScalar(1.42);
    rMesh.lookAt(0, 0, 0); rMesh.rotateY(Math.PI);
    earth.add(rMesh);
    gsap.to(rMesh.scale, { x: 8+intensity*22, y: 8+intensity*22, z: 1, duration: 1.8, ease: 'power2.out' });
    gsap.to(rMat, { opacity: 0, duration: 1.8, ease: 'power2.out', onComplete: () => { earth.remove(rMesh); rGeo.dispose(); rMat.dispose(); } });

    // Debris / spark burst — points scattered outward from the impact
    const sparkN = 44;
    const sgeoB = new THREE.BufferGeometry();
    const sposB = new Float32Array(sparkN * 3);
    for (let i = 0; i < sparkN; i++) {
      const u = Math.random(), vv = Math.random();
      const θ2 = 2*Math.PI*u, φ2 = Math.acos(2*vv-1), rr = 0.02 + Math.random()*0.05;
      sposB[i*3]   = rr*Math.sin(φ2)*Math.cos(θ2);
      sposB[i*3+1] = rr*Math.sin(φ2)*Math.sin(θ2);
      sposB[i*3+2] = rr*Math.cos(φ2);
    }
    sgeoB.setAttribute('position', new THREE.BufferAttribute(sposB, 3));
    const smatB = new THREE.PointsMaterial({ color, size: 0.02, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
    const sparks = new THREE.Points(sgeoB, smatB);
    sparks.position.copy(v).multiplyScalar(1.41);
    earth.add(sparks);
    gsap.to(sparks.scale, { x: 4+intensity*9, y: 4+intensity*9, z: 4+intensity*9, duration: 1.0, ease: 'expo.out' });
    gsap.to(smatB, { opacity: 0, duration: 1.2, ease: 'power2.out', onComplete: () => { earth.remove(sparks); sgeoB.dispose(); smatB.dispose(); } });

    // Persistent crater (capped + tracked for reset)
    const cGeo = new THREE.SphereGeometry(0.018, 8, 8);
    const cMat = new THREE.MeshBasicMaterial({ color });
    const crater = new THREE.Mesh(cGeo, cMat);
    crater.position.copy(v).multiplyScalar(1.41);
    earth.add(crater);
    craters.push(crater);
    if (craters.length > CRATER_CAP) {
      const old = craters.shift()!;
      earth.remove(old);
      old.geometry.dispose();
      (old.material as THREE.Material).dispose();
    }

    if (isLaser) {
      const beamPts = [
        new THREE.Vector3().copy(v).multiplyScalar(4.5),
        new THREE.Vector3().copy(v).multiplyScalar(1.4)
      ];
      const beamGeo = new THREE.BufferGeometry().setFromPoints(beamPts);
      const beamMat = new THREE.LineBasicMaterial({ color: 0x7dff8e, transparent: true, opacity: 1 });
      const beam = new THREE.Line(beamGeo, beamMat);
      earth.add(beam);
      gsap.to(beamMat, { opacity: 0, duration: 1.2, ease: 'power2.out', onComplete: () => { earth.remove(beam); beamGeo.dispose(); beamMat.dispose(); } });
    }

    // Feedback: sound, stage flash, camera shake
    sound.play(isLaser ? 'laser' : 'impact', 0.4 + intensity * 1.2);
    flashStage(isLaser ? 'rgba(125,255,142,0.5)' : 'rgba(220,38,38,0.55)', intensity);
    shakeCamera(intensity);

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
    gsap.killTweensOf(simCamera.position);
    clearCraters();
    renderer.dispose();
    if (canvasEl.parentElement) canvasEl.parentElement.removeChild(canvasEl);
    if (flashEl.parentElement) flashEl.parentElement.removeChild(flashEl);
  }

  return { dispose, resizeCanvas, reset };
}
