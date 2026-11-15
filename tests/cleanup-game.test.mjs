import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const files = [
  'js/core/utils.js', 'js/data/weapons.js', 'js/data/upgrades.js', 'js/data/enemies.js',
  'js/game/state.js', 'js/game/fx.js', 'js/game/spawning.js', 'js/game/combat.js',
  'js/game/specials.js', 'js/game/boss-ults.js', 'js/game/update.js',
  'js/game/enemy-ai.js', 'js/game/cards.js', 'js/game/run.js',
];
const sources = files.map(file => [file, fs.readFileSync(new URL(file, root), 'utf8')]);
const noop = () => {};
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

// No browser, network, real storage or WebGL: execute the actual game scripts.
function fixture() {
  const storage = new Map(), sounds = [], sparks = [], remoteHits = [], nodes = new Map();
  const denied = { get: false, set: false, remove: false };
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: '', hidden: false, dataset: {},
      classList: { add: noop, remove: noop },
      querySelector: sel => node(`${id}:${sel}`),
    });
    return nodes.get(id);
  }
  const context = vm.createContext({
    COOP: { on: false, host: true, hpMul: 1, cntMul: 1 },
    CHARS: { hero: { wep: 'sword', sp: 'shock', hp: 100, dmg: 1, spd: 6, crit: 0 } },
    STAGES: [{ n: 'Local fixture', bk: 0, boss: 'Fixture boss' }],
    S: { char: 'hero', tree: {}, perm: {}, set: { shake: 1 }, stats: {} },
    OBST: [], MUS: { i: 0 }, AU: { init: noop, play: s => sounds.push(s) },
    localStorage: {
      getItem(key) { if (denied.get) throw new Error('get denied'); return storage.get(key) ?? null; },
      setItem(key, value) { if (denied.set) throw new Error('set denied'); storage.set(key, value); },
      removeItem(key) { if (denied.remove) throw new Error('remove denied'); storage.delete(key); },
    },
    fetch() { throw new Error('network forbidden'); },
    $: node, pop: noop, dailyTrack: noop, checkAch: noop,
    vfxClear: noop, vfxP: noop, vfxMuzzle: noop, vfxKill: noop,
    vfxHit: (...args) => sparks.push(args), vfxSparks: noop,
    coopDmgF: () => 1, coopHitOut: (...args) => remoteHits.push(args),
    r1: v => Math.round(v * 10) / 10,
  });
  for (const [file, source] of sources) vm.runInContext(source, context, { filename: file, timeout: 1000 });
  context.enterArena = noop;
  const run = code => vm.runInContext(code, context, { timeout: 1000 });
  const json = code => JSON.parse(run(`JSON.stringify(${code})`));
  run("newRun(); G.state = 'play'; G.noWaves = true; G.achT = 1000; Math.random = () => 0.5;");
  return { context, storage, denied, sounds, sparks, remoteHits, nodes, run, json };
}

test('cleanup game: melee uses the explicit fire angle for damage and slash, not player facing', () => {
  const f = fixture();
  f.run("G.p.face = 1.23; var front = spawn('grunt', 0, 2); front.hp = front.maxHp = 1000; var behind = spawn('grunt', 0, -2); var beforeFront = front.hp; var beforeBehind = behind.hp; fire(G.weapons[0], Math.PI / 2);");
  near(f.run('beforeFront - front.hp'), f.run('WEP.sword.dmg * G.p.dmgMul'));
  assert.equal(f.run('behind.hp'), f.run('beforeBehind'));
  assert.equal(f.run('G.p.face'), 1.23);
  assert.equal(f.run('G.p.swing'), 1);
  near(f.run('G.slashes[0].a'), Math.PI / 2);
  assert.deepEqual(f.sounds, ['sword', 'hit']);
  assert.equal(f.sparks.length, 1);
});

test('cleanup game: projectile fire preserves angle, velocity, upgrade scaling and audiovisual effects', () => {
  const f = fixture();
  f.run("G.ups = { pspeed: 1, size: 1, pierce: 1 }; recalc(); G.weapons = [{ id: 'pistol', lvl: 1 }]; G.p.face = -0.7; fire(G.weapons[0], Math.PI / 2);");
  assert.equal(f.run('G.shots.length'), 1);
  near(f.run('G.shots[0].vx'), 0);
  near(f.run('G.shots[0].vz'), f.run('WEP.pistol.spd * G.p.pspd'));
  near(f.run('G.shots[0].r'), f.run('WEP.pistol.size * G.p.sizeMul'));
  assert.equal(f.run('G.shots[0].pierce'), f.run('WEP.pistol.pierce + G.p.pierceAdd'));
  assert.equal(f.run('G.p.face'), -0.7);
  assert.equal(f.run('G.p.swing'), 1);
  assert.deepEqual(f.sounds, ['pistol']);
});

test('cleanup game: ward fully absorbs a hit before HP, frost, knockback or coop dispatch', () => {
  const f = fixture();
  f.run("var e = spawn('grunt', 10, 0); var hp = e.hp; e.ward = 20; G.ups.frost = 1; COOP.on = true; COOP.host = false; hit(e, 12, { noCrit: 1, kb: 5, ang: 0 });");
  assert.equal(f.run('e.ward'), 8);
  assert.equal(f.run('e.hp'), f.run('hp'));
  assert.equal(f.run('e.flash'), 0.1);
  assert.equal(f.run('e.kx'), 0);
  assert.equal(f.run('e.slowT'), undefined);
  assert.equal(f.remoteHits.length, 0);
  assert.equal(f.sparks.length, 0);
});

test('cleanup game: partial ward absorption retains residual damage, frost and coop payload', () => {
  const f = fixture();
  f.run("var e = spawn('grunt', 10, 0); var hp = e.hp; e.ward = 5; G.ups.frost = 1; COOP.on = true; COOP.host = false; hit(e, 12, { noCrit: 1, kb: 5, ang: 0 });");
  assert.equal(f.run('e.ward'), 0);
  assert.equal(f.run('hp - e.hp'), 7);
  assert.equal(f.run('e.kx'), 5);
  assert.equal(f.run('e.slowT'), 2);
  assert.equal(f.remoteHits.length, 1);
  assert.equal(f.remoteHits[0][1], 7);
  assert.deepEqual(f.sounds, ['hit']);
  assert.equal(f.sparks.length, 1);
});

test('cleanup game: denied run storage contains exceptions without losing in-memory state', () => {
  const f = fixture();
  f.run('G.kills = 9; G.phoenixUsed = 1; saveRun();');
  const saved = f.storage.get('ashen_arena_run');
  f.denied.set = true;
  assert.doesNotThrow(() => f.run('G.kills = 10; saveRun();'));
  assert.equal(f.storage.get('ashen_arena_run'), saved);
  assert.equal(f.run('G.kills'), 10);
  assert.equal(f.run('G.phoenixUsed'), 1);
  f.denied.get = true;
  assert.equal(f.run('loadRun()'), null);
  f.denied.remove = true;
  assert.doesNotThrow(() => f.run('clearRun();'));
  assert.equal(f.storage.get('ashen_arena_run'), saved);
});

test('cleanup game: valid run save/load/resume, corrupt JSON and removal keep the storage contract', () => {
  const f = fixture();
  f.run('G.kills = 8; G.p.hp = 45; G.phoenixUsed = 1; saveRun();');
  assert.equal(f.run('loadRun().kills'), 8);
  f.run('G.kills = 0; resumeRun();');
  assert.equal(f.run('G.kills'), 8);
  assert.equal(f.run('G.p.hp'), 45);
  assert.equal(f.run('G.phoenixUsed'), 1);
  assert.equal(f.run('G.state'), 'count');
  f.storage.set('ashen_arena_run', '{broken');
  assert.equal(f.run('loadRun()'), null);
  assert.doesNotThrow(() => f.run('clearRun();'));
  assert.equal(f.storage.has('ashen_arena_run'), false);
});

test('cleanup game: documented quota endpoints and closure remain live across wave/cache changes', () => {
  const f = fixture();
  f.run('var first = stageQuota();');
  assert.equal(f.run('stageQuota() === first'), true);
  const ends = f.json('first.ends');
  assert.equal(ends.length, 6);
  assert.equal(f.run('first.total'), ends.at(-1));
  for (const [index, endpoint] of ends.entries()) {
    f.context.endpoint = endpoint;
    f.context.index = index;
    assert.equal(f.run('first.waveAt(endpoint - 1)'), index);
    if (index < ends.length - 1) assert.equal(f.run('first.waveAt(endpoint)'), index + 1);
  }
  f.run('G.wave = 3;');
  assert.equal(f.run('stageQuota() === first'), true);
  f.run('G.stage = 1; var next = stageQuota();');
  assert.equal(f.run('next === first'), false);
  assert.ok(f.run('next.total > first.total'));
  assert.deepEqual(f.json('first.ends'), ends);
  f.run('COOP.cntMul = 2;');
  assert.ok(f.run('stageQuota().total > next.total'));
});

test('cleanup game: retired dash length upgrade remains calculable and preview restores player state', () => {
  const f = fixture();
  f.run('G.ups.dashlen = 1; recalc();');
  near(f.run('G.p.dashLen'), 7.8);
  assert.equal(f.run('upWeight("dashlen", [60, 24, 9, 3])'), 0);
  const before = f.json('({ p: G.p, ups: G.ups, allies: G.allies })');
  assert.match(f.run('upPreview("dashlen")'), /7\.8م ← 9\.6م/);
  assert.deepEqual(f.json('({ p: G.p, ups: G.ups, allies: G.allies })'), before);
});

test('cleanup game: discarded aim and wardT fields are not recreated by a real attack', () => {
  const f = fixture();
  assert.equal(f.run('Object.hasOwn(G.p, "aim")'), false);
  f.run("var e = spawn('grunt', 0, 2); e.hp = e.maxHp = 1000; e.ward = 5; var hp = e.hp; fire(G.weapons[0], Math.PI / 2);");
  near(f.run('hp - e.hp'), f.run('WEP.sword.dmg * G.p.dmgMul - 5'));
  assert.equal(f.run('e.ward'), 0);
  assert.equal(f.run('G.slashes.length'), 1);
  assert.equal(f.sparks.length, 1);
  assert.equal(f.run('Object.hasOwn(G.p, "aim")'), false);
  assert.equal(f.run('Object.hasOwn(e, "wardT")'), false);
});

test('cleanup game: dynamically selected barrage retains buff, cooldown and skill-tree side effects', () => {
  const f = fixture();
  f.run("CHARS.hero.sp = 'barrage'; S.tree.S4 = 1; G.ups.super = 1; special();");
  assert.equal(f.run('G.buffT'), 6);
  assert.equal(f.run('buffMul("aspd")'), 2.2);
  assert.equal(f.run('G.specCd'), 20);
  assert.equal(f.run('G.p.inv'), 2);
  assert.equal(f.run('G.superT'), 8);
  assert.equal(f.run('G.rings.length'), 1);
  assert.deepEqual(f.sounds, ['special']);
  f.run('special();');
  assert.equal(f.run('G.rings.length'), 1, 'cooldown guard prevents a second dynamic invocation');
  assert.deepEqual(f.sounds, ['special']);
});

test('cleanup game: sand boss dynamically ticks its retained callback and accumulates projectiles', () => {
  const f = fixture();
  f.run('var e = { kind: 1, x: 3, z: 4, dmg: 10 }; BOSS_ULTS[e.kind].f(e, G.p); bossTick(e, G.p, 0.2);');
  near(f.run('e.ultT'), 2.8);
  assert.equal(f.run('G.eshots.length'), 3);
  for (const s of f.json('G.eshots')) {
    assert.equal(s.x, 3);
    assert.equal(s.z, 4);
    assert.equal(s.dmg, 4);
    near(Math.hypot(s.vx, s.vz), 8);
  }
  f.run('bossTick(e, G.p, 0.2);');
  assert.equal(f.run('G.eshots.length'), 9, 'the while loop catches up on accumulated time');
});
