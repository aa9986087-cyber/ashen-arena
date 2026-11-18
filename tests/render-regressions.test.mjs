import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';

// Extract real top-level definitions, not copies of their implementation.
function sourceNodes(file, predicate) {
  const source = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const nodes = parse(source, { ecmaVersion: 'latest' }).body.filter(predicate);
  assert.ok(nodes.length, `No matching definitions in ${file}`);
  return nodes.map(n => source.slice(n.start, n.end)).join('\n');
}
const declaration = (...names) => n =>
  (n.type === 'FunctionDeclaration' && names.includes(n.id.name)) ||
  (n.type === 'VariableDeclaration' && n.declarations.some(d => names.includes(d.id.name)));
function run(source, context) {
  return vm.runInContext(source, context, { timeout: 1000 });
}

class Group {
  constructor() {
    this.children = [];
    this.visible = true;
    this.scale = { setScalar: value => { this.scalar = value; } };
  }
  add(child) { this.children.push(child); }
  remove(child) { this.children.splice(this.children.indexOf(child), 1); }
  traverse(fn) {
    fn(this);
    for (const child of this.children) {
      if (child.traverse) child.traverse(fn);
      else fn(child);
    }
  }
}

function weaponContext({ loader = true, active = true } = {}) {
  const requests = [], rebuilt = [], deleted = [];
  const portraits = new Proxy({ knight: 'old portrait', mage: 'old portrait' }, {
    deleteProperty(target, key) { deleted.push(key); return Reflect.deleteProperty(target, key); },
  });
  const wp = new Group();
  const context = vm.createContext({
    THREE: {
      Group,
      Vector3: class {},
      Box3: class {
        setFromObject() { return this; }
        getSize() { return { y: 1, z: 1 }; }
      },
      ...(loader ? { GLTFLoader: class {
        load(url, success, progress, error) { requests.push({ url, success, error }); }
      } } : {}),
    },
    PM: { wp, char: 'knight' },
    ASHEN_ADDONS: { weapon: () => false },
    PORTRAITS: portraits,
    G: active ? { weapons: [{ id: 'sword', lvl: 1 }] } : null,
    S: { char: 'knight' },
    CHARS: { knight: { wep: 'sword' } },
    wTier: () => 0,
    BOX: 'box', CYL: 'cylinder',
    mesh: (...args) => ({ procedural: true, args }),
    window: {},
    recordRebuild: () => rebuilt.push(true),
  });
  run(sourceNodes('js/render/player-model.js', declaration('WEP_MODEL', 'WEP_MODELS', 'weaponModel', 'buildWeapon')), context);
  run(`buildWeapon();
    const realBuildWeapon = buildWeapon;
    buildWeapon = function (...args) { recordRebuild(); return realBuildWeapon(...args); };`, context);
  assert.equal(wp.children.length, 2, 'real buildWeapon starts with its procedural sword');
  run(sourceNodes('js/render/player-model.js', n =>
    n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression' &&
    n.expression.callee.type === 'FunctionExpression' && n.expression.callee.id?.name === 'loadWeaponModels'), context);
  return { context, requests, rebuilt, deleted, portraits, wp };
}
function modelScene(name) {
  return { clone(deep) {
    assert.equal(deep, true);
    return { name, rotation: {}, traverse() {} };
  } };
}

for (const outcome of ['success', 'last failure', 'first failure', 'all fail']) {
  test(`weapon loader completes once: ${outcome}, retaining successful models and fallback`, () => {
    const c = weaponContext();
    const expected = run('[...new Set(Object.values(WEP_MODEL).flatMap(d => d.m || []))]', c.context);
    assert.deepEqual(c.requests.map(r => r.url), Array.from(expected, n => `assets/models/weapons/${n}.glb?v=1`));
    const loaded = new Map();
    c.requests.forEach((request, index) => {
      const failed = outcome === 'all fail' ||
        (outcome === 'last failure' && index === c.requests.length - 1) ||
        (outcome === 'first failure' && index === 0);
      if (failed) request.error(new Error('stub load failure'));
      else {
        const scene = modelScene(expected[index]);
        loaded.set(expected[index], scene);
        request.success({ scene });
      }
      if (index < c.requests.length - 1) {
        assert.equal(c.rebuilt.length, 0, 'do not rebuild before every request settles');
        assert.equal(c.deleted.length, 0, 'do not invalidate portraits early');
      }
    });
    assert.equal(c.rebuilt.length, 1);
    assert.deepEqual(c.deleted.sort(), ['knight', 'mage']);
    assert.deepEqual(Object.keys(c.portraits), []);
    const models = run('WEP_MODELS', c.context);
    assert.deepEqual(Object.keys(models).sort(), [...loaded.keys()].sort());
    for (const [name, scene] of loaded) assert.equal(models[name], scene);
    if (loaded.has('sword')) assert.equal(c.wp.children[0].children[0].name, 'sword');
    else assert.ok(c.wp.children.every(child => child.procedural), 'missing model still uses real procedural fallback');
  });
}

test('optional weapon loader does nothing when GLTFLoader is absent', () => {
  const c = weaponContext({ loader: false });
  assert.equal(c.requests.length, 0);
  assert.equal(c.rebuilt.length, 0);
  assert.equal(c.deleted.length, 0);
  assert.ok(c.wp.children.every(child => child.procedural));
});

test('weapon completion invalidates portraits without requiring an active game', () => {
  const c = weaponContext({ active: false });
  for (const request of c.requests) request.error(new Error('stub load failure'));
  assert.equal(c.rebuilt.length, 0);
  assert.deepEqual(Object.keys(c.portraits), []);
  assert.ok(c.wp.children.every(child => child.procedural));
});

function warmContext({ failRender = false, failTarget = false, failRestore = false, previous = { name: 'prior target' } } = {}) {
  const scene = new Group(), targets = [], warnings = [], draws = [];
  const hidden = { visible: false };
  const empty = { visible: false, isInstancedMesh: true, count: 0 };
  const filled = { visible: true, isInstancedMesh: true, count: 7 };
  scene.add(hidden); scene.add(empty); scene.add(filled);
  const originalChildren = [...scene.children];
  const geo = { isBufferGeometry: true };
  const renderer = {
    current: previous,
    getRenderTarget() { return this.current; },
    setRenderTarget(target) {
      if (failRestore && target === previous) throw new Error('stub restore failure');
      this.current = target;
    },
    render(s, camera) {
      assert.equal(s, scene);
      assert.equal(camera, context.camera);
      assert.equal(hidden.visible, true);
      assert.equal(empty.visible, true);
      assert.equal(empty.count, 1);
      assert.equal(filled.count, 7);
      assert.equal(scene.children.length, originalChildren.length + 1);
      assert.equal(this.current, targets[0]);
      draws.push(true);
      if (failRender) throw new Error('stub render failure');
    },
  };
  const context = vm.createContext({
    THREE: {
      Group,
      Mesh: class { constructor(geometry) { this.geometry = geometry; this.visible = true; } },
      WebGLRenderTarget: class {
        constructor(w, h) {
          assert.equal(w, 64); assert.equal(h, 64);
          if (failTarget) throw new Error('stub target failure');
          this.disposals = 0; targets.push(this);
        }
        dispose() { this.disposals++; }
      },
    },
    ANIM: { grunt: { walk: [geo], attack: [geo] } },
    HERO_GEOS: { knight: { base: geo, clips: { idle: [geo] } } },
    STAGES: [{ decor: ['tree'] }], GEO: { tree: geo, boss0: geo },
    lamV: {}, bossMat: {}, scene, renderer, camera: {},
    console: { warn: (...args) => warnings.push(args) },
  });
  run(sourceNodes('js/render/perf.js', declaration('warmGPU')), context);
  return { context, scene, renderer, previous, targets, warnings, draws, hidden, empty, filled, originalChildren };
}
function assertWarmRestored(c) {
  assert.equal(c.hidden.visible, false);
  assert.equal(c.empty.visible, false);
  assert.equal(c.empty.count, 0);
  assert.equal(c.filled.visible, true);
  assert.equal(c.filled.count, 7);
  assert.deepEqual(c.scene.children, c.originalChildren, 'remove the temporary group without disposing shared geometry');
  for (const target of c.targets) assert.equal(target.disposals, 1);
}

for (const failRender of [false, true]) {
  test(`warmGPU restores prior target, visibility and counts and disposes resources: render ${failRender ? 'throws' : 'succeeds'}`, () => {
    const c = warmContext({ failRender });
    assert.doesNotThrow(() => run('warmGPU()', c.context));
    assert.equal(c.draws.length, 1);
    assertWarmRestored(c);
    assert.equal(c.renderer.current, c.previous);
    assert.equal(c.warnings.length, failRender ? 1 : 0);
  });
}

test('warmGPU also preserves the default null render target', () => {
  const c = warmContext({ previous: null });
  assert.doesNotThrow(() => run('warmGPU()', c.context));
  assertWarmRestored(c);
  assert.equal(c.renderer.current, null);
});

test('warmGPU cleans partial initialization when render-target construction throws', () => {
  const c = warmContext({ failTarget: true });
  assert.doesNotThrow(() => run('warmGPU()', c.context));
  assertWarmRestored(c);
  assert.equal(c.renderer.current, c.previous);
  assert.equal(c.draws.length, 0);
  assert.equal(c.warnings.length, 1);
});

test('optional GPU warm-up never propagates a cleanup error and still disposes its target', () => {
  const c = warmContext({ failRender: true, failRestore: true });
  assert.doesNotThrow(() => run('warmGPU()', c.context));
  assertWarmRestored(c);
  assert.equal(c.warnings.length, 2);
});

function audioContext() {
  let now = 1000;
  const context = vm.createContext({ performance: { now: () => now } });
  run(sourceNodes('js/audio/sound.js', n => declaration('AU', 'GAP', 'SK', 'SFX')(n) ||
    (n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' &&
      n.expression.left.type === 'MemberExpression' && n.expression.left.object.name === 'SFX')), context);
  return { context, AU: run('AU', context), SFX: run('SFX', context), GAP: run('GAP', context), setNow: value => { now = value; } };
}

test('whip and bolt invoke the same unchanged noise/tone sequence through one implementation', () => {
  const { SFX } = audioContext();
  const invoke = fn => {
    const calls = [];
    fn({ noise: (...args) => calls.push(['noise', ...args]), tone: (...args) => calls.push(['tone', ...args]) });
    return calls;
  };
  const expected = [
    ['noise', 0.14, 0.15, 3000, 0, null, 'highpass'],
    ['tone', 880, 0.12, 'triangle', 0.05, 220],
  ];
  assert.deepEqual(invoke(SFX.whip), expected);
  assert.deepEqual(invoke(SFX.bolt), expected);
  assert.equal(SFX.bolt, SFX.whip);
});

test('AU.play keeps both names with independent GAP entries and per-name throttling', () => {
  const c = audioContext(), calls = [];
  assert.ok(Object.hasOwn(c.SFX, 'whip') && Object.hasOwn(c.SFX, 'bolt'));
  assert.ok(Object.hasOwn(c.GAP, 'whip') && Object.hasOwn(c.GAP, 'bolt'));
  assert.equal(c.GAP.whip, 120); assert.equal(c.GAP.bolt, 120);
  c.AU.ctx = {};
  c.AU.uiLoad = () => {};
  c.AU.noise = (...args) => calls.push(['noise', ...args]);
  c.AU.tone = (...args) => calls.push(['tone', ...args]);
  c.AU.play('whip'); c.AU.play('bolt');
  assert.equal(calls.length, 4, 'one name must not suppress the other at the same time');
  assert.deepEqual(calls.slice(0, 2), calls.slice(2));
  c.setNow(1119);
  c.AU.play('whip'); c.AU.play('bolt');
  assert.equal(calls.length, 4, 'each name is throttled before 120 ms');
  c.setNow(1120);
  c.AU.play('whip'); c.AU.play('bolt');
  assert.equal(calls.length, 8, 'both names can play again at their GAP boundary');
  assert.equal(c.AU.last.whip, 1120); assert.equal(c.AU.last.bolt, 1120);
});
