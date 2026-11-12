'use strict';
/* Leaderboard: local list, shareable signed score codes, and the online (Supabase) board. */
let lastRun = null;
const sig = s => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};
const b64 = s =>
  btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
function mkCode(e) {
  const body = [e.n, e.k, e.l, e.t | 0, e.b].join('|');
  return 'AR1-' + b64(body + '|' + sig(body + '#vamos'));
}
function readCode(txt) {
  const m = /AR1-([A-Za-z0-9_-]+)/.exec(txt || '');
  if (!m) return null;
  try {
    const p = unb64(m[1]).split('|');
    if (p.length !== 6) return null;
    const body = p.slice(0, 5).join('|');
    if (sig(body + '#vamos') !== p[5]) return null;
    const e = { n: p[0].slice(0, 14), k: +p[1], l: +p[2], t: +p[3], b: +p[4] };
    return e.n && isFinite(e.k + e.l + e.t + e.b) ? e : null;
  } catch (err) {
    return null;
  }
}
function addScore(e) {
  const B = S.board,
    i = B.findIndex(x => x.n === e.n);
  if (i >= 0) {
    if (B[i].k >= e.k) return false;
    B.splice(i, 1);
  }
  B.push({ n: e.n, k: e.k, l: e.l, t: e.t, b: e.b });
  B.sort((a, b) => b.k - a.k);
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
function copyText(t) {
  const ok = () => toast('نُسخت النتيجة، الصقها لخوياك'),
    bad = () => toast('ما انتسخت تلقائياً. افتح الصدارة وانسخ النص بيدك');
  const fb = () => {
    try {
      const a = $('myCode');
      a.value = t;
      a.focus();
      a.select();
      document.execCommand('copy') ? ok() : bad();
    } catch (err) {
      bad();
    }
  };
  try {
    navigator.clipboard.writeText(t).then(ok, fb);
  } catch (err) {
    fb();
  }
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
  return r.json();
}
async function loadOnline() {
  try {
    const rows = await api('/rest/v1/scores?select=name,kills,lvl,t,bosses&order=kills.desc&limit=300');
    onlineRows = rows.map(r => ({ n: String(r.name), k: +r.kills, l: +r.lvl, t: +r.t, b: +r.bosses }));
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
function drawBoard() {
  const L = $('boardList');
  L.innerHTML = '';
  $('bName').textContent = '✏️ ' + (S.name || 'اسمك');
  const live = onlineOK && onlineRows,
    list = live ? onlineRows : S.board;
  $('boardMode').textContent = live ? '🌐 قائمة مباشرة لكل اللاعبين' : '📱 قائمة هذا الجهاز فقط';
  $('offBox').hidden = !!live;
  if (!list.length) L.appendChild(el('p', '', 'ما فيه نتائج للحين. العب جولة وسجّل أول رقم.'));
  list.forEach((e, i) => {
    const r = el('div', 'rk' + (e.n === S.name ? ' me' : ''));
    r.append(
      el('i', '', i + 1),
      el('span', '', e.n),
      el('b', '', '💀 ' + e.k),
      el('small', '', 'مستوى ' + e.l),
      el('small', '', fmtT(e.t))
    );
    L.appendChild(r);
  });
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
  AU.init();
  AU.play('select');
  $('nameScr').hidden = true;
  if (!$('board').hidden) drawBoard();
};
$('nameIn').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('nameOk').click();
});
$('bName').onclick = askName;
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
