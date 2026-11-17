'use strict';
function graveState() {
  if (!G.grave) G.grave = { souls: 0, barrier: 0, barrierUntil: 0, ghosts: [], eliteAt: -10, bossSoulAt: -10,
    relic: S.grave?.active || '', rank: S.grave?.relics?.[S.grave?.active] || 0 };
  return G.grave;
}
function graveCapacity() {
  const g = graveState();
  return 12 + 4 * (G.ups.soulvessel || 0) + (g.relic === 'lantern' ? 3 * g.rank : 0);
}
function graveEnabled() {
  return S.char === 'reaper' || graveState().relic === 'lantern' || Object.keys(GRAVE_TRAINING).some(id => G.ups[id]);
}
function graveCollect(amount) {
  if (!graveEnabled() || G.state !== 'play' || G.p.dead || choosingCards()) return;
  const g = graveState();
  g.souls = Math.min(graveCapacity(), g.souls + amount);
}
function graveRelease(power) {
  if (!graveEnabled()) return;
  const g = graveState(), souls = Math.min(graveCapacity(), g.souls), p = G.p;
  g.souls = 0;
  const R = 5.2 * p.area, damage = power * (0.6 + souls * 0.055);
  ring(p.x, p.z, 0.5, R, 0.55, [0.4, 1.05, 0.78]);
  eachInRadius(p.x, p.z, R, e => {
    hit(e, damage, { aoe: 1, quiet: 1, noCrit: 1 });
    if (!e.dead && G.ups.soulflame && souls) {
      e.graveBurn = Math.max(e.graveBurn || 0, 2 + G.ups.soulflame);
      e.graveBurnAt = G.t;
    }
  });
  if (souls && G.ups.soulguard) {
    g.barrier = Math.min(p.maxHp * (0.08 + 0.04 * G.ups.soulguard), souls * 2);
    g.barrierUntil = G.t + 8;
  }
  const level = G.ups.soulcourt || 0;
  const count = Math.min(3, (S.char === 'reaper' ? 1 : 0) + (souls && level ? Math.ceil(level / 2) : 0));
  for (let i = 0; i < count; i++) {
    if (g.ghosts.length >= 3) g.ghosts.shift();
    g.ghosts.push({ life: 6 + 2 * level, cd: 0.3 + i * 0.12, x: p.x, z: p.z, a: i * TAU / count });
  }
  text(p.x, p.z - 1, 'حصاد ' + souls + ' روح', '#8ae8c1', true);
}
function graveTick(dt) {
  if (G.state !== 'play' || G.p.dead || choosingCards()) return;
  const g = graveState(), p = G.p;
  if (G.t >= g.barrierUntil) g.barrier = 0;
  for (const e of G.enemies) if (!e.dead && e.graveBurn > 0) {
    e.graveBurn = Math.max(0, e.graveBurn - dt);
    if (G.t - e.graveBurnAt >= 0.5) {
      e.graveBurnAt = G.t;
      hit(e, (3 + 3 * (G.ups.soulflame || 0)) * p.dmgMul, { aoe: 1, quiet: 1, noCrit: 1, grave: 1 });
    }
  }
  for (const ghost of g.ghosts) {
    ghost.life -= dt; ghost.cd -= dt; ghost.a += dt * 1.7;
    if (ghost.life <= 0) continue;
    ghost.x = p.x + Math.cos(ghost.a) * 2.5; ghost.z = p.z + Math.sin(ghost.a) * 2.5;
    if (ghost.cd <= 0) {
      ghost.cd = 0.85;
      const e = nearest(ghost.x, ghost.z, 12);
      if (e) shot(ghost.x, ghost.z, Math.atan2(e.z - ghost.z, e.x - ghost.x), {
        spd: 15, dmg: (10 + 5 * (G.ups.soulcourt || 0)) * p.dmgMul,
        size: 0.2, range: 13, homing: 1, pierce: 0, kind: 2, col: [0.4, 1.1, 0.8] });
    }
  }
  g.ghosts = g.ghosts.filter(q => q.life > 0);
}
function graveAbsorb(damage) {
  const g = graveState();
  if (g.barrierUntil <= G.t) g.barrier = 0;
  const absorbed = Math.min(g.barrier, damage);
  g.barrier -= absorbed;
  return damage - absorbed;
}
/* The gravekeeper uses readable ground warnings and a locked destination, never follows a dodging player. */
function graveBossAI(e, p, dt) {
  const rage = e.hp < e.maxHp * 0.5 ? 1.25 : 1;
  e.graveDig = (e.graveDig ?? 8) - dt * rage;
  e.graveSlam = (e.graveSlam ?? 2.5) - dt * rage;
  if (e.gravePhase) {
    const b = e.gravePhase;
    b.left -= dt;
    const k = clamp(1 - b.left / 1.8, 0, 1);
    e.x = b.x + (b.tx - b.x) * k; e.z = b.z + (b.tz - b.z) * k;
    e.y = -2.8 * Math.sin(Math.PI * k); e.st = 3;
    if (b.left <= 0) { e.gravePhase = null; e.y = 0; e.st = 0; e.graveSlam = 1.8; }
    return;
  }
  e.st = 0;
  if (e.graveDig <= 0) {
    const point = clampToCircle({ x: p.x, z: p.z }, ARENA - 4);
    e.graveDig = 10;
    e.gravePhase = { left: 1.8, x: e.x, z: e.z, tx: point.x, tz: point.z };
    zone(point.x, point.z, 3.6, 1.8, e.dmg * 1.05, false);
    for (let i = 1; i < 4; i++) ring(e.x + (point.x - e.x) * i / 4, e.z + (point.z - e.z) * i / 4, 0.2, 1, 1.7, [0.55, 0.7, 0.6]);
    text(point.x, point.z, 'الحفر هنا!', '#ffbd83', true);
    return;
  }
  if (e.graveSlam <= 0) {
    e.graveSlam = 3.7;
    e.graveSwingUntil = G.t + 1;
    zone(p.x, p.z, 2.8, 1, e.dmg * 0.8, false);
    if (e.hp < e.maxHp * 0.5) zone(p.x + 5, p.z, 2.2, 1.5, e.dmg * 0.65, false);
  }
  const d = Math.hypot(p.x - e.x, p.z - e.z) || 1;
  if (!(e.graveSwingUntil > G.t) && d > 3.4) {
    e.x += (p.x - e.x) / d * 1.8 * dt; e.z += (p.z - e.z) / d * 1.8 * dt;
  }
  if (d < e.r + p.r && e.hitCd <= 0) { e.hitCd = 1; hurt(e.dmg * 0.5); }
  pushOutOfObstacles(e, e.r * 0.8);
}
const graveBaseNewRun = newRun;
newRun = function () { graveSyncTraining(); graveBaseNewRun(); graveState(); };
const graveBaseRecalc = recalc;
recalc = function () {
  graveBaseRecalc();
  const g = G.grave || { relic: S.grave?.active, rank: S.grave?.relics?.[S.grave?.active] || 0 };
  if (g.relic === 'warden') { G.p.taken *= 1 - 0.04 * g.rank; G.p.speed *= 1 - 0.03 * g.rank; }
};
const graveBaseKill = kill;
kill = function (e) {
  if (e.dead) return;
  graveBaseKill(e);
  if (COOP.remoteKill) return;
  graveCollect(e.boss ? 5 : e.elite ? 3 : 1);
  const g = graveState();
  if (e.elite && g.relic === 'hunter' && G.t - g.eliteAt >= 3) {
    g.eliteAt = G.t; G.specCd = Math.max(0, G.specCd - (1 + g.rank));
  }
};
const graveBaseHit = hit;
hit = function (e, dmg, options) {
  const alive = !e.dead, hp = e.hp;
  graveBaseHit(e, dmg, options);
  if (alive && e.boss && e.hp < hp && !options?.grave && G.t - graveState().bossSoulAt >= 2) {
    graveState().bossSoulAt = G.t; graveCollect(1);
  }
};
const graveBaseUpdate = update;
update = function (dt) {
  const before = G.t;
  graveBaseUpdate(dt);
  if (G.t > before) graveTick(dt);
};
for (const id in SPECIALS) if (id !== 'reap') {
  const f = SPECIALS[id].f;
  SPECIALS[id].f = function (p, power) { f(p, power); if (graveEnabled()) graveRelease(power * 0.55); };
}
const graveBaseBoss = makeBoss;
makeBoss = function (kind, x, z) {
  const e = graveBaseBoss(kind === 6 ? 0 : kind, x, z);
  if (kind === 6) { e.kind = 6; e.spd = 1.8; e.scale = 2.4; e.r = 2.2; e.graveDig = 5; e.graveSlam = 2.5; }
  return e;
};
function graveSaveRun() {
  const g = graveState();
  return { souls: g.souls, barrier: g.barrier, barrierUntil: g.barrierUntil, relic: g.relic, rank: g.rank,
    eliteAt: g.eliteAt, bossSoulAt: g.bossSoulAt, ghosts: g.ghosts.map(q => ({ ...q })) };
}
function graveRestoreRun(raw) {
  const g = graveState(), number = (v, max) => Number.isFinite(v) ? clamp(v, 0, max) : 0;
  if (!raw || typeof raw !== 'object') return;
  g.relic = Object.hasOwn(GRAVE_RELICS, raw.relic) ? raw.relic : '';
  g.rank = Math.min(number(raw.rank, 3) | 0, graveProfile().relics[g.relic] || 0);
  g.souls = number(raw.souls, graveCapacity());
  g.barrier = number(raw.barrier, G.p.maxHp * 0.25); g.barrierUntil = number(raw.barrierUntil, G.t + 8);
  g.eliteAt = Number.isFinite(raw.eliteAt) ? raw.eliteAt : G.t;
  g.bossSoulAt = Number.isFinite(raw.bossSoulAt) ? raw.bossSoulAt : G.t;
  g.ghosts = (Array.isArray(raw.ghosts) ? raw.ghosts : []).slice(0, 3).map(q => ({
    x: G.p.x, z: G.p.z, a: number(q?.a, TAU), life: number(q?.life, 12), cd: number(q?.cd, 1),
  }));
  recalc();
}
