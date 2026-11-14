'use strict';
/* The melee (الملحمة): up to 4 fighters in the duel arena, each for himself. The last one standing takes the round,
   the first to FFA_WIN rounds takes the match. Training: you against 3 bots. Online: a room of 2–4 players; like the
   duel, each machine runs its own fighter and judges the blows that land on it, and the first player still in the
   room (the judge) keeps the clock and calls the rounds. A tag over every head: the player's colour, name and health. */
const FFA_WIN = 3,
  FFA_ROUND = 90,
  FFA_MAX = 4;
const FFA_HUES = [212, 2, 120, 45];
const FFA_COLORS = ['#4aa3ff', '#ff5a4d', '#5fd66b', '#ffc93c'];
const FFA_BOTS = ['الذيب', 'الصقر', 'النمر'];
let ffaExtra = null; // the third and fourth fighters, built the first time the melee opens

/* ---- set-up */
async function ffaPrepare() {
  await duelPrepare();
  if (!ffaExtra) {
    const [a, b] = await Promise.all([duelLoad(), duelLoad()]);
    await duelYield();
    ffaExtra = [new Duelist(a, FFA_HUES[2], 104), new Duelist(b, FFA_HUES[3], 124)];
  }
  for (const f of ffaExtra) if (!f.root.parent) DUEL.scene.add(f.root);
}
/** Start the melee. net: null for training, else { ch, list: [{id, n, w}], host }. */
async function ffaStart(net) {
  AU.init();
  hideScreens();
  $('hud').hidden = true;
  $('duel').hidden = false;
  $('dLoad').hidden = false;
  $('dOver').hidden = true;
  $('duel').classList.add('ffa');
  G.state = 'duel';
  DUEL.on = true;
  duelForceLandscape();
  if (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) document.body.classList.remove('mouse');
  renderer.outputEncoding = THREE.sRGBEncoding;
  const X = (DUEL.ffa = { net, round: 0, feed: [] });
  try {
    await ffaPrepare();
  } catch (e) {
    console.warn('ffa', e);
    toast('ما قدرت أحمّل الساحة، تأكد من الإنترنت');
    duelExit();
    return;
  }
  if (!DUEL.on || DUEL.ffa !== X) return;
  goreClear();
  const roster = net
    ? net.list
    : [{ id: 'me', n: S.name || 'أنت', w: S.duelW || 'sword' }].concat(
        FFA_BOTS.map((n, i) => ({ id: 'bot' + i, n, w: pick(DUEL_WEAPON_IDS) }))
      );
  const mine = net
      ? Math.max(
          0,
          roster.findIndex(m => m.id === myPid())
        )
      : 0,
    pool = [DUEL.foe, ...ffaExtra];
  X.all = roster.map((m, i) => (i === mine ? DUEL.me : pool.shift()));
  for (const f of [DUEL.me, DUEL.foe, ...ffaExtra]) f.root.visible = X.all.includes(f);
  X.all.forEach((f, i) => {
    const m = roster[i];
    Object.assign(f, { slot: i, pid: m.id, nm: m.n || 'لاعب', gone: false, kills: 0, wins: 0, down: false });
    f.remote = !!net && f !== DUEL.me;
    f.freeLook = false;
    f.tint(FFA_HUES[i]);
    f.setWeapon(m.w || 'sword');
    f.others = X.all;
    f.ai = !net && f !== DUEL.me ? new DuelBot(f, DUEL.me) : null;
    f.onMove = null;
    f.rx = performance.now();
    f.onHit = f.remote
      ? (r, d) => {
          // a remote fighter's blow landed on ours: we judged it; tell its owner what it means for him
          ffaOutcome(f, d, r);
          if (d === DUEL.me && r !== 'none') net.ch.send('res', { o: r, k: f.act, to: f.slot, s: DUEL.me.slot });
        }
      : (r, d) => ffaOutcome(f, d, r);
    ffaTag(f);
  });
  if (net) DUEL.me.onMove = m => X.net && X.net.ch.send('mv', Object.assign(m, { s: DUEL.me.slot, r: X.round }));
  DUEL.bot = null;
  DUEL.tgt = null;
  duelLock(false);
  DUEL.pitch = 0;
  $('dNameMe').textContent = DUEL.me.nm;
  $('dAgain').hidden = false;
  duelRematchUi();
  MUS.on = true;
  MUS.boss = true;
  ffaBoard();
  if (!net) {
    $('dLoad').hidden = true;
    return ffaRound(1);
  }
  ffaNetStart(X);
}
/** Leaving the melee (from duelExit): tell the room, put the duel's two fighters back as they were. */
function ffaCleanup() {
  const X = DUEL.ffa;
  DUEL.ffa = null;
  DUEL.tgt = null;
  if (X && X.net) {
    const ch = X.net.ch;
    try {
      ch.send('fx', { s: DUEL.me.slot });
    } catch (e) {}
    setTimeout(() => ch.close(), 300);
  }
  for (const f of [DUEL.me, DUEL.foe, ...(ffaExtra || [])]) {
    Object.assign(f, { others: null, ai: null, gone: false, remote: false, lastFrom: null, onMove: null });
    if (f.tag) f.tag.s.visible = false;
  }
  for (const f of ffaExtra || []) f.root.visible = false;
  DUEL.me.root.visible = DUEL.foe.root.visible = true;
  DUEL.me.tint(212);
  DUEL.foe.tint(2);
  DUEL.me.onHit = r => duelOutcome(DUEL.me, DUEL.foe, r);
  $('duel').classList.remove('ffa');
  $('dFeed').innerHTML = '';
}

/* ---- who is where */
const ffaAlive = () => DUEL.ffa.all.filter(f => !f.gone && f.act !== 'dead' && f.hp > 0);
/** The nearest standing fighter to f (keeps `prefer` unless someone is clearly closer). */
function ffaNearest(f, prefer) {
  if (!DUEL.ffa) return null;
  let best = null,
    bd = 1e9;
  for (const o of DUEL.ffa.all) {
    if (o === f || o.gone || o.act === 'dead') continue;
    const d = Math.hypot(o.x - f.x, o.z - f.z) - (o === prefer ? 1.5 : 0);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}
/** Who you face: with 🎯 the one you locked on (while he stands), else whoever is nearest in front of you. */
function ffaTarget() {
  const me = DUEL.me,
    t = DUEL.tgt;
  if (DUEL.lock && t && !t.gone && t.act !== 'dead') return;
  let best = null,
    bs = 1e9;
  for (const o of DUEL.ffa.all) {
    if (o === me || o.gone || o.act === 'dead') continue;
    const d = Math.hypot(o.x - me.x, o.z - me.z),
      a = Math.abs(wrapAng(Math.atan2(o.x - me.x, o.z - me.z) - me.face)),
      sc = d + a * 2.5;
    if (sc < bs) {
      bs = sc;
      best = o;
    }
  }
  DUEL.tgt = best;
}
/** Is this machine the judge (keeps the clock, calls the rounds)? Training: always. Online: the first one still here. */
function ffaJudge() {
  const X = DUEL.ffa;
  if (!X.net) return true;
  const first = X.all.find(f => !f.gone);
  return first === DUEL.me;
}

/* ---- rounds */
function ffaRound(n) {
  const X = DUEL.ffa;
  if (DUEL.kc) duelKillcamEnd();
  X.round = n;
  if (n === 1) {
    for (const f of X.all) f.wins = f.kills = 0;
    $('dOver').hidden = true;
    goreClear();
    duelRematchUi();
  }
  const N = X.all.length;
  X.all.forEach((f, i) => {
    const a = (i / N) * Math.PI * 2 + Math.PI / 4,
      R = 4.4;
    f.reset(Math.sin(a) * R, Math.cos(a) * R, a + Math.PI);
    f.down = false;
    f.lastFrom = null;
    f.root.visible = !f.gone;
    if (f.ai) f.ai.foe = DUEL.me;
  });
  DUEL.tgt = null;
  DUEL.clock = FFA_ROUND;
  DUEL.phase = 'intro';
  DUEL.phaseT = n === 1 ? 3.2 : 2.6;
  DUEL.saidFight = false;
  DUEL.slow = DUEL.hitStop = 0;
  $('dLoad').hidden = true;
  if (n === 1) duelMsg('⚔️ الملحمة', 'كل واحد لحاله · آخر واحد واقف ياخذ الجولة');
  else duelMsg('الجولة ' + n, ffaScoreLine());
  DS.round(
    n,
    X.all.some(f => f.wins === FFA_WIN - 1)
  );
  ffaBoard();
  if (X.net && ffaJudge()) X.net.ch.send('rd', { n, wn: X.all.map(f => f.wins) });
}
const ffaScoreLine = () =>
  DUEL.ffa.all
    .filter(f => !f.gone)
    .map(f => f.nm + ' ' + f.wins)
    .join(' · ');
/** The round is over: `told` is the judge's verdict ({w: winner slot or -1, wn: wins}) on the other machines. */
function ffaRoundEnd(told) {
  const X = DUEL.ffa;
  if (DUEL.phase !== 'fight') return;
  let w;
  if (told) {
    w = told.w >= 0 ? X.all[told.w] : null;
    if (told.wn) told.wn.forEach((v, i) => X.all[i] && (X.all[i].wins = v));
  } else {
    const al = ffaAlive().sort((a, b) => b.hp - a.hp);
    // one left: his round. Time ran out: the healthiest (a tie at the top is a draw)
    w = al.length === 1 || (al.length > 1 && al[0].hp > al[1].hp) ? al[0] : null;
    if (w) w.wins++;
    if (X.net) {
      const v = { w: w ? w.slot : -1, wn: X.all.map(f => f.wins), r: X.round };
      X.kw = v;
      X.net.ch.send('ko', v);
    }
  }
  DUEL.phase = 'ko';
  DUEL.phaseT = DUEL.kc ? 5.6 : 3.6;
  DUEL.slow = 1.1;
  ffaBoard();
  if (w === DUEL.me) duelMsg('🏆 فزت بالجولة', ffaScoreLine(), 'win');
  else if (w) duelMsg(w.nm + ' فاز بالجولة', ffaScoreLine(), 'lose');
  else duelMsg('تعادل', ffaScoreLine());
  DS.crowd(w === DUEL.me ? 0.24 : 0.16);
  if (DUEL.clock <= 0) dPlay('v_time_over', 1, 1, 0.3);
}
function ffaMatchEnd(why) {
  const X = DUEL.ffa;
  if (DUEL.phase === 'over') return;
  DUEL.phase = 'over';
  const rank = X.all.filter(f => !f.gone || f === DUEL.me).sort((a, b) => b.wins - a.wins || b.kills - a.kills),
    top = why ? DUEL.me : rank[0],
    won = top === DUEL.me;
  $('dOver').hidden = false;
  $('dOverT').textContent = won ? '🏆 انتصرت بالملحمة!' : '💀 ' + top.nm + ' فاز بالملحمة';
  $('dOverS').textContent =
    (why ? why + '\n' : '') +
    rank.map((f, i) => i + 1 + '. ' + f.nm + ' — 🏆 ' + f.wins + ' · ☠️ ' + f.kills).join('\n');
  ffaAgainUi();
  dPlay(won ? 'v_you_win' : 'v_you_lose', 1);
  DS.crowd(won ? 0.28 : 0.12);
  if (X.net && ffaJudge() && !why) X.net.ch.send('end', {});
}
/** 🔁: training starts over; online only the judge can (the others wait for him). */
function ffaAgainUi() {
  const b = $('dAgain'),
    X = DUEL.ffa;
  b.hidden = false;
  b.disabled = !!(X && X.net && !ffaJudge());
  b.textContent = b.disabled ? '⏳ المضيف يقرر الإعادة' : '🔁 ملحمة ثانية';
  if (X && X.net && X.all.filter(f => !f.gone).length < 2) b.hidden = true;
}
function ffaAgain() {
  const X = DUEL.ffa;
  if (!X || DUEL.phase !== 'over' || (X.net && !ffaJudge())) return;
  ffaRound(1);
}
{
  const again = $('dAgain').onclick;
  $('dAgain').onclick = () => (DUEL.ffa ? ffaAgain() : again());
}

/* ---- feedback */
function ffaOutcome(att, def, r) {
  if (!def) return;
  if (DUEL_HITS[r] && def !== att) def.lastFrom = att;
  if (att === DUEL.me || def === DUEL.me) return duelOutcome(att, def, r);
  // two others fighting: only what you can see from afar
  if (r === 'block' || r === 'parry' || r === 'break') goreSparks(att, def, r === 'parry' ? 30 : 14);
}
/** Deaths: the kill feed, the score of kills, the slow-motion close-up on the round's last blow. */
function ffaDeaths() {
  const X = DUEL.ffa;
  for (const f of X.all) {
    if (f.gone || f.down || f.act !== 'dead') continue;
    f.down = true;
    const k = f.lastFrom && f.lastFrom !== f && X.all.includes(f.lastFrom) ? f.lastFrom : null;
    if (k) k.kills++;
    ffaFeed(k, f);
    ffaBoard();
    if (f === DUEL.me && DUEL.phase === 'fight' && ffaAlive().length > 1)
      duelMsg('💀 سقطت', 'تابع المعركة لين تخلص الجولة', 'lose');
    if (ffaAlive().length <= 1 && k && k.act !== 'dead' && !DUEL.kc && DUEL.phase === 'fight') {
      duelKillcam(f, k);
      const s = $('dCineT').querySelector('small');
      if (s) s.textContent = k.nm;
    }
  }
}
function ffaFeed(k, v) {
  const box = $('dFeed'),
    row = el('div', 'fFeed'),
    nm = f => {
      const b = el('b', '', f.nm);
      b.style.color = FFA_COLORS[f.slot];
      return b;
    };
  if (k) row.append(nm(k), el('i', '', ' ⚔️ '), nm(v));
  else row.append(nm(v), el('i', '', ' 💀'));
  box.prepend(row);
  while (box.children.length > 4) box.lastChild.remove();
  setTimeout(() => row.remove(), 6000);
}
/** The board under the clock: one row per fighter (colour, name, health, rounds won, kills). */
function ffaBoard() {
  const X = DUEL.ffa,
    B = $('dFfa');
  if (!X || !X.all) return;
  B.innerHTML = '';
  for (const f of X.all) {
    const r = el('div', 'fRow' + (f === DUEL.me ? ' me' : '') + (f.gone ? ' gone' : ''));
    r.style.setProperty('--c', FFA_COLORS[f.slot]);
    const hp = el('div', 'fHp');
    hp.appendChild(el('i'));
    let pips = '';
    for (let i = 0; i < FFA_WIN; i++) pips += i < f.wins ? '●' : '○';
    r.append(el('b', '', f.nm), hp, el('span', 'fPip', pips), el('small', '', '☠️' + f.kills));
    f.hpEl = hp.firstChild;
    B.appendChild(r);
  }
}
function ffaHud() {
  const me = DUEL.me,
    X = DUEL.ffa;
  $('dHpMe').style.width = me.hp + '%';
  $('dStMe').style.width = (me.st / DM.stMax) * 100 + '%';
  $('dStMe').parentElement.classList.toggle('low', me.st < DM.light.st);
  $('dTime').textContent = Math.ceil(Math.max(0, DUEL.clock));
  for (const f of X.all) if (f.hpEl) f.hpEl.style.width = (f.gone || f.act === 'dead' ? 0 : f.hp) + '%';
}

/* ---- the name tag over each head */
function ffaTag(f) {
  if (!f.tag) {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 96;
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.minFilter = THREE.LinearFilter;
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true })
    );
    s.scale.set(1.6, 0.48, 1);
    s.renderOrder = 999;
    f.tag = { c, t, s, key: '' };
  }
  if (f.tag.s.parent !== DUEL.scene) DUEL.scene.add(f.tag.s);
  f.tag.key = '';
}
function ffaTagDraw(f) {
  const hp = Math.max(0, Math.round(f.hp)),
    on = f === DUEL.tgt,
    key = f.nm + '|' + Math.ceil(hp / 2) + '|' + f.slot + (on ? '+' : '');
  if (key === f.tag.key) return;
  f.tag.key = key;
  const c = f.tag.c,
    x = c.getContext('2d'),
    col = FFA_COLORS[f.slot],
    rr = (x0, y0, w, h, r) => {
      x.beginPath();
      x.moveTo(x0 + r, y0);
      x.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
      x.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
      x.arcTo(x0, y0 + h, x0, y0, r);
      x.arcTo(x0, y0, x0 + w, y0, r);
      x.closePath();
    };
  x.clearRect(0, 0, c.width, c.height);
  // the plate
  rr(6, 6, 308, 56, 28);
  x.fillStyle = 'rgba(12,9,20,0.82)';
  x.fill();
  x.lineWidth = on ? 5 : 3;
  x.strokeStyle = on ? '#fff' : col;
  x.stroke();
  // the badge: a round shield in the player's colour with his initial
  const bx = 290,
    by = 34;
  x.beginPath();
  x.arc(bx, by, 22, 0, Math.PI * 2);
  x.fillStyle = col;
  x.fill();
  x.lineWidth = 3;
  x.strokeStyle = 'rgba(0,0,0,0.55)';
  x.stroke();
  // two crossed swords in the badge
  x.strokeStyle = '#120f1c';
  x.lineCap = 'round';
  for (const sg of [1, -1]) {
    x.save();
    x.translate(bx, by);
    x.rotate((sg * Math.PI) / 4);
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(0, -13);
    x.lineTo(0, 9);
    x.stroke();
    x.lineWidth = 3.5;
    x.beginPath();
    x.moveTo(-6, 7);
    x.lineTo(6, 7);
    x.stroke();
    x.restore();
  }
  // the name
  x.direction = 'rtl';
  x.textAlign = 'center';
  x.fillStyle = '#fff4dc';
  let fs = 32;
  x.font = fs + "px 'Lalezar', 'Tajawal', sans-serif";
  while (x.measureText(f.nm).width > 220 && fs > 16) x.font = --fs + "px 'Lalezar', 'Tajawal', sans-serif";
  x.fillText(f.nm, 145, 36);
  x.direction = 'ltr';
  // health
  rr(40, 70, 240, 16, 8);
  x.fillStyle = 'rgba(0,0,0,0.7)';
  x.fill();
  if (hp > 0) {
    rr(42, 72, Math.max(12, 236 * (hp / 100)), 12, 6);
    x.fillStyle = hp > 30 ? col : '#ff3b30';
    x.fill();
  }
  f.tag.t.needsUpdate = true;
}
function ffaTags() {
  const fp = DUEL.view === 'fp';
  for (const f of DUEL.ffa.all) {
    if (!f.tag) continue;
    const s = f.tag.s,
      show = !f.gone && f.act !== 'dead' && f !== DUEL.me && !DUEL.kc && f.root.visible;
    s.visible = show;
    if (!show) continue;
    ffaTagDraw(f);
    s.position.set(f.x, 2.12, f.z);
    // the same size on screen near or far (within limits), so a name across the arena still reads
    const d = DUEL.cam.position.distanceTo(s.position),
      k = clamp(d * 0.1, 0.55, 1.4);
    s.scale.set(1.6 * k, 0.48 * k, 1);
  }
}

/* ---- the frame */
function ffaFrame(rdt) {
  const X = DUEL.ffa,
    me = DUEL.me;
  if (!X.all) {
    renderer.setClearColor(0x120f18);
    renderer.clear();
    return;
  }
  duelInput(rdt);
  ffaTarget();
  ffaStep(rdt);
  if (X.net) ffaNetTick(rdt);
  ffaDeaths();
  if (DUEL.kc && (DUEL.kc.t += rdt) >= DUEL.kc.dur) duelKillcamEnd();
  arenaTick(rdt);
  goreUpdate(rdt * (DUEL.kc ? duelKcScale() : DUEL.slow > 0 ? 0.35 : 1));
  if (me.act === 'dead' && !DUEL.kc) ffaWatchCam(rdt);
  else duelCamera(rdt);
  ffaHud();
  ffaTags();
  renderer.render(DUEL.scene, DUEL.cam);
}
function ffaStep(rdt) {
  const X = DUEL.ffa,
    me = DUEL.me;
  let dt = rdt;
  if (DUEL.hitStop > 0) {
    DUEL.hitStop -= rdt;
    dt *= 0.06;
  }
  if (DUEL.slow > 0) {
    DUEL.slow -= rdt;
    dt *= 0.35;
  }
  if (DUEL.kc) dt = rdt * duelKcScale();
  DUEL.shake = Math.max(0, DUEL.shake - rdt * 1.6);
  const judge = ffaJudge();
  if (DUEL.phase === 'fight') {
    for (const f of X.all) if (f.ai && !f.gone && f.act !== 'dead') f.ai.update(dt);
    DUEL.clock = Math.max(0, DUEL.clock - dt);
    if (judge && (ffaAlive().length <= 1 || DUEL.clock <= 0)) ffaRoundEnd();
  } else {
    for (const f of X.all)
      if (!f.remote) {
        f.want.mx = f.want.mz = 0;
        f.want.block = f.want.run = false;
      }
    DUEL.phaseT -= rdt;
    if (DUEL.phase === 'intro' && DUEL.phaseT <= 0.9 && !DUEL.saidFight) {
      DUEL.saidFight = true;
      duelMsg('قاتل!', '', 'go');
      dPlay('v_go', 1);
    }
    if (DUEL.phase === 'intro' && DUEL.phaseT <= 0) DUEL.phase = 'fight';
    if (DUEL.phase === 'ko' && DUEL.phaseT <= 0 && judge) {
      if (X.all.some(f => f.wins >= FFA_WIN)) ffaMatchEnd();
      else ffaRound(X.round + 1);
    }
  }
  const any = X.all.find(o => o !== me && !o.gone) || DUEL.foe;
  for (const f of X.all) {
    if (f.gone) continue;
    const foe = f === me ? DUEL.tgt || any : f.ai ? f.ai.foe || me : me;
    f.update(dt, foe === f ? any : foe);
  }
}
/** You fell: the camera rises and circles over the fighters still standing. */
function ffaWatchCam(dt) {
  const X = DUEL.ffa,
    cam = DUEL.cam,
    al = ffaAlive();
  for (const m of DUEL.me.fpHide) m.visible = !m.userData.cut;
  let cx = 0,
    cz = 0;
  for (const f of al) {
    cx += f.x / al.length;
    cz += f.z / al.length;
  }
  X.spin = (X.spin || 0) + dt * 0.22;
  dT.set(cx + Math.sin(X.spin) * 7.5, 4.6, cz + Math.cos(X.spin) * 7.5);
  cam.position.lerp(dT, Math.min(1, dt * 2));
  dLook.lerp(dV.set(cx, 1.1, cz), Math.min(1, dt * 4));
  cam.lookAt(dLook);
  cam.fov = 55;
  if (cam.aspect !== W / H) cam.aspect = W / H;
  cam.updateProjectionMatrix();
}

/* ---- online: the match channel */
function ffaNetStart(X) {
  const N = X.net,
    ch = N.ch,
    by = s => X.all[s];
  N.ready = new Set([DUEL.me.slot]);
  N.sendT = 0;
  N.t0 = performance.now();
  ch.on('st', s => {
    const f = by(s.s);
    if (!f || f === DUEL.me || DUEL.ffa !== X) return;
    f.rx = performance.now();
    if (f.gone) return;
    // the judge's state also carries the round: catch up if we missed its start or its end
    if (s.j) {
      if (s.r > X.round && DUEL.phase !== 'over') ffaRound(s.r);
      else if (s.r === 1 && !s.o && DUEL.phase === 'over' && X.round > 1) ffaRound(1); // a rematch we missed
      if (s.r === X.round && DUEL.phase === 'fight' && s.k) ffaRoundEnd(s.k);
      if (s.ck !== undefined && DUEL.phase === 'fight') DUEL.clock = s.ck;
      if (s.o && DUEL.phase !== 'over' && s.r === X.round) ffaMatchEnd();
    }
    if (s.r !== X.round || DUEL.phase === 'over') return;
    if (s.kb !== undefined && by(s.kb)) f.lastFrom = by(s.kb);
    f.netState(s);
  })
    .on('mv', m => {
      const f = by(m.s);
      if (f && f !== DUEL.me && !f.gone && DUEL.phase === 'fight' && m.r === X.round) f.netMove(m);
    })
    .on('res', r => {
      // our blow, judged by the one it landed on
      const me = DUEL.me,
        def = by(r.s);
      if (r.to !== me.slot || !def || DUEL.phase !== 'fight') return;
      if (r.o === 'parry') {
        me.stagger(r.k === 'heavy' ? 1.1 : 0.9);
        DS.parry();
      } else if (r.o === 'block') {
        me.kx -= Math.sin(me.face) * 2.5;
        me.kz -= Math.cos(me.face) * 2.5;
        DS.block();
      } else if (r.o === 'break') DS.breakGuard();
      ffaOutcome(me, def, r.o);
    })
    .on('rd', d => {
      if (DUEL.ffa !== X || ffaJudge()) return;
      if (d.n === 1 || d.n !== X.round) ffaRound(d.n);
      if (d.wn) d.wn.forEach((v, i) => X.all[i] && (X.all[i].wins = v));
      ffaBoard();
    })
    .on('ko', d => DUEL.ffa === X && !ffaJudge() && d.r === X.round && ffaRoundEnd(d))
    .on('end', () => DUEL.ffa === X && !ffaJudge() && ffaMatchEnd())
    .on('fh', d => {
      // the hello: a player has the arena loaded
      const f = by(d.s);
      if (f) f.rx = performance.now();
      N.ready.add(d.s);
    })
    .on('fx', d => {
      const f = by(d.s);
      if (f && f !== DUEL.me) ffaGone(f, f.nm + ' طلع من الساحة');
    });
  $('dLoad').hidden = true;
  duelMsg('بانتظار اللاعبين…', X.all.map(f => f.nm).join(' · '));
}
function ffaGone(f, why) {
  const X = DUEL.ffa;
  if (!X || f.gone) return;
  f.gone = true;
  f.root.visible = false;
  if (f.tag) f.tag.s.visible = false;
  if (DUEL.tgt === f) DUEL.tgt = null;
  toast('🚪 ' + why);
  ffaBoard();
  if (X.all.filter(o => !o.gone).length < 2 && DUEL.phase !== 'over') ffaMatchEnd('الكل طلع من الساحة');
  else if (DUEL.phase === 'over') ffaAgainUi();
}
/** 20 times a second: our fighter's state (and, from the judge, the round). Hellos until the first round. */
function ffaNetTick(dt) {
  const X = DUEL.ffa,
    N = X.net,
    me = DUEL.me,
    judge = ffaJudge(),
    now = performance.now();
  if (X.round === 0) {
    if ((N.hiT = (N.hiT || 0) - dt) <= 0) {
      N.hiT = 0.4;
      N.ch.send('fh', { s: me.slot });
    }
    // the judge starts when everyone is in (or after 10 s without the slow ones)
    if (judge) {
      const all = X.all.every(f => f.gone || N.ready.has(f.slot));
      if (all || now - N.t0 > 10000) {
        for (const f of X.all) if (!N.ready.has(f.slot) && f !== me) ffaGone(f, f.nm + ' ما وصل للساحة');
        if (DUEL.ffa === X && DUEL.phase !== 'over') ffaRound(1);
      }
    }
    return;
  }
  if ((N.sendT -= dt) <= 0) {
    N.sendT = 0.05;
    const r = v => Math.round(v * 100) / 100,
      st = {
        s: me.slot,
        x: r(me.x),
        z: r(me.z),
        f: r(me.face),
        a: me.act,
        hp: Math.round(me.hp),
        st: Math.round(me.st),
        mx: r(me.moving ? me.want.mx : 0),
        mz: r(me.moving ? me.want.mz : 0),
        cu: me.cuts || undefined,
        w: me.wpId,
        rn: me.running ? 1 : undefined,
        kb: me.act === 'dead' && me.lastFrom ? me.lastFrom.slot : undefined,
        r: X.round,
      };
    if (judge) {
      st.j = 1;
      st.ck = r(DUEL.clock);
      if (DUEL.phase === 'ko' && X.kw && X.kw.r === X.round) st.k = X.kw;
      if (DUEL.phase === 'over') st.o = 1;
    }
    N.ch.send('st', st);
  }
  // someone silent for 7 s has gone
  for (const f of X.all) if (f !== me && !f.gone && now - f.rx > 7000) ffaGone(f, 'انقطع اتصال ' + f.nm);
}
addEventListener('pagehide', () => {
  try {
    if (DUEL.ffa && DUEL.ffa.net) DUEL.ffa.net.ch.send('fx', { s: DUEL.me.slot });
  } catch (e) {}
});

/* ---- the lobby (in the ⚔️ menu): open arenas are announced on 'ffa-lobby'; an arena's room is 'ffa-<id>' */
const FLOB = { ch: null, rooms: new Map(), room: null, t: null, sig: '' };
const ffaMe = () => ({ id: myPid(), n: S.name || 'لاعب', w: S.duelW || 'sword' });
async function ffaLobbyOpen() {
  ffaLobbyDraw();
  if (!FLOB.ch) {
    try {
      FLOB.ch = await netJoin('ffa-lobby');
      FLOB.ch.on('room', r => {
        if (!r || !r.room) return;
        if (r.open) FLOB.rooms.set(r.room, Object.assign(r, { at: Date.now() }));
        else FLOB.rooms.delete(r.room);
        ffaLobbyDraw();
      });
    } catch (e) {
      $('ffaStatus').textContent = 'ما قدرت أتصل، تأكد من الإنترنت';
      return;
    }
  }
  clearInterval(FLOB.t);
  FLOB.t = setInterval(ffaLobbyTick, 1000);
  ffaLobbyDraw();
}
function ffaLobbyStop() {
  ffaRoomLeave();
  clearInterval(FLOB.t);
}
function ffaLobbyTick() {
  const R = FLOB.room;
  if (R && R.host && !R.started) {
    FLOB.ch &&
      FLOB.ch.send('room', { room: R.id, n: S.name || 'لاعب', c: R.list.length, open: R.list.length < FFA_MAX });
    R.ch.send('ro', { list: R.list });
  }
  if (R && !R.host && !R.started && !R.list.some(x => x.id === myPid())) R.ch.send('hi', ffaMe());
  for (const [k, r] of FLOB.rooms) if (Date.now() - r.at > 7000) FLOB.rooms.delete(k);
  ffaLobbyDraw();
}
function ffaLobbyDraw() {
  const R = FLOB.room,
    list = [...FLOB.rooms.values()].filter(r => !R || r.room !== R.id);
  const sig =
    list.map(r => r.room + r.c + r.open).join() +
    '|' +
    (R ? R.id + R.host + R.list.map(m => m.id + m.n).join() + R.list.some(x => x.id === myPid()) : '');
  if (FLOB.sig === sig) return;
  FLOB.sig = sig;
  const box = $('ffaRooms');
  box.innerHTML = '';
  $('ffaStatus').textContent = list.length ? '' : 'ما فيه ساحات مفتوحة الحين. افتح وحدة وخلّ أخوياك ينضمون.';
  for (const r of list) {
    const row = el('div', 'cmRoom'),
      b = el('button', 'btn sm go', 'انضم');
    row.append(el('b', '', '🏟️ ' + r.n), el('span', '', r.c + ' / ' + FFA_MAX));
    b.disabled = !r.open || !!R;
    b.onclick = () => ffaJoin(r.room, r.n);
    row.appendChild(b);
    box.appendChild(row);
  }
  $('ffaRoom').hidden = !R;
  $('ffaCreate').hidden = !!R;
  if (!R) return;
  $('ffaRoomT').textContent = R.host ? '🏟️ ساحتك' : '🏟️ ساحة ' + R.hostName;
  const P = $('ffaPlayers');
  P.innerHTML = '';
  for (let i = 0; i < FFA_MAX; i++) {
    const m = R.list[i],
      row = el('div', 'cmP' + (m ? '' : ' empty'));
    if (m) {
      const dot = el('i', 'fDot');
      dot.style.background = FFA_COLORS[i];
      row.append(
        dot,
        el('b', '', m.n + (m.id === myPid() ? ' (أنت)' : '')),
        el('small', '', (i === 0 ? '👑 المضيف · ' : '') + ((DUEL_WEAPONS[m.w] || DUEL_WEAPONS.sword).n || ''))
      );
    } else row.append(el('i', '', '➕'), el('b', '', 'مكان فاضي'));
    P.appendChild(row);
  }
  $('ffaStart').hidden = !R.host;
  $('ffaStart').disabled = R.list.length < 2;
  $('ffaStart').textContent =
    R.list.length < 2 ? '⏳ تحتاج لاعب ثاني على الأقل' : '⚔️ ابدأ الملحمة (' + R.list.length + ')';
  $('ffaWait').hidden = R.host;
  $('ffaWait').textContent = R.list.some(x => x.id === myPid()) ? '⏳ بانتظار المضيف يبدأ…' : '⏳ جارٍ الانضمام…';
}
async function ffaCreate() {
  if (!S.name) return askName();
  const id = (myPid().slice(-4) + Math.random().toString(36).slice(2, 6)).toLowerCase();
  let ch;
  try {
    ch = await netJoin('ffa-' + id);
  } catch (e) {
    return toast('ما قدرت أفتح الساحة');
  }
  const R = (FLOB.room = { id, ch, host: true, list: [ffaMe()], hostName: S.name });
  ffaHostRoom(R);
  ffaLobbyTick();
}
function ffaHostRoom(R) {
  R.ch
    .on('hi', m => {
      if (!m || !m.id || R.started) return;
      const old = R.list.find(x => x.id === m.id);
      if (old) Object.assign(old, m);
      else if (R.list.length < FFA_MAX) {
        R.list.push(m);
        AU.play('select');
      } else R.ch.send('full', { to: m.id });
      R.ch.send('ro', { list: R.list });
      ffaLobbyDraw();
    })
    .on('bye', m => {
      R.list = R.list.filter(x => x.id !== (m && m.id));
      R.ch.send('ro', { list: R.list });
      ffaLobbyDraw();
    });
}
async function ffaJoin(id, hostName) {
  if (!S.name) return askName();
  let ch;
  try {
    ch = await netJoin('ffa-' + id);
  } catch (e) {
    return toast('ما قدرت أنضم');
  }
  const R = (FLOB.room = { id, ch, host: false, list: [], hostName });
  ch.on('ro', m => {
    if (!m || R.started || R.host) return;
    R.list = m.list || [];
    ffaLobbyDraw();
  })
    .on('full', m => {
      if (m && m.to === myPid()) {
        toast('الساحة مليانة (' + FFA_MAX + ' لاعبين)');
        ffaRoomLeave(true);
      }
    })
    .on('bye', m => {
      if (!m || R.host) return;
      const was = R.list[0];
      R.list = R.list.filter(x => x.id !== m.id);
      if (!was || m.id !== was.id) return ffaLobbyDraw();
      // the host left: the next one in the room hosts it
      const next = R.list[0];
      if (!next) {
        toast('المضيف طلع والساحة فاضية');
        return ffaRoomLeave(true);
      }
      R.hostName = next.n;
      if (next.id === myPid()) {
        R.host = true;
        ffaHostRoom(R);
        ffaLobbyTick();
        toast('👑 المضيف طلع وصرت أنت المضيف');
      } else toast('👑 المضيف طلع و' + next.n + ' صار المضيف');
      ffaLobbyDraw();
    })
    .on('go', m => {
      if (R.started || !m || !m.list || !m.list.some(x => x.id === myPid())) return;
      R.started = true;
      FLOB.room = null;
      clearInterval(FLOB.t);
      ffaGoMatch(ch, m.list);
    });
  ch.send('hi', ffaMe());
  ffaLobbyDraw();
}
function ffaRoomLeave(silent) {
  const R = FLOB.room;
  if (!R) return;
  FLOB.room = null;
  try {
    if (!silent) R.ch.send('bye', { id: myPid() });
    if (R.host) FLOB.ch && FLOB.ch.send('room', { room: R.id, open: false });
  } catch (e) {}
  setTimeout(() => R.ch.close(), 300);
  ffaLobbyDraw();
}
function ffaGo() {
  const R = FLOB.room;
  if (!R || !R.host || R.list.length < 2) return;
  R.started = true;
  clearInterval(FLOB.t);
  FLOB.ch && FLOB.ch.send('room', { room: R.id, open: false });
  for (const t of [0, 250, 600]) setTimeout(() => R.ch.send('go', { list: R.list }), t);
  FLOB.room = null;
  ffaGoMatch(R.ch, R.list);
}
function ffaGoMatch(ch, list) {
  lobbyClose();
  clearInterval(FLOB.t);
  if (typeof liveSet === 'function') liveSet({ k: 'duel' });
  ffaStart({ ch, list });
}
$('ffaTrain').onclick = () => {
  ffaLobbyStop();
  lobbyClose();
  ffaStart(null);
};
$('ffaCreate').onclick = () => ffaCreate();
$('ffaStart').onclick = () => ffaGo();
$('ffaLeave').onclick = () => ffaRoomLeave();
// the ⚔️ menu opens and closes the melee lobby with the duel's
{
  const open = lobbyOpen;
  lobbyOpen = async function () {
    ffaLobbyOpen();
    return open.apply(this, arguments);
  };
  $('mDuel').onclick = () => lobbyOpen();
  const back = $('dmBack').onclick;
  $('dmBack').onclick = () => {
    ffaLobbyStop();
    back();
  };
  const train = $('dmTrain').onclick;
  $('dmTrain').onclick = () => {
    ffaLobbyStop();
    train();
  };
}
