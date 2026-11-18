'use strict';

const FORGE_STYLES = [
  { id: 'ember', name: 'حارس الفحم', title: 'فولاذ أسود ونحاس محروق', steel: 0x393c45, edge: 0xb37c43, cloth: 0x331f24, lens: 0xffb06c },
  { id: 'cypress', name: 'نصل السرو', title: 'درع زمردي بصفائح فضية', steel: 0x2d5550, edge: 0x9daeae, cloth: 0x143734, lens: 0x93d5bc },
  { id: 'copper', name: 'جلاد النحاس', title: 'خوذة مقفلة وصفائح نحاسية', steel: 0x673632, edge: 0xc49a58, cloth: 0x462724, lens: 0xff9959 },
];
function forgeStyle() {
  const idx = FORGE_STYLES.findIndex(style => style.id === S.forgeStyle);
  return Math.max(0, idx);
}

function forgeDress(f, id) {
  if (f.forgeStyle === id || !FORGE_STYLES[id]) return;
  const style = FORGE_STYLES[id];
  if (!f.forgeArmor) forgeArmor(f);
  f.forgeStyle = id;
  const mats = f.forgeArmor.materials;
  for (const k of Object.keys(mats)) mats[k].color.setHex(style[k]);
  mats.lens.emissive.setHex(style.lens);
  f.forgeArmor.horns.visible = id === 2;
  f.forgeArmor.crest.visible = id === 1;
  f.forgeArmor.visor.scale.set(id === 1 ? 0.94 : 1, id === 2 ? 1.23 : 1, 1);
}

function forgeArmor(f) {
  const materials = {
    steel: new THREE.MeshStandardMaterial({ metalness: 0.64, roughness: 0.38 }),
    edge: new THREE.MeshStandardMaterial({ metalness: 0.56, roughness: 0.31 }),
    cloth: new THREE.MeshStandardMaterial({ roughness: 0.91 }),
    lens: new THREE.MeshStandardMaterial({ metalness: 0.22, roughness: 0.42, emissiveIntensity: 0.1 }),
  };
  const snap = f.root.position.clone(), direction = f.root.quaternion.clone();
  f.root.position.set(0, 0, 0);
  f.root.quaternion.identity();
  f.root.updateMatrixWorld(true);
  const sphere = (r, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 7), mat);
    m.scale.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  const attach = (name, part, dx, dy, dz) => {
    const bone = goreBone(f, name);
    if (!bone) return;
    f.root.add(part);
    part.position.copy(f.root.worldToLocal(bone.getWorldPosition(new THREE.Vector3())));
    part.position.add(new THREE.Vector3(dx, dy, dz));
    f.root.updateMatrixWorld(true);
    bone.attach(part);
    f.fpHide.push(part);
  };

  const helmet = new THREE.Group();
  helmet.add(sphere(0.164, 0.98, 1.12, 1.03, materials.steel));
  const visor = new THREE.Group();
  visor.add(box(0.211, 0.105, 0.051, materials.edge, 0, -0.012, 0.135));
  visor.add(box(0.178, 0.017, 0.017, materials.cloth, 0, 0.013, 0.165));
  visor.add(box(0.087, 0.005, 0.006, materials.lens, 0, 0.012, 0.177));
  helmet.add(visor);
  const horns = new THREE.Group(), crest = new THREE.Group();
  for (const side of [-1, 1]) {
    const cheek = box(0.028, 0.137, 0.14, materials.steel, side * 0.118, -0.048, 0.094);
    cheek.rotation.z = side * 0.18;
    helmet.add(cheek);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.046, 0.185, 6), materials.edge);
    horn.position.set(side * 0.134, 0.154, -0.027);
    horn.rotation.z = -side * 0.49;
    horns.add(horn);
  }
  crest.add(box(0.025, 0.107, 0.227, materials.edge, 0, 0.143, -0.018));
  helmet.add(horns, crest);
  attach('Head', helmet, 0, 0.037, 0.015);
  f.headMeshes.push(helmet);

  const chest = new THREE.Group();
  const breastplate = sphere(0.235, 1.11, 1.03, 0.57, materials.steel);
  chest.add(breastplate, box(0.071, 0.295, 0.073, materials.edge, 0, -0.012, 0.117));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const plate = box(0.189, 0.047, 0.052, i % 2 ? materials.edge : materials.steel, side * 0.105, -0.08 + i * 0.073, 0.101);
      plate.rotation.z = side * 0.23;
      chest.add(plate);
    }
  }
  attach('spine_02', chest, 0, 0.08, 0.046);
  const waist = new THREE.Group();
  waist.add(box(0.32, 0.07, 0.17, materials.cloth, 0, -0.09, 0.07));
  const skirt = box(0.143, 0.22, 0.035, materials.cloth, 0, -0.19, 0.116);
  waist.add(skirt, box(0.075, 0.06, 0.037, materials.edge, 0, -0.087, 0.158));
  attach('spine_01', waist, 0, 0, 0.028);
  for (const side of ['l', 'r']) {
    const shield = new THREE.Group();
    shield.add(sphere(0.157, 1.19, 0.63, 1.02, materials.steel));
    shield.add(box(0.22, 0.036, 0.042, materials.edge, 0, 0.074, 0.112));
    attach('upperarm_' + side, shield, 0, 0.042, 0);
    const knee = sphere(0.092, 0.90, 1.28, 0.65, materials.edge);
    attach('calf_' + side, knee, 0, -0.035, 0.074);
  }
  f.root.position.copy(snap);
  f.root.quaternion.copy(direction);
  f.root.updateMatrixWorld(true);
  f.forgeArmor = { materials, horns, crest, visor };
}

function forgeLight(scene) {
  const warm = new THREE.DirectionalLight(0xffae6e, 0.34);
  warm.position.set(-8, 6, -9);
  const cool = new THREE.DirectionalLight(0x8d9fbe, 0.33);
  cool.position.set(8, 8, 9);
  scene.add(warm, cool);
  const brass = new THREE.MeshStandardMaterial({ color: 0x875232, metalness: 0.62, roughness: 0.56 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(9.64, 0.045, 5, 72), brass);
  band.rotation.x = -Math.PI / 2;
  band.position.y = 0.02;
  scene.add(band);
  const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.03, 0.27), brass, 32);
  const pose = new THREE.Object3D();
  for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 16;
    pose.position.set(9.37 * Math.sin(a), 0.022, 9.37 * Math.cos(a));
    pose.rotation.y = a;
    pose.updateMatrix();
    teeth.setMatrixAt(i, pose.matrix);
  }
  scene.add(teeth);
}

function forgeFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d');
  g.fillStyle = '#18151b';
  g.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 12; row++) {
    for (let col = -1; col < 8; col++) {
      const x = col * 72 + (row % 2) * 36, y = row * 44;
      const shade = 27 + ((col * 37 + row * 53 + 913) % 23);
      g.fillStyle = `rgb(${shade + 13},${shade + 3},${shade})`;
      g.fillRect(x + 2, y + 2, 68, 40);
      g.fillStyle = '#b47a4628';
      g.fillRect(x + 2, y + 2, 67, 1);
      g.fillStyle = '#0c0b0e80';
      g.fillRect(x + 2, y + 40, 67, 2);
    }
  }
  let seed = 12304;
  const next = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = i % 2 ? '#dea27118' : '#100e1536';
    g.fillRect(next() * 512, next() * 512, 1 + next() * 2, 1);
  }
  return arenaTex(canvas, [3.3, 3.3]);
}
