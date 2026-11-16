import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '../..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'test/modular-config.json'), 'utf8'));
const release = path.join(root, 'test/releases', cfg.release);
const manifest = JSON.parse(fs.readFileSync(path.join(release, 'manifest.json'), 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
assert.deepEqual(manifest.enabledAddons, cfg.enabledAddons);
assert.equal(manifest.sourceKind, 'production-root');
for (const [file, hash] of Object.entries(manifest.baseHashes)) {
  assert.equal(sha(fs.readFileSync(path.join(root, file))), hash, 'production source changed: ' + file);
}
assert.equal(execFileSync('git', ['diff', '--name-only', '--', 'index.html', 'js', 'css', 'assets', 'test/js', 'test/css', 'test/assets'], { cwd: root, encoding: 'utf8' }), '', 'production or legacy test altered');
const before = sha(fs.readFileSync(path.join(release, 'app.min.js')));
const rebuild = spawnSync('python3', ['test/tools/build-modular-test.py'], { cwd: root, encoding: 'utf8' });
assert.notEqual(rebuild.status, 0, 'must refuse an existing release');
assert.match(rebuild.stderr, /Release already exists/);
assert.equal(sha(fs.readFileSync(path.join(release, 'app.min.js'))), before);
const generatedMain = fs.readFileSync(path.join(release, 'js/main.js'), 'utf8');
assert.match(generatedMain, /resumeAddonBossIntro\(\)/);
assert.match(generatedMain, /ASHEN_ADDONS.clearMelee\(\)/);
const generatedCombat = fs.readFileSync(path.join(release, 'js/game/combat.js'), 'utf8');
assert.match(generatedCombat, /queueMelee\(\(\) => \{\s+AU.play\(w.id\)/);
assert.match(generatedCombat, /if \(!d.melee\) AU.play\(w.id\)/);
const hooks = fs.readFileSync(path.join(root, 'test/tools/modular-runtime/hooks.js'), 'utf8');
async function context() {
  let resolveLoad;
  const pending = new Promise(resolve => { resolveLoad = resolve; });
  const boss = { kind: 0, dead: false };
  const x = vm.createContext({ console, Promise, calls: 0,
    G: { state: 'play', boss }, CINE: { on: false, pending: false }, S: { char: 'mage' },
    ASHEN_ADDONS: { enabled: id => id === 'forest-guardian', clearMelee() {}, descriptor() {} },
    ACTOR_MODELS: { diagnostics: () => ({}) }, COOP: { on: false }, DUEL: { on: false }, bossMesh: { visible: true },
    newRun() { x.G = { state: 'menu', boss: null }; }, buildPlayer() {}, heroPortrait() {}, enterArena() {},
    bossIntroStart() { x.calls++; x.CINE.on = true; return true; },
    bossIntroEligible() { return x.G.state === 'play'; }, loadBossActor() { return pending; }, actorBossHide() {},
  });
  vm.runInContext(hooks, x);
  return { x, boss, resolveLoad };
}
{
  const { x, boss, resolveLoad } = await context();
  assert.equal(x.bossIntroStart(boss), true); assert.equal(x.CINE.pending, true);
  x.G.state = 'paused'; resolveLoad([true]); await new Promise(r => setImmediate(r));
  assert.equal(x.CINE.pending, true); assert.equal(x.calls, 0);
  x.G.state = 'play'; x.resumeAddonBossIntro();
  assert.equal(x.calls, 1); assert.equal(x.CINE.pending, false);
}
{
  const { x, boss, resolveLoad } = await context(); x.bossIntroStart(boss); x.newRun();
  resolveLoad([true]); await new Promise(r => setImmediate(r));
  assert.equal(x.calls, 0); assert.equal(x.CINE.pending, false);
}
{
  const { x, boss, resolveLoad } = await context(); x.bossIntroStart(boss); x.G.boss = { kind: 0 };
  resolveLoad([true]); await new Promise(r => setImmediate(r));
  assert.equal(x.calls, 0); assert.equal(x.CINE.pending, false);
}
{
  const { x, boss, resolveLoad } = await context(); x.bossIntroStart(boss);
  resolveLoad([false]); await new Promise(r => setImmediate(r));
  assert.equal(x.calls, 1); assert.equal(x.CINE.pending, false);
}
console.log(`PASS: ${Object.keys(manifest.baseHashes).length} production hashes; no production/legacy edits; immutable release; newest frame hooks/audio; guardian pause/new-run/replaced-boss/failure cases.`);
