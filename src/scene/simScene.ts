import * as THREE from 'three';
import gsap from 'gsap';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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

interface Palette { core: number; mid: number; glow: number; scorch: number; glowCss: string; }
const EXPLOSION: Palette = { core: 0xfff2d0, mid: 0xff7a1a, glow: 0xdc2626, scorch: 0x140a06, glowCss: 'rgba(220,38,38,0.55)' };
const LASER:     Palette = { core: 0xe6fff0, mid: 0x7dff8e, glow: 0x7dff8e, scorch: 0x07300f, glowCss: 'rgba(125,255,142,0.5)' };

const R_SURFACE = 1.4;   // earth radius
const R_ABOVE   = 1.405; // decals, just above the surface
const STATION_R = 3.0;   // orbital platform distance from centre

export function initSimScene(config: SimConfig): SimController {
  const { stageEl, getSelectedWeapon, onAnalyticsUpdate, onTargetCoords, onLog, triggerGlitch } = config;

  const canvasEl = document.createElement('canvas');
  canvasEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  stageEl.prepend(canvasEl);

  // 2D impact flash overlay (colour set per shot).
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

  const earth: EarthGroup = buildEarth(R_SURFACE);
  simScene.add(earth);
  addEarthLights(simScene);

  // Optional downloaded orbital-platform model. Drop any GLB at
  // public/models/station.glb and it replaces the built-in station. We verify
  // it is really a GLB first (dev servers answer missing files with index.html),
  // so the procedural fallback stays quiet when no model is present.
  let stationModel: THREE.Object3D | null = null;
  if (typeof fetch === 'function') {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    fetch(`${base}models/station.glb`)
      .then(r => {
        const ct = r.headers.get('content-type') || '';
        if (!r.ok || ct.includes('text/html')) throw new Error('no model');
        return r.arrayBuffer();
      })
      .then(buf => {
        if (new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== 'glTF') throw new Error('not glb');
        new GLTFLoader().parse(buf, '', g => { stationModel = g.scene; }, () => { /* parse failed */ });
      })
      .catch(() => { /* no/invalid model — the procedural station is used */ });
  }

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
  let cinematic = false;                       // blocks input + auto-spin during the laser sequence
  const camLook = new THREE.Vector3(0, 0, 0);  // camera aim, animated for cinematics

  const analytics: SimAnalytics = { casualties: 0, radius: 0, cost: 0, halflife: 0, sparkHistory: [] };

  // Persistent marks (craters + scorch decals) so the sandbox can be purged.
  const marks: THREE.Object3D[] = [];
  const MARK_CAP = 90;
  const CAM_HOME = new THREE.Vector3(0, 0, 4.6);

  // ---- small utilities ----------------------------------------------------

  function disposeObj(obj: THREE.Object3D) {
    obj.traverse(o => {
      const g = (o as unknown as { geometry?: THREE.BufferGeometry }).geometry;
      if (g) g.dispose();
      const m = (o as unknown as { material?: THREE.Material | THREE.Material[] }).material;
      if (Array.isArray(m)) m.forEach(x => x.dispose());
      else if (m) m.dispose();
    });
  }

  function trackMark(obj: THREE.Object3D) {
    earth.add(obj);
    marks.push(obj);
    if (marks.length > MARK_CAP) {
      const old = marks.shift()!;
      earth.remove(old);
      disposeObj(old);
    }
  }

  function jitterDir(v: THREE.Vector3, amt: number): THREE.Vector3 {
    const t = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5);
    return v.clone().add(t.multiplyScalar(amt)).normalize();
  }

  function flashStage(css: string, intensity: number) {
    flashEl.style.background = `radial-gradient(ellipse at center, ${css} 0%, transparent 70%)`;
    gsap.killTweensOf(flashEl);
    gsap.fromTo(flashEl,
      { opacity: Math.min(0.85, 0.3 + intensity * 0.6) },
      { opacity: 0, duration: 0.5 + intensity * 0.4, ease: 'power2.out' }
    );
  }

  function shakeCamera(intensity: number) {
    if (cinematic) return;
    const amp = 0.04 + intensity * 0.16;
    gsap.killTweensOf(simCamera.position);
    const tl = gsap.timeline({ onComplete: () => simCamera.position.copy(CAM_HOME) });
    for (let i = 0; i < 5; i++) {
      tl.to(simCamera.position, {
        x: CAM_HOME.x + (Math.random() - 0.5) * amp,
        y: CAM_HOME.y + (Math.random() - 0.5) * amp,
        duration: 0.05, ease: 'power1.inOut',
      });
    }
    tl.to(simCamera.position, { x: CAM_HOME.x, y: CAM_HOME.y, duration: 0.08, ease: 'power2.out' });
  }

  // ---- visual effect primitives ------------------------------------------

  function sphereBurst(v: THREE.Vector3, color: number, from: number, to: number, fade: number, delay = 0) {
    const geo = new THREE.SphereGeometry(from, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(v).multiplyScalar(1.41);
    earth.add(m);
    gsap.to(m.scale, { x: to/from, y: to/from, z: to/from, duration: fade, ease: 'expo.out', delay });
    gsap.to(mat, { opacity: 0, duration: fade, ease: 'power2.out', delay, onComplete: () => { earth.remove(m); geo.dispose(); mat.dispose(); } });
  }

  function shockRing(v: THREE.Vector3, color: number, scaleTo: number, dur: number, delay = 0) {
    const geo = new THREE.RingGeometry(0.04, 0.085, 48);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(v).multiplyScalar(1.42);
    m.lookAt(0, 0, 0); m.rotateY(Math.PI);
    earth.add(m);
    gsap.to(m.scale, { x: scaleTo, y: scaleTo, z: 1, duration: dur, ease: 'power2.out', delay });
    gsap.to(mat, { opacity: 0, duration: dur, ease: 'power2.out', delay, onComplete: () => { earth.remove(m); geo.dispose(); mat.dispose(); } });
  }

  function debris(v: THREE.Vector3, color: number, count: number, spread: number) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random(), vv = Math.random();
      const θ = 2*Math.PI*u, φ = Math.acos(2*vv-1), rr = 0.02 + Math.random()*0.05;
      pos[i*3] = rr*Math.sin(φ)*Math.cos(θ); pos[i*3+1] = rr*Math.sin(φ)*Math.sin(θ); pos[i*3+2] = rr*Math.cos(φ);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.022, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    pts.position.copy(v).multiplyScalar(1.41);
    earth.add(pts);
    gsap.to(pts.scale, { x: spread, y: spread, z: spread, duration: 1.0, ease: 'expo.out' });
    gsap.to(mat, { opacity: 0, duration: 1.2, ease: 'power2.out', onComplete: () => { earth.remove(pts); geo.dispose(); mat.dispose(); } });
  }

  function smokePlume(v: THREE.Vector3, intensity: number) {
    const geo = new THREE.SphereGeometry(0.05, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0x2a2622, transparent: true, opacity: 0.55, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    earth.add(m);
    const grow = 5 + intensity * 9;
    const proxy = { r: 1.42 };
    gsap.to(m.scale, { x: grow, y: grow, z: grow, duration: 2.6, ease: 'power2.out' });
    gsap.to(proxy, { r: 1.42 + 0.32 + intensity * 0.18, duration: 2.6, ease: 'power1.out',
      onUpdate: () => m.position.copy(v).multiplyScalar(proxy.r) });
    gsap.to(mat, { opacity: 0, duration: 2.6, ease: 'power1.in', onComplete: () => { earth.remove(m); geo.dispose(); mat.dispose(); } });
  }

  // Persistent charred decal on the planet surface.
  function scorch(v: THREE.Vector3, size: number, pal: Palette) {
    const geo = new THREE.CircleGeometry(size, 24);
    const mat = new THREE.MeshBasicMaterial({ color: pal.scorch, transparent: true, opacity: 0.92, depthWrite: false });
    const disc = new THREE.Mesh(geo, mat);
    disc.position.copy(v).multiplyScalar(R_ABOVE);
    disc.lookAt(0, 0, 0);
    trackMark(disc);

    // brief glowing ember rim
    const rGeo = new THREE.RingGeometry(size * 0.7, size, 28);
    const rMat = new THREE.MeshBasicMaterial({ color: pal.mid, side: THREE.DoubleSide, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const rim = new THREE.Mesh(rGeo, rMat);
    rim.position.copy(v).multiplyScalar(R_ABOVE + 0.001);
    rim.lookAt(0, 0, 0);
    earth.add(rim);
    gsap.to(rMat, { opacity: 0, duration: 2.2, ease: 'power2.out', onComplete: () => { earth.remove(rim); rGeo.dispose(); rMat.dispose(); } });
  }

  // ---- the explosion + per-weapon detonations -----------------------------

  interface ExpOpts { big?: boolean; shake?: boolean; playSound?: boolean; smoke?: boolean; }

  function groundExplosion(v: THREE.Vector3, intensity: number, pal: Palette, opts: ExpOpts = {}) {
    const big = opts.big ?? false;
    const s = big ? 1.5 : 1;

    sphereBurst(v, pal.core, 0.05, (0.18 + intensity * 0.5) * s, 0.45);          // white-hot core
    sphereBurst(v, pal.mid,  0.05, (0.30 + intensity * 0.9) * s, 0.9);            // fireball
    sphereBurst(v, pal.glow, 0.05, (0.40 + intensity * 1.1) * s, 1.5);            // outer glow
    shockRing(v, pal.glow, 8 + intensity * 22, 1.8);
    if (big) shockRing(v, pal.glow, 12 + intensity * 26, 2.2, 0.12);
    debris(v, pal.mid, big ? 64 : 40, 4 + intensity * 9);
    scorch(v, 0.035 + intensity * 0.07 * s, pal);
    if (opts.smoke) smokePlume(v, intensity);

    // small persistent crater core
    const cGeo = new THREE.SphereGeometry(0.018, 8, 8);
    const cMat = new THREE.MeshBasicMaterial({ color: pal.scorch });
    const crater = new THREE.Mesh(cGeo, cMat);
    crater.position.copy(v).multiplyScalar(1.41);
    trackMark(crater);

    flashStage(pal.glowCss, intensity * (big ? 1.2 : 1));
    if (opts.shake ?? true) shakeCamera(intensity * (big ? 1.3 : 1));
    if (opts.playSound ?? true) sound.play('impact', 0.4 + intensity * 1.2);
  }

  // Incoming kinetic strike: a glowing round arcs down from orbit, then detonates.
  function projectile(v: THREE.Vector3, color: number, dur: number, onArrive: () => void) {
    const geo = new THREE.SphereGeometry(0.03, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const p = new THREE.Mesh(geo, mat);
    earth.add(p);

    const trailGeo = new THREE.BufferGeometry().setFromPoints([v.clone().multiplyScalar(4.6), v.clone().multiplyScalar(4.6)]);
    const trailMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
    const trail = new THREE.Line(trailGeo, trailMat);
    earth.add(trail);

    const state = { r: 4.6 };
    gsap.to(state, { r: 1.42, duration: dur, ease: 'power2.in',
      onUpdate: () => {
        p.position.copy(v).multiplyScalar(state.r);
        const arr = trailGeo.attributes.position.array as Float32Array;
        const head = v.clone().multiplyScalar(state.r);
        const tail = v.clone().multiplyScalar(Math.min(4.6, state.r + 0.7));
        arr[0]=tail.x; arr[1]=tail.y; arr[2]=tail.z; arr[3]=head.x; arr[4]=head.y; arr[5]=head.z;
        trailGeo.attributes.position.needsUpdate = true;
      },
      onComplete: () => {
        earth.remove(p); geo.dispose(); mat.dispose();
        gsap.to(trailMat, { opacity: 0, duration: 0.3, onComplete: () => { earth.remove(trail); trailGeo.dispose(); trailMat.dispose(); } });
        onArrive();
      },
    });
  }

  // Orbital platform — a downloaded GLB if present, else a built model.
  function buildStation(): { group: THREE.Group; lens: THREE.Mesh; ring: THREE.Mesh | null; fromModel: boolean } {
    const group = new THREE.Group();
    let ring: THREE.Mesh | null = null;
    const fromModel = !!stationModel;

    if (stationModel) {
      const m = stationModel.clone(true);
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3()).length() || 1;
      m.scale.setScalar(0.6 / size);                 // normalise to a consistent size
      box.setFromObject(m);
      m.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(1)); // recentre
      group.add(m);
    } else {
      // central hull
      const hull = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.28, 16),
        new THREE.MeshStandardMaterial({ color: 0x3a423c, metalness: 0.85, roughness: 0.35 }),
      );
      hull.rotation.x = Math.PI / 2;                  // align hull axis with +Z (toward planet)
      group.add(hull);
      // bow cap
      const nose = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.1, 16),
        new THREE.MeshStandardMaterial({ color: 0x4a534c, metalness: 0.8, roughness: 0.4 }),
      );
      nose.rotation.x = -Math.PI / 2; nose.position.z = 0.19;
      group.add(nose);
      // rotating collar
      ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.13, 0.02, 10, 28),
        new THREE.MeshBasicMaterial({ color: 0x7dff8e }),
      );
      group.add(ring);
      // truss + twin solar arrays
      const truss = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.012, 0.012),
        new THREE.MeshStandardMaterial({ color: 0x6a6a6a, metalness: 0.7, roughness: 0.5 }),
      );
      group.add(truss);
      const panelMat = new THREE.MeshStandardMaterial({ color: 0x16324a, metalness: 0.4, roughness: 0.5, emissive: 0x0a1c30, emissiveIntensity: 0.6 });
      for (const sx of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.006), panelMat);
        panel.position.x = sx * 0.27;
        group.add(panel);
      }
      // comms dish
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xcfd6d0, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide }),
      );
      dish.rotation.x = Math.PI; dish.position.set(0, 0.12, -0.04);
      group.add(dish);
      // antenna + nav lights
      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, 0.18, 6),
        new THREE.MeshBasicMaterial({ color: 0x9aa39c }),
      );
      ant.position.set(0, -0.13, -0.02);
      group.add(ant);
      const navR = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshBasicMaterial({ color: 0xdc2626 }));
      navR.position.set(0.3, 0, 0); group.add(navR);
      const navG = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshBasicMaterial({ color: 0x7dff8e }));
      navG.position.set(-0.3, 0, 0); group.add(navG);
    }

    // universal muzzle lens (charges before firing); faces planet after lookAt
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xe6fff0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
    );
    lens.position.set(0, 0, 0.17);
    lens.scale.setScalar(0.4);
    group.add(lens);

    return { group, lens, ring, fromModel };
  }

  // Orbital laser: zoom to a platform above the target that fires a beam column.
  function orbitalLaser(v: THREE.Vector3, intensity: number) {
    cinematic = true;
    rotation.x = earth.rotation.x;   // freeze the auto-spin where it is
    rotation.y = earth.rotation.y;

    // --- platform (parented to earth so it tracks the surface) ---
    const { group: station, lens, ring, fromModel } = buildStation();
    station.position.copy(v).multiplyScalar(STATION_R);
    station.lookAt(0, 0, 0);
    earth.add(station);

    // --- beam column (cylinder along v from platform to surface) ---
    const beamLen = STATION_R - 1.42;
    const beamGeo = new THREE.CylinderGeometry(0.02, 0.05, beamLen, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x7dff8e, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    const glowGeo = new THREE.CylinderGeometry(0.07, 0.12, beamLen, 16, 1, true);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x7dff8e, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const beamGlow = new THREE.Mesh(glowGeo, glowMat);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone());
    beam.quaternion.copy(q); beamGlow.quaternion.copy(q);
    beam.position.copy(v).multiplyScalar((STATION_R + 1.42) / 2);
    beamGlow.position.copy(beam.position);
    beam.scale.y = 0.02; beamGlow.scale.y = 0.02;
    earth.add(beam); earth.add(beamGlow);

    // --- camera framing of the action ---
    earth.updateWorldMatrix(true, false);
    const surfaceWorld = earth.localToWorld(v.clone().multiplyScalar(1.42));
    const stationWorld = earth.localToWorld(v.clone().multiplyScalar(STATION_R));
    const midWorld = surfaceWorld.clone().lerp(stationWorld, 0.5);
    const viewDir = simCamera.position.clone().sub(midWorld).normalize();
    const camTarget = midWorld.clone().add(viewDir.multiplyScalar(2.5));

    const cleanup = () => {
      earth.remove(station);
      // a cloned GLB shares geometry/materials with the cached template — only
      // dispose the procedurally-built station's own resources.
      if (!fromModel) disposeObj(station);
      else { const l = lens; l.geometry.dispose(); (l.material as THREE.Material).dispose(); }
      earth.remove(beam); disposeObj(beam);
      earth.remove(beamGlow); disposeObj(beamGlow);
      cinematic = false;
    };

    gsap.killTweensOf(simCamera.position);
    gsap.killTweensOf(camLook);
    const tl = gsap.timeline({ onComplete: cleanup });

    // 1) zoom + aim
    tl.to(simCamera.position, { x: camTarget.x, y: camTarget.y, z: camTarget.z, duration: 0.7, ease: 'power3.inOut' }, 0);
    tl.to(camLook, { x: midWorld.x, y: midWorld.y, z: midWorld.z, duration: 0.7, ease: 'power3.inOut' }, 0);
    // 2) charge the lens
    tl.to(lens.scale, { x: 1.6, y: 1.6, z: 1.6, duration: 0.4, ease: 'power2.in' }, 0.7);
    if (ring) tl.to(ring.rotation, { z: Math.PI * 2, duration: 0.5, ease: 'power1.in' }, 0.7);
    // 3) FIRE
    tl.add(() => {
      sound.play('laser', 0.6 + intensity * 0.6);
      gsap.to([beamMat, glowMat], { opacity: 1, duration: 0.08, ease: 'power2.out' });
      gsap.to([beam.scale, beamGlow.scale], { y: 1, duration: 0.12, ease: 'back.out(2)' });
      // groundExplosion handles the surface flash + scorch + shockwave
      groundExplosion(v, intensity, LASER, { shake: false, playSound: false, big: intensity > 0.7 });
    }, 1.15);
    // 4) sustain flicker then cut the beam
    tl.to([beamMat], { opacity: 0.6, duration: 0.08, yoyo: true, repeat: 5 }, 1.25);
    tl.to([beamMat, glowMat], { opacity: 0, duration: 0.4, ease: 'power2.in' }, 1.95);
    // 5) pull back to the home shot
    tl.to(simCamera.position, { x: CAM_HOME.x, y: CAM_HOME.y, z: CAM_HOME.z, duration: 0.85, ease: 'power3.inOut' }, 2.2);
    tl.to(camLook, { x: 0, y: 0, z: 0, duration: 0.85, ease: 'power3.inOut' }, 2.2);
  }

  function detonate(v: THREE.Vector3, cat: string, intensity: number) {
    switch (cat) {
      case 'lasers':
        orbitalLaser(v, intensity);
        break;
      case 'nukes':
        groundExplosion(v, intensity, EXPLOSION, { big: true, smoke: true });
        break;
      case 'missiles':
        projectile(v, 0xffae6b, 0.55, () => groundExplosion(v, intensity, EXPLOSION, { big: intensity > 0.6, smoke: intensity > 0.6 }));
        break;
      case 'drones': {
        const n = 4;
        for (let k = 0; k < n; k++) {
          const jv = jitterDir(v, 0.12);
          setTimeout(() => projectile(jv, 0xff5a3c, 0.4,
            () => groundExplosion(jv, intensity * 0.55, EXPLOSION, { shake: k === 0, playSound: k === 0 })
          ), k * 130);
        }
        break;
      }
      default: // grenades + anything else: a compact blast
        groundExplosion(v, intensity, EXPLOSION, {});
    }
  }

  // ---- cleanup / reset ----------------------------------------------------

  function clearMarks() {
    marks.forEach(m => { earth.remove(m); disposeObj(m); });
    marks.length = 0;
  }

  function reset() {
    clearMarks();
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
    if (cinematic) return;
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

    detonate(v, w.cat, intensity);

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
    if (cinematic) return;
    isDragging = false;
    lastMouse = { x: e.clientX, y: e.clientY };
    canvasEl.setPointerCapture(e.pointerId);
  });
  canvasEl.addEventListener('pointermove', (e) => {
    if (!lastMouse || cinematic) return;
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
    if (!isDragging && !cinematic) rotation.y += 0.0015;
    simCamera.lookAt(camLook);
    renderer.render(simScene, simCamera);
  }
  animateSim();
  resizeCanvas();

  function dispose() {
    cancelAnimationFrame(animId);
    gsap.killTweensOf(simCamera.position);
    gsap.killTweensOf(camLook);
    clearMarks();
    renderer.dispose();
    if (canvasEl.parentElement) canvasEl.parentElement.removeChild(canvasEl);
    if (flashEl.parentElement) flashEl.parentElement.removeChild(flashEl);
  }

  return { dispose, resizeCanvas, reset };
}
