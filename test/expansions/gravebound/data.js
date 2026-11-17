'use strict';
/* Gravebound is an independent preview expansion. Existing addons and production stay untouched. */
const GRAVE_TRAINING = {
  soulvessel: { n: 'وعاء الأرواح', i: '🏺', r: 1, d: 'سعة الأرواح +4 لكل مستوى؛ تجمعها من القتل وتصرفها بالقدرة الخاصة' },
  soulflame: { n: 'لهيب الأرواح', i: '🔥', r: 1, d: 'القدرة الخاصة تترك احتراقًا طيفيًا؛ كل مستوى يزيد ضرره ومدته' },
  soulguard: { n: 'عهد الحماية', i: '🛡️', r: 2, d: 'صرف الأرواح يمنح حاجزًا مؤقتًا؛ يتجدد دون تراكم، ويختفي بعد 8 ثوانٍ' },
  soulcourt: { n: 'موكب الموتى', i: '👻', r: 2, d: 'القدرة تستدعي مرافقين طيفيين؛ حد أقصى 3، وكل مستوى يطيل بقاءهم' },
};
const GRAVE_RELICS = {
  warden: { n: 'ختم الحارس', i: '🛡️', d: 'لكل مستوى: ضرر مستلم −4% مقابل سرعة حركة −3%', color: '#9cabc0' },
  hunter: { n: 'شارة المطارد', i: '🦴', d: 'قتل نخبة يختصر تجهيز الخاصة 2/3/4 ثوانٍ؛ مرة كل 3 ثوانٍ', color: '#d5b77b' },
  lantern: { n: 'مصباح الأرواح', i: '🏮', d: 'يفتح جمع الأرواح لأي بطل، ويزيد سعتها +3 لكل مستوى', color: '#77ddb6' },
};
const GRAVE_TRAIN_COST = [1200, 2400, 4200], GRAVE_TRAIN_SP = [3, 6, 10];
const GRAVE_RELIC_COST = [1800, 3600, 6500], GRAVE_RELIC_SP = [2, 4, 7];
CHARS.reaper = { n: 'حاصد الأرواح', i: '💀', d: 'كل ثالث ضربة منجل ناجحة تقتلع الأرواح وتسحب الوحوش لمسافة آمنة. يصرف الأرواح بالحصاد والموكب الطيفي.',
  hp: 110, spd: 7.3, wep: 'scythe', cost: 6500, col: 0x263b39, cape: 0x152324, dmg: 1.02, crit: 0.05, sp: 'reap' };
WEP.scythe = { ...WEP.sword, n: 'منجل العهود', i: '⚰️', d: 'قوس قطع واسع بإيقاع ثقيل، مميز لحاصد الأرواح',
  dmg: 30, cd: 0.85, range: 3.5, arc: [2.7, 3.8, TAU], kb: 1.8, cost: 0, evo: ['نصل العهد المنقوش', 'منجل الأرواح المتوهج'] };
EVO.scythe = { up: 'soulvessel', n: 'منجل العبور', i: '🌙', d: 'ضرر +50%، وموجة المنجل أوسع عند التطور' };
for (const [id, u] of Object.entries(GRAVE_TRAINING)) UP[id] = { ...u, max: 3, off: 1 };
const gravePath = { id: 'gravebound', n: 'العهد', i: '🌙', steps: Object.keys(GRAVE_TRAINING) };
PATHS.push(gravePath);
gravePath.steps.forEach((id, k) => PATH_OF[id] = { P: gravePath, k });
STAGES.splice(STAGES.findIndex(s => s.abyss), 0, {
  n: 'مقبرة العهود', boss: 'حفّار القبور', bk: 6, sky: 0x101c1c, tuft: 0x556c65,
  ground: 0x333b37, fog: 0x182421, amb: 0xa6c5bb, decor: ['deadtree', 'bones'], root: 43.65,
});
BOSS_ULTS.push({ n: 'مسيرة القبور', col: [0.55, 1.05, 0.75], f() {} });
TAUNTS[0] = 'سبعة زعماء طاحوا، وباقي الهاوية. {k} عدو… كم تقدر تصمد أكثر؟';
SPECIALS.reap = { n: 'حصاد العهود', i: '🌙', cd: 17,
  d: 'قوس حصاد حولك يقوى بالأرواح المخزنة، ويستدعي روحًا تقاتل بجانبك 8 ثوانٍ.', f(p, power) { graveRelease(power); } };

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
  const p = graveProfile();
  for (const id in GRAVE_TRAINING) { UP[id].off = !p.training[id]; UP[id].max = p.training[id] || 1; }
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
