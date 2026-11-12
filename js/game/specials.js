'use strict';
/* Hero specials (Q / 🌀 button). Each hero in CHARS names one with `sp`.
   cd = cooldown in seconds, f(p, power) performs it; power = 60·dmgMul·(1+6%/level), the knight's original blast. */
const SPECIALS = {
  shock: {
    n: 'صدمة الدرع',
    i: '🌀',
    cd: 18,
    d: 'موجة تدفع كل من حولك بعيداً وتمسح رصاص الأعداء القريب.',
    f(p, power) {
      ring(p.x, p.z, 1, 9, 0.45, [0.5, 0.9, 1]);
      ring(p.x, p.z, 0.5, 7, 0.6, [1, 1, 1]);
      parts(p.x, 1, p.z, 40, 0.5, 0.9, 1, 14, 0.3, 0.8);
      eachInRadius(p.x, p.z, 9, (e, ang) => hit(e, power, { aoe: 1, kb: 14, ang, quiet: 1 }), false);
      clearEnemyShots(p.x, p.z, 9);
    },
  },
  arrows: {
    n: 'مطر السهام',
    i: '🏹',
    cd: 14,
    d: '32 سهماً تنطلق في كل الاتجاهات وتخترق الصفوف.',
    f(p, power) {
      ring(p.x, p.z, 0.5, 5, 0.35, [0.5, 1, 0.6]);
      for (let i = 0; i < 32; i++)
        shot(p.x, p.z, (i / 32) * TAU, {
          spd: 26,
          dmg: power * 0.45,
          size: 0.3,
          pierce: 6,
          range: 18,
          kind: 1,
          col: TIERC[1],
        });
    },
  },
  barrage: {
    n: 'سيل الرصاص',
    i: '🔥',
    cd: 20,
    d: '6 ثوانٍ: أسلحتك تطلق أسرع بمرتين وأكثر.',
    f(p) {
      buff(6, { aspd: 2.2 }, [1, 0.7, 0.2]);
    },
  },
  freeze: {
    n: 'عاصفة الجليد',
    i: '❄️',
    cd: 18,
    d: 'تجمّد كل من حولك 3 ثوانٍ (الزعيم ثانية) وتجرحهم.',
    f(p, power) {
      ring(p.x, p.z, 1, 11, 0.5, [0.6, 0.9, 1.4]);
      parts(p.x, 1, p.z, 50, 0.7, 0.9, 1.4, 12, 0.3, 0.9);
      eachInRadius(p.x, p.z, 11, e => {
        e.frz = e.boss ? 1.2 : 3;
        hit(e, power * 0.6, { aoe: 1, quiet: 1 });
      });
      clearEnemyShots(p.x, p.z, 11);
      AU.play('shield');
    },
  },
  rage: {
    n: 'هيجان',
    i: '😡',
    cd: 22,
    d: '7 ثوانٍ: ضرر +60%، حركة أسرع، ونصف الضرر المستلم تقريباً. ويشفيك 15%.',
    f(p) {
      heal(p.maxHp * 0.15);
      buff(7, { dmg: 1.6, spd: 1.2, taken: 0.6 }, [1, 0.25, 0.15]);
    },
  },
  shadow: {
    n: 'خطوة الظل',
    i: '🌑',
    cd: 12,
    d: 'تنتقل للأمام وتقطع كل من في طريقك، ثم ضرباتك كلها حرجة 3 ثوانٍ.',
    f(p, power) {
      let mx = IN.mvx,
        mz = IN.mvz;
      if (!mx && !mz) {
        mx = Math.sin(p.face);
        mz = Math.cos(p.face);
      }
      const L = Math.hypot(mx, mz) || 1,
        ux = mx / L,
        uz = mz / L,
        x0 = p.x,
        z0 = p.z;
      p.x += ux * 9;
      p.z += uz * 9;
      const r = Math.hypot(p.x, p.z);
      if (r > ARENA) {
        p.x *= ARENA / r;
        p.z *= ARENA / r;
      }
      // everyone within 1.6 of the travelled segment gets cut
      const sx = p.x - x0,
        sz = p.z - z0,
        sl = sx * sx + sz * sz || 1;
      for (const e of G.enemies) {
        if (e.dead) continue;
        const t = clamp(((e.x - x0) * sx + (e.z - z0) * sz) / sl, 0, 1),
          dx = e.x - (x0 + sx * t),
          dz = e.z - (z0 + sz * t);
        if (dx * dx + dz * dz < (1.6 + e.r) ** 2) hit(e, power * 1.3, { aoe: 1, crit: 1 });
      }
      parts(x0, 1, z0, 20, 0.3, 0.2, 0.5, 6, 0.3, 0.5);
      parts(p.x, 1, p.z, 20, 0.3, 0.2, 0.5, 6, 0.3, 0.5);
      p.inv = Math.max(p.inv, 0.6);
      buff(3, { crit: 1 }, [0.6, 0.3, 1]);
      AU.play('dash');
    },
  },
  strike: {
    n: 'قصف صاروخي',
    i: '🎯',
    cd: 20,
    d: '8 صواريخ تسقط على أقرب الأعداء وتنفجر.',
    f(p, power) {
      const near = G.enemies.filter(e => !e.dead && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < 400);
      for (let j = 0; j < 8; j++) {
        const e = near.length ? pick(near) : null,
          a = Math.random() * TAU,
          d = rand(3, 9);
        zone(
          e ? e.x : p.x + Math.cos(a) * d,
          e ? e.z : p.z + Math.sin(a) * d,
          3.6 * p.area,
          0.5 + j * 0.12,
          power * 1.1,
          true
        );
      }
      AU.play('rocket');
    },
  },
};
/** The current hero's special. */
const heroSpecial = () => SPECIALS[CHARS[S.char].sp] || SPECIALS.shock;
/** Remove enemy bullets within radius R of (x,z). */
function clearEnemyShots(x, z, R) {
  G.eshots = G.eshots.filter(s => (s.x - x) ** 2 + (s.z - z) ** 2 > R * R);
}
/** Start a timed buff. mods: dmg / aspd / spd / taken multipliers, crit:1 = every hit crits. */
function buff(t, mods, col) {
  G.buffT = t;
  G.buff = mods;
  const p = G.p;
  ring(p.x, p.z, 0.5, 4, 0.4, col);
  parts(p.x, 1, p.z, 30, col[0], col[1], col[2], 8, 0.25, 0.7);
}
/** Multiplier of the active buff for a stat (1 when none). */
const buffMul = k => (G.buffT > 0 && G.buff[k]) || 1;
function special() {
  const p = G.p;
  if (G.state !== 'play' || G.specCd > 0) return;
  const sp = heroSpecial();
  G.specCd = sp.cd;
  AU.play('special');
  shake(0.7);
  sp.f(p, 60 * p.dmgMul * (1 + G.lvl * 0.06));
  dailyTrack('special', 1);
  text(p.x, p.z - 1, sp.n, '#9fe8ff', true);
  if (G.ups.super) {
    G.superT = 8;
    banner('القوة الخارقة', '', 1.4);
  }
}
