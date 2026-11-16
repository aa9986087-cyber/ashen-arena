'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const ids = ['knight', 'ranger', 'forest-guardian'];
const files = ['knight/melee.js', 'knight/config.js', 'ranger/bow-weapon.js', 'ranger/config.js', 'forest-guardian/config.js', 'shared/actor-runtime.js'];
function contextFor(enabled = []) {
  const descriptors = {}, enabledSet = new Set(enabled), loads = [];
  const context = {
    URL, Promise, performance: { now: () => 0 }, location: { protocol: 'https:' },
    console: { info() {}, warn() {} }, document: { currentScript: null },
    S: { char: 'knight' }, PM: { char: 'knight' },
    G: { state: 'play', t: 0, p: { hp: 100, dead: false } }, choosingCards: () => false,
    THREE: { GLTFLoader: class { load(url, success, progress, failure) { loads.push(url); failure(new Error('mock: no network')); } } },
    GEO: { boss0: { computeBoundingBox() {}, boundingBox: { min: { y: 0 }, max: { y: 8 } } } },
    ASHEN_ADDONS: {
      define(id, descriptor) { descriptors[id] = descriptor; },
      enabled(id) { return enabledSet.has(id); },
      actorConfigs() {
        return Object.fromEntries(Object.entries(descriptors).filter(([id]) => enabledSet.has(id)).map(([, d]) => [d.actorKey, d.actor]));
      },
    },
  };
  context.window = context;
  vm.createContext(context);
  for (const file of files) {
    context.document.currentScript = { src: 'https://example.invalid/test/addons/' + file + '?release=test' };
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  return { context, descriptors, loads, enabledSet };
}
const empty = value => assert.equal(JSON.stringify(value), '[]');
(async () => {
  for (let mask = 0; mask < 8; mask++) {
    const enabled = ids.filter((_, i) => mask & (1 << i));
    const { context: c, descriptors, loads } = contextFor(enabled);
    assert.equal(loads.length, 0, 'registration/runtime must not eagerly load any model');
    assert.deepEqual(Object.keys(descriptors).sort(), [...ids].sort());
    const configKeys = vm.runInContext('Object.keys(ACTOR_CONFIG).sort()', c);
    assert.equal(JSON.stringify(configKeys), JSON.stringify(['textureEdge', 'fade', ...enabled.map(id => descriptors[id].actorKey)].sort()));
    for (const bad of ['bossKnight', 'guardian', 'unknown', '', undefined, 'textureEdge', 'toString']) empty(await c.loadActor(bad));
    for (const kind of [1, 2, 3, -1, null, '0']) empty(await c.loadBossActor(kind));
    assert.equal(loads.length, 0, 'unknown/nonrequested keys must not fetch');
    for (const id of ids) {
      const before = loads.length;
      if (id === 'forest-guardian') await c.loadBossActor(0);
      else await c.loadActor(id);
      assert.equal(loads.length - before, enabled.includes(id) ? 1 : 0, id + ' fetch isolation');
      if (enabled.includes(id)) assert.equal(loads[before], descriptors[id].actor.file + '?v=1.0.0-c0c1701');
    }
    const previous = loads.length;
    c.S.char = 'mage'; empty(await c.loadActors());
    assert.equal(loads.length, previous);
    assert.equal(typeof c.actorBossRender, 'function');
    assert.equal(c.actorBossRender({ kind: 2, dead: false }, 0), false);
  }
  const { context: c, descriptors, enabledSet } = contextFor(['knight', 'ranger']);
  const queue = descriptors.knight.hooks.queueMelee, tick = descriptors.knight.hooks.updateMelee;
  let hits = 0;
  c.G.t = 2;
  assert.equal(queue(() => hits++), true);
  assert.equal(queue(() => hits++), true);
  assert.equal(c.G.meleeSwings.length, 1, 'same-cycle callbacks grouped');
  c.G.t = 2.039; tick(); assert.equal(hits, 0);
  c.G.t = 2.04; tick(); assert.equal(hits, 2, 'all jobs land at the same 0.04 impact');
  c.G.t = 2.041; queue(() => hits++);
  assert.ok(Math.abs(c.G.meleeSwings[0].start - 2.1) < 1e-9, '0.1 cycle cannot restart early');
  c.G.t = 2.139; tick(); assert.equal(hits, 2);
  c.G.t = 2.14; tick(); assert.equal(hits, 3);
  c.G.t = 3; queue(() => hits++); c.G.state = 'pause'; tick();
  c.G.state = 'play'; c.G.t = 5; tick(); assert.equal(hits, 3, 'paused pending hits cancelled');
  queue(() => hits++); c.G.p.dead = true; tick(); c.G.p.dead = false; c.G.t = 6; tick(); assert.equal(hits, 3);
  queue(() => hits++); c.G.p = { dead: false, hp: 100 }; c.G.t = 7; tick(); assert.equal(hits, 3, 'old-player jobs cancelled');
  c.PM.char = 'ranger'; assert.equal(queue(() => hits++), false, 'other heroes retain instant baseline');
  c.PM.char = 'knight'; enabledSet.delete('knight'); assert.equal(queue(() => hits++), false);
  const shapeCalls = [];
  c.THREE.Mesh = class { constructor(geometry, material) { this.geometry = geometry; this.material = material; this.rotation = { set(...v) { shapeCalls.push(v); } }; } };
  c.THREE.TorusGeometry = class { constructor(...args) { this.args = args; } };
  c.mesh = (...args) => ({ meshArgs: args }); c.lam = (...args) => ({ materialArgs: args });
  c.CYL = 'CYL'; c.BOX = 'BOX'; c.CONE = 'CONE';
  const rig = { char: 'ranger', wp: { children: [], add(child) { this.children.push(child); } } };
  const bow = descriptors.ranger.hooks.weapon;
  assert.equal(bow(rig, 'bow', 0, false, 0xffffff, 0, 1), true);
  assert.equal(rig.wp.children.length, 4);
  assert.equal(bow(rig, 'sword', 0, false, 0xffffff, 0, 1), false);
  assert.equal(bow({ ...rig, char: 'knight' }, 'bow', 0, false, 0xffffff, 0, 1), false);
  enabledSet.delete('ranger'); assert.equal(bow(rig, 'bow', 0, false, 0xffffff, 0, 1), false);
  for (const id of [...ids, 'shared']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, id, 'manifest.json'), 'utf8'));
    for (const [file, entry] of Object.entries(manifest.assets || {})) {
      const data = fs.readFileSync(path.join(root, id, file));
      assert.equal(data.length, entry.bytes, id + '/' + file + ' size');
      assert.equal(crypto.createHash('sha256').update(data).digest('hex'), entry.sha256, id + '/' + file + ' sha256');
      if (file.endsWith('.glb')) {
        assert.equal(data.readUInt32LE(0), 0x46546c67); assert.equal(data.readUInt32LE(4), 2);
        const jsonSize = data.readUInt32LE(12), gltf = JSON.parse(data.subarray(20, 20 + jsonSize).toString());
        assert.ok(gltf.skins && gltf.skins.length, id + ' skinned model');
        assert.ok(gltf.animations && gltf.animations.length, id + ' animation clips');
        for (const image of gltf.images || []) assert.ok(!image.uri || image.uri.startsWith('data:'), 'no external texture fetch');
        for (const buffer of gltf.buffers || []) assert.ok(!buffer.uri || buffer.uri.startsWith('data:'), 'no external buffer fetch');
      }
    }
    for (const [file, entry] of Object.entries(manifest.code || {})) {
      const data = fs.readFileSync(path.join(root, id, file));
      assert.equal(crypto.createHash('sha256').update(data).digest('hex'), entry.sha256, id + '/' + file + ' code sha256');
    }
  }
  console.log('PASS: 8 enabled combinations; zero eager/inactive actor asset loads; disabled/unknown guards; knight 0.1/0.04 timing and cancellation; ranger-only bow; GLB metadata and SHA256.');
})().catch(error => { console.error(error); process.exitCode = 1; });
