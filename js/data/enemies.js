'use strict';
/* Enemy base stats and arena radius. */
const EN = {
  grunt: { hp: 20, spd: 3.4, dmg: 8, r: 0.55, xp: 1, sc: 1 },
  fast: { hp: 11, spd: 6.2, dmg: 6, r: 0.45, xp: 1, sc: 0.9 },
  archer: { hp: 16, spd: 3, dmg: 9, r: 0.5, xp: 2, sc: 1 },
  shield: { hp: 46, spd: 2.5, dmg: 12, r: 0.7, xp: 3, sc: 1.1 },
  brute: { hp: 240, spd: 2.5, dmg: 22, r: 1.3, xp: 10, sc: 1.5 },
  wolf: { hp: 15, spd: 6.6, dmg: 9, r: 0.5, xp: 2, sc: 1 },
  bomber: { hp: 14, spd: 5.2, dmg: 26, r: 0.5, xp: 2, sc: 0.95 },
  mage: { hp: 22, spd: 2.7, dmg: 14, r: 0.5, xp: 4, sc: 1 },
  shaman: { hp: 30, spd: 2.8, dmg: 6, r: 0.5, xp: 4, sc: 1 },
  runner: { hp: 18, spd: 10, dmg: 11, r: 0.45, xp: 3, sc: 1.05 },
  golem: { hp: 620, spd: 1.9, dmg: 34, r: 1.7, xp: 25, sc: 1.9 },
};
const ARENA = 58;
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
const AFFIX = {
  split: { n: 'ينقسم', i: '✳️', d: 'لما يموت يطلع منه 3 صغار', tint: [1.7, 1.6, 0.5] },
  regen: { n: 'يتجدد', i: '💚', d: 'يرجع له 4% من صحته كل ثانية', tint: [0.6, 1.8, 0.7] },
  haste: { n: 'مُسرِّع', i: '⚡', d: 'الأعداء حوله أسرع 35%', tint: [1.9, 1.3, 0.3] },
  ward: { n: 'درع', i: '🛡️', d: 'درع يمتص الضرر ويتجدد إذا ما انضرب', tint: [0.7, 1.1, 2] },
};
