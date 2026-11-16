'use strict';
/* Leaderboard: local list, shareable signed score codes, and the online (Supabase) boards. */
let lastRun = null;
function mkCode(e) {
  return packCode('AR1', [e.n, e.k, e.l, e.t | 0, e.b], '#vamos');
}
function readCode(txt) {
  const p = unpackCode('AR1', txt, 5, '#vamos');
  if (!p) return null;
  const e = { n: p[0].slice(0, 14), k: +p[1], l: +p[2], t: +p[3], b: +p[4] };
  return e.n && isFinite(e.k + e.l + e.t + e.b) ? e : null;
}
/** The ranking: how far you got (bosses beaten) first, then kills, then the faster time. */
/** The order: more bosses (all runs together), then more kills, then fewer runs (the same with less play). */
const rankCmp = (a, b) =>
  (b.b || 0) - (a.b || 0) || (b.k || 0) - (a.k || 0) || (a.r || 0) - (b.r || 0) || (a.t || 0) - (b.t || 0);
function addScore(e) {
  const B = S.board,
    i = B.findIndex(x => x.n === e.n);
  if (i >= 0) {
    if (rankCmp(e, B[i]) >= 0) return false; // not better than the run already there
    B.splice(i, 1);
  }
  B.push({ n: e.n, k: e.k, l: e.l, t: e.t, b: e.b });
  B.sort(rankCmp);
  if (B.length > 30) B.length = 30;
  save();
  return true;
}
const shareText = e =>
  '🔥 ساحة الرماد\n' +
  e.n +
  ': ' +
  e.k +
  ' عدو، مستوى ' +
  e.l +
  '، الوقت ' +
  fmtT(e.t) +
  '\nانسخ الرسالة كاملة والصقها في قائمة الصدارة داخل اللعبة:\n' +
  mkCode(e);
async function copyText(t) {
  const copied = await copyToClipboard(t);
  toast(copied ? 'نُسخت النتيجة، الصقها لخوياك' : 'تعذر النسخ. جرّب زر مشاركة النتيجة أو متصفحًا آخر');
}
const ONLINE = {
  url: 'https://bvxfzcndquirqmpyhtpj.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2eGZ6Y25kcXVpcnFtcHlodHBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0NzExNDksImV4cCI6MjExMDA0NzE0OX0.7HPJrwhOPeKu874MWn1aQWJtH4hRf7M2hfXgV-m5qvk',
};
let onlineOK = false,
  onlineRows = null;
async function api(path, opt) {
  const r = await fetch(
    ONLINE.url + path,
    Object.assign(
      { headers: { apikey: ONLINE.key, Authorization: 'Bearer ' + ONLINE.key, 'Content-Type': 'application/json' } },
      opt || {}
    )
  );
  if (!r.ok) throw new Error('http ' + r.status);
  const t = await r.text(); // RPCs that return void answer with an empty body
  return t ? JSON.parse(t) : null;
}
/** A board row from a profile's numbers (all of a player's runs added up, plus this week's counters). */
function profileRow(n, s) {
  return {
    n,
    b: s.b | 0,
    k: s.k | 0,
    lvl: s.lvl | 0,
    r: s.r | 0,
    t: s.t | 0,
    ft: s.ft | 0,
    wk: s.wk || '',
    wb: s.wb | 0,
    wkk: s.wkk | 0,
    wt: s.wt | 0,
    wft: s.wft | 0,
  };
}
/** A row from this device's own list (no profile yet: weekly and fastest are unknown). */
function localRow(e) {
  return {
    n: e.n,
    b: e.b | 0,
    k: e.k | 0,
    lvl: e.l | 0,
    r: e.r | 0,
    t: e.t | 0,
    ft: 0,
    wk: '',
    wb: 0,
    wkk: 0,
    wt: 0,
    wft: 0,
  };
}
async function loadOnline() {
  try {
    // the same numbers as each player's card: his newest profile (all his runs added up)
    const rows = await api('/rest/v1/profiles?select=name,stats,updated_at&order=updated_at.desc&limit=2000'),
      seen = new Set(),
      L = [];
    for (const r of rows || []) {
      const n = String(r.name || '').trim(),
        s = r.stats || {};
      if (!n || seen.has(n)) continue;
      seen.add(n);
      if (!(s.r > 0) && !(s.b > 0) && !(s.k > 0)) continue; // never played a run
      L.push(profileRow(n, s));
    }
    // ours straight from this device (the server's copy may be a run behind)
    if (S.name) {
      const i = L.findIndex(e => e.n === S.name);
      if (i >= 0) L.splice(i, 1);
      if (S.stats.runs > 0) L.push(profileRow(S.name, profileStats()));
    }
    onlineRows = L.slice(0, 400);
    onlineOK = true;
  } catch (err) {
    onlineOK = false;
  }
  if (!$('board').hidden) drawBoard();
}
async function sendOnline(e) {
  try {
    await api('/rest/v1/rpc/submit_score', {
      method: 'POST',
      body: JSON.stringify({ p_name: e.n, p_kills: e.k, p_lvl: e.l, p_t: e.t | 0, p_bosses: e.b }),
    });
    loadOnline();
  } catch (err) {}
}
/** Which board is open (🏆 week, 🛡️ endure, 👑 bosses, ⚡ fastest, 💀 kills); remembered on this device. */
let boardId = 'week';
try {
  const saved = localStorage.getItem('ashen_board_tab');
  if (saved) boardId = boardMetric(saved).id;
} catch (e) {}
function podCard(e, place) {
  const p = el('button', 'pod pod' + place + (e.n === S.name ? ' me' : ''));
  p.onclick = () => profileOpen(e.n);
  p.append(
    el('span', 'podMedal', ['🥇', '🥈', '🥉'][place - 1]),
    avatarEl(e.n),
    el('b', '', e.n),
    el('strong', '', e.text),
    el('small', '', e.sub)
  );
  return p;
}
function drawBoard() {
  const metric = boardMetric(boardId),
    live = onlineOK && onlineRows,
    rows = live ? onlineRows : (S.board || []).map(localRow),
    ranked = boardRank(rows, metric.id);
  $('bName').textContent = '✏️ ' + (S.name || 'اسمك');
  // tabs: the open one glows
  for (const b of $('boardTabs').children) {
    const on = b.dataset.metric === metric.id;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  }
  $('boardLead').textContent = metric.lead + (ranked.length ? ' · ' + ranked.length + ' لاعب' : '');
  // the throne: silver, gold, bronze — the champion in the middle
  const P = $('podium');
  P.replaceChildren();
  const top = ranked.slice(0, 3);
  for (const place of [2, 1, 3]) if (top[place - 1]) P.appendChild(podCard(top[place - 1], place));
  // the rest of the hall
  const L = $('boardList');
  L.replaceChildren();
  if (!ranked.length) {
    const empty = el('div', 'boardEmpty');
    empty.append(el('span', 'boardEmptyIcon', metric.icon), el('p', '', metric.empty));
    L.appendChild(empty);
  }
  const max = Math.max(...ranked.map(r => r.num), 1),
    min = Math.min(...ranked.filter(r => r.num > 0).map(r => r.num), max);
  ranked.slice(3).forEach((e, i) => {
    const pct = Math.max(8, Math.round((metric.id === 'fast' ? min / e.num : e.num / max) * 100)),
      r = el('div', 'rk' + (e.n === S.name ? ' me' : ''));
    r.style.setProperty('--w', pct + '%');
    r.onclick = () => profileOpen(e.n); // the whole row opens the player's card
    const body = el('div', 'rkBody'),
      head = el('div', 'rkHeadRow');
    head.append(avatarEl(e.n), profileLink(el('span', 'rkName', e.n), e.n));
    body.append(head, el('small', '', e.sub));
    r.append(el('i', '', i + 4), el('span', 'rkFill'), body, el('b', '', e.text));
    L.appendChild(r);
  });
  // the players' pictures: whoever has one shows it, the rest keep their first letter
  if (typeof avatarFetch === 'function') avatarFetch(ranked.map(e => e.n));
  $('boardMode').textContent = live
    ? '🌐 قائمة مباشرة لكل اللاعبين · تتحدث بعد كل جولة'
    : '📱 قائمة هذا الجهاز فقط · افتح الاتصال لترى قائمة كل اللاعبين';
  // how the order is decided: open the first time, then as the player left it (ⓘ)
  let open = true;
  try {
    open = localStorage.getItem('ashen_rule_seen') !== '1';
  } catch (e) {}
  $('bRule').hidden = !open;
  $('bHow').setAttribute('aria-expanded', open);
  if (!live) S.board.sort(rankCmp);
  $('offBox').hidden = !!live;
  const me = S.board.find(x => x.n === S.name);
  $('myCode').value = me ? shareText(me) : '';
  $('bCopy').disabled = !me;
}
function askName() {
  $('nameIn').value = S.name || '';
  $('nameScr').hidden = false;
}
$('nameOk').onclick = () => {
  const n = $('nameIn').value.replace(/[|\n]/g, '').trim().slice(0, 14);
  if (!n) {
    toast('اكتب اسمك أول');
    return;
  }
  const old = S.name;
  if (old && old !== n) for (const e of S.board) if (e.n === old) e.n = n;
  S.name = n;
  save();
  profileSync();
  AU.init();
  AU.play('select');
  $('nameScr').hidden = true;
  if (!$('board').hidden) drawBoard();
  if (!$('chat').hidden) chatDraw();
};
$('nameIn').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('nameOk').click();
});
$('bName').onclick = askName;
$('bHow').onclick = () => {
  const open = $('bRule').hidden;
  $('bRule').hidden = !open;
  $('bHow').setAttribute('aria-expanded', open);
  try {
    localStorage.setItem('ashen_rule_seen', open ? '0' : '1');
  } catch (e) {}
};
$('boardTabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-metric]');
  if (!b || b.dataset.metric === boardId) return;
  boardId = boardMetric(b.dataset.metric).id;
  try {
    localStorage.setItem('ashen_board_tab', boardId);
  } catch (err) {}
  AU.play('select');
  drawBoard();
});
$('bCopy').onclick = () => {
  const me = S.board.find(x => x.n === S.name);
  if (me) copyText(shareText(me));
};
$('ovCopy').onclick = () => {
  if (lastRun) copyText(shareText(lastRun));
};
$('bAdd').onclick = () => {
  const e = readCode($('inCode').value);
  if (!e) {
    AU.play('deny');
    toast('الكود غير صحيح. الصق الرسالة كاملة كما وصلتك');
    return;
  }
  const added = addScore(e);
  $('inCode').value = '';
  AU.play(added ? 'win' : 'select');
  toast(added ? 'أُضيفت نتيجة ' + e.n : 'عندك نتيجة أعلى باسم ' + e.n + ' من قبل');
  drawBoard();
};
