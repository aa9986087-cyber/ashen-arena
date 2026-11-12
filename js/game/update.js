'use strict';
/* Per-frame simulation: movement, weapons, abilities, projectiles, pickups and timers. */
/** Lifetimes (seconds) of short-lived effects; shared by update() and render(). */
const FX_LIFE = { text: 0.8, bolt: 0.22, slash: 0.18 };
/** Radius of the electric aura upgrade. */
const auraRadius = () => (3.4 + 0.55 * G.ups.aura) * G.p.area;
/** Call fn(angle,x,z) for each orbiting blade. */
function forOrbitBlades(fn) {
  const p = G.p,
    n = 1 + G.ups.orbit,
    R = 3.1 * Math.sqrt(p.area);
  for (let i = 0; i < n; i++) {
    const a = G.orbitA + (i / n) * TAU;
    fn(a, p.x + Math.cos(a) * R, p.z + Math.sin(a) * R);
  }
}
function update(dt) {
  const p = G.p;
  G.t += dt;
  // input → move
  let mx = 0,
    mz = 0;
  if (IN.k.KeyW || IN.k.ArrowUp) mz -= 1;
  if (IN.k.KeyS || IN.k.ArrowDown) mz += 1;
  if (IN.k.KeyA || IN.k.ArrowLeft) mx -= 1;
  if (IN.k.KeyD || IN.k.ArrowRight) mx += 1;
  if (IN.joy !== null) {
    mx = IN.jx;
    mz = IN.jz;
  }
  const ml = Math.hypot(mx, mz);
  if (ml > 1) {
    mx /= ml;
    mz /= ml;
  }
  IN.mvx = ml > 0.01 ? (mx / Math.max(ml, 0.01)) * Math.min(ml, 1) : 0;
  IN.mvz = ml > 0.01 ? (mz / Math.max(ml, 0.01)) * Math.min(ml, 1) : 0;
  const focus = IN.atk || IN.md,
    sup = G.superT > 0;
  const sp = p.speed * (sup ? 1.3 : 1) * (focus ? 0.75 : 1) * buffMul('spd');
  if (p.dashT > 0) {
    p.dashT -= dt;
    const ds = p.dashLen / 0.18;
    p.x += p.dx * ds * dt;
    p.z += p.dz * ds * dt;
    if (Math.random() < 0.7) parts(p.x, 1, p.z, 1, 0.7, 0.85, 1, 2, 0.25, 0.3);
    if (G.ups.dash)
      for (const e of G.enemies) {
        if (!e.dead && e.oCd <= 0 && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < (e.r + 1.3) ** 2) {
          e.oCd = 0.3;
          hit(e, 22 * G.ups.dash * p.dmgMul, { aoe: 1, kb: 6, ang: Math.atan2(p.dz, p.dx) });
        }
      }
  } else {
    p.x += mx * sp * dt;
    p.z += mz * sp * dt;
  }
  const pr = Math.hypot(p.x, p.z);
  if (pr > ARENA) {
    p.x *= ARENA / pr;
    p.z *= ARENA / pr;
  }
  p.moving = ml > 0.05 ? 1 : 0;
  p.walk += dt * sp * 1.5 * p.moving;
  if (p.dashCd > 0) p.dashCd -= dt;
  if (p.inv > 0) p.inv -= dt;
  if (p.swing > 0) p.swing = Math.max(0, p.swing - dt * 5);
  if (G.specCd > 0) G.specCd -= dt;
  if (G.superT > 0) G.superT -= dt;
  if (G.buffT > 0) G.buffT -= dt;
  if (p.regen > 0 && p.hp < p.maxHp) heal(p.regen * dt);
  if (p.shieldMax > 0) {
    if (p.shieldRe > 0) p.shieldRe -= dt;
    else if (p.shield < p.shieldMax) p.shield = Math.min(p.shieldMax, p.shield + 14 * dt);
  }
  // weapons
  const manual = IN.md && !IN.touch,
    mAng = Math.atan2(IN.mz - p.z, IN.mx - p.x);
  for (const w of G.weapons) {
    w.cd -= dt * p.aspd * (focus ? 1.3 : 1) * (sup ? 1.25 : 1) * buffMul('aspd');
    if (w.cd > 0) continue;
    const d = WEP[w.id],
      range = d.melee ? d.range * p.area + 0.3 : d.range;
    let ang = null;
    if (manual) ang = mAng;
    else {
      const t = nearest(p.x, p.z, range);
      if (t) ang = Math.atan2(t.z - p.z, t.x - p.x);
    }
    if (ang === null) {
      w.cd = 0;
      continue;
    }
    fire(w, ang);
    w.cd = d.cd * (1 - 0.05 * (w.lvl - 1));
  }
  const tgt = manual ? null : nearest(p.x, p.z, 14);
  let fa = p.face;
  if (manual) fa = Math.atan2(Math.cos(mAng), Math.sin(mAng));
  else if (tgt) fa = Math.atan2(tgt.x - p.x, tgt.z - p.z);
  else if (p.moving) fa = Math.atan2(mx, mz);
  p.face += wrapAng(fa - p.face) * Math.min(1, dt * 14);
  // abilities
  const u = G.ups,
    tm = G.tm;
  if (u.bolt) {
    tm.bolt -= dt;
    if (tm.bolt <= 0 && G.enemies.length) {
      tm.bolt = Math.max(0.9, 2.7 - 0.32 * u.bolt);
      boltStrike(2 + u.bolt + (u.aura ? 2 : 0), 16 * (1 + 0.24 * u.bolt) * p.dmgMul, p.x, p.z);
    }
  }
  if (u.nova) {
    tm.nova -= dt;
    if (tm.nova <= 0) {
      tm.nova = 5.2 - 0.5 * u.nova;
      const R = (4 + 0.55 * u.nova) * p.area;
      ring(p.x, p.z, 0.6, R, 0.4, [0.8, 0.6, 1]);
      AU.play('nova');
      eachInRadius(p.x, p.z, R, (e, ang) => hit(e, (20 + 9 * u.nova) * p.dmgMul, { aoe: 1, kb: 10, ang, quiet: 1 }));
    }
  }
  if (u.orbit) {
    G.orbitA += dt * 3.2;
    forOrbitBlades((a, ox, oz) => {
      for (const e of G.enemies) {
        if (!e.dead && e.oCd <= 0 && (e.x - ox) ** 2 + (e.z - oz) ** 2 < (e.r + 0.8) ** 2) {
          e.oCd = 0.35;
          hit(e, (9 + 4 * u.orbit) * p.dmgMul, { aoe: 1, kb: 3, ang: a });
        }
      }
    });
  }
  if (u.aura) {
    tm.aura -= dt;
    if (tm.aura <= 0) {
      tm.aura = 0.4;
      eachInRadius(p.x, p.z, auraRadius(), e => {
        hit(e, (4 + 3 * u.aura) * p.dmgMul, { aoe: 1, quiet: 1, noCrit: 1 });
        if (u.bolt && Math.random() < 0.08) boltStrike(2, 18 * p.dmgMul, e.x, e.z);
      });
    }
  }
  if (u.meteor) {
    tm.meteor -= dt;
    if (tm.meteor <= 0) {
      tm.meteor = 6.2 - 0.9 * u.meteor;
      const pool = G.enemies.filter(e => !e.dead && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < 324);
      if (pool.length) {
        const e = G.boss && Math.random() < 0.5 ? G.boss : pick(pool);
        zone(e.x, e.z, 4.4 * p.area, 0.8, (60 + 30 * u.meteor) * p.dmgMul, true);
      }
    }
  }
  // allies
  G.allies.forEach((a, i) => {
    const an = (i / Math.max(1, G.allies.length)) * TAU + G.t * 0.3,
      tx = p.x + Math.cos(an) * 2.6,
      tz = p.z + Math.sin(an) * 2.6,
      dx = tx - a.x,
      dz = tz - a.z,
      d = Math.hypot(dx, dz);
    if (d > 0.3) {
      const s = Math.min(d * 4, p.speed * 1.3);
      a.x += (dx / d) * s * dt;
      a.z += (dz / d) * s * dt;
      a.t += dt * 8;
    }
    a.cd -= dt;
    const t = nearest(a.x, a.z, 11);
    if (t) {
      a.face = Math.atan2(t.x - a.x, t.z - a.z);
      if (a.cd <= 0) {
        a.cd = 0.7;
        shot(a.x, a.z, Math.atan2(t.z - a.z, t.x - a.x), {
          spd: 30,
          dmg: 7 * p.dmgMul * (1 + 0.15 * u.army),
          size: 0.2,
          range: 13,
          kind: 0,
          col: [0.5, 0.8, 1.4],
        });
        AU.play('rifle');
      }
    } else if (d > 0.3) a.face = Math.atan2(dx, dz);
  });
  updWaves(dt);
  updEnemies(dt);
  // deferred chain explosions
  let guard = 40;
  while (G.defer.length && guard--) {
    const q = G.defer.shift();
    explode(q[0], q[1], q[2], q[3], true);
  }
  G.defer.length = 0;
  // shots
  for (const s of G.shots) {
    s.life -= dt;
    s.t += dt;
    if (s.homing) {
      const e = nearest(s.x, s.z, 9, s.hits);
      if (e) {
        const ta = Math.atan2(e.z - s.z, e.x - s.x);
        s.a += clamp(wrapAng(ta - s.a), -6 * dt, 6 * dt);
        const v = Math.hypot(s.vx, s.vz);
        s.vx = Math.cos(s.a) * v;
        s.vz = Math.sin(s.a) * v;
      }
    }
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    if (s.kind === 3 && Math.random() < 0.6) parts(s.x, 1, s.z, 1, 1, 0.6, 0.2, 1, 0.2, 0.3);
    for (const e of G.enemies) {
      if (e.dead || s.hits.includes(e)) continue;
      const dx = e.x - s.x,
        dz = e.z - s.z,
        rr = e.r + s.r;
      if (dx * dx + dz * dz < rr * rr) {
        if (s.aoe && s.kind === 3) {
          s.life = 0;
          break;
        }
        hit(e, s.dmg, { kb: 2, ang: s.a, crit: s.crit });
        if (s.aoe) explode(s.x, s.z, s.aoe, s.dmg * 0.5, true);
        s.hits.push(e);
        if (--s.pierce < 0) {
          s.life = -1;
          break;
        }
      }
    }
    if (s.life <= 0 && s.kind === 3 && s.life > -1) {
      explode(s.x, s.z, s.aoe, s.dmg);
      s.life = -1;
    }
  }
  G.shots = G.shots.filter(s => s.life > 0);
  for (const s of G.eshots) {
    s.life -= dt;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    const dx = s.x - p.x,
      dz = s.z - p.z;
    if (dx * dx + dz * dz < 0.75 && p.inv <= 0) {
      hurt(s.dmg);
      s.life = 0;
    } else if (s.x * s.x + s.z * s.z > (ARENA + 8) ** 2) s.life = 0;
  }
  G.eshots = G.eshots.filter(s => s.life > 0);
  if (G.state !== 'play') return;
  // zones
  for (const z of G.zones) {
    z.l += dt;
    if (z.l >= z.d) {
      z.done = true;
      if (z.f) explode(z.x, z.z, z.r, z.dmg);
      else {
        ring(z.x, z.z, 0.3, z.r, 0.3, [1, 0.3, 0.2]);
        parts(z.x, 0.6, z.z, 14, 1, 0.4, 0.2, 9, 0.3);
        AU.play('boom');
        shake(0.3);
        if ((z.x - p.x) ** 2 + (z.z - p.z) ** 2 < z.r * z.r) hurt(z.dmg);
      }
    }
  }
  G.zones = G.zones.filter(z => !z.done);
  if (G.state !== 'play') return;
  // pickups
  const mg2 = p.magnet * p.magnet;
  for (const q of G.picks) {
    q.t += dt;
    const dx = p.x - q.x,
      dz = p.z - q.z,
      d2 = dx * dx + dz * dz;
    if (q.mag || d2 < mg2) {
      q.mag = true;
      const d = Math.sqrt(d2) || 0.01,
        s = Math.min(d / dt, 20 + G.t * 0.01);
      q.x += (dx / d) * s * dt;
      q.z += (dz / d) * s * dt;
    }
    if (d2 < 1.1) {
      q.got = true;
      if (q.k === 0) {
        addXp(q.v);
        AU.play('gem');
      } else if (q.k === 1) {
        const v = Math.max(1, Math.round(q.v * p.goldMul));
        G.coins += v;
        AU.play('coin');
        text(p.x, p.z, '+' + v + ' 🪙', '#ffd23a');
      } else {
        heal(q.v);
        AU.play('heart');
        text(p.x, p.z, '+' + q.v, '#6dff8a', true);
      }
    }
  }
  G.picks = G.picks.filter(q => !q.got);
  // fx lifetimes
  for (const q of G.parts) {
    q.l += dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.z += q.vz * dt;
    q.vy -= 14 * dt;
    if (q.y < 0.05) {
      q.y = 0.05;
      q.vy *= -0.4;
      q.vx *= 0.6;
      q.vz *= 0.6;
    }
  }
  G.parts = G.parts.filter(q => q.l < q.m);
  const age = (list, life) => {
    for (const q of list) q.l += dt;
    return list.filter(q => q.l < life(q));
  };
  G.texts = age(G.texts, () => FX_LIFE.text);
  G.rings = age(G.rings, q => q.d);
  G.bolts = age(G.bolts, () => FX_LIFE.bolt);
  G.slashes = age(G.slashes, () => FX_LIFE.slash);
  if (G.abyss && Math.random() < dt * 14) {
    const a = Math.random() * TAU,
      r = rand(3, 16);
    G.parts.push({
      x: p.x + Math.cos(a) * r,
      y: 0.2,
      z: p.z + Math.sin(a) * r,
      vx: rand(-0.5, 0.5),
      vy: rand(6, 9),
      vz: rand(-0.5, 0.5),
      l: 0,
      m: rand(0.9, 1.4),
      s: rand(0.1, 0.2),
      r: 1.4,
      g: 0.3,
      b: 0.35,
    });
  }
  G.enemies = G.enemies.filter(e => !e.dead);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.2);
  if (G.slow > 0) G.slow -= dt;
  // music intensity
  MUS.i += (clamp(G.enemies.length / 70, 0, 1) - MUS.i) * dt;
  // achievements / records
  G.achT -= dt;
  if (G.achT <= 0) {
    G.achT = 1;
    if ((G.t | 0) % 5 === 0) saveRun();
    S.stats.bestLvl = Math.max(S.stats.bestLvl, G.lvl);
    S.stats.bestTime = Math.max(S.stats.bestTime, G.t);
    checkAch();
  }
  // boss reward → cards → next stage
  if (G.bossReward > 0) {
    G.bossReward -= dt;
    if (G.bossReward <= 0) {
      G.bossReward = 0;
      openCards('boss');
      return;
    }
  }
  if (G.pending > 0 && !(G.bossReward > 0)) openCards('level');
}
