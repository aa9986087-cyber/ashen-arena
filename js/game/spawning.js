'use strict';
/* Enemy and boss spawning, wave timing. */
function gwave() {
  return G.abyss ? 36 + G.depth * 6 + G.wave : G.cycle * 36 + G.stage * 6 + G.wave;
}
/* ---------- balance ---------- */
/** Enemies grow with the hero: from level 4, +4.5% health per level (cards stack up fast; without this a good
    player outgrows every wave). In co-op the team's average level would be fairer, but each spawn uses the host's. */
const lvlHp = () => 1 + Math.max(0, G.lvl - 5) * 0.045;
/** The first stage eases you in: enemies start at 65% health and damage and reach full strength by its last wave
    (gw 5), so the difficulty climbs smoothly from the first minute instead of jumping. */
const easeIn = gw => Math.min(1, 0.65 + gw * 0.07);
/** The first boss you ever meet is a little lighter (80%): a step up, not a wall. */
const bossEase = si => (si === 0 && !G.cycle ? 0.8 : 1);
/** Enemies coming in per second at wave gw (before the boss / abyss / co-op factors). */
const spawnRate = gw => Math.min(0.9 + gw * 0.27, 11);
/** Enemy damage: every enemy hits 1.2× its base, growing with the waves. */
const EN_DMG = 1.2;
function spawn(type, x, z, elite) {
  const d = EN[type],
    gw = gwave(),
    hm =
      (1 + gw * 0.24) *
      Math.pow(1.05, gw) *
      (1 + G.cycle * 1.5) *
      lvlHp() *
      easeIn(gw) *
      (G.p.enemyMul || 1) *
      COOP.hpMul * // co-op: tougher with every player
      (elite ? 4.5 : 1);
  const r = Math.hypot(x, z);
  if (r > ARENA + 3) {
    x *= (ARENA + 3) / r;
    z *= (ARENA + 3) / r;
  }
  const e = {
    nid: (G.nidC = (G.nidC || 0) + 1), // stable id: lets a live viewer follow each enemy between snapshots
    type,
    x,
    z,
    kx: 0,
    kz: 0,
    hp: d.hp * hm,
    maxHp: d.hp * hm,
    r: d.r * (elite ? 1.3 : 1),
    spd: d.spd * (1 + Math.min(gw, 40) * 0.012),
    dmg: d.dmg * EN_DMG * coopDmgF(gw) * easeIn(gw) * (elite ? 1.5 : 1),
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
  if (elite) {
    e.affix = pick(Object.keys(AFFIX));
    if (e.affix === 'ward') e.ward = e.wardMax = e.maxHp * 0.35;
  }
  G.enemies.push(e);
  return e;
}
/** Spawn n enemies of a type scattered within ±r of (x,z). */
function spawnPack(type, n, x, z, r) {
  for (let j = 0; j < n; j++) spawn(type, x + rand(-r, r), z + rand(-r, r));
}
function spawnAround(type, elite, dist) {
  const p = COOP.on ? coopAnchor() : G.p, // co-op: around one of the players, so each has a fight
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
/** The enemies to defeat in this stage before its boss: six waves, each a little bigger (and bigger with a
    co-op team, who also face more enemies). {total, ends: where each wave ends, waveAt(kills)}. */
function stageQuota() {
  const key = [G.abyss, G.stage, G.depth, G.cycle, COOP.cntMul].join();
  if (G.quota && G.quota.key === key) return G.quota;
  const base = gwave() - G.wave,
    ends = [];
  let t = 0;
  for (let w = 0; w < 6; w++) {
    // about as many as come in a wave's 28 s (the spawn rate), so the pace is what it was
    t += Math.round(Math.min(28 * spawnRate(base + w), 90) * COOP.cntMul);
    ends.push(t);
  }
  return (G.quota = {
    key,
    total: t,
    ends,
    waveAt: k =>
      Math.min(
        5,
        ends.findIndex(e => k < e)
      ),
  });
}
function spawnBoss() {
  const k = G.forceBoss != null ? G.forceBoss : G.abyss ? (Math.random() * 6) | 0 : STAGES[G.stage].bk,
    p = G.p,
    a = Math.random() * TAU;
  G.bossName = G.forceBoss != null ? bossNameOf(k) : G.abyss ? 'ظلّ ' + bossNameOf(k) : STAGES[G.stage].boss;
  makeBoss(k, p.x + Math.cos(a) * 20, p.z + Math.sin(a) * 20);
  AU.play('boss');
  shake(0.8);
  banner(G.bossName, 'الزعيم وصل. اقرأ هجماته وراوغ الدوائر الحمراء.', 3);
}
/** The boss of kind k at (x,z), quietly (co-op: a new host takes over the boss already fighting). */
function makeBoss(k, x, z) {
  const si = G.abyss ? 6 + G.depth * 0.7 : G.stage;
  const hp =
    2200 *
    1.35 *
    Math.pow(1.55, si) *
    (1 + G.cycle * 3) *
    COOP.bossMul *
    (1 + Math.max(0, G.lvl - 8) * 0.025) *
    bossEase(si);
  const e = spawn('brute', x, z, false);
  Object.assign(e, {
    boss: true,
    kind: k,
    hp: hp * (G.p.enemyMul || 1),
    maxHp: hp * (G.p.enemyMul || 1),
    r: 2.1,
    spd: [3.3, 3, 4.2, 2.6, 3.2, 3.6][k],
    dmg: (20 + si * 5) * 1.2 * (1 + G.cycle * 0.8) * bossEase(si),
    xp: 120,
    scale: [2.6, 2.3, 2.2, 2.5, 2.4, 2.7][k],
    a1: 3,
    a2: 6,
    a3: 9,
    a4: 2,
    ult: 16,
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
  if (CM.el) {
    CM.el.currentTime = 0;
    CM.kick();
  }
  return e;
}
function updWaves(dt) {
  const p = COOP.on ? coopAnchor() : G.p,
    gw = gwave(),
    cap = Math.min(240, (S.set.qual ? 170 : 100) * COOP.cntMul);
  if (G.calmT > 0) {
    G.calmT -= dt;
    return;
  }
  // the stage moves on by enemies defeated: each wave has its share, and when the count runs out the boss comes
  if (!G.bossOn && !(G.bossReward > 0) && !G.noWaves && !G.bossDone) {
    const Q = stageQuota();
    if (G.sk >= Q.total) {
      G.wave = 5;
      spawnBoss();
    } else {
      // a wave ends at its share of kills, or after 36 s at most (it never stalls when the killing is slow)
      G.waveT += dt;
      const w = Math.max(Q.waveAt(G.sk), G.waveT >= 36 ? Math.min(5, G.wave + 1) : 0);
      if (w > G.wave) {
        G.waveT = 0;
        G.wave = w;
        banner('الموجة ' + (G.wave + 1), G.wave === 2 || G.wave === 4 ? 'عدو قوي يقترب' : '', 1.8);
        // every two waves: a strong one with a special ability (from the second stage, one more beside it):
        // never more than two such enemies at a time
        if (G.wave === 2 || G.wave === 4) {
          const e = spawnAround('brute', true);
          e.mini = true;
          if (gwave() >= 8 && G.enemies.filter(q => q.elite && !q.dead && !q.boss).length < 2)
            spawnAround(pickType(gwave()), true);
          AU.play('boss');
        }
      }
    }
  }
  const rate = spawnRate(gw) * (G.bossOn ? 0.4 : 1) * (G.abyss ? 1.25 : 1) * COOP.cntMul;
  G.spawnAcc += G.noWaves ? 0 : dt * rate;
  while (G.spawnAcc >= 1) {
    G.spawnAcc -= 1;
    if (G.enemies.length >= cap) continue;
    const t = pickType(gw),
      e0 = spawnAround(t, false); // the ones with special abilities come only every two waves (above)
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
      // a ring with a gap (about a fifth of it open): surrounded, but there's always a way out
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * TAU * 0.8,
          e = spawn(t, p.x + Math.cos(a) * 17, p.z + Math.sin(a) * 17);
        e.flank = false;
      }
      text(p.x, p.z - 2, 'محاصرة!', '#ff7060', true);
    }
  }
}
