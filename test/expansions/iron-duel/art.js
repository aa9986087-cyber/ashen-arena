'use strict';

const FORGE_STYLES = [
  { id:'ember', name:'حارس الفحم', title:'صفائح فولاذ وكتان فحمي', plate:true, steel:0x515b62, edge:0xaa8b61, cloth:0x342d26, lens:0x9e866d, skin:0xa66f54, tunic:0x34312c, trousers:0x29282a, belt:0x503b2c },
  { id:'cypress', name:'نصل السرو', title:'درع فضي فوق سترة زيتونية', plate:true, steel:0x727b76, edge:0x9c9d85, cloth:0x263330, lens:0xc7c2a0, skin:0xc29874, tunic:0x37443a, trousers:0x35362d, belt:0x4b3c2b },
  { id:'copper', name:'جلاد النحاس', title:'صدرية معتّقة وكتف ثقيل', plate:true, steel:0x6b5344, edge:0xae7e51, cloth:0x49332d, lens:0xac8c6c, skin:0x8c5d47, tunic:0x593b31, trousers:0x312727, belt:0x51382e },
  { id:'pit', name:'مقاتل الحلبة', title:'سترة كتان مبطّنة وأحزمة جلد', steel:0x51433c, edge:0x937950, cloth:0x604f47, lens:0xa58463, skin:0xa97053, tunic:0x6b493e, trousers:0x3e3431, belt:0x493528 },
  { id:'gate', name:'حارس البوابة', title:'كتّان أخضر وحامية كتف جلدية', steel:0x47463e, edge:0xaa9368, cloth:0x2b392f, lens:0x8e967e, skin:0xc69572, tunic:0x405347, trousers:0x342e28, belt:0x5d422d },
];
function forgeStyle() {
  const idx = FORGE_STYLES.findIndex(style => style.id === S.forgeStyle);
  return idx < 0 ? 3 : idx;
}

function forgeDress(f, id) {
  if (f.forgeStyle === id || !FORGE_STYLES[id]) return;
  const style = FORGE_STYLES[id];
  if (!f.forgeArmor) forgeArmor(f);
  f.forgeStyle = id;
  const mats = f.forgeArmor.materials;
  for (const k of Object.keys(mats)) mats[k].color.setHex(style[k]);
  mats.lens.emissive.setHex(style.lens);
  f.forgeArmor.crest.visible = id === 1;
  f.forgeArmor.ridge.visible = id === 2;
  f.forgeArmor.helmet.scale.set(id === 2 ? 1.08 : .93, id === 1 ? 1.07 : id === 2 ? .88 : 1, 1);
  f.forgeArmor.wrap.userData.forgeStyle = 3;
  f.forgeArmor.cap.userData.forgeStyle = 4;
  f.forgeArmor.shoulders.forEach((part, i) => {
    part.userData.forgeOmitStyle = i === 1 ? 1 : undefined;
    part.scale.setScalar(id === 2 && i === 0 ? 1.27 : 1);
  });
  f.forgeArmor.visor.scale.set(id === 1 ? 0.94 : 1, id === 2 ? 1.23 : 1, 1);
  forgeStyleFigure(f, style);
  for (const mat of Object.values(mats)) forgeInjuryMaterial(f, mat);
  for (const part of f.fpHide) part.visible = forgeFighterVisible(f, part);
}

function forgeArmor(f) {
  const materials = {
    steel: new THREE.MeshStandardMaterial({ metalness: 0.64, roughness: 0.43 }),
    edge: new THREE.MeshStandardMaterial({ metalness: 0.56, roughness: 0.47 }),
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
  const attach = (name, part, dx, dy, dz, wear = 'armored') => {
    const bone = goreBone(f, name);
    if (!bone) return;
    f.root.add(part);
    part.position.copy(f.root.worldToLocal(bone.getWorldPosition(new THREE.Vector3())));
    part.position.add(new THREE.Vector3(dx, dy, dz));
    f.root.updateMatrixWorld(true);
    bone.attach(part);
    part.userData.forgeWear = wear;
    f.fpHide.push(part);
  };

  const helmet = new THREE.Group();
  helmet.add(sphere(.151, 1.01, 1.12, 1.05, materials.steel));
  const visor = new THREE.Group();
  helmet.add(sphere(.15, 1.04, .70, .93, materials.cloth));
  visor.add(box(0.211, 0.105, 0.051, materials.edge, 0, -0.012, 0.135));
  visor.add(box(0.178, 0.017, 0.017, materials.cloth, 0, 0.013, 0.165));
  for (let i = -2; i <= 2; i++) visor.add(box(.009, .039, .012, materials.cloth, i * .028, -.037, .163));
  helmet.add(visor);
  const crest = new THREE.Group();
  for (const side of [-1, 1]) {
    const cheek = box(0.028, 0.137, 0.14, materials.steel, side * 0.118, -0.048, 0.094);
    cheek.rotation.z = side * 0.18;
    helmet.add(cheek);
    const hinge = sphere(.024, 1, 1, .6, materials.edge);
    hinge.position.set(side * .111, .005, .146);
    helmet.add(hinge);
  }
  crest.add(box(0.025, 0.107, 0.227, materials.edge, 0, 0.143, -0.018));
  const ridge = box(.183,.037,.078,materials.edge,0,.07,.130);
  ridge.rotation.x = -.16;
  helmet.add(crest, ridge);
  attach('Head', helmet, 0, 0.037, 0.015);
  f.headMeshes.push(helmet);
  const wrap = new THREE.Group();
  const clothCap = sphere(.125, .89, .67, 1.03, materials.cloth);
  clothCap.position.set(0,.066,-.018);
  wrap.add(clothCap, box(.197,.030,.025,materials.edge,0,.041,.079));
  attach('Head', wrap, 0, .035, .015, 'lightCloth');
  f.headMeshes.push(wrap);
  const cap = new THREE.Group();
  const padding = sphere(.126, .94, .64, 1.02, materials.cloth);
  padding.position.set(0,.071,-.022);
  const brim = sphere(.133, 1.03, .16, 1.08, materials.edge);
  brim.position.set(0,.048,-.015);
  cap.add(padding, brim);
  attach('Head', cap, 0, .047, .016, 'lightCloth');
  f.headMeshes.push(cap);

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
  const skirt = box(0.143, 0.18, 0.031, materials.cloth, 0, -0.19, 0.116);
  waist.add(skirt, box(0.075, 0.06, 0.037, materials.edge, 0, -0.087, 0.158));
  attach('spine_01', waist, 0, 0, 0.028);
  const harness = new THREE.Group(), straps = new THREE.MeshStandardMaterial({color:0x463024, roughness:.9});
  const strap = box(.043,.397,.024,straps,.020,.071,.125);
  strap.rotation.z = -.63;
  harness.add(strap, box(.058,.049,.021,materials.edge,-.028,.027,.153));
  attach('spine_02', harness, 0, .018, .035, 'lightCloth');
  forgeInjuryMaterial(f, straps);
  const shoulders = [];
  for (const side of ['l', 'r']) {
    const shield = new THREE.Group();
    const dome = sphere(.118, 1.16, .62, 1.06, materials.steel);
    dome.rotation.z = side === 'l' ? .26 : -.26;
    shield.add(dome);
    for (let i = 0; i < 3; i++) {
      const rim = sphere(.107 - i * .012, 1, .29, .88, i === 0 ? materials.edge : materials.steel);
      rim.position.set(0, -.027 - i * .043, .010);
      shield.add(rim);
    }
    shoulders.push(shield);
    attach('upperarm_' + side, shield, 0, 0.042, 0);
    const knee = sphere(0.092, 0.90, 1.28, 0.65, materials.edge);
    attach('calf_' + side, knee, 0, -0.035, 0.074);
    const bracer = sphere(.070, .89, 1.56, .86, straps);
    attach('lowerarm_' + side, bracer, 0, -.105, .005, 'both');
    const cuff = sphere(.074, .90, .27, .87, materials.edge);
    attach('lowerarm_' + side, cuff, 0, -.065, .005, 'both');
  }
  f.root.position.copy(snap);
  f.root.quaternion.copy(direction);
  f.root.updateMatrixWorld(true);
  f.forgeArmor = { materials, helmet, crest, ridge, visor, shoulders, wrap, cap };
}

function forgeLight(scene) {
  const warm = new THREE.DirectionalLight(0xffb17b, 0.52);
  warm.position.set(-8, 6, -9);
  const cool = new THREE.DirectionalLight(0xa0bbec, 0.43);
  cool.position.set(8, 8, 9);
  scene.add(warm, cool);
  const brass = new THREE.MeshStandardMaterial({ color: 0x875232, metalness: 0.62, roughness: 0.46 });
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

let forgeGroundMark;

function forgeGroundShadow(fighter) {
  const scene = fighter.root.parent;
  if (!scene?.isScene) return;
  if (!fighter.forgeShadow) {
    if (!forgeGroundMark) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const g = canvas.getContext('2d');
      const alpha = g.createRadialGradient(32, 32, 4, 32, 32, 31);
      alpha.addColorStop(0, 'rgba(9, 7, 10, .77)');
      alpha.addColorStop(.52, 'rgba(9, 7, 10, .46)');
      alpha.addColorStop(1, 'rgba(9, 7, 10, 0)');
      g.fillStyle = alpha;
      g.fillRect(0, 0, 64, 64);
      forgeGroundMark = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.12),
        new THREE.MeshBasicMaterial({map: arenaTex(canvas), transparent: true, depthWrite: false}));
      forgeGroundMark.rotation.x = -Math.PI / 2;
    }
    fighter.forgeShadow = forgeGroundMark.clone();
    scene.add(fighter.forgeShadow);
  }
  fighter.forgeShadow.position.set(fighter.x, .014, fighter.z);
  fighter.forgeShadow.rotation.z = -fighter.face;
  fighter.forgeShadow.scale.setScalar(fighter.act === 'dead' ? 1.22 : 1);
  fighter.forgeShadow.visible = fighter.root.visible && !fighter.gone;
}

function forgeFloorMaterial() {
  const canvas = document.createElement('canvas'), relief = document.createElement('canvas');
  const size = 512;
  canvas.width = canvas.height = relief.width = relief.height = size;
  const g = canvas.getContext('2d'), h = relief.getContext('2d');
  g.fillStyle = '#211e25';
  g.fillRect(0, 0, size, size);
  h.fillStyle = '#252525';
  h.fillRect(0, 0, size, size);
  let seed = 12304;
  const next = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let row = 0; row < 12; row++) {
    for (let col = -1; col < 8; col++) {
      const x = col * 73 + (row % 2) * 36, y = row * 44;
      const shade = Math.round(36 + next() * 22);
      const stone = ctx => {
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 5);
        ctx.lineTo(x + 67, y + 2);
        ctx.lineTo(x + 70, y + 8);
        ctx.lineTo(x + 68, y + 38);
        ctx.lineTo(x + 63, y + 42);
        ctx.lineTo(x + 5, y + 40);
        ctx.lineTo(x + 2, y + 34);
        ctx.closePath();
        ctx.fill();
      };
      const tone = g.createLinearGradient(x, y, x + 36, y + 44);
      tone.addColorStop(0, `rgb(${shade + 14},${shade + 7},${shade + 4})`);
      tone.addColorStop(1, `rgb(${shade},${shade - 4},${shade - 2})`);
      g.fillStyle = tone;
      stone(g);
      h.fillStyle = '#a7a7a7';
      stone(h);
    }
  }
  for (let i = 0; i < 7500; i++) {
    const x = next() * size, y = next() * size;
    g.fillStyle = i % 2 ? '#dea27118' : '#0f101632';
    h.fillStyle = i % 2 ? '#eeeeee16' : '#05050522';
    g.fillRect(x, y, 1 + next() * 2, 1);
    h.fillRect(x, y, 2, 1);
  }
  const repeats = [3.5, 3.5];
  const bumpMap = arenaTex(relief, repeats);
  bumpMap.encoding = THREE.LinearEncoding;
  return { map: arenaTex(canvas, repeats), bumpMap, bumpScale: .135, metalness: .07, roughness: .79 };
}
