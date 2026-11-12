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
function heal(v) {
  const p = G.p;
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
function hit(e, dmg, o) {
  if (e.dead) return;
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
  e.hp -= dmg;
  e.flash = 0.1;
  if (o.kb && !e.boss && e.type !== 'brute' && e.type !== 'golem') {
    e.kx += Math.cos(o.ang) * o.kb;
    e.kz += Math.sin(o.ang) * o.kb;
  }
  if (G.ups.fire && !o.burn) e.burn = 3;
  if (G.ups.frost && !o.burn) e.slowT = 2;
  if (G.ups.execute && !e.boss && e.hp > 0 && e.hp < e.maxHp * 0.08 * G.ups.execute) {
    e.hp = 0;
    text(e.x, e.z, 'إعدام', '#c8a0ff', true);
  }
  if (!o.quiet || crit) text(e.x, e.z, Math.round(dmg), crit ? '#ffd23a' : o.burn ? '#ff9a4a' : '#ffffff', crit);
  if (!o.quiet) AU.play('hit');
  if (e.hp <= 0) kill(e);
}
function kill(e) {
  e.dead = true;
  G.kills++;
  S.stats.kills++;
  dailyTrack('kill', 1);
  if (e.elite) dailyTrack('elite', 1);
  const p = G.p;
  if (p.leech && !e.boss) heal(p.leech);
  parts(e.x, 1, e.z, e.boss ? 60 : e.elite ? 18 : 7, 1, 0.35, 0.25, e.boss ? 14 : 7, e.boss ? 0.4 : 0.22);
  AU.play(e.boss ? 'boom' : 'kill');
  if (e.boss) {
    bossDown(e);
    return;
  }
  // a fallen body that tips over and sinks (drawn by render, aged in update)
  if (G.corpses.length < 60) G.corpses.push({ type: e.type, x: e.x, z: e.z, face: e.face, s: e.scale, l: 0 });
  if (e.affix === 'split') {
    const r0 = G.enemies.length;
    spawnPack(e.type, 3, e.x, e.z, 1.5);
    for (let i = r0; i < G.enemies.length; i++) G.enemies[i].scale *= 0.8;
  }
  drop(e.x, e.z, 0, e.xp);
  if (Math.random() < (e.elite ? 1 : 0.13))
    drop(e.x + rand(-0.5, 0.5), e.z + rand(-0.5, 0.5), 1, e.mini ? 15 : e.elite ? 6 : 1 + (Math.random() < 0.3));
  if (Math.random() < (e.elite ? 0.35 : 0.012)) drop(e.x, e.z + 0.6, 2, 20);
  if (G.ups.corpse && Math.random() < 0.15 * G.ups.corpse)
    G.defer.push([e.x, e.z, 2.4 * p.area, (15 + 10 * G.ups.corpse) * p.dmgMul]);
  if (e.type === 'bomber') G.defer.push([e.x, e.z, 3, 30 * p.dmgMul]);
  if (e.burn > 0 && G.ups.nova) G.defer.push([e.x, e.z, 2.6 * p.area, (12 + 10 * G.ups.nova) * p.dmgMul]);
}
function drop(x, z, kind, v) {
  if (kind === 0 && G.picks.length > 330) {
    for (const q of G.picks)
      if (q.k === 0) {
        q.v += v;
        return;
      }
  }
  G.picks.push({ x, z, k: kind, v, mag: false, t: Math.random() * 6 });
}
function explode(x, z, R, dmg, quiet) {
  ring(x, z, 0.3, R, 0.35, [1, 0.6, 0.2]);
  parts(x, 0.6, z, quiet ? 8 : 16, 1, 0.6, 0.2, 9, 0.3);
  if (!quiet) {
    AU.play('boom');
    shake(0.35);
  }
  eachInRadius(x, z, R, (e, ang) => hit(e, dmg, { aoe: 1, kb: 5, ang, quiet: 1 }));
}
function shot(x, z, ang, o) {
  if (G.shots.length > 400) return;
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
    life0: o.life || o.range / o.spd,
    hits: [],
    t: 0,
  });
}
function eShot(x, z, ang, spd, dmg) {
  if (G.eshots.length < 300)
    G.eshots.push({ x, z, vx: Math.cos(ang) * spd, vz: Math.sin(ang) * spd, dmg, life: 5, sty: eSrc });
}
/** n enemy bullets evenly around a circle: angle_j = (j+shift)/n*TAU + off. */
function eRing(x, z, n, spd, dmg, off = 0, shift = 0) {
  for (let j = 0; j < n; j++) eShot(x, z, ((j + shift) / n) * TAU + off, spd, dmg);
}
/** Fan of 2k+1 enemy bullets centred on ang, step radians apart. */
function eFan(x, z, ang, k, step, spd, dmg) {
  for (let j = -k; j <= k; j++) eShot(x, z, ang + j * step, spd, dmg);
}
function zone(x, z, r, delay, dmg, friendly) {
  G.zones.push({ x, z, r, l: 0, d: delay, dmg, f: friendly, sty: friendly ? 0 : eSrc });
}
function slashFx(ang, tier, R) {
  G.slashes.push({ a: ang, tier, R, l: 0 });
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
    const arc = [2.3, 3.6, TAU][t],
      R = d.range * p.area * (t === 2 ? 1.25 : 1);
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x,
        dz = e.z - p.z,
        dd = Math.hypot(dx, dz);
      if (dd < R + e.r && (t === 2 || angDiff(Math.atan2(dz, dx), ang) < arc / 2))
        hit(e, dmg, { kb: 7, ang: Math.atan2(dz, dx) });
    }
    slashFx(ang, t, R);
    if (ev)
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
  } else if (d.slam) {
    // thunder hammer: a heavy blow lands on (or near) the closest enemies
    const near = G.enemies.filter(e => !e.dead && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < d.range * d.range),
      n = 1 + (t === 2 ? 1 : 0) + (ev ? 3 : 0) + p.multi,
      R = (2.8 + (t >= 1 ? 0.7 : 0) + (ev ? 1 : 0)) * p.area;
    for (let i = 0; i < n; i++) {
      const e = near.length ? near[i % near.length] : null;
      zone(e ? e.x : p.x + Math.cos(ang) * 6, e ? e.z : p.z + Math.sin(ang) * 6, R, 0.22 + i * 0.08, dmg, true);
    }
  } else {
    let n = 1 + p.multi,
      pierce = d.pierce,
      aoe = d.aoe || 0,
      crit = 0;
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
      if (t >= 1) pierce++;
      if (t === 2) n++;
    }
    if (w.id === 'rocket') {
      if (t >= 1) aoe *= 1.3;
      if (t === 2) n++;
    }
    if (w.id === 'staff') {
      if (t >= 1) n++;
      if (t === 2) aoe = 1.7;
    }
    let range = d.range,
      sp = d.spread || 0.1,
      off = 0,
      bounce = d.bounce || 0;
    if (w.id === 'flame') {
      n += 3 + t;
      if (t === 2) range *= 1.3;
    }
    if (w.id === 'shuriken') {
      n += 1 + (t >= 1 ? 1 : 0);
      if (t === 2) bounce++;
    }
    if (w.id === 'spear' && t >= 1) n++;
    let fx = w.id === 'flame' ? 'burn' : '';
    if (ev) {
      if (w.id === 'flame') {
        range *= 1.7;
        off = Math.PI; // a second jet behind
      } else if (w.id === 'shuriken') {
        n = 8;
        sp = TAU / 8;
      } else if (w.id === 'spear') {
        n += 2;
        aoe = 2.2;
      }
      if (w.id === 'pistol') {
        n += 2;
        pierce += 2;
        aoe = 1.2;
      } else if (w.id === 'rifle') {
        pierce += 2;
        aoe = 1.2;
      } else if (w.id === 'axe') {
        n++;
        fx = 'return';
      } else fx = { bow: 'split', staff: 'chain', rocket: 'cluster', flame: 'burn' }[w.id] || '';
    }
    const fireCol = w.id === 'flame' && !ev ? [2, 0.75, 0.15] : col,
      shoot = a0 => {
        for (let i = 0; i < n; i++)
          shot(
            p.x + Math.cos(a0) * 0.8,
            p.z + Math.sin(a0) * 0.8,
            a0 + (i - (n - 1) / 2) * sp + (d.jit ? rand(-d.jit, d.jit) : 0),
            {
              spd: d.spd,
              dmg,
              size: d.size * (w.id === 'axe' && t === 2 ? 1.3 : 1),
              pierce,
              range: range * 1.15,
              life: d.life,
              aoe: aoe * p.area,
              homing: d.homing,
              kind: d.kind,
              col: fireCol,
              crit,
              fx,
              bounce,
            }
          );
      };
    shoot(ang);
    if (off) shoot(ang + off);
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
function boltStrike(n, dmg, fromX, fromZ) {
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
  parts(p.x, 1, p.z, 10, 0.8, 0.9, 1, 5, 0.2, 0.35);
}
function hurt(d) {
  const p = G.p;
  if (p.inv > 0 || G.state !== 'play' || G.god) return;
  d *= (1 - p.armor) * (p.taken || 1) * (G.superT > 0 ? 0.5 : 1) * buffMul('taken');
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
  p.inv = 0.22;
  shake(0.45);
  AU.play('hurt');
  vig = 0.75;
  pop($('hpbar'), 'hitf');
  text(p.x, p.z, '-' + Math.round(d), '#ff5a50', true);
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
      endRun();
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
