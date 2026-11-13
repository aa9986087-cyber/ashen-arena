'use strict';
/* Public chat: one shared room for everyone playing, stored on the same Supabase project as the leaderboard.
   Messages are read straight from the `chat` table and sent through the `send_chat` RPC (rate limited on the server). */
const CHAT = {
  rows: [],
  lastId: 0,
  seenId: +localStorage.getItem('ashen_chat_seen') || 0,
  timer: 0,
  from: 'menu',
  ok: null,
};
/** Fetch the latest messages (newest 60). */
async function chatLoad() {
  try {
    const rows = await api('/rest/v1/chat?select=id,name,msg,created_at&order=id.desc&limit=60');
    CHAT.rows = rows.reverse();
    CHAT.ok = true;
  } catch (err) {
    CHAT.ok = false;
  }
  const last = CHAT.rows.length ? CHAT.rows[CHAT.rows.length - 1].id : 0;
  const fresh = last !== CHAT.lastId;
  CHAT.lastId = last;
  if (!$('chat').hidden) {
    chatSeen();
    if (fresh || !$('chatList').childElementCount) chatDraw();
  }
  chatBadge();
}
function chatSeen() {
  CHAT.seenId = CHAT.lastId;
  try {
    localStorage.setItem('ashen_chat_seen', CHAT.seenId);
  } catch (err) {}
}
function chatBadge() {
  const n = CHAT.rows.filter(r => r.id > CHAT.seenId && r.name !== S.name).length,
    b = $('chatBadge');
  b.hidden = !n;
  b.textContent = n > 9 ? '9+' : n;
}
/** "قبل 3 د" style relative time. */
function chatAgo(ts) {
  const s = Math.max(0, (Date.now() - Date.parse(ts)) / 1000);
  if (s < 60) return 'الآن';
  if (s < 3600) return 'قبل ' + Math.floor(s / 60) + ' د';
  if (s < 86400) return 'قبل ' + Math.floor(s / 3600) + ' س';
  return 'قبل ' + Math.floor(s / 86400) + ' يوم';
}
function chatDraw() {
  const L = $('chatList'),
    atEnd = L.scrollHeight - L.scrollTop - L.clientHeight < 40;
  L.innerHTML = '';
  $('cName').textContent = '✏️ ' + (S.name || 'اسمك');
  const recent = new Set(CHAT.rows.filter(r => Date.now() - Date.parse(r.created_at) < 600000).map(r => r.name));
  $('chatInfo').textContent =
    CHAT.ok === false
      ? '⚠️ الشات غير متاح الحين، تأكد من الإنترنت.'
      : '🌐 غرفة واحدة لكل اللاعبين' + (recent.size ? ' · نشطين آخر 10 دقائق: ' + recent.size : '');
  if (CHAT.ok && !CHAT.rows.length) L.appendChild(el('p', 'note', 'ما فيه رسائل للحين. كن أول من يكتب!'));
  for (const r of CHAT.rows) {
    const m = el('div', 'cm' + (r.name === S.name ? ' me' : ''));
    m.append(el('b', '', r.name), el('small', '', chatAgo(r.created_at)), el('p', '', r.msg));
    L.appendChild(m);
  }
  if (atEnd || L.dataset.first !== '1') {
    L.scrollTop = L.scrollHeight;
    L.dataset.first = '1';
  }
}
/** Open the chat (from the menu or the pause screen) and poll every 4 s while it is open. */
function openChat(from) {
  CHAT.from = from;
  $('chatList').dataset.first = '';
  if (from === 'pause') {
    show('pause', false);
    show('chat', true);
  } else go('chat');
  chatDraw();
  chatLoad();
  clearInterval(CHAT.timer);
  CHAT.timer = setInterval(chatLoad, 4000);
  if (!S.name) askName();
}
function closeChat() {
  clearInterval(CHAT.timer);
  CHAT.timer = setInterval(chatLoad, 30000);
  if (CHAT.from === 'pause') {
    show('chat', false);
    show('pause', true);
  } else go('menu');
}
let chatBusy = false;
async function chatSend() {
  const inp = $('chatIn'),
    msg = inp.value.trim();
  if (!msg || chatBusy) return; // one send at a time: no double posts from a double tap
  if (!S.name) {
    askName();
    return;
  }
  chatBusy = true;
  inp.value = ''; // clear right away; put it back only if sending fails
  $('chatSend').disabled = true;
  try {
    await api('/rest/v1/rpc/send_chat', { method: 'POST', body: JSON.stringify({ p_name: S.name, p_msg: msg }) });
    AU.play('select');
  } catch (err) {
    if (!inp.value) inp.value = msg;
    toast(String(err.message).includes('400') ? 'لحظة، لا ترسل بسرعة 🙂' : 'ما انرسلت، تأكد من الإنترنت');
  }
  chatBusy = false;
  $('chatSend').disabled = false;
  inp.focus();
  chatLoad();
}
$('mChat').onclick = () => {
  AU.init();
  AU.play('select');
  openChat('menu');
};
$('pChat').onclick = () => openChat('pause');
$('cBack').onclick = closeChat;
$('cName').onclick = askName;
$('chatForm').onsubmit = e => {
  e.preventDefault();
  chatSend();
};
// keys typed in the chat box must not move the hero or trigger shortcuts
$('chatIn').addEventListener('keydown', e => e.stopPropagation());
CHAT.timer = setInterval(chatLoad, 30000);
setTimeout(chatLoad, 1500);
