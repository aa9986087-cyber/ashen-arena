'use strict';
/* The living menu (the main menu; #menu1 in the address shows the old plain one). The 3D scene becomes a cinematic still that breathes:
   a low camera drifting in on your hero, who swings his weapon now and then; a brazier burning before him with
   rising embers and a flickering light; ground fog rolling; a giant's silhouette looming in the fog behind.
   The menu's buttons get the motion to match (css/menu2.css). */
const M2 = { on: !/menu1/.test(location.hash), t: 0, swingT: 2, boss: null, light: null, fog: 0 };
if (M2.on) document.body.classList.add('m2');
addEventListener('hashchange', () => {
  M2.on = !/menu1/.test(location.hash);
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
    M2.boss = new THREE.Mesh(BA[0], new THREE.MeshBasicMaterial({ color: 0x060405, fog: false }));
    M2.boss.position.set(2.5, 0, -21);
    M2.boss.scale.setScalar(3.3);
    scene.add(M2.boss);
    M2.light = new THREE.PointLight(0xff8a3a, 0, 16, 1.4);
    scene.add(M2.light);
    // a cold light behind the giant draws its outline against the fog
    M2.rim = new THREE.PointLight(0x9ab4ff, 0, 40, 1.2);
    scene.add(M2.rim);
  }
  const b = M2.boss;
  if (b) {
    // smooth, continuous life instead of stepping through a few frames: it breathes, sways and leans in
    const lean = Math.max(0, Math.sin(M2.t * 0.35)) ** 3; // now and then it bends toward you
    b.rotation.set(lean * 0.18, -0.25 + Math.sin(M2.t * 0.15) * 0.08, Math.sin(M2.t * 0.5) * 0.03);
    b.scale.set(3.3, 3.3 * (1 + Math.sin(M2.t * 1.4) * 0.015), 3.3);
    b.position.y = Math.sin(M2.t * 1.4) * 0.08;
    menu2Grin(b);
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
/** The giant's eyes: two embers burning in its dark shape; now and then they flare and its head shakes.
    Built once on the giant, sized from the model's own bounds. */
function menu2Grin(b) {
  if (!M2.face) {
    const g = b.geometry;
    g.computeBoundingBox();
    const bb = g.boundingBox,
      H = bb.max.y - bb.min.y,
      cx = (bb.min.x + bb.max.x) / 2,
      add = (c, o) =>
        new THREE.MeshBasicMaterial({
          color: c,
          transparent: true,
          opacity: o,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      F = new THREE.Group();
    // the model's own eyes: its whites (the pale grey) in the upper half, split into the two eyes
    const P = g.attributes.position,
      C = g.attributes.color,
      white = [];
    for (let i = 0; i < P.count; i++)
      if (
        P.getY(i) > bb.min.y + H * 0.55 &&
        C &&
        Math.abs(C.getX(i) - 0.56) < 0.02 &&
        Math.abs(C.getZ(i) - 0.63) < 0.03
      )
        white.push([P.getX(i), P.getY(i), P.getZ(i)]);
    let spots = [];
    if (white.length > 10) {
      const xs = white.map(q => q[0]).sort((m, n) => m - n),
        mid = (xs[0] + xs[xs.length - 1]) / 2,
        cen = a =>
          a.reduce((t, q) => [t[0] + q[0] / a.length, t[1] + q[1] / a.length, Math.max(t[2], q[2])], [0, 0, -9]);
      spots = [cen(white.filter(q => q[0] < mid)), cen(white.filter(q => q[0] >= mid))];
    } else spots = [-1, 1].map(sd => [cx + sd * H * 0.04, bb.min.y + H * 0.8, bb.max.z]);
    const eyes = [];
    for (const [x, y, z] of spots) {
      const core = new THREE.Mesh(new THREE.SphereGeometry(H * 0.02, 10, 8), add(0xfff2c0, 1)),
        halo = new THREE.Mesh(new THREE.SphereGeometry(H * 0.045, 10, 8), add(0xff2a10, 0.35));
      core.position.set(x, y, z + H * 0.01);
      halo.position.copy(core.position);
      F.add(core, halo);
      eyes.push(halo);
    }
    b.add(F);
    M2.face = { F, eyes, laugh: 3 };
  }
  // the laugh: every few seconds, for about a second and a half
  const fc = M2.face;
  fc.laugh -= 1 / 60;
  let k = 0;
  if (fc.laugh < 0) {
    k = Math.sin(Math.min(1, -fc.laugh / 1.5) * Math.PI);
    if (fc.laugh < -1.5) fc.laugh = rand(4, 7);
  }
  fc.F.rotation.z = Math.sin(M2.t * 24) * 0.04 * k; // the head shakes with it
  for (const e of fc.eyes) {
    e.material.opacity = 0.3 + 0.15 * Math.sin(M2.t * 3) + 0.4 * k;
    e.scale.setScalar(1 + k * 0.6);
  }
}
