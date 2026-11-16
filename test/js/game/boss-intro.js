'use strict';
/* Boss entrance: the camera cuts to the boss while it rises out of the ground, then glides back to the player.
   The whole fight is frozen for that moment (update() returns early), so nothing can hurt the player and every
   enemy, shot and timer stays exactly where it was. Co-op and duels keep the instant spawn. */
const CINE = { on: false, pending: false, freeze: false, t: 0, dur: 3.1, tail: 0.7, boss: null, landed: false };
/** Only a solo run gets the cinematic; co-op clients mirror the host and duels keep their own start. */
function bossIntroEligible() {
  return G.state === 'play' && !COOP.on && !DUEL.on;
}
function bossIntroStart(e) {
  if (G.state === 'lab' && typeof closeLab === 'function') closeLab(); // the lab spawns in a live run
  if (!bossIntroEligible() || CINE.on) return false;
  Object.assign(CINE, { on: true, freeze: true, t: 0, boss: e, landed: false });
  e.y = -10;
  e.face = Math.atan2(G.p.x - e.x, G.p.z - e.z); // it stares at the player as it rises
  const el = $('bossCine');
  if (el) {
    $('bossCineName').textContent = G.bossName || '';
    el.hidden = false;
    el.classList.add('on');
  }
  $('bossbar').hidden = true; // the bar waits until the entrance is over
  document.body.classList.add('cineOn');
  AU.play('boss');
  shake(0.6);
  return true;
}
function bossIntroUpdate(dt) {
  const e = CINE.boss;
  if (!e || e.dead) return bossIntroEnd();
  CINE.t += dt;
  e.t += dt; // keep the boss animation alive while the rest of the world is frozen
  if (CINE.t < 1.4) {
    const k = Math.min(1, CINE.t / 1.4);
    e.y = -10 * (1 - k) ** 3;
    if (!CINE.landed && CINE.t >= 0.9) {
      CINE.landed = true;
      ring(e.x, e.z, 0.4, 11, 0.9, [1, 0.55, 0.18]);
      vfxSmoke(e.x, 0.2, e.z, 16, [0.18, 0.12, 0.08, 0.5], 8, 2.2, 1, 1.4);
      AU.play('boom');
      shake(1);
    }
  } else e.y = 0;
  if (CINE.t >= CINE.dur) bossIntroEnd(); // the player is back in control, the camera still glides home
}
/** Called by render() while the cinematic runs: boss close-up in, player view out. */
function bossIntroCamera() {
  const e = CINE.boss,
    p = G.p,
    portrait = W < H;
  const inT = Math.min(1, CINE.t / 0.7),
    outT = CINE.t > CINE.dur ? Math.min(1, (CINE.t - CINE.dur) / CINE.tail) : 0,
    w = CINE.freeze ? inT : 1 - outT;
  const a = Math.atan2(p.z - e.z, p.x - e.x),
    bx = e.x + Math.cos(a) * 22,
    bz = e.z + Math.sin(a) * 22,
    px = p.x,
    py = portrait ? 31 : 24,
    pz = p.z + (portrait ? 17 : 15);
  const x = px + (bx - px) * w,
    y = py + (20 - py) * w,
    z = pz + (bz - pz) * w;
  camera.position.set(x, y, z);
  camera.lookAt(p.x + (e.x - p.x) * w, (e.y || 0) * 0.5 * w + 5 * w, p.z - 1 + (e.z - (p.z - 1)) * w);
  if (CINE.t > CINE.dur + CINE.tail) CINE.on = false;
}
function bossIntroEnd() {
  const el = $('bossCine');
  if (el) {
    el.classList.remove('on');
    setTimeout(() => {
      if (!CINE.on) el.hidden = true;
    }, 600);
  }
  document.body.classList.remove('cineOn');
  if (!CINE.freeze) return; // freeze already lifted: this is the tail
  CINE.freeze = false;
  const e = CINE.boss;
  if (e) e.y = 0;
  G.p.inv = Math.max(G.p.inv, 1.2); // a moment of grace right after the entrance
  $('bossbar').hidden = false;
  $('bossbar').querySelector('span').textContent = G.bossName || '';
  banner(G.bossName, 'الزعيم وصل. اقرأ هجماته وراوغ الدوائر الحمراء.', 3);
  shake(0.5);
}
/** A new run or a boss death while the camera is still on it: put everything back. */
function bossIntroClear() {
  CINE.pending = false;
  if (!CINE.on) return;
  CINE.on = false;
  CINE.freeze = false;
  CINE.boss = null;
  document.body.classList.remove('cineOn');
  const el = $('bossCine');
  if (el) {
    el.classList.remove('on');
    el.hidden = true;
  }
}
