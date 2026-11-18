'use strict';

const FORGE_VERSION = 3;
const FORGE_STATES = new Set(['idle','block','light','heavy','kick','dodge','hit','knock','kicked','stagger','dead']);
const FORGE_RESULTS = new Set(['hit','riposte','combo','exec','kick','kickbreak','block','parry','break','miss','none','clash']);
const forgeInt = (x, min, max) => Number.isSafeInteger(x) && x >= min && x <= max;
const forgeNum = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;

function forgeGestureOkay(g) {
  return g === null || (g && forgeNum(g.x, -1, 1) && forgeNum(g.y, -1, 1) && typeof g.held === 'boolean');
}

function forgePacketGesture(f) {
  const g = f.forgeGesture;
  return g ? { x: g.x, y: g.y, held: g.held } : null;
}

function forgePacketOkay(e, p) {
  if (e === 'st') {
    return forgeInt(p.r, 0, 99) && forgeNum(p.x, -10.1, 10.1) && forgeNum(p.z, -10.1, 10.1) &&
      Math.hypot(p.x, p.z) < 10.12 && forgeNum(p.f, -4, 4) && FORGE_STATES.has(p.a) &&
      forgeNum(p.hp, 0, 100) && forgeNum(p.st, 0, 100) && forgeNum(p.mx, -1, 1) && forgeNum(p.mz, -1, 1) &&
      forgeInt(p.av, 0, FORGE_STYLES.length - 1) && forgeInt(p.mid, 0, 100000) && forgeNum(p.mt, 0, 7200) &&
      forgeInt(p.md, -1, 1) && forgeGestureOkay(p.gesture) && forgeInt(p.mc, 0, 10000) && DUEL_WEAPON_IDS.includes(p.w) &&
      (p.cu === undefined || forgeInt(p.cu, 0, 127)) &&
      (p.ck === undefined || forgeNum(p.ck, -1, 60)) &&
      (p.fv === undefined || forgeInt(p.fv, 0, 24));
  }
  if (e === 'mv') {
    return (FORGE_ATTACKS.has(p.k) || ['dodge','feint'].includes(p.k)) &&
      forgeInt(p.mid, 0, 100000) && forgeInt(p.md, -1, 1) && forgeGestureOkay(p.gesture) &&
      (p.k !== 'dodge' || (forgeNum(p.dx, -1.01, 1.01) && forgeNum(p.dz, -1.01, 1.01) &&
        Math.hypot(p.dx, p.dz) <= 1.015)) && (p.k !== 'light' || forgeInt(p.c, 1, 10000));
  }
  if (e === 'res') return FORGE_RESULTS.has(p.o) && forgeInt(p.mid, 1, 100000);
  if (e === 'rd') return forgeInt(p.n, 1, 99);
  if (e === 'ko') return ['d','h','g'].includes(p.w) && [0, 1].includes(p.to);
  return true;
}

function forgeChannel(ch, host) {
  const rawOn = ch.on.bind(ch), rawSend = ch.send.bind(ch);
  const seen = new Map(), handlers = new Map(), resolved = new Set();
  const id = () => Array.from(crypto.getRandomValues(new Uint32Array(2)), n => n.toString(36)).join('-');
  let epoch = host ? id() : '', round = 0, serial = 0;
  ch.send = (type, data) => {
    if (type === 'rd') {
      if (data.n === 1 && round > 1) epoch = id();
      round = data.n;
    }
    const packet = { ...data, v: FORGE_VERSION, h: host ? 1 : 0, ep: epoch, seq: ++serial, round: DUEL.round };
    if (type === 'mv') {
      packet.mid = DUEL.me.forgeAttack || 0;
      packet.md = DUEL.me.forgeDirection || 0;
      packet.gesture = forgePacketGesture(DUEL.me);
    }
    if (type === 'res') packet.mid = DUEL.foe.forgeAttack;
    if (host && ['rd','ko','end'].includes(type)) {
      packet.sc = DUEL.score.slice();
      if (type === 'ko' && data.w !== 'd') packet.sc[data.w === 'h' ? 0 : 1]++;
    }
    if (type === 'st') {
      packet.f = wrapAng(packet.f);
      if (host) packet.sc = DUEL.score.slice();
    }
    return rawSend(type, packet);
  };
  ch.on = (type, fn) => {
    handlers.set(type, fn);
    return rawOn(type, incoming => {
      if (!incoming || incoming.v !== FORGE_VERSION || incoming.h !== (host ? 0 : 1) ||
          !forgeInt(incoming.seq, 1, Number.MAX_SAFE_INTEGER) ||
          typeof incoming.ep !== 'string' || incoming.ep.length > 25 || !forgePacketOkay(type, incoming)) return;
      if (type !== 'hi' && (!epoch || incoming.ep !== epoch)) {
        const rematch = type === 'rd' && DUEL.phase === 'over' && DUEL.net?.meAgain && incoming.n === 1;
        if (host || (!['go','rd'].includes(type)) || (epoch && !rematch)) return;
        epoch = incoming.ep;
        seen.clear();
        resolved.clear();
      }
      if (type !== 'hi' && !epoch) return;
      if (incoming.seq <= (seen.get(type) || 0)) return;
      seen.set(type, incoming.seq);
      if (['mv','res','ko','die','dieok','dieno','again','end'].includes(type) && incoming.round !== DUEL.round) return;
      if (type === 'res') {
        if (incoming.mid !== DUEL.me.forgeAttack || resolved.has(incoming.mid)) return;
        if (resolved.size > 32) resolved.clear();
        resolved.add(incoming.mid);
      }
      if (type === 'st' && !host && DUEL.net?.ready && incoming.r === DUEL.round + 1 && DUEL.phase !== 'over') {
        // A new-round snapshot also serves as recovery if the one-time round event was lost.
        handlers.get('rd')?.({ n: incoming.r });
      }
      const score = () => {
        if (host || !Array.isArray(incoming.sc) || incoming.sc.length !== 2 ||
            !incoming.sc.every(n => forgeInt(n, 0, DUEL_WIN))) return;
        if (DUEL.score[0] === incoming.sc[1] && DUEL.score[1] === incoming.sc[0]) return;
        DUEL.score = [incoming.sc[1], incoming.sc[0]];
        duelPips();
      };
      if (type === 'end') score();
      fn(incoming);
      if (type === 'ko' || type === 'rd' || (type === 'st' && incoming.r === DUEL.round &&
          (DUEL.phase !== 'fight' || incoming.r > 1))) score();
    });
  };
  return ch;
}

function forgeReadMove(f, m, time) {
  if (!FORGE_ATTACKS.has(m.k)) {
    f.netMove(m);
    return;
  }
  if (m.mid <= (f.forgeRemoteAttack || 0)) return;
  f.forgeRemoteAttack = m.mid;
  f.forgeAim = m.md;
  f.forgeGesture = m.gesture ? { ...m.gesture, release: time ?? 0 } : null;
  f.netMove(m);
  f.forgeAttack = m.mid;
  if (time !== undefined) {
    const moves = f.M[m.k] || DM[m.k];
    f.t = Math.min(time, moves.t - 0.01);
    f.hitDone = !f.forgeGesture && time > moves.hitTo + 0.06;
  }
}
function forgeReadFighter(f, state) {
  forgeDress(f, state.av);
  if (f.wpId !== state.w) f.setWeapon(state.w);
  if (DUEL.phase !== 'fight' || DUEL.fin || DUEL.kc) return;
  if (FORGE_ATTACKS.has(state.a) && state.mid > (f.forgeRemoteAttack || 0)) {
    forgeReadMove(f, { k: state.a, mid: state.mid, md: state.md, c: Math.max(1, state.mc), gesture: state.gesture }, state.mt);
  } else if (f.forgeGesture && state.gesture && f.forgeRemoteAttack === state.mid) {
    if (f.forgeGesture.held && !state.gesture.held) f.forgeGesture.release = f.t;
    Object.assign(f.forgeGesture, state.gesture);
  }
}
