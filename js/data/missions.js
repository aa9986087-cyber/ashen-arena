'use strict';
/* Daily missions. k = what is counted; best:1 = best single run (otherwise it adds up over the day).
   c = coin reward, sp = skill points. Three are picked per day (see js/game/daily.js). */
const MISSIONS = [
  { id: 'kill300', n: 'اقتل 300 عدو', k: 'kill', goal: 300, c: 150 },
  { id: 'kill900', n: 'اقتل 900 عدو', k: 'kill', goal: 900, c: 320 },
  { id: 'elite8', n: 'اقتل 8 أعداء نخبة', k: 'elite', goal: 8, c: 160 },
  { id: 'boss1', n: 'اهزم زعيماً', k: 'boss', goal: 1, c: 200 },
  { id: 'boss3', n: 'اهزم 3 زعماء', k: 'boss', goal: 3, c: 380, sp: 1 },
  { id: 'spec10', n: 'استخدم الضربة الخاصة 10 مرات', k: 'special', goal: 10, c: 130 },
  { id: 'runs3', n: 'العب 3 جولات', k: 'run', goal: 3, c: 100 },
  { id: 'time5', n: 'اصمد 5 دقائق في جولة واحدة', k: 'time', goal: 300, c: 160, best: 1 },
  { id: 'time10', n: 'اصمد 10 دقائق في جولة واحدة', k: 'time', goal: 600, c: 300, best: 1 },
  { id: 'lvl12', n: 'وصّل المستوى 12 في جولة', k: 'lvl', goal: 12, c: 180, best: 1 },
  { id: 'coins150', n: 'اجمع 150 عملة في جولة', k: 'coins', goal: 150, c: 150, best: 1 },
];
