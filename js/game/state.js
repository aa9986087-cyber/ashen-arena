'use strict';
/* Run state (G), input state (IN), and derived player stats. */
let G = null;
const IN = { k: {}, md: false, atk: false, mx: 0, mz: 0, sx: 0, sy: 0, joy: null, jx: 0, jz: 0, touch: false };
function newRun() {
  vfxClear();
  const ch = CHARS[S.char];
  G = {
    state: 'menu',
    t: 0,
    kills: 0,
    coins: 0,
    lvl: 1,
    xp: 0,
    need: xpNeed(1),
    pending: 0,
    stage: 0,
    wave: 0,
    waveT: 0,
    sk: 0, // enemies defeated this stage (the countdown to its boss)
    bossDone: false,
    cycle: 0,
    bossOn: false,
    bossesRun: 0,
    abyss: false,
    depth: 0,
    won: false,
    bossName: '',
    spawnAcc: 0,
    ringT: 10,
    shake: 0,
    slow: 0,
    superT: 0,
    specCd: 0,
    potCd: 0, // the short gap between two potions
    pots: 0, // healing potions carried (none at the start)
    contactCd: 0, // bodies touching you: one blow at most every CONTACT_CD
    buffT: 0,
    buff: {},
    rerolls: (S.tree.U2 ? 2 : 0) + (S.tree.U4 ? 1 : 0),
    revives: S.tree.D5 ? 1 : 0,
    cardMode: '',
    achT: 0,
    ups: {},
    pacts: {},
    weapons: [{ id: ch.wep, lvl: S.tree.A5 ? 2 : 1, cd: 0.3 }],
    enemies: [],
    shots: [],
    eshots: [],
    picks: [],
    parts: [],
    texts: [],
    rings: [],
    zones: [],
    bolts: [],
    slashes: [],
    corpses: [],
    allies: [],
    defer: [],
    tm: {
      bolt: 1.5,
      nova: 2,
      meteor: 2.5,
      aura: 0,
      poison: 2,
      hole: 4,
      tslow: 6,
      drone: 0,
      spikes: 0,
      mines: 2,
      firering: 3,
      magic: 1,
      blades: 1,
      turret: 3,
      skystrike: 2,
      guardian: 4,
      frostnova: 3,
      regenburst: 5,
      whirl: 2,
      starfall: 3,
      timewarp: 6,
      clones: 0,
    },
    clouds: [],
    holes: [],
    tslowT: 0,
    droneA: 0,
    mines: [],
    calmT: 0,
    resumeT: 0, // after the cards: the slow-motion ease back to full speed
    countT: 0,
    turrets: [],
    shockN: 0,
    lust: 0,
    lustT: 0,
    secondT: 0,
    phoenixUsed: 0,
    warpT: 0,
    cloneA: 0,
    orbitA: 0,
    p: {
      x: 0,
      z: 0,
      hp: 1,
      maxHp: 1,
      shield: 0,
      shieldMax: 0,
      shieldRe: 0,
      inv: 0,
      dashT: 0,
      dashCd: 0,
      dx: 0,
      dz: 1,
      face: 0,
      aim: 0,
      swing: 0,
      walk: 0,
      moving: 0,
      legCount: 0,
      r: 0.6,
    },
  };
  if (S.tree.A3) G.ups.multi = 1;
  if (S.tree.D3) G.ups.shield = 1;
  recalc();
  G.p.hp = G.p.maxHp;
  G.p.shield = G.p.shieldMax;
}
const xpNeed = l => Math.floor(5 + l * 5 + Math.pow(l, 1.75));
function recalc() {
  const p = G.p,
    u = G.ups,
    ch = CHARS[S.char],
    pm = S.perm,
    L = k => u[k] || 0;
  p.maxHp = ch.hp + (pm.hp || 0) * 10 + (S.tree.D1 ? 20 : 0) + L('hp') * 18;
  // permanent bonuses (shop + skill tree) add up with each other, so each shows exactly what it says;
  // the run's cards multiply on top
  p.dmgMul =
    ch.dmg *
    (1 + 0.06 * (pm.dmg || 0) + (S.tree.A1 ? 0.1 : 0)) *
    (1 + 0.12 * L('dmg')) *
    (1 + 0.08 * (typeof pathMasteries === 'function' && G.ups ? pathMasteries() : 0)); // path masteries
  p.aspd = 1 + 0.1 * L('aspd');
  p.crit = 0.05 + ch.crit + 0.07 * L('crit') + (S.tree.A2 ? 0.1 : 0);
  p.area = 1 + 0.1 * L('area');
  p.multi = L('multi');
  p.speed = ch.spd * (1 + 0.08 * L('speed')) * (1 + 0.03 * (pm.spd || 0));
  p.regen = 1 * L('regen') + (S.tree.D2 ? 1 : 0);
  p.armor = Math.min(0.4, 0.08 * L('armor'));
  p.shieldMax = L('shield') ? 12 + 14 * L('shield') : 0;
  p.magnet = 3.2 * (1 + 0.1 * (pm.mag || 0) + (S.tree.W3 ? 0.25 : 0)) * (1 + 0.35 * L('magnet'));
  p.dashMax = 2.2 * (1 - 0.2 * L('dash')) * (S.tree.S2 ? 0.85 : 1);
  p.dashLen = 6 * (1 + 0.3 * L('dashlen'));
  p.xpMul = (1 + 0.08 * (pm.xp || 0) + (S.tree.W2 ? 0.1 : 0)) * (1 + 0.1 * L('xp'));
  p.goldMul = (1 + 0.1 * (pm.gold || 0) + (S.tree.W1 ? 0.1 : 0)) * (1 + 0.15 * L('coins'));
  p.taken = S.tree.D4 ? 0.9 : 1;
  p.leech = 0;
  p.enemyMul = 1;
  p.critMul = 2;
  G.pacts = G.pacts || {};
  for (const k in G.pacts) if (G.pacts[k] && PACT[k]) PACT[k].f(p);
  if (S.tree.A4) p.critMul += 0.5;
  // expansion 2 stat upgrades
  p.critMul += 0.3 * L('critdmg');
  p.pspd = 1 + 0.15 * L('pspeed');
  p.pierceAdd = L('pierce');
  p.sizeMul = 1 + 0.2 * L('size');
  p.cdr = 1 - 0.1 * L('cdr');
  p.dashMax *= p.cdr;
  p.kbMul = 1 + 0.4 * L('kb');
  p.iframe = 0.15 * L('iframe');
  p.bossMul = 1 + 0.2 * L('bossdmg');
  p.maxHp = Math.round(p.maxHp);
  if (p.hp > p.maxHp) p.hp = p.maxHp;
  const na = L('army') ? 1 + L('army') : 0;
  while (G.allies.length < na)
    G.allies.push({ x: p.x + rand(-2, 2), z: p.z + rand(-2, 2), cd: rand(0, 0.8), face: 0, t: Math.random() * 9 });
}
