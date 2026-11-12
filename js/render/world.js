'use strict';
/* Arena ground, stage decor, and pooled effect meshes. */
/* ground + decor */
const gtexC = document.createElement('canvas');
gtexC.width = gtexC.height = 512;
(() => {
  // soft patches, speckles and small stones; tinted per stage by the material colour
  const c = gtexC.getContext('2d'),
    S0 = 512;
  c.fillStyle = '#d8d8d8';
  c.fillRect(0, 0, S0, S0);
  const blob = (x, y, r, v, a) => {
    for (const dx of [-S0, 0, S0])
      for (const dy of [-S0, 0, S0]) {
        const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',' + a + ')');
        g.addColorStop(1, 'rgba(' + v + ',' + v + ',' + v + ',0)');
        c.fillStyle = g;
        c.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
  };
  for (let i = 0; i < 26; i++)
    blob(Math.random() * S0, Math.random() * S0, rand(50, 140), Math.random() < 0.5 ? 150 : 255, rand(0.25, 0.5));
  for (let i = 0; i < 5000; i++) {
    const v = (170 + Math.random() * 85) | 0;
    c.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',.55)';
    c.fillRect(Math.random() * S0, Math.random() * S0, rand(1, 3), rand(1, 4));
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * S0,
      y = Math.random() * S0,
      r = rand(2, 5);
    c.fillStyle = 'rgba(90,90,90,.5)';
    c.beginPath();
    c.ellipse(x + 1, y + 1.5, r, r * 0.7, 0, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(245,245,245,.7)';
    c.beginPath();
    c.ellipse(x, y, r, r * 0.7, 0, 0, TAU);
    c.fill();
  }
})();
const gtex = new THREE.CanvasTexture(gtexC);
gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
gtex.repeat.set(16, 16);
gtex.anisotropy = 4;
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(110, 48),
  new THREE.MeshLambertMaterial({ map: gtex, color: 0x3c6b38 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const edge = new THREE.Mesh(
  new THREE.RingGeometry(ARENA + 1.2, ARENA + 2, 96),
  new THREE.MeshBasicMaterial({ color: 0xf2a23a, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
);
edge.rotation.x = -Math.PI / 2;
edge.position.y = 0.05;
scene.add(edge);
const outer = new THREE.Mesh(
  new THREE.RingGeometry(ARENA + 2, 112, 64),
  new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
);
outer.rotation.x = -Math.PI / 2;
outer.position.y = 0.04;
scene.add(outer);
(() => {
  const P = inst(GEO.post, lamV, 44, true);
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * TAU;
    put(P, Math.cos(a) * (ARENA + 1.6), 0, Math.sin(a) * (ARENA + 1.6), -a, 1, 1, 1, 1, 1, 1);
  }
  flush(P);
  P.mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
})();
let decor = [];
/** Solid footprints of each decor kind: [offsetX, offsetZ, radius] circles in the model's own space (scaled with it).
    Kinds not listed (dunes) can be walked over. */
const DECOR_SOLID = {
  tree: [[0, 0, 0.55]],
  snowtree: [[0, 0, 0.55]],
  deadtree: [[0, 0, 0.45]],
  rock: [[0, 0, 1.2]],
  lavarock: [[0, 0, 1.2]],
  ice: [[0, 0, 1]],
  cactus: [[0, 0, 0.5]],
  pillar: [[0, 0, 0.85]],
  flag: [[0, 0, 0.2]],
  crate: [[0, 0, 0.95]],
  barrier: [
    [-1.2, 0, 0.5],
    [0, 0, 0.5],
    [1.2, 0, 0.5],
  ],
  bones: [[0, 0, 0.6]],
};
/** Solid circles { x, z, r } inside the arena for the current stage (see pushOutOfObstacles). */
const OBST = [];
function setStage(i) {
  const st = STAGES[i];
  ground.material.color.setHex(st.ground).multiplyScalar(0.86);
  scene.fog.color.setHex(st.fog);
  scene.background.setHex(st.fog);
  hemi.color.setHex(st.amb);
  const ab = !!st.abyss;
  // closer fog gives depth at the screen edges; a warm key light over a cooler fill
  scene.fog.near = ab ? 22 : 26;
  scene.fog.far = ab ? 62 : 70;
  sun.intensity = ab ? 0.85 : 0.92;
  sun.color.setHex(ab ? 0xffb0c0 : 0xffe6c0);
  hemi.intensity = 0.52;
  hemi.groundColor.setHex(ab ? 0x5a1030 : 0x30343c);
  edge.material.color.setHex(ab ? 0xff2030 : 0xf2a23a);
  $('dark').style.opacity = ab ? 1 : 0;
  for (const d of decor) {
    scene.remove(d.mesh);
    d.mesh.dispose && d.mesh.dispose();
  }
  decor = [];
  OBST.length = 0;
  st.decor.forEach((k, j) => {
    const n = j ? 46 : 60,
      I = inst(GEO[k], lamV, n, true);
    I.mesh.receiveShadow = true;
    for (let q = 0; q < n; q++) {
      const a = Math.random() * TAU,
        r = q < n * 0.6 ? rand(9, ARENA - 3) : rand(ARENA + 4, 90),
        s = rand(0.8, 1.35),
        x = Math.cos(a) * r,
        z = Math.sin(a) * r,
        ry = Math.random() * TAU;
      put(I, x, 0, z, ry, s, s, s, 1, 1, 1);
      // record its solid footprint (rotated like the model) when it stands inside the arena
      if (r < ARENA + 2 && DECOR_SOLID[k]) {
        const c = Math.cos(ry),
          sn = Math.sin(ry);
        for (const [ox, oz, cr] of DECOR_SOLID[k])
          OBST.push({ x: x + (ox * c + oz * sn) * s, z: z + (-ox * sn + oz * c) * s, r: cr * s });
      }
    }
    flush(I);
    decor.push(I);
  });
  MUS.root = st.root;
  setAtmosphere(st);
}

/* pooled fx meshes */
function pool(n, mk) {
  const a = [];
  for (let i = 0; i < n; i++) {
    const m = mk();
    m.visible = false;
    scene.add(m);
    a.push(m);
  }
  return a;
}
const addMat = (c, o) =>
  new THREE.MeshBasicMaterial({
    color: c,
    transparent: true,
    opacity: o,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
const ringGeo = new THREE.RingGeometry(0.84, 1, 48),
  discGeo = new THREE.CircleGeometry(1, 40);
const ringPool = pool(14, () => {
  const m = new THREE.Mesh(ringGeo, addMat(0xffffff, 1));
  m.rotation.x = -Math.PI / 2;
  return m;
});
/** Poison clouds and black holes (see update.js). */
const cloudPool = pool(10, () => {
  const m = new THREE.Mesh(discGeo, addMat(0x50ff60, 0.22));
  m.rotation.x = -Math.PI / 2;
  return m;
});
const holePool = pool(3, () => new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0x0a0010 })));
const zonePool = pool(48, () => {
  const m = new THREE.Mesh(
    discGeo,
    new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.3, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  return m;
});
const ballPool = pool(48, () => new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xff8a20 })));
const slashGeo = [2.3, 3.6, TAU].map(a => new THREE.RingGeometry(0.45, 1, 28, 1, -a / 2, a));
const slashPool = pool(6, () => new THREE.Mesh(slashGeo[0], addMat(0xffffff, 1)));
const auraMesh = new THREE.Mesh(discGeo, addMat(0x4ab8ff, 0.16));
auraMesh.rotation.x = -Math.PI / 2;
auraMesh.position.y = 0.08;
auraMesh.visible = false;
scene.add(auraMesh);
const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12), addMat(0x6fb7ff, 0.2));
shieldMesh.visible = false;
scene.add(shieldMesh);
/** Coloured glow under the boss (colour from BOSS_ULTS). */
const bossAura = new THREE.Mesh(discGeo, addMat(0xffffff, 0.2));
bossAura.rotation.x = -Math.PI / 2;
bossAura.visible = false;
scene.add(bossAura);
const bossMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const bossMesh = new THREE.Mesh(GEO.boss0, bossMat);
bossMesh.castShadow = true;
bossMesh.visible = false;
scene.add(bossMesh);
