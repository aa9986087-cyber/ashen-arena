'use strict';
/* Sword duel — the weapons. Each is built from simple meshes (grip at the origin, striking end along +Y, like the
   sword) and carries how it fights, as multipliers on the sword's moves (DM):
   reach, damage, speed (>1 = slower swings), stamina cost, how often it takes limbs off, how much blood, how much a
   block costs the defender, knock-back, how long a hit stuns. `hit` is the striking part (local y from..to). */
function duelSteel(c) {
  return new THREE.MeshStandardMaterial({ color: c || 0xdfe5ec, metalness: 0.75, roughness: 0.3 });
}
const duelWood = () => new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.85 });
const duelLeather = () => new THREE.MeshStandardMaterial({ color: 0x2e1c10, roughness: 0.9 });
/** A flat, bevelled steel piece from a 2D outline (x across, y along the haft). */
function duelPlate(pts, mat, depth) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {
    depth: depth || 0.01,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 1,
    curveSegments: 4,
  });
  g.translate(0, 0, -(depth || 0.01) / 2);
  return new THREE.Mesh(g, mat);
}
const duelRod = (r0, r1, y0, y1, mat, seg = 8) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, seg), mat);
  m.position.y = (y0 + y1) / 2;
  return m;
};
/** A bearded war axe: a crescent bit on a wooden haft, a spike behind. */
function duelAxe() {
  const g = new THREE.Group(),
    steel = duelSteel(0xcfd5dc),
    wood = duelWood();
  g.add(duelRod(0.024, 0.02, -0.16, 0.92, wood));
  const grip = duelRod(0.027, 0.027, -0.1, 0.12, duelLeather());
  g.add(grip);
  // the bit: a crescent edge that sweeps down into a beard
  const bit = duelPlate(
    [
      [0.02, 0.86],
      [0.12, 0.88],
      [0.22, 0.97],
      [0.27, 0.86],
      [0.27, 0.72],
      [0.22, 0.6],
      [0.15, 0.55],
      [0.11, 0.66],
      [0.02, 0.72],
    ],
    steel,
    0.014
  );
  g.add(bit);
  const spike = duelPlate(
    [
      [-0.02, 0.84],
      [-0.12, 0.8],
      [-0.02, 0.75],
    ],
    steel,
    0.016
  );
  g.add(spike);
  const cap = duelRod(0.03, 0.03, 0.7, 0.9, steel);
  g.add(cap);
  return g;
}
/** A war spear: a long ash shaft, a leaf blade on a socket, a butt spike (held a third of the way up). */
function duelSpear() {
  const g = new THREE.Group(),
    steel = duelSteel(),
    wood = duelWood();
  g.add(duelRod(0.018, 0.016, -0.62, 1.34, wood));
  g.add(duelRod(0.021, 0.021, -0.1, 0.14, duelLeather()));
  g.add(duelRod(0.022, 0.016, 1.3, 1.4, steel)); // socket
  const tip = duelPlate(
    [
      [0, 1.38],
      [0.045, 1.47],
      [0.03, 1.62],
      [0, 1.72],
      [-0.03, 1.62],
      [-0.045, 1.47],
    ],
    steel,
    0.012
  );
  g.add(tip);
  const butt = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 6), steel);
  butt.rotation.x = Math.PI;
  butt.position.y = -0.66;
  g.add(butt);
  return g;
}
/** A flanged mace: a short haft, a steel head ringed with flanges, a spike on top. */
function duelMace() {
  const g = new THREE.Group(),
    steel = duelSteel(0xb9bec6);
  g.add(duelRod(0.022, 0.02, -0.14, 0.64, duelWood()));
  g.add(duelRod(0.026, 0.026, -0.1, 0.12, duelLeather()));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), steel);
  head.position.y = 0.72;
  g.add(head);
  for (let i = 0; i < 7; i++) {
    const f = duelPlate(
      [
        [0.03, 0.62],
        [0.1, 0.68],
        [0.1, 0.78],
        [0.03, 0.84],
      ],
      steel,
      0.012
    );
    f.rotation.y = (i / 7) * Math.PI * 2;
    g.add(f);
  }
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 6), steel);
  spike.position.y = 0.86;
  g.add(spike);
  g.add(duelRod(0.03, 0.03, -0.17, -0.12, steel)); // pommel
  return g;
}
const DUEL_WEAPONS = {
  sword: {
    n: 'السيف',
    i: '⚔️',
    tip: 'متوازن',
    build: () => duelSword(),
    hit: [0.2, 1.07],
    reach: 1,
    dmg: 1,
    spd: 1,
    st: 1,
    cut: 1,
    blood: 1,
    block: 1,
    kb: 1,
    stun: 1,
    snd: 'blade',
  },
  axe: {
    n: 'الفأس',
    i: '🪓',
    tip: 'ضرر أعلى · يقطع الأطراف · أبطأ',
    build: duelAxe,
    hit: [0.55, 0.98],
    reach: 0.97,
    dmg: 1.28,
    spd: 1.15,
    st: 1.2,
    cut: 1.7,
    blood: 1.35,
    block: 1.4,
    chip: 0.15, // even a blocked axe bites a little
    kb: 1.1,
    stun: 1.1,
    snd: 'axe',
  },
  spear: {
    n: 'الرمح',
    i: '🔱',
    tip: 'أطول مدى · أسرع · ضرر أقل',
    build: duelSpear,
    hit: [0.7, 1.72],
    reach: 1.3,
    dmg: 0.85,
    spd: 0.88,
    st: 0.9,
    cut: 0.45,
    blood: 0.9,
    block: 0.9,
    kb: 1.5,
    stun: 1,
    arc: 0.8,
    snd: 'spear',
  },
  mace: {
    n: 'المطرقة',
    i: '🔨',
    tip: 'تسحق الصد والعظام · تطيّح أطول',
    build: duelMace,
    hit: [0.45, 0.9],
    reach: 0.92,
    dmg: 1.12,
    spd: 1.08,
    st: 1.1,
    cut: 0, // crushes, never cuts
    blood: 0.55,
    block: 2,
    kb: 1.3,
    stun: 1.35,
    snd: 'mace',
  },
};
const DUEL_WEAPON_IDS = Object.keys(DUEL_WEAPONS);
/** The moves of a fighter holding weapon W: the sword's (DM) scaled by the weapon. */
function duelMoves(W) {
  const scale = M => ({
    ...M,
    t: M.t * W.spd,
    hitFrom: M.hitFrom * W.spd,
    hitTo: M.hitTo * W.spd,
    dmg: M.dmg * W.dmg,
    st: M.st * W.st,
    reach: M.reach * W.reach,
    arc: M.arc * (W.arc || 1),
  });
  return { light: scale(DM.light), heavy: scale(DM.heavy), kick: DM.kick, dodge: DM.dodge };
}
