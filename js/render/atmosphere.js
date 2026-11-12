'use strict';
/* Atmosphere: sky dome, grass tufts, and the bloom pass on high quality. */

/* ---- sky dome: vertical gradient from the stage's fog colour (horizon) to its sky colour (top) */
const skyMat = new THREE.ShaderMaterial({
  uniforms: { top: { value: new THREE.Color(0x0b1a14) }, bottom: { value: new THREE.Color(0x16261c) } },
  vertexShader:
    'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader:
    'uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.6, h)), 1.0); }',
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

/** Called by setStage(): retint the world for the stage. */
function setAtmosphere(st) {
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
  ITuft.mesh.count = ITuft.max;
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
  } catch (e) {
    composer = null;
  }
}
/** Size the bloom buffers with the canvas (called from resize). */
function resizeBloom() {
  if (!composer) return;
  composer.setPixelRatio(Math.min(DPR, 1.5));
  composer.setSize(W, H);
}
/** Draw the 3D scene, with bloom when it is on. */
function drawScene() {
  if (composer && S.set.qual) composer.render();
  else renderer.render(scene, camera);
}
