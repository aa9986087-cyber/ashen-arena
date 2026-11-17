'use strict';
/* The five boards share the same player rows; each one sorts them by a different feat. Pure helpers, no DOM. */
const BOARD_METRICS = [
  {
    id: 'week',
    icon: '🏆',
    tab: 'الأسبوع',
    title: 'أفضل لاعب بالأسبوع',
    lead: 'زعماء هذا الأسبوع، ثم القتلات، ثم أسرع فوز. يتجدد كل اثنين.',
    empty: 'ما فيه جولات هذا الأسبوع بعد. العب جولة واسمك يطلع هنا.',
  },
  {
    id: 'endure',
    icon: '🛡️',
    tab: 'الصمود',
    title: 'أفضل صمود',
    lead: 'أطول مدة بقاء حياً في جولة واحدة، بأي مرحلة.',
    empty: 'ما فيه أرقام صمود بعد. صمد أطول وتحلّ الأول.',
  },
  {
    id: 'bosses',
    icon: '👑',
    tab: 'الزعماء',
    title: 'أكثر فوز على الزعماء',
    lead: 'مجموع الزعماء الذين أسقطهم اللاعب في كل جولاته.',
    empty: 'ما أسقط أحد زعيمًا بعد. كن أول من يذبح واحدًا.',
  },
  {
    id: 'fast',
    icon: '⚡',
    tab: 'الأسرع',
    title: 'أسرع فوز على زعيم',
    lead: 'أقل زمن للوصول إلى أول زعيم وإسقاطه في جولة واحدة.',
    empty: 'ما سُجّل فوز سريع بعد. أول زعيم تسقطه يفتح الترتيب.',
  },
  {
    id: 'kills',
    icon: '💀',
    tab: 'القتلات',
    title: 'أكثر القتلات',
    lead: 'أكبر عدد أعداء أسقطهم اللاعب في كل جولاته.',
    empty: 'ما فيه قتلات مسجلة بعد.',
  },
];
const boardMetric = id => BOARD_METRICS.find(m => m.id === id) || BOARD_METRICS[0];

/** Rank rows for one board. Returns [{...row, text, sub, num}] best first. */
function boardRank(rows, id, now) {
  const wk = weekKey(now || new Date()),
    out = [];
  for (const r of rows || []) {
    const b = r.b | 0,
      k = r.k | 0,
      t = r.t | 0,
      ft = r.ft | 0,
      wb = r.wb | 0,
      wkk = r.wkk | 0,
      wft = r.wft | 0;
    let keep = false,
      text = '',
      sub = '',
      num = 0,
      cmp;
    switch (id) {
      case 'week':
        keep = r.wk === wk && (wb > 0 || wkk > 0);
        text = wb > 0 ? '👑 ' + wb + ' زعيم' : '💀 ' + wkk + ' قتلة';
        sub = '💀 ' + wkk + ' · ⏱ ' + fmtT(r.wt | 0);
        num = wb * 100000 + Math.min(99999, wkk);
        cmp = (a, c) => (c.wb | 0) - (a.wb | 0) || (c.wkk | 0) - (a.wkk | 0) || (a.wft | 0 || 1e9) - (c.wft | 0 || 1e9);
        break;
      case 'endure':
        keep = t > 0;
        text = '⏱ ' + fmtT(t);
        sub = '👑 ' + b + ' · 💀 ' + k;
        num = t;
        cmp = (a, c) => (c.t | 0) - (a.t | 0) || (c.b | 0) - (a.b | 0) || (c.k | 0) - (a.k | 0);
        break;
      case 'bosses':
        keep = b > 0;
        text = '👑 ' + b + ' زعيم';
        sub = '💀 ' + k + ' · ⭐ ' + (r.lvl | 0);
        num = b;
        cmp = (a, c) => (c.b | 0) - (a.b | 0) || (c.k | 0) - (a.k | 0) || (a.t | 0) - (c.t | 0);
        break;
      case 'fast':
        keep = ft > 0;
        text = '⚡ ' + fmtT(ft);
        sub = '👑 ' + b + ' إجمالاً';
        num = ft;
        cmp = (a, c) => (a.ft | 0) - (c.ft | 0) || (c.b | 0) - (a.b | 0);
        break;
      default:
        keep = k > 0;
        text = '💀 ' + k + ' قتلة';
        sub = '👑 ' + b + ' · ⏱ ' + fmtT(t);
        num = k;
        cmp = (a, c) => (c.k | 0) - (a.k | 0) || (c.b | 0) - (a.b | 0) || (c.t | 0) - (a.t | 0);
    }
    if (keep) out.push({ ...r, text, sub, num, cmp });
  }
  out.sort((a, b) => a.cmp(a, b));
  out.forEach(x => delete x.cmp);
  return out;
}
