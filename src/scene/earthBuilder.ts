import * as THREE from 'three';

export interface EarthGroup extends THREE.Group {
  sphere: THREE.Mesh;
  worldToLocal(v: THREE.Vector3): THREE.Vector3;
}

const EARTH_TEX = {
  day:    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_atmos_2048.jpg',
  lights: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_lights_2048.png',
};

const TEX_LOADER = new THREE.TextureLoader();
TEX_LOADER.setCrossOrigin('anonymous');
const _texCache: Record<string, THREE.Texture> = {};

function loadTex(key: keyof typeof EARTH_TEX): THREE.Texture {
  if (_texCache[key]) return _texCache[key];
  const t = TEX_LOADER.load(EARTH_TEX[key]);
  t.colorSpace = THREE.SRGBColorSpace;
  _texCache[key] = t;
  return t;
}

export function addEarthLights(scene: THREE.Scene): void {
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(5, 2.5, 4);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.32));
  const rim = new THREE.DirectionalLight(0x7dff8e, 0.5);
  rim.position.set(-4, 2, -3);
  scene.add(rim);
}

export function buildEarth(radius: number): EarthGroup {
  const group = new THREE.Group() as EarthGroup;

  const sphereGeo = new THREE.SphereGeometry(radius, 96, 96);
  const sphereMat = new THREE.MeshBasicMaterial({ map: loadTex('day') });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  group.add(sphere);
  group.sphere = sphere;

  const lightsMat = new THREE.MeshBasicMaterial({
    map: loadTex('lights'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.55,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.001, 96, 96), lightsMat));

  const ico = new THREE.IcosahedronGeometry(radius * 1.003, 3);
  const wire = new THREE.WireframeGeometry(ico);
  const wireMat = new THREE.LineBasicMaterial({ color: 0x7dff8e, transparent: true, opacity: 0.10, depthWrite: false });
  group.add(new THREE.LineSegments(wire, wireMat));

  const atmGeo = new THREE.SphereGeometry(radius * 1.045, 64, 64);
  const atmMat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0x4a8fff) } },
    vertexShader: `varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN;
      void main(){ float i = pow(0.72 - dot(vN, vec3(0.0,0.0,1.0)), 2.2); gl_FragColor = vec4(uColor * i, i); }`
  });
  group.add(new THREE.Mesh(atmGeo, atmMat));

  for (let i = -60; i <= 60; i += 30) {
    const lat = i * Math.PI / 180;
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j <= 96; j++) {
      const lon = (j / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(
        Math.cos(lat) * Math.cos(lon) * radius * 1.004,
        Math.sin(lat) * radius * 1.004,
        -Math.cos(lat) * Math.sin(lon) * radius * 1.004
      ));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color: 0x7dff8e, transparent: true, opacity: i === 0 ? 0.32 : 0.10, depthWrite: false });
    group.add(new THREE.Line(g, m));
  }
  for (let i = 0; i < 12; i++) {
    const lon = (i / 12) * Math.PI * 2;
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j <= 96; j++) {
      const lat = (j / 96) * Math.PI - Math.PI / 2;
      pts.push(new THREE.Vector3(
        Math.cos(lat) * Math.cos(lon) * radius * 1.004,
        Math.sin(lat) * radius * 1.004,
        -Math.cos(lat) * Math.sin(lon) * radius * 1.004
      ));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color: 0x7dff8e, transparent: true, opacity: 0.10, depthWrite: false });
    group.add(new THREE.Line(g, m));
  }

  // Real (lat, lon) → position. The -sin(lon) on Z aligns these dots with the
  // equirectangular earth texture (Greenwich at the seam centre, east = +lon).
  const CITIES: [number, number][] = [
    [40.7,-74.0],[51.5,-0.1],[35.7,139.7],[55.7,37.6],[39.9,116.4],[28.6,77.2],
    [-23.5,-46.6],[1.3,103.8],[-33.9,18.4],[48.8,2.3],[19.4,-99.1],[-34.6,-58.4],
    [25.2,55.3],[37.6,127.0],[31.2,121.5],[-37.8,144.9],[59.9,30.3],[33.7,-118.1],
    [41.0,28.9],[24.8,67.0],[14.6,121.0]
  ];
  const cityGeo = new THREE.BufferGeometry();
  const cityPos = new Float32Array(CITIES.length * 3);
  CITIES.forEach((c, idx) => {
    const lat = c[0] * Math.PI / 180, lon = c[1] * Math.PI / 180;
    cityPos[idx * 3]     =  Math.cos(lat) * Math.cos(lon) * radius * 1.012;
    cityPos[idx * 3 + 1] =  Math.sin(lat) * radius * 1.012;
    cityPos[idx * 3 + 2] = -Math.cos(lat) * Math.sin(lon) * radius * 1.012;
  });
  cityGeo.setAttribute('position', new THREE.BufferAttribute(cityPos, 3));
  const cityMat = new THREE.PointsMaterial({ color: 0x7dff8e, size: 0.035, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  group.add(new THREE.Points(cityGeo, cityMat));

  return group;
}

export function buildTrajectory(from: THREE.Vector3, to: THREE.Vector3): THREE.Line {
  const pts: THREE.Vector3[] = [];
  const N = 40;
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const up = mid.clone().normalize().multiplyScalar(0.8);
  mid.add(up);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(new THREE.Vector3(
      (1-t)*(1-t)*from.x + 2*(1-t)*t*mid.x + t*t*to.x,
      (1-t)*(1-t)*from.y + 2*(1-t)*t*mid.y + t*t*to.y,
      (1-t)*(1-t)*from.z + 2*(1-t)*t*mid.z + t*t*to.z,
    ));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = new THREE.LineBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.85 });
  const line = new THREE.Line(g, m);
  let progress = 0;
  function step() {
    progress = (progress + 0.012) % 1.05;
    g.setDrawRange(0, Math.floor(progress * (N + 1)));
    if (line.parent) requestAnimationFrame(step);
  }
  step();
  return line;
}
