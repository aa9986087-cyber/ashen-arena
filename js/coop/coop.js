'use strict';
/* Co-op: up to 4 players fight the same run together over the network.

   Who runs what:
   - The HOST runs the world: waves, enemies (each chases the nearest standing player), bosses, enemy shots and
     zones, pickups, stages. 10 times a second it sends a snapshot of it ('w').
   - EVERY player runs his own hero locally: movement, weapons, abilities, cards, the damage he takes. So his own
     play feels exactly like playing alone. 10 times a second he sends his state ('c'): where he is, and the hits
     his weapons landed (worked out with his own upgrades) for the host to apply to the real enemies.
   - A CLIENT mirrors the host's world: snapshots are buffered and played back a little behind, interpolated
     (the same way watching someone's run works), so enemies glide smoothly whatever the network does. An enemy
     its own hits kill vanishes at once (the host confirms it a moment later).
   - Shared: the world, the stages, the bosses.
     Your own: hero, weapons, upgrades, the gems / coins / hearts you pick up, level-up cards (they don't pause
     the world: you're shielded meanwhile).
   - If the host leaves, the next player in the room takes the world over (coopTakeOver) and the run goes on.
   - Damage to you is judged on your device against what you see (dodged on screen = dodged).
   - Difficulty scales with the team: see coopScale. */
const COOP = {
  on: false,
  host: false,
  ch: null,
  room: '',
  me: '',
  peers: new Map(), // id → teammate {id, n, ch, w, x, z, face, moving, walk, swing, hp, maxHp, dead, …}
  hpMul: 1,
  dmgMul: 1,
  cntMul: 1,
  bossMul: 1,
  // host
  sendT: 0,
  ev: [], // our own visual effects to show the others
  sh: [], // our own shots to draw on the others' screens
  hits: [], // client: hits to send to the host
  relay: [], // host: the clients' effects and shots, passed on to the others
  zb: [], // host: detonations (zones, bombers) each player checks himself against
  given: {}, // host: each player's running totals of what he picked up [xp, gold, health, potions]
  taken: [0, 0, 0, 0], // client: the part of my totals already applied
  kd: [], // host: enemies killed since the last snapshot (clients drop a corpse)
  rvN: 0, // revivals so far (a stage cleared)
  // client
  buf: [],
  vt: null,
  ens: new Map(),
  predDead: new Map(),
  usedES: new Set(),
  depth: 0,
};
const COOP_DELAY = 0.16; // client playback delay behind the newest snapshot (s)
const COOP_TICK = 0.1; // snapshot / state rate (s)
const coopClient = () => COOP.on && !COOP.host;
/** Difficulty for n players: enemy health, numbers, damage and boss health all rise; the total
    (health × numbers) is about ×2.5 for two, ×4.5 for three and ×7 for four — a stronger team, a harder fight. */
function coopScale(n) {
  const k = Math.max(0, Math.min(3, n - 1));
  COOP.hpMul = 1 + 0.75 * k;
  COOP.cntMul = 1 + 0.4 * k;
  COOP.dmgMul = 1 + 0.15 * k;
  COOP.bossMul = 1 + 0.9 * k;
}
/** Enemy damage factor at wave gw (the same everywhere, so a client works out contact damage like the host). */
function coopDmgF(gw) {
  return (1 + gw * 0.075) * Math.pow(1.018, gw) * ((G && G.p.enemyMul) || 1) * COOP.dmgMul;
}
/** The ring is bigger in co-op (room for a team). */
function coopArena(R) {
  ARENA = R;
  edge.geometry.dispose();
  edge.geometry = new THREE.RingGeometry(R + 1.2, R + 2, 96);
  outer.geometry.dispose();
  outer.geometry = new THREE.RingGeometry(R + 2, Math.max(112, R + 60), 64);
  ground.scale.setScalar(Math.max(1, (R + 60) / 110));
  placePosts(R);
}

/* ---------- shared helpers called from the game code ---------- */
function coopEvent(kind, data) {
  if (!COOP.on) return;
  if (kind === 'zb' && COOP.host) COOP.zb.push(...data);
}
/** A blast at (x,z): hurts the local hero if he's inside; the host also tells the others to check themselves. */
function coopBoom(x, z, r, dmg) {
  const p = G.p;
  if (!p.dead && (p.x - x) ** 2 + (p.z - z) ** 2 < r * r) hurt(dmg);
  if (COOP.on && COOP.host) COOP.zb.push(r1(x), r1(z), r1(r), Math.round(dmg));
}
/** Every standing player as {x, z, r, speed, mvx, mvz} (the host's hero and the teammates). */
function coopPlayers() {
  const L = [];
  if (!G.p.dead) L.push(G.p);
  for (const q of COOP.peers.values()) if (!q.dead && q.x !== undefined) L.push(q);
  return L;
}
/** The player an enemy goes for: the nearest standing one (re-chosen every ~0.4 s). */
function coopTarget(e) {
  if ((e.tgtT = (e.tgtT || 0) - 0.016) > 0 && e.tgt && !e.tgt.dead) return e.tgt;
  e.tgtT = 0.4;
  let best = G.p,
    bd = 1e9;
  for (const q of coopPlayers()) {
    const d = (q.x - e.x) ** 2 + (q.z - e.z) ** 2;
    if (d < bd) ((bd = d), (best = q));
  }
  return (e.tgt = best);
}
/** A player to spawn the next enemies around (each gets his share of the fight). */
function coopAnchor() {
  const L = coopPlayers();
  return L.length ? L[(Math.random() * L.length) | 0] : G.p;
}
/** Client: a hit our weapons landed (our upgrades already applied) goes to the host. */
function coopHitOut(e, dmg, o) {
  if (!e.nid) return;
  let fl = 0;
  if (G.ups.fire && !o.burn) fl |= 1;
  if (e.frz > 0) fl |= 2;
  if (G.ups.frost && !o.burn) fl |= 4;
  const kb = o.kb && !e.boss ? o.kb * (G.p.kbMul || 1) : 0;
  COOP.hits.push(e.nid, Math.round(dmg), kb ? r1(Math.cos(o.ang) * kb) : 0, kb ? r1(Math.sin(o.ang) * kb) : 0, fl);
}
/** Our shot, drawn (without damage) on the teammates' screens. */
function coopShotOut(x, z, ang, o) {
  if (COOP.sh.length > 120) return;
  const c = o.col || [1, 0.85, 0.45];
  COOP.sh.push([
    r1(x),
    r1(z),
    Math.round(ang * 100) / 100,
    Math.round(o.spd),
    r1(o.size || 0.25),
    o.kind || 0,
    r1(o.life || o.range / o.spd),
    r1(c[0]),
    r1(c[1]),
    r1(c[2]),
    // how it flies: 1 bounces (the ball), 2 a thrown brick, 3 a thrown bottle; 4 its evolved form
    (o.ball ? 1 : o.lob === 'brick' ? 2 : o.lob === 'molotov' ? 3 : 0) + (o.evo ? 4 : 0),
  ]);
}
function coopGhostShots(list) {
  for (const s of list || [])
    shot(s[0], s[1], s[2], {
      spd: s[3],
      size: s[4],
      kind: s[5],
      life: s[6],
      col: [s[7], s[8], s[9]],
      dmg: 0,
      ghost: 1,
      ball: (s[10] & 3) === 1,
      lob: (s[10] & 3) === 2 ? 'brick' : (s[10] & 3) === 3 ? 'molotov' : '',
      evo: !!(s[10] & 4),
    });
}
/** Visual effects (rings, slashes, bursts, lightning…) are recorded and replayed on the teammates' screens. */
function coopFxReplay(list) {
  COOP.depth++;
  for (const [fi, args] of list || []) {
    const fn = window[LIVE_FX[fi]];
    try {
      if (fn) fn(...args);
    } catch (e) {}
  }
  COOP.depth--;
}
for (const name of LIVE_FX) {
  if (name === 'text') continue; // the others' damage numbers would only clutter the screen
  const orig = window[name];
  if (typeof orig !== 'function') continue;
  window[name] = function (...args) {
    if (COOP.on && COOP.depth === 0 && COOP.ev.length < 40) COOP.ev.push([LIVE_FX.indexOf(name), args.map(liveArg)]);
    COOP.depth++;
    try {
      return orig.apply(this, args);
    } finally {
      COOP.depth--;
    }
  };
}

/* ---------- start / end ---------- */
/** Start the run for everyone in the room. roster: [{id, n, ch}], host first. */
function coopStart(ch, roster, isHost) {
  COOP.on = true;
  COOP.host = isHost;
  COOP.ch = ch;
  COOP.me = myPid();
  COOP.hostId = roster[0].id;
  COOP.order = roster.map(r => r.id); // who hosts next if the host leaves
  COOP.peers.clear();
  for (const r of roster)
    if (r.id !== COOP.me)
      COOP.peers.set(r.id, { id: r.id, n: r.n, ch: r.ch, w: '', walk: 0, lastRx: performance.now(), buf: [] });
  Object.assign(COOP, {
    sendT: 0,
    ev: [],
    sh: [],
    hits: [],
    relay: [],
    zb: [],
    given: {},
    taken: [0, 0, 0, 0],
    lastGv: null,
    kd: [],
    rvN: 0,
    buf: [],
    vt: null,
    lastRx: performance.now(),
  });
  COOP.ens.clear();
  COOP.predDead.clear();
  COOP.usedES.clear();
  COOP.n = roster.length;
  coopScale(roster.length);
  coopArena(Math.round(58 * 1.35));
  ch.on('w', s => COOP.host || coopRecvWorld(s))
    .on('c', m => COOP.host && coopRecvClient(m))
    .on('end', m => coopEndHere(m && m.won))
    .on('bye', m => coopPeerLeft(m && m.id));
  AU.init();
  clearRun();
  newRun();
  G.state = 'play';
  enterArena();
  S.stats.runs++;
  runPerks();
  $('coopTeam').hidden = false;
  if (isHost) for (let i = 0; i < 6 + 3 * (roster.length - 1); i++) spawnAround('grunt', false, rand(13, 18));
  banner('🤝 التعاون', roster.length + ' محاربين · الوحوش أقوى بقدركم', 3.5);
}
/** Leave mid-run (the pause menu): tell the others, end it for ourselves. */
function coopLeave() {
  if (!COOP.on) return;
  try {
    COOP.ch.send('bye', { id: COOP.me });
  } catch (e) {}
  show('pause', false);
  endRun();
}
/** The host ends the run for everyone (all fallen, or the last boss beaten). */
function coopEnd(won) {
  if (!COOP.on || !COOP.host) return;
  COOP.ch.send('end', { won: won ? 1 : 0 });
  coopEndHere(won);
}
function coopEndHere(won) {
  if (!COOP.on) return;
  G.won = !!won;
  show('cards', false);
  G.cardsOpen = false;
  if (G.p.dead) G.p.hp = 0;
  endRun();
}
/** Called by endRun: back to a solo world. */
function coopClose() {
  if (!COOP.on) return;
  COOP.on = false;
  const ch = COOP.ch;
  setTimeout(() => {
    try {
      ch.close();
    } catch (e) {}
  }, 400);
  COOP.ch = null;
  for (const q of COOP.peers.values()) if (q.rig && q.rig.g) scene.remove(q.rig.g);
  COOP.peers.clear();
  coopScale(1);
  coopArena(58);
  $('coopTeam').hidden = true;
  G.p.dead = false;
}
function coopPeerLeft(id) {
  if (!COOP.on || !id || id === COOP.me) return;
  COOP.order = (COOP.order || []).filter(x => x !== id);
  const q = COOP.peers.get(id);
  if (q) {
    if (q.rig && q.rig.g) scene.remove(q.rig.g);
    COOP.peers.delete(id);
  }
  if (!COOP.host && id === COOP.hostId) return coopHostGone(q);
  if (!q) return;
  toast('🚪 ' + (q.n || 'لاعب') + ' طلع من المعركة');
  if (!COOP.host && !COOP.peers.size) return;
  if (COOP.host) coopCheckAllDown();
}

/** The host left: the next player in the room (the same choice on every device) becomes the host. */
function coopHostGone(q) {
  const next = COOP.order.find(id => id === COOP.me || COOP.peers.has(id));
  if (!next || (next !== COOP.me && !COOP.peers.size)) {
    toast('المضيف طلع وما بقى أحد معك');
    return coopEndHere(false);
  }
  COOP.hostId = next;
  // a new host's clock: start the snapshot playback afresh
  COOP.buf = [];
  COOP.vt = null;
  COOP.evTs = 0;
  COOP.lastRx = performance.now() + 3000;
  if (next === COOP.me) {
    coopTakeOver();
    toast('👑 ' + ((q && q.n) || 'المضيف') + ' طلع، وصرت أنت المضيف. المعركة مستمرة');
  } else toast('👑 ' + ((q && q.n) || 'المضيف') + ' طلع، و' + (COOP.peers.get(next).n || 'لاعب') + ' صار المضيف');
}
/** We become the host: the world we were mirroring becomes the real one, and we run it from here. */
function coopTakeOver() {
  COOP.host = true;
  const old = G.enemies;
  G.enemies = [];
  G.boss = null;
  G.bossOn = false;
  COOP.boss = null;
  let top = G.nidC || 0;
  for (const m of old) {
    if (m.dead) continue;
    top = Math.max(top, m.nid || 0);
    let e;
    if (m.boss) {
      e = makeBoss(m.kind || 0, m.x, m.z);
      G.boss = e;
      G.bossOn = true;
    } else e = spawn(m.type, m.x, m.z, m.elite);
    Object.assign(e, { nid: m.nid, hp: m.hp, maxHp: m.maxHp, face: m.face || 0 });
  }
  G.nidC = top + 1;
  // the mirrored shots and zones go; the pickups stay (the snapshots carry their values)
  G.eshots = [];
  G.zones = G.zones.filter(z => !z.m);
  for (const q of G.picks) {
    q.v = q.v || 1;
    q.mag = false;
    q.to = null;
  }
  COOP.ens.clear();
  COOP.predDead.clear();
  COOP.usedES.clear();
  // carry on the old host's totals, so nobody's count jumps
  COOP.given = COOP.lastGv ? JSON.parse(JSON.stringify(COOP.lastGv)) : {};
  Object.assign(COOP, { sendT: 0, ev: [], sh: [], hits: [], relay: [], zb: [], kd: [] });
  for (const q of COOP.peers.values()) {
    q.buf = [];
    q.vt = undefined;
    q.lastRx = performance.now();
  }
  coopCheckAllDown();
}

/* ---------- the safe ring while choosing cards ---------- */
const SAFE_R = 5;
/** Host: a player choosing cards stands in a safe ring: enemies (not the boss) that walk into it are pushed
    back out to its edge, and enemy bullets that reach it fade. */
function coopSafeZones(dt) {
  const zones = [];
  if (G.cardsOpen && !G.p.dead) zones.push(G.p);
  for (const q of COOP.peers.values()) if (q.cards && !q.dead && q.x !== undefined) zones.push(q);
  for (const z of zones) {
    for (const e of G.enemies) {
      if (e.dead || e.boss) continue;
      const dx = e.x - z.x,
        dz = e.z - z.z,
        d = Math.hypot(dx, dz),
        R = SAFE_R + (e.r || 0.6);
      if (d < R) {
        const k = d > 0.01 ? 1 / d : 0,
          ux = d > 0.01 ? dx * k : Math.cos(e.slot || 0),
          uz = d > 0.01 ? dz * k : Math.sin(e.slot || 0);
        e.x = z.x + ux * R;
        e.z = z.z + uz * R;
      }
    }
    G.eshots = G.eshots.filter(s => (s.x - z.x) ** 2 + (s.z - z.z) ** 2 > SAFE_R * SAFE_R);
  }
  // shown to everyone: the snapshot carries who is choosing (the 'pl' rows' card flag)
}

/* ---------- falling and rising ---------- */
function coopDie() {
  const p = G.p;
  if (p.dead) return;
  p.dead = true;
  p.hp = 0;
  PM.lastWep = G.weapons[0];
  COOP.stash = { weapons: G.weapons, ups: G.ups, allies: G.allies };
  G.weapons = [];
  G.ups = {};
  G.allies = [];
  show('cards', false);
  G.cardsOpen = false;
  banner('💀 سقطت', 'تتفرج على رفاقك… ترجع في المرحلة الجاية', 3);
  AU.play('over');
  if (COOP.host) coopCheckAllDown();
}
function coopRevive() {
  const p = G.p;
  if (!p.dead || !COOP.stash) return;
  Object.assign(G, { weapons: COOP.stash.weapons, ups: COOP.stash.ups, allies: COOP.stash.allies });
  COOP.stash = null;
  p.dead = false;
  p.hp = p.maxHp * 0.5;
  p.inv = 2.5;
  banner('✨ رجعت للمعركة', '', 2);
  AU.play('legend');
  ring(p.x, p.z, 0.5, 5, 0.6, [1, 0.9, 0.4]);
}
/** Host: a stage cleared brings every fallen player back. */
function coopStageCleared() {
  if (!COOP.host) return;
  COOP.rvN++;
  coopRevive();
}
function coopCheckAllDown() {
  if (!COOP.host) return;
  if (G.p.dead && [...COOP.peers.values()].every(q => q.dead)) setTimeout(() => coopEnd(false), 1500);
}

/* ---------- per frame ---------- */
function coopFrame(dt) {
  if (!COOP.on) return;
  const now = performance.now();
  if (COOP.host) {
    for (const q of COOP.peers.values())
      if (now - q.lastRx > 9000) {
        coopPeerLeft(q.id);
        break;
      }
    coopInterpPeers(dt);
  } else {
    // no word from the host for a while: he's gone (closed the game) — the next player takes over
    if (now - COOP.lastRx > 6000) coopPeerLeft(COOP.hostId);
    if (!COOP.on) return;
    if (G.state === 'play') coopMirror(dt);
  }
  // the fallen watch a teammate
  const p = G.p;
  if (p.dead) {
    const t = [...COOP.peers.values()].find(q => !q.dead && q.x !== undefined);
    if (t) {
      p.x += (t.x - p.x) * Math.min(1, dt * 4);
      p.z += (t.z - p.z) * Math.min(1, dt * 4);
    }
  }
  if ((COOP.sendT -= dt) <= 0) {
    COOP.sendT = COOP_TICK;
    if (COOP.host) coopSendWorld();
    else coopSendState();
  }
  if ((COOP.hudT = (COOP.hudT || 0) - dt) <= 0) {
    COOP.hudT = 0.25;
    coopHud();
  }
}

/* ---------- host ---------- */
function coopSendWorld() {
  const p = G.p,
    E = [];
  for (const e of G.enemies) {
    if (e.dead || e.boss) continue;
    let fl = e.elite ? 1 : 0;
    if (e.frz > 0) fl |= 2;
    if (e.burn > 0) fl |= 4;
    if (e.flash > 0) fl |= 8;
    E.push(e.nid, ETYPES.indexOf(e.type), r1(e.x), r1(e.z), r1(e.face), fl, Math.round(e.hp), Math.round(e.maxHp));
    if (E.length >= 8 * 260) break;
  }
  const b = G.boss && !G.boss.dead ? G.boss : null,
    es = [],
    zn = [],
    pk = [];
  for (const s of G.eshots) {
    es.push(s.id, r1(s.x), r1(s.z), r1(s.vx), r1(s.vz), Math.round(s.dmg), s.sty | 0);
    if (es.length >= 7 * 200) break;
  }
  for (const z of G.zones) if (!z.f) zn.push(r1(z.x), r1(z.z), r1(z.r), r2(z.l), r2(z.d), z.sty | 0);
  for (const q of G.picks) {
    pk.push(q.k, r1(q.x), r1(q.z), Math.round(q.v * 10) / 10);
    if (pk.length >= 4 * 240) break;
  }
  const pl = [
    [
      COOP.me,
      r2(p.x),
      r2(p.z),
      r1(p.face),
      p.moving ? 1 : 0,
      r2(p.swing || 0),
      Math.round(p.hp),
      Math.round(p.maxHp),
      p.dead ? 1 : 0,
      S.char,
      (G.weapons[0] || PM.lastWep || {}).id || '',
      G.lvl,
      S.name || 'المضيف',
      G.cardsOpen && !p.dead ? 1 : 0,
    ],
  ];
  const tNow = performance.now();
  for (const q of COOP.peers.values()) {
    if (q.x === undefined) continue;
    // where it is now, by its last report and its speed (so its motion stays even between reports)
    const age = Math.min(0.15, (tNow - q.lastRx) / 1000);
    pl.push([
      q.id,
      r2(q.x + (q.vx || 0) * age),
      r2(q.z + (q.vz || 0) * age),
      r1(q.face),
      q.moving ? 1 : 0,
      r2(q.swing || 0),
      Math.round(q.hp),
      Math.round(q.maxHp),
      q.dead ? 1 : 0,
      q.ch,
      q.w,
      q.lvl,
      q.n,
      q.cards ? 1 : 0,
    ]);
  }
  const s = {
    ts: r2(tNow / 1000),
    vr: BUILD,
    e: E,
    b: b
      ? [
          b.nid,
          b.kind,
          r2(b.x),
          r2(b.z),
          r1(b.face),
          Math.round(b.hp),
          Math.round(b.maxHp),
          b.scale,
          b.st | 0,
          r2(b.y || 0),
        ]
      : null,
    es,
    zn,
    pk,
    pl,
    g: [
      r1(G.t),
      G.stage,
      G.abyss ? 1 : 0,
      G.depth,
      G.wave,
      G.bossesRun,
      G.kills,
      0,
      COOP.rvN,
      Math.round(coopDmgF(gwave()) * easeIn(gwave()) * 100) / 100, // what an enemy's hit is worth now
      r1(G.calmT || 0),
      r1(G.waveT || 0),
      G.cycle || 0,
      G.sk || 0,
      G.bossDone ? 1 : 0,
    ],
    bn: G.bossName,
    ev: COOP.ev.splice(0),
    sh: COOP.sh.splice(0),
    r: COOP.relay.splice(0),
    zb: COOP.zb.splice(0),
    gv: COOP.given,
    kd: COOP.kd.splice(0),
  };
  COOP.ch.send('w', s);
}
function coopRecvClient(m) {
  if (!m || !m.id || m.id === COOP.me) return;
  let q = COOP.peers.get(m.id);
  if (!q) return; // not in this run's roster
  const now = performance.now();
  q.lastRx = now;
  const P = m.p;
  Object.assign(q, {
    x: P[0],
    z: P[1],
    face: P[2],
    moving: P[3],
    swing: P[4],
    hp: P[5],
    maxHp: P[6],
    dead: !!P[7],
    ch: m.ch,
    w: m.w,
    lvl: m.l,
    mg: m.mg || 2.5,
    cards: !!m.cd,
    speed: m.sp || 6,
  });
  q.mvx = m.mv ? m.mv[0] : 0;
  q.mvz = m.mv ? m.mv[1] : 0;
  q.vx = q.mvx * q.speed;
  q.vz = q.mvz * q.speed;
  q.r = 0.6;
  q.buf.push({ ts: m.ts, x: P[0], z: P[1], face: P[2], moving: P[3], swing: P[4] });
  if (q.buf.length > 8) q.buf.shift();
  if (q.dead) coopCheckAllDown();
  // its hits, on the real enemies
  const H = m.h || [];
  if (H.length) {
    const byId = new Map();
    for (const e of G.enemies) if (!e.dead) byId.set(e.nid, e);
    for (let i = 0; i < H.length; i += 5) {
      const e = byId.get(H[i]);
      if (e) coopApplyHit(e, H[i + 1], H[i + 2], H[i + 3], H[i + 4]);
    }
  }
  // its effects and shots: shown here, and passed on to the others
  coopFxReplay(m.ev);
  coopGhostShots(m.sh);
  if ((m.ev && m.ev.length) || (m.sh && m.sh.length)) COOP.relay.push([m.id, m.ev || [], m.sh || []]);
}
/** Host: a teammate's hit, already worked out on his device, lands on the real enemy. */
function coopApplyHit(e, dmg, kx, kz, fl) {
  if (e.dead || !(dmg > 0)) return;
  if (e.ward > 0) {
    const a = Math.min(e.ward, dmg);
    e.ward -= a;
    dmg -= a;
    e.wardT = 4;
  }
  e.hp -= dmg;
  e.flash = 0.1;
  if ((kx || kz) && !e.boss && e.type !== 'brute' && e.type !== 'golem') {
    e.kx += kx;
    e.kz += kz;
  }
  if (fl & 1) e.burn = 3;
  if (fl & 2 && !e.boss) e.frz = Math.max(e.frz || 0, 0.5);
  if (fl & 4) e.slowT = 2;
  if (e.hp <= 0) {
    COOP.remoteKill = true;
    try {
      kill(e);
    } finally {
      COOP.remoteKill = false;
    }
  }
}
/** Host: pickups fly to the teammate whose magnet reaches them; what he picks up (gems, coins, hearts) is his. */
function coopHostPicks(dt) {
  const peers = [...COOP.peers.values()].filter(q => !q.dead && q.x !== undefined);
  for (const q of G.picks) {
    if (q.got) continue;
    if (!q.to && !q.mag) {
      // the nearest player whose magnet reaches it takes it (the host too): not the first one in the list, or
      // with everyone together the gems always went to the same teammate and the last to join got none
      const P = G.p;
      let best = null,
        bd =
          !P.dead && (P.x - q.x) ** 2 + (P.z - q.z) ** 2 < P.magnet * P.magnet
            ? (P.x - q.x) ** 2 + (P.z - q.z) ** 2
            : 1e9;
      const host = bd < 1e9;
      for (const t of peers) {
        const d2 = (t.x - q.x) ** 2 + (t.z - q.z) ** 2;
        if (d2 < (t.mg || 2.5) ** 2 && d2 < bd) {
          bd = d2;
          best = t;
        }
      }
      if (best) q.to = best.id;
      else if (host) q.mag = true; // the host's own loop flies it to him
    }
    if (!q.to) continue;
    const t = COOP.peers.get(q.to);
    if (!t || t.dead) {
      q.to = null;
      continue;
    }
    const dx = t.x - q.x,
      dz = t.z - q.z,
      d2 = dx * dx + dz * dz,
      d = Math.sqrt(d2) || 0.01,
      s = Math.min(d / dt, 20 + G.t * 0.01);
    q.x += (dx / d) * s * dt;
    q.z += (dz / d) * s * dt;
    if (d2 < 1.2) {
      q.got = true;
      // the player's running totals: [experience, gold, health, potions]; every snapshot carries them, so a lost
      // message loses nothing (the next one brings the same totals)
      const tot = (COOP.given[q.to] = COOP.given[q.to] || [0, 0, 0, 0]);
      tot[q.k === 3 ? 3 : q.k] += q.k === 3 ? 1 : q.v;
    }
  }
}
/** Host: draw each teammate a little behind his reports, interpolated on his own clock (smooth motion). */
function coopInterpPeers(dt) {
  for (const q of COOP.peers.values()) {
    const B = q.buf;
    if (!B.length) continue;
    const target = B[B.length - 1].ts - COOP_DELAY;
    if (q.vt === undefined || Math.abs(target - q.vt) > 1) q.vt = target;
    else q.vt += dt + (target - q.vt) * Math.min(1, dt * 1.5);
    let i = B.length - 1;
    while (i > 0 && B[i - 1].ts > q.vt) i--;
    const b = B[i],
      a = i > 0 ? B[i - 1] : b,
      span = b.ts - a.ts,
      k = span > 0 ? clamp((q.vt - a.ts) / span, 0, 1) : 1;
    q.rx = lerp(a.x, b.x, k);
    q.rz = lerp(a.z, b.z, k);
    q.rface = lerpAng(a.face, b.face, k);
    q.rmoving = b.moving;
    q.rswing = b.swing;
  }
}

/* ---------- client ---------- */
function coopSendState() {
  const p = G.p;
  COOP.ch.send('c', {
    id: COOP.me,
    ts: r2(performance.now() / 1000),
    p: [
      r2(p.x),
      r2(p.z),
      r1(p.face),
      p.moving ? 1 : 0,
      r2(p.swing || 0),
      Math.round(p.hp),
      Math.round(p.maxHp),
      p.dead ? 1 : 0,
    ],
    mv: [r2(IN.mvx || 0), r2(IN.mvz || 0)],
    cd: G.cardsOpen && !p.dead ? 1 : 0, // choosing cards: the host keeps enemies out of a ring around us
    sp: r1(p.speed),
    mg: r1(p.magnet),
    ch: S.char,
    w: (G.weapons[0] || PM.lastWep || {}).id || '',
    l: G.lvl,
    h: COOP.hits.splice(0),
    ev: COOP.ev.splice(0),
    sh: COOP.sh.splice(0),
  });
}
function coopRecvWorld(s) {
  if (!s || s.ts === undefined) return;
  COOP.lastRx = performance.now();
  const B = COOP.buf;
  if (B.length && s.ts <= B[B.length - 1].ts) return; // late or duplicate
  B.push(s);
  if (B.length > 12) B.shift();
  if (s.gv) coopTakeGifts(s.gv);
}
/** Client: what the host handed us (gems, gold, hearts, potions) since last time, from its running totals. */
function coopTakeGifts(gv) {
  COOP.lastGv = gv; // (kept, so whoever takes over as host carries the same totals on)
  const tot = gv[COOP.me];
  if (!tot) return;
  // only what's new: a late snapshot (older totals) gives nothing and doesn't lower the mark
  const had = COOP.taken,
    d = tot.map((v, i) => Math.max(0, v - (had[i] || 0)));
  COOP.taken = tot.map((v, i) => Math.max(v, had[i] || 0));
  const p = G.p;
  if (d[0] > 0.01) {
    if (!p.dead) addXp(d[0]);
    if (G.ups.pickup) heal(0.3 * G.ups.pickup, true);
    AU.play('gem');
  }
  if (d[1] > 0.01) {
    const c = Math.max(1, Math.round(d[1] * p.goldMul));
    if (G.ups.midas) addXp(c * 2);
    G.coins += c;
    AU.play('coin');
    text(p.x, p.z, '+' + c + ' 🪙', '#ffd23a');
  }
  if (d[2] > 0.01) {
    heal(d[2], true);
    AU.play('heart');
    text(p.x, p.z, '+' + Math.round(d[2]), '#6dff8a', true);
  }
  for (let i = 0; i < Math.round(d[3]); i++) addPot();
}
/** Client, each frame before update(): the host's world as of a moment ago, interpolated between snapshots. */
function coopMirror(dt) {
  const B = COOP.buf;
  if (!B.length) return;
  const target = B[B.length - 1].ts - COOP_DELAY;
  if (COOP.vt === null || Math.abs(target - COOP.vt) > 1.2) COOP.vt = target;
  else COOP.vt += dt + (target - COOP.vt) * Math.min(1, dt * 1.5);
  let i = B.length - 1;
  while (i > 0 && B[i - 1].ts > COOP.vt) i--;
  const sb = B[i],
    sa = i > 0 ? B[i - 1] : sb,
    span = sb.ts - sa.ts,
    k = span > 0 ? clamp((COOP.vt - sa.ts) / span, 0, 1) : 1,
    p = G.p,
    nowMs = performance.now();
  // once per snapshot as playback passes it: events (effects, shots, blasts, gifts, deaths, shared progress)
  for (const q of B)
    if (q.ts <= COOP.vt && q.ts > (COOP.evTs || 0)) {
      COOP.evTs = q.ts;
      coopFxReplay(q.ev);
      coopGhostShots(q.sh);
      for (const [id, ev, sh] of q.r || [])
        if (id !== COOP.me) {
          coopFxReplay(ev);
          coopGhostShots(sh);
        }
      for (let o = 0; o < (q.zb || []).length; o += 4) {
        const [x, z, r, dmg] = q.zb.slice(o, o + 4);
        if (!p.dead && (p.x - x) ** 2 + (p.z - z) ** 2 < r * r) hurt(dmg);
      }
      for (const nid of q.kd || [])
        if (!COOP.predDead.has(nid)) {
          const e = COOP.ens.get(nid);
          if (e && G.corpses.length < 60) {
            G.corpses.push({ type: e.type, x: e.x, z: e.z, face: e.face, s: e.scale, l: 0 });
            parts(e.x, 1, e.z, 6, 1, 0.35, 0.25, 6, 0.22);
          }
        }
      coopShared(q.g, q.bn);
    }
  // enemies, each gliding along its own path between the two snapshots
  const prev = new Map();
  for (let o = 0; o < sa.e.length; o += 8) prev.set(sa.e[o], o);
  const list = [],
    alive = new Set(),
    dmF = sb.g[9] || 1;
  for (const [nid, t] of COOP.predDead) if (nowMs - t > 1500) COOP.predDead.delete(nid); // the host didn't agree: back
  for (let o = 0; o < sb.e.length; o += 8) {
    const id = sb.e[o];
    alive.add(id);
    if (COOP.predDead.has(id)) continue;
    const type = ETYPES[sb.e[o + 1]] || 'grunt',
      fl = sb.e[o + 5];
    let e = COOP.ens.get(id);
    if (!e)
      COOP.ens.set(
        id,
        (e = {
          nid: id,
          t: Math.random() * 9,
          slot: Math.random(),
          flash: 0,
          frz: 0,
          atkT: 0,
          oCd: 0,
          hitCd: 0,
          kx: 0,
          kz: 0,
          burn: 0,
        })
      );
    const q = prev.get(id),
      D = EN[type];
    e.type = type;
    e.elite = !!(fl & 1);
    e.frz = fl & 2 ? 0.2 : 0;
    e.burn = fl & 4 ? 0.2 : 0;
    if (fl & 8) e.flash = Math.max(e.flash, 0.06);
    e.scale = D.sc * (e.elite ? 1.35 : 1);
    e.r = D.r * (e.elite ? 1.3 : 1);
    e.spd = D.spd;
    e.dmg = D.dmg * EN_DMG * dmF * (e.elite ? 1.5 : 1);
    e.hp = sb.e[o + 6];
    e.maxHp = sb.e[o + 7];
    e.dead = false;
    if (q !== undefined) {
      e.x = lerp(sa.e[q + 2], sb.e[o + 2], k);
      e.z = lerp(sa.e[q + 3], sb.e[o + 3], k);
      e.face = lerpAng(sa.e[q + 4], sb.e[o + 4], k);
    } else {
      e.x = sb.e[o + 2];
      e.z = sb.e[o + 3];
      e.face = sb.e[o + 4];
    }
    e.t += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.oCd > 0) e.oCd -= dt;
    if (e.atkT > 0) e.atkT -= dt;
    // touching it hurts: judged here, against what we see
    if (e.hitCd > 0) e.hitCd -= dt;
    else if (!p.dead && e.frz <= 0 && G.contactCd <= 0 && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < (e.r + p.r) ** 2) {
      G.contactCd = CONTACT_CD;
      e.hitCd = 0.5;
      e.atkT = ATK_T;
      hurt(e.dmg);
      if (G.ups.thorns) hit(e, e.dmg * 0.4 * G.ups.thorns, { aoe: 1, quiet: 1, noCrit: 1 });
    }
    list.push(e);
  }
  for (const id of COOP.ens.keys()) if (!alive.has(id)) COOP.ens.delete(id);
  // the boss
  let bo = null;
  if (sb.b && !COOP.predDead.has(sb.b[0])) {
    bo =
      COOP.boss && COOP.boss.nid === sb.b[0]
        ? COOP.boss
        : (COOP.boss = { boss: true, t: 0, y: 0, flash: 0, frz: 0, oCd: 0, r: 2.1, kx: 0, kz: 0 });
    const ab = sa.b && sa.b[0] === sb.b[0] ? sa.b : sb.b;
    bo.nid = sb.b[0];
    if (bo.kind !== sb.b[1]) {
      bo.kind = sb.b[1];
      bossMesh.geometry = GEO['boss' + bo.kind];
    }
    bo.x = lerp(ab[2], sb.b[2], k);
    bo.z = lerp(ab[3], sb.b[3], k);
    bo.face = lerpAng(ab[4], sb.b[4], k);
    bo.hp = sb.b[5];
    bo.maxHp = sb.b[6];
    bo.scale = sb.b[7];
    bo.st = sb.b[8];
    bo.y = lerp(ab[9], sb.b[9], k);
    bo.dmg = 30 * dmF;
    bo.dead = false;
    bo.t += dt;
    if (bo.oCd > 0) bo.oCd -= dt;
    if (bo.hitCd > 0) bo.hitCd -= dt;
    else if (!p.dead && bo.st !== 3 && (bo.x - p.x) ** 2 + (bo.z - p.z) ** 2 < (bo.r + p.r) ** 2) {
      bo.hitCd = 0.5;
      hurt(bo.dmg);
    }
    if (!bossMesh.visible) {
      bossMesh.visible = true;
      MUS.boss = true;
    }
    $('bossbar').hidden = false;
    $('bossbar').querySelector('span').textContent = sb.bn || '';
  } else if (COOP.boss) {
    COOP.boss = null;
    bossMesh.visible = false;
    $('bossbar').hidden = true;
    MUS.boss = false;
  }
  G.boss = bo;
  G.bossOn = !!bo;
  G.enemies = bo ? list.concat([bo]) : list;
  // enemy shots fly on from the newest snapshot at their own speed (ones that already hit us stay gone)
  const age = Math.max(0, COOP.vt - sb.ts);
  G.eshots.length = 0;
  for (let o = 0; o < sb.es.length; o += 7) {
    const id = sb.es[o];
    if (COOP.usedES.has(id)) continue;
    G.eshots.push({
      id,
      x: sb.es[o + 1] + sb.es[o + 3] * age,
      z: sb.es[o + 2] + sb.es[o + 4] * age,
      vx: sb.es[o + 3],
      vz: sb.es[o + 4],
      dmg: sb.es[o + 5],
      sty: sb.es[o + 6],
      life: 1,
    });
  }
  if (COOP.usedES.size > 600) COOP.usedES = new Set([...COOP.usedES].slice(-300));
  // the host's danger zones (ours, the friendly ones, stay as they are)
  G.zones = G.zones.filter(z => !z.m);
  for (let o = 0; o < sb.zn.length; o += 6)
    G.zones.push({
      m: 1,
      x: sb.zn[o],
      z: sb.zn[o + 1],
      r: sb.zn[o + 2],
      l: sb.zn[o + 3] + age,
      d: sb.zn[o + 4],
      sty: sb.zn[o + 5],
      f: false,
    });
  // pickups (drawn only; the host hands them out)
  const P = (G.picks = G.picks.length === sb.pk.length / 4 ? G.picks : []);
  for (let o = 0, j = 0; o < sb.pk.length; o += 4, j++) {
    const q = P[j] || (P[j] = { t: Math.random() * 6 });
    q.k = sb.pk[o];
    q.x = sb.pk[o + 1];
    q.z = sb.pk[o + 2];
    q.v = sb.pk[o + 3];
    q.t += dt;
  }
  // teammates
  const seen = new Set();
  const pa = new Map((sa.pl || []).map(r => [r[0], r]));
  for (const r of sb.pl || []) {
    if (r[0] === COOP.me) continue;
    seen.add(r[0]);
    let q = COOP.peers.get(r[0]);
    if (!q) COOP.peers.set(r[0], (q = { id: r[0], walk: 0, buf: [] }));
    const a = pa.get(r[0]) || r;
    q.rx = q.x = lerp(a[1], r[1], k);
    q.rz = q.z = lerp(a[2], r[2], k);
    q.rface = q.face = lerpAng(a[3], r[3], k);
    q.rmoving = q.moving = r[4];
    q.rswing = q.swing = r[5];
    Object.assign(q, { hp: r[6], maxHp: r[7], dead: !!r[8], ch: r[9], w: r[10], lvl: r[11], n: r[12], cards: !!r[13] });
    q.plT = nowMs;
  }
  // a teammate the host listed but no longer does (for 2 s) has left
  for (const q of [...COOP.peers.values()])
    if (q.plT && nowMs - q.plT > 2000 && q.id !== COOP.hostId) coopPeerLeft(q.id);
}
/** Client: the host's shared progress (stage, bosses, experience, revivals, the clock). */
function coopShared(g, bn) {
  if (!g) return;
  const [t, stage, ab, depth, wave, bosses, kills, , rvN] = g;
  G.t = t;
  G.wave = wave;
  // kept in step so a client can take over as host (coopTakeOver)
  G.waveT = g[11] || 0;
  G.cycle = g[12] || 0;
  G.sk = g[13] || 0;
  G.bossDone = !!g[14];
  G.bossName = bn || G.bossName;
  G.calmT = g[10] || 0;
  if (bosses > G.bossesRun) {
    // a boss fell: everyone gets the boss's reward cards
    G.bossesRun = bosses;
    S.stats.bosses++;
    S.stats.maxBoss = Math.max(S.stats.maxBoss, G.bossesRun);
    S.sp++;
    save();
    G.slow = 1.2;
    toast('هزمتم ' + G.bossName + '. نقطة مهارة ✨ +1');
    if (!G.p.dead) G.bossReward = 1.6;
  }
  if (stage !== G.stage || !!ab !== G.abyss || depth !== G.depth) {
    G.stage = stage;
    G.abyss = !!ab;
    G.depth = depth;
    if (!G.abyss) setStage(stage);
    if (!G.p.dead) heal(G.p.maxHp * 0.3);
    banner(G.abyss ? 'العمق ' + (G.depth + 1) : STAGES[G.stage].n, 'المرحلة ' + (G.stage + 1), 3);
  }
  if (rvN > COOP.rvN) {
    COOP.rvN = rvN;
    coopRevive();
  }
}

/* ---------- teammates on screen ---------- */
function coopRender(now) {
  const dt = 1 / 60;
  for (const q of COOP.peers.values()) {
    if (q.rx === undefined) continue;
    const key = q.ch + ':' + q.w;
    if (!q.rig || q.rigKey !== key) {
      q.rig = q.rig || {};
      q.rigKey = key;
      buildRig(q.rig, q.ch, {
        id: WEP[q.w] ? q.w : CHARS[q.ch] ? CHARS[q.ch].wep : 'sword',
        lvl: Math.min(9, 1 + ((q.lvl || 1) >> 2)),
      });
    }
    q.walk += (q.rmoving ? 1 : 0) * dt * 9;
    poseRig(
      q.rig,
      { x: q.rx, z: q.rz, face: q.rface, moving: q.rmoving, walk: q.walk, swing: q.rswing || 0 },
      q.w,
      true,
      now
    );
    q.rig.g.visible = !q.dead;
  }
}
/** Names and health bars over the teammates' heads. */
function coopTags(fx) {
  // the safe ring around a teammate choosing cards
  const now = performance.now() / 1000;
  for (const q of COOP.peers.values()) {
    if (!q.cards || q.dead || q.rx === undefined) continue;
    fx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * TAU,
        [x, y] = proj(q.rx + Math.cos(a) * SAFE_R, 0.1, q.rz + Math.sin(a) * SAFE_R);
      i ? fx.lineTo(x, y) : fx.moveTo(x, y);
    }
    fx.strokeStyle = 'rgba(120, 200, 255, ' + (0.55 + 0.25 * Math.sin(now * 4)) + ')';
    fx.lineWidth = 3;
    fx.setLineDash([10, 8]);
    fx.stroke();
    fx.setLineDash([]);
    fx.fillStyle = 'rgba(80, 160, 255, 0.08)';
    fx.fill();
  }
  fx.font = '800 13px Tajawal,sans-serif';
  for (const q of COOP.peers.values()) {
    if (q.rx === undefined) continue;
    const [x, y] = proj(q.rx, 3.4, q.rz);
    if (x < -50 || y < -50 || x > W + 50 || y > H + 50) continue;
    fx.fillStyle = q.dead ? '#aaa' : '#fff';
    fx.strokeStyle = 'rgba(0,0,0,0.75)';
    fx.lineWidth = 3;
    const label = (q.dead ? '💀 ' : q.cards ? '🃏 ' : '') + (q.n || '');
    cvText(fx, label, x, y - 8, true);
    cvText(fx, label, x, y - 8);
    if (!q.dead && q.maxHp) {
      // health as a number, coloured by how much is left
      const s = '❤️ ' + Math.max(0, Math.ceil(q.hp)) + ' / ' + Math.round(q.maxHp);
      fx.font = '800 12px Tajawal,sans-serif';
      fx.fillStyle = hpCol(q.hp / q.maxHp);
      cvText(fx, s, x, y + 8, true);
      cvText(fx, s, x, y + 8);
      fx.font = '800 13px Tajawal,sans-serif';
    }
  }
}
const hpCol = k => (k > 0.5 ? '#7cf08a' : k > 0.25 ? '#f2c94c' : '#ff6a5a');
/** The team panel: each teammate's hero, health and level. */
function coopHud() {
  const box = $('coopTeam'),
    sig = [...COOP.peers.values()]
      .map(q => q.id + (q.dead ? 'x' : '') + Math.ceil(q.hp || 0) + '/' + Math.round(q.maxHp || 0) + ':' + q.lvl)
      .join('|');
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = '';
  for (const q of COOP.peers.values()) {
    const row = el('div', 'ctRow' + (q.dead ? ' dead' : ''));
    row.append(
      el('i', '', q.dead ? '💀' : (CHARS[q.ch] || {}).i || '⚔️'),
      el('b', '', q.n || 'لاعب'),
      el('small', '', 'م' + (q.lvl || 1))
    );
    const hp = el(
      'span',
      'ctHp',
      q.dead ? 'سقط' : '❤️ ' + Math.max(0, Math.ceil(q.hp || 0)) + ' / ' + Math.round(q.maxHp || 0)
    );
    hp.style.color = q.dead ? '#aaa' : hpCol((q.hp || 0) / (q.maxHp || 1));
    row.appendChild(hp);
    box.appendChild(row);
  }
}
