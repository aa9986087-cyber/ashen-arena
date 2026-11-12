'use strict';
/* Particles, floating text, rings, screen shake, banners and toasts. */
function parts(x, y, z, n, r, g, b, spd, size, life) {
  const cap = S.set.qual ? 560 : 260;
  for (let i = 0; i < n && G.parts.length < cap; i++) {
    const a = Math.random() * TAU,
      s = rand(0.3, 1) * spd;
    G.parts.push({
      x,
      y,
      z,
      vx: Math.cos(a) * s,
      vy: rand(1, 5) * (spd / 6),
      vz: Math.sin(a) * s,
      l: 0,
      m: rand(0.5, 1) * (life || 0.6),
      s: size || 0.2,
      r,
      g,
      b,
    });
  }
}
function text(x, z, t, col, big) {
  if (G.texts.length > 60 && !big) return;
  G.texts.push({ x: x + rand(-0.4, 0.4), z, t: String(t), c: col || '#fff', l: 0, big: !!big });
}
function ring(x, z, r0, r1, dur, col) {
  G.rings.push({ x, z, r0, r1, l: 0, d: dur, c: col });
}
function shake(v) {
  if (S.set.shake) G.shake = Math.max(G.shake, v);
}
let bannerT = 0;
function banner(h, sub, dur) {
  $('banner').querySelector('h2').textContent = h;
  $('banner').querySelector('p').textContent = sub || '';
  $('banner').classList.add('on');
  bannerT = dur || 2.4;
  // long banners (new stage, boss arrival) get cinematic letterbox bars
  $('hud').classList.toggle('lb', bannerT >= 3);
}
let toastT = null;
function toast(t) {
  const e = $('toast');
  e.textContent = t;
  e.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => e.classList.remove('on'), 2800);
}
