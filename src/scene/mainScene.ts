import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import gsap from 'gsap';
import { Route, SceneConfig, SceneController, TweakState } from '../types';

const MENU_ITEMS = [
  { id: 'arsenal',     label: 'ARSENAL'     },
  { id: 'information', label: 'INFORMATION' },
  { id: 'cart',        label: 'CART'        },
  { id: 'simulator',   label: 'SIMULATOR'   },
];

const BUTTON_BASE_THETAS = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];

const TWEAK_DEFAULTS: TweakState = {
  ringRadius: 2.6, ringThickness: 0.6, ringSpeed: 0.11, ringCount: 2400,
  cameraTilt: 2.9, starsCount: 12000,
  glitchIntensity: 0.75, scanlineStrength: 0.09,
  pushStrength: 1.35, pushRadius: 2.15, particleSize: 0.005,
};

interface AppState extends TweakState {
  route: Route;
  hoverIndex: number;
  ringTheta: number;
  glitch: number;
  frame: number;
}

const POSES: Record<Route, { pos: THREE.Vector3; look: THREE.Vector3; fov: number }> = {
  landing:     { pos: new THREE.Vector3(0, 2.9, 6.8),   look: new THREE.Vector3(0,0,0), fov: 48 },
  arsenal:     { pos: new THREE.Vector3(5.5, 1.8, 5.5), look: new THREE.Vector3(0,0,0), fov: 38 },
  information: { pos: new THREE.Vector3(0, 0.3, 11.5),  look: new THREE.Vector3(0,0,0), fov: 32 },
  cart:        { pos: new THREE.Vector3(-5.0, 2.2, 5.5),look: new THREE.Vector3(0,0,0), fov: 36 },
  simulator:   { pos: new THREE.Vector3(0, 8, 0.1),     look: new THREE.Vector3(0,0,0), fov: 42 },
};

const GlitchShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0 },
    uTime: { value: 0 },
    uScanline: { value: 0.09 },
    uAspect: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uIntensity, uTime, uScanline, uAspect;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      float inten = clamp(uIntensity, 0.0, 2.0);
      float bands = 36.0;
      float band = floor(uv.y * bands) / bands;
      float tear = (hash(vec2(band, floor(uTime*30.0))) - 0.5) * 0.10 * inten;
      if(hash(vec2(band*2.7, floor(uTime*6.0))) > 0.92) tear *= 3.0;
      uv.x += tear;
      float ca = 0.018 * inten;
      vec2 caOff = vec2(ca/uAspect, 0.0);
      float r = texture2D(tDiffuse, uv + caOff).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - caOff).b;
      vec3 col = vec3(r,g,b);
      col = mix(col, col + vec3(-0.05, 0.45, 0.05), inten * 0.12);
      float scan = 0.5 + 0.5 * sin(uv.y * 1400.0);
      col *= 1.0 - uScanline * (0.5 - 0.5 * scan);
      col *= 1.0 - 0.25 * inten * (0.5 - 0.5 * sin(uv.y * 600.0 + uTime*8.0));
      col += (hash(uv * vec2(800.0,1200.0) + uTime*60.0) - 0.5) * (0.04 + 0.18 * inten);
      gl_FragColor = vec4(col, 1.0);
    }
  `
};

function gauss(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function initMainScene(config: SceneConfig): SceneController {
  const { canvas, flashEl, domMenuEl, fpsEl, onRouteSwitched } = config;

  const state: AppState = {
    ...TWEAK_DEFAULTS,
    route: 'landing',
    hoverIndex: -1,
    ringTheta: 0,
    glitch: 0,
    frame: 0,
  };

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.018);
  const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(0, state.cameraTilt, 6.8);
  camera.lookAt(0, 0, 0);
  (camera as any).userData.lookAt = new THREE.Vector3(0, 0, 0);

  // Starfield
  let stars: THREE.Points | null = null;
  let starsBg: THREE.Points | null = null;
  function buildStarfield(count: number) {
    if (stars) { scene.remove(stars); stars.geometry.dispose(); (stars.material as THREE.Material).dispose(); }
    if (starsBg) { scene.remove(starsBg); starsBg.geometry.dispose(); (starsBg.material as THREE.Material).dispose(); }
    const mk = (n: number, radius: number, size: number, opacity: number) => {
      const geo = new THREE.BufferGeometry();
      const p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = Math.random(), v = Math.random();
        const θ = 2 * Math.PI * u, φ = Math.acos(2 * v - 1);
        const r = radius * (0.6 + 0.4 * Math.random());
        p[i*3] = r*Math.sin(φ)*Math.cos(θ); p[i*3+1] = r*Math.sin(φ)*Math.sin(θ); p[i*3+2] = r*Math.cos(φ);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const mat = new THREE.PointsMaterial({ color: 0xffffff, size, sizeAttenuation: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
      return new THREE.Points(geo, mat);
    };
    stars = mk(Math.round(count * 0.75), 60, 0.05, 0.9);
    starsBg = mk(Math.round(count * 0.25), 90, 0.035, 0.55);
    scene.add(stars); scene.add(starsBg);
  }
  buildStarfield(state.starsCount);

  // Cube
  const cubeGroup = new THREE.Group();
  scene.add(cubeGroup);
  (() => {
    const box = new THREE.BoxGeometry(0.95, 0.95, 0.95);
    const edges = new THREE.EdgesGeometry(box);
    const wire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    cubeGroup.add(wire);
  })();

  // Ring
  let ring: THREE.Points | null = null;
  let ringGeo: THREE.BufferGeometry | null = null;
  let ringMat: THREE.PointsMaterial | null = null;
  let ringPos: Float32Array, ringBaseTheta: Float32Array, ringBaseR: Float32Array, ringBaseY: Float32Array, ringColors: Float32Array, ringDisp: Float32Array;
  let ringCount = 0;

  function buildRing(count: number) {
    if (ring) { scene.remove(ring); ringGeo!.dispose(); ringMat!.dispose(); }
    ringCount = count;
    ringGeo = new THREE.BufferGeometry();
    ringPos       = new Float32Array(count * 3);
    ringColors    = new Float32Array(count * 3);
    ringBaseTheta = new Float32Array(count);
    ringBaseR     = new Float32Array(count);
    ringBaseY     = new Float32Array(count);
    ringDisp      = new Float32Array(count * 3);
    const R = state.ringRadius, T = state.ringThickness;
    const ySigma = T * 0.45;
    for (let i = 0; i < count; i++) {
      const θ = Math.random() * Math.PI * 2;
      const r = R + gauss() * T * 0.55;
      const y = gauss() * ySigma;
      ringBaseTheta[i] = θ; ringBaseR[i] = r; ringBaseY[i] = y;
      ringPos[i*3] = Math.cos(θ)*r; ringPos[i*3+1] = y; ringPos[i*3+2] = Math.sin(θ)*r;
      ringColors[i*3] = 1; ringColors[i*3+1] = 1; ringColors[i*3+2] = 1;
    }
    ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
    ringGeo.setAttribute('color',    new THREE.BufferAttribute(ringColors, 3));
    ringMat = new THREE.PointsMaterial({
      size: state.particleSize, sizeAttenuation: true,
      transparent: true, opacity: 0.95, depthWrite: false,
      vertexColors: true, blending: THREE.AdditiveBlending
    });
    ring = new THREE.Points(ringGeo, ringMat);
    scene.add(ring);
  }
  buildRing(state.ringCount);

  // Mini satellite rings
  interface MiniRing {
    points: THREE.Points;
    geometry: THREE.BufferGeometry;
    material: THREE.PointsMaterial;
    baseT: Float32Array;
    baseR: Float32Array;
    baseY: Float32Array;
    pos: Float32Array;
    theta: number;
    hoverEnergy: number;
  }
  const miniRings: MiniRing[] = [];
  const MINI_COUNT = 90, MINI_R = 0.42, MINI_T = 0.045;
  for (let i = 0; i < 4; i++) {
    const geo = new THREE.BufferGeometry();
    const pos   = new Float32Array(MINI_COUNT * 3);
    const baseT = new Float32Array(MINI_COUNT);
    const baseR = new Float32Array(MINI_COUNT);
    const baseY = new Float32Array(MINI_COUNT);
    for (let k = 0; k < MINI_COUNT; k++) {
      baseT[k] = Math.random() * Math.PI * 2;
      baseR[k] = MINI_R + gauss() * MINI_T * 0.7;
      baseY[k] = gauss() * MINI_T * 0.25;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x7dff8e, size: 0.04, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    miniRings.push({ points, geometry: geo, material: mat, baseT, baseR, baseY, pos, theta: 0, hoverEnergy: 0 });
  }

  // Postprocess
  const composer = new EffectComposer(renderer);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const glitchPass = new ShaderPass(GlitchShader);
  composer.addPass(glitchPass);
  composer.addPass(new OutputPass());

  // Landing menu labels
  const labelEls: HTMLElement[] = [];
  domMenuEl.innerHTML = '';
  MENU_ITEMS.forEach((it, i) => {
    const el = document.createElement('div');
    el.className = 'menu-label';
    el.textContent = it.label;
    el.addEventListener('mouseenter', () => { state.hoverIndex = i; });
    el.addEventListener('mouseleave', () => { if (state.hoverIndex === i) state.hoverIndex = -1; });
    el.addEventListener('click', () => goRoute(it.id as Route));
    domMenuEl.appendChild(el);
    labelEls.push(el);
  });

  const _v = new THREE.Vector3();
  function buttonWorld(i: number): THREE.Vector3 {
    const θ = BUTTON_BASE_THETAS[i] + state.ringTheta;
    return new THREE.Vector3(Math.cos(θ) * state.ringRadius, 0, Math.sin(θ) * state.ringRadius);
  }
  function projectToScreen(vec: THREE.Vector3): { x: number; y: number; visible: boolean } {
    _v.copy(vec).project(camera);
    return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, visible: _v.z < 1 && _v.z > -1 };
  }

  // goRoute — does glitch + camera, then notifies React
  function goRoute(route: Route) {
    if (route === state.route) return;
    const peak = state.glitchIntensity * 1.3;
    gsap.killTweensOf(state, 'glitch');
    gsap.fromTo(state, { glitch: 0 }, {
      glitch: peak, duration: 0.28, ease: 'power3.in',
      onUpdate: () => { glitchPass.uniforms.uIntensity.value = state.glitch; },
      onComplete: () => {
        flashEl.style.opacity = '0.45';
        setTimeout(() => { flashEl.style.opacity = '0'; }, 90);
        gsap.to(state, { glitch: 0, duration: 0.6, ease: 'power3.out',
          onUpdate: () => { glitchPass.uniforms.uIntensity.value = state.glitch; }
        });
      }
    });
    setTimeout(() => {
      state.route = route;
      const target = POSES[route];
      gsap.to(camera.position, { x: target.pos.x, y: target.pos.y, z: target.pos.z, duration: 1.0, ease: 'power3.inOut' });
      gsap.to(camera, { fov: target.fov, duration: 1.0, ease: 'power3.inOut', onUpdate: () => camera.updateProjectionMatrix() } as any);
      const look: THREE.Vector3 = (camera as any).userData.lookAt ?? new THREE.Vector3(0, 0, 0);
      (camera as any).userData.lookAt = look;
      gsap.to(look, { x: target.look.x, y: target.look.y, z: target.look.z, duration: 1.0, ease: 'power3.inOut', onUpdate: () => camera.lookAt(look) });
      onRouteSwitched(route);
    }, 260);
  }

  function triggerGlitch(peak?: number) {
    const p = peak ?? state.glitchIntensity * 0.6;
    gsap.killTweensOf(state, 'glitch');
    gsap.fromTo(state, { glitch: 0 }, {
      glitch: p, duration: 0.15, ease: 'power3.in',
      onUpdate: () => { glitchPass.uniforms.uIntensity.value = state.glitch; },
      onComplete: () => {
        gsap.to(state, { glitch: 0, duration: 0.4, ease: 'power3.out',
          onUpdate: () => { glitchPass.uniforms.uIntensity.value = state.glitch; }
        });
      }
    });
  }

  // Animation loop
  const clock = new THREE.Clock();
  let fpsSamples: number[] = [];
  let lastFpsT = 0;
  let animId: number;

  function animate() {
    animId = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    state.frame++;
    state.ringTheta += dt * state.ringSpeed;

    cubeGroup.rotation.y += dt * 0.18;
    cubeGroup.rotation.x += dt * 0.06;
    if (stars)   stars.rotation.y   += dt * 0.004;
    if (starsBg) starsBg.rotation.y += dt * 0.002;

    const onLanding = state.route === 'landing';
    let pushAnchor: THREE.Vector3 | null = null;
    if (onLanding && state.hoverIndex >= 0) {
      pushAnchor = buttonWorld(state.hoverIndex);
    }
    const PUSH_RADIUS_SQ = state.pushRadius * state.pushRadius;

    for (let i = 0; i < ringCount; i++) {
      const θ = ringBaseTheta[i] + state.ringTheta;
      const r = ringBaseR[i];
      const y = ringBaseY[i];
      const polarX = Math.cos(θ) * r;
      const polarZ = Math.sin(θ) * r;
      let tdx = 0, tdy = 0, tdz = 0;
      if (pushAnchor) {
        const dx = polarX - pushAnchor.x, dy = y - pushAnchor.y, dz = polarZ - pushAnchor.z;
        const dsq = dx*dx + dy*dy + dz*dz;
        if (dsq < PUSH_RADIUS_SQ && dsq > 0.0001) {
          const d = Math.sqrt(dsq);
          const tt = 1 - d / state.pushRadius;
          const f = tt * tt * state.pushStrength;
          const inv = 1 / d;
          tdx = dx*inv*f; tdy = dy*inv*f; tdz = dz*inv*f;
        }
      }
      const k = (tdx === 0 && tdy === 0 && tdz === 0) ? 0.10 : 0.22;
      ringDisp[i*3]   += (tdx - ringDisp[i*3])   * k;
      ringDisp[i*3+1] += (tdy - ringDisp[i*3+1]) * k;
      ringDisp[i*3+2] += (tdz - ringDisp[i*3+2]) * k;
      ringPos[i*3]   = polarX + ringDisp[i*3];
      ringPos[i*3+1] = y      + ringDisp[i*3+1];
      ringPos[i*3+2] = polarZ + ringDisp[i*3+2];
      const mag = Math.sqrt(ringDisp[i*3]*ringDisp[i*3] + ringDisp[i*3+1]*ringDisp[i*3+1] + ringDisp[i*3+2]*ringDisp[i*3+2]);
      const tint = Math.min(1, mag * 2.4);
      ringColors[i*3]   = 1.0 - 0.55 * tint;
      ringColors[i*3+1] = 1.0;
      ringColors[i*3+2] = 1.0 - 0.35 * tint;
    }
    ringGeo!.attributes.position.needsUpdate = true;
    ringGeo!.attributes.color.needsUpdate    = true;

    for (let i = 0; i < 4; i++) {
      const mr = miniRings[i];
      mr.points.visible = onLanding;
      if (!onLanding) continue;
      const c = buttonWorld(i);
      const target = state.hoverIndex === i ? 1 : 0;
      mr.hoverEnergy += (target - mr.hoverEnergy) * 0.12;
      const spin = (0.55 + 1.8 * mr.hoverEnergy) * dt;
      mr.theta += spin;
      const rScale = 1 + mr.hoverEnergy * 0.20;
      for (let k = 0; k < MINI_COUNT; k++) {
        const θ = mr.baseT[k] + mr.theta;
        const r = mr.baseR[k] * rScale;
        const y = mr.baseY[k];
        mr.pos[k*3]   = c.x + Math.cos(θ) * r;
        mr.pos[k*3+1] = c.y + y;
        mr.pos[k*3+2] = c.z + Math.sin(θ) * r;
      }
      mr.geometry.attributes.position.needsUpdate = true;
      mr.material.size    = 0.04 + 0.03 * mr.hoverEnergy;
      mr.material.opacity = 0.85 + 0.15 * mr.hoverEnergy;
    }

    if (onLanding) {
      for (let i = 0; i < MENU_ITEMS.length; i++) {
        const w = buttonWorld(i);
        const s = projectToScreen(w);
        const el = labelEls[i];
        el.style.left = s.x + 'px';
        el.style.top  = s.y + 'px';
        const dz = camera.position.distanceTo(w);
        const opacity = s.visible ? Math.max(0.5, 1.0 - (dz - 5) * 0.10) : 0;
        el.style.opacity = opacity.toFixed(2);
      }
    }

    cubeGroup.visible = state.route !== 'simulator';
    ring!.visible     = state.route !== 'simulator';

    glitchPass.uniforms.uTime.value    = t;
    glitchPass.uniforms.uScanline.value = state.scanlineStrength;
    composer.render();

    fpsSamples.push(dt);
    if (fpsSamples.length > 30) fpsSamples.shift();
    if (t - lastFpsT > 0.4) {
      const avg = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
      fpsEl.textContent = (1 / avg).toFixed(0).padStart(2, '0');
      lastFpsT = t;
    }
  }
  animate();

  // Resize
  function onResize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    glitchPass.uniforms.uAspect.value = w / h;
  }
  window.addEventListener('resize', onResize);

  // Keyboard shortcuts
  function onKeydown(e: KeyboardEvent) {
    if (e.target && ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA')) return;
    if (e.key === 'Escape' && state.route !== 'landing') goRoute('landing');
  }
  window.addEventListener('keydown', onKeydown);

  function updateTweaks(tweaks: Partial<TweakState>) {
    const rebuildRing = tweaks.ringRadius !== undefined || tweaks.ringThickness !== undefined || tweaks.ringCount !== undefined;
    const rebuildStars = tweaks.starsCount !== undefined;
    Object.assign(state, tweaks);
    if (rebuildRing)  buildRing(Math.round(state.ringCount));
    if (rebuildStars) buildStarfield(Math.round(state.starsCount));
    if (tweaks.particleSize !== undefined && ringMat) ringMat.size = tweaks.particleSize;
    if (tweaks.cameraTilt !== undefined && state.route === 'landing') {
      camera.position.y = tweaks.cameraTilt;
      camera.lookAt(0, 0, 0);
    }
    POSES.landing.pos.y = state.cameraTilt;
  }

  function dispose() {
    cancelAnimationFrame(animId);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeydown);
    renderer.dispose();
    composer.dispose();
    domMenuEl.innerHTML = '';
  }

  return { goRoute, triggerGlitch, updateTweaks, dispose };
}
