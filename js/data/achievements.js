'use strict';
/* Achievements: t(stats, save) returns true when unlocked; c = coin reward, sp = skill points. */
const ACH = [
  { id: 'k100', n: 'أول الدم', d: 'اقضِ على 100 عدو', t: s => s.kills >= 100, c: 50, sp: 0 },
  { id: 'k1000', n: 'حاصد', d: 'اقضِ على 1000 عدو', t: s => s.kills >= 1000, c: 200, sp: 1 },
  { id: 'k5000', n: 'عاصفة', d: 'اقضِ على 5000 عدو', t: s => s.kills >= 5000, c: 500, sp: 2 },
  { id: 'l10', n: 'متمرّس', d: 'بلغ المستوى 10 في جولة', t: s => s.bestLvl >= 10, c: 80, sp: 0 },
  { id: 'l20', n: 'خارق', d: 'بلغ المستوى 20 في جولة', t: s => s.bestLvl >= 20, c: 200, sp: 1 },
  { id: 'b1', n: 'قاهر الغابة', d: 'اهزم حارس الغابة', t: s => s.bosses >= 1, c: 100, sp: 0 },
  { id: 'b4', n: 'سيد الساحات', d: 'اهزم الزعماء الأربعة في جولة واحدة', t: s => s.maxBoss >= 4, c: 500, sp: 2 },
  { id: 'b6', n: 'فاتح العوالم', d: 'اهزم الزعماء الستة في جولة واحدة', t: s => s.maxBoss >= 6, c: 900, sp: 3 },
  { id: 'aby', n: 'ابن الهاوية', d: 'اهزم زعيماً داخل الهاوية', t: s => s.abyss >= 1, c: 1200, sp: 3 },
  { id: 't10', n: 'صامد', d: 'ابقَ حياً 10 دقائق', t: s => s.bestTime >= 600, c: 150, sp: 1 },
  { id: 'leg', n: 'لمسة الأسطورة', d: 'احصل على تطوير أسطوري', t: s => s.legend >= 1, c: 100, sp: 0 },
  {
    id: 'all',
    n: 'قائد الأبطال',
    d: 'افتح كل الأبطال',
    t: (s, S) => Object.keys(CHARS).every(k => S.chars[k]),
    c: 300,
    sp: 1,
  },
];
