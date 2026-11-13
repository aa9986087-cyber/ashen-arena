'use strict';
/* Tiny DOM helpers shared by every UI module. */
const $ = id => document.getElementById(id);
/** Create an element with an optional class and text content. */
function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}
/** Restart a one-shot CSS animation class on an element (default: 'pop'). */
const pop = (e, c) => {
  if (!e) return;
  c = c || 'pop';
  e.classList.remove(c);
  void e.offsetWidth;
  e.classList.add(c);
};
/** Row of level pips (filled up to l, out of max). */
function pips(l, max) {
  const d = el('div', 'pips');
  for (let i = 0; i < max; i++) d.appendChild(el('i', i < l ? 'on' : ''));
  return d;
}

/* iPhone Safari ignores user-scalable=no: a quick second tap in the same spot still zooms in, and two fingers pinch.
   Swallow the second of two quick taps close together (not in text fields), and the pinch gestures. */
(() => {
  let lastT = 0,
    lastX = 0,
    lastY = 0;
  document.addEventListener(
    'touchend',
    e => {
      const t = e.changedTouches[0],
        now = performance.now();
      if (!t) return;
      const near = Math.hypot(t.clientX - lastX, t.clientY - lastY) < 60;
      if (now - lastT < 350 && near && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) e.preventDefault();
      lastT = now;
      lastX = t.clientX;
      lastY = t.clientY;
    },
    { passive: false }
  );
  for (const g of ['gesturestart', 'gesturechange', 'gestureend'])
    document.addEventListener(g, e => e.preventDefault(), { passive: false });
})();
