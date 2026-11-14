'use strict';
/* Targeting, damage, kills, drops, projectiles, player weapons and abilities. */
/** Call fn(enemy, angleFromCentre) for each live enemy overlapping the circle (x,z,R). pad=false ignores the enemy radius. */
function eachInRadius(x, z, R, fn, pad = true) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.x - x,
      dz = e.z - z,
      rr = pad ? R + e.r : R;
    if (dx * dx + dz * dz < rr * rr) fn(e, Math.atan2(dz, dx));
  }
}
/** Push a body (anything with x, z) of radius r out of the trees, rocks and other solid decor. */
function pushOutOfObstacles(o, r) {
  for (const b of OBST) {
    const dx = o.x - b.x,
      dz = o.z - b.z,
      rr = r + b.r;
    if (dx > rr || dx < -rr || dz > rr || dz < -rr) continue;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 0.001;
    o.x = b.x + (dx / d) * rr;
    o.z = b.z + (dz / d) * rr;
  }
}
/** Restore player health, capped at max. */
/** Online, while you choose your cards the world goes on for the others, but you stand outside the fight:
    you deal no damage, take none, and don't heal (except what the card you pick gives). */
const choosingCards = () => COOP.on && G.cardsOpen && !G.p.dead;
function heal(v, fromCard) {
  const p = G.p;
  if (choosingCards() && !fromCard) return;
  p.hp = Math.min(p.maxHp, p.hp + v);
}
function nearest(x, z, range, skip) {
  let best = null,
    bd = range * range;
  for (const e of G.enemies) {
    if (e.dead || (skip && skip.includes(e))) continue;
    const dx = e.x - x,
      dz = e.z - z,
      d = dx * dx + dz * dz - e.r * e.r;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}
const HIT_COL = [1, 0.85, 0.6]; // a blow's spark when the weapon gives no colour
function hit(e, dmg, o) {
  if (e.dead || choosingCards()) return;
  o = o || {};
  let crit = false;
  if (!o.noCrit && ((G.buffT > 0 && G.buff.crit) || Math.random() < G.p.crit + (o.crit || 0))) {
    dmg *= G.p.critMul || 2;
    crit = true;
  }
  if (G.superT > 0) dmg *= 2;
  dmg *= buffMul('dmg');
  if (G.ups.rage && G.p.hp < G.p.maxHp * 0.35) dmg *= 1 + 0.25 * G.ups.rage;
  if (crit && G.ups.vamp) heal(G.ups.vamp);
  if (e.boss || e.elite) dmg *= G.p.bossMul || 1;
  const iceL = (G.ups.ice || 0) + (G.ups.frost || 0), // frost freezes on a critical (the old ice card)
    shockL = (G.ups.shock || 0) + Math.ceil((G.ups.bolt || 0) / 2); // lightning pulses (the old shock card)
  if (crit && iceL && !e.boss) {
    e.frz = Math.max(e.frz || 0, 0.4 + 0.2 * iceL);
    vfxSparks(e.x, 1, e.z, 8, [0.7, 1.1, 1.8], 4, 0.3, 0.45);
  }
  if (shockL && !o.aoe && ++G.shockN >= 14 - 2 * Math.min(4, shockL)) {
    G.shockN = 0;
    ring(e.x, e.z, 0.3, 3 * G.p.area, 0.3, [0.5, 0.9, 1.5]);
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * TAU,
        R = 3 * G.p.area;
      vfxBolt(
        [
          [e.x, 1, e.z],
          [e.x + Math.cos(a) * R, 0.4, e.z + Math.sin(a) * R],
        ],
        { w: 0.4, life: 0.16, rough: 0.4 }
      );
    }
    AU.play('bolt');
    eachInRadius(
      e.x,
      e.z,
      3 * G.p.area,
      q => q !== e && hit(q, (12 + 8 * shockL) * G.p.dmgMul, { aoe: 1, quiet: 1, noCrit: 1 })
    );
  }
  if (e.type === 'shield' && !e.boss && !o.aoe) {
    dmg *= 0.4;
    AU.play('clang');
  }
  if (e.ward > 0) {
    const a = Math.min(e.ward, dmg);
    e.ward -= a;
    dmg -= a;
    e.wardT = 4;
    if (dmg <= 0) {
      e.flash = 0.1;
      return;
    }
  }
  if (COOP.on && !COOP.host) coopHitOut(e, dmg, o); // our damage, worked out here: the host applies it for real
  e.hp -= dmg;
  e.flash = 0.1;
  if (o.kb && !e.boss && e.type !== 'brute' && e.type !== 'golem') {
    e.kx += Math.cos(o.ang) * o.kb * (G.p.kbMul || 1);
    e.kz += Math.sin(o.ang) * o.kb * (G.p.kbMul || 1);
  }
  if (G.ups.fire && !o.burn) e.burn = 3;
  if (G.ups.frost && !o.burn) e.slowT = 2;
  if (G.ups.execute && !e.boss && e.hp > 0 && e.hp < e.maxHp * 0.08 * G.ups.execute) {
    e.hp = 0;
    text(e.x, e.z, 'إعدام', '#c8a0ff', true);
  }
  if (!o.quiet || crit) text(e.x, e.z, Math.round(dmg), crit ? '#ffd23a' : o.burn ? '#ff9a4a' : '#ffffff', crit);
  if (!o.quiet && !o.burn) vfxHit(e.x, e.z, o.col || HIT_COL, crit);
  if (!o.quiet) AU.play('hit');
  if (e.hp <= 0) {
    const extra = -e.hp;
    kill(e);
    // overkill: what was left over hits the closest other enemy
    if (G.ups.overkill && !o.ok && extra > 1) {
      const t = nearest(e.x, e.z, 5, [e]);
      if (t) hit(t, extra * 0.6 * G.ups.overkill, { ok: 1, aoe: 1, quiet: 1, noCrit: 1 });
    }
  }
}
function kill(e) {
  e.dead = true;
  G.kills++;
  S.stats.kills++;
  // the stage's countdown (the host keeps it in co-op and tells the others)
  if (!e.boss && !G.bossOn && !(COOP.on && !COOP.host)) G.sk = (G.sk || 0) + 1;
  dailyTrack('kill', 1);
  if (e.elite) dailyTrack('elite', 1);
  const p = G.p,
    mine = !COOP.remoteKill; // a teammate's kill applied by the host: none of our on-kill upgrades
  if (COOP.on && !COOP.host) COOP.predDead.set(e.nid, performance.now()); // gone here at once; the host confirms
  if (COOP.on && COOP.host && !e.boss) COOP.kd.push(e.nid); // the clients drop its corpse
  if (mine && p.leech && !e.boss) heal(p.leech);
  parts(e.x, 1, e.z, e.boss ? 60 : e.elite ? 12 : 4, 1, 0.35, 0.25, e.boss ? 14 : 7, e.boss ? 0.4 : 0.22);
  vfxKill(e.x, e.z, e.boss || e.elite);
  AU.play(e.boss ? 'boom' : 'kill');
  if (e.boss) {
    if (!COOP.on || COOP.host) bossDown(e);
    return;
  }
  // a fallen body that tips over and sinks (drawn by render, aged in update)
  if (G.corpses.length < 60) G.corpses.push({ type: e.type, x: e.x, z: e.z, face: e.face, s: e.scale, l: 0 });
  drop(e.x, e.z, 0, e.xp);
  if (Math.random() < (e.elite ? 1 : 0.13))
    drop(e.x + rand(-0.5, 0.5), e.z + rand(-0.5, 0.5), 1, e.mini ? 15 : e.elite ? 6 : 1 + (Math.random() < 0.3));
  if (Math.random() < (e.elite ? 0.35 : 0.012)) drop(e.x, e.z + 0.6, 2, 20);
  // a healing potion: sometimes from an elite, always from a mini-boss, rarely from anyone
  if (Math.random() < (e.mini ? 1 : e.elite ? 0.15 : 0.003)) drop(e.x - 0.6, e.z, 3, 1);
  const gold = 0.06 * (G.ups.goldrush || 0) + (G.ups.midas ? 0.1 : 0);
  if (gold && Math.random() < gold) drop(e.x + rand(-0.6, 0.6), e.z + rand(-0.6, 0.6), 1, 1 + (Math.random() < 0.4));
  if (!mine) return;
  if (G.ups.chain && Math.random() < 0.2 * G.ups.chain) boltStrike(3, (10 + 6 * G.ups.chain) * p.dmgMul, e.x, e.z);
  if (G.ups.bloodlust) {
    G.lust = Math.min(20, G.lust + 1);
    G.lustT = 4;
  }
  if (G.ups.shards && Math.random() < 0.3)
    for (let i = 0; i < 4; i++)
      shot(e.x, e.z, (i / 4) * TAU + Math.random(), {
        spd: 16,
        dmg: (8 + 5 * G.ups.shards) * p.dmgMul,
        size: 0.3,
        pierce: 2,
        life: 0.45,
        kind: 2,
        col: [0.6, 1.2, 1.9],
      });
  if (G.ups.corpse && Math.random() < 0.15 * G.ups.corpse)
    G.defer.push([e.x, e.z, 2.4 * p.area, (15 + 10 * G.ups.corpse) * p.dmgMul]);
  if (e.type === 'bomber') G.defer.push([e.x, e.z, 3, 30 * p.dmgMul]);
  if (e.burn > 0 && G.ups.nova) G.defer.push([e.x, e.z, 2.6 * p.area, (12 + 10 * G.ups.nova) * p.dmgMul]);
}
function drop(x, z, kind, v) {
  if (COOP.on && !COOP.host) return; // pickups belong to the host's world
  if (kind === 0 && G.picks.length > 330) {
    for (const q of G.picks)
      if (q.k === 0) {
        q.v += v;
        return;
      }
  }
  G.picks.push({ x, z, k: kind, v, mag: false, t: Math.random() * 6 });
}
/** look: 'fire' (default) | 'elec' | 'void' | 'wind' — how the blast is drawn. */
function explode(x, z, R, dmg, quiet, look) {
  if (look === 'elec') {
    ring(x, z, 0.3, R, 0.3, [0.5, 0.8, 1.6]);
    vfxP({ x, y: 0.6, z, life: 0.25, s: R * 1.6, s1: R * 2.2, r: 0.6, g: 0.85, b: 1.8 });
    vfxSparks(x, 0.5, z, 26, [0.6, 0.9, 1.8], 9, 0.3, 0.5);
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * TAU;
      vfxBolt(
        [
          [x, 0.4, z],
          [x + Math.cos(a) * R, 0.2, z + Math.sin(a) * R],
        ],
        { w: 0.5, life: 0.18, rough: 0.35 }
      );
    }
  } else if (look === 'void') {
    ring(x, z, 0.3, R, 0.4, [0.8, 0.4, 1.4]);
    vfxP({ x, y: 1.2, z, life: 0.3, s: R * 1.8, s1: R * 2.6, r: 1, g: 0.4, b: 1.8 });
    vfxSparks(x, 1.2, z, 40, [1, 0.45, 1.8], 12, 0.35, 0.7);
    vfxSmoke(x, 0.6, z, 8, [0.18, 0.05, 0.3, 0.55], R * 0.5, 2.2, 1.2, 0.8);
  } else if (look === 'wind') {
    ring(x, z, 0.3, R, 0.35, [0.9, 0.9, 0.8]);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      vfxP({
        smoke: 1,
        x,
        y: 0.5,
        z,
        vx: Math.cos(a) * R * 3,
        vy: rand(0.3, 1.2),
        vz: Math.sin(a) * R * 3,
        life: rand(0.5, 0.8),
        s: 1.2,
        s1: 2.4,
        r: 0.7,
        g: 0.68,
        b: 0.6,
        a: 0.5,
        drag: 3,
        fade: 1,
      });
    }
    vfxSparks(x, 0.8, z, 12, [1.2, 1.2, 1.1], 8, 0.22, 0.4);
  } else {
    ring(x, z, 0.3, R, 0.35, [1, 0.6, 0.2]);
    vfxExplosion(x, z, R, R > 6);
  }
  if (!quiet) {
    AU.play('boom');
    shake(0.35);
  }
  eachInRadius(x, z, R, (e, ang) => hit(e, dmg, { aoe: 1, kb: 5, ang, quiet: 1 }));
}
function shot(x, z, ang, o) {
  if (G.shots.length > 400) return;
  if (COOP.on && !o.ghost) coopShotOut(x, z, ang, o);
  G.shots.push({
    x,
    z,
    vx: Math.cos(ang) * o.spd,
    vz: Math.sin(ang) * o.spd,
    a: ang,
    dmg: o.dmg,
    r: o.size,
    pierce: o.pierce || 0,
    life: o.life || o.range / o.spd,
    aoe: o.aoe || 0,
    homing: o.homing || 0,
    kind: o.kind || 0,
    col: o.col,
    crit: o.crit || 0,
    fx: o.fx || '',
    bounce: (o.bounce || 0) + (o.kind === 3 ? 0 : G.ups.bounce || 0),
    ghost: !!o.ghost,
    lob: o.lob || '', // thrown in an arc: 'brick' or 'molotov' (lands at the end of its life)
    pool: o.pool || 0,
    poolT: o.poolT || 0,
    kb: o.kb || 0,
    evo: !!o.evo,
    ball: !!o.ball, // bounces off enemies and the arena's edge
    life0: o.life || o.range / o.spd,
    hits: [],
    t: 0,
  });
}
function eShot(x, z, ang, spd, dmg) {
  if (G.eshots.length < 300)
    G.eshots.push({
      id: (G.esC = (G.esC || 0) + 1),
      x,
      z,
      vx: Math.cos(ang) * spd,
      vz: Math.sin(ang) * spd,
      dmg,
      life: 5,
      sty: eSrc,
    });
}
/** n enemy bullets evenly around a circle: angle_j = (j+shift)/n*TAU + off. */
function eRing(x, z, n, spd, dmg, off = 0, shift = 0) {
  for (let j = 0; j < n; j++) eShot(x, z, ((j + shift) / n) * TAU + off, spd, dmg);
}
/** Fan of 2k+1 enemy bullets centred on ang, step radians apart. */
function eFan(x, z, ang, k, step, spd, dmg) {
  for (let j = -k; j <= k; j++) eShot(x, z, ang + j * step, spd, dmg);
}
/** kind (friendly zones): 'meteor' / 'star' fall as burning rocks, 'sky' is lightning from a storm cloud. */
function zone(x, z, r, delay, dmg, friendly, kind) {
  const q = { x, z, r, l: 0, d: delay, dmg, f: friendly, sty: friendly ? 0 : eSrc, kind };
  G.zones.push(q);
  if (kind === 'sky') vfxStorm(x, z, delay + 0.45);
  else if (kind === 'meteor' || kind === 'star')
    vfxEmit(
      x,
      z,
      delay,
      (em, dt) => {
        // ride along the falling rock (same path the renderer draws it on)
        const k = Math.min(1, q.l / q.d);
        em.mx = q.x + (1 - k) * 6;
        em.my = (1 - k) * 26 + 1;
        em.mz = q.z - (1 - k) * 4;
        vfxMeteorTrail(em, dt);
      },
      { size: kind === 'meteor' ? 1.3 : 0.8 }
    );
}
/** A melee swing's crescent at (x,z): the attacker's place, so a teammate's swing shows around him, not you. */
function slashFx(ang, tier, R, x, z) {
  G.slashes.push({ a: ang, tier, R, l: 0, x: x === undefined ? G.p.x : x, z: z === undefined ? G.p.z : z });
}
function fire(w, ang) {
  const p = G.p,
    d = WEP[w.id],
    L = w.lvl,
    t = wTier(L),
    ev = w.evo && EVO[w.id],
    dmg = d.dmg * (1 + 0.22 * (L - 1)) * p.dmgMul * (ev ? 1.5 : 1),
    col = ev ? EVOC : TIERC[t];
  p.aim = ang;
  p.swing = 1;
  AU.play(w.id);
  if (d.melee) {
    // a blow in front: the katana is quick and light, the club heavy and sends them flying
    const club = w.id === 'hammer',
      full = ev && club,
      arc = full ? TAU : d.arc[t],
      R = d.range * p.area * (t === 2 ? 1.25 : 1),
      kb = d.kb * (club && t === 2 ? 1.4 : 1);
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x,
        dz = e.z - p.z,
        dd = Math.hypot(dx, dz);
      if (dd < R + e.r && (arc >= TAU || angDiff(Math.atan2(dz, dx), ang) < arc / 2))
        hit(e, dmg, { kb, ang: Math.atan2(dz, dx) });
    }
    slashFx(ang, arc >= TAU ? 2 : Math.min(t, 1), R, r1(p.x), r1(p.z));
    if (club) {
      shake(0.25);
      // the spiked club: a shockwave rolls out all around
      if (ev) {
        ring(p.x, p.z, 0.5, R * 2.2, 0.4, [1.6, 0.8, 0.3]);
        eachInRadius(p.x, p.z, R * 2.2, e => {
          const a = Math.atan2(e.z - p.z, e.x - p.x);
          hit(e, dmg * 0.4, { kb: 22, ang: a, quiet: 1 });
        });
      }
    } else if (ev)
      for (let i = 0; i < 6; i++)
        shot(p.x, p.z, ang + (i / 6) * TAU, {
          spd: 20,
          dmg: dmg * 0.5,
          size: 0.7,
          pierce: 6,
          life: 0.55,
          kind: 5,
          col,
          fx: 'burn',
        });
    for (let i = 0; i < p.multi; i++)
      shot(p.x, p.z, ang + (i - (p.multi - 1) / 2) * 0.3, {
        spd: 22,
        dmg: dmg * 0.6,
        size: 0.6,
        pierce: 4,
        life: 0.5,
        kind: 5,
        col,
      });
  } else if (d.chain) {
    // lightning whip: chains that jump between enemies (frozen for a moment when evolved)
    const jumps = 3 + t + (ev ? 2 : 0),
      chains = (t === 2 ? 2 : 1) + (ev ? 1 : 0) + p.multi;
    for (let i = 0; i < chains; i++) {
      const b0 = G.bolts.length;
      boltStrike(jumps, i ? dmg * 0.7 : dmg, p.x, p.z);
      if (ev)
        for (const b of G.bolts.slice(b0))
          for (const q of b.pts.slice(1)) eachInRadius(q[0], q[1], 0.5, e => (e.frz = Math.max(e.frz || 0, 0.35)));
    }
  } else if (d.laser) {
    // a beam: everything in line takes it at once (the sun cannon: three wide burning beams)
    const n = (t === 2 ? 2 : 1) + (ev ? 1 : 0) + p.multi,
      len = d.range * (1 + 0.1 * t),
      wid = d.width * (1 + 0.35 * t) * (ev ? 1.6 : 1) * (p.sizeMul || 1);
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * 0.32;
      laserBeam(p.x, p.z, a, len, wid, i ? dmg * 0.8 : dmg, ev);
    }
  } else if (d.lob) {
    // thrown in an arc at the nearest enemy (or ahead): a brick lands heavy, a bottle leaves fire
    const tg = nearest(p.x, p.z, d.range),
      dist = tg ? Math.min(d.range, Math.hypot(tg.x - p.x, tg.z - p.z)) : d.range * 0.7,
      n = 1 + (d.lob === 'molotov' ? (t >= 1 ? 1 : 0) + (ev ? 1 : 0) : (t === 2 ? 1 : 0) + (ev ? 1 : 0)) + p.multi;
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * 0.35,
        D = dist * (i ? rand(0.75, 1.1) : 1),
        T = 0.55 + D * 0.02;
      shot(p.x, p.z, a, {
        spd: D / T,
        dmg,
        size: d.lob === 'brick' ? (ev ? 0.85 : 0.5 + 0.1 * t) : 0.3,
        pierce: 99,
        life: T,
        kind: 7,
        col,
        lob: d.lob,
        aoe: (d.aoe || 0) * p.area * (1 + 0.25 * t) * (ev ? 1.8 : 1),
        pool: d.pool ? d.pool * p.area * (t === 2 ? 1.3 : 1) * (ev ? 1.6 : 1) : 0,
        poolT: d.poolT ? d.poolT * (t === 2 ? 1.3 : 1) * (ev ? 1.4 : 1) : 0,
        kb: d.kb || 0,
        evo: !!ev,
      });
    }
  } else {
    vfxMuzzle(p.x + Math.cos(ang) * 0.9, p.z + Math.sin(ang) * 0.9, col);
    let n = (d.pellets || 1) + p.multi,
      pierce = d.pierce + (d.pierce < 50 ? p.pierceAdd || 0 : 0),
      aoe = d.aoe || 0,
      crit = 0,
      size = d.size,
      spd = d.spd,
      life = d.life;
    if (w.id === 'axe') n += t;
    if (w.id === 'bow') {
      n += t;
      if (t === 2) pierce += 3;
    }
    if (w.id === 'pistol') {
      if (t >= 1) crit = 0.2;
      if (t === 2) n++;
    }
    if (w.id === 'rifle') {
      // the shotgun: more pellets and they pierce, then a wider, longer burst
      if (t >= 1) {
        n += 2;
        pierce++;
      }
    }
    if (w.id === 'rocket') {
      if (t >= 1) aoe *= 1.3;
      if (t === 2) n++;
    }
    if (w.id === 'staff') {
      if (t >= 1) n++;
      if (t === 2) aoe = 1.7;
    }
    if (w.id === 'ball') {
      if (t >= 1) n++;
      if (t === 2) {
        size *= 1.3;
        spd *= 1.2;
      }
    }
    let range = d.range * (w.id === 'rifle' && t === 2 ? 1.3 : 1),
      sp = (d.spread || 0.1) * (w.id === 'rifle' && t === 2 ? 1.25 : 1),
      bounce = d.bounce || 0;
    if (w.id === 'shuriken') n += (t >= 1 ? 1 : 0) + (t === 2 ? 1 : 0);
    if (w.id === 'spear') {
      if (t >= 1) n++;
      if (t === 2) size *= 1.35;
    }
    let fx = d.back ? 'return' : '';
    if (ev) {
      if (w.id === 'shuriken') {
        // the shadow star: the usual volley, and eight stars all around that ricochet
        for (let i = 0; i < 8; i++)
          shot(p.x, p.z, ang + (i / 8) * TAU, {
            spd: d.spd * 0.8 * (p.pspd || 1),
            dmg: dmg * 0.7,
            size: 0.32,
            pierce: 1,
            range: d.range,
            kind: 2,
            col,
            bounce: 2,
          });
      } else if (w.id === 'spear') {
        n += 2;
        size *= 1.3;
        aoe = 2.2;
      } else if (w.id === 'pistol') {
        n += 2;
        pierce += 2;
        aoe = 1.2;
      } else if (w.id === 'rifle') {
        // the rotary cannon: one hard-hitting stream
        n = 1 + p.multi;
        sp = 0.08;
        pierce += 2;
        range *= 1.6;
      } else if (w.id === 'axe') {
        n += 2;
        size *= 1.3;
      } else if (w.id === 'ball') {
        n += 2;
        fx = 'shock';
      } else fx = { bow: 'split', staff: 'chain', rocket: 'cluster' }[w.id] || fx;
    }
    const kind = d.kind,
      all = sp * n >= TAU - 0.01; // all around: one of them goes straight at the target
    for (let i = 0; i < n; i++)
      shot(
        p.x + Math.cos(ang) * 0.8,
        p.z + Math.sin(ang) * 0.8,
        ang + (all ? i : i - (n - 1) / 2) * sp + (d.jit ? rand(-d.jit, d.jit) : 0),
        {
          spd: spd * (p.pspd || 1),
          dmg,
          size: size * (w.id === 'axe' && t === 2 ? 1.3 : 1) * (p.sizeMul || 1),
          pierce,
          range: range * 1.15,
          life,
          aoe: aoe * p.area,
          homing: d.homing,
          kind,
          col,
          crit,
          fx,
          bounce,
          ball: w.id === 'ball',
        }
      );
  }
  if (G.ups.legend && w === G.weapons[0] && ++p.legCount % 3 === 0) {
    for (let i = 0; i < 8; i++)
      shot(p.x, p.z, ang + (i / 8) * TAU, {
        spd: 20,
        dmg: 30 * p.dmgMul,
        size: 0.5,
        pierce: 99,
        life: 0.7,
        kind: 5,
        col: TIERC[2],
      });
    ring(p.x, p.z, 0.5, 3, 0.25, [1, 0.8, 0.2]);
  }
}
/** The laser: everything within `wid` of the line from (x,z) along `ang` for `len` is hit at once. */
function laserBeam(x, z, ang, len, wid, dmg, ev) {
  const ux = Math.cos(ang),
    uz = Math.sin(ang);
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.x - x,
      dz = e.z - z,
      along = dx * ux + dz * uz;
    if (along < 0 || along > len) continue;
    if (Math.abs(dx * uz - dz * ux) < wid + e.r) {
      hit(e, dmg, { kb: 1.5, ang, quiet: 0 });
      if (ev && !e.dead) e.burn = 3;
    }
  }
  vfxLaser(x, z, ang, len, wid, ev);
}
/** A thrown brick or bottle lands. */
function lobLand(s) {
  if (s.lob === 'brick') {
    // a heavy stone (an iron beam when evolved): hurts and throws back everything around where it lands
    const R = Math.max(1.2, s.aoe);
    eachInRadius(s.x, s.z, R, e => {
      hit(e, s.dmg, { kb: s.kb, ang: Math.atan2(e.z - s.z, e.x - s.x) });
      if (s.evo && !e.dead && !e.boss) e.frz = Math.max(e.frz || 0, 0.6);
    });
    ring(s.x, s.z, 0.3, R * 1.3, 0.35, [1.2, 0.9, 0.6]);
    vfxKill(s.x, s.z, s.evo);
    shake(s.evo ? 0.35 : 0.15);
    AU.play('boom');
  } else {
    // the bottle breaks: the ground catches fire (the barrel first bursts)
    if (s.evo) explode(s.x, s.z, s.pool * 0.8, s.dmg * 3, true);
    firePool(s.x, s.z, s.pool, s.poolT, s.dmg);
    vfxSparks(s.x, 0.4, s.z, 10, [1.8, 0.8, 0.2], 5, 0.25, 0.5);
    AU.play('flame');
  }
}
/** A fire on the ground (the molotov): it burns whoever stands in it, a few times a second. */
function firePool(x, z, r, dur, dmg) {
  G.pools.push({ x, z, r, l: 0, d: dur, dmg, tick: 0 }); // it burns (drawn by its twin below)
  firePoolFx(r1(x), r1(z), r1(r), r1(dur));
}
/** The fire seen on the ground: no damage of its own, and shown on the teammates' screens too. */
function firePoolFx(x, z, r, dur) {
  G.pools.push({ x, z, r, l: 0, d: dur, dmg: 0, tick: 0, vis: 1 });
}
/** Lightning that jumps between enemies. sky: the bolt card — it falls from a storm cloud onto the first one. */
function boltStrike(n, dmg, fromX, fromZ, sky) {
  if (G.ups.thunderlord) {
    n += 2;
    dmg *= 2;
  }
  let x = fromX,
    z = fromZ;
  const pts = [[x, z]],
    done = [];
  for (let i = 0; i < n; i++) {
    const e = nearest(x, z, i ? 7 : 14, done);
    if (!e) break;
    done.push(e);
    pts.push([e.x, e.z]);
    x = e.x;
    z = e.z;
    hit(e, dmg, { aoe: 1, quiet: 1, noCrit: 1 });
    parts(x, 1, z, 3, 0.6, 0.85, 1, 5, 0.15, 0.3);
  }
  if (pts.length > 1) {
    G.bolts.push({ pts, l: 0 });
    AU.play('bolt');
    const lord = G.ups.thunderlord,
      col = lord ? [1.3, 0.8, 1.9] : [0.45, 0.75, 1.6],
      w = lord ? 1.5 : 1;
    let from = 0;
    if (sky) {
      vfxStorm(pts[1][0], pts[1][1], 0.9, lord);
      vfxSkyBolt(pts[1][0], pts[1][1], { col, w: w * 1.2 });
      from = 1;
    }
    const chain = pts.slice(from).map(q => [q[0], 1.2, q[1]]);
    if (chain.length > 1) vfxBolt(chain, { col, w, life: 0.3 });
    for (const q of pts.slice(1)) vfxSparks(q[0], 1.1, q[1], 5, col, 5, 0.25, 0.35);
  }
}
function dash() {
  const p = G.p;
  if (G.state !== 'play' || p.dashCd > 0 || p.dashT > 0) return;
  let mx = IN.mvx,
    mz = IN.mvz;
  if (!mx && !mz) {
    mx = Math.sin(p.face);
    mz = Math.cos(p.face);
  }
  p.dx = mx;
  p.dz = mz;
  p.dashT = 0.18;
  p.dashCd = p.dashMax;
  p.inv = Math.max(p.inv, 0.3);
  AU.play('dash');
  if (G.ups.vortexdash) {
    G.holes.push({ x: p.x, z: p.z, l: 0, d: 1.2, mini: 1 });
    vfxTornado(p.x, p.z, 1.25, 0.9);
  }
  parts(p.x, 1, p.z, 10, 0.8, 0.9, 1, 5, 0.2, 0.35);
}
const HIT_CAP = 0.4;
function hurt(d) {
  const p = G.p;
  if (p.inv > 0 || G.state !== 'play' || G.god || p.dead || choosingCards()) return;
  d *= (1 - p.armor) * (p.taken || 1) * (G.superT > 0 ? 0.5 : 1) * buffMul('taken');
  // fair play: no single blow takes more than 40% of your health (you die of mistakes, not of one unlucky hit)
  d = Math.min(d, p.maxHp * HIT_CAP);
  p.shieldRe = 5;
  if (p.shield > 0) {
    const a = Math.min(p.shield, d);
    p.shield -= a;
    d -= a;
    AU.play('shield');
    if (d <= 0) {
      p.inv = 0.2;
      return;
    }
  }
  p.hp -= d;
  p.inv = 0.22 + (p.iframe || 0);
  shake(0.45);
  AU.play('hurt');
  vig = 0.75;
  pop($('hpbar'), 'hitf');
  text(p.x, p.z, '-' + Math.round(d), '#ff5a50', true);
  if (G.ups.second && p.hp > 0 && p.hp < p.maxHp * 0.3 && G.secondT <= 0) {
    G.secondT = 60;
    heal(p.maxHp * (0.2 + 0.1 * G.ups.second));
    ring(p.x, p.z, 0.4, 4, 0.5, [0.4, 1.5, 0.6]);
    vfxHeal(p.x, p.z, 36);
    text(p.x, p.z - 1, 'نفَس ثانٍ', '#6dff8a', true);
  }
  if (p.hp <= 0 && G.ups.phoenix && !G.phoenixUsed) {
    // the phoenix: rise at full health in a ring of fire, once
    G.phoenixUsed = 1;
    p.hp = p.maxHp;
    p.inv = 3;
    banner('العنقاء', 'نهضت من الرماد', 1.8);
    cine('العنقاء');
    AU.play('legend');
    shake(1);
    explode(p.x, p.z, 10, 320 * p.dmgMul);
    vfxPhoenix(p.x, p.z);
    eachInRadius(p.x, p.z, 10, e => (e.burn = 4));
    return;
  }
  if (p.hp <= 0) {
    if (G.revives > 0) {
      G.revives--;
      p.hp = p.maxHp * 0.5;
      p.inv = 2;
      banner('نهضت من جديد', '', 1.6);
      AU.play('legend');
      explode(p.x, p.z, 8, 200 * p.dmgMul);
    } else {
      p.hp = 0;
      if (COOP.on) coopDie();
      else endRun();
    }
  }
}
let vig = 0;
function addXp(v) {
  G.xp += v * G.p.xpMul;
  while (G.xp >= G.need) {
    G.xp -= G.need;
    G.lvl++;
    G.need = xpNeed(G.lvl);
    G.pending++;
    levelUpFx();
  }
}
/** A pillar of light rising from the hero, with a ring on the ground. */
function levelUpFx() {
  const p = G.p;
  ring(p.x, p.z, 0.4, 4.5, 0.6, [0.4, 1.3, 1.1]);
  for (let i = 0; i < 34 && G.parts.length < 600; i++) {
    const a = Math.random() * TAU,
      r = Math.random() * 0.7;
    G.parts.push({
      x: p.x + Math.cos(a) * r,
      y: rand(0, 1),
      z: p.z + Math.sin(a) * r,
      vx: 0,
      vy: rand(7, 14),
      vz: 0,
      l: 0,
      m: rand(0.5, 0.9),
      s: rand(0.12, 0.26),
      r: 0.5,
      g: 1.6,
      b: 1.4,
    });
  }
}

/* Healing potions: you don't start with any. You get them from a level card or a bottle dropped on the map
   (elites sometimes, bosses always), carry up to POT_MAX, and drink one with the button whenever you like. */
const POT_MAX = 3,
  POT_CD = 1.5; // a short gap between two drinks
function addPot(x, z) {
  const p = G.p;
  if (G.pots >= POT_MAX) {
    // a full bag: the bottle heals on the spot instead
    heal(p.maxHp * 0.15);
    text(p.x, p.z, 'الجرع مليانة: شفاء', '#6dff8a');
    AU.play('heart');
    return;
  }
  G.pots++;
  AU.play('gem');
  text(p.x, p.z, '+1 جرعة ⚗️', '#ff7ab8', true);
  pop($('bPot'));
}
function potion() {
  const p = G.p;
  if (G.state !== 'play' || p.dead || G.cardsOpen || G.potCd > 0) return;
  if (!(G.pots > 0)) return toast('ما معك جرع. تلقاها بالبطاقات أو يطيحها الأعداء الأقوياء');
  if (p.hp >= p.maxHp) return toast('صحتك كاملة');
  G.pots--;
  G.potCd = POT_CD;
  const v = Math.round(p.maxHp * 0.35);
  heal(v);
  text(p.x, p.z, '+' + v, '#6dff8a', true);
  ring(p.x, p.z, 0.5, 4, 0.5, [0.3, 1, 0.5]);
  parts(p.x, 1.2, p.z, 24, 0.3, 1, 0.45, 6, 0.25, 0.8);
  AU.play('heart');
}
