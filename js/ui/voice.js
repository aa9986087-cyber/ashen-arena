'use strict';
/* Voice rooms (like Discord): a few open rooms anyone can join from the 🎧 button. Once in a room you stay in it
   wherever you go in the game (menu, a run, co-op, a duel) until you leave; a small bar on the screen's edge shows who
   is talking. Sound goes straight between the players' devices (WebRTC, every member to every member); the Realtime
   channel 'voice' only carries who is in which room (presence) and the set-up messages between two devices. */
const VOICE_ROOMS = [
  { id: 'diwan', n: 'الديوانية', d: 'سوالف عامة' },
  { id: 'arena', n: 'ساحة المعارك', d: 'للمبارزة والملحمة' },
  { id: 'coop', n: 'غرفة التعاون', d: 'نسّقوا ضد الوحوش' },
  { id: 'night', n: 'السهرة', d: 'للسهارى' },
];
const VC_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const VC = {
  ch: null,
  connecting: null,
  list: [], // everyone on the channel (presence): {id, n, room, m}
  room: null,
  stream: null, // our microphone (null: listening only)
  mute: false,
  deaf: false,
  peers: new Map(), // id -> {pc, audio, ice: [], muted, level, at}
  levels: new Map(), // id -> how loud right now (0..1)
  sig: '',
};
const vcName = () => S.name || 'لاعب';
const vcRoomOf = id => VOICE_ROOMS.find(r => r.id === id);
/** The members of a room (you among them, first, when you're in it). */
function vcIn(room) {
  const L = VC.list.filter(p => p.room === room);
  if (VC.room === room) L.unshift({ id: myPid(), n: vcName(), room, m: VC.mute || !VC.stream ? 1 : 0 });
  return L;
}

/* ---- the channel */
function vcConnect() {
  if (VC.ch) return Promise.resolve(VC.ch);
  if (VC.connecting) return VC.connecting;
  VC.connecting = netJoin('voice', { id: myPid(), n: vcName(), room: VC.room, m: VC.mute ? 1 : 0 })
    .then(ch => {
      VC.ch = ch;
      ch.on('sig', d => vcSignal(d).catch(e => console.warn('voice', e)));
      ch.onPresence(list => {
        VC.list = list.filter(p => p && p.id);
        vcSync();
      });
      return ch;
    })
    .catch(e => {
      VC.connecting = null;
      throw e;
    });
  return VC.connecting;
}
function vcTrack() {
  if (VC.ch && VC.ch.track) VC.ch.track({ n: vcName(), room: VC.room, m: VC.mute || !VC.stream ? 1 : 0 });
}
function vcSend(to, d) {
  if (VC.ch) VC.ch.send('sig', Object.assign(d, { to, from: myPid(), r: VC.room }));
}

/* ---- joining and leaving */
async function vcJoin(room) {
  if (!S.name) return askName();
  if (VC.room === room) return;
  if (VC.room) vcLeave(true);
  AU.init();
  try {
    await vcConnect();
  } catch (e) {
    return toast('ما قدرت أتصل بغرف الصوت، تأكد من الإنترنت');
  }
  // the microphone; without it you can still listen
  if (!VC.stream && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      VC.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      toast('🎤 ما سمحت بالمايك: تقدر تسمع بس. اسمح للمايك من إعدادات المتصفح وادخل من جديد عشان يسمعونك');
    }
  }
  if (VC.stream) for (const t of VC.stream.getAudioTracks()) t.enabled = !VC.mute;
  VC.room = room;
  vcTrack();
  AU.play('select');
  toast('🎧 دخلت ' + vcRoomOf(room).n);
  vcSync();
}
/** Leave the room (switching: keep the microphone for the next one). */
function vcLeave(switching) {
  if (!VC.room) return;
  for (const id of [...VC.peers.keys()]) vcDrop(id);
  VC.room = null;
  VC.levels.clear();
  if (!switching && VC.stream) {
    for (const t of VC.stream.getTracks()) t.stop();
    VC.stream = null;
  }
  vcTrack();
  if (!switching) toast('🚪 طلعت من غرفة الصوت');
  vcDraw();
}
function vcSetMute(on) {
  if (!VC.stream) return toast('🎤 المايك مو مسموح: اسمح له من إعدادات المتصفح وادخل الغرفة من جديد');
  VC.mute = on;
  for (const t of VC.stream.getAudioTracks()) t.enabled = !on;
  vcTrack();
  vcDraw();
}
function vcSetDeaf(on) {
  VC.deaf = on;
  for (const P of VC.peers.values()) P.audio.muted = on || P.muted;
  vcDraw();
}

/* ---- one link per member */
function vcPeer(id) {
  let P = VC.peers.get(id);
  if (P) return P;
  const pc = new RTCPeerConnection({ iceServers: VC_ICE }),
    audio = document.createElement('audio');
  audio.autoplay = true;
  audio.playsInline = true;
  audio.className = 'vcAudio';
  document.body.appendChild(audio);
  P = { id, pc, audio, ice: [], muted: false, at: performance.now() };
  if (VC.stream) for (const t of VC.stream.getAudioTracks()) pc.addTrack(t, VC.stream);
  else pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.ontrack = e => {
    audio.srcObject = e.streams[0] || new MediaStream([e.track]);
    audio.muted = VC.deaf || P.muted;
    audio.play().catch(() => vcNeedTap());
  };
  pc.onicecandidate = e => e.candidate && vcSend(id, { t: 'ice', c: e.candidate.toJSON() });
  pc.onconnectionstatechange = () => vcDraw();
  VC.peers.set(id, P);
  return P;
}
function vcDrop(id) {
  const P = VC.peers.get(id);
  if (!P) return;
  VC.peers.delete(id);
  try {
    P.pc.close();
  } catch (e) {}
  P.audio.srcObject = null;
  P.audio.remove();
  VC.levels.delete(id);
}
/** The member with the smaller id calls; the other answers (so two calls never cross). */
async function vcCall(id) {
  const P = vcPeer(id);
  P.at = performance.now();
  const o = await P.pc.createOffer();
  await P.pc.setLocalDescription(o);
  vcSend(id, { t: 'offer', s: { type: o.type, sdp: o.sdp } });
}
async function vcSignal(d) {
  if (!d || d.to !== myPid() || !VC.room || d.r !== VC.room) return;
  const id = d.from;
  if (d.t === 'offer') {
    let P = VC.peers.get(id);
    if (P && P.pc.signalingState !== 'stable') {
      if (myPid() < id) return; // we are the caller: ours stands
      vcDrop(id);
      P = null;
    }
    // a new offer from someone we already had a link with (he restarted): start over
    if (P && P.pc.remoteDescription) {
      vcDrop(id);
      P = null;
    }
    P = P || vcPeer(id);
    await P.pc.setRemoteDescription(d.s);
    for (const c of P.ice.splice(0)) await P.pc.addIceCandidate(c).catch(() => {});
    const a = await P.pc.createAnswer();
    await P.pc.setLocalDescription(a);
    vcSend(id, { t: 'answer', s: { type: a.type, sdp: a.sdp } });
  } else if (d.t === 'answer') {
    const P = VC.peers.get(id);
    if (!P || P.pc.signalingState !== 'have-local-offer') return;
    await P.pc.setRemoteDescription(d.s);
    for (const c of P.ice.splice(0)) await P.pc.addIceCandidate(c).catch(() => {});
  } else if (d.t === 'ice') {
    const P = VC.peers.get(id) || vcPeer(id);
    if (P.pc.remoteDescription) await P.pc.addIceCandidate(d.c).catch(() => {});
    else P.ice.push(d.c);
  }
}
/** Match the links to the room's members: call the new ones, drop those who left, retry the stuck ones. */
function vcSync() {
  if (VC.room) {
    const here = new Set(vcIn(VC.room).map(p => p.id));
    for (const id of [...VC.peers.keys()]) if (!here.has(id)) vcDrop(id);
    for (const id of here) {
      if (id === myPid()) continue;
      const P = VC.peers.get(id),
        st = P && P.pc.connectionState,
        stuck = P && st !== 'connected' && performance.now() - P.at > 9000;
      if (myPid() < id && (!P || stuck || st === 'failed')) {
        if (P) vcDrop(id);
        vcCall(id).catch(e => console.warn('voice call', e));
      } else if (P && stuck && st === 'failed') vcDrop(id); // the caller will ring again
    }
  }
  vcDraw();
}
setInterval(() => VC.room && vcSync(), 3000);
// iPhone: a sound that couldn't start on its own starts with the next tap
function vcNeedTap() {
  if (VC.tapWait) return;
  VC.tapWait = true;
  addEventListener(
    'pointerdown',
    () => {
      VC.tapWait = false;
      for (const P of VC.peers.values()) P.audio.play().catch(() => {});
    },
    { once: true, capture: true }
  );
}

/* ---- who is talking: the loudness each link reports, 4 times a second */
async function vcLevels() {
  if (!VC.room) return;
  const loud = v => (v > 0.035 ? 1 : 0);
  for (const [id, P] of VC.peers) {
    try {
      let lv = 0;
      (await P.pc.getStats()).forEach(r => {
        if ((r.type === 'inbound-rtp' || r.type === 'track') && r.kind === 'audio' && r.audioLevel !== undefined)
          lv = Math.max(lv, r.audioLevel);
      });
      VC.levels.set(id, P.muted || VC.deaf ? 0 : loud(lv));
    } catch (e) {}
  }
  // ours: from any link that sends it
  let me = 0;
  if (VC.stream && !VC.mute)
    for (const P of VC.peers.values()) {
      try {
        (await P.pc.getStats()).forEach(r => {
          if (r.type === 'media-source' && r.kind === 'audio' && r.audioLevel !== undefined)
            me = Math.max(me, r.audioLevel);
        });
        break;
      } catch (e) {}
    }
  VC.levels.set(myPid(), loud(me));
  vcTalkDraw();
}
setInterval(vcLevels, 250);

/* ---- the screens: the bar on the edge (while in a room) and the rooms panel */
function vcChip(p) {
  const c = el('i', 'vcChip');
  c.dataset.id = p.id;
  const src = avatarOf(p.n);
  if (src) c.style.backgroundImage = 'url("' + src + '")';
  else c.textContent = [...String(p.n || '?')][0];
  if (p.m) c.appendChild(el('b', 'vcMuted', '🎤'));
  return c;
}
function vcDraw() {
  const mine = VC.room ? vcIn(VC.room) : [],
    total = VC.list.filter(p => p.room).length + (VC.room ? 1 : 0);
  // the 🎧 button in the menu: how many are talking in the rooms
  const badge = $('voiceBadge');
  badge.hidden = !total;
  badge.textContent = total > 99 ? '99+' : total;
  $('mVoice').classList.toggle('on', !!VC.room);
  // the bar
  const bar = $('vcBar');
  bar.hidden = !VC.room;
  if (VC.room) {
    const sig = VC.room + '|' + mine.map(p => p.id + p.m + p.n).join() + VC.mute + VC.deaf + !!VC.stream;
    if (bar.dataset.sig !== sig) {
      bar.dataset.sig = sig;
      const rb = $('vcBarRoom');
      rb.innerHTML = icon('🎧');
      rb.appendChild(el('b', '', mine.length));
      rb.title = vcRoomOf(VC.room).n;
      const L = $('vcBarList');
      L.innerHTML = '';
      for (const p of mine.slice(0, 4)) L.appendChild(vcChip(p));
      if (mine.length > 4) L.appendChild(el('i', 'vcChip more', '+' + (mine.length - 4)));
      $('vcBarMic').textContent = VC.mute || !VC.stream ? '🎤' : '🎙️';
      $('vcBarMic').classList.toggle('off', VC.mute || !VC.stream);
    }
  }
  if (!$('voice').hidden) vcPanelDraw();
}
function vcTalkDraw() {
  for (const c of document.querySelectorAll('.vcChip[data-id]'))
    c.classList.toggle('talk', !!VC.levels.get(c.dataset.id));
}
function vcPanelDraw() {
  const sig =
    VOICE_ROOMS.map(r =>
      vcIn(r.id)
        .map(p => p.id + p.m + p.n)
        .join()
    ).join('|') +
    VC.room +
    VC.mute +
    VC.deaf +
    [...VC.peers.values()].map(P => P.muted + P.pc.connectionState).join();
  if (VC.panelSig === sig) return;
  VC.panelSig = sig;
  $('vcStatus').textContent = VC.ch
    ? VC.room
      ? 'أنت داخل ' + vcRoomOf(VC.room).n + '. تقدر تطلع للعبة وتظل تسمع وتتكلم.'
      : 'اختر غرفة وادخلها. تظل فيها وأنت تلعب لين تطلع منها.'
    : 'جارٍ الاتصال…';
  const box = $('vcRooms');
  box.innerHTML = '';
  for (const r of VOICE_ROOMS) {
    const ppl = vcIn(r.id),
      here = VC.room === r.id,
      card = el('div', 'vcRoom' + (here ? ' here' : ''));
    const top = el('div', 'vcRoomTop');
    top.append(el('b', '', '🎧 ' + r.n), el('small', '', r.d + ' · ' + ppl.length));
    if (!here) {
      const go = el('button', 'btn sm go', VC.room ? 'انتقل لها' : 'ادخل');
      go.onclick = () => vcJoin(r.id);
      top.appendChild(go);
    }
    card.appendChild(top);
    if (ppl.length) {
      const L = el('div', 'vcPeople');
      for (const p of ppl) {
        const row = el('div', 'vcP');
        row.append(vcChip(p), el('span', '', p.n + (p.id === myPid() ? ' (أنت)' : '')));
        const P = VC.peers.get(p.id);
        if (here && p.id !== myPid()) {
          if (P && P.pc.connectionState !== 'connected')
            row.appendChild(el('small', 'vcWait', P.pc.connectionState === 'failed' ? 'ما وصل الصوت' : 'يتصل…'));
          const mu = el('button', 'iconBtn sm' + (P && P.muted ? ' on' : ''), P && P.muted ? '🔇' : '🔊');
          mu.setAttribute('aria-label', 'اكتم صوته عندك');
          mu.onclick = () => {
            const Q = VC.peers.get(p.id);
            if (!Q) return;
            Q.muted = !Q.muted;
            Q.audio.muted = Q.muted || VC.deaf;
            vcDraw();
          };
          row.appendChild(mu);
        }
        L.appendChild(row);
      }
      card.appendChild(L);
    } else card.appendChild(el('p', 'note', 'فاضية'));
    if (here) {
      const ctl = el('div', 'vcCtl'),
        mic = el(
          'button',
          'btn sm' + (VC.mute || !VC.stream ? '' : ' go'),
          VC.mute || !VC.stream ? '🎤 المايك مقفل' : '🎙️ المايك شغال'
        ),
        deaf = el('button', 'btn sm', VC.deaf ? '🔇 الصوت مكتوم' : '🔊 تسمعهم'),
        out = el('button', 'btn sm', '🚪 اطلع');
      mic.onclick = () => vcSetMute(!VC.mute);
      deaf.onclick = () => vcSetDeaf(!VC.deaf);
      out.onclick = () => vcLeave();
      ctl.append(mic, deaf, out);
      card.appendChild(ctl);
    }
    box.appendChild(card);
  }
  vcTalkDraw();
}
/** The rooms panel: over whatever is on screen (a solo run pauses behind it). */
function vcOpen() {
  AU.init();
  AU.play('select');
  if (!COOP.on && G.state === 'play') pause(true);
  $('voice').hidden = false;
  VC.panelSig = '';
  vcPanelDraw();
  vcConnect()
    .then(() => vcPanelDraw())
    .catch(() => ($('vcStatus').textContent = 'ما قدرت أتصل بغرف الصوت، تأكد من الإنترنت'));
}
$('mVoice').onclick = vcOpen;
$('vcBarRoom').onclick = vcOpen;
$('vcBarMic').onclick = e => {
  e.stopPropagation();
  vcSetMute(!VC.mute);
};
$('vcClose').onclick = () => ($('voice').hidden = true);
$('voice').onclick = e => {
  if (e.target.id === 'voice') $('voice').hidden = true;
};
// the name you go by: tell the room when it changes
setInterval(() => {
  const me = VC.list.length && VC.ch ? vcName() : '';
  if (me && VC.lastName !== me) {
    VC.lastName = me;
    if (VC.room) vcTrack();
  }
}, 2000);
addEventListener('pagehide', () => {
  for (const id of [...VC.peers.keys()]) vcDrop(id);
});
// connect a little after start, so the 🎧 button shows how many are talking (local test pages skip it)
setTimeout(() => !NET_LOCAL && vcConnect().catch(() => {}), 6000);
