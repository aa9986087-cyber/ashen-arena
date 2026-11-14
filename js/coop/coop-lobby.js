'use strict';
/* Co-op lobby: open rooms are announced on 'coop-lobby' (broadcast only, no presence: it has rate limits);
   a room lives on its own channel 'coop-<room>' where the host keeps the roster (up to 4) and starts the run. */
const CLOB = { ch: null, rooms: new Map(), room: null, t: null };
const COOP_MAX = 4;
async function coopOpen() {
  AU.init();
  if (!S.name) askName();
  go('coopMenu');
  coopLobbyDraw();
  if (!CLOB.ch) {
    $('cmStatus').textContent = 'جارٍ الاتصال…';
    try {
      CLOB.ch = await netJoin('coop-lobby');
      CLOB.ch.on('room', r => {
        if (!r || !r.room) return;
        if (r.open) CLOB.rooms.set(r.room, Object.assign(r, { at: Date.now() }));
        else CLOB.rooms.delete(r.room);
        coopLobbyDraw();
      });
    } catch (e) {
      $('cmStatus').textContent = 'ما قدرت أتصل، تأكد من الإنترنت';
      return;
    }
  }
  clearInterval(CLOB.t);
  CLOB.t = setInterval(coopLobbyTick, 1000);
  coopLobbyDraw();
}
function coopLobbyTick() {
  const R = CLOB.room;
  // a host keeps announcing its room (and its roster to its members)
  if (R && R.host && !R.started) {
    CLOB.ch &&
      CLOB.ch.send('room', { room: R.id, n: S.name || 'لاعب', c: R.list.length, open: R.list.length < COOP_MAX });
    R.ch.send('ro', { list: R.list });
  }
  // a joiner says hello until the host lists him
  if (R && !R.host && !R.started && !R.list.some(x => x.id === myPid())) R.ch.send('hi', coopMe());
  for (const [k, r] of CLOB.rooms) if (Date.now() - r.at > 7000) CLOB.rooms.delete(k);
  coopLobbyDraw();
}
const coopMe = () => ({ id: myPid(), n: S.name || 'لاعب', ch: S.char });
function coopLobbyDraw() {
  const R = CLOB.room;
  const list = [...CLOB.rooms.values()].filter(r => !R || r.room !== R.id);
  // redraw only when something changed (a redraw replaces the buttons under the finger)
  const sig =
    list.map(r => r.room + r.c + r.open).join() +
    '|' +
    (R ? R.id + R.host + R.list.map(m => m.id + m.ch).join() + R.list.some(x => x.id === myPid()) : '');
  if (CLOB.sig === sig) return;
  CLOB.sig = sig;
  $('cmRooms').innerHTML = '';
  $('cmStatus').textContent = list.length ? '' : 'ما فيه جلسات مفتوحة الحين. سوّ وحدة وخلّ أخوياك ينضمون.';
  for (const r of list) {
    const row = el('div', 'cmRoom'),
      b = el('button', 'btn sm go', 'انضم');
    row.append(el('b', '', '🏰 ' + r.n), el('span', '', r.c + ' / ' + COOP_MAX));
    b.disabled = !r.open || !!R;
    b.onclick = () => coopJoin(r.room, r.n);
    row.appendChild(b);
    $('cmRooms').appendChild(row);
  }
  // the room we're in
  $('cmRoom').hidden = !R;
  $('cmCreate').hidden = !!R;
  if (!R) return;
  $('cmRoomT').textContent = R.host ? '🏰 جلستك' : '🏰 جلسة ' + R.hostName;
  $('cmPlayers').innerHTML = '';
  for (let i = 0; i < COOP_MAX; i++) {
    const m = R.list[i],
      row = el('div', 'cmP' + (m ? '' : ' empty'));
    if (m)
      row.append(
        el('i', '', (CHARS[m.ch] || {}).i || '⚔️'),
        el('b', '', m.n + (m.id === myPid() ? ' (أنت)' : '')),
        el('small', '', (i === 0 ? '👑 المضيف · ' : '') + ((CHARS[m.ch] || {}).n || ''))
      );
    else row.append(el('i', '', '➕'), el('b', '', 'مكان فاضي'));
    $('cmPlayers').appendChild(row);
  }
  $('cmStart').hidden = !R.host;
  $('cmStart').textContent = '⚔️ ابدأ المعركة (' + R.list.length + ')';
  $('cmWait').hidden = R.host;
  $('cmWait').textContent = R.list.some(x => x.id === myPid()) ? '⏳ بانتظار المضيف يبدأ…' : '⏳ جارٍ الانضمام…';
}
/** Open a room and host it. */
async function coopCreate() {
  const id = (myPid().slice(-4) + Math.random().toString(36).slice(2, 6)).toLowerCase();
  let ch;
  try {
    ch = await netJoin('coop-' + id);
  } catch (e) {
    return toast('ما قدرت أفتح الجلسة');
  }
  const R = (CLOB.room = { id, ch, host: true, list: [coopMe()], hostName: S.name });
  ch.on('hi', m => {
    if (!m || !m.id || R.started) return;
    const old = R.list.find(x => x.id === m.id);
    if (old) Object.assign(old, m);
    else if (R.list.length < COOP_MAX) {
      R.list.push(m);
      AU.play('select');
    } else ch.send('full', { to: m.id });
    ch.send('ro', { list: R.list });
    coopLobbyDraw();
  }).on('bye', m => {
    R.list = R.list.filter(x => x.id !== (m && m.id));
    ch.send('ro', { list: R.list });
    coopLobbyDraw();
  });
  coopLobbyTick();
  coopLobbyDraw();
}
/** Join someone's room. */
async function coopJoin(id, hostName) {
  let ch;
  try {
    ch = await netJoin('coop-' + id);
  } catch (e) {
    return toast('ما قدرت أنضم');
  }
  const R = (CLOB.room = { id, ch, host: false, list: [], hostName });
  ch.on('ro', m => {
    if (!m || R.started) return;
    R.list = m.list || [];
    coopLobbyDraw();
  })
    .on('full', m => {
      if (m && m.to === myPid()) {
        toast('الجلسة مليانة (' + COOP_MAX + ' لاعبين)');
        coopRoomLeave(true);
      }
    })
    .on('bye', m => {
      if (m && R.list[0] && m.id === R.list[0].id) {
        toast('المضيف ألغى الجلسة');
        coopRoomLeave(true);
      }
    })
    .on('go', m => {
      if (R.started || !m || !m.list || !m.list.some(x => x.id === myPid())) return;
      R.started = true;
      CLOB.room = null;
      clearInterval(CLOB.t);
      coopStart(ch, m.list, false);
    });
  ch.send('hi', coopMe());
  coopLobbyDraw();
}
function coopRoomLeave(silent) {
  const R = CLOB.room;
  if (!R) return;
  CLOB.room = null;
  try {
    if (!silent) R.ch.send('bye', { id: myPid() });
    if (R.host) CLOB.ch && CLOB.ch.send('room', { room: R.id, open: false });
  } catch (e) {}
  setTimeout(() => R.ch.close(), 300);
  coopLobbyDraw();
}
/** The host starts the run for everyone in the room. */
function coopGo() {
  const R = CLOB.room;
  if (!R || !R.host) return;
  R.started = true;
  clearInterval(CLOB.t);
  CLOB.ch && CLOB.ch.send('room', { room: R.id, open: false });
  // the room channel carries the run from here; send the start a few times (a message can get lost)
  for (const t of [0, 250, 600]) setTimeout(() => R.ch.send('go', { list: R.list }), t);
  coopStart(R.ch, R.list, true);
  CLOB.room = null;
}
$('mCoop').onclick = () => coopOpen();
$('cmCreate').onclick = () => coopCreate();
$('cmStart').onclick = () => coopGo();
$('cmLeave').onclick = () => coopRoomLeave();
$('cmBack').onclick = () => {
  coopRoomLeave();
  clearInterval(CLOB.t);
  go('menu');
};
