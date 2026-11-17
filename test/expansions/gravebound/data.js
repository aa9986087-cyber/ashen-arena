'use strict';
/* Gravebound is an independent preview expansion. Existing addons and production stay untouched. */
const GRAVE_TRAINING = {
  soulvessel: { n: 'صلابة الدرع', i: '💚', r: 1, d: 'يزيد الصد الأمامي 5% لكل مستوى، من 60% إلى 75%؛ يتجدد الصد كل 1.2 ثانية' },
  soulflame: { n: 'ضربة العهد', i: '🌙', r: 1, d: 'يزيد ضرر ضربة حارس العهد الخاصة 15% لكل مستوى' },
  soulguard: { n: 'عودة الحصاد', i: '⏱️', r: 2, d: 'يقل انتظار ضربة حارس العهد الخاصة ثانية واحدة لكل مستوى' },
  soulcourt: { n: 'مدى القطع', i: '⚔️', r: 2, d: 'يزيد مدى ضربة حارس العهد الخاصة 8% لكل مستوى' },
};
const GRAVE_RELICS = {
  warden: { n: 'ختم الحارس', i: '🛡️', d: 'لكل مستوى: ضرر مستلم −4% مقابل سرعة حركة −3%', color: '#9cabc0' },
  hunter: { n: 'شارة المطارد', i: '🦴', d: 'قتل نخبة يختصر تجهيز الخاصة 2/3/4 ثوانٍ؛ مرة كل 3 ثوانٍ', color: '#d5b77b' },
  lantern: { n: 'مصباح الأرواح', i: '🏮', d: 'يفتح جمع الأرواح للأبطال الآخرين، ويزيد سعتها +3 لكل مستوى', color: '#77ddb6' },
};
const GRAVE_TRAIN_COST = [1200, 2400, 4200], GRAVE_TRAIN_SP = [3, 6, 10];
const GRAVE_RELIC_COST = [1800, 3600, 6500], GRAVE_RELIC_SP = [2, 4, 7];
CHARS.reaper = { n: 'حارس العهد', i: '🛡️', d: 'محارب ثقيل بسيف ودرع. يصد الهجمات الأمامية، وخاصته قفزة يضرب بعدها الأرض بالسيف وتحميه مؤقتًا.', hp:165,spd:6.5,wep:'scythe',cost:6500,col:0x596678,cape:0x202735,dmg:1.2,crit:0.05,sp:'reap' };
WEP.scythe = { ...WEP.sword, n: 'سيف العهد', i: '⚔️', d: 'سيف ثقيل بضربات واسعة، مع درع حارس العهد',
  dmg: 30, cd: 0.85, range: 3.5, arc: [2.7, 3.8, TAU], kb: 1.8, cost: 0, evo: ['نصل العهد المنقوش', 'سيف العهد المتوهج'] };
EVO.scythe = { up: 'fire', n: 'سيف العبور', i: '🌙', d: 'ضرر +50% وموجات إضافية عند التطور' };
for (const [id, u] of Object.entries(GRAVE_TRAINING)) UP[id] = { ...u, max: 3, off: 1 };
const gravePath = { id: 'gravebound', n: 'العهد', i: '🌙', steps: Object.keys(GRAVE_TRAINING) };
// Shop upgrades apply directly; no second purchase through run cards.
gravePath.steps.forEach((id, k) => PATH_OF[id] = { P: gravePath, k });
STAGES.splice(STAGES.findIndex(s => s.abyss), 0, {
  n: 'مقبرة العهود', boss: 'حفّار القبور', bk: 6, sky: 0x101c1c, tuft: 0x556c65,
  ground: 0x333b37, fog: 0x182421, amb: 0xa6c5bb, decor: ['deadtree', 'bones'], root: 43.65,
});
BOSS_ULTS.push({ n: 'مسيرة القبور', col: [0.55, 1.05, 0.75], f() {} });
TAUNTS[0] = 'سبعة زعماء طاحوا، وباقي الهاوية. {k} عدو… كم تقدر تصمد أكثر؟';
SPECIALS.reap = { n: 'حُكم العهد', i: '⚔️', cd: 18,
  d: 'يقفز ويضرب الأرض بالسيف، فيصيب الوحوش حول مكان هبوطه ويترك شقوقًا لعدة ثوانٍ. الضربة أقوى أمامه، ويحصل على حماية 40% لمدة 3 ثوانٍ.', f(p, power) { graveRelease(power); } };

function graveProfile() {
  const old = S.grave && typeof S.grave === 'object' ? S.grave : {};
  const rank = value => Number.isFinite(value) ? clamp(Math.floor(value), 0, 3) : 0;
  const next = { training: {}, relics: {}, active: '', demoClaimed: old.demoClaimed === true };
  for (const id in GRAVE_TRAINING) next.training[id] = rank(old.training?.[id]);
  for (const id in GRAVE_RELICS) next.relics[id] = rank(old.relics?.[id]);
  if (Object.hasOwn(GRAVE_RELICS, old.active) && next.relics[old.active]) next.active = old.active;
  S.grave = next;
  return next;
}
function graveSyncTraining() {
  graveProfile();
  for (const id in GRAVE_TRAINING) { UP[id].off = 1; UP[id].max = 3; }
}
/* Expected rank makes repeated taps on an old button harmless. Currency checks are atomic. */
function graveBuy(kind, id, expectedRank) {
  if (G && !['menu', 'over'].includes(G.state)) return false;
  const p = graveProfile(), training = kind === 'training';
  if (!['training', 'relics'].includes(kind) || !Object.hasOwn(training ? GRAVE_TRAINING : GRAVE_RELICS, id)) return false;
  const level = p[kind][id];
  if (level !== expectedRank || level >= 3) return false;
  const coins = (training ? GRAVE_TRAIN_COST : GRAVE_RELIC_COST)[level];
  const sp = (training ? GRAVE_TRAIN_SP : GRAVE_RELIC_SP)[level];
  if (!Number.isFinite(S.coins) || !Number.isFinite(S.sp) || S.coins < coins || S.sp < sp) return false;
  S.coins -= coins; S.sp -= sp; p[kind][id]++;
  if (!training && !p.active) p.active = id;
  graveSyncTraining(); save(); return true;
}
function graveEquip(id) {
  if (G && !['menu', 'over'].includes(G.state)) return false;
  const p = graveProfile();
  if (id && (!Object.hasOwn(GRAVE_RELICS, id) || !p.relics[id])) return false;
  p.active = id; save(); return true;
}
graveSyncTraining();
