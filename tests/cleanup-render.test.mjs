import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const run = (c, source) => vm.runInContext(source, c, { timeout: 1000 });
function definitions(file, ...names) {
  const source = read(file);
  const nodes = parse(source, { ecmaVersion: 'latest' }).body.filter(n =>
    n.type === 'FunctionDeclaration' && names.includes(n.id.name) ||
    n.type === 'VariableDeclaration' && n.declarations.some(d => names.includes(d.id.name)));
  assert.ok(nodes.length, `No source definitions found: ${file}`);
  return nodes.map(n => source.slice(n.start, n.end)).join('\n');
}
const json = value => JSON.parse(JSON.stringify(value));
const turn = () => new Promise(resolve => setImmediate(resolve));

class Group {
  constructor() {
    this.children = [];
    this.rotation = {};
    this.scale = { setScalar: value => { this.scalar = value; } };
  }
  add(child) { this.children.push(child); }
  remove(child) { this.children.splice(this.children.indexOf(child), 1); }
}
function weaponContext() {
  const clones = [], duelCalls = [];
  const c = vm.createContext({
    THREE: {
      Group, Vector3: class {},
      Box3: class { setFromObject(src) { this.src = src; return this; } getSize() { return this.src.size; } },
      Color: class {
        constructor(value) { this.value = value; }
        multiplyScalar(scale) { this.scalar = scale; return this; }
      },
    },
    PM: { wp: new Group(), char: 'knight' },
    ASHEN_ADDONS: { weapon: () => false },
    S: { char: 'knight' }, G: { weapons: [{ id: 'sword', lvl: 1 }] },
    CHARS: { knight: { wep: 'sword' } },
    wTier: lvl => lvl >= 5 ? 2 : lvl >= 3 ? 1 : 0,
    BOX: 'box', CYL: 'cylinder', CONE: 'cone', SPH: 'sphere',
    mesh: (...args) => ({ procedural: true, args, rotation: {} }),
    window: { duelMace: () => { duelCalls.push(true); return model('duel mace', false); } },
  });
  function model(name, cloneable = true) {
    const original = { color: { lerp(color, weight) { this.tint = color.value; this.weight = weight; } }, emissive: {} };
    const material = { clone() { return { color: { ...original.color }, emissive: {} }; } };
    const src = { name, size: { y: 2, z: 4 }, rotation: {}, traverse(fn) { fn(this.child); }, child: { isMesh: true, material } };
    if (cloneable) src.clone = deep => { assert.equal(deep, true); const copy = model(name, false); clones.push(copy); return copy; };
    return src;
  }
  run(c, definitions('js/render/player-model.js', 'WEP_MODEL', 'WEP_MODELS', 'weaponModel', 'buildWeapon'));
  const table = run(c, 'WEP_MODEL');
  const cache = run(c, 'WEP_MODELS');
  for (const name of new Set(Object.values(table).flatMap(d => d.m || []))) cache[name] = model(name);
  return { c, table, cache, clones, duelCalls };
}

test('weapon model uses each tier, independent cloned materials and evolved size/glow', () => {
  const { c, table, cache } = weaponContext();
  for (const [id, d] of Object.entries(table)) {
    if (!d.m) continue;
    for (let tier = 0; tier < d.m.length; tier++) {
      c.id = id; c.tier = tier;
      const group = run(c, 'weaponModel(id, tier, true, 0xd070ff)');
      const src = group.children[0];
      assert.equal(src.name, d.m[tier]);
      assert.equal(group.scalar, d.len[tier] * 1.15 / (d.axis ? 4 : 2));
      assert.equal(src.rotation.x, d.axis ? Math.PI / 2 : Math.PI);
      assert.equal(src.child.castShadow, true);
      assert.equal(src.child.material.emissive.value, 0xd070ff);
      assert.equal(src.child.material.emissive.scalar, 0.3);
      assert.notEqual(src.child.material, cache[d.m[tier]].child.material);
      if (d.tint) assert.equal(src.child.material.color.tint, d.tint);
      assert.equal(cache[d.m[tier]].child.castShadow, undefined, 'do not mutate the cached scene');
    }
  }
});

test('weaponModel retains window[name] duel weapons and missing-model procedural fallback', () => {
  const { c, cache, duelCalls } = weaponContext();
  const group = run(c, "weaponModel('hammer', 2, false, 0xffc53d)");
  assert.equal(group.children[0].name, 'duel mace');
  assert.equal(duelCalls.length, 1);
  assert.equal(group.scalar, 1.9 / 2);
  run(c, "delete window.duelMace");
  assert.equal(run(c, "weaponModel('hammer', 0, false, 0)"), null);
  delete cache.sword;
  run(c, 'buildWeapon()');
  const children = run(c, 'PM.wp.children');
  assert.equal(children.length, 2);
  assert.ok(children.every(child => child.procedural));
  assert.equal(children[0].args.at(-1), 0, 'procedural emissive argument is still passed');
  assert.equal(run(c, "weaponModel('not-a-weapon', 0, false, 0)"), null);
});

test('living menu remains driven by dt and preserves hash/menu guards and camera positioning', () => {
  const events = new Map(), classes = new Set(), positions = [], effects = [], bosses = [];
  const c = vm.createContext({
    location: { hash: '' }, G: { state: 'menu', p: { swing: 0 } }, W: 390, H: 844,
    THREE: { PointLight: class { position = { set() {} }; } }, scene: { add() {} },
    loadBossActor: kind => bosses.push(kind),
    ACTOR_MODELS: { presentMenuKnight() {}, releaseMenuKnight: () => bosses.push('release') },
    Math: Object.assign(Object.create(Math), { random: () => 1 }),
    rand: (a, b) => (a + b) / 2, VT: { smoke: 7 },
    vfxP: p => effects.push(p), vfxFlame: () => effects.push('flame'),
    camera: { position: { set: (...args) => positions.push(args) }, lookAt: (...args) => positions.push(args) },
    document: { body: { classList: { add: s => classes.add(s), toggle: (s, on) => on ? classes.add(s) : classes.delete(s) } } },
    addEventListener: (name, fn) => events.set(name, fn),
  });
  run(c, read('js/render/menu2.js'));
  assert.ok(classes.has('m2'));
  assert.equal(run(c, 'menu2Frame(0.25)'), true);
  assert.equal(run(c, 'M2.t'), 0.25);
  assert.equal(run(c, 'M2.swingT'), 1.75);
  assert.equal(effects.find(p => p.t === 7).smoke, 1);
  assert.deepEqual(bosses, [2]);
  assert.deepEqual(positions.at(-1), [0, 2.22, -4]);
  c.G.state = 'paused';
  assert.equal(run(c, 'menu2Frame(0.5)'), false);
  assert.equal(run(c, 'M2.t'), 0.25);
  assert.deepEqual(bosses, [2, 'release']);
  c.G.state = 'menu'; c.location.hash = '#menu1'; events.get('hashchange')();
  assert.equal(classes.has('m2'), false);
  assert.equal(run(c, 'menu2Frame(0.5)'), false);
});

function particleLayer(capacity) {
  return { n: capacity, list: [], g: {
    attributes: { position: { array: new Float32Array(capacity * 3) }, rgba: { array: new Float32Array(capacity * 4) },
      size: { array: new Float32Array(capacity) }, tr: { array: new Float32Array(capacity * 2) } },
    setDrawRange(start, count) { this.range = [start, count]; },
  } };
}

test('atlas recipes preserve live tile indices, colors and critical/muzzle effects', () => {
  const particles = [];
  const c = vm.createContext({ vfxP: p => particles.push(json(p)), rand: (a, b) => (a + b) / 2 });
  run(c, definitions('js/render/vfx.js', 'VT', 'vfxHit', 'vfxKill', 'vfxMuzzle'));
  run(c, 'vfxHit(2, 3, [0.5, 0.6, 0.7], true); vfxKill(4, 5, true); vfxMuzzle(6, 7, [0.5, 0.6, 0.7])');
  assert.deepEqual(particles.map(p => p.t), [6, 2, 15, 15, 14, 8, 5, 9]);
  assert.equal(particles[0].s, 1.6 * 1.6);
  assert.equal(particles[0].x, 2); assert.equal(particles[0].z, 3);
  assert.equal(particles[1].a, 0.9);
  assert.equal(particles[5].smoke, 1);
  assert.equal(particles[6].r, 0.5 * 1.8);
});

test('particle spawn/step preserves explicit tile zero, capacity, motion, spin and expiry compaction', () => {
  const VFX = { glow: particleLayer(2), smoke: particleLayer(2), tglow: particleLayer(2), tsmoke: particleLayer(2) };
  const c = vm.createContext({ VFX, TAU: Math.PI * 2 });
  run(c, definitions('js/render/vfx.js', 'vfxP', 'vfxStep'));
  run(c, 'vfxP({ t: 0, x: 1, y: 2, z: 3, vx: 2, life: 1, s: 2, s1: 0, a: 0, rot: 0, spin: 2 }); vfxP({ t: 11, x: 9, y: 2, z: 9, life: 0.1 }); vfxP({ t: 5, x: 8, y: 2, z: 8 })');
  assert.equal(VFX.tglow.list.length, 2);
  assert.equal(VFX.glow.list.length, 0, 'tile zero is still a textured particle');
  run(c, 'vfxStep(VFX.tglow, 0.25)');
  assert.equal(VFX.tglow.list.length, 1);
  assert.deepEqual(VFX.tglow.g.range, [0, 1]);
  assert.equal(VFX.tglow.g.attributes.position.array[0], 1.5);
  assert.equal(VFX.tglow.g.attributes.tr.array[0], 0);
  assert.equal(VFX.tglow.g.attributes.tr.array[1], 0.5);
  assert.equal(VFX.tglow.g.attributes.rgba.array[3], 0);
  assert.equal(VFX.tglow.g.attributes.size.array[0], 1.5);
  run(c, 'vfxP({ smoke: 1, x: 0, y: 1, z: 0 }); vfxStep(VFX.tglow, 0.75)');
  assert.equal(VFX.smoke.list.length, 1);
  assert.equal(VFX.tglow.list.length, 0);
  assert.deepEqual(VFX.tglow.g.range, [0, 0]);
});

test('texture sampling still wraps UVs and safely falls back when canvas sampling throws', () => {
  const c = vm.createContext({ document: { createElement: () => { throw new Error('canvas unavailable'); } } });
  run(c, definitions('js/render/models.js', 'texSampler'));
  assert.equal(run(c, 'texSampler({ image: { width: 2, height: 2 } })'), null);
  c.document.createElement = () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({
    data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
  }) }) });
  assert.deepEqual(json(run(c, 'texSampler({ image: { width: 2, height: 2 }, flipY: false })(-0.1, 1.1)')), [0, 1, 0]);
  assert.deepEqual(json(run(c, 'texSampler({ image: { width: 2, height: 2 }, flipY: true })(-0.1, 1.1)')), [1, 1, 1]);
});

test('optional bloom constructor failure keeps real direct-render fallback', () => {
  const draws = [];
  const c = vm.createContext({ THREE: {
    EffectComposer: class { constructor() { throw new Error('GPU unavailable'); } }, UnrealBloomPass: class {},
  }, renderer: { render: (...args) => draws.push(args) }, scene: {}, camera: {}, S: { set: { qual: true } } });
  run(c, definitions('js/render/atmosphere.js', 'composer', 'setupBloom', 'drawScene'));
  assert.doesNotThrow(() => run(c, 'setupBloom(); drawScene()'));
  assert.equal(run(c, 'composer'), null);
  assert.deepEqual(draws, [[c.scene, c.camera]]);
});

function soundContext(extra = {}) {
  const c = vm.createContext({ addEventListener() {}, S: { set: { sfx: 1, mus: 0.5 } }, window: {}, ...extra });
  run(c, read('js/audio/sound.js'));
  return { c, AU: run(c, 'AU'), SFX: run(c, 'SFX') };
}

test('audio initialization failure and already-stopped click sample remain safely caught', () => {
  const { c, AU } = soundContext({ window: { AudioContext: class { constructor() { throw new Error('audio denied'); } } } });
  assert.doesNotThrow(() => AU.init());
  assert.equal(AU.ctx, null);
  AU.ctx = { currentTime: 10, createBufferSource: () => ({ connect() {}, start() {} }), createGain: () => ({ gain: {}, connect() {} }) };
  AU.ui = { open: {} };
  AU.lastClick = { t: 9.95, s: { stop() { throw new Error('already stopped'); } } };
  assert.equal(run(c, "AU.sample('open', 0.5)"), true);
  assert.equal(AU.lastClick, null);
});

test('failed UI sample requests still invoke synthesized menu sounds without network', async () => {
  const requests = [], calls = [];
  const { AU, SFX } = soundContext({ fetch: async url => { requests.push(url); throw new Error('local rejection'); } });
  AU.ctx = {};
  AU.uiLoad();
  await turn();
  assert.equal(requests.length, 5);
  assert.ok(requests.every(url => fs.existsSync(new URL(url.split('?')[0], root))));
  for (const name of ['noise', 'tone', 'str', 'soft']) AU[name] = (...args) => calls.push([name, ...args]);
  SFX.select(AU); SFX.open(AU); SFX.deny(AU);
  assert.deepEqual(calls.slice(0, 2).map(c => c[0]), ['noise', 'tone']);
  assert.ok(calls.some(c => c[0] === 'str'));
  assert.equal(calls.at(-1)[1], 146.83);
});

test('a broken theme falls back to the synthesized score, and another theme still plays', () => {
  const callbacks = new Map(), played = [];
  const { c, AU } = soundContext({
    Audio: class {
      constructor(src) { this.src = src || ''; this.paused = true; this.volume = 0; }
      addEventListener(name, fn) { callbacks.set(name, fn); }
      play() { played.push(true); this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
      load() {}
    },
    G: { state: 'menu' }, clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  });
  c.MUSIC = { menu: 'assets/audio/music/menu.m4a', run: 'assets/audio/music/run.m4a', boss: 'assets/audio/music/boss.m4a', win: 'assets/audio/music/win.m4a', lose: 'assets/audio/music/lose.m4a' };
  c.MUS = { boss: false, i: 0 }; c.S = { set: { mus: 0.5 } };
  c.musicFor = (state, boss) => (state === 'play' ? (boss ? 'boss' : 'run') : 'menu');
  run(c, read('js/audio/music-track.js'));
  const CM = run(c, 'CM');
  CM.set('menu');
  assert.equal(CM.cur, 'menu');
  assert.equal(CM.el.get('menu').src.endsWith('menu.m4a'), true);
  assert.equal(played.length, 1);
  callbacks.get('error')(); // the menu file is broken
  assert.equal(CM.state, 'missing');
  AU.ctx = { currentTime: 1, state: 'running' }; AU.next = 1; AU.step = 0; AU.mg = {};
  const notes = [];
  for (const name of ['str', 'vio', 'soft', 'tone']) AU[name] = (...args) => notes.push([name, ...args]);
  AU.music();
  assert.ok(notes.length > 0, 'a missing recording still schedules the fallback score');
  assert.ok(AU.next > 1);
  CM.set('run'); // the battle theme is fine, so the fallback gives way to it
  assert.equal(CM.cur, 'run');
  assert.equal(CM.state, 'load');
  assert.equal(played.length, 2);
});
test('actual model loader keeps fallback geometry and warms once after rejected/empty loads', () => {
  const requests = [], warmed = [];
  const GEO = {}, heroes = {};
  const c = vm.createContext({
    THREE: { GLTFLoader: class { load(url, success, progress, error) { requests.push({ url, success, error }); } } },
    location: { protocol: 'https:' }, IS_SANDBOX: false, MODEL_DIR: 'assets/models/',
    warmGPU: () => warmed.push(true), console: { warn() {} },
    GEO, HERO_GEOS: heroes, S: { char: 'knight' }, bakeModel: () => null,
  });
  run(c, definitions('js/render/models.js', 'MODEL_FILES', 'MODEL_VER', 'loadModels'));
  const files = run(c, 'MODEL_FILES');
  for (const def of Object.values(files)) {
    const key = typeof def === 'string' ? def : def.to;
    if (!key.startsWith('hero:')) GEO[key] = { computeBoundingBox() {}, boundingBox: { min: { y: 0 }, max: { y: 2 } } };
  }
  const original = { ...GEO };
  run(c, 'loadModels()');
  assert.equal(requests.length, Object.keys(files).length);
  for (const [i, r] of requests.entries()) {
    assert.ok(fs.existsSync(new URL(r.url.split('?')[0], root)), r.url);
    if (i === 0) r.success({ scene: {}, animations: [] }); else r.error();
    assert.equal(warmed.length, i === requests.length - 1 ? 1 : 0);
  }
  assert.deepEqual(GEO, original); assert.deepEqual(heroes, {});
  c.IS_SANDBOX = true;
  run(c, 'loadModels()');
  assert.equal(requests.length, Object.keys(files).length);
});

test('actual duel/audio loader prefixes resolve every local recording and decode without production', async () => {
  const requests = [], built = [];
  const c = vm.createContext({
    AU: { ctx: { decodeAudioData: (ab, ok) => ok({ decoded: ab }) } }, sfxBuild: () => built.push(true),
    fetch: async url => { requests.push(url); return { arrayBuffer: async () => new ArrayBuffer(1) }; },
  });
  run(c, read('js/duel/duel-audio.js'));
  await run(c, 'duelSoundsLoad()');
  await turn();
  assert.equal(built.length, 1);
  const expected = run(c, "DSND_FILES.length + Object.values(DREAL).reduce((a, b) => a + b, 0)");
  assert.equal(requests.length, expected);
  for (const url of requests) assert.ok(fs.existsSync(new URL(url, root)), url);
  const buf = run(c, 'DSND.buf');
  assert.equal(Object.keys(buf).length, run(c, 'DSND_FILES.length'));
  for (const [name, count] of Object.entries(run(c, 'DREAL'))) assert.equal(run(c, 'DREAL_BUF')[name].length, count);
});
