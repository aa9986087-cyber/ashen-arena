import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';

const source = file => fs.readFileSync(file, 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const noop = () => {};
function functions(file, names, globals) {
  const text = source(file);
  const ast = parse(text, { ecmaVersion: 'latest' });
  const context = vm.createContext(globals);
  for (const name of names) {
    const fn = ast.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === name);
    assert.ok(fn, `${file} must contain ${name}`);
    vm.runInContext(text.slice(fn.start, fn.end), context, { filename: file });
  }
  return context;
}
function coopContext(globals = {}) {
  const c = vm.createContext({ LIVE_FX: [], window: {}, ...globals });
  vm.runInContext(source('js/coop/coop.js'), c, { filename: 'js/coop/coop.js' });
  c.COOP = vm.runInContext('COOP', c);
  return c;
}

// Execute the actual full coop module; no copied model of session initialization.
test('online cleanup: coop start preserves roster, scale, session reset and message routing', () => {
  const calls = [];
  const handlers = {};
  const ch = { on(event, fn) { handlers[event] = fn; return this; } };
  const c = coopContext({
    myPid: () => 'me', performance: { now: () => 100 },
    AU: { init: () => calls.push('audio') }, clearRun: () => calls.push('clear'),
    newRun: () => calls.push('new'), enterArena: () => calls.push('enter'),
    runPerks: () => calls.push('perks'), banner: (...args) => calls.push(args),
    G: {}, S: { stats: { runs: 0 } }, $: () => ({}),
  });
  c.coopArena = radius => calls.push(['arena', radius]);
  c.coopRecvWorld = s => calls.push(['world', s]);
  c.coopRecvClient = s => calls.push(['client', s]);
  c.coopEndHere = won => calls.push(['end', won]);
  c.coopPeerLeft = id => calls.push(['left', id]);
  c.COOP.evTs = 999;
  c.COOP.predDead.set(4, 50);
  c.COOP.ens.set(4, {});
  c.COOP.usedES.add(8);
  const roster = [{ id: 'host', n: 'المضيف', ch: 'knight' }, { id: 'me', n: 'أنا', ch: 'mage' }];
  c.coopStart(ch, roster, false);
  assert.equal(c.COOP.me, 'me');
  assert.equal(c.COOP.hostId, 'host');
  assert.deepEqual(plain(c.COOP.order), ['host', 'me']);
  assert.deepEqual(plain([...c.COOP.peers.keys()]), ['host']);
  assert.equal(c.COOP.peers.get('host').lastRx, 100);
  assert.equal(c.COOP.hpMul, 1.75);
  assert.equal(c.COOP.cntMul, 1.4);
  assert.equal(c.COOP.dmgMul, 1.15);
  assert.equal(c.COOP.bossMul, 1.9);
  assert.equal(c.COOP.evTs, 0);
  assert.equal(c.COOP.predDead.size + c.COOP.ens.size + c.COOP.usedES.size, 0);
  assert.equal(c.G.state, 'play');
  assert.equal(c.S.stats.runs, 1);
  assert.deepEqual(Object.keys(handlers), ['w', 'c', 'end', 'bye']);
  handlers.w('snapshot'); handlers.c('ignored'); handlers.end({ won: 1 }); handlers.bye({ id: 'host' });
  assert.deepEqual(calls.slice(-3), [['world', 'snapshot'], ['end', 1], ['left', 'host']]);
  c.COOP.host = true;
  handlers.w('ignored'); handlers.c('state');
  assert.deepEqual(calls.at(-1), ['client', 'state']);
  assert.deepEqual(calls.slice(0, 6), [['arena', 78], 'audio', 'clear', 'new', 'enter', 'perks']);
});

test('online cleanup: coop mirror interpolates roster and expires only stale non-host peers', () => {
  const departed = [], effects = [], gifts = [];
  const c = coopContext({
    performance: { now: () => 5000 }, lerp: (a, b, k) => a + (b - a) * k,
    lerpAng: (a, b, k) => a + (b - a) * k, clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    G: { p: { dead: false }, corpses: [], eshots: [], zones: [{ f: true }, { m: 1 }], picks: [] },
    ETYPES: [],
  });
  c.coopPeerLeft = id => { departed.push(id); c.COOP.peers.delete(id); };
  c.coopFxReplay = ev => effects.push(ev);
  c.coopGhostShots = sh => gifts.push(sh);
  c.coopShared = noop;
  const row = (id, x, z) => [id, x, z, 0.6, 1, 0.3, 75, 100, 0, 'mage', 'staff', 4, 'رفيق', 1];
  const snap = (ts, pl) => ({ ts, e: [], b: null, es: [], zn: [], pk: [0, 3, 4, 7], pl, g: [], ev: [ts], sh: [ts] });
  Object.assign(c.COOP, { me: 'me', hostId: 'host', vt: 1.5, evTs: 0, buf: [snap(1, [row('peer', 0, 2)]), snap(2, [row('me', 90, 90), row('peer', 8, 6)])] });
  c.COOP.peers.set('stale', { id: 'stale', plT: 1000 });
  c.COOP.peers.set('host', { id: 'host', plT: 1000 });
  c.COOP.peers.set('not-yet-listed', { id: 'not-yet-listed' });
  c.coopMirror(0);
  const q = c.COOP.peers.get('peer');
  assert.equal(q.x, 4);
  assert.equal(q.z, 4);
  assert.equal(q.rx, q.x);
  assert.equal(q.rz, q.z);
  assert.equal(q.hp, 75);
  assert.equal(q.cards, true);
  assert.equal(q.n, 'رفيق');
  assert.equal(q.plT, 5000);
  assert.equal(c.COOP.peers.has('me'), false);
  assert.equal(c.COOP.peers.has('host'), true);
  assert.equal(c.COOP.peers.has('not-yet-listed'), true);
  assert.deepEqual(departed, ['stale']);
  assert.deepEqual(effects, [[1]]);
  assert.deepEqual(gifts, [[1]]);
  assert.equal(c.G.zones.length, 1);
  assert.deepEqual(plain(c.G.picks.map(({ k, x, z, v }) => ({ k, x, z, v }))), [{ k: 0, x: 3, z: 4, v: 7 }]);
  c.coopMirror(0);
  assert.deepEqual(effects, [[1]], 'a snapshot event is replayed once, not once per frame');
});

test('online cleanup: shared progress keeps tuple positions, iterator effects and revival/reward effects', () => {
  const effects = [];
  const c = functions('js/coop/coop.js', ['coopShared'], {
    G: { p: { dead: false, maxHp: 100 }, bossesRun: 0, stage: 0, abyss: false, depth: 0, bossName: 'قديم', kills: 9 },
    COOP: { rvN: 0 }, S: { stats: { bosses: 0, maxBoss: 0 }, sp: 0 }, STAGES: [{ n: 'أول' }, { n: 'ثان' }],
    save: () => effects.push('save'), toast: () => effects.push('toast'), setStage: stage => effects.push(['stage', stage]),
    heal: hp => effects.push(['heal', hp]), banner: () => effects.push('banner'), coopRevive: () => effects.push('revive'),
  });
  const values = [12, 1, 0, 2, 3, 1, 500, 0, 2, 1, 0.5, 1.2, 4, 5, 1];
  const pulls = [];
  // An elision must still advance the iterator through the reserved and unused entries.
  const tuple = {
    10: values[10], 11: values[11], 12: values[12], 13: values[13], 14: values[14],
    *[Symbol.iterator]() { for (let i = 0; i < values.length; i++) { pulls.push(i); yield values[i]; } },
  };
  c.coopShared(tuple, 'زعيم');
  assert.deepEqual(pulls, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(c.G.kills, 9, 'the host kills entry was never used as local kill credit');
  assert.equal(c.G.t, 12);
  assert.equal(c.G.wave, 3);
  assert.equal(c.G.waveT, 1.2);
  assert.equal(c.G.cycle, 4);
  assert.equal(c.G.sk, 5);
  assert.equal(c.G.bossDone, true);
  assert.equal(c.G.calmT, 0.5);
  assert.equal(c.G.bossName, 'زعيم');
  assert.equal(c.S.stats.bosses, 1);
  assert.equal(c.S.sp, 1);
  assert.equal(c.COOP.rvN, 2);
  assert.deepEqual(effects, ['save', 'toast', ['stage', 1], ['heal', 30], 'banner', 'revive']);
  effects.length = 0;
  c.coopShared(values, 'زعيم');
  assert.deepEqual(effects, [], 'unchanged progress does not duplicate rewards or revivals');
});

test('online cleanup: melee tags preserve visibility, position and scale in both camera views', () => {
  const drawn = [];
  const tag = () => ({ s: { position: { set(...p) { this.p = p; } }, scale: { set(...p) { this.p = p; } } } });
  const me = { tag: tag(), root: { visible: true }, act: 'idle' };
  const live = { tag: tag(), root: { visible: true }, act: 'idle', x: 3, z: 4 };
  const dead = { tag: tag(), root: { visible: true }, act: 'dead' };
  const gone = { tag: tag(), root: { visible: true }, act: 'idle', gone: true };
  const hidden = { tag: tag(), root: { visible: false }, act: 'idle' };
  const c = functions('js/duel/duel-ffa.js', ['ffaTags'], {
    DUEL: { me, ffa: { all: [me, live, dead, gone, hidden, {}] }, cam: { position: { distanceTo: () => 10 } } },
    ffaTagDraw: f => drawn.push(f), clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  });
  for (const view of ['fp', 'tps']) {
    c.DUEL.view = view;
    c.ffaTags();
    assert.equal(live.tag.s.visible, true);
    for (const f of [me, dead, gone, hidden]) assert.equal(f.tag.s.visible, false);
    assert.deepEqual(live.tag.s.position.p, [3, 2.12, 4]);
    assert.deepEqual(live.tag.s.scale.p, [1.6, 0.48, 1]);
  }
  assert.deepEqual(drawn, [live, live]);
  c.DUEL.kc = {};
  c.ffaTags();
  assert.equal(live.tag.s.visible, false);
  assert.equal(drawn.length, 2);
});

test('online cleanup: fighter construction preserves head meshes, hand choice, kick rest and gore bone lookup', () => {
  const text = source('js/duel/duel-fighter.js');
  const ast = parse(text, { ecmaVersion: 'latest' });
  const cls = ast.body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'Duelist');
  const ctx = vm.createContext({ THREE: { AnimationMixer: class { constructor(root) { this.root = root; } clipAction(a) { return a; } } } });
  vm.runInContext(text.slice(cls.start, cls.end), ctx);
  const Duelist = vm.runInContext('Duelist', ctx);
  const calls = [];
  Duelist.prototype.setWeapon = function (id) { calls.push(['weapon', id]); };
  Duelist.prototype.reset = function (...xyz) { calls.push(['reset', ...xyz]); };
  const bone = name => ({ name, isBone: true, quaternion: { clone: () => ({ rest: name }) } });
  const head = bone('Head'), hand = bone('hand_r'), otherHand = bone('hand_r');
  const thigh = bone('thigh_r'), calf = bone('calf_r'), spine = bone('spine_01');
  const mesh = name => ({ name, isMesh: true, material: { name: '' }, userData: {} });
  const hood = mesh('Hood'), arms = mesh('Arms'), body = mesh('Body');
  const nodes = [head, hand, otherHand, thigh, calf, spine, hood, arms, body];
  const root = { traverse(fn) { nodes.forEach(fn); } };
  const fighter = new Duelist({ scene: root, animations: [{ name: 'idle' }] }, 212, 118);
  assert.equal(fighter.hand, hand, 'the first right hand is selected');
  assert.deepEqual([...fighter.headMeshes], [hood]);
  assert.deepEqual([...fighter.fpHide], [hood, body]);
  assert.deepEqual([...fighter.kickBones], [thigh, calf, spine]);
  assert.deepEqual(plain(fighter.kickRest), [{ rest: 'thigh_r' }, { rest: 'calf_r' }, { rest: 'spine_01' }]);
  assert.equal(hood.castShadow, true);
  assert.equal(body.frustumCulled, false);
  assert.equal(fighter.pitch, 118);
  assert.deepEqual(calls, [['weapon', 'sword'], ['reset', 0, 0, 0]]);
  const gore = functions('js/duel/duel-gore.js', ['goreBone'], {});
  assert.equal(gore.goreBone(fighter, 'Head'), head, 'gore still locates the actual head independently');
  assert.equal(gore.goreBone(fighter, 'hand_r'), otherHand, 'the gore lookup keeps its existing last-name rule');
});

test('online cleanup: designed sound buffers and building promise remain the readiness contract', async () => {
  const timers = [], starts = [];
  const audio = {
    currentTime: 2,
    createBuffer(channels, length, rate) { const data = new Float32Array(length); return { length, rate, getChannelData: () => data }; },
    createBufferSource() { return { playbackRate: {}, connect: noop, start: t => starts.push(t) }; },
    createGain() { return { gain: {}, connect: noop }; },
  };
  const c = vm.createContext({ AU: { ctx: null, sg: {} }, setTimeout: fn => { timers.push(fn); return timers.length; } });
  vm.runInContext(source('js/duel/duel-sfx.js'), c);
  assert.equal(c.sfxBuild(), null, 'without an audio context, the build stays dormant');
  assert.equal(c.sfxPlay('clash'), false);
  c.AU.ctx = audio;
  c.sfxReverb = () => ({ connect: noop });
  vm.runInContext(`DSFX.sr = 100;
    for (const name of Object.keys(DSFX_DEFS)) delete DSFX_DEFS[name];
    DSFX_DEFS.clash = [0.04, a => a.set([1, -2, 0, 0.25]), 2];`, c);
  const building = c.sfxBuild();
  assert.equal(c.sfxBuild(), building, 'concurrent callers share one build');
  assert.equal(c.sfxPlay('clash', 0.4, 1, 0.3), true, 'a completed take is usable before the build promise settles');
  assert.deepEqual(starts, [2.3]);
  while (timers.length) { timers.shift()(); await Promise.resolve(); }
  await building;
  const buffers = vm.runInContext('DSFX.buf.clash', c);
  assert.equal(buffers.length, 2);
  assert.equal(buffers[0].length, 4);
  assert.ok(Math.abs(buffers[0].getChannelData(0)[1] + 0.95) < 1e-6);
  assert.equal(c.sfxBuild(), building, 'a completed build is reused too');
  assert.equal(c.sfxPlay('missing'), false);
});

test('online cleanup: local net presence, heartbeat expiry, delivery and close stay live', async () => {
  const channels = [], intervals = new Map(), cleared = [];
  let now = 1000;
  class LocalChannel {
    constructor(name) { this.name = name; this.sent = []; channels.push(this); }
    postMessage(message) { this.sent.push(message); }
    close() { this.closed = true; }
  }
  const c = vm.createContext({
    location: { hash: '#netlocal' }, BroadcastChannel: LocalChannel,
    Date: { now: () => now }, setInterval: fn => { const id = intervals.size + 1; intervals.set(id, fn); return id; },
    clearInterval: id => { cleared.push(id); intervals.delete(id); },
    window: {}, document: { createElement() { throw new Error('must not load any remote script'); } },
  });
  vm.runInContext(source('js/duel/duel-net.js'), c);
  const card = { id: 'me', n: 'أنا' };
  const api = await c.netJoin('duel-room', card);
  const bc = channels[0];
  assert.equal(bc.name, 'ashen:duel-room');
  assert.equal(bc.sent[0].e, '__p');
  const received = [], presence = [];
  assert.equal(api.on('mv', data => received.push(data)), api);
  api.onPresence(peers => presence.push(plain(peers)));
  bc.onmessage({ data: { e: '__p', k: 'me', d: card } });
  bc.onmessage({ data: { e: '__p', k: 'peer', d: { id: 'peer', n: 'رفيق' } } });
  assert.deepEqual(plain(api.peers), [{ id: 'peer', n: 'رفيق' }]);
  bc.onmessage({ data: { e: 'mv', d: { k: 'kick' } } });
  assert.deepEqual(received, [{ k: 'kick' }]);
  api.track({ busy: true });
  assert.equal(card.busy, true);
  now = 5001;
  [...intervals.values()][0]();
  assert.deepEqual(plain(api.peers), []);
  api.send('st', { x: 2 });
  assert.deepEqual(plain(bc.sent.at(-1)), { e: 'st', d: { x: 2 } });
  api.close();
  assert.deepEqual(plain(bc.sent.at(-1)), { e: '__x', k: 'me' });
  assert.equal(bc.closed, true);
  assert.deepEqual(cleared, [1]);
  assert.ok(presence.length >= 4);
  const watcher = await c.netJoin('watch-room');
  assert.equal(intervals.size, 0, 'watchers without presence do not create heartbeats');
  watcher.close();
  assert.equal(channels[1].closed, true);
});

test('online cleanup: ward absorption preserves hit effects without recreating the dead timer', () => {
  const c = functions('js/coop/coop.js', ['coopApplyHit'], { COOP: {}, kill: noop });
  for (const [ward, damage, remainingWard, hp] of [[10, 7, 3, 80], [3, 7, 0, 76]]) {
    const enemy = { ward, hp: 80, kx: 0, kz: 0, type: 'grunt' };
    c.coopApplyHit(enemy, damage, 1, -2, 7);
    assert.equal(enemy.ward, remainingWard);
    assert.equal(enemy.hp, hp);
    assert.deepEqual([enemy.flash, enemy.kx, enemy.kz, enemy.burn, enemy.frz, enemy.slowT], [0.1, 1, -2, 3, 0.5, 2]);
    assert.equal(Object.hasOwn(enemy, 'wardT'), false);
  }
  const lethal = { ward: 1, hp: 1, kx: 0, kz: 0, type: 'grunt' };
  c.kill = () => { assert.equal(c.COOP.remoteKill, true); throw new Error('kill failed'); };
  assert.throws(() => c.coopApplyHit(lethal, 5, 0, 0, 0), /kill failed/);
  assert.equal(c.COOP.remoteKill, false, 'remote kill state resets even when the callback throws');
  assert.equal(Object.hasOwn(lethal, 'wardT'), false);
});
