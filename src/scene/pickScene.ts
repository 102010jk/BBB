import * as THREE from 'three';
import gsap from 'gsap';
import { buildEarth, buildTrajectory, addEarthLights, EarthGroup } from './earthBuilder';
import { Target } from '../types';

export interface PickController {
  resizeCanvas: () => void;
  dispose: () => void;
  setVisible: (v: boolean) => void;
}

export function initPickScene(
  canvas: HTMLCanvasElement,
  stageEl: HTMLElement,
  onPickTarget: (target: Target & { localP: THREE.Vector3 }) => void,
): PickController {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1.8;

  const pickScene = new THREE.Scene();
  const pickCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  pickCamera.position.set(0, 0, 4.6);

  const earth: EarthGroup = buildEarth(1.4);
  pickScene.add(earth);
  addEarthLights(pickScene);

  const sgeo = new THREE.BufferGeometry();
  const pcount = 600;
  const ppos = new Float32Array(pcount * 3);
  for (let i = 0; i < pcount; i++) {
    const u = Math.random(), v = Math.random();
    const θ = 2*Math.PI*u, φ = Math.acos(2*v-1), r = 12*(0.6+0.4*Math.random());
    ppos[i*3] = r*Math.sin(φ)*Math.cos(θ); ppos[i*3+1] = r*Math.sin(φ)*Math.sin(θ); ppos[i*3+2] = r*Math.cos(φ);
  }
  sgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  const smat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.03, transparent: true, opacity: 0.65, sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending });
  pickScene.add(new THREE.Points(sgeo, smat));

  const rotation = { x: 0.3, y: 0.8 };
  let isDragging = false;
  let lastMouse: { x: number; y: number } | null = null;
  let marker: THREE.Mesh | null = null;
  let trajectory: THREE.Line | null = null;
  let animId: number;

  function resizeCanvas() {
    const r = stageEl.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    pickCamera.aspect = r.width / r.height;
    pickCamera.updateProjectionMatrix();
  }

  function pickAt(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top)  / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, pickCamera);
    const hits = ray.intersectObject(earth.sphere, false);
    if (!hits.length) return;
    earth.updateWorldMatrix(true, false);
    const localP = earth.worldToLocal(hits[0].point.clone());
    const v = localP.clone().normalize();
    const lat =  Math.asin(v.y) * 180 / Math.PI;
    // -v.z matches the earth texture's longitude convention (east = +lon).
    const lon =  Math.atan2(-v.z, v.x) * 180 / Math.PI;

    if (marker) earth.remove(marker);
    const mGeo = new THREE.SphereGeometry(0.035, 12, 12);
    const mMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    marker = new THREE.Mesh(mGeo, mMat);
    marker.position.copy(v).multiplyScalar(1.4);
    earth.add(marker);

    const rGeo = new THREE.RingGeometry(0.04, 0.10, 32);
    const rMat = new THREE.MeshBasicMaterial({ color: 0xdc2626, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
    const rMesh = new THREE.Mesh(rGeo, rMat);
    rMesh.position.copy(v).multiplyScalar(1.41);
    rMesh.lookAt(0, 0, 0);
    rMesh.rotateY(Math.PI);
    marker.add(rMesh);
    gsap.fromTo(rMesh.scale, { x: 0.3, y: 0.3, z: 0.3 }, { x: 1.6, y: 1.6, z: 1.6, duration: 1.4, ease: 'power2.out', repeat: -1 });
    gsap.fromTo(rMat, { opacity: 0.7 }, { opacity: 0, duration: 1.4, ease: 'power2.out', repeat: -1 });

    if (trajectory) earth.remove(trajectory);
    trajectory = buildTrajectory(
      new THREE.Vector3().copy(v).multiplyScalar(1.4),
      new THREE.Vector3(2.6, 1.9, 1.2)
    );
    earth.add(trajectory);

    onPickTarget({ lat, lon, region: computeRegion(lat, lon), localP: v.clone().multiplyScalar(1.4) });
  }

  function computeRegion(lat: number, lon: number): string {
    if (lat > 60)  return 'ARCTIC SHELF';
    if (lat < -60) return 'ANTARCTIC';
    if (lat > 25 && lon > -10 && lon < 60)   return 'EUR / MENA';
    if (lat > 0  && lon > 60  && lon < 150)  return 'ASIA';
    if (lat > 25 && lon > -130 && lon < -60) return 'NORAM';
    if (lat < 0  && lon > -90  && lon < -30) return 'SOUTH AMERICA';
    if (lat > -40 && lat < 30 && lon > -20 && lon < 55) return 'AFRICA';
    if (lat < -10 && lon > 100 && lon < 180) return 'OCEANIA';
    return 'INTL. WATERS';
  }

  // Input
  canvas.addEventListener('pointerdown', (e) => {
    isDragging = false;
    lastMouse = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!lastMouse) return;
    const dx = e.clientX - lastMouse.x, dy = e.clientY - lastMouse.y;
    if (Math.hypot(dx, dy) > 4) isDragging = true;
    if (isDragging) {
      rotation.y += dx * 0.005;
      rotation.x += dy * 0.005;
      rotation.x = Math.max(-1.2, Math.min(1.2, rotation.x));
      lastMouse = { x: e.clientX, y: e.clientY };
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    canvas.classList.remove('dragging');
    if (!isDragging) pickAt(e);
    lastMouse = null;
  });
  canvas.addEventListener('pointerleave', () => { lastMouse = null; canvas.classList.remove('dragging'); });

  let running = false;

  function animatePick() {
    if (!running) return;
    animId = requestAnimationFrame(animatePick);
    earth.rotation.x += (rotation.x - earth.rotation.x) * 0.15;
    earth.rotation.y += (rotation.y - earth.rotation.y) * 0.15;
    rotation.y += 0.0015;
    renderer.render(pickScene, pickCamera);
  }

  function setVisible(v: boolean) {
    if (v === running) return;
    running = v;
    if (v) animatePick();
    else cancelAnimationFrame(animId);
  }

  resizeCanvas();

  function dispose() {
    running = false;
    cancelAnimationFrame(animId);
    renderer.dispose();
  }

  return { resizeCanvas, dispose, setVisible };
}
