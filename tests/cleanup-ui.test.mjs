import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { parse } from 'acorn';
import { ROOT, tags } from './helpers/project.mjs';

const source = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = source('index.html');

// Small DOM/timer/network boundaries; application functions below execute their actual sources.
function boundary(extra = {}) {
  const all = [], ids = new Map(), timers = new Map(), intervals = new Map(), events = new Map();
  let next = 0, clock = 100000;
  function element(tag = 'div') {
    const classes = new Set(), styles = {};
    const n = {
      tagName: tag.toUpperCase(), children: [], dataset: {}, hidden: false, value: '', textContent: '', writes: 0,
      style: { setProperty(k, v) { styles[k] = v; }, getPropertyValue(k) { return styles[k] || ''; } },
      classList: {
        add(...xs) { xs.forEach(x => classes.add(x)); }, remove(...xs) { xs.forEach(x => classes.delete(x)); },
        contains(x) { return classes.has(x); },
        toggle(x, force) { const on = force ?? !classes.has(x); on ? classes.add(x) : classes.delete(x); return on; },
      },
      append(...xs) { xs.forEach(x => this.appendChild(x)); },
      appendChild(x) { x.parent = this; this.children.push(x); return x; },
      insertBefore(x, ref) { x.parent = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, x); },
      remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); },
      addEventListener(name, fn) { this['event_' + name] = fn; },
      setAttribute(k, v) { this[k] = v; },
      querySelector(sel) { return this.children.find(x => sel.startsWith('.') ? x.classList.contains(sel.slice(1)) : x.tagName === sel.toUpperCase()); },
      click() { return this.onclick?.({ target: this, preventDefault() {}, stopPropagation() {} }); },
      focus() {}, select() {}, play() { return Promise.resolve(); },
    };
    Object.defineProperties(n, {
      id: { get() { return this._id; }, set(v) { this._id = v; ids.set(v, this); } },
      className: { get() { return [...classes].join(' '); }, set(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(x => classes.add(x)); } },
      innerHTML: { get() { return this._html || ''; }, set(v) {
        this._html = v; this.writes++; this.children = [];
        for (const { tag, attrs } of tags(String(v))) {
          const ch = element(tag); ch.className = attrs.class || ''; if (attrs.id) ch.id = attrs.id; this.appendChild(ch);
        }
      } },
      firstChild: { get() { return this.children[0]; } },
      firstElementChild: { get() { return this.children[0]; } },
    });
    all.push(n); return n;
  }
  for (const [index, { tag, attrs }] of tags(html).entries()) {
    const n = element(tag); n.className = attrs.class || ''; n.hidden = 'hidden' in attrs; n.sourceIndex = index;
    if (attrs.id) n.id = attrs.id;
    if ('data-go' in attrs) n.dataset.go = attrs['data-go'];
  }
  const body = element('body');
  const document = {
    body, hidden: false, createElement: element, createTextNode: text => ({ textContent: text }),
    getElementById: id => ids.get(id),
    querySelectorAll(sel) {
      if (sel === '[data-go]') return all.filter(n => n.dataset.go);
      if (sel.startsWith('.')) {
        const cls = sel.slice(1).split('[')[0];
        return all.filter(n => !n.removed && n.classList.contains(cls) && (!sel.includes('[data-id]') || n.dataset.id));
      }
      return [];
    },
  };
  const calls = { sounds: [], toasts: [], saved: 0, pop: [], network: 0, mic: 0, raf: [] }, storage = new Map();
  const ctx = vm.createContext({
    console, document, window: {}, Date: class extends Date { static now() { return clock; } },
    performance: { now() { return clock; } },
    setTimeout(fn, ms) { const id = ++next; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval(fn, ms) { const id = ++next; intervals.set(id, { fn, ms }); return id; }, clearInterval: id => intervals.delete(id),
    addEventListener: (name, fn) => events.set(name, fn), requestAnimationFrame: fn => calls.raf.push(fn),
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) },
    navigator: { mediaDevices: { getUserMedia() { calls.mic++; throw new Error('microphone forbidden'); } } },
    fetch() { calls.network++; throw new Error('network forbidden'); },
    api() { calls.network++; throw new Error('unmocked API forbidden'); },
    netJoin() { calls.network++; throw new Error('unmocked channel forbidden'); },
    AU: { init() {}, play: s => calls.sounds.push(s) }, toast: s => calls.toasts.push(s),
    save: () => calls.saved++, pop: (n, cls) => calls.pop.push([n.id, cls]),
    clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
    $: id => ids.get(id), el: (tag, cls, text) => { const n = element(tag); n.className = cls || ''; if (text != null) n.textContent = text; return n; },
    S: { name: 'أنا', char: 'knight', coins: 10, sp: 3, tree: {}, perm: {}, gifts: {}, set: {} },
    G: { state: 'menu', p: {}, zones: [], enemies: [], eshots: [], weapons: [{ id: 'sword' }], ups: {}, pacts: {} },
    NET_LOCAL: true, COOP: { on: false },
    ...extra,
  });
  const run = code => vm.runInContext(code, ctx, { timeout: 1000 });
  const load = file => new vm.Script(source(file), { filename: file }).runInContext(ctx, { timeout: 1000 });
  const flush = ms => { for (const [id, t] of [...timers]) if (t.ms === ms) { timers.delete(id); t.fn(); } };
  return { ctx, run, load, ids, all, body, element, calls, timers, intervals, events, storage, flush, time(v) { clock = v; } };
}
function screenBoundary() {
  const draws = [], actions = [];
  const b = boundary({ sun: {}, resize() {}, startRun: () => actions.push('start'), resumeRun: () => actions.push('resume'),
    pause: on => actions.push(['pause', on]), toMenu: () => actions.push('menu'), endRun() {}, saveRun() {},
    drawChars: () => draws.push('chars'), drawShop: () => draws.push('shop'), drawTree: () => draws.push('tree'),
    drawAch: () => draws.push('ach'), drawSet() {}, askName() {}, drawBoard: () => draws.push('board'), loadOnline: () => draws.push('load'),
    menuState: () => draws.push('menu'), closeNews: () => draws.push('closeNews'),
  });
  b.load('js/ui/screens.js');
  // Stub rendering boundaries after the full source registers its actual handlers.
  b.run('drawChars=()=>draws.push("chars"); drawShop=()=>draws.push("shop"); drawAch=()=>draws.push("ach"); drawSet=()=>draws.push("settings")');
  b.ctx.draws = draws;
  return { ...b, draws, actions };
}

test('UI cleanup: removed color tokens have no references in source/docs/tools, not just HTML', () => {
  function files(dir) { return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(dir + '/' + e.name) : [dir + '/' + e.name]); }
  const corpus = ['index.html', 'README.md', 'AGENTS.md', ...files('js'), ...files('css'), ...files('docs').filter(f => f.endsWith('.md')), ...files('tools')];
  // Audit prose may name a deleted token. CSS declarations, var(), and CSSOM usage must still fail.
  const documentedUsage = /var\s*\(\s*--(?:night2|panel|blood)\b|--(?:night2|panel|blood)\s*:|(?:getPropertyValue|setProperty)\s*\(\s*['"]--(?:night2|panel|blood)\b/;
  assert.doesNotMatch('Deleted `--blood` from unused state', documentedUsage);
  assert.match('color: var(--night2)', documentedUsage);
  assert.match('--panel: #123;', documentedUsage);
  assert.match('style.getPropertyValue("--blood")', documentedUsage);
  for (const file of corpus) {
    const text = source(file);
    assert.doesNotMatch(text, file.endsWith('.md') ? documentedUsage : /--(?:night2|panel|blood)\b/, file);
  }
  assert.match(source('css/base.css'), /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

test('UI cleanup: actual drawCards still emits all dynamic rarity classes and color-token references', () => {
  const b = boundary({ curCards: [0, 1, 2, 3].map(r => ({ k: 'gold', r })), RAR: ['a', 'b', 'c', 'd'],
    cardInfo: () => ({ i: 'coin', n: 'treasure', d: '+40', syn: '', lv: '' }), chooseCard() {},
  });
  b.ctx.G.rerolls = 0;
  const src = source('js/game/cards.js'), ast = parse(src, { ecmaVersion: 'latest' });
  const n = ast.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'drawCards');
  b.run(src.slice(n.start, n.end)); b.run('drawCards()');
  const cards = b.ids.get('cardRow').children;
  assert.equal(cards.length, 4);
  for (let i = 0; i < cards.length; i++) {
    assert.equal(cards[i].className, 'card r' + i);
    assert.equal(cards[i].style.getPropertyValue('--rc'), 'var(--r' + i + ')');
    assert.match(source('css/base.css'), new RegExp('--r' + i + '\\s*:'));
  }
  assert.match(source('css/cards.css'), /\.card\.r3\s*\{/);
  assert.match(source('css/responsive.css'), /\.card\.r3/);
});

test('UI cleanup: every registered screen and every actual data-go handler still navigates', () => {
  const b = screenBoundary(), screens = Array.from(b.run('SCREENS'));
  // cards is a separately controlled overlay, not a data-go screen: navigation must preserve it.
  b.run('show("cards", true)');
  for (const id of screens.filter(s => s !== 'cards')) {
    b.run(`goNow(${JSON.stringify(id)})`);
    assert.equal(b.ids.get(id).hidden, false, id);
    assert.equal(b.ids.get('cards').hidden, false);
    for (const other of screens.filter(s => s !== id && s !== 'cards')) assert.equal(b.ids.get(other).hidden, true, other);
  }
  for (const button of b.all.filter(n => n.dataset.go)) {
    button.click(); b.flush(185);
    assert.equal(b.ids.get(button.dataset.go).hidden, false, button.dataset.go);
  }
  b.run('hideScreens()');
  assert.equal(screens.every(id => b.ids.get(id).hidden), true);
  assert.ok(b.calls.sounds.includes('select'));
});

test('UI cleanup: superseded leave-transition callbacks cannot reopen an old destination', () => {
  const b = screenBoundary(); b.run('go("menu"); go("chars"); go("shop")');
  b.flush(185);
  assert.equal(b.ids.get('shop').hidden, false);
  assert.equal(b.ids.get('chars').hidden, true);
  assert.equal(b.ids.get('menu').classList.contains('leaving'), false);
});

test('UI cleanup: maintenance retains both visible return handlers and the dormant board draw/load branch', () => {
  const b = screenBoundary(); b.run('go("board")');
  assert.equal(b.ids.get('boardContent').hidden, true);
  assert.equal(b.draws.includes('board') || b.draws.includes('load'), false);
  const board = html.split('id="board"')[1].split('id="boardContent"')[0];
  const visibleReturns = tags(board).filter(t => t.attrs['data-go'] === 'menu');
  assert.equal(visibleReturns.length, 2);
  const buttons = b.all.filter(n => n.sourceIndex > b.ids.get('board').sourceIndex &&
    n.sourceIndex < b.ids.get('boardContent').sourceIndex && n.dataset.go === 'menu');
  assert.equal(buttons.length, visibleReturns.length);
  for (const button of buttons) {
    button.click(); b.flush(185); assert.equal(b.ids.get('menu').hidden, false);
    b.run('goNow("board")');
  }
  b.ids.get('boardContent').hidden = false;
  b.run('goNow("board")');
  assert.deepEqual(b.draws.slice(-3), ['closeNews', 'board', 'load']);
});

test('UI cleanup: pause settings and chat return to pause; menu entry returns to menu', () => {
  const b = screenBoundary(); b.ctx.G.state = 'paused';
  b.run('show("menu", false); show("pause", true)');
  b.ids.get('pSet').click(); assert.equal(b.ids.get('settings').hidden, false);
  b.ids.get('setBack').click(); assert.equal(b.ids.get('pause').hidden, false);
  b.load('js/ui/chat.js'); b.run('chatDraw=()=>{}; chatLoad=()=>{}');
  b.ids.get('pChat').click(); assert.equal(b.ids.get('chat').hidden, false);
  b.ids.get('cBack').click(); assert.equal(b.ids.get('pause').hidden, false);
  assert.equal([...b.intervals.values()].some(t => t.ms === 30000), true);
  b.run('goNow("menu")'); b.ids.get('mChat').click(); b.flush(185);
  b.ids.get('cBack').click(); b.flush(185); assert.equal(b.ids.get('menu').hidden, false);
  b.ids.get('mSet').click(); b.flush(185); b.ids.get('setBack').click(); b.flush(185);
  assert.equal(b.ids.get('menu').hidden, false);
  assert.equal(b.ctx.G.state, 'paused'); assert.equal(b.calls.network, 0);
});

test('UI cleanup: lab is gated, builds real tools when enabled, and labels touched runs unranked', () => {
  const spawned = [], b = boundary({ LAB: false, EN: { grunt: {} }, MON_N: { grunt: 'grunt' }, WEP: { sword: { i: 's', n: 'sword' } },
    STAGES: [{ n: 'forest', boss: 'boss', bk: 'forest' }],
    startRun() { b.ctx.G.state = 'play'; }, spawnAround: (...a) => spawned.push(a), rand: () => 11, banner() {}, hideBoss() {},
  });
  const src = source('js/ui/screens.js'), ast = parse(src, { ecmaVersion: 'latest' });
  const show = ast.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'show');
  b.run(src.slice(show.start, show.end));
  b.load('js/ui/lab.js'); b.ctx.G.state = 'play'; b.ids.get('labBtn').click();
  assert.equal(b.ctx.G.state, 'play'); assert.equal(b.ids.get('lab').hidden, true);
  b.ctx.LAB = true; b.ids.get('labBtn').click();
  assert.equal(b.ctx.G.state, 'lab'); assert.equal(b.ctx.G.lab, true);
  assert.ok(b.ids.get('labTools').children.length > 0);
  b.ids.get('labMon').children[0].click();
  assert.equal(spawned.length, 3); assert.equal(b.ctx.G.state, 'play'); assert.equal(b.ids.get('lab').hidden, true);
  b.ids.get('mLab').click(); b.flush(1200);
  assert.equal(b.ctx.G.god, true); assert.equal(b.ctx.G.noWaves, true); assert.equal(spawned.length, 7);
});

test('UI cleanup: avatar rendering preserves own image, cached run portrait, and initial fallback', () => {
  const b = boundary({ CHARS: { knight: {} }, PORTRAITS: { knight: 'cached' }, heroPortrait: () => 'rendered', profileLink: n => n });
  b.load('js/ui/avatar.js');
  assert.equal(b.run('avatarOf(S.name)'), 'rendered');
  b.ctx.G.state = 'play'; assert.equal(b.run('avatarOf(S.name)'), 'cached');
  b.ctx.S.avatar = 'own'; assert.equal(b.run('avatarOf(S.name)'), 'own');
  const n = b.run('avatarEl("ضيف")'); assert.equal(n.textContent, 'ض');
  b.run('AVA.map.set("ضيف", {img:"photo", ch:"knight", t:Date.now()})');
  b.ctx.n = n; b.run('avatarPaint(n)'); assert.equal(n.style.backgroundImage, 'url("photo")');
  assert.equal(b.run('AVA.want.size'), 0); assert.equal(b.run('AVA.busy'), false);
});

test('UI cleanup: avatar fetch queue remains batched, skips fresh entries and preserves failure backoff', async () => {
  const requests = []; let reject = false;
  const b = boundary({ NET_LOCAL: false, api: async url => { requests.push(url); if (reject) throw new Error('offline'); return [{ name: 'ضيف', avatar: 'new', stats: { ch: 'knight' } }]; } });
  b.load('js/ui/avatar.js');
  await b.run('avatarFetch(["ضيف"])'); assert.equal(b.run('AVA.map.get("ضيف").img'), 'new');
  assert.equal(b.run('AVA.busy'), false); assert.equal(b.run('AVA.want.size'), 0);
  await b.run('avatarFetch(["ضيف"])'); assert.equal(requests.length, 1);
  reject = true; await b.run('avatarFetch(["مفقود"])');
  assert.equal(b.run('AVA.map.get("مفقود").t'), 10000);
  await b.run('avatarFetch(["مفقود"])'); assert.equal(requests.length, 2);
  b.time(131001); await b.run('avatarFetch(["مفقود"])'); assert.equal(requests.length, 3);
});

function voiceBoundary() {
  const packets = [], listeners = new Map(), transports = [];
  const channel = { on(name, fn) { listeners.set(name, fn); return this; }, send: (name, data) => packets.push([name, data]) };
  class Peer {
    constructor() { this.connectionState = 'new'; this.signalingState = 'stable'; this.iceGatheringState = 'complete'; transports.push(this); }
    addTransceiver(kind, opt) { this.receiver = [kind, opt.direction]; }
    addTrack() { this.tracks = (this.tracks || 0) + 1; }
    getSenders() { return []; }
    close() { this.closed = true; }
  }
  const b = boundary({ RTCPeerConnection: Peer, avatarOf: () => '', icon: () => '', myPid: () => 'me',
    netJoin: async name => { assert.equal(name, 'voice'); return channel; },
  });
  b.storage.set('ashen_vc_vol', '0.4'); b.storage.set('ashen_vc_pvol', '{"ضيف":0.5}');
  b.load('js/ui/voice.js');
  return { ...b, channel, packets, listeners, transports };
}

test('UI cleanup: voice initialization still restores volumes and connects/listens on actual sig channel', async () => {
  const b = voiceBoundary(); assert.equal(b.run('VC.vol'), 0.4); assert.equal(b.run('VC.pvol["ضيف"]'), 0.5);
  assert.equal(await b.run('vcConnect()'), b.channel); assert.equal(await b.run('vcConnect()'), b.channel);
  assert.equal(typeof b.listeners.get('sig'), 'function');
  assert.ok(b.packets.some(([n]) => n === 'vask')); assert.ok(b.packets.some(([n]) => n === 'vst'));
  b.run('VC.room="diwan"; vcSend("friend", {t:"ice", cs:[]})');
  const [event, packet] = b.packets.at(-1); assert.equal(event, 'sig');
  assert.equal(packet.to, 'friend'); assert.equal(packet.from, 'me'); assert.equal(packet.r, 'diwan');
  assert.equal(b.calls.network, 0); assert.equal(b.calls.mic, 0);
});

test('UI cleanup: peer map identity, ICE closure recipient, timestamps and teardown effects remain intact', async () => {
  const b = voiceBoundary(); await b.run('vcConnect()');
  b.run('VC.room="diwan"; VC.list=[{id:"friend", n:"ضيف", room:"diwan"}]');
  const peer = b.run('vcPeer("friend")');
  assert.equal(b.run('vcPeer("friend")'), peer); assert.equal(b.transports.length, 1);
  assert.deepEqual(peer.pc.receiver, ['audio', 'recvonly']); assert.equal(peer.at, 100000); assert.equal(peer.seen, 100000);
  assert.equal(peer.audio.className, 'vcAudio'); assert.equal(b.body.children.includes(peer.audio), true);
  peer.pc.onicecandidate({ candidate: { toJSON: () => ({ candidate: 'local-fake' }) } });
  b.flush(250); const [event, data] = b.packets.at(-1);
  assert.equal(event, 'sig'); assert.equal(data.to, 'friend'); assert.equal(data.cs[0].candidate, 'local-fake');
  b.run('vcSetVol(0.2, "ضيف")'); assert.equal(peer.audio.volume, 0.4 * 0.2);
  b.run('vcDrop("friend")');
  assert.equal(peer.pc.closed, true); assert.equal(peer.audio.removed, true);
  assert.equal(b.run('VC.peers.size'), 0); assert.equal(b.run('VC.levels.size'), 0);
});

test('UI cleanup: voice panel signature changes for connection and preserves generated meter/record DOM IDs', () => {
  const b = voiceBoundary(); b.run('vcPanelDraw()');
  assert.equal(b.ids.get('vcStatus').textContent, 'جارٍ الاتصال…');
  const before = b.ids.get('vcRooms').writes; b.run('vcPanelDraw()'); assert.equal(b.ids.get('vcRooms').writes, before);
  b.run('VC.ch={}; vcPanelDraw()'); assert.match(b.ids.get('vcStatus').textContent, /اختر غرفة/);
  assert.equal(b.ids.get('vcRooms').writes, before + 1);
  b.run('VC.stream={}; vcTestCard(true)');
  assert.ok(b.ids.get('vcMeterI')); assert.ok(b.ids.get('vcRec')); assert.equal(b.calls.raf.length, 1);
  b.run('VC.recording=true; vcRecState("recording")'); assert.equal(b.ids.get('vcRec').disabled, true);
  assert.equal(b.calls.mic, 0); assert.equal(b.calls.network, 0);
});
