'use strict';
/* Sword duel — the ⚔️ menu: training, the list of players in the duel lobby (challenge / accept), and the public
   record of who fought whom. The lobby is a Realtime channel with presence; a match gets its own channel. */
const LOBBY = { ch: null, pending: null, incoming: null, waitT: 0, open: false };
async function lobbyOpen() {
  AU.init();
  LOBBY.open = true;
  go('duelMenu');
  if (!S.name) askName();
  lobbyDrawRec();
  $('dmList').innerHTML = '';
  $('dmStatus').textContent = 'جارٍ الاتصال…';
  if (LOBBY.ch) return;
  try {
    LOBBY.ch = await netJoin('duel-lobby', { id: myPid(), n: S.name || 'لاعب', busy: false });
  } catch (e) {
    $('dmStatus').textContent = 'ما قدرت أتصل بالسيرفر، تأكد من الإنترنت';
    return;
  }
  if (!LOBBY.open) return lobbyClose(); // left while connecting
  LOBBY.ch.onPresence(lobbyList);
  LOBBY.ch
    .on('ch', lobbyIncoming)
    .on('ans', lobbyAnswer)
    .on('cancel', d => {
      if (d.to === myPid() && LOBBY.incoming && LOBBY.incoming.room === d.room) {
        LOBBY.incoming = null;
        lobbyAsk(false);
        toast('ألغى التحدي');
      }
    });
}
function lobbyClose() {
  LOBBY.open = false;
  LOBBY.sig = null;
  if (LOBBY.ch) LOBBY.ch.close();
  LOBBY.ch = null;
  LOBBY.pending = LOBBY.incoming = null;
  clearTimeout(LOBBY.waitT);
  lobbyAsk(false);
}
function lobbyList(peers) {
  // redraw only when someone arrives, leaves or changes (a button that keeps re-rendering is hard to tap)
  const sig = peers.map(p => p.id + p.n + (p.busy ? 1 : 0)).join('|') + (LOBBY.pending ? '#' : '');
  if (sig === LOBBY.sig) return;
  LOBBY.sig = sig;
  const L = $('dmList');
  L.innerHTML = '';
  $('dmStatus').textContent = peers.length
    ? 'اللاعبين اللي فاتحين المبارزة الحين:'
    : 'ما فيه أحد فاتح المبارزة الحين. قل لخويك يفتح ⚔️ وبيطلع اسمه هنا.';
  for (const p of peers) {
    const r = el('div', 'dmP'),
      b = el('button', 'btn sm go', p.busy ? 'مشغول' : 'تحدّاه ⚔️');
    b.disabled = !!p.busy || !!LOBBY.pending;
    b.onclick = () => lobbyChallenge(p);
    r.append(profileLink(el('span', '', p.n), p.n), b);
    L.appendChild(r);
  }
}
function lobbyChallenge(p) {
  if (!LOBBY.ch || LOBBY.pending) return;
  if (!S.name) return askName();
  const room = myPid() + '-' + Date.now().toString(36);
  LOBBY.pending = { to: p.id, room, n: p.n };
  LOBBY.ch.send('ch', { to: p.id, from: myPid(), fn: S.name, room });
  LOBBY.ch.track({ busy: true });
  lobbyAsk(true, 'بانتظار رد ' + p.n + '…', 'إذا قبل تبدأ المبارزة على طول', null, 'إلغاء', () => {
    LOBBY.ch && LOBBY.ch.send('cancel', { to: p.id, room });
    lobbyFree();
  });
  clearTimeout(LOBBY.waitT);
  LOBBY.waitT = setTimeout(() => {
    if (LOBBY.pending && LOBBY.pending.room === room) {
      LOBBY.ch && LOBBY.ch.send('cancel', { to: p.id, room });
      toast(p.n + ' ما رد');
      lobbyFree();
    }
  }, 25000);
  lobbyList(LOBBY.ch.peers);
}
function lobbyFree() {
  LOBBY.pending = null;
  clearTimeout(LOBBY.waitT);
  lobbyAsk(false);
  if (LOBBY.ch) {
    LOBBY.ch.track({ busy: false });
    lobbyList(LOBBY.ch.peers);
  }
}
function lobbyIncoming(d) {
  if (d.to !== myPid()) return;
  if (LOBBY.pending || LOBBY.incoming) {
    LOBBY.ch.send('ans', { to: d.from, room: d.room, ok: false });
    return;
  }
  LOBBY.incoming = d;
  AU.play('boss');
  lobbyAsk(
    true,
    d.fn + ' يتحداك! ⚔️',
    'مبارزة بالسيوف، أول من يفوز بـ3 جولات',
    'قبول ⚔️',
    'رفض',
    () => {
      LOBBY.ch.send('ans', { to: d.from, room: d.room, ok: false });
      LOBBY.incoming = null;
      lobbyAsk(false);
    },
    () => {
      LOBBY.ch.send('ans', { to: d.from, room: d.room, ok: true });
      lobbyStartMatch(d.room, false, d.fn);
    }
  );
}
function lobbyAnswer(d) {
  const P = LOBBY.pending;
  if (d.to !== myPid() || !P || d.room !== P.room) return;
  if (d.ok) lobbyStartMatch(P.room, true, P.n);
  else {
    toast(P.n + ' رفض التحدي');
    lobbyFree();
  }
}
function lobbyStartMatch(room, host, foeName) {
  lobbyClose();
  duelStartOnline(room, host, foeName);
}
/** The challenge dialog (show=false hides it). */
function lobbyAsk(show, title, sub, yesT, noT, onNo, onYes) {
  $('dmAsk').hidden = !show;
  if (!show) return;
  $('dmAskT').textContent = title;
  $('dmAskS').textContent = sub || '';
  $('dmYes').hidden = !yesT;
  $('dmYes').textContent = yesT || '';
  $('dmNo').textContent = noT || 'إغلاق';
  $('dmYes').onclick = onYes || null;
  $('dmNo').onclick = onNo || (() => lobbyAsk(false));
}

/* ---- the public record */
async function duelRecord(a, b, winner, score) {
  if (NET_LOCAL) {
    const L = JSON.parse(localStorage.getItem('ashen_duels_local') || '[]');
    L.unshift({ id: Date.now(), a, b, winner, score, created_at: new Date().toISOString() });
    localStorage.setItem('ashen_duels_local', JSON.stringify(L.slice(0, 300)));
    return;
  }
  try {
    await api('/rest/v1/rpc/record_duel', {
      method: 'POST',
      body: JSON.stringify({ p_a: a, p_b: b, p_winner: winner, p_score: score }),
    });
  } catch (e) {}
}
async function lobbyDrawRec() {
  const B = $('dmRec');
  B.textContent = '…';
  let rows;
  try {
    rows = NET_LOCAL
      ? JSON.parse(localStorage.getItem('ashen_duels_local') || '[]')
      : await api('/rest/v1/duels?select=id,a,b,winner,score,created_at&order=id.desc&limit=300');
  } catch (e) {
    B.textContent = 'السجل غير متاح الحين';
    return;
  }
  B.innerHTML = '';
  if (!rows || !rows.length) {
    B.appendChild(el('p', 'note', 'ما فيه مبارزات مسجّلة للحين. أول مبارزة تنحفظ هنا.'));
    return;
  }
  // head to head: one line per pair of players
  const pairs = new Map();
  for (const r of rows) {
    const [x, y] = [r.a, r.b].sort(),
      k = x + '|' + y,
      p = pairs.get(k) || { x, y, wx: 0, wy: 0, n: 0 };
    p.n++;
    if (r.winner === x) p.wx++;
    else if (r.winner === y) p.wy++;
    pairs.set(k, p);
  }
  B.appendChild(el('h5', 'dmH', 'وجهاً لوجه'));
  [...pairs.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 40)
    .forEach(p => {
      const r = el('div', 'dmPair' + (p.x === S.name || p.y === S.name ? ' me' : ''));
      // right-to-left row: x sits on the right, so its count is the right-hand number
      r.append(
        profileLink(el('span', '', p.x), p.x),
        el('b', '', p.wy + ' : ' + p.wx),
        profileLink(el('span', '', p.y), p.y)
      );
      if (S.dev) r.append(duelDelBtn('كل مبارزات ' + p.x + ' و ' + p.y, { a: p.x, b: p.y }));
      B.appendChild(r);
    });
  B.appendChild(el('h5', 'dmH', 'آخر المبارزات'));
  rows.slice(0, 10).forEach(r => {
    const d = el('div', 'dmLast');
    d.append(
      el('span', '', r.a + ' ضد ' + r.b),
      el('b', '', '🏆 ' + r.winner + ' (' + r.score + ')'),
      el('small', '', chatAgo(r.created_at))
    );
    if (S.dev) d.append(duelDelBtn('مبارزة ' + r.a + ' ضد ' + r.b, { ids: [r.id] }));
    B.appendChild(d);
  });
  if (S.dev) {
    const w = el('button', 'btn sm dmWipe', '🧨 امسح سجل المبارزات كله');
    w.onclick = () => duelDelConfirm(w, 'متأكد؟ اضغط مرة ثانية', {});
    B.appendChild(w);
  }
}

/* ---- developer: delete records (the server checks the developer code) */
function duelDelBtn(what, q) {
  const b = el('button', 'dmDel', '🗑');
  b.title = 'احذف ' + what;
  b.onclick = () => duelDelConfirm(b, '⚠️', q);
  return b;
}
/** Two taps: the first arms the button, the second deletes. */
function duelDelConfirm(b, armedText, q) {
  if (!b.dataset.armed) {
    b.dataset.armed = b.textContent;
    b.textContent = armedText;
    setTimeout(() => {
      if (b.dataset.armed) {
        b.textContent = b.dataset.armed;
        delete b.dataset.armed;
      }
    }, 3000);
    return;
  }
  delete b.dataset.armed;
  duelAdminDelete(q);
}
async function duelAdminDelete(q) {
  if (NET_LOCAL) {
    let L = JSON.parse(localStorage.getItem('ashen_duels_local') || '[]');
    const before = L.length;
    L = q.ids
      ? L.filter(r => !q.ids.includes(r.id))
      : q.a
        ? L.filter(r => !([r.a, r.b].sort().join('|') === [q.a, q.b].sort().join('|')))
        : [];
    localStorage.setItem('ashen_duels_local', JSON.stringify(L));
    toast('🗑 انحذفت ' + (before - L.length) + ' مبارزة');
    return lobbyDrawRec();
  }
  let key = S.devKey;
  if (!key) key = (prompt('اكتب كود المطور للتأكيد') || '').toUpperCase().replace(/\s+/g, '');
  if (!key) return;
  try {
    const n = await api('/rest/v1/rpc/admin_delete_duels', {
      method: 'POST',
      body: JSON.stringify({ p_key: key, p_ids: q.ids || null, p_a: q.a || null, p_b: q.b || null }),
    });
    S.devKey = key;
    save();
    toast('🗑 انحذفت ' + (n | 0) + ' مبارزة');
  } catch (e) {
    const m = String(e.message);
    if (m.includes('400')) {
      delete S.devKey;
      save();
      toast('كود المطور غير صحيح');
    } else if (m.includes('404')) toast('خاصية الحذف ما انفعّلت في السيرفر للحين');
    else toast('ما انحذف، تأكد من الإنترنت');
  }
  lobbyDrawRec();
}
$('dmBack').onclick = () => {
  lobbyClose();
  go('menu');
};
$('dmTrain').onclick = () => {
  lobbyClose();
  duelStart();
};
$('mDuel').onclick = () => lobbyOpen();
