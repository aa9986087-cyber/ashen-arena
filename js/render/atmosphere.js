'use strict';
/* Atmosphere: sky dome, grass tufts, floating motes (ash, embers, snow…), and the bloom pass on high quality. */

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

/* ---- floating motes around the player (additive, so they glow and bloom) */
const MOTES = 150;
const IMote = inst(
  white(new THREE.SphereGeometry(0.5, 6, 4)),
  new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
  MOTES
);
const motes = [];
for (let i = 0; i < MOTES; i++)
  motes.push({ x: rand(-30, 30), y: rand(0, 12), z: rand(-30, 30), s: rand(0.05, 0.16), ph: Math.random() * TAU });
let moteCol = [1, 1, 1],
  moteRise = 0.3,
  moteDrift = 0;

/** Called by setStage(): retint the world for the stage. */
function setAtmosphere(st) {
  skyMat.uniforms.bottom.value.setHex(st.fog);
  skyMat.uniforms.top.value.setHex(st.sky || st.fog);
  moteCol = st.mote || [1, 1, 1];
  moteRise = st.rise == null ? 0.3 : st.rise;
  moteDrift = st.drift || 0;
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

/** Per frame: keep the sky around the camera and move the motes in a box that follows the view centre. */
function updateAtmosphere(dt, now, cx, cz) {
  sky.position.copy(camera.position);
  const t = now * 0.001;
  for (const m of motes) {
    m.y += moteRise * dt * (0.6 + m.s * 4);
    m.x += (Math.sin(t * 0.7 + m.ph) * 0.4 + moteDrift) * dt;
    m.z += Math.cos(t * 0.5 + m.ph) * 0.3 * dt;
    if (m.y > 12) m.y = 0;
    if (m.y < 0) m.y = 12;
    // wrap around the view centre so the field never runs out
    if (m.x - cx > 30) m.x -= 60;
    if (cx - m.x > 30) m.x += 60;
    if (m.z - cz > 30) m.z -= 60;
    if (cz - m.z > 30) m.z += 60;
    const tw = 0.6 + 0.4 * Math.sin(t * 3 + m.ph * 5);
    put(IMote, m.x, m.y, m.z, 0, m.s, m.s, m.s, moteCol[0] * tw, moteCol[1] * tw, moteCol[2] * tw);
  }
  flush(IMote);
}

/* ---- bloom (high quality only): bright things — spells, fire, gems, motes — get a soft glow */
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
