'use strict';
/* Visual effects engine for the upgrade cards: soft glowing particles (additive), smoke (alpha), particles that swirl
   around a centre (tornadoes, black holes), continuous emitters, and 3D lightning bolts from storm clouds.
   Game code calls the vfx* helpers; render() calls vfxUpdate(dt) once per frame. */

/* ---- point sprites: soft round particles sized in world units */
const VFX_VS =
  'attribute float size; attribute vec4 rgba; varying vec4 vC; uniform float scale;' +
  'void main(){ vC = rgba; vec4 mv = modelViewMatrix * vec4(position, 1.0);' +
  ' gl_PointSize = min(size * scale / -mv.z, 512.0); gl_Position = projectionMatrix * mv; }';
const VFX_FS_GLOW =
  'varying vec4 vC; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard;' +
  ' float a = (1.0 - r); a = a * a * (0.6 + 0.4 * (1.0 - r)); gl_FragColor = vec4(vC.rgb * a * vC.a, vC.a * a); }';
const VFX_FS_SMOKE =
  'varying vec4 vC; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard;' +
  ' float a = smoothstep(1.0, 0.15, r); gl_FragColor = vec4(vC.rgb, vC.a * a); }';
/* ---- textured sprites: the Kenney Particle Pack (CC0) in one 4×4 atlas (assets/vfx/fx-atlas.png); each particle
   picks a tile and turns (tr = tile, rotation). White textures: the colour comes from the particle. */
const VFX_VS_T =
  'attribute float size; attribute vec4 rgba; attribute vec2 tr; varying vec4 vC; varying vec2 vT; uniform float scale;' +
  'void main(){ vC = rgba; vT = tr; vec4 mv = modelViewMatrix * vec4(position, 1.0);' +
  ' gl_PointSize = min(size * scale / -mv.z, 768.0); gl_Position = projectionMatrix * mv; }';
const VFX_TEX_UV =
  'uniform sampler2D map; varying vec4 vC; varying vec2 vT;' +
  'float texMask(){ vec2 p = gl_PointCoord - 0.5; float c = cos(vT.y), s = sin(vT.y); p = mat2(c, -s, s, c) * p;' +
  ' if (abs(p.x) > 0.5 || abs(p.y) > 0.5) return 0.0;' +
  ' float col = mod(vT.x, 4.0), row = floor(vT.x / 4.0);' +
  ' vec2 uv = vec2((col + p.x + 0.5) / 4.0, 1.0 - (row + p.y + 0.5) / 4.0);' +
  ' return texture2D(map, uv).a * smoothstep(0.5, 0.38, length(p)); }'; // round off: no square edges
const VFX_FS_TADD =
  VFX_TEX_UV + 'void main(){ float m = texMask() * vC.a; if (m < 0.003) discard; gl_FragColor = vec4(vC.rgb * m, m); }';
const VFX_FS_TALPHA =
  VFX_TEX_UV + 'void main(){ float m = texMask() * vC.a; if (m < 0.003) discard; gl_FragColor = vec4(vC.rgb, m); }';
const VFX_ATLAS = new THREE.TextureLoader().load('assets/vfx/fx-atlas.png');
/** Atlas tiles: a crescent slash, a thin arc, a crackle, a bolt, a flare, two stars, two smokes, a soft ball,
    a muzzle burst, a streak, a flame, a swirl, a glowing ring, a burst. */
const VT = {
  slash: 0,
  arc: 1,
  crackle: 2,
  bolt: 3,
  flare: 4,
  star: 5,
  star2: 6,
  smoke: 7,
  smoke2: 8,
  soft: 9,
  muzzle: 10,
  trace: 11,
  flame: 12,
  twirl: 13,
  ring: 14,
  burst: 15,
};
function vfxLayer(n, fs, blending, order, textured) {
  const g = new THREE.BufferGeometry();
  const dyn = a => a.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', dyn(new THREE.BufferAttribute(new Float32Array(n * 3), 3)));
  g.setAttribute('rgba', dyn(new THREE.BufferAttribute(new Float32Array(n * 4), 4)));
  g.setAttribute('size', dyn(new THREE.BufferAttribute(new Float32Array(n), 1)));
  if (textured) g.setAttribute('tr', dyn(new THREE.BufferAttribute(new Float32Array(n * 2), 2)));
  g.setDrawRange(0, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: textured ? { scale: { value: 400 }, map: { value: VFX_ATLAS } } : { scale: { value: 400 } },
    vertexShader: textured ? VFX_VS_T : VFX_VS,
    fragmentShader: fs,
    transparent: true,
    depthWrite: false,
    blending,
  });
  if (blending === THREE.AdditiveBlending) m.blending = THREE.CustomBlending; // premultiplied add: rgb already × alpha
  if (blending === THREE.AdditiveBlending) {
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneFactor;
  }
  // a big sprite low over the ground would be cut in half by the nearer ground (a point has one depth):
  // the textured effects draw over the scene instead
  if (textured) m.depthTest = false;
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = order;
  scene.add(p);
  return { p, g, n, list: [] };
}
const VFX = {
  glow: vfxLayer(2200, VFX_FS_GLOW, THREE.AdditiveBlending, 4),
  smoke: vfxLayer(900, VFX_FS_SMOKE, THREE.NormalBlending, 3),
  tglow: vfxLayer(700, VFX_FS_TADD, THREE.AdditiveBlending, 5, true),
  // projectiles: refilled every frame from the shots in flight (vfxShots)
  proj: vfxLayer(1800, VFX_FS_TADD, THREE.AdditiveBlending, 6, true),
  tsmoke: vfxLayer(400, VFX_FS_TALPHA, THREE.NormalBlending, 3, true),
  emitters: [],
  bolts: [],
};
/** Spawn one particle. o: x,y,z, vx,vy,vz, life, s (size), s1 (end size), r,g,b,a, drag, grav, smoke (layer),
    orbit: { cx, cz, ang, rad, w, rise, grow } — circles a centre (tornado / black hole) instead of flying. */
function vfxP(o) {
  const L = o.t !== undefined ? (o.smoke ? VFX.tsmoke : VFX.tglow) : o.smoke ? VFX.smoke : VFX.glow;
  if (L.list.length >= L.n) return;
  L.list.push({
    x: o.x,
    y: o.y,
    z: o.z,
    vx: o.vx || 0,
    vy: o.vy || 0,
    vz: o.vz || 0,
    l: 0,
    m: o.life || 0.6,
    s0: o.s || 0.4,
    s1: o.s1 !== undefined ? o.s1 : (o.s || 0.4) * (o.smoke ? 2.2 : 0.2),
    r: o.r === undefined ? 1 : o.r,
    g: o.g === undefined ? 1 : o.g,
    b: o.b === undefined ? 1 : o.b,
    a: o.a === undefined ? 1 : o.a,
    drag: o.drag || 0,
    grav: o.grav || 0,
    fade: o.fade || (o.smoke ? 1 : 0), // 1 = fade in and out (smoke), 0 = bright then fade
    orb: o.orbit || null,
    t: o.t || 0, // atlas tile (textured layers)
    rot: o.rot === undefined ? Math.random() * TAU : o.rot,
    spin: o.spin || 0,
  });
}
/** A continuous effect: fn(em, dt) runs every frame for `d` seconds (em.x/z can move, em.l is its age). */
function vfxEmit(x, z, d, fn, extra) {
  const em = Object.assign({ x, z, l: 0, d, fn, acc: 0 }, extra || {});
  VFX.emitters.push(em);
  return em;
}
function vfxClear() {
  for (const em of VFX.emitters) if (em.end) em.end();
  VFX.glow.list.length = VFX.smoke.list.length = VFX.tglow.list.length = VFX.tsmoke.list.length = 0;
  VFX.emitters.length = 0;
  for (const b of VFX.bolts) b.mesh.visible = false;
  for (const m of VFX_TWISTER) m.visible = false;
}
function vfxStep(L, dt) {
  const pos = L.g.attributes.position.array,
    col = L.g.attributes.rgba.array,
    siz = L.g.attributes.size.array,
    tr = L.g.attributes.tr ? L.g.attributes.tr.array : null;
  let w = 0;
  for (const q of L.list) {
    q.l += dt;
    if (q.l >= q.m) continue;
    const k = q.l / q.m;
    if (q.orb) {
      const o = q.orb;
      o.ang += o.w * dt;
      o.rad = Math.max(0.05, o.rad + (o.grow || 0) * dt);
      q.x = o.cx + Math.cos(o.ang) * o.rad;
      q.z = o.cz + Math.sin(o.ang) * o.rad;
      q.y += (o.rise || 0) * dt;
    } else {
      const d = Math.max(0, 1 - q.drag * dt);
      q.vx *= d;
      q.vy = q.vy * d - q.grav * dt;
      q.vz *= d;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      if (q.y < 0.05 && q.grav > 0) {
        q.y = 0.05;
        q.vy *= -0.35;
      }
    }
    const al = q.fade === 2 ? Math.min(1, k * 6, (1 - k) * 4) : q.fade ? Math.sin(Math.PI * k) : 1 - k * k;
    pos[w * 3] = q.x;
    pos[w * 3 + 1] = q.y;
    pos[w * 3 + 2] = q.z;
    col[w * 4] = q.r;
    col[w * 4 + 1] = q.g;
    col[w * 4 + 2] = q.b;
    col[w * 4 + 3] = q.a * al;
    siz[w] = q.s0 + (q.s1 - q.s0) * k;
    if (tr) {
      q.rot += q.spin * dt;
      tr[w * 2] = q.t;
      tr[w * 2 + 1] = q.rot;
    }
    L.list[w++] = q;
  }
  L.list.length = w;
  L.g.setDrawRange(0, w);
  L.g.attributes.position.needsUpdate = L.g.attributes.rgba.needsUpdate = L.g.attributes.size.needsUpdate = true;
  if (tr) L.g.attributes.tr.needsUpdate = true;
}

/* ---- lightning: jagged ribbons that always face the camera, a white core inside a blue glow */
const VFX_BOLTS = 14,
  VFX_SEG = 90;
for (let i = 0; i < VFX_BOLTS; i++) {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(VFX_SEG * 2 * 6 * 3), 3).setUsage(THREE.DynamicDrawUsage)
  );
  g.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array(VFX_SEG * 2 * 6 * 3), 3).setUsage(THREE.DynamicDrawUsage)
  );
  const bm = new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    })
  );
  bm.frustumCulled = false;
  bm.renderOrder = 5;
  bm.visible = false;
  scene.add(bm);
  VFX.bolts.push({ mesh: bm, g, l: 1, d: 1, pts: null, col: null, w: 1 });
}
/** Midpoint-displaced path between two points, with side branches. */
function vfxBoltPath(a, b, rough) {
  let path = [a, b];
  for (let pass = 0; pass < 5; pass++) {
    const next = [path[0]];
    for (let i = 1; i < path.length; i++) {
      const p = path[i - 1],
        q = path[i],
        len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]),
        j = len * rough;
      next.push(
        [(p[0] + q[0]) / 2 + rand(-j, j), (p[1] + q[1]) / 2 + rand(-j, j) * 0.6, (p[2] + q[2]) / 2 + rand(-j, j)],
        q
      );
    }
    path = next;
  }
  return path;
}
const vV = new THREE.Vector3(),
  vD = new THREE.Vector3(),
  vS = new THREE.Vector3();
function vfxBoltBuild(B) {
  const pos = B.g.attributes.position.array,
    col = B.g.attributes.color.array;
  let w = 0;
  const strip = (path, width, c, k) => {
    for (let i = 1; i < path.length && w < VFX_SEG * 2 * 6 * 3 - 18; i++) {
      const p = path[i - 1],
        q = path[i];
      vD.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      vV.set((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2).sub(camera.position);
      vS.crossVectors(vD, vV)
        .normalize()
        .multiplyScalar(width * (1 - (i / path.length) * 0.5 * k));
      const quad = [
        [p[0] - vS.x, p[1] - vS.y, p[2] - vS.z],
        [p[0] + vS.x, p[1] + vS.y, p[2] + vS.z],
        [q[0] + vS.x, q[1] + vS.y, q[2] + vS.z],
        [p[0] - vS.x, p[1] - vS.y, p[2] - vS.z],
        [q[0] + vS.x, q[1] + vS.y, q[2] + vS.z],
        [q[0] - vS.x, q[1] - vS.y, q[2] - vS.z],
      ];
      for (const v of quad) {
        pos[w] = v[0];
        pos[w + 1] = v[1];
        pos[w + 2] = v[2];
        col[w] = c[0];
        col[w + 1] = c[1];
        col[w + 2] = c[2];
        w += 3;
      }
    }
  };
  for (const path of B.paths) {
    strip(path, 0.32 * B.w, [B.col[0] * 0.35, B.col[1] * 0.35, B.col[2] * 0.35], 1); // glow
    strip(path, 0.09 * B.w, [1, 1, 1], 1); // white-hot core
  }
  B.g.setDrawRange(0, w / 3);
  B.g.attributes.position.needsUpdate = B.g.attributes.color.needsUpdate = true;
}
/** A lightning bolt through the points (each [x,y,z]); it flickers and re-forks while it lives. */
function vfxBolt(pts, opt) {
  opt = opt || {};
  const B = VFX.bolts.find(b => !b.mesh.visible) || VFX.bolts[0];
  B.pts = pts;
  B.l = 0;
  B.d = opt.life || 0.28;
  B.w = opt.w || 1;
  B.col = opt.col || [0.45, 0.75, 1.6];
  B.rough = opt.rough || 0.28;
  B.re = 0;
  B.mesh.visible = true;
  vfxBoltForm(B);
}
function vfxBoltForm(B) {
  B.paths = [];
  for (let i = 1; i < B.pts.length; i++) {
    const main = vfxBoltPath(B.pts[i - 1], B.pts[i], B.rough);
    B.paths.push(main);
    // a couple of forks off the main channel
    for (let f = 0; f < 2; f++) {
      const s = main[(main.length * rand(0.2, 0.7)) | 0],
        len =
          Math.hypot(B.pts[i][0] - B.pts[i - 1][0], B.pts[i][1] - B.pts[i - 1][1], B.pts[i][2] - B.pts[i - 1][2]) *
          0.35;
      B.paths.push(
        vfxBoltPath(s, [s[0] + rand(-len, len), s[1] - rand(0, len), s[2] + rand(-len, len)], 0.35).slice(0, 12)
      );
    }
  }
  vfxBoltBuild(B);
}

/* ---- per-frame update */
function vfxUpdate(dt) {
  VFX.glow.p.material.uniforms.scale.value =
    VFX.smoke.p.material.uniforms.scale.value =
    VFX.tglow.p.material.uniforms.scale.value =
    VFX.tsmoke.p.material.uniforms.scale.value =
    VFX.proj.p.material.uniforms.scale.value =
      H * DPR * 0.9;
  for (const em of VFX.emitters) {
    em.l += dt;
    if (em.l < em.d) em.fn(em, dt);
  }
  VFX.emitters = VFX.emitters.filter(em => {
    if (em.l < em.d) return true;
    if (em.end) em.end();
    return false;
  });
  vfxStep(VFX.glow, dt);
  vfxStep(VFX.smoke, dt);
  vfxStep(VFX.tglow, dt);
  vfxStep(VFX.tsmoke, dt);
  for (const B of VFX.bolts) {
    if (!B.mesh.visible) continue;
    B.l += dt;
    if (B.l >= B.d) {
      B.mesh.visible = false;
      continue;
    }
    if ((B.re += dt) > 0.05) {
      B.re = 0;
      vfxBoltForm(B); // flicker: a new jagged shape every few frames
    }
    B.mesh.material.opacity = (1 - B.l / B.d) * (0.75 + Math.random() * 0.25);
  }
}

/* ---- tornado funnels: an open cone, twisted and swaying, with spiral bands climbing it */
const VFX_TWISTER = [];
for (let i = 0; i < 4; i++) {
  const geo = new THREE.CylinderGeometry(1.9, 0.22, 5.6, 28, 10, true);
  geo.translate(0, 2.8, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, op: { value: 1 }, col: { value: new THREE.Color(0.78, 0.78, 0.76) } },
    vertexShader:
      'uniform float t; varying vec2 vUv; varying float vH;' +
      'void main(){ vUv = uv; vec3 p = position; float h = p.y / 5.6; vH = h;' +
      ' float a = h * 2.6 + t * 1.5; float c = cos(a), s = sin(a); p.xz = mat2(c, -s, s, c) * p.xz;' + // twist up the height
      ' p.x += sin(t * 2.3 + h * 3.0) * 0.45 * h; p.z += cos(t * 1.7 + h * 2.4) * 0.35 * h;' + // the top sways
      ' gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader:
      'uniform float t; uniform float op; uniform vec3 col; varying vec2 vUv; varying float vH;' +
      'void main(){ float band = fract(vUv.x * 3.0 - vUv.y * 1.6 - t * 2.2);' +
      ' float stripe = smoothstep(0.0, 0.25, band) * smoothstep(0.75, 0.45, band);' +
      ' float edge = smoothstep(0.0, 0.12, vH) * smoothstep(1.0, 0.75, vH);' +
      ' float a = (0.25 + 0.6 * stripe) * edge * op;' +
      ' gl_FragColor = vec4(col * (0.75 + 0.35 * stripe), a); }',
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.visible = false;
  m.frustumCulled = false;
  m.renderOrder = 3;
  scene.add(m);
  VFX_TWISTER.push(m);
}

/* =================== effect recipes =================== */
const vfxRate = (em, dt, perSec) => {
  em.acc += perSec * dt * (S.set.qual ? 1 : 0.6);
  const n = em.acc | 0;
  em.acc -= n;
  return n;
};
/** Bright sparks bursting from a point. */
function vfxSparks(x, y, z, n, c, spd, size, life) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU,
      e = rand(-0.2, 1),
      s = rand(0.4, 1) * spd;
    vfxP({
      x,
      y,
      z,
      vx: Math.cos(a) * s,
      vy: e * s,
      vz: Math.sin(a) * s,
      life: rand(0.5, 1) * (life || 0.5),
      s: size || 0.35,
      r: c[0],
      g: c[1],
      b: c[2],
      drag: 2.5,
      grav: 6,
    });
  }
}
/** Puffs of smoke (alpha-blended). */
function vfxSmoke(x, y, z, n, c, spread, size, life, rise) {
  for (let i = 0; i < n; i++)
    vfxP({
      smoke: 1,
      x: x + rand(-spread, spread),
      y: y + rand(0, spread * 0.5),
      z: z + rand(-spread, spread),
      vx: rand(-0.6, 0.6),
      vy: rise === undefined ? rand(0.6, 1.6) : rise,
      vz: rand(-0.6, 0.6),
      life: rand(0.7, 1.2) * (life || 1.2),
      s: size || 1.4,
      r: c[0],
      g: c[1],
      b: c[2],
      a: c[3] === undefined ? 0.55 : c[3],
      drag: 1.2,
    });
}
/** A fireball explosion: hot core, flames, sparks, black smoke and flying embers. */
function vfxExplosion(x, z, R, big) {
  const k = Math.min(2.2, R / 3);
  for (let i = 0; i < 14 * k; i++) {
    const a = Math.random() * TAU,
      s = rand(1, 4) * k;
    vfxP({
      x,
      y: 0.6,
      z,
      vx: Math.cos(a) * s,
      vy: rand(1, 4),
      vz: Math.sin(a) * s,
      life: rand(0.35, 0.6),
      s: rand(1.2, 2.2) * k,
      s1: 0.3,
      r: 1.6,
      g: rand(0.6, 0.9),
      b: 0.15,
      drag: 3,
    });
  }
  vfxP({ x, y: 0.8, z, life: 0.22, s: 4 * k, s1: 6 * k, r: 2, g: 1.6, b: 0.9 }); // the flash
  vfxP({ t: VT.flare, x, y: 1, z, life: 0.3, s: 6 * k, s1: 9 * k, r: 2, g: 1.5, b: 0.8, rot: 0 });
  vfxP({ t: VT.ring, x, y: 0.6, z, life: 0.45, s: R * 0.8, s1: R * 2.6, r: 1.6, g: 1.1, b: 0.5, a: 0.9 }); // shockwave
  vfxP({ t: VT.burst, x, y: 1, z, life: 0.35, s: 3 * k, s1: 5 * k, r: 2, g: 1.2, b: 0.4, spin: 3 });
  vfxSparks(x, 0.8, z, 12 * k, [1.6, 1, 0.3], 9 * k, 0.25, 0.8);
  for (let i = 0; i < 5 * k; i++)
    vfxP({
      t: i % 2 ? VT.smoke : VT.smoke2,
      smoke: 1,
      x: x + rand(-1, 1) * k,
      y: 0.8 + rand(0, 1),
      z: z + rand(-1, 1) * k,
      vx: rand(-0.6, 0.6),
      vy: rand(0.7, 1.5),
      vz: rand(-0.6, 0.6),
      life: rand(1, 1.6),
      s: 2.2 * k,
      s1: 4.2 * k,
      r: 0.16,
      g: 0.13,
      b: 0.12,
      a: 0.55,
      drag: 1.2,
      spin: rand(-0.8, 0.8),
    });
  if (big) vfxSmoke(x, 1.5, z, 6, [0.2, 0.16, 0.14, 0.5], 2.5 * k, 3 * k, 2, 2.2);
}
/** Flames licking up from a point (one burning enemy). */
function vfxFlame(x, z, h, n) {
  for (let i = 0; i < n; i++)
    vfxP({
      x: x + rand(-0.35, 0.35),
      y: rand(0.4, h),
      z: z + rand(-0.35, 0.35),
      vy: rand(1.5, 3),
      life: rand(0.3, 0.55),
      s: rand(0.5, 0.9),
      s1: 0.1,
      r: 1.7,
      g: rand(0.45, 0.8),
      b: 0.1,
    });
}
/** Storm cloud rolling in over (x,z): dark billows with flashes inside. */
function vfxStorm(x, z, life, big) {
  const R = big ? 3.4 : 2.4,
    y = 9;
  for (let i = 0; i < (big ? 24 : 16); i++)
    vfxP({
      smoke: 1,
      x: x + rand(-R, R),
      y: y + rand(-0.6, 0.8),
      z: z + rand(-R * 0.6, R * 0.6),
      vx: rand(-0.3, 0.3),
      life: life * rand(0.9, 1.2),
      s: rand(3.6, 5.2) * (big ? 1.25 : 1),
      s1: rand(4.2, 5.8),
      r: 0.1,
      g: 0.11,
      b: 0.16,
      a: 0.92,
      fade: 1,
    });
  vfxEmit(x, z, life, (em, dt) => {
    if (Math.random() < dt * 5)
      vfxP({
        x: em.x + rand(-R, R) * 0.7,
        y: y + rand(-0.4, 0.4),
        z: em.z + rand(-R, R) * 0.4,
        life: 0.12,
        s: rand(3, 5),
        s1: 4,
        r: 0.6,
        g: 0.75,
        b: 1.4,
        a: 0.7,
      });
  });
}
/** Lightning from a storm cloud down onto (x,z), with a scorch flash where it lands. */
function vfxSkyBolt(x, z, opt) {
  opt = opt || {};
  const sx = x + rand(-1.2, 1.2),
    sz = z + rand(-0.8, 0.8);
  vfxBolt(
    [
      [sx, 9, sz],
      [x, 0.2, z],
    ],
    { w: opt.w || 1.3, col: opt.col, life: 0.32, rough: 0.22 }
  );
  vfxP({ x, y: 0.4, z, life: 0.25, s: 3.2, s1: 5, r: 0.8, g: 0.9, b: 1.8 });
  vfxSparks(x, 0.4, z, 10, opt.col || [0.6, 0.85, 1.6], 7, 0.25, 0.45);
  vfxSmoke(x, 0.3, z, 3, [0.25, 0.25, 0.3, 0.4], 0.6, 1.2, 0.9, 0.8);
}
/** A tornado on (em.x, em.z): a tall funnel of dust that spins and climbs, wider at the top, with streaks of wind
    whipping round it, debris flung out and a skirt of dust at its foot. */
function vfxTornado(x, z, life, scale, col) {
  const c = col || [0.72, 0.72, 0.7];
  const funnel = VFX_TWISTER.find(m => !m.visible);
  if (funnel) {
    funnel.visible = true;
    funnel.material.uniforms.col.value.setRGB(c[0] * 1.05, c[1] * 1.05, c[2] * 1.05);
  }
  const em0 = vfxEmit(x, z, life, (em, dt) => {
    if (em.follow) {
      em.x = G.p.x;
      em.z = G.p.z;
    }
    if (funnel) {
      const k = em.l / life;
      funnel.position.set(em.x, 0, em.z);
      funnel.scale.setScalar(scale * (k < 0.15 ? 0.3 + (k / 0.15) * 0.7 : 1));
      funnel.material.uniforms.t.value = em.l * 3;
      funnel.material.uniforms.op.value = Math.min(1, k * 8, (1 - k) * 5);
    }
    const s =
      scale * (em.l < 0.2 ? 0.4 + (em.l / 0.2) * 0.6 : em.l > life - 0.3 ? Math.max(0.2, (life - em.l) / 0.3) : 1);
    // the funnel: three twisted strands of dust wound round each other, narrow at the foot, wide at the top
    const spin = em.l * 9;
    for (let i = vfxRate(em, dt, 420); i > 0; i--) {
      const h = Math.random() * 5.6 * s,
        strand = (i % 3) * (TAU / 3),
        sh = rand(0.82, 1.12),
        rad = (0.15 + h * 0.36) * s;
      vfxP({
        smoke: 1,
        x: em.x,
        y: h,
        z: em.z,
        life: rand(0.45, 0.7),
        s: (0.45 + h * 0.16) * s,
        s1: (0.55 + h * 0.2) * s,
        r: c[0] * sh,
        g: c[1] * sh,
        b: c[2] * sh,
        a: 0.95,
        fade: 2,
        orbit: { cx: em.x, cz: em.z, ang: spin + strand + h * 1.3 + rand(-0.3, 0.3), rad, w: 12 - h, rise: 0.6 * s },
      });
    }
    // streaks of wind: bright arcs whipping round the outside
    for (let i = vfxRate(em, dt, 90); i > 0; i--) {
      const h = Math.random() * 5.2 * s;
      vfxP({
        x: em.x,
        y: h,
        z: em.z,
        life: rand(0.15, 0.25),
        s: 0.45 * s,
        s1: 0.15,
        r: 1.2,
        g: 1.2,
        b: 1.15,
        a: 0.9,
        orbit: { cx: em.x, cz: em.z, ang: Math.random() * TAU, rad: (0.35 + h * 0.4) * s, w: 18, rise: 2 },
      });
    }
    // debris flung out of the spin
    for (let i = vfxRate(em, dt, 18); i > 0; i--) {
      const a = Math.random() * TAU,
        v = rand(4, 7);
      vfxP({
        smoke: 1,
        x: em.x + Math.cos(a) * s,
        y: rand(0.5, 3) * s,
        z: em.z + Math.sin(a) * s,
        vx: -Math.sin(a) * v + Math.cos(a) * 2,
        vy: rand(1, 4),
        vz: Math.cos(a) * v + Math.sin(a) * 2,
        life: rand(0.5, 0.8),
        s: 0.28,
        s1: 0.22,
        r: 0.22,
        g: 0.18,
        b: 0.12,
        a: 0.95,
        grav: 9,
        drag: 0.5,
      });
    }
    // the dust skirt at its foot
    for (let i = vfxRate(em, dt, 24); i > 0; i--)
      vfxP({
        smoke: 1,
        x: em.x,
        y: 0.25,
        z: em.z,
        life: rand(0.5, 0.8),
        s: 1.3 * s,
        s1: 2.4 * s,
        r: c[0],
        g: c[1],
        b: c[2],
        a: 0.45,
        fade: 1,
        orbit: { cx: em.x, cz: em.z, ang: Math.random() * TAU, rad: 1.2 * s, w: 6, grow: 2.2 },
      });
  });
  em0.end = () => funnel && (funnel.visible = false);
  return em0;
}
/** A black hole: a dark core inside a bright purple disc of matter spiralling in. */
function vfxBlackHole(em) {
  return vfxEmit(em.x, em.z, em.d, (q, dt) => {
    for (let i = vfxRate(q, dt, 140); i > 0; i--) {
      const r = rand(2.5, 6.5);
      vfxP({
        x: q.x,
        y: 1.4,
        z: q.z,
        life: rand(0.5, 0.9),
        s: rand(0.25, 0.5),
        s1: 0.1,
        r: rand(0.7, 1.2),
        g: 0.35,
        b: 1.6,
        orbit: { cx: q.x, cz: q.z, ang: Math.random() * TAU, rad: r, w: 14 / r, grow: -r * 1.1, rise: rand(-0.3, 0.3) },
      });
    }
    if (Math.random() < dt * 8) vfxSmoke(q.x, 1, q.z, 1, [0.12, 0.02, 0.2, 0.5], 3, 2.4, 0.8, 0);
  });
}
/** Ice: shards and frost mist bursting out in a ring of radius R. */
function vfxFrostBurst(x, z, R) {
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * TAU,
      s = R * rand(2, 3);
    vfxP({
      x,
      y: rand(0.3, 1.4),
      z,
      vx: Math.cos(a) * s,
      vy: rand(0.5, 2),
      vz: Math.sin(a) * s,
      life: rand(0.45, 0.7),
      s: rand(0.5, 0.9),
      s1: 0.15,
      r: 1,
      g: 1.4,
      b: 2,
      drag: 3,
    });
  }
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * TAU,
      d = rand(0.3, 1) * R;
    vfxSmoke(x + Math.cos(a) * d, 0.3, z + Math.sin(a) * d, 1, [0.85, 0.95, 1, 0.55], 0.4, 1.8, 1.1, 0.4);
  }
}
/** Healing: green motes spiralling up around the hero. */
function vfxHeal(x, z, n) {
  for (let i = 0; i < n; i++)
    vfxP({
      x,
      y: rand(0.2, 1),
      z,
      life: rand(0.8, 1.2),
      s: rand(0.25, 0.45),
      s1: 0.05,
      r: 0.4,
      g: 1.6,
      b: 0.6,
      orbit: { cx: x, cz: z, ang: Math.random() * TAU, rad: rand(0.6, 1.2), w: 4, rise: rand(1.5, 2.6) },
    });
}
/** Poison: green toxic billows and bubbles over an area for `life` seconds (purple for the spike trail). */
function vfxToxic(x, z, R, life, purple) {
  const c = purple ? [0.45, 0.18, 0.7] : [0.3, 0.75, 0.2];
  return vfxEmit(x, z, life, (em, dt) => {
    for (let i = vfxRate(em, dt, purple ? 6 : 16); i > 0; i--) {
      const a = Math.random() * TAU,
        d = Math.sqrt(Math.random()) * R;
      vfxP({
        smoke: 1,
        x: em.x + Math.cos(a) * d,
        y: 0.3,
        z: em.z + Math.sin(a) * d,
        vy: rand(0.2, 0.6),
        life: rand(0.9, 1.4),
        s: R * 0.7,
        s1: R * 1.1,
        r: c[0],
        g: c[1],
        b: c[2],
        a: 0.45,
        fade: 1,
      });
    }
    for (let i = vfxRate(em, dt, purple ? 3 : 10); i > 0; i--) {
      const a = Math.random() * TAU,
        d = Math.sqrt(Math.random()) * R;
      vfxP({
        x: em.x + Math.cos(a) * d,
        y: 0.2,
        z: em.z + Math.sin(a) * d,
        vy: rand(0.8, 1.6),
        life: rand(0.5, 0.9),
        s: 0.22,
        s1: 0.32,
        r: c[0] * 1.6,
        g: c[1] * 1.6,
        b: c[2] * 1.6,
      });
    }
  });
}
/** A burning meteor following (fx, fy, fz) — the caller moves em.mx/my/mz each frame. */
function vfxMeteorTrail(em, dt) {
  // fill the whole stretch the rock travelled this frame, so the trail is one stream of fire
  const px = em.px === undefined ? em.mx : em.px,
    py = em.py === undefined ? em.my : em.py,
    pz = em.pz === undefined ? em.mz : em.pz;
  for (let i = vfxRate(em, dt, 520); i > 0; i--) {
    const t = Math.random();
    vfxP({
      x: px + (em.mx - px) * t + rand(-0.2, 0.2),
      y: py + (em.my - py) * t + rand(-0.2, 0.2),
      z: pz + (em.mz - pz) * t + rand(-0.2, 0.2),
      life: rand(0.45, 0.75),
      s: rand(1.4, 2.2) * em.size,
      s1: 0.8 * em.size,
      r: 1.8,
      g: rand(0.45, 0.85),
      b: 0.12,
      a: 0.85,
    });
  }
  vfxP({ x: em.mx, y: em.my, z: em.mz, life: 0.06, s: 2.6 * em.size, s1: 2.6 * em.size, r: 2, g: 1.4, b: 0.6 }); // white-hot head
  em.px = em.mx;
  em.py = em.my;
  em.pz = em.mz;
  if (Math.random() < dt * 40)
    vfxSmoke(em.mx, em.my + 0.5, em.mz, 1, [0.15, 0.12, 0.12, 0.5], 0.3, 1.5 * em.size, 1, 0.2);
}
/** The phoenix: a pillar of fire and two sweeping wings of flame. */
function vfxPhoenix(x, z) {
  for (let i = 0; i < 80; i++)
    vfxP({
      x: x + rand(-0.8, 0.8),
      y: rand(0, 2),
      z: z + rand(-0.8, 0.8),
      vy: rand(5, 11),
      life: rand(0.6, 1.1),
      s: rand(1, 1.8),
      s1: 0.2,
      r: 1.8,
      g: rand(0.5, 0.9),
      b: 0.15,
      drag: 1,
    });
  for (const side of [-1, 1])
    for (let i = 0; i < 50; i++) {
      const t = i / 50,
        a = side * (0.3 + t * 1.3);
      vfxP({
        x,
        y: 2.5 + t * 2.5,
        z,
        vx: Math.sin(a) * 9 * (0.4 + t),
        vy: 2 - t * 3,
        vz: -Math.cos(a) * 2,
        life: rand(0.7, 1),
        s: rand(0.8, 1.3),
        s1: 0.1,
        r: 1.8,
        g: 0.7 + t * 0.5,
        b: 0.2,
        drag: 1.5,
      });
    }
}
/** The blade whirl: a ring of glowing steel arcs and wind sweeping round the hero at sword's reach
    (the hero stays visible in the middle). */
function vfxBladeWhirl(R) {
  const p = G.p;
  // a solid ring of bright steel, plus a fainter echo trailing just behind it
  for (const [n, rad, sz, bright] of [
    [110, 0.85, 0.7, 1],
    [70, 0.72, 0.5, 0.55],
  ])
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      vfxP({
        x: p.x,
        y: 1,
        z: p.z,
        life: 0.34,
        s: sz,
        s1: sz * 0.3,
        r: 1.6 * bright,
        g: 1.65 * bright,
        b: 1.9 * bright,
        orbit: { cx: p.x, cz: p.z, ang: a, rad: R * rad, w: 15, rise: 0.3 },
      });
    }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    vfxP({
      smoke: 1,
      x: p.x,
      y: 0.4,
      z: p.z,
      life: 0.45,
      s: 1,
      s1: 1.8,
      r: 0.85,
      g: 0.86,
      b: 0.9,
      a: 0.35,
      fade: 1,
      orbit: { cx: p.x, cz: p.z, ang: a, rad: R * 0.95, w: 12, grow: 1.5 },
    });
  }
}

/* =================== combat feel: textured hits, kills and muzzle flashes =================== */
/** A blow landing: a sharp star flash and a crackle in the weapon's colour (bigger and golden on a critical). */
function vfxHit(x, z, c, crit) {
  const s = crit ? 1.6 : 1;
  vfxP({ t: VT.star2, x, y: 1.1, z, life: 0.14, s: 1.6 * s, s1: 0.6, r: c[0] * 1.6, g: c[1] * 1.6, b: c[2] * 1.6 });
  vfxP({ t: VT.crackle, x, y: 1.1, z, life: 0.16, s: 1.8 * s, s1: 2.4 * s, r: c[0], g: c[1], b: c[2], a: 0.9 });
  if (crit) vfxP({ t: VT.burst, x, y: 1.2, z, life: 0.22, s: 2, s1: 3.6, r: 2, g: 1.6, b: 0.5, spin: 4 });
}
/** An enemy falling: a burst of light and a puff of dust. */
function vfxKill(x, z, big) {
  const k = big ? 1.8 : 1;
  vfxP({ t: VT.burst, x, y: 1, z, life: 0.28, s: 1.6 * k, s1: 3.2 * k, r: 1.8, g: 1.3, b: 0.8, spin: 2 });
  vfxP({ t: VT.ring, x, y: 0.4, z, life: 0.3, s: 0.6 * k, s1: 3 * k, r: 1.4, g: 1, b: 0.7, a: 0.7 });
  vfxP({
    t: VT.smoke2,
    smoke: 1,
    x,
    y: 0.6,
    z,
    vy: 0.8,
    life: 0.8,
    s: 1.4 * k,
    s1: 2.6 * k,
    r: 0.3,
    g: 0.26,
    b: 0.22,
    a: 0.4,
    spin: rand(-1, 1),
  });
}
/** A gun's muzzle flash at (x,z). */
function vfxMuzzle(x, z, c) {
  vfxP({ t: VT.star, x, y: 1.3, z, life: 0.08, s: 1.6, s1: 0.8, r: c[0] * 1.8, g: c[1] * 1.8, b: c[2] * 1.8 });
  vfxP({ t: VT.soft, x, y: 1.3, z, life: 0.1, s: 1.2, s1: 0.4, r: c[0], g: c[1], b: c[2], a: 0.8 });
}

/* =================== projectiles as light =================== */
/** Fill the projectile layer from the shots in flight: yours (by kind) and the enemies'. Each is a few textured
    sprites: a streak along its flight (turned to its direction on screen), a glowing head, a halo. */
const VSHOT = { n: 0 };
function vshot(x, y, z, t, s, c, a, rot) {
  const L = VFX.proj;
  if (VSHOT.n >= L.n) return;
  const i = VSHOT.n++,
    g = L.g.attributes;
  g.position.array.set([x, y, z], i * 3);
  g.rgba.array.set([c[0], c[1], c[2], a], i * 4);
  g.size.array[i] = s;
  g.tr.array[i * 2] = t;
  g.tr.array[i * 2 + 1] = rot || 0;
}
/** Screen angle of a direction (vx,vz) at (x,z), for turning a streak along it. */
function vshotAng(x, z, vx, vz) {
  const a = proj(x, 1.1, z),
    b = proj(x + vx * 0.05, 1.1, z + vz * 0.05);
  return Math.atan2(b[0] - a[0], -(b[1] - a[1])); // the streak tile runs up the sprite
}
function vfxShots(now) {
  VSHOT.n = 0;
  const t = now / 1000;
  for (const s of G.shots) {
    const c = s.col || [1, 0.85, 0.5],
      hot = [Math.min(2, c[0] * 1.5 + 0.3), Math.min(2, c[1] * 1.5 + 0.3), Math.min(2, c[2] * 1.5 + 0.3)];
    if (s.kind === 2) {
      // spinning blades (shuriken, axes): a turning arc of light
      vshot(s.x, 1.1, s.z, VT.twirl, s.r * 5 + 1, hot, 1, t * 18);
      vshot(s.x, 1.1, s.z, VT.star, s.r * 3 + 0.6, c, 0.9, -t * 12);
    } else if (s.kind === 3) {
      // a rocket: a hot flame and a trail of smoke
      vshot(s.x, 1.1, s.z, VT.flare, 2.2, [2, 1.3, 0.5], 1, 0);
      vshot(
        s.x - s.vx * 0.04,
        1.1,
        s.z - s.vz * 0.04,
        VT.flame,
        1.6,
        [1.8, 0.8, 0.2],
        0.9,
        vshotAng(s.x, s.z, -s.vx, -s.vz)
      );
      if (Math.random() < 0.5)
        vfxP({
          t: VT.smoke,
          smoke: 1,
          x: s.x,
          y: 1.1,
          z: s.z,
          vy: 0.4,
          life: 0.7,
          s: 0.8,
          s1: 2,
          r: 0.3,
          g: 0.28,
          b: 0.26,
          a: 0.45,
        });
    } else if (s.kind === 4) {
      // a magic orb: a pulsing ball of light with a sparkle
      const q = s.r * 4 * (1 + 0.15 * Math.sin(s.t * 20));
      vshot(s.x, 1.1, s.z, VT.soft, q + 0.6, [c[0] * 0.9, c[1] * 0.6, c[2] * 1.3], 1, 0);
      vshot(s.x, 1.1, s.z, VT.star2, q * 1.3 + 0.6, hot, 0.8, t * 3);
    } else {
      // bullets and arrows: a streak of light along the flight and a bright head
      const long = s.kind === 1 ? 3.4 : 2.6;
      vshot(s.x, 1.1, s.z, VT.trace, long, hot, 1, vshotAng(s.x, s.z, s.vx, s.vz));
      vshot(s.x, 1.1, s.z, VT.soft, 0.9, hot, 0.9, 0);
    }
  }
  for (const s of G.eshots) {
    const st = s.sty && BOSS_ULTS[s.sty - 1].shot,
      c = st ? st.c : [1.9, 0.35, 0.25];
    if (st && (st.form === 'thorn' || st.form === 'blade')) {
      vshot(s.x, 1, s.z, st.form === 'blade' ? VT.arc : VT.trace, 2.2, c, 1, vshotAng(s.x, s.z, s.vx, s.vz));
      vshot(s.x, 1, s.z, VT.soft, 0.7, c, 0.7, 0);
    } else {
      // an energy orb: a hot core and a slowly turning halo
      const k = st ? st.s * 2 : 1;
      vshot(
        s.x,
        1,
        s.z,
        VT.soft,
        1 * k,
        [Math.min(2, c[0] + 0.6), Math.min(2, c[1] + 0.5), Math.min(2, c[2] + 0.5)],
        1,
        0
      );
      vshot(s.x, 1, s.z, VT.ring, 1.6 * k, c, 0.75, t * 4);
      vshot(s.x, 1, s.z, VT.star, 1.3 * k, c, 0.5, t * 2);
    }
  }
  const L = VFX.proj;
  L.g.setDrawRange(0, VSHOT.n);
  const A = L.g.attributes;
  A.position.needsUpdate = A.rgba.needsUpdate = A.size.needsUpdate = A.tr.needsUpdate = true;
}
