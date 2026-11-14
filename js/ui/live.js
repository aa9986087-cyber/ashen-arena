'use strict';
/* 📺 Live: who is online and what they are doing (presence on the 'ashen-live' channel), watching a duel, and
   watching someone's run. A player only streams its run while somebody watches (viewers ping every 3 s);
   the stream is ~8 snapshots a second on the channel 'run-<pid>', drawn by the normal renderer in 'watch' state. */
const LIVE = { ch: null, me: null, list: [], trackT: 0, stream: null, until: 0, sendT: 0, watch: null, viewers: {} };
const ETYPES = Object.keys(EN);
async function liveConnect() {
  if (LIVE.ch || LIVE.busy) return;
  LIVE.busy = true;
  try {
    // presence is joined once ("I'm online") and never re-tracked: Supabase rate-limits presence updates hard.
    // What each player is doing travels as an ordinary broadcast ('sts') every few seconds instead.
    LIVE.me = { id: myPid(), n: S.name || 'لاعب' };
    LIVE.st = {};
    LIVE.peers = [];
    LIVE.ch = await netJoin('ashen-live', LIVE.me);
    LIVE.ch.onPresence(list => {
      LIVE.peers = list;
      liveMerge();
    });
    LIVE.ch
      .on('sts', d => {
        if (!d || !d.id || d.id === myPid()) return;
        LIVE.st[d.id] = Object.assign(d, { t: Date.now() });
        liveMerge();
      })
      .on('ask', () => (LIVE.force = true)) // someone opened the live list: answer at once
      .on('watch', d => d.to === myPid() && liveWatched(d));
  } catch (e) {}
  LIVE.busy = false;
}
/** Online players (presence) joined with what they last said they were doing. */
function liveMerge() {
  const now = Date.now();
  for (const id in LIVE.st) if (now - LIVE.st[id].t > 16000) delete LIVE.st[id];
  const seen = new Set();
  LIVE.list = (LIVE.peers || []).map(p => {
    seen.add(p.id);
    return Object.assign({ k: 'idle' }, p, LIVE.st[p.id] || {});
  });
  for (const id in LIVE.st) if (!seen.has(id)) LIVE.list.push(LIVE.st[id]); // heard from, even if presence lagged
  liveBadge();
  if (!$('liveScr').hidden) liveDraw();
}
/** Tell the others what we are doing: on a change at once, otherwise every 5 s (or when someone asks). */
function liveSet(o) {
  if (!LIVE.ch) return;
  const now = performance.now();
  if (now - (LIVE.mergeT || 0) > 5000) {
    LIVE.mergeT = now;
    liveMerge(); // drop players that went quiet
  }
  if (o.k === LIVE.k && !LIVE.force && now - LIVE.trackT < 5000) return;
  LIVE.trackT = now;
  LIVE.force = false;
  LIVE.k = o.k;
  LIVE.ch.send('sts', Object.assign({ id: myPid(), n: S.name || 'لاعب' }, o));
}
function liveBadge() {
  const n = LIVE.list.length,
    b = $('liveBadge');
  b.hidden = !n;
  b.textContent = n > 99 ? '99+' : n;
}

/* ---- the list */
function liveOpen() {
  AU.init();
  AU.play('select');
  go('liveScr');
  LIVE.sig = null;
  liveConnect().then(() => {
    LIVE.ch && LIVE.ch.send('ask', {});
    liveDraw();
  });
  liveDraw();
}
function liveDraw() {
  const D = $('liveDuels'),
    R = $('liveRuns');
  const duels = LIVE.list.filter(p => p.k === 'duel' && p.room),
    runs = LIVE.list.filter(p => p.k === 'run');
  // redraw only when something changed (a button that keeps re-rendering is hard to tap)
  const sig =
    !!LIVE.ch +
    '|' +
    LIVE.list.length +
    '|' +
    duels.map(p => p.room + p.sc).join() +
    '|' +
    runs.map(p => p.id + p.lvl + p.st + p.boss).join();
  if (sig === LIVE.sig) return;
  LIVE.sig = sig;
  D.innerHTML = R.innerHTML = '';
  $('liveOnline').textContent = LIVE.ch ? '🟢 متصلين الحين: ' + (LIVE.list.length + 1) + ' (معك)' : 'جارٍ الاتصال…';
  if (!duels.length) D.appendChild(el('p', 'note', 'ما فيه مبارزات شغالة الحين.'));
  for (const p of duels) {
    const r = el('div', 'dmP'),
      b = el('button', 'btn sm go', 'شاهد 👁️');
    b.onclick = () => {
      AU.play('select');
      duelStartWatch(p.room, p.n, p.b);
    };
    r.append(el('span', '', '⚔️ ' + p.n + ' ضد ' + p.b + (p.sc ? '  (' + p.sc + ')' : '')), b);
    D.appendChild(r);
  }
  if (!runs.length) R.appendChild(el('p', 'note', 'ما أحد يلعب جولة الحين.'));
  for (const p of runs) {
    const r = el('div', 'dmP'),
      b = el('button', 'btn sm go', 'شاهد 👁️'),
      info = el(
        'small',
        'liveInfo',
        (p.boss ? '👑 يقاتل ' + p.boss + ' · ' : '') + (STAGES[p.st] ? STAGES[p.st].n : '') + ' · مستوى ' + (p.lvl || 1)
      );
    b.onclick = () => liveWatchRun(p.id, p.n);
    const nm = profileLink(el('span', '', p.n), p.n);
    nm.appendChild(info);
    r.append(nm, b);
    R.appendChild(r);
  }
}

/* ---- streaming our run (only while someone watches) */
async function liveWatched(d) {
  LIVE.until = performance.now() + 7000;
  if (d && d.from) LIVE.viewers[d.from] = { n: d.n || 'لاعب', t: performance.now() };
  if (LIVE.stream || LIVE.opening) return;
  LIVE.opening = true;
  try {
    LIVE.stream = await netJoin('run-' + myPid());
  } catch (e) {}
  LIVE.opening = false;
}
const r1 = v => Math.round(v * 10) / 10,
  r2 = v => Math.round(v * 100) / 100;
/** One snapshot of our run. Enemies carry a stable id (nid) so the viewer can follow each one between snapshots. */
function liveSnap() {
  const p = G.p,
    E = [],
    sh = [];
  for (const e of G.enemies) {
    if (e.dead || e.boss || (e.x - p.x) ** 2 + (e.z - p.z) ** 2 > 900) continue;
    E.push(e.nid | 0, ETYPES.indexOf(e.type), r2(e.x), r2(e.z), r1(e.face), e.elite ? 1 : 0);
    if (E.length >= 900) break;
  }
  for (const s of G.shots) {
    sh.push(r1(s.x), r1(s.z), s.kind, r1(s.vx), r1(s.vz), r1(s.r || 0.3));
    if (sh.length >= 360) break;
  }
  const b = G.boss && !G.boss.dead ? G.boss : null;
  return {
    ts: r2(performance.now() / 1000), // our clock: the viewer plays snapshots back on this timeline
    vr: BUILD,
    p: [r2(p.x), r2(p.z), r1(p.face), Math.round(p.hp), p.maxHp, p.moving ? 1 : 0, r2(p.swing || 0)],
    ev: LIVE.ev.splice(0),
    co: G.coins,
    c: S.char,
    w: G.weapons[0].id,
    e: E,
    sh,
    b: b ? [b.kind, r2(b.x), r2(b.z), r1(b.face), Math.round((b.hp / b.maxHp) * 1000), b.scale, b.st | 0] : null,
    bn: G.bossName,
    st: G.stage,
    ab: G.abyss ? 1 : 0,
    d: G.depth,
    l: G.lvl,
    k: G.kills,
    t: Math.round(G.t),
    wv: G.wave,
  };
}
/** Called every frame by the main loop: our status, the stream while watched, and the 👁️ viewer count. */
function liveTick(dt) {
  const inRun = G.state === 'play' || G.state === 'cards' || G.state === 'paused' || G.state === 'count';
  if (LIVE.ch && !DUEL.on && G.state !== 'watch')
    liveSet(
      inRun ? { k: 'run', lvl: G.lvl, st: G.stage, boss: G.bossOn ? G.bossName : '', ch: S.char } : { k: 'idle' }
    );
  // who is watching us (each viewer pings every 3 s)
  const now = performance.now(),
    names = [];
  for (const id in LIVE.viewers) {
    if (now - LIVE.viewers[id].t > 7000) delete LIVE.viewers[id];
    else names.push(LIVE.viewers[id].n);
  }
  const wv = $('viewers'),
    show = inRun && names.length > 0;
  if (wv.hidden === show || wv.dataset.n !== String(names.length)) {
    wv.hidden = !show;
    wv.dataset.n = names.length;
    wv.querySelector('b').textContent = names.length;
    wv.title = names.join('، ');
    if (show) pop(wv);
  }
  if (!LIVE.stream) return;
  if (now > LIVE.until || !inRun) {
    if (!inRun) LIVE.stream.send('end', { l: G.lvl, k: G.kills, t: Math.round(G.t) });
    const st = LIVE.stream;
    LIVE.stream = null;
    setTimeout(() => st.close(), 300);
    return;
  }
  if ((LIVE.sendT -= dt) <= 0) {
    LIVE.sendT = 0.1;
    LIVE.stream.send('snap', liveSnap());
  }
}

/* ---- fight events for viewers: the effect helpers are wrapped so that, while we stream, each outermost call
   (a damage number, a sword arc, a kill burst, lightning, an explosion…) is recorded and replayed by the viewer */
const LIVE_FX = [
  'text',
  'ring',
  'parts',
  'slashFx',
  'vfxStorm',
  'vfxSkyBolt',
  'vfxBolt',
  'vfxTornado',
  'vfxBlackHole',
  'vfxToxic',
  'vfxFrostBurst',
  'vfxHeal',
  'vfxPhoenix',
  'vfxBladeWhirl',
  'vfxExplosion',
  'vfxSparks',
  'vfxLaser',
];
LIVE.ev = [];
LIVE.depth = 0;
const liveArg = a =>
  typeof a === 'number'
    ? Math.round(a * 100) / 100
    : Array.isArray(a)
      ? a.map(liveArg)
      : a && typeof a === 'object'
        ? {
            x: liveArg(a.x),
            z: liveArg(a.z),
            d: liveArg(a.d),
            col: a.col && liveArg(a.col),
            w: a.w,
            life: a.life,
            rough: a.rough,
          }
        : a;
for (const name of LIVE_FX) {
  const orig = window[name];
  if (typeof orig !== 'function') continue;
  window[name] = function (...args) {
    if (LIVE.stream && LIVE.depth === 0 && LIVE.ev.length < 60)
      LIVE.ev.push([LIVE_FX.indexOf(name), args.map(liveArg)]);
    LIVE.depth++;
    try {
      return orig.apply(this, args);
    } finally {
      LIVE.depth--;
    }
  };
}

/* ---- watching someone's run: snapshots are buffered and played back ~0.2 s behind, interpolating
   between the two that surround the playback time — smooth even when the network delivers unevenly */
const LIVE_DELAY = 0.22;
async function liveWatchRun(pid, name) {
  AU.init();
  let ch;
  try {
    ch = await netJoin('run-' + pid);
  } catch (e) {
    toast('ما قدرت أفتح البث');
    return;
  }
  const Wt = (LIVE.watch = {
    ch,
    pid,
    name,
    buf: [],
    vt: null,
    lastRx: performance.now(),
    pingT: 0,
    myChar: S.char,
    char: null,
    ens: new Map(),
  });
  ch.on('snap', s => {
    if (!s || s.ts === undefined) return;
    Wt.lastRx = performance.now();
    if (Wt.buf.length && s.ts <= Wt.buf[Wt.buf.length - 1].ts) return; // late or duplicate
    Wt.buf.push(s);
    if (Wt.buf.length > 12) Wt.buf.shift();
  }).on('end', s => liveWatchStop('انتهت جولة ' + name + ' · مستوى ' + s.l + ' · ' + s.k + ' قتلة'));
  liveWatchPing();
  hideScreens();
  newRun();
  G.state = 'watch';
  $('hud').hidden = false;
  $('hud').classList.add('watching');
  $('watchBar').hidden = false;
  $('watchName').textContent = '👁️ تشاهد ' + name;
  $('bossbar').hidden = true;
  bossMesh.visible = false;
  MUS.on = true;
}
function liveWatchPing() {
  const Wt = LIVE.watch;
  if (Wt && LIVE.ch) LIVE.ch.send('watch', { to: Wt.pid, from: myPid(), n: S.name || 'لاعب' });
}
function liveWatchStop(msg) {
  const Wt = LIVE.watch;
  if (!Wt) return;
  LIVE.watch = null;
  try {
    Wt.ch.close();
  } catch (e) {}
  S.char = Wt.myChar; // we only borrowed the hero to draw the streamer
  $('hud').classList.remove('watching');
  $('watchBar').hidden = true;
  $('hud').hidden = true;
  $('bossbar').hidden = true;
  bossMesh.visible = false;
  MUS.boss = false;
  newRun();
  setStage(0);
  buildPlayer();
  go('menu');
  if (msg) toast(msg);
}
const lerp = (a, b, k) => a + (b - a) * k,
  lerpAng = (a, b, k) => a + wrapAng(b - a) * k;
function liveWatchStep(dt) {
  const Wt = LIVE.watch;
  if (!Wt) return;
  if ((Wt.pingT -= dt) <= 0) {
    Wt.pingT = 3;
    liveWatchPing();
  }
  if (performance.now() - Wt.lastRx > 9000) return liveWatchStop(Wt.buf.length ? 'انقطع البث' : 'اللاعب ما بدأ البث');
  const B = Wt.buf;
  if (!B.length) return;
  // playback clock: runs at real speed, eased toward (newest − delay); jumps only after a long stall
  const target = B[B.length - 1].ts - LIVE_DELAY;
  if (Wt.vt === null || Math.abs(target - Wt.vt) > 1.2) Wt.vt = target;
  else Wt.vt += dt + (target - Wt.vt) * Math.min(1, dt * 1.5);
  let i = B.length - 1;
  while (i > 0 && B[i - 1].ts > Wt.vt) i--;
  const sb = B[i],
    sa = i > 0 ? B[i - 1] : sb,
    span = sb.ts - sa.ts,
    k = span > 0 ? Math.min(1, Math.max(0, (Wt.vt - sa.ts) / span)) : 1;
  const s = sb,
    p = G.p;
  if (!Wt.vrWarned && BUILD && (s.vr || 0) < BUILD) {
    Wt.vrWarned = 1; // an old build streams positions only, without the fight
    $('watchName').textContent = '👁️ تشاهد ' + Wt.name + ' · ⚠️ نسخته قديمة، خله يحدّث اللعبة';
  }
  for (const q of B)
    if (q.ts <= Wt.vt && q.ts > (Wt.evTs || 0)) {
      Wt.evTs = q.ts;
      for (const [fi, args] of q.ev || []) {
        const fn = window[LIVE_FX[fi]];
        try {
          if (fn) fn(...args);
        } catch (e) {}
      }
    }
  const age = (list, life) => {
    for (const q of list) q.l += dt;
    return list.filter(q => q.l < life(q));
  };
  G.texts = age(G.texts, () => FX_LIFE.text);
  G.rings = age(G.rings, q => q.d);
  G.slashes = age(G.slashes, () => FX_LIFE.slash);
  G.bolts = age(G.bolts, () => FX_LIFE.bolt);
  // hero (borrowed for drawing) and stage
  if (Wt.char !== s.c + s.w) {
    Wt.char = s.c + s.w;
    S.char = CHARS[s.c] ? s.c : S.char;
    G.weapons = [{ id: WEP[s.w] ? s.w : G.weapons[0].id, lvl: 3, cd: 0 }];
    buildPlayer();
  }
  if (Wt.stage !== s.st + ':' + s.ab) {
    Wt.stage = s.st + ':' + s.ab;
    G.stage = s.st;
    G.abyss = !!s.ab;
    setStage(s.st);
  }
  const A = sa.p,
    P = s.p;
  p.x = lerp(A[0], P[0], k);
  p.z = lerp(A[1], P[1], k);
  p.face = lerpAng(A[2], P[2], k);
  p.moving = P[5];
  if (p.moving) p.walk += dt * 10;
  p.hp = P[3];
  p.maxHp = P[4];
  p.swing = P[6] || 0;
  G.coins = s.co | 0;
  Object.assign(G, { lvl: s.l, kills: s.k, t: s.t, wave: s.wv, depth: s.d, bossName: s.bn, xp: 0, need: 1 });
  // enemies: matched by id between the two snapshots, so each one glides along its own path
  const prev = new Map();
  for (let o = 0; o < sa.e.length; o += 6) prev.set(sa.e[o], o);
  const list = [],
    alive = new Set();
  for (let o = 0; o < s.e.length; o += 6) {
    const id = s.e[o],
      type = ETYPES[s.e[o + 1]] || 'grunt';
    let e = Wt.ens.get(id);
    if (!e) Wt.ens.set(id, (e = { t: Math.random() * 9, slot: Math.random(), flash: 0, frz: 0, atkT: 0 }));
    alive.add(id);
    const q = prev.get(id);
    e.type = type;
    e.elite = !!s.e[o + 5];
    e.scale = EN[type].sc * (e.elite ? 1.35 : 1);
    e.spd = EN[type].spd;
    if (q !== undefined) {
      e.x = lerp(sa.e[q + 2], s.e[o + 2], k);
      e.z = lerp(sa.e[q + 3], s.e[o + 3], k);
      e.face = lerpAng(sa.e[q + 4], s.e[o + 4], k);
    } else {
      e.x = s.e[o + 2];
      e.z = s.e[o + 3];
      e.face = s.e[o + 4];
    }
    e.t += dt;
    list.push(e);
  }
  for (const id of Wt.ens.keys()) if (!alive.has(id)) Wt.ens.delete(id);
  // the boss
  let bo = null;
  if (s.b) {
    bo = Wt.boss || (Wt.boss = { boss: true, t: 0, y: 0, flash: 0, frz: 0, maxHp: 1000 });
    if (bo.kind !== s.b[0]) {
      bo.kind = s.b[0];
      bossMesh.geometry = GEO['boss' + bo.kind];
    }
    const ab = sa.b || s.b;
    bo.x = lerp(ab[1], s.b[1], k);
    bo.z = lerp(ab[2], s.b[2], k);
    bo.face = lerpAng(ab[3], s.b[3], k);
    bo.hp = s.b[4];
    bo.scale = s.b[5];
    bo.st = s.b[6];
    bo.t += dt;
    bossMesh.visible = true;
    $('bossbar').hidden = false;
    $('bossbar').querySelector('span').textContent = s.bn || '';
  } else {
    Wt.boss = null;
    bossMesh.visible = false;
    $('bossbar').hidden = true;
  }
  G.boss = bo;
  G.bossOn = !!bo;
  G.enemies = bo ? list.concat([bo]) : list;
  // shots fly on from their snapshot position at their own speed
  const shotAge = Math.max(0, Wt.vt - s.ts);
  G.shots.length = 0;
  for (let o = 0; o < s.sh.length; o += 6)
    G.shots.push({
      x: s.sh[o] + s.sh[o + 3] * shotAge,
      z: s.sh[o + 1] + s.sh[o + 4] * shotAge,
      kind: s.sh[o + 2],
      vx: s.sh[o + 3],
      vz: s.sh[o + 4],
      r: s.sh[o + 5],
      col: [1, 0.85, 0.45],
      t: 0,
    });
}
$('mLive').onclick = () => liveOpen();
$('liveBack').onclick = () => go('menu');
$('watchExit').onclick = () => liveWatchStop();
$('viewers').onclick = () => toast('👁️ يشاهدونك: ' + ($('viewers').title || ''));
setTimeout(liveConnect, 2500);

/* ---- a newer build on the site? (phones keep old files for a while): offer a one-tap update */
async function checkUpdate() {
  if (!BUILD || NET_LOCAL) return;
  try {
    const html = await (await fetch('index.html?_=' + Date.now(), { cache: 'no-store' })).text(),
      m = html.match(/config\.js\?v=(\d+)/);
    if (m && +m[1] > BUILD) $('mUpdate').hidden = false;
  } catch (e) {}
}
$('mUpdate').onclick = () => location.reload();
setTimeout(checkUpdate, 8000);
setInterval(checkUpdate, 120000);
