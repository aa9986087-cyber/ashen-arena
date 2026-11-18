'use strict';
/* Atmosphere: sky dome, grass tufts, and the bloom pass on high quality. */

/* ---- sky dome: vertical gradient from the stage's fog colour (horizon) to its sky colour (top) */
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    top: { value: new THREE.Color(0x0b1a14) },
    bottom: { value: new THREE.Color(0x16261c) },
    detail: { value: 0 },
  },
  vertexShader:
    'varying vec3 skyDir; void main(){ skyDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform vec3 top;
    uniform vec3 bottom;
    uniform float detail;
    varying vec3 skyDir;
    void main() {
      vec3 dir = normalize(skyDir);
      vec3 col = mix(bottom, top, smoothstep(-0.05, 0.6, dir.y));
      float horizon = 1.0 - smoothstep(0.0, 0.62, abs(dir.y));
      float glow = smoothstep(0.1, 1.0, dot(dir, normalize(vec3(-0.7, 0.22, -1.0))));
      col += (bottom * 0.25 + vec3(0.07, 0.035, 0.014)) * horizon * glow * detail;
      gl_FragColor = vec4(col, 1.0);
    }`,
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(190, 24, 12), skyMat);
sky.renderOrder = -1;
scene.add(sky);

/* ---- grass tufts: hundreds of tiny blades, tinted per stage */
GEO.tuft = merge([
  part(CONE, 0xffffff, 0, 0.22, 0, 0.09, 0.45, 0.09, 0.2, 0, 0.15),
  part(CONE, 0xe8e8e8, 0.12, 0.18, 0.05, 0.08, 0.36, 0.08, -0.15, 0, -0.35),
  part(CONE, 0xf4f4f4, -0.1, 0.17, -0.06, 0.08, 0.34, 0.08, 0.1, 0, 0.4),
]);
const ITuft = inst(GEO.tuft, lamV, 700, false);
ITuft.mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
let atmosphereStage;

function lightStage(quality) {
  if (!atmosphereStage) return;
  sun.intensity = (atmosphereStage.abyss ? 0.88 : 0.95) + quality.sky * 0.39;
  hemi.intensity = 0.51 + quality.sky * 0.13;
}

function applyGraphics() {
  const level = graphicsLevel(), quality = GRAPHICS[level];
  sun.castShadow = !!S.set.shadow;
  const shadowSize = Math.min(quality.shadows, renderer.capabilities.maxTextureSize);
  if (sun.shadow.mapSize.x !== shadowSize) {
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
  }
  const anisotropy = Math.min(quality.anisotropy, renderer.capabilities.getMaxAnisotropy() || 1);
  for (const texture of [gtex, arenaSurfaceTexture]) {
    if (texture.anisotropy === anisotropy) continue;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
  }
  const floorMap = level ? arenaSurfaceTexture : null;
  if (arenaFloorMaterial.map !== floorMap) {
    arenaFloorMaterial.map = floorMap;
    arenaFloorMaterial.needsUpdate = true;
  }
  for (const [material, texture] of [[ground.material, gtex], [arenaFloorMaterial, arenaSurfaceTexture],
    [arenaPropMaterial, arenaSurfaceTexture]]) {
    const bumpMap = level === 2 ? texture : null;
    if (material.bumpMap === bumpMap) continue;
    material.bumpMap = bumpMap;
    material.needsUpdate = true;
  }
  for (const { mesh } of decor) {
    if (mesh.name === 'arena-contact-shadows') mesh.visible = !!level;
    if (mesh.name.startsWith('arena-map-')) mesh.material = level ? arenaPropMaterial : lamV;
  }
  ITuft.mesh.count = quality.tufts;
  skyMat.uniforms.detail.value = quality.sky;
  if (bloom) bloom.strength = quality.bloom;
  lightStage(quality);
}

/** Called by setStage(): retint the world for the stage. */
function setAtmosphere(st) {
  atmosphereStage = st;
  const quality = GRAPHICS[graphicsLevel()];
  lightStage(quality);
  skyMat.uniforms.bottom.value.setHex(st.fog);
  skyMat.uniforms.top.value.setHex(st.sky || st.fog);
  const c = new THREE.Color(st.tuft || st.ground);
  for (let i = 0; i < ITuft.max; i++) {
    const a = Math.random() * TAU,
      r = Math.sqrt(Math.random()) * (ARENA + 20),
      s = rand(0.7, 1.5),
      k = rand(0.75, 1.15);
    put(
      ITuft,
      Math.cos(a) * r,
      0,
      Math.sin(a) * r,
      Math.random() * TAU,
      s,
      s * rand(0.8, 1.4),
      s,
      c.r * k,
      c.g * k,
      c.b * k
    );
  }
  flush(ITuft);
  ITuft.mesh.count = quality.tufts;
}

/** Per frame: keep the sky dome around the camera. */
function updateAtmosphere() {
  sky.position.copy(camera.position);
}

/* ---- bloom (high quality only): bright things — spells, fire, gems — get a soft glow */
let composer = null,
  bloom = null;
function setupBloom() {
  if (!THREE.EffectComposer || !THREE.UnrealBloomPass) return;
  try {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.5, 0.93);
    composer.addPass(bloom);
  } catch {
    composer = null;
  }
}
/** Size the bloom buffers with the canvas (called from resize). */
function resizeBloom() {
  if (!composer) return;
  const level = graphicsLevel();
  composer.setPixelRatio(Math.min(DPR, level === 2 ? 1.8 : 1.35));
  composer.setSize(level ? W : 1, level ? H : 1);
}
/** Draw the 3D scene, with bloom when it is on. */
function drawScene() {
  if (composer && graphicsLevel()) composer.render();
  else renderer.render(scene, camera);
}
