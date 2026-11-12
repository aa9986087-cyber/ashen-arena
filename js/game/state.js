'use strict';
/* Run state (G), input state (IN), and derived player stats. */
let G = null;
const IN = { k: {}, md: false, atk: false, mx: 0, mz: 0, sx: 0, sy: 0, joy: null, jx: 0, jz: 0, touch: false };
function newRun() {
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
    buffT: 0,
    buff: {},
    rerolls: S.tree.U2 ? 2 : 0,
    revives: 0,
    cardMode: '',
    achT: 0,
    ups: {},
    pacts: {},
    weapons: [{ id: ch.wep, lvl: 1, cd: 0.3 }],
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
    allies: [],
    defer: [],
    tm: { bolt: 1.5, nova: 2, meteor: 2.5, aura: 0 },
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
  p.dmgMul = ch.dmg * (1 + 0.12 * L('dmg')) * (1 + 0.06 * (pm.dmg || 0)) * (S.tree.A1 ? 1.1 : 1);
  p.aspd = 1 + 0.1 * L('aspd');
  p.crit = 0.05 + ch.crit + 0.07 * L('crit') + (S.tree.A2 ? 0.1 : 0);
  p.area = 1 + 0.1 * L('area');
  p.multi = L('multi');
  p.speed = ch.spd * (1 + 0.08 * L('speed')) * (1 + 0.03 * (pm.spd || 0));
  p.regen = 0.6 * L('regen') + (S.tree.D2 ? 1 : 0);
  p.armor = Math.min(0.4, 0.08 * L('armor'));
  p.shieldMax = L('shield') ? 12 + 14 * L('shield') : 0;
  p.magnet = 3.2 * (1 + 0.35 * L('magnet')) * (1 + 0.1 * (pm.mag || 0));
  p.dashMax = 2.2 * (1 - 0.2 * L('dash'));
  p.dashLen = 6 * (1 + 0.3 * L('dashlen'));
  p.xpMul = 1 + 0.08 * (pm.xp || 0);
  p.goldMul = 1 + 0.1 * (pm.gold || 0);
  p.taken = 1;
  p.leech = 0;
  p.enemyMul = 1;
  p.critMul = 2;
  G.pacts = G.pacts || {};
  for (const k in G.pacts) if (G.pacts[k] && PACT[k]) PACT[k].f(p);
  p.maxHp = Math.round(p.maxHp);
  if (p.hp > p.maxHp) p.hp = p.maxHp;
  const na = L('army') ? 1 + L('army') : 0;
  while (G.allies.length < na)
    G.allies.push({ x: p.x + rand(-2, 2), z: p.z + rand(-2, 2), cd: rand(0, 0.8), face: 0, t: Math.random() * 9 });
}
