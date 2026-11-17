'use strict';
/* Enemy base stats and arena radius. */
const EN = {
  grunt: { hp: 20, spd: 3.4, dmg: 8, r: 0.55, xp: 1, sc: 1 },
  fast: { hp: 11, spd: 6.2, dmg: 6, r: 0.45, xp: 1, sc: 0.9 },
  archer: { hp: 16, spd: 3, dmg: 9, r: 0.5, xp: 2, sc: 1 },
  shield: { hp: 46, spd: 2.5, dmg: 12, r: 0.7, xp: 3, sc: 1.1 },
  brute: { hp: 240, spd: 2.5, dmg: 22, r: 1.3, xp: 10, sc: 1.5 },
  wolf: { hp: 15, spd: 6.6, dmg: 7, r: 0.5, xp: 2, sc: 1 },
  bomber: { hp: 14, spd: 5.2, dmg: 18, r: 0.5, xp: 2, sc: 0.95 },
  mage: { hp: 22, spd: 2.7, dmg: 14, r: 0.5, xp: 4, sc: 1 },
  shaman: { hp: 30, spd: 2.8, dmg: 6, r: 0.5, xp: 4, sc: 1 },
  runner: { hp: 18, spd: 9, dmg: 5, r: 0.45, xp: 3, sc: 1.05 }, // the snake: small and quick, a light bite
  golem: { hp: 620, spd: 1.9, dmg: 34, r: 1.7, xp: 25, sc: 1.9 },
};
let ARENA = 58; // the ring's radius (co-op plays on a bigger one, see coopArena)
/** Display names used by the lab. */
const MON_N = {
  grunt: 'جندي',
  fast: 'سريع',
  archer: 'رامي',
  shield: 'درع',
  brute: 'ضخم',
  wolf: 'ذئب',
  bomber: 'انتحاري',
  mage: 'ساحر',
  shaman: 'شامان',
  runner: 'الراكض',
  golem: 'غولم',
};
/** Elite traits: every elite rolls one. tint = colour multiplier in the arena; see hit(), kill() and updEnemies(). */
/* What makes a strong enemy stand out: a little tougher, or hitting a little harder. Nothing that makes it
   impossible to kill (the old ones: regenerating, shields, splitting, speeding the others up). */
const AFFIX = {
  tough: { n: 'صلب', i: '🛡️', d: 'صحته أكثر 40%', tint: [0.8, 1.1, 1.8], hp: 1.4 },
  fierce: { n: 'شرس', i: '💢', d: 'ضربه أقوى 25%', tint: [1.8, 0.7, 0.5], dmg: 1.25 },
};
