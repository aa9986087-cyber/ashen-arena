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
/** Clamp a point to a circle centred at the origin. Mutates and returns {x,z}. */
function clampToCircle(o, radius) {
  const r = Math.hypot(o.x, o.z);
  if (r > radius) {
    o.x *= radius / r;
    o.z *= radius / r;
  }
  return o;
}
const fmtT = t => ((t / 60) | 0) + ':' + String((t % 60) | 0).padStart(2, '0');
/** ISO week id like 2026-W47 (local time): the weekly board starts again every Monday. */
function weekKey(d) {
  const t = new Date((d || new Date()).getTime());
  t.setHours(12, 0, 0, 0);
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3); // the Thursday of this ISO week
  const jan4 = new Date(t.getFullYear(), 0, 4, 12);
  return t.getFullYear() + '-W' + String(1 + Math.round((t - jan4) / 6048e5)).padStart(2, '0');
}
/** Fold a finished run into the weekly counters of `st`; a new ISO week starts them again. */
function weeklyRoll(st, g, wk) {
  wk = wk || weekKey();
  if (st.wk !== wk) {
    st.wk = wk;
    st.wb = st.wkk = st.wt = st.wft = 0;
  }
  st.wkk = (st.wkk | 0) + Math.max(0, g.kills | 0);
  st.wb = (st.wb | 0) + Math.max(0, g.bossesRun | 0);
  st.wt = Math.max(st.wt | 0, Math.round(g.t || 0));
  const bt = Math.round(g.bossT || 0);
  if (bt > 0) st.wft = st.wft ? Math.min(st.wft, bt) : bt;
  return st;
}
