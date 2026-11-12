'use strict';
/* Persistent profile (coins, unlocks, settings, stats) in localStorage. */
const SAVE_KEY = 'ashen_arena_v1';
const defSave = () => ({
  ver: 2,
  coins: 0,
  sp: 0,
  name: '',
  board: [],
  perm: {},
  chars: { knight: 1 },
  weps: { sword: 1, pistol: 1 },
  char: 'knight',
  tree: {},
  ach: {},
  /** ids of gift codes already redeemed on this device */
  gifts: {},
  /** today's missions and progress (js/game/daily.js) */
  daily: null,
  stats: { kills: 0, runs: 0, bestTime: 0, bestLvl: 0, bosses: 0, maxBoss: 0, legend: 0, abyss: 0 },
  set: { sfx: 0.7, mus: 0.5, shadow: 1, shake: 1, qual: 1, left: 1 },
});
let S = defSave();
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    const o = JSON.parse(raw),
      d = defSave();
    S = Object.assign(d, o);
    if (!(o.ver >= 2)) {
      S.perm = {};
      S.ver = 2;
      S._mig = 1;
    }
    S.stats = Object.assign(defSave().stats, o.stats || {});
    S.set = Object.assign(defSave().set, o.set || {});
  }
} catch (e) {}
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(S));
  } catch (e) {}
}
