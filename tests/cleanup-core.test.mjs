import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import { globals } from './helpers/globals.mjs';

const root = new URL('../', import.meta.url);
const source = file => fs.readFileSync(new URL(file, root), 'utf8');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
function runtime(file, boundary) {
  const context = vm.createContext(boundary);
  new vm.Script(source(file), { filename: file }).runInContext(context, { timeout: 1000 });
  return { context, run: text => vm.runInContext(text, context, { timeout: 1000 }) };
}
// Extract a real declaration without running unrelated screen wiring/rendering.
function declaration(file, name) {
  const text = source(file);
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'script' });
  const node = ast.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === name);
  assert.ok(node, `missing actual declaration ${name}`);
  return text.slice(node.start, node.end);
}
function target() {
  const listeners = new Map();
  return {
    listeners, hidden: true, style: {}, firstElementChild: { style: {} },
    classList: { add() {}, remove() {} },
    addEventListener(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); },
    emit(name, event = {}) { for (const fn of listeners.get(name) || []) fn(event); },
  };
}
function inputRuntime() {
  const win = target(), doc = target(), canvas = target(), nodes = new Map();
  const calls = [], constructs = [];
  const node = id => { if (!nodes.has(id)) nodes.set(id, target()); return nodes.get(id); };
  class Vector3 { constructor(x = 0, y = 0, z = 0) { constructs.push('Vector3'); Object.assign(this, { x, y, z }); } }
  class Vector2 { constructor() { constructs.push('Vector2'); } set(x, y) { Object.assign(this, { x, y }); } }
  class Plane { constructor(normal, constant) { constructs.push('Plane'); Object.assign(this, { normal, constant }); } }
  class Raycaster {
    constructor() { constructs.push('Raycaster'); this.ray = { intersectPlane(plane, out) { out.x = 7; out.z = -3; return out; } }; }
    setFromCamera(ndc, camera) { calls.push(['ray', ndc.x, ndc.y, camera]); }
  }
  const IN = { k: {}, touch: false, joy: null, md: false, atk: false };
  const G = { state: 'play' };
  const g = runtime('js/input.js', {
    addEventListener: win.addEventListener.bind(win),
    document: Object.assign(doc, { body: target(), documentElement: { classList: { contains: () => false } } }),
    THREE: { Vector3, Vector2, Plane, Raycaster }, IN, G, LAB: true, glC: canvas, $: node,
    W: 200, H: 100, camera: 'camera', AU: { init: () => calls.push(['audio']) },
    dash: () => calls.push(['dash']), special: () => calls.push(['special']), potion: () => calls.push(['potion']),
    pause: value => calls.push(['pause', value]), show: (...args) => calls.push(['show', ...args]),
    saveRun: () => calls.push(['saveRun']), openLab: () => calls.push(['lab']), chooseCard: i => calls.push(['card', i]),
  });
  return { ...g, win, doc, canvas, node, calls, constructs, IN, G };
}

 test('cleanup core: actual shop prices, bonuses and encyclopedia remain executable', async () => {
  const g = await globals();
  assert.deepEqual(g.json('[salePrice(0),salePrice(149),salePrice(150),salePrice(280),permCost(0),permCost(1)]'), [0, 100, 110, 200, 110, 200]);
  g.run('S.perm={hp:2,dmg:2}');
  assert.deepEqual(g.json('[permBonus("hp"),permBonus("dmg"),permBonus("hp",0)]'), ['+20', '+12%', '']);
  const cards = [], elements = [];
  g.context.drawShopHero = () => {};
  g.context.el = (tag, cls, text) => {
    const n = { tag, cls, text, children: [], append(...nodes) { this.children.push(...nodes); }, appendChild(node) { this.children.push(node); } };
    elements.push(n); return n;
  };
  g.context.pips = (level, max) => ({ level, max });
  g.context.itemCard = (parent, options) => cards.push({ parent, ...options });
  g.run(declaration('js/ui/screens.js', 'drawShop'));
  const purchases = [];
  g.context.buy = (cost, action) => { purchases.push(cost); action(); };
  g.run('drawShop()');
  const hp = cards.find(c => c.title === g.run('PERM.hp.n'));
  assert.match(hp.btn, /290/);
  hp.onClick();
  assert.deepEqual(purchases, [290]);
  assert.equal(g.run('S.perm.hp'), 3);
  const weapons = cards.filter(c => c.parent === g.node('wepGrid'));
  assert.ok(weapons.length > 0);
  for (const c of weapons) assert.equal(c.onClick, undefined, 'weapon guide is not a purchase action');
  assert.ok(elements.some(n => n.cls === 'wEvo' && n.children.length === 3));
  assert.ok(elements.some(n => n.cls === 'wStats' && n.children.some(c => String(c.text).startsWith('الأهداف'))));
});

test('cleanup core: positional achievement callbacks and dynamic pacts still execute', async () => {
  const g = await globals();
  g.run('var all=ACH.find(a=>a.id==="all"); var profile=defSave(); profile.chars=Object.fromEntries(Object.keys(CHARS).map(k=>[k,1]));');
  assert.equal(g.run('all.t({kills:0},profile)'), true);
  g.run('delete profile.chars.knight');
  assert.equal(g.run('all.t({kills:999},profile)'), false);
  g.run('profile.tree=Object.fromEntries(TREE.flatMap(b=>b.nodes.map(n=>[n.id,1])))');
  assert.equal(g.run('ACH.find(a=>a.id==="tree25").t({},profile)'), true);
  g.run('newRun(); G.pacts={heavy:1}; recalc()');
  near(g.run('G.p.dmgMul'), 1.4);
  near(g.run('G.p.aspd'), 0.8);
  assert.equal(g.run('PATH_OF.fire.P.steps[PATH_OF.fire.k]'), 'fire');
});

test('cleanup core: clipboard API rejection runs real fallback and restores focus', async () => {
  const calls = [];
  const field = { style: {}, setAttribute() {}, focus() { calls.push('field-focus'); }, select() { calls.push('select'); }, setSelectionRange(a,b) { calls.push(['range',a,b]); }, remove() { calls.push('remove'); } };
  const g = runtime('js/core/clipboard.js', {
    navigator: { clipboard: { async writeText() { calls.push('api'); throw new Error('denied'); } } },
    document: { activeElement: { focus() { calls.push('restore'); } }, createElement(tag) { calls.push(tag); return field; }, body: { appendChild() { calls.push('append'); } }, execCommand(command) { calls.push(command); return true; } },
  });
  assert.equal(await g.run('copyToClipboard(123)'), true);
  assert.equal(field.value, '123');
  assert.deepEqual(calls, ['api','textarea','append','field-focus','select',['range',0,3],'copy','remove','restore']);
});

test('cleanup core: clipboard fallback error still removes the field and tolerates focus error', async () => {
  const calls = [];
  const field = { style: {}, setAttribute() {}, focus() {}, select() { throw new Error('selection denied'); }, remove() { calls.push('remove'); } };
  const g = runtime('js/core/clipboard.js', {
    navigator: {}, document: { activeElement: { focus() { calls.push('restore'); throw new Error('detached'); } }, createElement: () => field, body: { appendChild() {} } },
  });
  assert.equal(await g.run('copyToClipboard("نص")'), false);
  assert.deepEqual(calls, ['remove','restore']);
});

test('cleanup core: malformed code and throwing storage retain their error boundaries', async () => {
  const g = await globals({ deniedStorage: true });
  assert.equal(g.run('unpackCode("GF1","GF1-_",2,"salt")'), null);
  assert.equal(g.run('unpackCode("GF1",packCode("GF1",["عربي","20"],"salt"),2,"other")'), null);
  assert.equal(g.run('S.ver'), 2);
  assert.equal(g.run('S.char'), 'knight');
  assert.doesNotThrow(() => g.run('save()'));
  assert.deepEqual(g.json('S.weps'), { sword: 1, pistol: 1 });
});

test('cleanup core: real action buttons activate once on pointerdown with prevention and audio', () => {
  const g = inputRuntime();
  for (const [id, action] of [['bDash','dash'],['bSpec','special'],['bPot','potion']]) {
    g.calls.length = 0;
    g.node(id).emit('pointerdown', { preventDefault() { g.calls.push(['prevent']); } });
    g.node(id).emit('pointerup'); g.node(id).emit('pointercancel'); g.node(id).emit('pointerleave');
    assert.deepEqual(g.calls, [['prevent'],['audio'],[action]]);
  }
  assert.deepEqual(g.constructs, ['Raycaster','Vector3','Plane','Vector2','Vector3'], 'initialization effects retained');
});

test('cleanup core: keyboard, visibility and pagehide retain registered callback behavior', () => {
  const g = inputRuntime();
  const key = code => ({ code, target: { tagName: 'BODY' }, preventDefault() { g.calls.push(['prevent']); } });
  g.win.emit('keydown', { ...key('KeyQ'), target: { tagName: 'INPUT' } });
  assert.deepEqual(g.calls, []);
  g.win.emit('keydown', key('Space')); g.win.emit('keyup', key('Space'));
  assert.equal(g.IN.k.Space, false);
  assert.deepEqual(g.calls, [['prevent'],['dash']]);
  g.G.state = 'paused'; g.win.emit('keydown', key('Escape'));
  assert.deepEqual(g.calls.slice(-2), [['show','settings',false],['pause',false]]);
  g.G.state = 'cards'; g.win.emit('keydown', key('Digit4'));
  assert.deepEqual(g.calls.at(-1), ['card',3]);
  g.IN.md = g.IN.atk = true; g.win.emit('blur');
  assert.equal(g.IN.md, false); assert.equal(g.IN.atk, false); assert.deepEqual(Object.keys(g.IN.k), []);
  g.doc.hidden = true; g.doc.emit('visibilitychange'); g.win.emit('pagehide');
  assert.deepEqual(g.calls.slice(-3), [['pause',true],['saveRun'],['saveRun']]);
});

test('cleanup core: touch joystick clamps distance and cancellation clears only active pointer', () => {
  const g = inputRuntime();
  g.canvas.emit('pointerdown', { pointerType: 'touch', pointerId: 5, clientX: 30, clientY: 40 });
  assert.equal(g.IN.joy, 5); assert.equal(g.node('joy').hidden, false);
  g.win.emit('pointermove', { pointerType: 'touch', pointerId: 5, clientX: 130, clientY: 140 });
  near(Math.hypot(g.IN.jx, g.IN.jz), 1);
  g.win.emit('pointercancel', { pointerType: 'touch', pointerId: 8 });
  assert.equal(g.IN.joy, 5);
  g.win.emit('pointercancel', { pointerType: 'touch', pointerId: 5 });
  assert.equal(g.IN.joy, null); assert.equal(g.IN.jx, 0); assert.equal(g.IN.jz, 0); assert.equal(g.node('joy').hidden, true);
  g.canvas.emit('pointerdown', { pointerType: 'mouse', pointerId: 1, clientX: 100, clientY: 50 });
  g.run('mouseWorld()');
  assert.deepEqual(g.calls.at(-1), ['ray',0,0,'camera']);
  assert.equal(g.IN.mx, 7); assert.equal(g.IN.mz, -3);
});

function mainRuntime() {
  const calls = [], frames = [], timers = [];
  const G = { state: 'play', p: {}, resumeT: 0, slow: 0, slowmo: false }, S = { name: 'فارس', _mig: 1 };
  const boundary = { performance: { now: () => 100 }, window: {}, G, S, RESUME_T: 1,
    DUEL: { on: false }, COOP: { on: false }, frameGap: () => 0,
    CINE: {}, resumeAddonBossIntro() {}, ASHEN_ADDONS: { clearMelee() {} },
    requestAnimationFrame: fn => frames.push(fn), setTimeout: (fn, delay) => timers.push({ fn, delay }),
    AU: { ctx: null, music: () => calls.push(['music']) }, CM: { set: key => calls.push(['track', key]), tick: () => calls.push(['cm']), prefetch: keys => calls.push(['prefetch', ...keys]) },
    refreshPlayerPenalty() { calls.push(['refreshPlayerPenalty']); return Promise.resolve(null); },
    $() {return {disabled:false};},
    loadModels() { calls.push(['loadModels']); throw new Error('optional models unavailable'); },
  };
  for (const name of ['initIntro','setupBloom','newRun','setStage','buildPlayer','resize','drawSet','go','warmGPU','askName','save','toast','liveTick','liveWatchStep','duelFrame','perfTick','coopFrame','update','updCount','render','startRun','chooseCard','spawnBoss','special','dash']) {
    boundary[name] = (...args) => calls.push([name,...args]);
  }
  const g = runtime('js/main.js', boundary);
  return { ...g, calls, frames, timers, G, S };
}

test('cleanup core: real boot continues past optional model error and completes migration/music/export', () => {
  const g = mainRuntime();
  assert.deepEqual(g.calls.map(c=>c[0]), ['initIntro','setupBloom','newRun','setStage','buildPlayer','resize','drawSet','go','warmGPU','loadModels','save','track','refreshPlayerPenalty']);
  assert.deepEqual(g.calls.at(-2), ['track', 'menu']);
  assert.equal(g.S._mig, undefined); assert.equal(g.S.name, 'فارس');
  assert.deepEqual(g.timers.map(t => t.delay), [1200, 6000]);
  g.timers[0].fn(); assert.equal(g.calls.at(-1)[0], 'toast');
  g.timers[1].fn(); assert.deepEqual(g.calls.at(-1), ['prefetch', 'run', 'boss']);
  assert.equal(g.frames.length, 1);
  assert.equal(g.context.window.__game.G, g.G); assert.equal(g.context.window.__game.S, g.S);
  assert.equal(g.context.window.__game.dash, g.context.dash);
});

test('cleanup core: real frame keeps cap scheduling, time limits, co-op, watch and duel paths', () => {
  const g = mainRuntime(); g.calls.length = 0;
  g.context.frameGap = () => 20;
  g.run('frame(110)');
  assert.deepEqual(g.calls, []); assert.equal(g.frames.length, 2);
  g.context.frameGap = () => 0; g.context.COOP.on = true;
  g.run('frame(300)');
  near(g.calls.find(c=>c[0]==='update')[1], 0.05);
  near(g.calls.find(c=>c[0]==='updCount')[1], 0.2);
  assert.equal(g.calls.some(c=>c[0]==='coopFrame'), true);
  assert.deepEqual(g.calls.at(-1), ['render',0.05,300]);
  g.calls.length = 0; g.G.state = 'watch'; g.run('frame(350)');
  assert.equal(g.calls.some(c=>c[0]==='liveWatchStep'), true); assert.equal(g.calls.some(c=>c[0]==='update'), false);
  g.calls.length = 0; g.context.DUEL.on = true; g.run('frame(400)');
  assert.deepEqual(g.calls.map(c=>c[0]), ['liveTick','liveWatchStep','duelFrame','music','perfTick']);
});

test('cleanup core: DOM reload-animation layout read and touch prevention effects stay live', () => {
  const doc = target(); let now = 1000;
  const g = runtime('js/core/dom.js', { document: doc, performance: { now: () => now } });
  const calls = [], element = { classList: { remove: c => calls.push(['remove',c]), add: c => calls.push(['add',c]) }, get offsetWidth() { calls.push(['layout']); return 30; } };
  g.context.element = element; g.run('pop(element)');
  assert.deepEqual(calls, [['remove','pop'],['layout'],['add','pop']]);
  let prevented = 0;
  const tap = tag => ({ changedTouches: [{ clientX: 50, clientY: 60 }], target: { tagName: tag }, preventDefault() { prevented++; } });
  doc.emit('touchend', tap('DIV')); now += 100; doc.emit('touchend', tap('DIV'));
  assert.equal(prevented, 1);
  now += 100; doc.emit('touchend', tap('INPUT')); assert.equal(prevented, 1);
  doc.emit('gesturestart', { preventDefault() { prevented++; } }); assert.equal(prevented, 2);
});
