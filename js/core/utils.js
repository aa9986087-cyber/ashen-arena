'use strict';
/* Pure math / formatting helpers (no DOM, no game state). */
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a),
  pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Wrap an angle (radians) into the range [-PI, PI]. */
const wrapAng = d => {
  d %= TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
/** Absolute angular distance between two angles. */
const angDiff = (a, b) => Math.abs(wrapAng(a - b));
/** Rotate the 2D vector (x,z) by angle a. Returns [x,z]. */
const rotate = (x, z, a) => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [x * c - z * s, x * s + z * c];
};
const fmtT = t => ((t / 60) | 0) + ':' + String((t % 60) | 0).padStart(2, '0');
