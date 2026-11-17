'use strict';
/* Boss ultimates and boss presentation (aura colour, particle trail).
   Indexed by boss kind (STAGES[].bk). Every ~15 s (faster when enraged) the boss stops, flashes,
   shows the move name, then calls f(e,p). Moves that last a while set e.ultT and run tick(e,p,dt). */
const BOSS_ULTS = [
  {
    // 0 · حارس الغابة
    n: 'غضب الغابة',
    col: [0.35, 1, 0.3],
    shot: { form: 'thorn', c: [0.45, 1.5, 0.35] },
    zone: 0x3cdc3c,
    f(e, p) {
      // six lines of thorns racing outward from the boss
      const a0 = Math.atan2(p.z - e.z, p.x - e.x);
      for (let l = 0; l < 6; l++) {
        const a = a0 + (l / 6) * TAU;
        for (let j = 1; j <= 4; j++)
          zone(e.x + Math.cos(a) * j * 3.6, e.z + Math.sin(a) * j * 3.6, 2, 0.7 + j * 0.14, e.dmg, false);
      }
      spawnPack('fast', 3, e.x, e.z, 3);
    },
  },
  {
    // 1 · ملك الرمال
    n: 'عاصفة الرمال',
    col: [1, 0.8, 0.3],
    shot: { form: 'orb', c: [1.7, 1.25, 0.4], s: 0.55 },
    zone: 0xe0b040,
    f(e) {
      e.ultT = 3;
      e.uAcc = 0;
      e.uA = 0;
    },
    tick(e, p, dt) {
      e.uAcc += dt;
      while (e.uAcc > 0.13) {
        e.uAcc -= 0.13;
        e.uA += 0.23;
        for (let q = 0; q < 3; q++) eShot(e.x, e.z, e.uA + (q * TAU) / 3, 8, e.dmg * 0.4);
      }
    },
  },
  {
    // 2 · الفارس الأسود
    n: 'الضربات الثلاث',
    col: [1, 0.12, 0.25],
    shot: { form: 'blade', c: [1.7, 0.15, 0.3] },
    zone: 0xc0102a,
    f(e, p) {
      e.leaps = 2; // two more after this one (see bossLeap)
      bossLeap(e, p);
    },
  },
  {
    // 3 · الجنرال الحديدي
    n: 'قصف شامل',
    col: [0.65, 0.45, 1],
    shot: { form: 'shell', c: [1.1, 0.9, 1.6] },
    zone: 0x9a5cff,
    f(e, p) {
      // 4×4 carpet around the player with three safe cells; circles are small enough not to cover them
      const safe = new Set();
      while (safe.size < 3) safe.add((Math.random() * 16) | 0);
      for (let i = 0; i < 16; i++) {
        if (safe.has(i)) continue;
        const cx = (i % 4) - 1.5,
          cz = ((i / 4) | 0) - 1.5;
        zone(p.x + cx * 4.8, p.z + cz * 4.8, 1.9, 1.2 + ((i / 4) | 0) * 0.18, e.dmg * 1.2, false);
      }
      for (const i of safe)
        ring(p.x + ((i % 4) - 1.5) * 4.8, p.z + (((i / 4) | 0) - 1.5) * 4.8, 0.3, 1.6, 1.4, [0.4, 1, 0.5]);
      AU.play('rocket');
    },
  },
  {
    // 4 · ملك الصقيع
    n: 'العصر الجليدي',
    col: [0.5, 0.95, 1.4],
    shot: { form: 'thorn', c: [0.6, 1.3, 1.9] },
    zone: 0x50d0ff,
    f(e, p) {
      iceCage(e, p);
      e.ultT = 1;
      e.uAcc = 0;
    },
    tick(e, p, dt) {
      if (e.uAcc === 0 && e.ultT < 0.1) {
        e.uAcc = 1;
        iceCage(e, p);
      }
    },
  },
  {
    // 5 · سيد اللهب
    n: 'انفجار البركان',
    col: [1, 0.42, 0.05],
    shot: { form: 'orb', c: [2, 0.75, 0.1], s: 0.85 },
    zone: 0xff5a00,
    f(e) {
      e.ultT = 2.5;
      e.uAcc = 0.6;
      e.uGap = (Math.random() * 24) | 0;
      shake(0.6);
    },
    tick(e, p, dt) {
      e.uAcc += dt;
      if (e.uAcc < 0.6) return;
      e.uAcc = 0;
      // a ring of fire with a 5-bullet gap that rotates each wave
      for (let j = 0; j < 20; j++) if ((j - e.uGap + 20) % 20 >= 5) eShot(e.x, e.z, (j / 20) * TAU, 7, e.dmg * 0.45);
      e.uGap = (e.uGap + 4) % 20;
      zone(p.x, p.z, 2.8, 0.9, e.dmg * 1.1, false);
      AU.play('boom');
    },
  },
];
/** Projectile/zone look of whatever is attacking right now: 0 = ordinary enemy, k+1 = boss kind k (set by updEnemies). */
let eSrc = 0;
/** Leap onto the player's current spot (the Black Knight's slam). Chains while e.leaps > 0. */
function bossLeap(e, p) {
  e.st = 3;
  e.stT = 1;
  e.lx = p.x;
  e.lz = p.z;
  zone(p.x, p.z, 5, 1, e.dmg * 1.5, false);
  AU.play('boss');
}
/** A ring of ice bullets around the player flying inward, with an 8-bullet gap to slip through. */
function iceCage(e, p) {
  const gap = (Math.random() * 32) | 0;
  for (let j = 0; j < 32; j++) {
    if ((j - gap + 32) % 32 < 8) continue;
    const a = (j / 32) * TAU;
    eShot(p.x + Math.cos(a) * 15, p.z + Math.sin(a) * 15, a + Math.PI, 5.5, e.dmg * 0.4);
  }
  AU.play('eshot');
}
/** Per-frame boss extras: particle trail and any running ultimate. */
function bossTick(e, p, dt) {
  const u = BOSS_ULTS[e.kind],
    c = u.col;
  if (Math.random() < dt * 12)
    parts(e.x + rand(-1.5, 1.5), 0.4 + Math.random() * 3, e.z + rand(-1.5, 1.5), 1, c[0], c[1], c[2], 1.5, 0.22, 0.9);
  if (e.ultT > 0) {
    e.ultT -= dt;
    if (u.tick) u.tick(e, p, dt);
  }
}
/** Begin the wind-up of the ultimate (state 4); enemy-ai fires it when the wind-up ends. */
function startUlt(e) {
  const u = BOSS_ULTS[e.kind];
  e.ult = 18;
  e.st = 4;
  e.stT = 1;
  banner('⚠ ' + u.n, '', 1.5);
  ring(e.x, e.z, 1, 7, 1, u.col);
  AU.play('boss');
  shake(0.4);
}
