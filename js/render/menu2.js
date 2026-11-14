'use strict';
/* The living menu (preview: open the game with #menu2). The 3D scene becomes a cinematic still that breathes:
   a low camera drifting in on your hero, who swings his weapon now and then; a brazier burning before him with
   rising embers and a flickering light; ground fog rolling; a giant's silhouette looming in the fog behind.
   The menu's buttons get the motion to match (css/menu2.css). Nothing changes without #menu2. */
const M2 = { on: /menu2/.test(location.hash), t: 0, swingT: 2, boss: null, light: null, fog: 0 };
if (M2.on) document.body.classList.add('m2');
addEventListener('hashchange', () => {
  M2.on = /menu2/.test(location.hash);
  document.body.classList.toggle('m2', M2.on);
});
function menu2Frame(dt, now) {
  const inMenu = G.state === 'menu';
  if (M2.boss) M2.boss.visible = M2.on && inMenu;
  if (M2.light && !(M2.on && inMenu)) M2.light.intensity = M2.rim.intensity = 0;
  if (!M2.on || !inMenu) return false;
  M2.t += dt;
  // the giant in the fog behind the hero (made once): one of the bosses, dark against the mist
  // (the horned demon's real model, animated: its walk played very slowly, so it sways)
  const BA = typeof ANIM !== 'undefined' && ANIM.boss2 && (ANIM.boss2.walk || ANIM.boss2.attack);
  if (!M2.boss && BA) {
    M2.boss = new THREE.Mesh(BA[0], new THREE.MeshLambertMaterial({ color: 0x2a1e1c, vertexColors: true }));
    M2.boss.position.set(2.5, 0, -21);
    M2.boss.scale.setScalar(5.4);
    scene.add(M2.boss);
    M2.light = new THREE.PointLight(0xff8a3a, 0, 16, 1.4);
    scene.add(M2.light);
    // a cold light behind the giant draws its outline against the fog
    M2.rim = new THREE.PointLight(0x9ab4ff, 0, 40, 1.2);
    scene.add(M2.rim);
  }
  const b = M2.boss;
  if (b) {
    b.geometry = BA[Math.floor(M2.t * 2.2) % BA.length];
    b.rotation.y = -0.25 + Math.sin(M2.t * 0.15) * 0.08;
    M2.rim.position.set(2.5, 10, -30);
    M2.rim.intensity = 2.4;
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
  G.p.face = -0.35 + Math.sin(M2.t * 0.2) * 0.12;
  // a low camera drifting in, swaying a little like a hand-held shot
  const pr = W < H,
    push = Math.min(1, M2.t / 6),
    R = (pr ? 16 : 13) - push * 1.5,
    a = -0.3 + Math.sin(M2.t * 0.07) * 0.2;
  camera.position.set(
    Math.sin(a) * R + Math.sin(M2.t * 0.9) * 0.05,
    2.2 + Math.sin(M2.t * 0.6) * 0.06,
    Math.cos(a) * R
  );
  // the hero in the middle of the screen (above the buttons), the giant towering over him in the sky
  camera.lookAt(0, pr ? 1.7 : 2.2, -4);
  return true;
}
