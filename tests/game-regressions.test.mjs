import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const files = [
  'js/core/utils.js',
  'js/data/enemies.js',
  'js/data/upgrades.js',
  'js/game/state.js',
  'js/game/combat.js',
  'js/game/spawning.js',
  'js/game/enemy-ai.js',
  'js/game/update.js',
  'js/game/run.js',
  'js/content/actors/registry.js',
];
const sources = files.map(file => [file, fs.readFileSync(new URL(file, root), 'utf8')]);
const noop = () => {};

// Execute the actual classic scripts, including newRun/recalc; only external
// UI/audio/VFX boundaries and persistent storage are replaced by local fixtures.
function fixture() {
  const storage = new Map();
  const events = { deaths: 0, phoenix: 0 };
  const context = vm.createContext({
    COOP: { on: false, host: true, hpMul: 1, cntMul: 1 },
    CINE: {}, PM: {}, graveSaveRun: () => null, graveRestoreRun: noop,
    graveAbsorb: damage => damage,
    CHARS: { hero: { wep: 'sword', hp: 100, dmg: 1, spd: 6, crit: 0 } },
    WEP: { sword: {} },
    STAGES: [{ n: 'Fixture arena' }],
    S: { char: 'hero', tree: {}, perm: {}, set: {}, stats: {} },
    OBST: [],
    MUS: { i: 0 },
    AU: { init: noop, play: noop },
    eSrc: 0,
    localStorage: {
      setItem: (key, value) => storage.set(key, value),
      getItem: key => storage.get(key) ?? null,
      removeItem: key => storage.delete(key),
    },
    coopDmgF: () => 1,
    buffMul: () => 1,
    vfxClear: noop,
    parts: noop,
    text: noop,
    ring: noop,
    shake: noop,
    banner: noop,
    cine: noop,
    pop: noop,
    $: () => ({}),
    vfxSparks: noop,
    vfxPhoenix: () => events.phoenix++,
    vfxExplosion: noop,
  });
  for (const [file, source] of sources) vm.runInContext(source, context, { filename: file });
  // Resume must not build a WebGL scene; a death must not submit a score.
  context.enterArena = noop;
  context.endRun = () => {
    events.deaths++;
    vm.runInContext("G.state = 'over'", context);
  };
  vm.runInContext("newRun(); G.state = 'play'; G.weapons = []; G.noWaves = true; G.achT = 1000;", context);
  return { context, storage, events, run: code => vm.runInContext(code, context) };
}

function close(actual, expected, message = '') {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} != ${expected}`);
}

function dashDistance(keys, joy) {
  const f = fixture();
  if (joy) f.run(`IN.joy = 1; IN.jx = ${joy[0]}; IN.jz = ${joy[1]};`);
  else f.context.keys = keys;
  if (!joy) f.run('IN.k = keys;');
  f.run('update(0); dash(); update(0.05);');
  return f.run('Math.hypot(G.p.x, G.p.z)');
}

test('keyboard input stores the already-normalized diagonal movement vector', () => {
  const f = fixture();
  f.run('IN.k = { KeyD: true, KeyS: true }; update(0);');
  close(f.run('IN.mvx'), Math.SQRT1_2, 'x');
  close(f.run('IN.mvz'), Math.SQRT1_2, 'z');
});

test('straight and diagonal keyboard dashes cover equal distances', () => {
  const straight = dashDistance({ KeyD: true });
  const diagonal = dashDistance({ KeyD: true, KeyS: true });
  close(straight, 6 * 0.05 / 0.18, 'straight dash');
  close(diagonal, straight, 'diagonal dash');
});

test('partial stick preserves normal movement strength but dashes at full distance', () => {
  const f = fixture();
  f.run('IN.joy = 1; IN.jx = 0.3; IN.jz = 0.4; update(0.1);');
  close(f.run('G.p.x'), 0.3 * 6 * 0.1, 'partial x');
  close(f.run('G.p.z'), 0.4 * 6 * 0.1, 'partial z');
  close(f.run('IN.mvx'), 0.3, 'input strength x');
  close(f.run('IN.mvz'), 0.4, 'input strength z');
  close(dashDistance(null, [0.3, 0.4]), dashDistance({ KeyD: true }), 'partial stick dash');
});

test('dash keeps the facing fallback and cooldown/in-progress guards', () => {
  const f = fixture();
  f.run('G.p.face = 0.7; dash();');
  close(f.run('G.p.dx'), Math.sin(0.7), 'facing x');
  close(f.run('G.p.dz'), Math.cos(0.7), 'facing z');
  f.run('IN.mvx = 1; IN.mvz = 0; dash();');
  close(f.run('G.p.dx'), Math.sin(0.7), 'active dash guard');
  f.run('G.p.dashT = 0; dash();');
  close(f.run('G.p.dx'), Math.sin(0.7), 'cooldown guard');
});

function frostEnemy(frost, globalSlow = 0) {
  const f = fixture();
  f.run(`G.ups.frost = ${frost}; G.tslowT = ${globalSlow};`);
  f.run("globalThis.enemy = spawn('grunt', 10, 0, false); hit(enemy, 1, { noCrit: 1, quiet: 1 });");
  return f;
}

test('a noncritical frost hit halves enemy movement and decrements slowT', () => {
  const ordinary = frostEnemy(0);
  const chilled = frostEnemy(1);
  assert.equal(chilled.run('enemy.slowT'), 2);
  ordinary.run('updEnemies(0.1);');
  chilled.run('updEnemies(0.1);');
  close(chilled.run('10 - enemy.x'), ordinary.run('10 - enemy.x') * 0.5, 'frost movement');
  close(chilled.run('enemy.slowT'), 1.9, 'frost timer');
  assert.equal(chilled.run('enemy.frz || 0'), 0);
});

test('frost timer expires at zero and ordinary speed resumes', () => {
  const f = frostEnemy(1);
  f.run('for (let i = 0; i < 8; i++) updEnemies(0.25);');
  assert.equal(f.run('enemy.slowT'), 0);
  const before = f.run('enemy.x');
  f.run('updEnemies(0.1);');
  close(before - f.run('enemy.x'), 3.4 * 0.1, 'speed after expiry');
  f.run('enemy.slowT = 0.01; updEnemies(0.1);');
  assert.equal(f.run('enemy.slowT'), 0, 'timer does not underflow');
});

test('frost remains independent of global time slow and does not scale knockback', () => {
  const ordinary = frostEnemy(0);
  const global = frostEnemy(0, 4);
  const both = frostEnemy(1, 4);
  for (const f of [ordinary, global, both]) f.run('updEnemies(0.1);');
  close(global.run('10 - enemy.x'), ordinary.run('10 - enemy.x') * 0.5, 'global slow unchanged');
  close(both.run('10 - enemy.x'), ordinary.run('10 - enemy.x') * 0.25, 'independent slow factors');
  assert.equal(both.run('G.tslowT'), 4, 'enemy update does not change global timer');
  const pushed = frostEnemy(1);
  pushed.run('enemy.kx = 2; updEnemies(0.1);');
  close(pushed.run('enemy.x - 10'), (-3.4 * 0.5 + 2) * 0.1, 'unscaled knockback');
});

test('freeze still blocks movement/attacks while the frost timer elapses', () => {
  const f = frostEnemy(1);
  f.run('enemy.frz = 1; enemy.burn = 1; enemy.cd = 3; updEnemies(0.1);');
  assert.equal(f.run('enemy.x'), 10);
  assert.equal(f.run('enemy.cd'), 3);
  assert.equal(f.run('enemy.burn'), 1, 'existing frozen burn behavior unchanged');
  close(f.run('enemy.frz'), 0.9, 'freeze timer');
  close(f.run('enemy.slowT'), 1.9, 'frost timer while frozen');
});

test('critical frost hits retain their separate freeze effect', () => {
  const f = fixture();
  f.run("G.ups.frost = 1; G.p.crit = 1; globalThis.enemy = spawn('grunt', 10, 0); hit(enemy, 1, { quiet: 1 });");
  close(f.run('enemy.frz'), 0.6, 'critical freeze');
  assert.equal(f.run('enemy.slowT'), 2);
  f.run('updEnemies(0.1);');
  assert.equal(f.run('enemy.x'), 10);
});

function savedPhoenix(used) {
  const f = fixture();
  f.run(`G.weapons = [{ id: 'sword', lvl: 1 }]; G.ups.phoenix = 1; G.phoenixUsed = ${used}; saveRun();`);
  return f;
}

test('save/load/resume retains the spent phoenix flag', () => {
  const f = savedPhoenix(1);
  assert.equal(f.run('loadRun().phoenixUsed'), 1, 'saved spent flag');
  f.run('resumeRun();');
  assert.equal(f.run('G.phoenixUsed'), 1, 'restored spent flag');
  assert.equal(f.run('G.ups.phoenix'), 1);
  assert.deepEqual([...f.storage.keys()], ['ashen_arena_run'], 'existing run key');
});

test('a resumed spent phoenix cannot grant a second resurrection', () => {
  const f = savedPhoenix(1);
  f.run("resumeRun(); G.state = 'play'; G.p.hp = 1; G.p.inv = 0; hurt(10);");
  assert.equal(f.events.deaths, 1, 'spent phoenix allows ordinary death');
  assert.equal(f.events.phoenix, 0, 'no second phoenix effect');
  assert.equal(f.run('G.p.hp'), 0);
});

test('unused phoenix survives resume and is consumed exactly once', () => {
  const f = savedPhoenix(0);
  assert.equal(f.run('loadRun().phoenixUsed'), 0, 'saved unused flag');
  f.run("resumeRun(); G.state = 'play'; G.p.hp = 1; G.p.inv = 0; hurt(10);");
  assert.equal(f.run('G.phoenixUsed'), 1);
  assert.equal(f.run('G.p.hp'), 100);
  assert.equal(f.events.phoenix, 1);
  f.run('G.p.hp = 1; G.p.inv = 0; hurt(10);');
  assert.equal(f.events.deaths, 1);
  assert.equal(f.events.phoenix, 1);
});

test('legacy run without phoenixUsed defaults to unused', () => {
  const f = savedPhoenix(0);
  f.run('const legacy = loadRun(); delete legacy.phoenixUsed; localStorage.setItem(RUN_KEY, JSON.stringify(legacy)); G.phoenixUsed = 1; resumeRun();');
  assert.equal(f.run('G.phoenixUsed'), 0);
});

test('circle helper preserves inside/boundary/origin and projects outside points', () => {
  const f = fixture();
  assert.equal(f.run('typeof clampToCircle'), 'function');
  for (const [x, z, radius, expectedX, expectedZ] of [
    [0, 0, 5, 0, 0],
    [1, -2, 5, 1, -2],
    [3, 4, 5, 3, 4],
    [6, 8, 5, 3, 4],
    [-6, -8, 5, -3, -4],
  ]) {
    const point = f.run(`clampToCircle({ x: ${x}, z: ${z} }, ${radius})`);
    close(point.x, expectedX, 'circle x');
    close(point.z, expectedZ, 'circle z');
  }
});

test('spawn and recycle share only the ARENA + 3 projection', () => {
  const f = fixture();
  assert.equal(f.run('typeof clampToCircle'), 'function');
  const helper = f.run('clampToCircle');
  const calls = [];
  f.context.clampToCircle = (point, radius) => {
    calls.push(radius);
    return helper(point, radius);
  };
  const spawned = f.run("spawn('grunt', 122, 0, false)");
  close(spawned.x, 61, 'spawn boundary');
  close(spawned.z, 0, 'spawn direction');
  f.run('Math.random = () => 0; G.p.x = 50; recycleEnemy(G.enemies[0]);');
  close(spawned.x, 61, 'recycle boundary');
  assert.deepEqual(calls, [61, 61], 'only the two equivalent sites call the helper');
});

test('player ARENA and moving-enemy ARENA + 4 remain distinct', () => {
  const f = fixture();
  f.run('G.p.x = 100; update(0);');
  close(f.run('G.p.x'), 58, 'player boundary');
  f.run("G.p.x = 0; globalThis.enemy = spawn('grunt', 61, 0); enemy.x = 70; updEnemies(0);");
  close(f.run('enemy.x'), 62, 'moving enemy boundary');
});
