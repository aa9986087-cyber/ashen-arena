'use strict';
/* Sword duel — the mode: its own arena scene, lock-on camera (first person / over the shoulder), rounds (first to 3),
   keyboard + touch controls and the duel HUD. For now the opponent is the training bot (duel-ai.js). */
const DUEL = {
  on: false,
  ready: false,
  scene: null,
  cam: new THREE.PerspectiveCamera(70, 1, 0.05, 120),
  me: null,
  foe: null,
  bot: null,
  score: [0, 0],
  round: 0,
  phase: 'load',
  phaseT: 0,
  clock: 60,
  view: 'fp',
  eyeY: 1.62,
  shake: 0,
  slow: 0,
  atkDown: -1, // time the attack button went down (-1 = up); a long press becomes a heavy swing
  heavyFired: false,
  joy: null,
  torches: [],
};
const DUEL_WIN = 3,
  DUEL_ROUND = 60,
  DUEL_HOLD = 0.25;
try {
  DUEL.view = localStorage.getItem('ashen_duel_view') || 'fp';
} catch (e) {}

/* ---- enter / leave */
async function duelStart(online, watch) {
  AU.init();
  hideScreens();
  $('hud').hidden = true;
  $('duel').hidden = false;
  $('dLoad').hidden = false;
  $('dOver').hidden = true;
  G.state = 'duel';
  DUEL.on = true;
  // a touch screen needs the on-screen buttons from the first second
  if (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) document.body.classList.remove('mouse');
  renderer.outputEncoding = THREE.sRGBEncoding; // the duel models are lit in sRGB
  duelSoundsLoad();
  try {
    if (!DUEL.ready) {
      // the arena's name and banners are drawn in the game's display font: wait for it
      await Promise.race([document.fonts.load('80px Lalezar'), new Promise(r => setTimeout(r, 2500))]).catch(() => {});
      DUEL.scene = duelArena();
      const [a, b] = await Promise.all([duelLoad(), duelLoad()]);
      DUEL.me = new Duelist(a, 212, 118); // blue cloth: you
      DUEL.foe = new Duelist(b, 2, 96); // red cloth, deeper voice: the opponent
      DUEL.scene.add(DUEL.me.root, DUEL.foe.root);
      DUEL.me.onHit = r => duelOutcome(DUEL.me, DUEL.foe, r);
      DUEL.foe.onHit = r => duelOutcome(DUEL.foe, DUEL.me, r);
      DUEL.ready = true;
    }
  } catch (e) {
    console.warn('duel', e);
    toast('ما قدرت أحمّل المبارزة، تأكد من الإنترنت');
    duelExit();
    return;
  }
  if (!DUEL.on) return;
  goreClear();
  const me = DUEL.me,
    foe = DUEL.foe;
  // online: the opponent's copy follows the network and its owner judges our blows on it
  foe.remote = !!online || !!watch;
  me.remote = !!watch;
  $('duel').classList.toggle('watching', !!watch);
  me.onMove = online
    ? m => DUEL.net && DUEL.net.ch.send('mv', Object.assign(m, { r: DUEL.round, h: DUEL.net.host ? 1 : 0 }))
    : null;
  foe.onHit = online
    ? r => {
        duelOutcome(foe, me, r);
        DUEL.net && DUEL.net.ch.send('res', { o: r, k: foe.act });
      }
    : r => duelOutcome(foe, me, r);
  DUEL.bot = online || watch ? null : new DuelBot(foe, me);
  $('dNameMe').textContent = watch ? DUEL.watch.a : S.name || 'أنت';
  $('dNameFoe').textContent = watch ? DUEL.watch.b : online ? DUEL.net.foeName : 'خصم التدريب';
  $('dAgain').hidden = !!online || !!watch;
  DUEL.score = [0, 0];
  DUEL.round = 0;
  MUS.on = true;
  MUS.boss = true;
  if (watch) {
    $('dLoad').hidden = true;
    DUEL.phase = 'fight';
    duelPlace();
    duelPips();
    duelMsg('👁️ تشاهد', DUEL.watch.a + ' ضد ' + DUEL.watch.b);
    return;
  }
  if (online) {
    duelMsg('بانتظار الخصم…', DUEL.net.foeName);
    duelPlace();
    return; // the handshake starts round 1
  }
  $('dLoad').hidden = true;
  duelRound();
}
function duelExit() {
  if (DUEL.watch) {
    const ch = DUEL.watch.ch;
    DUEL.watch = null;
    try {
      ch.close();
    } catch (e) {}
  }
  if (typeof liveSet === 'function') liveSet({ k: 'idle' });
  if (DUEL.net) {
    try {
      DUEL.net.ch.send('bye', {});
    } catch (e) {}
    const ch = DUEL.net.ch;
    setTimeout(() => ch.close(), 300);
    DUEL.net = null;
  }
  DUEL.on = false;
  duelUnlock();
  $('duel').hidden = true;
  renderer.outputEncoding = THREE.LinearEncoding;
  scene.traverse(o => o.material && (o.material.needsUpdate = true));
  IN.k = {};
  MUS.boss = false;
  G.state = 'menu';
  go('menu');
}
/** Starting spots: the host (or the training player) on the south side, the guest on the north. */
function duelPlace() {
  const south = !DUEL.net || DUEL.net.host,
    A = [0, -3, 0],
    B = [0, 3, Math.PI];
  DUEL.me.reset(...(south ? A : B));
  DUEL.foe.reset(...(south ? B : A));
}
function duelRound(n) {
  DUEL.round = n || DUEL.round + 1;
  duelPlace();
  DUEL.clock = DUEL_ROUND;
  DUEL.phase = 'intro';
  DUEL.phaseT = 2.4;
  DUEL.saidFight = false;
  $('dLoad').hidden = true;
  if (DUEL.round === 1) duelMsg(ARENA_NAME, 'الجولة 1');
  else duelMsg('الجولة ' + DUEL.round, DUEL.score[0] + ' - ' + DUEL.score[1]);
  DS.round(DUEL.round, DUEL.score[0] === DUEL_WIN - 1 && DUEL.score[1] === DUEL_WIN - 1);
  duelPips();
  if (DUEL.net && DUEL.net.host) DUEL.net.ch.send('rd', { n: DUEL.round });
}

/* ---- feedback */
function duelMsg(big, small, cls) {
  const m = $('dMsg');
  m.querySelector('b').textContent = big;
  m.querySelector('p').textContent = small || '';
  m.className = cls || '';
  pop(m, 'show');
}
function duelFloat(t, cls) {
  const e = $('dFloat');
  e.textContent = t;
  e.className = cls || '';
  pop(e, 'on');
}
function duelOutcome(att, def, r) {
  const mine = att === DUEL.me;
  if (r === 'hit') {
    const heavy = att.act === 'heavy';
    DUEL.shake = Math.max(DUEL.shake, heavy ? 0.35 : 0.18);
    if (!mine) {
      pop($('dHurt'), 'on');
      goreScreen(heavy ? 4 : 2);
    } else if (
      DUEL.view === 'fp' &&
      Math.hypot(att.x - def.x, att.z - def.z) < 2.4 &&
      Math.random() < (heavy ? 1 : 0.45)
    )
      goreScreen(heavy ? 2 : 1, true); // the spray reaches your eyes
  } else if (r === 'block') duelFloat('صد!', 'blk');
  else if (r === 'parry') {
    duelFloat('صد مثالي!', 'par');
    DUEL.slow = 0.35;
  } else if (r === 'break') {
    duelFloat('كسر الصد!', 'brk');
    DUEL.shake = 0.3;
    if (!mine) goreScreen(1);
  } else if (r === 'miss' && !mine) duelFloat('تفادي!', 'blk');
}
function duelPips() {
  const p = (n, el) => {
    el.innerHTML = '';
    for (let i = 0; i < DUEL_WIN; i++) el.appendChild(document.createElement('i')).className = i < n ? 'on' : '';
  };
  p(DUEL.score[0], $('dPipsMe'));
  p(DUEL.score[1], $('dPipsFoe'));
}
function duelHud() {
  const me = DUEL.me,
    foe = DUEL.foe;
  $('dHpMe').style.width = me.hp + '%';
  $('dHpFoe').style.width = foe.hp + '%';
  $('dStMe').style.width = (me.st / DM.stMax) * 100 + '%';
  $('dStMe').parentElement.classList.toggle('low', me.st < DM.light.st);
  $('dStFoe').style.width = (foe.st / DM.stMax) * 100 + '%';
  $('dTime').textContent = Math.ceil(DUEL.clock);
}

/* ---- input */
function duelInput() {
  if (DUEL.phase !== 'fight') return; // no moves during the countdown or after a knock-out
  const me = DUEL.me,
    k = IN.k;
  let mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0),
    mz = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  if (DUEL.joy) {
    mx = DUEL.joy.x;
    mz = DUEL.joy.z;
  }
  me.want.mx = mx;
  me.want.mz = mz;
  me.want.block = !!(k.ShiftLeft || k.ShiftRight || k.KeyL || DUEL.blockHeld || DUEL.rmb);
  // attack button: release before DUEL_HOLD = light, keep holding = heavy
  if (DUEL.atkDown >= 0 && !DUEL.heavyFired && performance.now() - DUEL.atkDown > DUEL_HOLD * 1000) {
    DUEL.heavyFired = true;
    me.heavy();
  }
}
function duelAtkDown() {
  if (DUEL.atkDown < 0) {
    DUEL.atkDown = performance.now();
    DUEL.heavyFired = false;
  }
}
function duelAtkUp() {
  if (DUEL.atkDown >= 0 && !DUEL.heavyFired && DUEL.phase === 'fight') DUEL.me.light();
  DUEL.atkDown = -1;
}
function duelDodge() {
  if (DUEL.phase !== 'fight') return;
  const w = DUEL.me.want;
  DUEL.me.dodge(w.mx, w.mz);
}
addEventListener('keydown', e => {
  if (!DUEL.on || e.repeat || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
  if (e.code === 'KeyJ') duelAtkDown();
  if (e.code === 'KeyK' && DUEL.phase === 'fight') DUEL.me.heavy();
  if (e.code === 'Space') {
    e.preventDefault();
    duelDodge();
  }
  if (e.code === 'KeyV') duelToggleView();
  if (e.code === 'Escape') duelExit();
});
addEventListener('keyup', e => {
  if (DUEL.on && e.code === 'KeyJ') duelAtkUp();
});
// mouse on the duel layer: left = attack (hold = heavy), right = block
$('dPad').addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') {
    document.body.classList.remove('mouse');
    // left half: floating joystick
    if (e.clientX < innerWidth * 0.5 && !DUEL.joy) {
      DUEL.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: 0, z: 0 };
      const j = $('dJoy');
      j.hidden = false;
      j.style.left = e.clientX + 'px';
      j.style.top = e.clientY + 'px';
      j.firstElementChild.style.transform = '';
    }
    return;
  }
  document.body.classList.add('mouse');
  if (e.button === 0) duelAtkDown();
  if (e.button === 2) DUEL.rmb = true;
});
addEventListener('pointermove', e => {
  const J = DUEL.joy;
  if (!J || e.pointerId !== J.id) return;
  let dx = e.clientX - J.x0,
    dy = e.clientY - J.y0;
  const d = Math.hypot(dx, dy),
    m = 50;
  if (d > m) {
    dx *= m / d;
    dy *= m / d;
  }
  J.x = dx / m;
  J.z = -dy / m;
  $('dJoy').firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
});
const duelJoyEnd = e => {
  if (DUEL.joy && e.pointerId === DUEL.joy.id) {
    DUEL.joy = null;
    $('dJoy').hidden = true;
  }
  if (e.pointerType !== 'touch') {
    if (e.button === 0) duelAtkUp();
    if (e.button === 2) DUEL.rmb = false;
  }
};
addEventListener('pointerup', duelJoyEnd);
addEventListener('pointercancel', duelJoyEnd);
$('dPad').addEventListener('contextmenu', e => e.preventDefault());
// touch buttons
const press = (id, down, up) => {
  const b = $(id);
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    b.classList.add('held');
    down();
  });
  const end = e => {
    b.classList.remove('held');
    up && up();
  };
  b.addEventListener('pointerup', end);
  b.addEventListener('pointercancel', end);
  b.addEventListener('pointerleave', end);
};
press('dAtk', duelAtkDown, duelAtkUp);
press(
  'dBlock',
  () => (DUEL.blockHeld = true),
  () => (DUEL.blockHeld = false)
);
press('dDodge', duelDodge);
$('dView').onclick = () => duelToggleView();
/** Landscape: full screen + orientation lock where the browser allows it (Android); otherwise ask to rotate. */
$('dLand').onclick = async () => {
  try {
    const d = document.documentElement;
    if (!document.fullscreenElement && d.requestFullscreen) await d.requestFullscreen({ navigationUI: 'hide' });
    await screen.orientation.lock('landscape');
    DUEL.locked = true;
  } catch (e) {
    toast('لف جوالك بالعرض 🔄 (جهازك ما يسمح للمواقع تقلب الشاشة)');
  }
};
function duelUnlock() {
  if (!DUEL.locked) return;
  DUEL.locked = false;
  try {
    screen.orientation.unlock();
    if (document.fullscreenElement) document.exitFullscreen();
  } catch (e) {}
}
$('dExit').onclick = () => duelExit();
$('dAgain').onclick = () => {
  $('dOver').hidden = true;
  DUEL.score = [0, 0];
  DUEL.round = 0;
  goreClear();
  duelRound();
};
$('dLeave').onclick = () => duelExit();
function duelToggleView() {
  DUEL.view = DUEL.view === 'fp' ? 'tps' : 'fp';
  try {
    localStorage.setItem('ashen_duel_view', DUEL.view);
  } catch (e) {}
  toast(DUEL.view === 'fp' ? '👁️ منظور العين' : '🎥 من ورا الكتف');
}

/* ---- camera */
const dV = new THREE.Vector3(),
  dT = new THREE.Vector3(),
  dLook = new THREE.Vector3(0, 1.2, 0);
function duelCamera(dt) {
  const me = DUEL.me,
    foe = DUEL.foe,
    cam = DUEL.cam,
    fp = DUEL.view === 'fp' && me.act !== 'dead',
    f = me.face,
    fx = Math.sin(f),
    fz = Math.cos(f);
  if (DUEL.watch) {
    for (const m of me.fpHide) m.visible = !m.userData.cut;
    const mx = (me.x + foe.x) / 2,
      mz = (me.z + foe.z) / 2,
      ax = foe.x - me.x,
      az = foe.z - me.z,
      L = Math.hypot(ax, az) || 1,
      far = 4.2 + L * 0.9;
    cam.fov = 50;
    dT.set(mx + (-az / L) * far, 2.6, mz + (ax / L) * far);
    cam.position.lerp(dT, Math.min(1, dt * 3));
    dLook.lerp(dV.set(mx, 1.1, mz), Math.min(1, dt * 6));
    cam.lookAt(dLook);
    if (cam.aspect !== W / H) cam.aspect = W / H;
    cam.updateProjectionMatrix();
    return;
  }
  for (const m of me.fpHide) m.visible = !fp && !m.userData.cut;
  cam.fov = fp ? 72 : 55;
  if (fp) {
    // a steady eye: tied to where the fighter stands, not to the head bone (hit and fall clips swing the head around)
    const eye = me.act === 'dodge' ? 1.05 : me.act === 'knock' ? 1.4 : 1.62;
    DUEL.eyeY += (eye - DUEL.eyeY) * Math.min(1, dt * 10);
    cam.position.set(me.x + fx * 0.12, DUEL.eyeY, me.z + fz * 0.12);
  } else {
    cam.position.set(me.x - fx * 3.1 - fz * 0.75, 2.15, me.z - fz * 3.1 + fx * 0.75);
  }
  dT.set(foe.x, fp ? 1.25 : 1.1, foe.z);
  if (!fp) dT.lerp(dV.set(me.x, 1.1, me.z), 0.35);
  dLook.lerp(dT, Math.min(1, dt * 12));
  const s = DUEL.shake;
  if (s > 0) cam.position.add(dV.set(rand(-s, s) * 0.3, rand(-s, s) * 0.3, rand(-s, s) * 0.3));
  cam.lookAt(dLook);
  if (cam.aspect !== W / H) cam.aspect = W / H;
  cam.updateProjectionMatrix();
}

/* ---- frame */
function duelFrame(rdt) {
  if (!DUEL.ready || !DUEL.me) {
    renderer.setClearColor(0x120f18);
    renderer.clear();
    return;
  }
  if (DUEL.watch) {
    DUEL.shake = 0;
    DUEL.me.update(rdt, DUEL.foe);
    DUEL.foe.update(rdt, DUEL.me);
    if (performance.now() - DUEL.watch.lastRx > 8000 && DUEL.phase !== 'over') duelWatchEnd('انقطع البث');
  } else {
    duelInput();
    duelStep(rdt);
    if (DUEL.net && DUEL.net.ready) duelNetTick(rdt);
  }
  arenaTick(rdt);
  goreUpdate(DUEL.slow > 0 ? rdt * 0.35 : rdt);
  duelCamera(rdt);
  duelHud();
  renderer.render(DUEL.scene, DUEL.cam);
}
/** One tick of duel rules (no drawing): phases, the opponent, both fighters. */
function duelStep(rdt) {
  let dt = rdt;
  if (DUEL.slow > 0) {
    DUEL.slow -= rdt;
    dt *= 0.35;
  }
  DUEL.shake = Math.max(0, DUEL.shake - rdt * 1.6);
  const me = DUEL.me,
    foe = DUEL.foe;
  const judge = !DUEL.net || DUEL.net.host;
  if (DUEL.phase === 'fight') {
    if (DUEL.bot) DUEL.bot.update(dt);
    if (judge) {
      DUEL.clock -= dt;
      if (me.hp <= 0 || foe.hp <= 0 || DUEL.clock <= 0) duelRoundEnd();
    }
  } else {
    me.want.mx = me.want.mz = foe.want.mx = foe.want.mz = 0;
    me.want.block = foe.want.block = false;
    DUEL.phaseT -= rdt;
    if (DUEL.phase === 'intro' && DUEL.phaseT <= 0.9 && !DUEL.saidFight) {
      DUEL.saidFight = true;
      duelMsg('قاتل!', '', 'go');
      dPlay('v_go', 1);
    }
    if (DUEL.phase === 'intro' && DUEL.phaseT <= 0) {
      DUEL.phase = 'fight';
      DUEL.saidFight = false;
    }
    if (DUEL.phase === 'ko' && DUEL.phaseT <= 0 && judge) {
      if (DUEL.score[0] >= DUEL_WIN || DUEL.score[1] >= DUEL_WIN) {
        duelMatchEnd();
        if (DUEL.net) DUEL.net.ch.send('end', {});
      } else duelRound();
    }
  }
  me.update(dt, foe);
  foe.update(dt, me);
}
function duelRoundEnd(told) {
  const me = DUEL.me,
    foe = DUEL.foe;
  let meWon = foe.hp <= 0 || (me.hp > 0 && DUEL.clock <= 0 && me.hp > foe.hp),
    draw = DUEL.clock <= 0 && me.hp === foe.hp;
  if (told) {
    // the guest: the host's verdict, seen from our side
    meWon = told.w === 'g';
    draw = told.w === 'd';
    DUEL.clock = told.to ? 0 : DUEL.clock;
  } else if (DUEL.net) DUEL.net.ch.send('ko', { w: draw ? 'd' : meWon ? 'h' : 'g', to: DUEL.clock <= 0 ? 1 : 0 });
  if (DUEL.net && DUEL.net.host) {
    const sc = DUEL.score.slice();
    if (!draw) sc[meWon ? 0 : 1]++;
    LIVE.trackT = 0;
    liveSet({ k: 'duel', room: DUEL.net.room, b: DUEL.net.foeName, sc: sc[0] + ' - ' + sc[1] });
  }
  if (!draw) DUEL.score[meWon ? 0 : 1]++;
  DUEL.phase = 'ko';
  DUEL.phaseT = 2.6;
  DUEL.slow = 1.1;
  duelPips();
  if (draw) duelMsg('تعادل', 'الوقت انتهى بنفس الصحة');
  else duelMsg(meWon ? 'فزت بالجولة' : 'خسرت الجولة', DUEL.score[0] + ' - ' + DUEL.score[1], meWon ? 'win' : 'lose');
  DS.crowd(meWon ? 0.22 : 0.14);
  if (DUEL.clock <= 0) dPlay('v_time_over', 1, 1, 0.3);
  else if (draw) dPlay('v_its_a_tie', 1, 1, 0.3);
}
function duelMatchEnd(why) {
  if (DUEL.phase === 'over') return;
  const won = DUEL.score[0] >= DUEL_WIN;
  if (DUEL.net && DUEL.net.host && !why) {
    const me = S.name || 'لاعب',
      foe = DUEL.net.foeName;
    duelRecord(me, foe, won ? me : foe, DUEL.score[0] + '-' + DUEL.score[1]);
  }
  DUEL.phase = 'over';
  $('dOver').hidden = false;
  $('dOverT').textContent = won ? '🏆 انتصرت!' : '💀 هُزمت';
  $('dOverS').textContent = (why ? why + '\n' : '') + DUEL.score[0] + ' - ' + DUEL.score[1];
  dPlay(won ? 'v_you_win' : 'v_you_lose', 1);
  DS.crowd(won ? 0.28 : 0.12);
}

/* ---- online match */
/** Join the match channel, load the arena, then shake hands: the guest says hi until the host answers go. */
async function duelStartOnline(room, host, foeName) {
  let ch;
  try {
    ch = await netJoin('duel-' + room);
  } catch (e) {
    toast('ما قدرت أتصل بخصمك');
    go('menu');
    return;
  }
  const N = (DUEL.net = { ch, host, room, foeName, lastRx: performance.now(), sendT: 0, ready: false });
  const alive = () => (N.lastRx = performance.now());
  ch.on('st', s => {
    alive();
    if (s.r !== DUEL.round) return; // a late message from the previous round
    if (DUEL.foe && DUEL.phase !== 'over') DUEL.foe.netState(s);
    if (!host && s.ck !== undefined && DUEL.phase === 'fight') DUEL.clock = s.ck;
  })
    .on('mv', m => {
      alive();
      if (DUEL.foe && DUEL.phase === 'fight' && m.r === DUEL.round) DUEL.foe.netMove(m);
    })
    .on('res', r => duelNetRes(r))
    .on('rd', d => {
      alive();
      if (!host && DUEL.ready) {
        N.ready = true;
        duelRound(d.n);
      }
    })
    .on('ko', d => !host && DUEL.phase === 'fight' && duelRoundEnd(d))
    .on('end', () => !host && duelMatchEnd())
    .on('hi', () => {
      alive();
      if (host && DUEL.ready && DUEL.on) {
        ch.send('go', {});
        if (!N.ready) {
          N.ready = true;
          duelRound(1);
          liveSet({ k: 'duel', room, b: foeName, sc: '0 - 0' });
        }
      }
    })
    .on('go', () => {
      alive();
      N.ready = true;
    })
    .on('bye', () => duelForfeit('خصمك طلع من المبارزة'));
  await duelStart(true);
  if (!DUEL.on || DUEL.net !== N) return;
  N.lastRx = performance.now();
  if (!host) {
    const hi = setInterval(() => {
      if (DUEL.net !== N || N.ready) return clearInterval(hi);
      ch.send('hi', {});
    }, 400);
  }
  setTimeout(() => {
    if (DUEL.net === N && !N.ready) {
      toast('خصمك ما وصل للمبارزة');
      duelExit();
    }
  }, 20000);
}
/** Send our fighter 20 times a second; give up on an opponent silent for 7 s. */
function duelNetTick(dt) {
  const N = DUEL.net,
    me = DUEL.me;
  if ((N.sendT -= dt) <= 0) {
    N.sendT = 0.05;
    const r = v => Math.round(v * 100) / 100;
    N.ch.send('st', {
      x: r(me.x),
      z: r(me.z),
      f: r(me.face),
      a: me.act,
      hp: Math.round(me.hp),
      st: Math.round(me.st),
      mx: r(me.moving ? me.want.mx : 0),
      mz: r(me.moving ? me.want.mz : 0),
      ck: N.host ? r(DUEL.clock) : undefined,
      cu: me.cuts || undefined,
      r: DUEL.round,
      h: N.host ? 1 : 0,
    });
  }
  if (DUEL.phase !== 'over' && performance.now() - N.lastRx > 7000) duelForfeit('انقطع اتصال خصمك');
}
/** The defender judged our blow: apply what it means for us (the attacker). */
function duelNetRes(r) {
  const me = DUEL.me;
  if (!me || DUEL.phase !== 'fight') return;
  if (r.o === 'parry') {
    me.stagger(r.k === 'heavy' ? 1.1 : 0.9);
    DS.parry();
  } else if (r.o === 'block') {
    me.kx -= Math.sin(me.face) * 2.5;
    me.kz -= Math.cos(me.face) * 2.5;
    DS.block();
  } else if (r.o === 'break') DS.breakGuard();
  duelOutcome(me, DUEL.foe, r.o);
}
/** The opponent left: we win. */
function duelForfeit(why) {
  if (!DUEL.on || DUEL.phase === 'over') return;
  DUEL.score[0] = DUEL_WIN;
  duelPips();
  duelMatchEnd(why);
}
// closing the tab mid-match: tell the opponent at once (otherwise it waits for the 7 s silence)
addEventListener('pagehide', () => {
  try {
    if (DUEL.net) DUEL.net.ch.send('bye', {});
  } catch (e) {}
});

/* ---- spectating a match (from the 📺 live list): listen on its channel, both fighters follow the network */
async function duelStartWatch(room, a, b) {
  let ch;
  try {
    ch = await netJoin('duel-' + room);
  } catch (e) {
    toast('ما قدرت أفتح المبارزة');
    return;
  }
  const W = (DUEL.watch = { ch, a, b, lastRx: performance.now() });
  const fighter = h => (h ? DUEL.me : DUEL.foe); // the host is drawn as the blue fighter
  ch.on('st', s => {
    W.lastRx = performance.now();
    if (!DUEL.me || DUEL.phase === 'over') return;
    if (s.r && s.r !== DUEL.round) {
      DUEL.round = s.r;
      duelPips();
    }
    fighter(s.h).netState(s);
    if (s.h && s.ck !== undefined) DUEL.clock = s.ck;
  })
    .on('mv', m => DUEL.me && DUEL.phase !== 'over' && fighter(m.h).netMove(m))
    .on('rd', d => {
      if (!DUEL.me) return;
      DUEL.round = d.n;
      duelPlace();
      DUEL.clock = DUEL_ROUND;
      duelMsg('الجولة ' + d.n, DUEL.score[0] + ' - ' + DUEL.score[1]);
      DS.round(d.n, DUEL.score[0] === DUEL_WIN - 1 && DUEL.score[1] === DUEL_WIN - 1);
      duelPips();
    })
    .on('ko', d => {
      if (!DUEL.me) return;
      if (d.w !== 'd') DUEL.score[d.w === 'h' ? 0 : 1]++;
      duelPips();
      duelMsg(
        d.w === 'd' ? 'تعادل' : (d.w === 'h' ? a : b) + ' فاز بالجولة',
        DUEL.score[0] + ' - ' + DUEL.score[1],
        'win'
      );
      DS.crowd(0.2);
    })
    .on('end', () => duelWatchEnd())
    .on('bye', () => duelWatchEnd('واحد من اللاعبين طلع'));
  DUEL.score = [0, 0];
  await duelStart(false, true);
}
function duelWatchEnd(why) {
  if (!DUEL.watch || DUEL.phase === 'over') return;
  DUEL.phase = 'over';
  const A = DUEL.score[0],
    B = DUEL.score[1];
  $('dOver').hidden = false;
  $('dOverT').textContent = why ? '📺 انتهى البث' : '🏆 ' + (A >= B ? DUEL.watch.a : DUEL.watch.b) + ' فاز';
  $('dOverS').textContent = (why ? why + '\n' : '') + DUEL.watch.a + ' ' + A + ' - ' + B + ' ' + DUEL.watch.b;
  DS.crowd(0.25);
}
