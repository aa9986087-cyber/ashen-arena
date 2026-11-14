'use strict';
/* Per-frame simulation: movement, weapons, abilities, projectiles, pickups and timers. */
/** Lifetimes (seconds) of short-lived effects; shared by update() and render(). */
const FX_LIFE = { text: 0.8, bolt: 0.22, slash: 0.18, corpse: 0.55 };
/** Radius of the electric aura upgrade. */
const auraRadius = () => (3.4 + 0.55 * G.ups.aura) * G.p.area;
/** Timed abilities from the second upgrade expansion (see UP in data/upgrades.js). */
function updExpansionAbilities(dt) {
  const p = G.p,
    u = G.ups,
    tm = G.tm,
    every = (k, t) => (tm[k] -= dt) <= 0 && ((tm[k] = t), true),
    near = R => G.enemies.filter(e => !e.dead && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < R * R);
  if (u.spikes && p.moving && every('spikes', 0.35)) {
    G.clouds.push({ x: p.x, z: p.z, r: 1.5 * p.area, l: 0, d: 2.2, tick: 0, dmg: 4 + 3 * u.spikes, col: 0x9a5aff });
    vfxToxic(p.x, p.z, 1.3 * p.area, 1.4, true);
  }
  if (u.mines && every('mines', 3.6 - 0.5 * u.mines)) G.mines.push({ x: p.x, z: p.z, t: 0 });
  for (const m of G.mines) {
    m.t += dt;
    if (m.t > 0.6 && (m.t > 9 || G.enemies.some(e => !e.dead && (e.x - m.x) ** 2 + (e.z - m.z) ** 2 < 1.8))) {
      m.done = 1;
      explode(m.x, m.z, 3 * p.area, (40 + 25 * u.mines) * p.dmgMul);
    }
  }
  G.mines = G.mines.filter(m => !m.done);
  if (u.firering && every('firering', 6)) {
    ring(p.x, p.z, 0.5, 6 * p.area, 0.5, [1.6, 0.6, 0.15]);
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * TAU,
        sp = 6 * p.area * rand(1.6, 2.1);
      vfxP({
        x: p.x,
        y: rand(0.2, 0.9),
        z: p.z,
        vx: Math.cos(a) * sp,
        vy: rand(1, 2.5),
        vz: Math.sin(a) * sp,
        life: rand(0.45, 0.6),
        s: rand(0.9, 1.4),
        s1: 0.3,
        r: 1.7,
        g: rand(0.45, 0.75),
        b: 0.1,
        drag: 2.2,
      });
    }
    vfxSmoke(p.x, 0.4, p.z, 10, [0.15, 0.1, 0.08, 0.4], 6 * p.area * 0.6, 1.8, 1, 1.2);
    AU.play('nova');
    eachInRadius(p.x, p.z, 6 * p.area, e => {
      hit(e, (10 + 6 * u.firering) * p.dmgMul, { aoe: 1, quiet: 1, noCrit: 1, burn: 1 });
      e.burn = 3;
    });
  }
  if (u.magic && every('magic', 2.2 - 0.3 * u.magic))
    for (let k = 0; k < 1 + u.magic; k++) {
      const t = nearest(p.x, p.z, 16);
      if (t)
        shot(p.x, p.z, Math.atan2(t.z - p.z, t.x - p.x) + rand(-0.6, 0.6), {
          spd: 13,
          dmg: (12 + 5 * u.magic) * p.dmgMul,
          size: 0.3,
          range: 18,
          kind: 4,
          homing: 1,
          col: [1.3, 0.5, 1.8],
        });
    }
  if (u.blades && every('blades', 1.8)) {
    const n = 4 + 2 * u.blades,
      a0 = Math.random() * TAU;
    for (let k = 0; k < n; k++)
      shot(p.x, p.z, a0 + (k / n) * TAU, {
        spd: 18,
        dmg: (8 + 4 * u.blades) * p.dmgMul,
        size: 0.35,
        pierce: 3,
        life: 0.5,
        kind: 5,
        col: [1.4, 1.4, 1.6],
      });
  }
  if (u.turret && every('turret', 14)) {
    G.turrets.push({ x: p.x + 1.5, z: p.z, l: 0, cd: 0 });
    if (G.turrets.length > 2) G.turrets.shift();
  }
  for (const t of G.turrets) {
    t.l += dt;
    if ((t.cd -= dt) <= 0) {
      t.cd = 0.45;
      const e = nearest(t.x, t.z, 14);
      if (e)
        shot(t.x, t.z, Math.atan2(e.z - t.z, e.x - t.x), {
          spd: 30,
          dmg: (10 + 5 * u.turret) * p.dmgMul,
          size: 0.22,
          range: 14,
          kind: 0,
          col: [1.8, 0.9, 0.3],
        });
    }
  }
  G.turrets = G.turrets.filter(t => t.l < 10);
  if (u.skystrike && every('skystrike', 5 - 0.6 * u.skystrike)) {
    const pool = near(18);
    for (let k = 0; k < 1 + u.skystrike && pool.length; k++) {
      const e = pool.splice((Math.random() * pool.length) | 0, 1)[0];
      zone(e.x, e.z, 2.2 * p.area, 0.55, (35 + 20 * u.skystrike) * p.dmgMul * (u.thunderlord ? 2 : 1), true, 'sky');
    }
    AU.play('bolt');
  }
  if (u.guardian && every('guardian', 9 - u.guardian)) {
    p.inv = Math.max(p.inv, 1);
    ring(p.x, p.z, 0.5, 4, 0.5, [1.6, 1.4, 0.6]);
    vfxP({ x: p.x, y: 1.4, z: p.z, life: 0.5, s: 7, s1: 9, r: 1.6, g: 1.3, b: 0.5, a: 0.6 });
    for (let i = 0; i < 24; i++)
      vfxP({
        x: p.x,
        y: 0.3,
        z: p.z,
        life: 1,
        s: 0.4,
        s1: 0.1,
        r: 1.8,
        g: 1.5,
        b: 0.6,
        orbit: { cx: p.x, cz: p.z, ang: (i / 24) * TAU, rad: 2.4, w: 2, rise: 2.4 },
      });
    eachInRadius(p.x, p.z, 4, (e, ang) => hit(e, 10 * p.dmgMul, { aoe: 1, quiet: 1, noCrit: 1, kb: 12, ang }));
  }
  if (u.frostnova && every('frostnova', 7)) {
    ring(p.x, p.z, 0.5, 6 * p.area, 0.6, [0.6, 1, 1.6]);
    vfxFrostBurst(p.x, p.z, 6 * p.area);
    AU.play('shield');
    eachInRadius(p.x, p.z, 6 * p.area, e => (e.frz = Math.max(e.frz || 0, e.boss ? 0.5 : 1.2 + 0.3 * u.frostnova)));
  }
  if (u.regenburst && every('regenburst', 10)) {
    heal(p.maxHp * (0.05 + 0.03 * u.regenburst));
    ring(p.x, p.z, 0.4, 3, 0.5, [0.4, 1.6, 0.6]);
    vfxHeal(p.x, p.z, 30);
  }
  if (u.whirl && every('whirl', 5 - 0.5 * u.whirl)) {
    const R = 4 * p.area;
    slashFx(0, 2, R);
    vfxBladeWhirl(R);
    AU.play('sword');
    eachInRadius(p.x, p.z, R, (e, ang) => hit(e, (20 + 12 * u.whirl) * p.dmgMul, { kb: 8, ang }));
  }
  if (u.starfall && every('starfall', 6))
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * TAU,
        r = rand(3, 12);
      zone(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 2.4 * p.area, 0.5 + k * 0.1, 80 * p.dmgMul, true, 'star');
    }
  if (u.timewarp && every('timewarp', 20)) {
    G.warpT = 5;
    vfxEmit(p.x, p.z, 5, (em, dt) => {
      for (let i = vfxRate(em, dt, 30); i > 0; i--)
        vfxP({
          x: G.p.x,
          y: rand(0.2, 2),
          z: G.p.z,
          life: 0.6,
          s: 0.35,
          s1: 0.1,
          r: 1.8,
          g: 1.4,
          b: 0.5,
          orbit: { cx: G.p.x, cz: G.p.z, ang: Math.random() * TAU, rad: 1.3, w: 7, rise: 0.8 },
        });
    });
    banner('تسارع الزمن', '', 1);
    ring(p.x, p.z, 0.5, 6, 0.6, [1.4, 1.2, 0.4]);
  }
  if (u.clones) {
    G.cloneA += dt * 2.2;
    if (every('clones', 0.6))
      forClones((x, z) => {
        const t = nearest(x, z, 13);
        if (t)
          shot(x, z, Math.atan2(t.z - z, t.x - x), {
            spd: 22,
            dmg: (14 + 6 * u.clones) * p.dmgMul,
            size: 0.32,
            range: 13,
            kind: 4,
            col: [0.9, 0.7, 1.9],
          });
      });
  }
}
/** Call fn(x,z) for each companion spirit (two per level, circling wider than the drones). */
function forClones(fn) {
  const p = G.p,
    n = 2 * (G.ups.clones || 0);
  for (let i = 0; i < n; i++) {
    const a = -G.cloneA + (i / n) * TAU;
    fn(p.x + Math.cos(a) * 3.4, p.z + Math.sin(a) * 3.4);
  }
}
/** Call fn(x,z) for each combat drone (they circle above the player). */
function forDrones(fn) {
  const p = G.p,
    n = G.ups.drone || 0;
  for (let i = 0; i < n; i++) {
    const a = G.droneA + (i / n) * TAU;
    fn(p.x + Math.cos(a) * 2.2, p.z + Math.sin(a) * 2.2);
  }
}
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
  const p = G.p,
    cc = COOP.on && !COOP.host; // a co-op client mirrors the world (coopMirror), it doesn't run it
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
  if (COOP.on && (G.cardsOpen || p.dead)) {
    // co-op: the world doesn't pause for your cards (you're shielded meanwhile), and the fallen only watch
    mx = mz = 0;
    if (!p.dead) p.inv = Math.max(p.inv, 0.3);
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
  const warp = G.warpT > 0,
    sp = p.speed * (sup ? 1.3 : 1) * (focus ? 0.75 : 1) * buffMul('spd') * (warp ? 1.3 : 1);
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
  pushOutOfObstacles(p, p.r);
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
  if (G.potCd > 0) G.potCd -= dt;
  if (G.contactCd > 0) G.contactCd -= dt;
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
    if (choosingCards()) break; // online, choosing cards: your weapons rest
    w.cd -=
      dt *
      p.aspd *
      (focus ? 1.3 : 1) *
      (sup ? 1.25 : 1) *
      buffMul('aspd') *
      (warp ? 2 : 1) *
      (1 + 0.015 * G.lust * (G.ups.bloodlust || 0));
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
    // double strike: sometimes the weapon fires again right away
    if (G.ups.mirror && Math.random() < 0.2 * G.ups.mirror) fire(w, ang + rand(-0.15, 0.15));
    w.cd = d.cd * (1 - 0.05 * (w.lvl - 1)) * (w.evo && w.id === 'rifle' ? 0.14 : 1);
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
      boltStrike(2 + u.bolt + (u.aura ? 2 : 0), 16 * (1 + 0.24 * u.bolt) * p.dmgMul, p.x, p.z, true);
    }
  }
  if (u.nova) {
    tm.nova -= dt;
    if (tm.nova <= 0) {
      tm.nova = 5.2 - 0.5 * u.nova;
      const R = (4 + 0.55 * u.nova) * p.area;
      ring(p.x, p.z, 0.6, R, 0.4, [0.8, 0.6, 1]);
      vfxP({ x: p.x, y: 1, z: p.z, life: 0.25, s: R * 1.2, s1: R * 2, r: 1, g: 0.8, b: 1.6 });
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU;
        vfxP({
          x: p.x,
          y: 0.6,
          z: p.z,
          vx: Math.cos(a) * R * 2.6,
          vz: Math.sin(a) * R * 2.6,
          vy: rand(0, 1),
          life: 0.4,
          s: 0.7,
          s1: 0.2,
          r: 1.1,
          g: 0.85,
          b: 1.7,
          drag: 2,
        });
      }
      vfxSmoke(p.x, 0.3, p.z, 8, [0.5, 0.45, 0.6, 0.35], R * 0.6, 1.6, 0.8, 0.3);
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
      let arcs = 0;
      eachInRadius(p.x, p.z, auraRadius(), e => {
        if (arcs++ < 3)
          vfxBolt(
            [
              [p.x, 1.2, p.z],
              [e.x, 1, e.z],
            ],
            { w: 0.45, life: 0.16, rough: 0.35 }
          );
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
        zone(e.x, e.z, 4.4 * p.area, 0.8, (60 + 30 * u.meteor) * p.dmgMul, true, 'meteor');
      }
    }
  }
  if (u.poison) {
    tm.poison -= dt;
    if (tm.poison <= 0) {
      tm.poison = 4;
      const near = G.enemies.filter(e => !e.dead && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < 196);
      if (near.length) {
        const e = pick(near);
        vfxToxic(e.x, e.z, (2.6 + 0.4 * u.poison) * p.area, 3);
        G.clouds.push({
          x: e.x,
          z: e.z,
          r: (2.6 + 0.4 * u.poison) * p.area,
          l: 0,
          d: 3,
          tick: 0,
          dmg: 5 + 4 * u.poison,
        });
      }
    }
  }
  for (const c of G.clouds) {
    c.l += dt;
    if ((c.tick -= dt) <= 0) {
      c.tick = 0.5;
      eachInRadius(c.x, c.z, c.r, e => hit(e, c.dmg * p.dmgMul, { aoe: 1, quiet: 1, noCrit: 1, burn: 1 }));
    }
  }
  G.clouds = G.clouds.filter(c => c.l < c.d);
  if (u.hole) {
    tm.hole -= dt;
    if (tm.hole <= 0) {
      tm.hole = 9;
      const near = G.enemies.filter(e => !e.dead && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < 256);
      if (near.length) {
        const e = pick(near);
        const h = { x: e.x, z: e.z, l: 0, d: 2.4 };
        G.holes.push(h);
        vfxBlackHole(h);
        AU.play('nova');
      }
    }
  }
  for (const h of G.holes) {
    h.l += dt;
    // pull everything (bosses barely) toward the centre, then burst
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = h.x - e.x,
        dz = h.z - e.z,
        d = Math.hypot(dx, dz);
      if (d < (h.mini ? 6 : 10) && d > 0.3) {
        const f = ((e.boss ? 0.6 : 7) * dt) / d;
        e.x += dx * f;
        e.z += dz * f;
      }
    }
    if (!h.mini && Math.random() < dt * 6) ring(h.x, h.z, 9, 0.5, 0.5, [0.6, 0.3, 1]);
    if (h.l >= h.d) {
      h.done = 1;
      if (h.mini) explode(h.x, h.z, 3 * p.area, (40 + 25 * (u.vortexdash || 1)) * p.dmgMul, true, 'wind');
      else {
        explode(h.x, h.z, 5 * p.area, 140 * p.dmgMul, false, 'void');
        ring(h.x, h.z, 0.5, 7, 0.6, [0.8, 0.4, 1]);
      }
    }
  }
  G.holes = G.holes.filter(h => !h.done);
  if (u.tslow) {
    tm.tslow -= dt;
    if (tm.tslow <= 0) {
      tm.tslow = 15;
      G.tslowT = 4;
      ring(p.x, p.z, 1, 18, 0.8, [0.5, 0.7, 1.3]);
      vfxFrostBurst(p.x, p.z, 6);
      banner('إبطاء الزمن', '', 1);
    }
  }
  if (G.tslowT > 0) G.tslowT -= dt;
  if (G.lustT > 0 && (G.lustT -= dt) <= 0) G.lust = 0;
  if (G.secondT > 0) G.secondT -= dt;
  if (G.warpT > 0) G.warpT -= dt;
  updExpansionAbilities(dt);
  if (u.drone) {
    G.droneA += dt * 1.8;
    if ((tm.drone -= dt) <= 0) {
      tm.drone = 0.45;
      forDrones((x, z) => {
        const t = nearest(x, z, 12);
        if (t)
          shot(x, z, Math.atan2(t.z - z, t.x - x), {
            spd: 34,
            dmg: (8 + 3 * u.drone) * p.dmgMul,
            size: 0.2,
            range: 12,
            kind: 0,
            col: [0.4, 1.4, 1.6],
          });
      });
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
  if (!cc) {
    updWaves(dt);
    updEnemies(dt);
    if (COOP.on) coopSafeZones(dt);
  }
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
    if (s.fx === 'return' && !s.back && s.t > s.life0 * 0.5) {
      // evolved axes turn around and can hit everything again on the way back
      s.back = 1;
      s.vx = -s.vx;
      s.vz = -s.vz;
      s.hits = [];
    }
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    if (s.kind === 3 && Math.random() < 0.6) parts(s.x, 1, s.z, 1, 1, 0.6, 0.2, 1, 0.2, 0.3);
    // thrown in an arc: it touches nothing on the way, and lands at the end of its flight
    if (s.lob) {
      if (s.life <= 0 && !s.ghost) lobLand(s);
      if (s.life <= 0) s.life = -1;
      continue;
    }
    // the bouncing ball: off the arena's edge, and it may hit the same enemy again after a moment
    if (s.ball) {
      const r = Math.hypot(s.x, s.z);
      if (r > ARENA - 0.5) {
        const nx = s.x / r,
          nz = s.z / r,
          dot = s.vx * nx + s.vz * nz;
        s.vx -= 2 * dot * nx;
        s.vz -= 2 * dot * nz;
        s.x = nx * (ARENA - 0.6);
        s.z = nz * (ARENA - 0.6);
      }
      if ((s.hitT = (s.hitT || 0) + dt) > 0.4) {
        s.hitT = 0;
        s.hits.length = 0;
        // drifting away from everything: curve back toward the nearest enemy
        const nx = nearest(s.x, s.z, 12);
        if (nx) {
          const a = Math.atan2(nx.z - s.z, nx.x - s.x),
            v = Math.hypot(s.vx, s.vz);
          s.vx = s.vx * 0.4 + Math.cos(a) * v * 0.6;
          s.vz = s.vz * 0.4 + Math.sin(a) * v * 0.6;
        }
      }
    }
    for (const e of s.ghost ? [] : G.enemies) {
      if (e.dead || s.hits.includes(e)) continue;
      const dx = e.x - s.x,
        dz = e.z - s.z,
        rr = e.r + s.r;
      if (dx * dx + dz * dz < rr * rr) {
        if (s.aoe && s.kind === 3) {
          s.life = 0;
          break;
        }
        hit(e, s.dmg, { kb: s.ball ? 4 : 2, ang: s.a, crit: s.crit });
        if (s.aoe) explode(s.x, s.z, s.aoe, s.dmg * 0.5, true);
        if (s.ball) {
          // bounce on to the nearest other enemy (or back off this one): it rattles around the crowd
          const nx = nearest(s.x, s.z, 9, [e]) || e,
            a =
              nx === e
                ? Math.atan2(s.z - e.z, s.x - e.x) + rand(-0.6, 0.6)
                : Math.atan2(nx.z - s.z, nx.x - s.x) + rand(-0.15, 0.15),
            v = Math.hypot(s.vx, s.vz);
          s.vx = Math.cos(a) * v;
          s.vz = Math.sin(a) * v;
          s.a = a;
          if (s.fx === 'shock' && Math.random() < 0.5) boltStrike(2, s.dmg * 0.6, e.x, e.z);
          s.hits.push(e);
          break;
        }
        if (s.fx === 'burn' && !e.dead) e.burn = 3;
        else if (s.fx === 'chain') boltStrike(4, s.dmg * 0.6, e.x, e.z);
        else if (s.fx === 'split')
          for (const da of [-0.55, 0.55])
            shot(s.x, s.z, s.a + da, {
              spd: 26,
              dmg: s.dmg * 0.6,
              size: s.r,
              pierce: 1,
              life: 0.4,
              kind: 1,
              col: s.col,
            });
        s.hits.push(e);
        if (--s.pierce < 0) {
          // ricochet: fly on to the nearest enemy not hit yet
          const nx = s.bounce > 0 && nearest(s.x, s.z, 10, s.hits);
          if (nx) {
            s.bounce--;
            s.pierce = 0;
            const a = Math.atan2(nx.z - s.z, nx.x - s.x),
              v = Math.hypot(s.vx, s.vz);
            s.a = a;
            s.vx = Math.cos(a) * v;
            s.vz = Math.sin(a) * v;
            s.life = Math.max(s.life, 0.5);
          } else s.life = -1;
          break;
        }
      }
    }
    if (s.life <= 0 && s.kind === 3 && s.life > -1 && !s.ghost) {
      explode(s.x, s.z, s.aoe, s.dmg);
      if (s.fx === 'cluster')
        for (let j = 0; j < 5; j++) {
          const a = (j / 5) * TAU + s.t;
          G.defer.push([s.x + Math.cos(a) * 2.8, s.z + Math.sin(a) * 2.8, 1.9, s.dmg * 0.35]);
        }
      s.life = -1;
    }
  }
  G.shots = G.shots.filter(s => s.life > 0);
  // fires on the ground (molotov): burn whoever stands in them, about three times a second
  for (const q of G.pools) {
    q.l += dt;
    if ((q.tick -= dt) <= 0) {
      q.tick = 0.33;
      eachInRadius(q.x, q.z, q.r, e => {
        hit(e, q.dmg, { quiet: 1, burn: 1, noCrit: 1 });
        if (!e.dead) e.burn = Math.max(e.burn || 0, 1.5);
      });
    }
    vfxFirePool(q, dt);
  }
  G.pools = G.pools.filter(q => q.l < q.d);
  const eslow = G.tslowT > 0 ? 0.5 : 1;
  for (const s of G.eshots) {
    s.life -= dt;
    s.x += s.vx * dt * eslow;
    s.z += s.vz * dt * eslow;
    const dx = s.x - p.x,
      dz = s.z - p.z;
    if (dx * dx + dz * dz < 0.75 && p.inv <= 0 && !p.dead) {
      hurt(s.dmg);
      s.life = 0;
      if (cc) COOP.usedES.add(s.id); // the host's copy flies on: don't let it hit us twice
    } else if (s.x * s.x + s.z * s.z > (ARENA + 8) ** 2) s.life = 0;
  }
  G.eshots = G.eshots.filter(s => s.life > 0);
  if (G.state !== 'play') return;
  // zones
  for (const z of G.zones) {
    if (z.m) continue; // a co-op client's copy of the host's zone: the host detonates it
    z.l += dt;
    if (z.l >= z.d) {
      z.done = true;
      if (z.f) {
        if (z.kind === 'sky') vfxSkyBolt(z.x, z.z, { w: 1.6, col: G.ups.thunderlord ? [1.3, 0.8, 1.9] : undefined });
        explode(z.x, z.z, z.r, z.dmg, false, z.kind === 'sky' ? 'elec' : 'fire');
      } else {
        ring(z.x, z.z, 0.3, z.r, 0.3, [1, 0.3, 0.2]);
        parts(z.x, 0.6, z.z, 14, 1, 0.4, 0.2, 9, 0.3);
        AU.play('boom');
        shake(0.3);
        if (!p.dead && (z.x - p.x) ** 2 + (z.z - p.z) ** 2 < z.r * z.r) hurt(z.dmg);
        coopEvent('zb', [r1(z.x), r1(z.z), r1(z.r), Math.round(z.dmg)]); // the others check themselves
      }
    }
  }
  G.zones = G.zones.filter(z => !z.done);
  if (G.state !== 'play') return;
  // pickups
  const mg2 = p.magnet * p.magnet;
  if (COOP.on && !cc) coopHostPicks(dt); // gems flying to teammates
  for (const q of G.picks) {
    if (cc || q.to || p.dead) continue; // a client only draws the host's pickups; q.to: going to a teammate
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
        if (u.pickup) heal(0.3 * u.pickup);
        AU.play('gem');
      } else if (q.k === 1) {
        const v = Math.max(1, Math.round(q.v * p.goldMul));
        if (u.midas) addXp(v * 2);
        G.coins += v;
        AU.play('coin');
        text(p.x, p.z, '+' + v + ' 🪙', '#ffd23a');
      } else if (q.k === 3) addPot();
      else {
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
  G.corpses = age(G.corpses, () => FX_LIFE.corpse);
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
    dailyTrack('time', G.t, true);
    dailyTrack('lvl', G.lvl, true);
    dailyTrack('coins', G.coins, true);
    checkAch();
  }
  // boss reward → cards → next stage
  if (G.bossReward > 0 && !G.cardsOpen) {
    G.bossReward -= dt;
    if (G.bossReward <= 0) {
      G.bossReward = 0;
      openCards('boss');
      return;
    }
  }
  if (G.pending > 0 && !(G.bossReward > 0) && !G.cardsOpen && !p.dead) openCards('level');
}
