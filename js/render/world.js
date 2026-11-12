'use strict';
/* Arena ground, stage decor, and pooled effect meshes. */
/* ground + decor */
const gtexC = document.createElement('canvas');
gtexC.width = gtexC.height = 256;
(() => {
  const c = gtexC.getContext('2d');
  c.fillStyle = '#e9e9e9';
  c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = (200 + Math.random() * 55) | 0;
    c.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    c.fillRect(Math.random() * 256, Math.random() * 256, rand(1, 5), rand(1, 5));
  }
  c.strokeStyle = 'rgba(120,120,120,.35)';
  c.lineWidth = 2;
  c.strokeRect(0, 0, 256, 256);
})();
const gtex = new THREE.CanvasTexture(gtexC);
gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
gtex.repeat.set(28, 28);
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
function setStage(i) {
  const st = STAGES[i];
  ground.material.color.setHex(st.ground);
  scene.fog.color.setHex(st.fog);
  scene.background.setHex(st.fog);
  hemi.color.setHex(st.amb);
  const ab = !!st.abyss;
  scene.fog.near = ab ? 26 : 34;
  scene.fog.far = ab ? 70 : 78;
  sun.intensity = ab ? 0.85 : 0.95;
  sun.color.setHex(ab ? 0xffb0c0 : 0xfff2d8);
  hemi.intensity = 0.62;
  hemi.groundColor.setHex(ab ? 0x5a1030 : 0x30343c);
  edge.material.color.setHex(ab ? 0xff2030 : 0xf2a23a);
  $('dark').style.opacity = ab ? 1 : 0;
  for (const d of decor) {
    scene.remove(d.mesh);
    d.mesh.dispose && d.mesh.dispose();
  }
  decor = [];
  st.decor.forEach((k, j) => {
    const n = j ? 46 : 60,
      I = inst(GEO[k], lamV, n, true);
    I.mesh.receiveShadow = true;
    for (let q = 0; q < n; q++) {
      const a = Math.random() * TAU,
        r = q < n * 0.6 ? rand(9, ARENA - 3) : rand(ARENA + 4, 90),
        s = rand(0.8, 1.35);
      put(I, Math.cos(a) * r, 0, Math.sin(a) * r, Math.random() * TAU, s, s, s, 1, 1, 1);
    }
    flush(I);
    decor.push(I);
  });
  MUS.root = st.root;
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
