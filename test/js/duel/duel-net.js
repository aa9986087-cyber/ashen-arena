'use strict';
/* Sword duel — network: Supabase Realtime channels (broadcast + presence), loaded only when the duel lobby opens.
   With #netlocal in the URL the same API runs over BroadcastChannel between tabs (for testing two players on one machine). */
const NET_LOCAL = /netlocal/.test(location.hash);
const SUPA_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
let supaClient = null;
function loadScript(src) {
  return new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => no(new Error('script ' + src));
    document.head.appendChild(s);
  });
}
async function netClient() {
  if (supaClient) return supaClient;
  if (!window.supabase) await loadScript(SUPA_JS);
  supaClient = window.supabase.createClient(ONLINE.url, ONLINE.key, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 40 } },
  });
  return supaClient;
}
/** This device's player id (stays the same between visits). */
function myPid() {
  if (!S.pid) {
    S.pid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    save();
  }
  return S.pid;
}
/** Join a channel. `presence` (optional) is this player's card, shown to everyone in the channel.
    Returns { on(event, fn), onPresence(fn), send(event, data), track(changes), close(), peers }. */
async function netJoin(name, presence) {
  const handlers = {};
  let onPres = null;
  const api = {
    peers: [],
    on(e, fn) {
      handlers[e] = fn;
      return api;
    },
    onPresence(fn) {
      onPres = fn;
      fn(api.peers);
    },
  };
  const deliver = (e, d) => handlers[e] && handlers[e](d);
  const setPeers = list => {
    api.peers = list.filter(p => p && (!presence || p.id !== presence.id));
    onPres && onPres(api.peers);
  };
  if (NET_LOCAL) {
    const bc = new BroadcastChannel('ashen:' + name),
      seen = new Map();
    let hb = 0;
    const emit = () => setPeers([...seen.values()].map(v => v.d));
    bc.onmessage = ({ data }) => {
      if (data.e === '__p') {
        seen.set(data.k, { t: Date.now(), d: data.d });
        emit();
      } else if (data.e === '__x') {
        seen.delete(data.k);
        emit();
      } else deliver(data.e, data.d);
    };
    api.send = (e, d) => bc.postMessage({ e, d });
    if (presence) {
      const beat = () => {
        bc.postMessage({ e: '__p', k: presence.id, d: presence });
        for (const [k, v] of seen) if (Date.now() - v.t > 3500) seen.delete(k);
        emit();
      };
      beat();
      hb = setInterval(beat, 1000);
      api.track = o => {
        Object.assign(presence, o);
        beat();
      };
    }
    api.close = () => {
      clearInterval(hb);
      if (presence) bc.postMessage({ e: '__x', k: presence.id });
      bc.close();
    };
    return api;
  }
  const cl = await netClient();
  const ch = cl.channel(name, {
    config: { broadcast: { self: false, ack: false }, presence: { key: presence ? presence.id : '' } },
  });
  ch.on('broadcast', { event: 'm' }, ({ payload }) => payload && deliver(payload.e, payload.d));
  if (presence)
    ch.on('presence', { event: 'sync' }, () => setPeers(Object.values(ch.presenceState()).map(a => a[a.length - 1])));
  await new Promise((ok, no) => {
    const to = setTimeout(() => no(new Error('timeout')), 12000);
    ch.subscribe(st => {
      if (st === 'SUBSCRIBED') {
        clearTimeout(to);
        ok();
      } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') {
        clearTimeout(to);
        no(new Error(st));
      }
    });
  });
  if (presence) await ch.track(presence);
  api.send = (e, d) => ch.send({ type: 'broadcast', event: 'm', payload: { e, d } });
  api.track = o => {
    Object.assign(presence, o);
    ch.track(presence);
  };
  api.close = () => {
    try {
      cl.removeChannel(ch);
    } catch (e) {}
  };
  return api;
}
