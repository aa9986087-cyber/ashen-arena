'use strict';

// IDs are stable in the save and in room snapshots.
const FORGE_WEAPON_DATA = {
  sword:     ['السيف المستقيم', '⚔️', 'edge', 0.20, 1.07, 1.00, 1.00, 1.00, 1.00, 0.054, 0.00, 'blade'],
  sabre:     ['سيف الحرس', '🗡️', 'edge', 0.20, 1.10, 0.92, 0.94, 0.94, 0.94, 0.060, 0.02, 'blade'],
  claymore:  ['كلايمور', '⚔️', 'edge', 0.25, 1.34, 1.29, 1.28, 1.29, 1.28, 0.076, 0.00, 'blade'],
  greatsword:['السيف العريض', '🗡️', 'edge', 0.22, 1.25, 1.21, 1.35, 1.21, 1.27, 0.072, 0.00, 'blade'],
  axe:       ['فأس المعركة', '🪓', 'edge', 0.67, 0.98, 1.23, 1.23, 1.16, 1.29, 0.127, 0.10, 'axe'],
  hatchet:   ['الفأس القصيرة', '🪓', 'edge', 0.44, 0.72, 0.94, 0.92, 0.92, 0.99, 0.097, 0.10, 'axe'],
  greataxe:  ['الفأس المزدوجة', '🪓', 'edge', 0.83, 1.18, 1.42, 1.42, 1.38, 1.38, 0.145, 0.13, 'axe'],
  scythe:    ['منجل الحرب', '🌙', 'edge', 1.03, 1.40, 1.25, 1.18, 1.27, 1.14, 0.15, 0.23, 'blade'],
  dagger:    ['الخنجر', '🗡️', 'point', 0.15, 0.53, 0.72, 0.63, 0.70, 0.78, 0.064, 0.00, 'blade'],
  dirk:      ['الخنجر الطويل', '🗡️', 'point', 0.16, 0.62, 0.80, 0.74, 0.79, 0.87, 0.068, 0.00, 'blade'],
  spear:     ['الرمح', '🔱', 'point', 1.31, 1.76, 1.04, 0.87, 1.05, 1.08, 0.061, 0.02, 'spear'],
  mace:      ['المطرقة الحديدية', '🔨', 'blunt', 0.63, 0.91, 1.17, 1.13, 1.16, 1.31, 0.133, 0.11, 'mace'],
  warhammer: ['مطرقة مزدوجة', '🔨', 'blunt', 0.78, 1.13, 1.43, 1.36, 1.45, 1.43, 0.178, 0.00, 'mace'],
};
const FORGE_CATEGORIES = { all: 'الكل', edge: 'قطع', point: 'طعن', blunt: 'طرق' };
const forgeGearURL = MODEL_DIR.replace(/models\/$/, 'iron-duel/');
let forgeGearPromise = null, forgeModels = null, forgeFigureTemplate = null;
const forgeThumbs = new Map();

function forgeLoadGear() {
  if (forgeGearPromise) return forgeGearPromise;
  const load = async file => {
    const response = await fetch(forgeGearURL + file + '?v=39');
    if (!response.ok) throw new Error('Gear file: ' + file);
    const bytes = await response.arrayBuffer();
    return new Promise((ok, bad) => new THREE.GLTFLoader().parse(bytes, '', ok, bad));
  };
  forgeGearPromise = Promise.all([load('weapons.glb'), load('figures.glb')]).then(([weapons, figure]) => {
    forgeModels = weapons.scene;
    forgeFigureTemplate = figure.scene;
    for (const id of Object.keys(FORGE_WEAPON_DATA)) {
      if (!forgeModels.getObjectByName(id)) throw new Error('Weapon missing: ' + id);
    }
    forgeModels.updateMatrixWorld(true);
  }).catch(error => {
    forgeGearPromise = null;
    throw error;
  });
  return forgeGearPromise;
}

function forgeWeaponModel(id) {
  const template = forgeModels?.getObjectByName(id);
  if (!template) throw new Error('Gear has not loaded: ' + id);
  const weapon = template.clone(true);
  weapon.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.material = mesh.material.clone();
    if (/steel/i.test(mesh.material.name) && !weapon.userData.steel) {
      weapon.userData.steel = mesh.material;
    }
  });
  if (!weapon.userData.steel) {
    weapon.traverse(mesh => {
      if (mesh.isMesh && !weapon.userData.steel) weapon.userData.steel = mesh.material;
    });
  }
  return weapon;
}

for (const [id, record] of Object.entries(FORGE_WEAPON_DATA)) {
  const [n, i, category, start, tip, spd, dmg, st, mass, radius, shift, snd] = record;
  const thrust = category === 'point', blunt = category === 'blunt';
  DUEL_WEAPONS[id] = {
    n, i, category, build: () => forgeWeaponModel(id), hit: [start, tip],
    contact: [[shift * 0.72, start, 0], [shift, tip, 0]], thrust, radius, mass,
    tip: thrust ? 'طعن مباشر' : blunt ? 'يضغط على الصد' : 'ضربة قاطعة',
    snd, spd, dmg, st, cut: blunt ? 0 : thrust ? 0.48 : 1.12,
    reach: Math.max(.54, (tip + .44) / 1.51), blood: blunt ? .53 : thrust ? .83 : 1.05,
    block: blunt ? 1.15 + mass * .50 : (snd === 'axe' ? 1.37 : 1),
    kb: .74 + mass * .32, stun: .70 + mass * .31, arc: thrust ? .76 : 1,
  };
}
DUEL_WEAPON_IDS.splice(0, DUEL_WEAPON_IDS.length, ...Object.keys(FORGE_WEAPON_DATA));

function forgeAttachFigure(fighter) {
  if (fighter.forgeFigure) return fighter.forgeFigure;
  if (!forgeFigureTemplate) throw new Error('Fighter asset unavailable');
  const legacy = [];
  let binding = null;
  fighter.root.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    mesh.userData.forgeWear = 'armored';
    legacy.push(mesh);
    if (mesh.geometry.attributes.position.count === 7281) binding = mesh.skeleton;
  });
  if (!binding) throw new Error('Compatible human skeleton unavailable');
  const pieces = [];
  forgeFigureTemplate.traverse(source => {
    if (!source.isSkinnedMesh) return;
    const bones = source.skeleton.bones.map(bone => binding.getBoneByName(bone.name));
    if (bones.some(b => !b)) throw new Error('Incomplete humanoid binding');
    const mesh = new THREE.SkinnedMesh(source.geometry, source.material.clone());
    mesh.name = 'Forge ' + source.material.name;
    mesh.userData.forgeWear = 'open';
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    fighter.root.add(mesh);
    mesh.bind(new THREE.Skeleton(bones, source.skeleton.boneInverses.map(i => i.clone())), source.bindMatrix.clone());
    if (source.material.name !== 'SkinArms') fighter.fpHide.push(mesh);
    if (/SkinHead|Eyes|Brows/.test(source.material.name)) fighter.headMeshes.push(mesh);
    pieces.push(mesh);
  });
  fighter.forgeFigure = { pieces, legacy };
  return fighter.forgeFigure;
}

function forgeIsEquipped(fighter, object) {
  const kind = object.userData.forgeWear;
  return !kind || kind === (FORGE_STYLES[fighter.forgeStyle]?.skin ? 'open' : 'armored');
}

function forgeFighterVisible(fighter, object, fp = false) {
  return !fp && !object.userData.cut && forgeIsEquipped(fighter, object);
}

function forgeStyleFigure(fighter, style) {
  if (style.skin) {
    const figure = forgeAttachFigure(fighter);
    for (const mesh of figure.pieces) {
      const part = mesh.material.name;
      if (part === 'SkinTorso') mesh.material.color.setHex(style.tunic ?? style.skin);
      else if (part.startsWith('Skin')) mesh.material.color.setHex(style.skin);
      else if (part === 'Trousers') mesh.material.color.setHex(style.trousers);
      else if (part === 'Waist') mesh.material.color.setHex(style.belt);
    }
  }
  const figure = fighter.forgeFigure;
  if (!figure) return;
  for (const mesh of [...figure.pieces, ...figure.legacy]) mesh.visible = forgeFighterVisible(fighter, mesh);
}

function forgeThumb(id) {
  if (forgeThumbs.has(id)) return forgeThumbs.get(id);
  const root = forgeModels?.getObjectByName(id);
  if (!root) return null;
  const points = [], faces = [];
  const angle = 0.57, c = Math.cos(angle), s = Math.sin(angle), v = new THREE.Vector3();
  const box = new THREE.Box3().setFromObject(root);
  const height = box.max.y - box.min.y, centre = (box.min.y + box.max.y) * 0.5;
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geo = mesh.geometry, g = geo.attributes.position;
    const first = points.length;
    for (let i = 0; i < g.count; i++) {
      v.fromBufferAttribute(g, i).applyMatrix4(mesh.matrixWorld);
      const x = v.x * c + (v.y - centre) * s;
      const y = -(v.y - centre) * c + v.x * s;
      points.push([x, y, v.z]);
    }
    const index = geo.index;
    const count = index ? index.count : g.count;
    const color = '#' + mesh.material.color.getHexString();
    for (let i = 0; i < count; i += 3) {
      const pp = [0,1,2].map(j => points[first + (index ? index.getX(i+j) : i+j)]);
      const normalZ = (pp[1][0]-pp[0][0])*(pp[2][1]-pp[0][1]) - (pp[2][0]-pp[0][0])*(pp[1][1]-pp[0][1]);
      if (normalZ < 0) faces.push({pp,color,depth:(pp[0][2]+pp[1][2]+pp[2][2])/3});
    }
  });
  const image = document.createElement('canvas');
  image.width = 192;
  image.height = 124;
  const ctx = image.getContext('2d');
  const scale = Math.min(132, 113 / height);
  for (const f of faces.sort((a,b)=>a.depth-b.depth)) {
    ctx.beginPath();
    f.pp.forEach(([x,y], i) => {
      x = x * scale + 91; y = y * scale + 62;
      if (i) ctx.lineTo(x,y); else ctx.moveTo(x,y);
    });
    ctx.closePath();
    ctx.fillStyle = f.color;
    ctx.fill();
  }
  const thumb = image.toDataURL();
  forgeThumbs.set(id, thumb);
  return thumb;
}

let forgeWeaponFilter = 'all';
function forgeWeaponPicker() {
  const box = $('dmWeapons');
  box.replaceChildren();
  const current = DUEL_WEAPONS[S.duelW] ? S.duelW : 'sword';
  const tabs = el('div', 'forgeWeaponTabs'), cards = el('div', 'forgeWeaponCards');
  for (const [id, label] of Object.entries(FORGE_CATEGORIES)) {
    const b = el('button', 'forgeWeaponTab' + (forgeWeaponFilter === id ? ' on' : ''), label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(forgeWeaponFilter === id));
    b.onclick = () => { forgeWeaponFilter = id; forgeWeaponPicker(); };
    tabs.append(b);
  }
  for (const id of DUEL_WEAPON_IDS) {
    const W = DUEL_WEAPONS[id];
    if (forgeWeaponFilter !== 'all' && W.category !== forgeWeaponFilter) continue;
    const b = el('button', 'forgeWeaponCard' + (id === current ? ' on' : ''));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(id === current));
    const pic = el('span', 'forgeWeaponVisual', W.i);
    pic.dataset.weapon = id;
    pic.setAttribute('aria-hidden','true');
    const detail = el('span','forgeWeaponDetail');
    detail.append(el('b','',W.n),el('small','',W.tip));
    const stats = el('div','forgeWeaponStats');
    for (const [name, amount] of [['المدى', W.hit[1]/1.76], ['السرعة',.72/W.spd], ['القوة',W.dmg/1.42]]) {
      const marker = el('span','forgeWeaponStat'), track = el('i');
      track.style.setProperty('--rate', Math.round(amount*100)+'%');
      marker.append(el('span','',name), track);
      stats.append(marker);
    }
    b.append(pic,detail,stats);
    b.onclick = () => {
      S.duelW = id;
      save();
      AU.play('select');
      forgeRefreshLoadout();
      forgeWeaponPicker();
    };
    cards.append(b);
  }
  box.append(tabs,cards);
  const draw = () => {
    for (const node of cards.querySelectorAll('[data-weapon]')) {
      const thumb = forgeThumb(node.dataset.weapon);
      if (!thumb) continue;
      node.replaceChildren();
      node.style.backgroundImage = 'url("' + thumb + '")';
    }
  };
  if (forgeModels) draw();
  else forgeLoadGear().then(draw).catch(() => {});
}
