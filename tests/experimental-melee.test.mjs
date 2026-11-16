import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../test/js/game/combat.js', import.meta.url), 'utf8');
function harness() {
  const g = { state: 'play', t: 0, p: {}, meleeSwings: [], enemies: [] };
  const c = vm.createContext({ G: g, COOP: { on: false } });
  vm.runInContext(code, c);
  const run = s => vm.runInContext(s, c);
  return { g, c, run };
}

test('experimental melee batches two victims on the same simulation impact', () => {
  const { g, run } = harness();
  g.enemies = [{ hp: 1 }, { hp: 1 }];
  run('queueMeleeImpact(() => { for (const e of G.enemies) e.hp = 0; });');
  assert.deepEqual(g.enemies.map(e => e.hp), [1, 1]);
  g.t = 0.039; run('updateMeleeImpacts()');
  assert.deepEqual(g.enemies.map(e => e.hp), [1, 1]);
  g.t = 0.04; run('updateMeleeImpacts()');
  assert.deepEqual(g.enemies.map(e => e.hp), [0, 0]);
  assert.equal(g.meleeSwings.length, 0);
});

test('experimental melee mirror and same-frame weapons do not restart the visual cycle', () => {
  const { g, run } = harness();
  run('G.hits = 0; queueMeleeImpact(() => G.hits++);');
  const cycle = g.p.meleeVisual;
  run('queueMeleeImpact(() => G.hits++);');
  assert.equal(g.p.meleeVisual, cycle);
  assert.equal(g.meleeSwings.length, 1);
  g.t = 0.04; run('updateMeleeImpacts()');
  assert.equal(g.hits, 2);
  g.t = 0.05; run('queueMeleeImpact(() => G.hits++);');
  assert.equal(g.p.meleeVisual, cycle);
  assert.equal(g.meleeSwings[0].start, 0.1);
  g.t = 0.1; run('updateMeleeImpacts()');
  assert.notEqual(g.p.meleeVisual, cycle);
  g.t = 0.14; run('updateMeleeImpacts()');
  assert.equal(g.hits, 3);
});

test('experimental melee cannot damage during pause, death, or a replacement round', () => {
  const { g, c, run } = harness();
  run('G.hits = 0; queueMeleeImpact(() => G.hits++);');
  g.t = 0.06; g.state = 'pause'; run('updateMeleeImpacts()');
  assert.equal(g.hits, 0);
  g.state = 'play'; g.p.dead = true; run('updateMeleeImpacts()');
  assert.equal(g.hits, 0);
  c.G = { state: 'play', t: 1, p: {}, hits: 0 };
  run('updateMeleeImpacts()');
  assert.equal(c.G.hits, 0);
  assert.equal(g.hits, 0);
});

test('experimental timing is not a wall-clock timeout and locomotion cannot reset attack speed', () => {
  assert.doesNotMatch(code, /setTimeout\(applyMelee/);
  const actor = fs.readFileSync(new URL('../test/js/render/actor-models.js', import.meta.url), 'utf8');
  assert.match(actor, /knightLayers/);
  assert.match(actor, /upper\.time = .*cycle\.start/);
  const pose = actor.slice(actor.indexOf('  function pose('), actor.indexOf('  function destroyBoss('));
  assert.doesNotMatch(pose, /setEffectiveTimeScale/);
});
