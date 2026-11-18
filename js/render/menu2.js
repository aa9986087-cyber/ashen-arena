'use strict';
/* The living menu (the main menu; #menu1 in the address shows the old plain one). The 3D scene becomes a cinematic still that breathes:
   a low camera drifting in on your hero, who swings his weapon now and then; a brazier burning before him with
   rising embers and a flickering light; ground fog rolling; the Black Knight watching from the fog.
   The menu's buttons get the motion to match (css/menu2.css). */
const M2 = { on: !/menu1/.test(location.hash), t: 0, swingT: 2, active: false, light: null, fog: 0 };
if (M2.on) document.body.classList.add('m2');
addEventListener('hashchange', () => {
  M2.on = !/menu1/.test(location.hash);
  document.body.classList.toggle('m2', M2.on);
});
function hideLivingMenu() {
  if (!M2.active) return;
  M2.active = false;
  ACTOR_MODELS.releaseMenuKnight();
  M2.light.intensity = M2.rim.intensity = 0;
}
function menu2Frame(dt) {
  if (!M2.on || G.state !== 'menu') {
    hideLivingMenu();
    return false;
  }
  if (!M2.active) {
    M2.active = true;
    loadBossActor(2);
  }
  M2.t += dt;
  const portrait = W < H;
  const compact = portrait && H < 740;
  const shortDock = compact && !$('mResume').hidden;
  M2.heroScale = shortDock ? 0.83 : 1;
  if (!M2.light) {
    M2.light = new THREE.PointLight(0xff8a3a, 0, 16, 1.4);
    scene.add(M2.light);
    M2.rim = new THREE.PointLight(0xff684d, 0, 23, 1.3);
    M2.rim.position.set(-5.4, 4.4, -11);
    scene.add(M2.rim);
  }
  const knight = ACTOR_MODELS.presentMenuKnight(dt, M2.t, shortDock ? 0.16 : compact ? 0.2 : 0.62);
  if (knight) {
    knight.position.set(portrait ? -2.5 : -4.5, 0, -16);
    knight.rotation.y = 0.34 + Math.sin(M2.t * 0.27) * 0.08;
    knight.scale.setScalar(shortDock ? 1.08 : compact ? 1.25 : 1.4);
    M2.rim.intensity = 2.8 + Math.sin(M2.t * 1.2) * 0.35;
  }
  // the brazier at the hero's side: its light flickers
  const fx = -2.1,
    fz = 1.2;
  if (M2.light) {
    M2.light.position.set(fx, 1.6, fz);
    M2.light.intensity = 1.1 + Math.sin(M2.t * 13) * 0.2 + Math.sin(M2.t * 7.3) * 0.15 + Math.random() * 0.1;
  }
  if (Math.random() < dt * 22) vfxFlame(fx, fz, 1.4, 1);
  // embers rising into the dark
  if (Math.random() < dt * 9)
    vfxP({
      x: fx + rand(-0.3, 0.3),
      y: 1.2,
      z: fz + rand(-0.3, 0.3),
      vx: rand(-0.4, 0.4),
      vy: rand(1.2, 2.4),
      vz: rand(-0.3, 0.3),
      life: rand(1.6, 2.8),
      s: rand(0.08, 0.16),
      s1: 0.02,
      r: 2,
      g: rand(0.7, 1.1),
      b: 0.25,
      drag: 0.4,
    });
  // fog rolling low across the ground
  if ((M2.fog -= dt) <= 0) {
    M2.fog = 0.35;
    vfxP({
      t: VT.smoke,
      smoke: 1,
      x: rand(-9, 9),
      y: 0.5,
      z: rand(-12, 3),
      vx: rand(0.2, 0.6),
      life: 6,
      s: 5,
      s1: 7,
      r: 0.55,
      g: 0.58,
      b: 0.66,
      a: 0.28,
      spin: rand(-0.1, 0.1),
    });
  }
  // the hero swings his weapon now and then
  if ((M2.swingT -= dt) <= 0) {
    M2.swingT = rand(3.5, 6);
    G.p.swing = 1;
  }
  if (G.p.swing > 0) G.p.swing = Math.max(0, G.p.swing - dt * 2.2);
  // A gentle drift keeps both actors in the space between the title and the controls.
  const push = Math.min(1, M2.t / 6),
    distance = (portrait ? 18 : 16) - push * 0.5,
    a = -0.06 + Math.sin(M2.t * 0.12) * 0.027;
  camera.position.set(
    Math.sin(a) * distance,
    (compact ? 1.8 : 2.2) + Math.sin(M2.t * 0.6) * 0.04,
    Math.cos(a) * distance
  );
  camera.lookAt(0, shortDock ? 0.49 : compact ? 1.68 : 2.22, -4);
  return true;
}
