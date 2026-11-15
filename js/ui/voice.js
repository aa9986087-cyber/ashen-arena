'use strict';
/* Voice rooms (like Discord): a few open rooms anyone can join from the 🎧 button. Once in a room you stay in it
   wherever you go in the game (menu, a run, co-op, a duel) until you leave; a small bar on the screen's edge shows who
   is talking. Sound goes straight between the players' devices (WebRTC, every member to every member); the Realtime
   channel 'voice' only carries who is in which room and the set-up messages between two devices.
   A private room has a code: its own channel, named from a hash of the code, carries its members and set-up, and the
   public channel only shows 'priv' for its members (no name, no code) — without the code there is no way in.
   Who is where travels as plain messages ('vst': on a change and every 5 s), not as Realtime presence: presence
   updates are rate-limited hard, and a refused one ("I'm in this room now") left a player invisible to his own room. */
const VOICE_ROOMS = [
  { id: 'diwan', n: 'الديوانية', d: 'سوالف عامة' },
  { id: 'arena', n: 'ساحة المعارك', d: 'للمبارزة والملحمة' },
  { id: 'coop', n: 'غرفة التعاون', d: 'نسّقوا ضد الوحوش' },
  { id: 'night', n: 'السهرة', d: 'للسهارى' },
];
// STUN finds a direct way between two devices; when a network won't allow one (some mobile carriers), the public
// Open Relay TURN server carries the sound instead
const VC_ICE = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];
const VC_MAX = 8; // people in one room
const VC_BEAT = 5000, // say where we are this often
  VC_GONE = 14000; // not heard from for this long: gone
const VC = {
  ch: null,
  connecting: null,
  list: [], // everyone heard from on the channel: {id, n, room, m}
  seen: new Map(), // id -> {id, n, room, m, t}
  left: new Map(), // id -> when he said goodbye
  beatT: 0,
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
/** A player told us where he is: true when that changed something. */
function vcHeard(map, d) {
  if (!d || !d.id || d.id === myPid()) return false;
  VC.left.delete(d.id); // heard again: back
  const old = map.get(d.id);
  map.set(d.id, { id: d.id, n: d.n || 'لاعب', room: d.room || null, m: d.m ? 1 : 0, t: Date.now() });
  return !old || old.room !== (d.room || null) || old.m !== (d.m ? 1 : 0) || old.n !== d.n;
}
/** Rebuild the lists from what we've heard (dropping the silent). */
function vcLists() {
  const now = Date.now();
  for (const M of [VC.seen, VC.priv && VC.priv.seen])
    if (M) for (const [id, p] of M) if (now - p.t > VC_GONE) M.delete(id);
  VC.list = [...VC.seen.values()];
  if (VC.priv) VC.priv.list = [...VC.priv.seen.values()].map(p => Object.assign({}, p, { room: VC.room }));
}
/** Listen on a channel for where the players are; `map` holds them. */
function vcListen(ch, map, isPriv) {
  ch.on('sig', d => vcSignal(d).catch(e => console.warn('voice', e)));
  ch.on('vst', d => {
    if (vcHeard(map, d)) {
      vcLists();
      vcSync();
    }
  });
  ch.on('vbye', d => {
    if (d && d.id) VC.left.set(d.id, Date.now());
    if (d && map.delete(d.id)) {
      vcLists();
      vcSync();
    }
  });
  // a newcomer asks: everyone answers (spread out a little)
  ch.on('vask', () => setTimeout(() => vcBeat(isPriv ? 'priv' : 'pub'), Math.random() * 600));
}
function vcConnect() {
  if (VC.ch) return Promise.resolve(VC.ch);
  if (VC.connecting) return VC.connecting;
  VC.connecting = netJoin('voice')
    .then(ch => {
      VC.ch = ch;
      vcListen(ch, VC.seen, false);
      ch.on('inv', vcInvited);
      ch.send('vask', {});
      vcBeat('pub');
      return ch;
    })
    .catch(e => {
      VC.connecting = null;
      throw e;
    });
  return VC.connecting;
}
/** Say where we are (the public channel never names a private room). */
function vcBeat(which) {
  const m = VC.mute || !VC.stream ? 1 : 0,
    me = { id: myPid(), n: vcName(), m };
  if (VC.ch && which !== 'priv') VC.ch.send('vst', Object.assign({ room: vcPriv(VC.room) ? 'priv' : VC.room }, me));
  if (VC.priv && which !== 'pub') VC.priv.ch.send('vst', Object.assign({ room: VC.room }, me));
  VC.beatT = Date.now();
}
const vcTrack = () => vcBeat();
setInterval(() => {
  if (!VC.ch) return;
  const before = VC.list.length + (VC.priv ? VC.priv.list.length : 0);
  vcLists();
  if (Date.now() - VC.beatT > VC_BEAT) vcBeat();
  if (VC.list.length + (VC.priv ? VC.priv.list.length : 0) !== before) vcSync();
}, 1000);
function vcSend(to, d) {
  const ch = vcPriv(VC.room) ? VC.priv && VC.priv.ch : VC.ch;
  if (ch) ch.send('sig', Object.assign(d, { to, from: myPid(), r: VC.room }));
}

/* ---- joining and leaving */
async function vcJoin(room, code, made) {
  if (!S.name) return askName();
  vcAC(); // still inside the tap that asked to join: the audio graph may start now
  if (code !== undefined) {
    code = vcCodeNorm(code);
    if (code.length < 4) return toast('🔒 الرمز لازم يكون 4 حروف أو أرقام على الأقل');
    room = 'p:' + (await vcCodeTag(code));
  }
  if (VC.room === room) return;
  if (!vcPriv(room) && vcIn(room).length >= VC_MAX)
    return toast('🎧 الغرفة مليانة (' + VC_MAX + ' أشخاص). جرّب غرفة ثانية');
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
      ch = await netJoin('vcp-' + room.slice(2));
    } catch (e) {
      return toast('ما قدرت أفتح الغرفة الخاصة، تأكد من الإنترنت');
    }
    const P = (VC.priv = { ch, code, list: [], seen: new Map() });
    try {
      localStorage.setItem('ashen_vc_code', code);
    } catch (e) {}
    vcListen(ch, P.seen, true);
    ch.send('vask', {});
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
  if (code !== undefined)
    setTimeout(() => {
      if (VC.priv && VC.priv.code === code && VC.priv.list.length >= VC_MAX) {
        vcLeave();
        toast('🔒 الغرفة الخاصة مليانة (' + VC_MAX + ' أشخاص)');
      }
    }, 1800);
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
      ch.send('vbye', { id: myPid() });
    } catch (e) {}
    setTimeout(() => ch.close(), 300);
  }
  if (!switching && VC.stream) {
    for (const t of VC.stream.getTracks()) t.stop();
    VC.stream = null;
    vcMeterStop();
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
/** The audio graph for the meter and the volume: the game's own (already started by a tap). A browser keeps an
    audio graph made outside a tap stopped, so any tap restarts it if it is. */
function vcAC() {
  try {
    if (!VC.ac) {
      AU.init();
      const C = window.AudioContext || window.webkitAudioContext;
      VC.ac = AU.ctx || (C ? new C() : null);
    }
    if (VC.ac && VC.ac.state !== 'running') VC.ac.resume().catch(() => {});
  } catch (e) {}
  return VC.ac; // null where the browser has no audio graph: the meter stays still, the rest works
}
for (const ev of ['pointerdown', 'touchend', 'keydown'])
  addEventListener(ev, () => VC.ac && VC.ac.state !== 'running' && VC.ac.resume().catch(() => {}), true);
function vcGainPath(P) {
  try {
    if (!vcAC()) throw new Error('no audio graph');
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
    seen: performance.now(),
    out: [], // our candidates waiting to go (sent in batches: 8 people make 28 links, one message each would choke)
    hold: false,
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
  pc.onicecandidate = e => {
    if (!e.candidate || P.hold) return; // while held, the offer/answer about to go already carries them
    P.out.push(e.candidate.toJSON());
    if (!P.outT)
      P.outT = setTimeout(() => {
        P.outT = 0;
        if (P.out.length && VC.peers.get(id) === P) vcSend(id, { t: 'ice', cs: P.out.splice(0) });
      }, 250);
  };
  // a link that drops for a moment usually comes back by itself: only one that stays down is rebuilt (vcSync)
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (st === 'connected') {
      P.ok = true;
      P.badAt = 0;
      vcBitrate(P);
    } else if ((st === 'disconnected' || st === 'failed') && !P.badAt) P.badAt = performance.now();
    vcDraw();
  };
  VC.peers.set(id, P);
  return P;
}
/** Speech needs little: capped, so a phone can send to 7 others at once. */
function vcBitrate(P) {
  try {
    for (const snd of P.pc.getSenders()) {
      if (!snd.track || snd.track.kind !== 'audio') continue;
      const prm = snd.getParameters();
      if (!prm.encodings || !prm.encodings.length) prm.encodings = [{}];
      prm.encodings[0].maxBitrate = vcIn(VC.room).length > 4 ? 28000 : 40000;
      snd.setParameters(prm).catch(() => {});
    }
  } catch (e) {}
}
/** Wait (up to `ms`) for our network addresses, so the offer/answer carries them all in one message. */
function vcGather(pc, ms) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(ok => {
    const t = setTimeout(ok, ms);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(t);
        ok();
      }
    });
  });
}
function vcDrop(id) {
  const P = VC.peers.get(id);
  if (!P) return;
  VC.peers.delete(id);
  try {
    P.pc.close();
  } catch (e) {}
  clearTimeout(P.outT);
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
  P.hold = true;
  await P.pc.setLocalDescription(await P.pc.createOffer());
  await vcGather(P.pc, 1500);
  P.hold = false;
  if (VC.peers.get(id) !== P) return;
  const o = P.pc.localDescription;
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
    P.hold = true;
    await P.pc.setLocalDescription(await P.pc.createAnswer());
    await vcGather(P.pc, 1500);
    P.hold = false;
    if (VC.peers.get(id) !== P) return;
    const a = P.pc.localDescription;
    vcSend(id, { t: 'answer', s: { type: a.type, sdp: a.sdp } });
  } else if (d.t === 'answer') {
    const P = VC.peers.get(id);
    if (!P || P.pc.signalingState !== 'have-local-offer') return;
    await P.pc.setRemoteDescription(d.s);
    for (const c of P.ice.splice(0)) await P.pc.addIceCandidate(c).catch(() => {});
  } else if (d.t === 'ice') {
    const P = VC.peers.get(id) || vcPeer(id);
    for (const c of d.cs || [d.c]) {
      if (!c) continue;
      if (P.pc.remoteDescription) await P.pc.addIceCandidate(c).catch(() => {});
      else P.ice.push(c);
    }
  }
}
/** Match the links to the room's members: call the new ones, drop those who left, retry the stuck ones. */
function vcSync() {
  if (VC.room) {
    const here = new Set(vcIn(VC.room).map(p => p.id)),
      now0 = performance.now();
    // someone not heard from: his link goes, unless the sound still flows (a late message isn't a goodbye) — only
    // a real goodbye, or 45 s of silence, ends a working link
    for (const [id, P] of [...VC.peers])
      if (here.has(id)) P.seen = now0;
      else if (VC.left.has(id) || P.pc.connectionState !== 'connected' || now0 - P.seen > 45000) vcDrop(id);
    let calls = 0;
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
          ((!P.ok && now - P.at > (P.pc.signalingState === 'have-local-offer' ? 6000 : 10000)) ||
            (P.badAt && now - P.badAt > 10000));
      if (myPid() < id && (!P || stuck || st === 'failed')) {
        if (P) vcDrop(id);
        // a few at a time, not all 7 in the same instant
        vcPeer(id).at = now;
        setTimeout(() => VC.room && vcCall(id).catch(e => console.warn('voice call', e)), calls++ * 220);
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
  // ours: straight from the microphone (so it shows even alone in the room)
  VC.levels.set(myPid(), VC.stream && !VC.mute && vcMicLevel() > 0.02 ? 1 : 0);
  vcTalkDraw();
}
setInterval(() => !document.hidden && vcLevels(), 450);

/* ---- the microphone test: a live meter, and record 3 s then hear yourself */
function vcMeterSetup() {
  if (!VC.stream || VC.anFor === VC.stream) return;
  vcMeterStop();
  // a copy of the microphone: it keeps listening while you're muted to the others (the recording uses it too, so
  // it is made even where the meter can't be)
  VC.test = VC.stream.clone();
  VC.anFor = VC.stream;
  try {
    if (!vcAC()) throw new Error('no audio graph');
    VC.anSrc = VC.ac.createMediaStreamSource(VC.test);
    VC.an = VC.ac.createAnalyser();
    VC.an.fftSize = 512;
    VC.anSrc.connect(VC.an);
    VC.anBuf = new Float32Array(VC.an.fftSize);
  } catch (e) {
    VC.an = null;
  }
}
function vcMeterStop() {
  try {
    if (VC.anSrc) VC.anSrc.disconnect();
    if (VC.test) for (const t of VC.test.getTracks()) t.stop();
  } catch (e) {}
  VC.an = VC.anSrc = VC.test = VC.anFor = null;
}
/** How loud the microphone is right now (0..1, RMS). */
function vcMicLevel() {
  vcMeterSetup();
  if (!VC.an) return 0;
  VC.an.getFloatTimeDomainData(VC.anBuf);
  let s = 0;
  for (const v of VC.anBuf) s += v * v;
  return Math.sqrt(s / VC.anBuf.length);
}
function vcMeterLoop() {
  const bar = document.getElementById('vcMeterI');
  if (!bar || $('voice').hidden) return (VC.meterOn = false);
  const db = 20 * Math.log10(vcMicLevel() + 1e-6); // -60 dB (silence) .. -10 dB (shouting)
  bar.style.width = clamp((db + 60) / 50, 0, 1) * 100 + '%';
  requestAnimationFrame(vcMeterLoop);
}
/** The record button's text (kept, so a panel redrawn meanwhile shows the same). */
function vcRecState(t) {
  VC.recText = t;
  const b = document.getElementById('vcRec');
  if (b) {
    b.textContent = t || '🎙️ سجّل ٣ ثواني واسمع';
    b.disabled = !!VC.recording;
  }
}
async function vcRecordTest() {
  vcMeterSetup();
  if (!VC.test || typeof MediaRecorder === 'undefined')
    return toast('🎙️ جهازك ما يدعم التسجيل، بس شريط المايك يبين إذا صوتك واصل');
  if (VC.recording) return;
  VC.recording = true;
  let rec;
  try {
    rec = new MediaRecorder(VC.test);
  } catch (e) {
    VC.recording = false;
    return toast('🎙️ ما قدرت أسجل على جهازك');
  }
  const parts = [],
    done = () => {
      VC.recording = false;
      vcRecState('');
    };
  rec.ondataavailable = e => e.data && e.data.size && parts.push(e.data);
  rec.onstop = () => {
    if (!parts.length) return done();
    const url = URL.createObjectURL(new Blob(parts, { type: rec.mimeType || 'audio/webm' })),
      a = new Audio(url);
    vcRecState('🔊 تسمع صوتك…');
    a.onended = a.onerror = () => {
      URL.revokeObjectURL(url);
      done();
    };
    a.play().catch(a.onended);
  };
  rec.start();
  for (let i = 3; i > 0; i--) {
    vcRecState('🔴 تكلّم… ' + i);
    await new Promise(r => setTimeout(r, 1000));
  }
  rec.stop();
}
function vcTestCard(alone) {
  const box = el('div', 'vcTest');
  box.appendChild(el('b', '', alone ? '🎙️ أنت لحالك بالغرفة: جرّب مايكك' : '🎙️ جرّب مايكك'));
  if (!VC.stream) {
    box.appendChild(el('p', 'note', 'المايك مو مسموح. اسمح له من إعدادات المتصفح وادخل الغرفة من جديد.'));
    return box;
  }
  const meter = el('div', 'vcMeter');
  meter.appendChild(el('i', ''));
  meter.firstChild.id = 'vcMeterI';
  const rec = el('button', 'btn sm', VC.recText || '🎙️ سجّل ٣ ثواني واسمع');
  rec.id = 'vcRec';
  rec.disabled = !!VC.recording;
  rec.onclick = () => {
    vcAC();
    vcRecordTest();
  };
  box.append(el('small', '', 'تكلّم: الشريط يتحرك مع صوتك'), meter, rec);
  if (VC.mute) box.appendChild(el('small', 'vcWarn', 'مايكك مقفل: الشريط شغال للتجربة بس، وهم ما يسمعونك'));
  if (!VC.meterOn) {
    VC.meterOn = true;
    requestAnimationFrame(vcMeterLoop);
  }
  return box;
}

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
    last = talking.slice().sort((a, b) => (VC.lastTalk.get(b.id) || 0) - (VC.lastTalk.get(a.id) || 0))[0],
    sig =
      talking
        .map(p => p.id)
        .sort()
        .join() +
      '|' +
      (last ? last.id : '');
  bar.classList.toggle('live', talking.length > 0);
  if (VC.talkSig === sig) return;
  VC.talkSig = sig;
  const T = $('vcTalk');
  T.innerHTML = '';
  // one face (whoever spoke last), the others as a number on it: the bar stays short
  if (last) {
    const r = el('span', 'vcT'),
      c = vcChip(last);
    c.classList.add('talk');
    if (talking.length > 1) c.appendChild(el('em', 'vcMore', '+' + (talking.length - 1)));
    r.append(c, el('b', '', last.n));
    T.appendChild(r);
  }
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
  let sig =
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
  sig += VC.testOpen ? 't' : '';
  sig += VC.inviting ? '|inv' + VC.list.map(p => p.id + p.n + p.room).join() + Object.keys(VC.sent || {}).join() : '';
  if (VC.panelSig === sig || VC.dragging) return;
  VC.panelSig = sig;
  $('vcStatus').textContent = VC.ch
    ? VC.room
      ? 'أنت داخل ' + vcRoomOf(VC.room).n + '. تقدر تطلع للعبة وتظل تسمع وتتكلم.'
      : 'اختر غرفة وادخلها. تظل فيها وأنت تلعب لين تطلع منها.'
    : 'جارٍ الاتصال…';
  const box = $('vcRooms');
  box.innerHTML = '';
  // the room you're in first (its controls and the microphone test), then a private room, then the others
  const cur = VOICE_ROOMS.find(r => r.id === VC.room);
  if (cur) box.appendChild(vcRoomCard(cur));
  box.appendChild(vcPrivCard());
  for (const r of VOICE_ROOMS) if (r !== cur) box.appendChild(vcRoomCard(r));
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
    const full = !here && ppl.length >= VC_MAX;
    top.append(
      el('b', '', (vcPriv(r.id) ? '🔒 ' : '🎧 ') + r.n),
      el('small', '', r.d + ' · ' + ppl.length + '/' + VC_MAX + (full ? ' مليانة' : ''))
    );
    if (!here && full) top.appendChild(el('button', 'btn sm', 'مليانة')).disabled = true;
    else if (!here) {
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
      const inv = el('button', 'btn sm' + (VC.inviting ? ' on' : ''), '📨 ادعُ');
      inv.onclick = () => {
        VC.inviting = !VC.inviting;
        VC.panelSig = '';
        vcPanelDraw();
      };
      ctl.append(mic, deaf, inv, out);
      card.appendChild(ctl);
      if (VC.testOpen || ppl.length <= 1) card.appendChild(vcTestCard(ppl.length <= 1));
      else {
        const t = el('button', 'btn sm vcTestBtn', '🎙️ جرّب مايكك');
        t.onclick = () => {
          VC.testOpen = true;
          VC.panelSig = '';
          vcPanelDraw();
        };
        card.appendChild(t);
      }
      if (VC.inviting) card.appendChild(vcInviteList());
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
/* ---- invites: from a room, ask a player who is in the game right now to join it */
const VC_INV_GAP = 20000; // the same player once every 20 s at most
/** Players in the game right now (on the voice channel) who aren't in your room. */
function vcInviteList() {
  const box = el('div', 'vcInvList'),
    ppl = VC.list.filter(p => p.room !== VC.room && p.id !== myPid());
  box.appendChild(el('b', 'vcInvT', '📨 ادعُ أحد من اللي داخلين اللعبة الحين'));
  if (!ppl.length) box.appendChild(el('p', 'note', 'ما فيه أحد ثاني داخل اللعبة الحين.'));
  for (const p of ppl) {
    const row = el('div', 'vcP'),
      where = p.room === 'priv' ? 'بغرفة خاصة' : p.room ? 'في ' + vcRoomOf(p.room).n : 'باللعبة',
      sentAt = (VC.sent || {})[p.id],
      sent = sentAt && Date.now() - sentAt < VC_INV_GAP,
      b = el('button', 'btn sm' + (sent ? '' : ' go'), sent ? '✓ انرسلت' : 'ادعُ');
    b.disabled = sent;
    b.onclick = () => vcInvite(p);
    const info = el('span', '');
    info.append(document.createTextNode(p.n), el('small', '', ' · ' + where));
    row.append(vcChip(p), info, b);
    box.appendChild(row);
  }
  return box;
}
function vcInvite(p) {
  if (!VC.ch || !VC.room) return;
  VC.sent = VC.sent || {};
  if (Date.now() - (VC.sent[p.id] || 0) < VC_INV_GAP) return;
  VC.sent[p.id] = Date.now();
  // a public room by its id; a private one carries its code (only the invited player's game shows it)
  const d = { to: p.id, from: myPid(), fn: vcName(), room: vcPriv(VC.room) ? null : VC.room };
  if (vcPriv(VC.room)) d.code = VC.priv.code;
  VC.ch.send('inv', d);
  AU.play('select');
  toast('📨 انرسلت الدعوة لـ' + p.n);
  VC.panelSig = '';
  vcPanelDraw();
  setTimeout(() => {
    VC.panelSig = '';
    if (!$('voice').hidden) vcPanelDraw();
  }, VC_INV_GAP + 100);
}
/** An invite for us: a light card at the top of the screen, over whatever we're doing (nothing stops). */
function vcInvited(d) {
  if (!d || d.to !== myPid() || !d.fn) return;
  if (!d.code && !vcRoomOf(d.room).d) return; // not a room we know
  if (!d.code && VC.room === d.room) return; // already there
  if (d.code && VC.priv && VC.priv.code === vcCodeNorm(d.code)) return;
  const box = $('vcInv');
  if (VC.invT) clearTimeout(VC.invT);
  box.innerHTML = '';
  const who = el('i', 'vcChip');
  const src = avatarOf(d.fn);
  if (src) who.style.backgroundImage = 'url("' + src + '")';
  else who.textContent = [...d.fn][0];
  const txt = el('div', 'vcInvTx');
  txt.append(
    el('b', '', d.fn),
    el('span', '', d.code ? 'يدعوك لغرفته الخاصة 🔒' : 'يدعوك لـ' + vcRoomOf(d.room).n + ' 🎧')
  );
  const yes = el('button', 'btn sm go', 'انضم'),
    no = el('button', 'btn sm', 'لاحقاً');
  const close = () => {
    box.classList.remove('on');
    clearTimeout(VC.invT);
    VC.invT = setTimeout(() => (box.hidden = true), 300);
  };
  yes.onclick = () => {
    close();
    if (d.code) vcJoin(null, d.code, true);
    else vcJoin(d.room);
  };
  no.onclick = close;
  box.append(who, txt, yes, no);
  box.hidden = false;
  requestAnimationFrame(() => box.classList.add('on'));
  AU.init();
  if (!AU.sample('open', 0.35)) AU.play('select');
  VC.invT = setTimeout(close, 15000);
}
/** The rooms panel: over whatever is on screen (a solo run pauses behind it). */
function vcOpen() {
  AU.init();
  vcAC();
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
  try {
    if (VC.ch) VC.ch.send('vbye', { id: myPid() });
    if (VC.priv) VC.priv.ch.send('vbye', { id: myPid() });
  } catch (e) {}
  for (const id of [...VC.peers.keys()]) vcDrop(id);
});
// connect a little after start, so the 🎧 button shows how many are talking (local test pages skip it)
setTimeout(() => !NET_LOCAL && vcConnect().catch(() => {}), 6000);
