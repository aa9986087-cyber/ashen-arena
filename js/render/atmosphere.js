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

/* ---- floating motes around the player: soft round specks of light (dust, pollen, snow, ash, embers).
   Drawn as points with a radial-gradient sprite, kept dim enough not to trigger bloom, and faded out
   near the ground and the top of their band so they read as air, not as objects lying in the grass. */
const MOTES = 90,
  MOTE_LO = 1.4,
  MOTE_HI = 11;
const moteTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'),
    g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const motePos = new Float32Array(MOTES * 3),
  moteRGB = new Float32Array(MOTES * 3),
  moteGeo = new THREE.BufferGeometry();
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
moteGeo.setAttribute('color', new THREE.BufferAttribute(moteRGB, 3));
const motePoints = new THREE.Points(
  moteGeo,
  new THREE.PointsMaterial({
    size: 1.15,
    map: moteTex,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
);
motePoints.frustumCulled = false;
scene.add(motePoints);
const motes = [];
for (let i = 0; i < MOTES; i++)
  motes.push({
    x: rand(-30, 30),
    y: rand(MOTE_LO, MOTE_HI),
    z: rand(-30, 30),
    v: rand(0.5, 1.3),
    ph: Math.random() * TAU,
  });
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
  const t = now * 0.001,
    band = MOTE_HI - MOTE_LO;
  // stay under the bloom threshold: the brightest channel tops out around 0.8
  const peak = Math.max(moteCol[0], moteCol[1], moteCol[2], 0.01),
    k0 = 0.8 / peak;
  motes.forEach((m, i) => {
    m.y += moteRise * dt * m.v;
    m.x += (Math.sin(t * 0.6 + m.ph) * 0.35 + moteDrift) * dt;
    m.z += Math.cos(t * 0.45 + m.ph) * 0.3 * dt;
    if (m.y > MOTE_HI) m.y -= band;
    if (m.y < MOTE_LO) m.y += band;
    // wrap around the view centre so the field never runs out
    if (m.x - cx > 30) m.x -= 60;
    if (cx - m.x > 30) m.x += 60;
    if (m.z - cz > 30) m.z -= 60;
    if (cz - m.z > 30) m.z += 60;
    const edge = Math.min(1, (m.y - MOTE_LO) / 2, (MOTE_HI - m.y) / 2),
      tw = (0.55 + 0.45 * Math.sin(t * 1.6 + m.ph * 5)) * Math.max(0, edge) * k0;
    motePos[i * 3] = m.x;
    motePos[i * 3 + 1] = m.y;
    motePos[i * 3 + 2] = m.z;
    moteRGB[i * 3] = moteCol[0] * tw;
    moteRGB[i * 3 + 1] = moteCol[1] * tw;
    moteRGB[i * 3 + 2] = moteCol[2] * tw;
  });
  moteGeo.attributes.position.needsUpdate = true;
  moteGeo.attributes.color.needsUpdate = true;
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
