'use strict';
/* Boss ultimates and boss presentation (aura colour, particle trail).
   Indexed by boss kind (STAGES[].bk). Every ~15 s (faster when enraged) the boss stops, flashes,
   shows the move name, then calls f(e,p). Moves that last a while set e.ultT and run tick(e,p,dt). */
const BOSS_ULTS = [
  {
    // 0 · حارس الغابة
    n: 'غضب الغابة',
    col: [0.4, 1, 0.35],
    f(e, p) {
      // six lines of thorns racing outward from the boss
      const a0 = Math.atan2(p.z - e.z, p.x - e.x);
      for (let l = 0; l < 6; l++) {
        const a = a0 + (l / 6) * TAU;
        for (let j = 1; j <= 4; j++)
          zone(e.x + Math.cos(a) * j * 3.6, e.z + Math.sin(a) * j * 3.6, 2.2, 0.55 + j * 0.14, e.dmg * 1.1, false);
      }
      spawnPack('fast', 3, e.x, e.z, 3);
    },
  },
  {
    // 1 · ملك الرمال
    n: 'عاصفة الرمال',
    col: [1, 0.8, 0.4],
    f(e) {
      e.ultT = 3.5;
      e.uAcc = 0;
      e.uA = 0;
    },
    tick(e, p, dt) {
      e.uAcc += dt;
      while (e.uAcc > 0.09) {
        e.uAcc -= 0.09;
        e.uA += 0.23;
        for (let q = 0; q < 4; q++) eShot(e.x, e.z, e.uA + (q * TAU) / 4, 9, e.dmg * 0.45);
      }
    },
  },
  {
    // 2 · الفارس الأسود
    n: 'الضربات الثلاث',
    col: [1, 0.2, 0.2],
    f(e, p) {
      e.leaps = 2; // two more after this one (see bossLeap)
      bossLeap(e, p);
    },
  },
  {
    // 3 · الجنرال الحديدي
    n: 'قصف شامل',
    col: [1, 0.6, 0.2],
    f(e, p) {
      // 4×4 carpet around the player, two random cells left safe
      const safe = [(Math.random() * 16) | 0, (Math.random() * 16) | 0];
      for (let i = 0; i < 16; i++) {
        if (safe.includes(i)) continue;
        const cx = (i % 4) - 1.5,
          cz = ((i / 4) | 0) - 1.5;
        zone(p.x + cx * 4.4, p.z + cz * 4.4, 2.5, 0.9 + ((i / 4) | 0) * 0.18, e.dmg * 1.3, false);
      }
      AU.play('rocket');
    },
  },
  {
    // 4 · ملك الصقيع
    n: 'العصر الجليدي',
    col: [0.6, 0.9, 1.4],
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
    col: [1, 0.45, 0.1],
    f(e) {
      e.ultT = 2.7;
      e.uAcc = 0.45;
      e.uGap = (Math.random() * 24) | 0;
      shake(0.6);
    },
    tick(e, p, dt) {
      e.uAcc += dt;
      if (e.uAcc < 0.45) return;
      e.uAcc = 0;
      // a ring of fire with a 4-bullet gap that rotates each wave
      for (let j = 0; j < 24; j++) if ((j - e.uGap + 24) % 24 >= 4) eShot(e.x, e.z, (j / 24) * TAU, 7.5, e.dmg * 0.5);
      e.uGap = (e.uGap + 5) % 24;
      zone(p.x, p.z, 2.8, 0.9, e.dmg * 1.1, false);
      AU.play('boom');
    },
  },
];
/** Leap onto the player's current spot (the Black Knight's slam). Chains while e.leaps > 0. */
function bossLeap(e, p) {
  e.st = 3;
  e.stT = 1;
  e.lx = p.x;
  e.lz = p.z;
  zone(p.x, p.z, 5, 1, e.dmg * 1.5, false);
  AU.play('boss');
}
/** A ring of ice bullets around the player flying inward, with a 5-bullet gap to slip through. */
function iceCage(e, p) {
  const gap = (Math.random() * 32) | 0;
  for (let j = 0; j < 32; j++) {
    if ((j - gap + 32) % 32 < 5) continue;
    const a = (j / 32) * TAU;
    eShot(p.x + Math.cos(a) * 15, p.z + Math.sin(a) * 15, a + Math.PI, 6.5, e.dmg * 0.5);
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
  e.ult = 15;
  e.st = 4;
  e.stT = 1;
  banner('⚠ ' + u.n, '', 1.5);
  ring(e.x, e.z, 1, 7, 1, u.col);
  AU.play('boss');
  shake(0.4);
}
