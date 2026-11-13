'use strict';
/* Sword duel — the walk-out before round 1: a crane shot over the arena, each fighter walks to his mark and
   salutes with his blade under his name card, then both face off under a big VS. Every client plays it on its
   own clock when round 1 starts (the round's countdown is simply longer by INTRO_T), so it stays in step online.
   In training a tap skips it. */
const INTRO_T = 7.4;
const INTRO = [
  [0, 1.5, 'arena'],
  [1.5, 3.9, 'a'],
  [3.9, 6.3, 'b'],
  [6.3, INTRO_T, 'vs'],
];
/** On a phone, a moment to turn it sideways before the walk-out starts (the duel is already turned to landscape). */
const INTRO_ROT = 2.6;
const duelTouch = () => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
/** Round 1 begins: first "turn your phone" (phones only), then the walk-out. Returns the seconds it adds. */
function duelIntroQueue() {
  if (!duelTouch()) {
    duelIntroStart();
    return INTRO_T;
  }
  DUEL.rotWait = INTRO_ROT;
  $('dRotate').hidden = false;
  return INTRO_T + INTRO_ROT;
}
/** Per frame while waiting for the phone to be turned. */
function duelRotTick(rdt) {
  if (!(DUEL.rotWait > 0)) return;
  DUEL.rotWait -= rdt;
  if (DUEL.rotWait <= 0) duelRotDone();
}
function duelRotDone() {
  DUEL.rotWait = 0;
  $('dRotate').hidden = true;
  duelIntroStart();
}
function duelIntroStart() {
  const me = DUEL.me,
    foe = DUEL.foe;
  // the marks are where duelPlace put them; each walks in from 3.4 m behind his mark
  const mk = f => ({
    x: f.x,
    z: f.z,
    face: f.face,
    bx: f.x - Math.sin(f.face) * 3.4,
    bz: f.z - Math.cos(f.face) * 3.4,
  });
  DUEL.intro = { t: 0, A: mk(me), B: mk(foe), shot: '', fx: {} };
  for (const [f, M] of [
    [me, DUEL.intro.A],
    [foe, DUEL.intro.B],
  ]) {
    f.x = M.bx;
    f.z = M.bz;
    f.mixer.stopAllAction();
    f.cur = null;
    f.play('idle', 0);
  }
  $('duel').classList.add('cine', 'intro');
  document.documentElement.classList.add('cine');
  $('dCineT').textContent = '';
  DS.crowd(0.3);
}
/** Who is who, for the name cards. */
function introCard(f) {
  const mine = f === DUEL.me,
    name = mine ? $('dNameMe').textContent : $('dNameFoe').textContent;
  let role;
  if (DUEL.watch) role = mine ? '🔵 الأزرق' : '🔴 الأحمر';
  else if (!DUEL.net) role = mine ? '🔵 أنت' : '🔴 الخصم';
  else role = (DUEL.net.host ? mine : !mine) ? '⚔️ المتحدّي' : '🛡️ المدافع';
  return [name, role];
}
function introShow(big, small, cls) {
  const T = $('dIntro');
  T.className = cls || '';
  T.querySelector('b').textContent = big;
  T.querySelector('p').textContent = small || '';
  pop(T, 'on');
}
/** One intro frame: walk each fighter in on his turn, flourish, hold; animate both by hand. */
function introStep(dt) {
  const I = DUEL.intro,
    me = DUEL.me,
    foe = DUEL.foe;
  I.t += dt;
  const T = I.t,
    shot = INTRO.find(s => T >= s[0] && T < s[1]);
  if (shot && shot[2] !== I.shot) {
    I.shot = shot[2];
    I.s0 = shot[0];
    if (I.shot === 'arena') introShow(ARENA_NAME, 'مبارزة حتى الموت · أول من يفوز بـ ' + DUEL_WIN, 'title');
    else if (I.shot === 'a' || I.shot === 'b') {
      const f = I.shot === 'a' ? me : foe,
        [name, role] = introCard(f);
      introShow(name, role, I.shot === 'a' ? 'blue' : 'red');
      DS.drum(0);
      f.play('walk', 0.2);
    } else {
      introShow('VS', '', 'vs');
      DS.drum(1);
      DS.crowd(0.34);
    }
  }
  // each walks to his mark (the second waits his turn), salutes, and settles into guard
  for (const [f, M, s0] of [
    [me, I.A, 1.5],
    [foe, I.B, 3.9],
  ]) {
    const k = clamp((T - s0) / 1.1, 0, 1);
    f.face = M.face;
    f.x = M.bx + (M.x - M.bx) * k;
    f.z = M.bz + (M.z - M.bz) * k;
    const key = f === me ? 'a' : 'b';
    if (k >= 1 && !I.fx[key]) {
      I.fx[key] = 1;
      f.play('atk1', 0.12, 0.43 / 0.8, true); // a flourish of the blade
      rPlay('swish', 0.6, 0.9, 0.08, 0.15);
      rPlay('effort', 0.9, dVox(f) * 0.9, 0.12, 0.3) || dVoice(f.pitch * 0.9, 0.5, 0.6, [820, 1250], 0.62); // a war cry
    }
    if (I.fx[key] === 1 && T > s0 + 1.1 + 0.6) {
      I.fx[key] = 2;
      f.play('idle', 0.3);
    }
  }
  for (const f of [me, foe]) {
    f.kickReset();
    f.mixer.update(dt);
    f.kickPose();
    f.root.position.set(f.x, 0, f.z);
    f.root.rotation.y = f.face;
  }
  if (T >= INTRO_T) duelIntroEnd();
}
/** The intro's camera, shot by shot. */
function introCamera(dt, cam) {
  const I = DUEL.intro,
    A = DUEL.me,
    B = DUEL.foe,
    u = I.s0 !== undefined ? (I.t - I.s0) / 2.4 : 0;
  let px, py, pz, lx, ly, lz, fov;
  if (I.shot === 'arena' || !I.shot) {
    // a crane coming down over the stands toward the ring
    const k = clamp(I.t / 1.5, 0, 1),
      e = k * k * (3 - 2 * k);
    px = Math.sin(0.6 + e * 0.5) * (16 - e * 6);
    pz = -Math.cos(0.6 + e * 0.5) * (16 - e * 6);
    py = 11 - e * 6;
    ((lx = 0), (ly = 1.2), (lz = 0));
    fov = 55;
  } else if (I.shot === 'a' || I.shot === 'b') {
    // low in front of the fighter walking out, drifting a little to the side
    const f = I.shot === 'a' ? A : B,
      fx = Math.sin(f.face),
      fz = Math.cos(f.face);
    const d = 3.4 - u * 0.6,
      side = (I.shot === 'a' ? 1 : -1) * (0.9 + u * 0.4);
    px = f.x + fx * d - fz * side;
    pz = f.z + fz * d + fx * side;
    py = 0.85 + u * 0.25;
    ((lx = f.x), (ly = 1.35), (lz = f.z));
    fov = 42;
  } else {
    // side on: the two of them face to face
    const mx = (A.x + B.x) / 2,
      mz = (A.z + B.z) / 2,
      ax = B.x - A.x,
      az = B.z - A.z,
      L = Math.hypot(ax, az) || 1;
    const r = 4.6 - u * 0.8;
    px = mx - (az / L) * r;
    pz = mz + (ax / L) * r;
    py = 1.4;
    ((lx = mx), (ly = 1.2), (lz = mz));
    fov = 48;
  }
  dT.set(px, py, pz);
  if (I.cutTo !== I.shot) {
    I.cutTo = I.shot; // each shot starts with a cut
    cam.position.copy(dT);
    dLook.set(lx, ly, lz);
  } else cam.position.lerp(dT, Math.min(1, dt * 6));
  dLook.lerp(dV.set(lx, ly, lz), Math.min(1, dt * 6));
  cam.lookAt(dLook);
  cam.fov = fov;
}
/** Back to the round: fighters on their marks, the usual "round 1 … fight!". */
function duelIntroEnd() {
  const I = DUEL.intro;
  if (!I) return;
  DUEL.intro = null;
  for (const [f, M] of [
    [DUEL.me, I.A],
    [DUEL.foe, I.B],
  ]) {
    f.x = M.x;
    f.z = M.z;
    f.face = M.face;
    f.start('idle');
    f.play('idle', 0.2);
  }
  $('duel').classList.remove('cine', 'intro');
  document.documentElement.classList.remove('cine');
  $('dIntro').className = '';
  // a skipped intro (training) shortens the countdown to the usual one
  if (DUEL.phase === 'intro') DUEL.phaseT = Math.min(DUEL.phaseT, 2.4);
  DUEL.rotWait = 0;
  $('dRotate').hidden = true;
  duelMsg('الجولة 1', ARENA_NAME);
  DS.round(1, false);
}
