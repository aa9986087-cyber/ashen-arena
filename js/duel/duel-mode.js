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

/* ---- arena */
function duelArena() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x120f18);
  s.fog = new THREE.Fog(0x120f18, 14, 40);
  s.add(new THREE.HemisphereLight(0xbfc8ff, 0x2a1c14, 0.55));
  const key = new THREE.DirectionalLight(0xffe2c0, 0.9);
  key.position.set(6, 14, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
  key.shadow.bias = -0.0008;
  s.add(key);
  // stone floor: a canvas texture of worn flagstones
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#4a4440';
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      const v = 60 + Math.random() * 30;
      x.fillStyle = `rgb(${v + 8},${v + 2},${v - 4})`;
      x.fillRect(i * 64 + 2 + (j % 2) * 16, j * 64 + 2, 60, 60);
    }
  for (let i = 0; i < 2500; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  tex.encoding = THREE.sRGBEncoding;
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(11, 48),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  s.add(floor);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.85 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(DM.arena + 0.9, 0.35, 8, 64), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.15;
  ring.receiveShadow = true;
  s.add(ring);
  // pillars with torches around the ring
  DUEL.torches = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2,
      px = Math.cos(a) * (DM.arena + 2.4),
      pz = Math.sin(a) * (DM.arena + 2.4);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 4.2, 10), ringMat);
    p.position.set(px, 2.1, pz);
    p.castShadow = true;
    s.add(p);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
    flame.position.set(px * 0.93, 3.2, pz * 0.93);
    s.add(flame);
    DUEL.torches.push(flame);
    if (i % 2 === 0) {
      const l = new THREE.PointLight(0xff9a40, 0.9, 13, 2);
      l.position.copy(flame.position);
      s.add(l);
      flame.userData.light = l;
    }
  }
  // distant dark crowd stands: a ring of steps
  const steps = new THREE.Mesh(
    new THREE.CylinderGeometry(19, 16, 3, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x241e22, roughness: 1, side: THREE.BackSide })
  );
  steps.position.y = 1.5;
  s.add(steps);
  return s;
}

/* ---- enter / leave */
async function duelStart() {
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
  DUEL.bot = new DuelBot(DUEL.foe, DUEL.me);
  $('dLoad').hidden = true;
  $('dNameMe').textContent = S.name || 'أنت';
  $('dNameFoe').textContent = 'خصم التدريب';
  DUEL.score = [0, 0];
  DUEL.round = 0;
  duelRound();
  MUS.on = true;
  MUS.boss = true;
}
function duelExit() {
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
function duelRound() {
  DUEL.round++;
  DUEL.me.reset(0, -3, 0);
  DUEL.foe.reset(0, 3, Math.PI);
  DUEL.clock = DUEL_ROUND;
  DUEL.phase = 'intro';
  DUEL.phaseT = 2.4;
  duelMsg('الجولة ' + DUEL.round, DUEL.score[0] + ' - ' + DUEL.score[1]);
  DS.round(DUEL.round, DUEL.score[0] === DUEL_WIN - 1 && DUEL.score[1] === DUEL_WIN - 1);
  duelPips();
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
    DUEL.shake = Math.max(DUEL.shake, att.act === 'heavy' ? 0.35 : 0.18);
    if (!mine) pop($('dHurt'), 'on');
  } else if (r === 'block') duelFloat('صد!', 'blk');
  else if (r === 'parry') {
    duelFloat('صد مثالي!', 'par');
    DUEL.slow = 0.35;
  } else if (r === 'break') {
    duelFloat('كسر الصد!', 'brk');
    DUEL.shake = 0.3;
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
  for (const m of me.fpHide) m.visible = !fp;
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
  duelInput();
  duelStep(rdt);
  for (const t of DUEL.torches) {
    const k = 0.85 + Math.random() * 0.3;
    t.scale.setScalar(k);
    if (t.userData.light) t.userData.light.intensity = 0.75 * k;
  }
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
  if (DUEL.phase === 'fight') {
    DUEL.bot.update(dt);
    DUEL.clock -= dt;
    if (me.hp <= 0 || foe.hp <= 0 || DUEL.clock <= 0) duelRoundEnd();
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
    if (DUEL.phase === 'ko' && DUEL.phaseT <= 0) {
      if (DUEL.score[0] >= DUEL_WIN || DUEL.score[1] >= DUEL_WIN) duelMatchEnd();
      else duelRound();
    }
  }
  me.update(dt, foe);
  foe.update(dt, me);
}
function duelRoundEnd() {
  const me = DUEL.me,
    foe = DUEL.foe;
  const meWon = foe.hp <= 0 || (me.hp > 0 && DUEL.clock <= 0 && me.hp > foe.hp),
    draw = DUEL.clock <= 0 && me.hp === foe.hp;
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
function duelMatchEnd() {
  const won = DUEL.score[0] >= DUEL_WIN;
  DUEL.phase = 'over';
  $('dOver').hidden = false;
  $('dOverT').textContent = won ? '🏆 انتصرت!' : '💀 هُزمت';
  $('dOverS').textContent = DUEL.score[0] + ' - ' + DUEL.score[1];
  dPlay(won ? 'v_you_win' : 'v_you_lose', 1);
  DS.crowd(won ? 0.28 : 0.12);
}
$('mDuel').onclick = () => duelStart();
