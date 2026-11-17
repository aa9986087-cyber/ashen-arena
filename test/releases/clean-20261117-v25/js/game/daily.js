'use strict';
/* Daily missions: three per local day, same for every player on that day. Progress lives in S.daily. */
/** Today's date as YYYY-MM-DD in the player's own time zone. */
const todayKey = () => new Date().toLocaleDateString('en-CA');
/** Today's state, rolled over (new missions, empty progress) when the day changes. */
function daily() {
  const day = todayKey();
  if (!S.daily || S.daily.day !== day) {
    // deterministic pick from the date, at most one mission per counted thing
    let h = parseInt(sig(day + '#daily'), 36) || 1;
    const ids = [],
      kinds = new Set(),
      pool = MISSIONS.slice();
    while (ids.length < 3 && pool.length) {
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
      const m = pool.splice(h % pool.length, 1)[0];
      if (kinds.has(m.k)) continue;
      kinds.add(m.k);
      ids.push(m.id);
    }
    S.daily = { day, ids, prog: {}, done: {} };
  }
  return S.daily;
}
const missionById = id => MISSIONS.find(m => m.id === id);
/** Record progress for every one of today's missions that counts `kind`. best = keep the highest single value. */
function dailyTrack(kind, v, best) {
  if (!G || G.lab) return;
  const D = daily();
  for (const id of D.ids) {
    const m = missionById(id);
    if (!m || m.k !== kind || D.done[id]) continue;
    D.prog[id] = best ? Math.max(D.prog[id] || 0, v) : (D.prog[id] || 0) + v;
    if (D.prog[id] >= m.goal) {
      D.done[id] = 1;
      S.coins += m.c;
      S.sp += m.sp || 0;
      toast('✅ مهمة اليوم: ' + m.n + ' (+' + m.c + ' 🪙' + (m.sp ? ' و ✨ +' + m.sp : '') + ')');
      AU.play('win');
      save();
    }
  }
}
/** Time until the missions change, as h:mm. */
function dailyResetIn() {
  const n = new Date(),
    t = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n,
    m = Math.ceil(t / 60000);
  return ((m / 60) | 0) + ':' + String(m % 60).padStart(2, '0');
}
function drawDaily() {
  const D = daily(),
    g = $('dailyGrid');
  g.innerHTML = '';
  for (const id of D.ids) {
    const m = missionById(id),
      done = !!D.done[id],
      v = Math.min(m.goal, Math.floor(D.prog[id] || 0)),
      shown = m.k === 'time' ? fmtT(v) + ' / ' + fmtT(m.goal) : v + ' / ' + m.goal,
      bar = el('div', 'dbar');
    bar.appendChild(el('i')).style.width = (v / m.goal) * 100 + '%';
    itemCard(g, {
      cls: done ? ' done' : '',
      title: (done ? '✅ ' : '🎯 ') + m.n,
      body: [bar, el('p', '', shown + ' · المكافأة ' + m.c + ' 🪙' + (m.sp ? ' و ' + m.sp + ' ✨' : ''))],
    });
  }
  $('dailyReset').textContent = 'تتجدد المهام بعد ' + dailyResetIn() + ' ساعة';
}
