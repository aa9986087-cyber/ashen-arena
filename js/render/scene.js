'use strict';
/* three.js renderer, scene, lights, shared primitives and instanced-mesh helpers. */
const glC = $('gl'),
  fxC = $('fx'),
  fx = fxC.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas: glC, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x16261c, 34, 78);
scene.background = new THREE.Color(0x16261c);
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 220);
const hemi = new THREE.HemisphereLight(0xffffff, 0x30343c, 0.62);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 0.95);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0015;
scene.add(sun);
scene.add(sun.target);
const glow = new THREE.PointLight(0xffc040, 0, 16);
scene.add(glow);
const BOX = new THREE.BoxGeometry(1, 1, 1),
  SPH = new THREE.SphereGeometry(0.5, 10, 8),
  CONE = new THREE.ConeGeometry(0.5, 1, 8),
  CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const V = new THREE.Vector3(),
  D = new THREE.Object3D(),
  C = new THREE.Color();
let W = 1,
  H = 1,
  DPR = 1;
function white(g) {
  const n = g.attributes.position.count,
    a = new Float32Array(n * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const lamV = new THREE.MeshLambertMaterial({ vertexColors: true });
const basV = new THREE.MeshBasicMaterial({ vertexColors: true });
function inst(geo, mat, max, shadow) {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.frustumCulled = false;
  m.castShadow = !!shadow;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const c = new THREE.Color(1, 1, 1);
  for (let i = 0; i < max; i++) m.setColorAt(i, c);
  m.count = 0;
  scene.add(m);
  return { mesh: m, n: 0, max };
}
/** Colour multiplier applied by put() (e.g. the blue of time slow on enemies); reset it after use. */
const TINT = [1, 1, 1];
function put(I, x, y, z, ry, sx, sy, sz, r, g, b, rx, rz) {
  if (I.n >= I.max) return;
  D.position.set(x, y, z);
  D.rotation.set(rx || 0, ry, rz || 0);
  D.scale.set(sx, sy, sz);
  D.updateMatrix();
  I.mesh.setMatrixAt(I.n, D.matrix);
  C.setRGB(r * TINT[0], g * TINT[1], b * TINT[2]);
  I.mesh.setColorAt(I.n, C);
  I.n++;
}
function flush(I) {
  I.mesh.count = I.n;
  I.mesh.instanceMatrix.needsUpdate = true;
  if (I.mesh.instanceColor) I.mesh.instanceColor.needsUpdate = true;
  I.n = 0;
}
