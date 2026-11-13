'use strict';
/* 📺 Live: who is online and what they are doing (presence on the 'ashen-live' channel), watching a duel, and
   watching someone's run. A player only streams its run while somebody watches (viewers ping every 3 s);
   the stream is ~8 snapshots a second on the channel 'run-<pid>', drawn by the normal renderer in 'watch' state. */
const LIVE = { ch: null, me: null, list: [], trackT: 0, stream: null, until: 0, sendT: 0, watch: null };
const ETYPES = Object.keys(EN);
async function liveConnect() {
  if (LIVE.ch || LIVE.busy) return;
  LIVE.busy = true;
  try {
    LIVE.me = { id: myPid(), n: S.name || 'لاعب', k: 'idle' };
    LIVE.ch = await netJoin('ashen-live', LIVE.me);
    LIVE.ch.onPresence(list => {
      LIVE.list = list;
      liveBadge();
      if (!$('liveScr').hidden) liveDraw();
    });
    LIVE.ch.on('watch', d => d.to === myPid() && liveWatched());
  } catch (e) {}
  LIVE.busy = false;
}
/** Update what we show the others (throttled; a change of kind goes out at once). */
function liveSet(o) {
  if (!LIVE.ch || !LIVE.me) return;
  const now = performance.now(),
    kindChanged = o.k !== LIVE.me.k;
  if (!kindChanged && now - LIVE.trackT < 6000) return;
  LIVE.trackT = now;
  LIVE.ch.track(
    Object.assign({ id: myPid(), n: S.name || 'لاعب' }, o, o.k === 'idle' ? { room: null, lvl: null } : {})
  );
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
  liveConnect().then(liveDraw);
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
async function liveWatched() {
  LIVE.until = performance.now() + 7000;
  if (LIVE.stream || LIVE.opening) return;
  LIVE.opening = true;
  try {
    LIVE.stream = await netJoin('run-' + myPid());
  } catch (e) {}
  LIVE.opening = false;
}
const r1 = v => Math.round(v * 10) / 10;
function liveSnap() {
  const p = G.p,
    E = [],
    sh = [];
  for (const e of G.enemies) {
    if (e.dead || e.boss || (e.x - p.x) ** 2 + (e.z - p.z) ** 2 > 900) continue;
    E.push(ETYPES.indexOf(e.type), r1(e.x), r1(e.z), r1(e.face), e.elite ? 1 : 0);
    if (E.length >= 750) break;
  }
  for (const s of G.shots) {
    sh.push(r1(s.x), r1(s.z), s.kind, r1(Math.atan2(s.vz, s.vx)), r1(s.r || 0.3));
    if (sh.length >= 300) break;
  }
  const b = G.boss && !G.boss.dead ? G.boss : null;
  return {
    p: [r1(p.x), r1(p.z), r1(p.face), Math.round(p.hp), p.maxHp, p.moving ? 1 : 0],
    c: S.char,
    w: G.weapons[0].id,
    e: E,
    sh,
    b: b ? [b.kind, r1(b.x), r1(b.z), r1(b.face), Math.round((b.hp / b.maxHp) * 1000), b.scale, b.st | 0] : null,
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
/** Called every frame by the main loop: presence while in a run, and the stream while watched. */
function liveTick(dt) {
  const inRun = G.state === 'play' || G.state === 'cards' || G.state === 'paused' || G.state === 'count';
  if (LIVE.ch && !DUEL.on && G.state !== 'watch')
    liveSet(
      inRun ? { k: 'run', lvl: G.lvl, st: G.stage, boss: G.bossOn ? G.bossName : '', ch: S.char } : { k: 'idle' }
    );
  if (!LIVE.stream) return;
  if (performance.now() > LIVE.until || !inRun) {
    if (!inRun) LIVE.stream.send('end', { l: G.lvl, k: G.kills, t: Math.round(G.t) });
    const s = LIVE.stream;
    LIVE.stream = null;
    setTimeout(() => s.close(), 300);
    return;
  }
  if ((LIVE.sendT -= dt) <= 0) {
    LIVE.sendT = 0.125;
    LIVE.stream.send('snap', liveSnap());
  }
}

/* ---- watching someone's run */
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
    snap: null,
    lastRx: performance.now(),
    pingT: 0,
    myChar: S.char,
    char: null,
    ens: [],
  });
  ch.on('snap', s => {
    Wt.snap = s;
    Wt.lastRx = performance.now();
  }).on('end', s => liveWatchStop('انتهت جولة ' + name + ' · مستوى ' + s.l + ' · ' + s.k + ' قتلة'));
  LIVE.ch && LIVE.ch.send('watch', { to: pid });
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
/** Each frame while watching: steer the local copy of the streamer's run toward the latest snapshot. */
function liveWatchStep(dt) {
  const Wt = LIVE.watch;
  if (!Wt) return;
  if ((Wt.pingT -= dt) <= 0) {
    Wt.pingT = 3;
    LIVE.ch && LIVE.ch.send('watch', { to: Wt.pid });
  }
  if (performance.now() - Wt.lastRx > 9000) return liveWatchStop(Wt.snap ? 'انقطع البث' : 'اللاعب ما بدأ البث');
  const s = Wt.snap;
  if (!s) return;
  const k = Math.min(1, dt * 10),
    p = G.p;
  // the hero (borrowed for drawing) and the stage
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
  const P = s.p;
  p.moving = P[5];
  if (p.moving) p.walk += dt * 10;
  p.x += (P[0] - p.x) * k;
  p.z += (P[1] - p.z) * k;
  p.face += wrapAng(P[2] - p.face) * k;
  p.hp = P[3];
  p.maxHp = P[4];
  Object.assign(G, { lvl: s.l, kills: s.k, t: s.t, wave: s.wv, depth: s.d, bossName: s.bn, xp: 0, need: 1 });
  // enemies: reuse objects by slot so they glide and keep their walk cycle
  const n = s.e.length / 5;
  while (Wt.ens.length < n) Wt.ens.push({ t: Math.random() * 9, slot: Math.random(), flash: 0, frz: 0, atkT: 0 });
  Wt.ens.length = n;
  for (let i = 0; i < n; i++) {
    const e = Wt.ens[i],
      o = i * 5,
      type = ETYPES[s.e[o]] || 'grunt',
      tx = s.e[o + 1],
      tz = s.e[o + 2];
    if (e.type !== type || Math.hypot(tx - e.x, tz - e.z) > 6) {
      e.x = tx;
      e.z = tz;
    }
    e.type = type;
    e.elite = !!s.e[o + 4];
    e.scale = EN[type].sc * (e.elite ? 1.35 : 1);
    e.spd = EN[type].spd;
    e.x += (tx - e.x) * k;
    e.z += (tz - e.z) * k;
    e.face += wrapAng(s.e[o + 3] - (e.face || 0)) * k || 0;
    e.t += dt;
  }
  // the boss
  let bo = null;
  if (s.b) {
    bo = Wt.boss || (Wt.boss = { boss: true, t: 0, y: 0, flash: 0, frz: 0, maxHp: 1000 });
    if (bo.kind !== s.b[0]) {
      bo.kind = s.b[0];
      bo.x = s.b[1];
      bo.z = s.b[2];
      bossMesh.geometry = GEO['boss' + bo.kind];
    }
    bo.x += (s.b[1] - bo.x) * k;
    bo.z += (s.b[2] - bo.z) * k;
    bo.face = s.b[3];
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
  G.enemies = bo ? Wt.ens.concat([bo]) : Wt.ens;
  // shots
  G.shots.length = 0;
  for (let i = 0; i < s.sh.length; i += 5)
    G.shots.push({
      x: s.sh[i],
      z: s.sh[i + 1],
      kind: s.sh[i + 2],
      vx: Math.cos(s.sh[i + 3]),
      vz: Math.sin(s.sh[i + 3]),
      r: s.sh[i + 4],
      col: [1, 0.85, 0.45],
      t: 0,
    });
}
$('mLive').onclick = () => liveOpen();
$('liveBack').onclick = () => go('menu');
$('watchExit').onclick = () => liveWatchStop();
setTimeout(liveConnect, 2500);
