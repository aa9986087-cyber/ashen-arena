'use strict';
/* Voice rooms (like Discord): a few open rooms anyone can join from the 🎧 button. Once in a room you stay in it
   wherever you go in the game (menu, a run, co-op, a duel) until you leave; a small bar on the screen's edge shows who
   is talking. Sound goes straight between the players' devices (WebRTC, every member to every member); the Realtime
   channel 'voice' only carries who is in which room (presence) and the set-up messages between two devices.
   A private room has a code: its own channel, named from a hash of the code, carries its members and set-up, and the
   public channel only shows 'priv' for its members (no name, no code) — without the code there is no way in. */
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
  vol: 1, // how loud the others are (all of them), 0..1
  pvol: {}, // how loud each one is (by name), 0..1
  ac: null, // an audio graph, for volume where <audio>.volume is ignored (iPhone)
};
try {
  VC.vol = +(localStorage.getItem('ashen_vc_vol') || 1);
  VC.pvol = JSON.parse(localStorage.getItem('ashen_vc_pvol') || '{}') || {};
} catch (e) {}
// iPhone ignores <audio>.volume: there the sound goes through a gain node instead (only once someone is turned down)
VC.volOk = (() => {
  try {
    const a = document.createElement('audio');
    a.volume = 0.5;
    return Math.abs(a.volume - 0.5) < 0.01;
  } catch (e) {
    return false;
  }
})();
const vcName = () => S.name || 'لاعب';
const vcPriv = id => !!id && id.startsWith('p:');
const vcRoomOf = id =>
  vcPriv(id) ? { id, n: 'غرفتك الخاصة', d: 'برمز' } : VOICE_ROOMS.find(r => r.id === id) || { id, n: '؟', d: '' };
const VC_CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L: easy to read out to a friend
const vcCodeNorm = c =>
  String(c || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
function vcNewCode() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return [...a].map(x => VC_CODE_ABC[x % VC_CODE_ABC.length]).join('');
}
async function vcCodeTag(code) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('#ashen-vc-room:' + code));
  return [...new Uint8Array(b)]
    .slice(0, 12)
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}
/** The members of a room (you among them, first, when you're in it). */
function vcIn(room) {
  const L = vcPriv(room)
    ? VC.priv && VC.room === room
      ? VC.priv.list.slice()
      : []
    : VC.list.filter(p => p.room === room);
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
  const m = VC.mute || !VC.stream ? 1 : 0;
  // the public channel never names a private room
  if (VC.ch && VC.ch.track) VC.ch.track({ n: vcName(), room: vcPriv(VC.room) ? 'priv' : VC.room, m });
  if (VC.priv && VC.priv.ch.track) VC.priv.ch.track({ n: vcName(), m });
}
function vcSend(to, d) {
  const ch = vcPriv(VC.room) ? VC.priv && VC.priv.ch : VC.ch;
  if (ch) ch.send('sig', Object.assign(d, { to, from: myPid(), r: VC.room }));
}

/* ---- joining and leaving */
async function vcJoin(room, code, made) {
  if (!S.name) return askName();
  if (code !== undefined) {
    code = vcCodeNorm(code);
    if (code.length < 4) return toast('🔒 الرمز لازم يكون 4 حروف أو أرقام على الأقل');
    room = 'p:' + (await vcCodeTag(code));
  }
  if (VC.room === room) return;
  if (VC.room) vcLeave(true);
  AU.init();
  try {
    await vcConnect();
  } catch (e) {
    return toast('ما قدرت أتصل بغرف الصوت، تأكد من الإنترنت');
  }
  if (code !== undefined) {
    // the private room's own channel: only someone with the code can name it
    let ch;
    try {
      ch = await netJoin('vcp-' + room.slice(2), { id: myPid(), n: vcName(), m: VC.mute ? 1 : 0 });
    } catch (e) {
      return toast('ما قدرت أفتح الغرفة الخاصة، تأكد من الإنترنت');
    }
    const P = (VC.priv = { ch, code, list: [] });
    try {
      localStorage.setItem('ashen_vc_code', code);
    } catch (e) {}
    ch.on('sig', d => vcSignal(d).catch(e => console.warn('voice', e)));
    ch.onPresence(list => {
      if (VC.priv !== P) return;
      P.list = list.filter(p => p && p.id).map(p => Object.assign({}, p, { room }));
      vcSync();
    });
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
  toast(code !== undefined ? '🔒 دخلت الغرفة الخاصة ' + code : '🎧 دخلت ' + vcRoomOf(room).n);
  // a code typed in that leads to an empty room: maybe a typo (any code opens a room)
  if (code !== undefined && !made)
    setTimeout(() => {
      if (VC.priv && VC.priv.code === code && !VC.priv.list.length)
        toast('🔒 ما فيه أحد بهالغرفة. تأكد من الرمز، أو انتظر خويك يدخل');
    }, 4000);
  vcSync();
}
/** Leave the room (switching: keep the microphone for the next one). */
function vcLeave(switching) {
  if (!VC.room) return;
  for (const id of [...VC.peers.keys()]) vcDrop(id);
  VC.room = null;
  VC.levels.clear();
  if (VC.priv) {
    const ch = VC.priv.ch;
    VC.priv = null;
    try {
      ch.close();
    } catch (e) {}
  }
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
  for (const P of VC.peers.values()) vcOut(P);
  vcDraw();
}
/** Play one member at the volume set for him (everyone's level × his own; 0 when muted or deafened). */
function vcOut(P) {
  const v = VC.deaf || P.muted ? 0 : clamp(VC.vol * (VC.pvol[P.name] ?? 1), 0, 1);
  if (!P.gain && !VC.volOk && v > 0 && v < 0.99 && P.stream) vcGainPath(P);
  if (P.gain) {
    P.gain.gain.value = v;
    P.audio.muted = true;
  } else {
    P.audio.muted = v === 0;
    if (VC.volOk) P.audio.volume = v;
  }
}
function vcGainPath(P) {
  try {
    if (!VC.ac) VC.ac = new (window.AudioContext || window.webkitAudioContext)();
    if (VC.ac.state === 'suspended') VC.ac.resume();
    P.src = VC.ac.createMediaStreamSource(P.stream);
    P.gain = VC.ac.createGain();
    P.src.connect(P.gain).connect(VC.ac.destination);
  } catch (e) {
    P.gain = null;
  }
}
function vcSetVol(v, name) {
  if (name === undefined) VC.vol = v;
  else VC.pvol[name] = v;
  try {
    localStorage.setItem('ashen_vc_vol', VC.vol);
    localStorage.setItem('ashen_vc_pvol', JSON.stringify(VC.pvol));
  } catch (e) {}
  for (const P of VC.peers.values()) if (name === undefined || P.name === name) vcOut(P);
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
  P = {
    id,
    pc,
    audio,
    ice: [],
    muted: false,
    at: performance.now(),
    name: (vcIn(VC.room).find(p => p.id === id) || {}).n,
  };
  if (VC.stream) for (const t of VC.stream.getAudioTracks()) pc.addTrack(t, VC.stream);
  else pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.ontrack = e => {
    P.stream = e.streams[0] || new MediaStream([e.track]);
    audio.srcObject = P.stream;
    vcOut(P);
    audio.play().catch(() => vcNeedTap());
  };
  pc.onicecandidate = e => e.candidate && vcSend(id, { t: 'ice', c: e.candidate.toJSON() });
  // a link that drops for a moment usually comes back by itself: only one that stays down is rebuilt (vcSync)
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (st === 'connected') {
      P.ok = true;
      P.badAt = 0;
    } else if ((st === 'disconnected' || st === 'failed') && !P.badAt) P.badAt = performance.now();
    vcDraw();
  };
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
  try {
    if (P.src) P.src.disconnect();
    if (P.gain) P.gain.disconnect();
  } catch (e) {}
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
        who = vcIn(VC.room).find(p => p.id === id);
      if (P && who && P.name !== who.n) {
        P.name = who.n;
        vcOut(P);
      }
      const now = performance.now(),
        // never got through (no answer to our call in 4 s, or no sound in 10 s), or down for 10 s (a short drop is left to come back on its own)
        stuck =
          P &&
          st !== 'connected' &&
          ((!P.ok && now - P.at > (P.pc.signalingState === 'have-local-offer' ? 4000 : 10000)) ||
            (P.badAt && now - P.badAt > 10000));
      if (myPid() < id && (!P || stuck || st === 'failed')) {
        if (P) vcDrop(id);
        vcCall(id).catch(e => console.warn('voice call', e));
      } else if (P && stuck) vcDrop(id); // the caller will ring again
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
setInterval(() => !document.hidden && vcLevels(), 300);

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
      $('vcBarMic').textContent = VC.mute || !VC.stream ? '🎤' : '🎙️';
      $('vcBarMic').classList.toggle('off', VC.mute || !VC.stream);
    }
  }
  if (!$('voice').hidden) vcPanelDraw();
}
/** Who is talking: a green ring on their pictures, and beside the bar a strip with them (only while they talk). */
function vcTalkDraw() {
  for (const c of document.querySelectorAll('.vcChip[data-id]'))
    c.classList.toggle('talk', !!VC.levels.get(c.dataset.id));
  const bar = $('vcBar');
  if (bar.hidden) return;
  const now = performance.now();
  // keep a speaker shown a moment after he stops, so the strip doesn't flicker between words
  VC.lastTalk = VC.lastTalk || new Map();
  for (const [id, v] of VC.levels) if (v) VC.lastTalk.set(id, now);
  const talking = vcIn(VC.room).filter(p => now - (VC.lastTalk.get(p.id) || -1e9) < 700),
    sig = talking.map(p => p.id).join();
  bar.classList.toggle('live', talking.length > 0);
  if (VC.talkSig === sig) return;
  VC.talkSig = sig;
  const T = $('vcTalk');
  T.innerHTML = '';
  for (const p of talking.slice(0, 2)) {
    const r = el('span', 'vcT');
    const c = vcChip(p);
    c.classList.add('talk');
    r.append(c, el('b', '', p.n));
    T.appendChild(r);
  }
  if (talking.length > 2) T.appendChild(el('span', 'vcT more', '+' + (talking.length - 2)));
  T.classList.toggle('on', talking.length > 0);
}
/** A volume slider (0–100%), with the number beside it. */
function vcSlider(v, on, label) {
  const w = el('label', 'vcVol'),
    r = document.createElement('input'),
    n = el('small', '', Math.round(v * 100) + '%');
  r.type = 'range';
  r.min = 0;
  r.max = 100;
  r.step = 5;
  r.value = Math.round(v * 100);
  r.setAttribute('aria-label', label);
  r.oninput = () => {
    n.textContent = r.value + '%';
    on(r.value / 100);
  };
  // a slider being dragged must not be rebuilt under the finger
  r.onpointerdown = () => (VC.dragging = true);
  r.onpointerup = r.onchange = () => (VC.dragging = false);
  w.append(r, n);
  return w;
}
function vcPanelDraw() {
  const sig =
    VOICE_ROOMS.map(r =>
      vcIn(r.id)
        .map(p => p.id + p.m + p.n)
        .join()
    ).join('|') +
    VC.room +
    (VC.priv ? VC.priv.list.map(p => p.id + p.m + p.n).join() : '') +
    VC.list.filter(p => p.room === 'priv').length +
    VC.mute +
    VC.deaf +
    [...VC.peers.values()].map(P => P.muted + P.pc.connectionState).join();
  if (VC.panelSig === sig || VC.dragging) return;
  VC.panelSig = sig;
  $('vcStatus').textContent = VC.ch
    ? VC.room
      ? 'أنت داخل ' + vcRoomOf(VC.room).n + '. تقدر تطلع للعبة وتظل تسمع وتتكلم.'
      : 'اختر غرفة وادخلها. تظل فيها وأنت تلعب لين تطلع منها.'
    : 'جارٍ الاتصال…';
  const box = $('vcRooms');
  box.innerHTML = '';
  box.appendChild(vcPrivCard());
  for (const r of VOICE_ROOMS) box.appendChild(vcRoomCard(r));
  vcTalkDraw();
}
/** The private room: in it, its card with the code to pass on; outside, make one or enter a code. */
function vcPrivCard() {
  if (vcPriv(VC.room)) {
    const card = vcRoomCard(vcRoomOf(VC.room));
    const codeRow = el('div', 'vcCode');
    codeRow.append(el('span', '', 'الرمز:'), el('b', '', VC.priv.code));
    const cp = el('button', 'btn sm', '📋 انسخ');
    cp.onclick = () => {
      try {
        navigator.clipboard.writeText(VC.priv.code).then(() => toast('📋 انسخ الرمز وأرسله لخويك'));
      } catch (e) {}
    };
    codeRow.appendChild(cp);
    card.insertBefore(codeRow, card.children[1]);
    card.appendChild(el('p', 'note', 'محد يقدر يدخل إلا اللي تعطيه الرمز، والغرفة ما تطلع بالقائمة لأحد.'));
    return card;
  }
  const card = el('div', 'vcRoom priv');
  const top = el('div', 'vcRoomTop');
  top.append(el('b', '', '🔒 غرفة خاصة'), el('small', '', 'برمز، محد يدخلها إلا اللي معه الرمز'));
  card.appendChild(top);
  const mk = el('button', 'btn sm go', '➕ سوّ غرفة خاصة');
  mk.onclick = () => vcJoin(null, vcNewCode(), true);
  const form = el('form', 'vcJoinCode'),
    inp = document.createElement('input');
  inp.id = 'vcCodeIn';
  inp.placeholder = 'اكتب الرمز';
  inp.autocomplete = 'off';
  inp.maxLength = 12;
  inp.dir = 'ltr';
  try {
    inp.value = localStorage.getItem('ashen_vc_code') || '';
  } catch (e) {}
  inp.addEventListener('keydown', e => e.stopPropagation()); // typing must not move the hero
  const go = el('button', 'btn sm', '🔑 ادخل');
  go.type = 'submit';
  form.onsubmit = e => {
    e.preventDefault();
    vcJoin(null, inp.value);
  };
  form.append(inp, go);
  card.append(mk, form);
  const hidden = VC.list.filter(p => p.room === 'priv').length;
  if (hidden) card.appendChild(el('p', 'note', hidden + ' لاعب الحين بغرف خاصة'));
  return card;
}
/** One room's card: its members (with volume and mute for each) and, when you're in it, your controls. */
function vcRoomCard(r) {
  {
    const ppl = vcIn(r.id),
      here = VC.room === r.id,
      card = el('div', 'vcRoom' + (here ? ' here' : '') + (vcPriv(r.id) ? ' priv' : ''));
    const top = el('div', 'vcRoomTop');
    top.append(el('b', '', (vcPriv(r.id) ? '🔒 ' : '🎧 ') + r.n), el('small', '', r.d + ' · ' + ppl.length));
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
          // how loud he is for you (saved by his name), and mute him
          row.appendChild(vcSlider(VC.pvol[p.n] ?? 1, v => vcSetVol(v, p.n), 'صوت ' + p.n));
          const mu = el('button', 'iconBtn sm' + (P && P.muted ? ' on' : ''), P && P.muted ? '🔇' : '🔊');
          mu.setAttribute('aria-label', 'اكتم صوته عندك');
          mu.onclick = () => {
            const Q = VC.peers.get(p.id);
            if (!Q) return;
            Q.muted = !Q.muted;
            vcOut(Q);
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
      // everyone's volume at once
      const vr = el('div', 'vcVolAll');
      vr.append(
        el('span', '', '🔊 صوت المتكلمين'),
        vcSlider(VC.vol, v => vcSetVol(v), 'صوت المتكلمين')
      );
      card.appendChild(vr);
    }
    return card;
  }
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
