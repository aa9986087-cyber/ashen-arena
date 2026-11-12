'use strict';
/* Enemy and boss spawning, wave timing. */
function gwave() {
  return G.abyss ? 36 + G.depth * 6 + G.wave : G.cycle * 36 + G.stage * 6 + G.wave;
}
function spawn(type, x, z, elite) {
  const d = EN[type],
    gw = gwave(),
    hm =
      (1 + gw * 0.24) *
      Math.pow(1.05, gw) *
      (1 + G.cycle * 1.5) *
      (1 + Math.max(0, G.lvl - 10) * 0.04) *
      (G.p.enemyMul || 1) *
      (elite ? 4.5 : 1);
  const r = Math.hypot(x, z);
  if (r > ARENA + 3) {
    x *= (ARENA + 3) / r;
    z *= (ARENA + 3) / r;
  }
  const e = {
    type,
    x,
    z,
    kx: 0,
    kz: 0,
    hp: d.hp * hm,
    maxHp: d.hp * hm,
    r: d.r * (elite ? 1.3 : 1),
    spd: d.spd * (1 + Math.min(gw, 40) * 0.012),
    dmg: d.dmg * 1.25 * (1 + gw * 0.07) * Math.pow(1.018, gw) * (G.p.enemyMul || 1) * (elite ? 1.5 : 1),
    xp: d.xp * (elite ? 6 : 1),
    scale: d.sc * (elite ? 1.35 : 1),
    elite: !!elite,
    t: Math.random() * 9,
    cd: rand(1, 3),
    st: 0,
    stT: 0,
    flash: 0,
    hitCd: 0,
    oCd: 0,
    aCd: 0,
    burn: 0,
    bAcc: 0,
    face: 0,
    slot: Math.random() * TAU,
    side: Math.random() < 0.5 ? 1 : -1,
    flank: (type === 'grunt' || type === 'shield') && gw >= 2 && Math.random() < 0.45,
    dead: false,
  };
  G.enemies.push(e);
  return e;
}
/** Spawn n enemies of a type scattered within ±r of (x,z). */
function spawnPack(type, n, x, z, r) {
  for (let j = 0; j < n; j++) spawn(type, x + rand(-r, r), z + rand(-r, r));
}
function spawnAround(type, elite, dist) {
  const p = G.p,
    a = Math.random() * TAU,
    d = dist || rand(21, 27);
  return spawn(type, p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, elite);
}
function pickType(gw) {
  const w = [['grunt', 10]];
  if (gw >= 1) w.push(['fast', 4 + Math.min(gw * 0.2, 4)]);
  if (gw >= 2) w.push(['archer', 3 + Math.min(gw * 0.15, 3)]);
  if (gw >= 4) w.push(['shield', 3 + Math.min(gw * 0.15, 3)]);
  if (gw >= 7) w.push(['brute', 0.6 + Math.min(gw * 0.05, 1.4)]);
  if (gw >= 3) w.push(['wolf', 1.6]);
  if (gw >= 5) w.push(['bomber', 2.4]);
  if (gw >= 6) w.push(['mage', 2]);
  if (gw >= 8) w.push(['shaman', 1.2]);
  if (gw >= 4) w.push(['runner', 2.2]);
  if (gw >= 14) w.push(['golem', 0.35 + Math.min(gw * 0.02, 0.8)]);
  let tot = 0;
  for (const x of w) tot += x[1];
  let r = Math.random() * tot;
  for (const x of w) {
    r -= x[1];
    if (r <= 0) return x[0];
  }
  return 'grunt';
}
function spawnBoss() {
  const k = G.forceBoss != null ? G.forceBoss : G.abyss ? (Math.random() * 6) | 0 : STAGES[G.stage].bk,
    p = G.p,
    a = Math.random() * TAU,
    si = G.abyss ? 6 + G.depth * 0.7 : G.stage;
  G.bossName = G.forceBoss != null ? bossNameOf(k) : G.abyss ? 'ظلّ ' + bossNameOf(k) : STAGES[G.stage].boss;
  const hp = 2200 * 1.35 * Math.pow(1.55, si) * (1 + G.cycle * 3);
  const e = spawn('brute', p.x + Math.cos(a) * 20, p.z + Math.sin(a) * 20, false);
  Object.assign(e, {
    boss: true,
    kind: k,
    hp: hp * (G.p.enemyMul || 1),
    maxHp: hp * (G.p.enemyMul || 1),
    r: 2.1,
    spd: [3.3, 3, 4.2, 2.6, 3.2, 3.6][k],
    dmg: (20 + si * 5) * 1.2 * (1 + G.cycle * 0.8),
    xp: 120,
    scale: 2.4,
    a1: 3,
    a2: 6,
    a3: 9,
    a4: 2,
    ult: 14,
    ultT: 0,
    leaps: 0,
    spiral: 0,
    spAcc: 0,
    spA: 0,
    burst: 0,
    lx: 0,
    lz: 0,
    y: 0,
  });
  G.bossOn = true;
  G.boss = e;
  bossMesh.geometry = GEO['boss' + k];
  bossMesh.visible = true;
  $('bossbar').hidden = false;
  $('bossbar').querySelector('span').textContent = G.bossName;
  MUS.boss = true;
  AU.play('boss');
  shake(0.8);
  banner(G.bossName, 'الزعيم وصل. اقرأ هجماته وراوغ الدوائر الحمراء.', 3);
}
function updWaves(dt) {
  const p = G.p,
    gw = gwave(),
    cap = S.set.qual ? 170 : 100;
  if (!G.bossOn && !(G.bossReward > 0) && !G.noWaves) {
    G.waveT += dt;
    if (G.waveT >= 28) {
      G.waveT = 0;
      G.wave++;
      if (G.wave >= 6) {
        G.wave = 5;
        spawnBoss();
      } else {
        banner('الموجة ' + (G.wave + 1), G.wave === 2 || G.wave === 4 ? 'عدو قوي يقترب' : '', 1.8);
        if (G.wave === 2 || G.wave === 4) {
          const e = spawnAround('brute', true);
          e.mini = true;
          AU.play('boss');
        }
      }
    }
  }
  const rate = Math.min(1 + gw * 0.24, 10) * (G.bossOn ? 0.4 : 1) * (G.abyss ? 1.25 : 1);
  G.spawnAcc += G.noWaves ? 0 : dt * rate;
  while (G.spawnAcc >= 1) {
    G.spawnAcc -= 1;
    if (G.enemies.length >= cap) continue;
    const t = pickType(gw),
      e0 = spawnAround(t, gw >= 3 && Math.random() < Math.min(0.03 + gw * 0.008, 0.25));
    if (t === 'wolf') spawnPack('wolf', 2, e0.x, e0.z, 2);
    if (t === 'runner' && Math.random() < 0.5) spawnPack('runner', 1, e0.x, e0.z, 2);
  }
  G.ringT -= G.noWaves ? 0 : dt;
  if (G.ringT <= 0 && gw >= 2 && !G.bossOn) {
    G.ringT = rand(13, 19);
    if (G.enemies.length < cap - 14) {
      const n = 8 + Math.min(gw, 10),
        a0 = Math.random() * TAU,
        t = gw >= 6 && Math.random() < 0.4 ? 'fast' : 'grunt';
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * TAU,
          e = spawn(t, p.x + Math.cos(a) * 17, p.z + Math.sin(a) * 17);
        e.flank = false;
      }
      text(p.x, p.z - 2, 'محاصرة!', '#ff7060', true);
    }
  }
}
