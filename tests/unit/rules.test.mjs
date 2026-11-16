import test from 'node:test';
import assert from 'node:assert/strict';
import { globals } from '../helpers/globals.mjs';
import { scriptOrder } from '../helpers/project.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('shared pure/data scripts execute in index order in one VM global scope', async () => {
  const g = await globals();
  assert.deepEqual(
    g.loaded,
    (await scriptOrder()).filter(f => g.loaded.includes(f))
  );
  assert.equal(
    g.run('typeof TAU + ":" + typeof WEP + ":" + typeof S + ":" + typeof rankCmp'),
    'number:object:object:function'
  );
  assert.equal(g.events.network.length, 0);
});

test('utils clamp, wrapped angles, rotation, time and bounded random', async () => {
  const g = await globals();
  assert.deepEqual(g.json('[clamp(-2,0,10),clamp(8,0,10),clamp(12,0,10)]'), [0, 8, 10]);
  near(g.run('wrapAng(5*Math.PI)'), Math.PI);
  near(g.run('wrapAng(-5*Math.PI)'), -Math.PI);
  near(g.run('angDiff(0,TAU-0.2)'), 0.2);
  const rotated = g.json('rotate(1,0,Math.PI/2)');
  near(rotated[0], 0);
  near(rotated[1], 1);
  assert.deepEqual(g.json('[fmtT(0),fmtT(59.9),fmtT(61),fmtT(600)]'), ['0:00', '0:59', '1:01', '10:00']);
  g.run('Math.random = () => 0.5');
  assert.equal(g.run('rand(2,6)'), 4);
  assert.equal(g.run('pick(["a","b","c"])'), 'b');
});

test('codes round-trip Arabic and emoji with URL-safe encoding and embedded text', async () => {
  const g = await globals();
  const code = g.run('packCode("AR1", ["فارس 🔥", "120", "4", "65", "1"], "salt")');
  assert.match(code, /^AR1-[A-Za-z0-9_-]+$/);
  g.context.code = code;
  assert.deepEqual(g.json('unpackCode("AR1", "رسالة " + code + "\\nنهاية", 5, "salt")'), [
    'فارس 🔥',
    '120',
    '4',
    '65',
    '1',
  ]);
  assert.equal(g.run('unb64(b64("عربي 🌍"))'), 'عربي 🌍');
  assert.equal(g.run('sig("hello")'), 'm3bicr');
});

test('codes reject tampering, wrong salt/count/prefix and malformed input', async () => {
  const g = await globals();
  g.run(
    'var code = packCode("AR1", ["name","12"], "salt"); var tampered = "AR1-" + b64(unb64(code.slice(4)).replace("12", "99"))'
  );
  for (const expr of [
    'unpackCode("AR1",tampered,2,"salt")',
    'unpackCode("AR1",code,2,"wrong")',
    'unpackCode("AR1",code,3,"salt")',
    'unpackCode("GF1",code,2,"salt")',
    'unpackCode("AR1","AR1-_",2,"salt")',
    'unpackCode("AR1",null,2,"salt")',
  ])
    assert.equal(g.run(expr), null, expr);
});

test('fresh saves are independent and include the starter hero/weapons', async () => {
  const g = await globals();
  assert.equal(g.run('S.ver'), 2);
  assert.equal(g.run('S.char'), 'knight');
  assert.deepEqual(g.json('S.chars'), { knight: 1 });
  assert.deepEqual(g.json('S.weps'), { sword: 1, pistol: 1 });
  assert.equal(g.run('var fresh = defSave(); fresh.stats.kills = 50; defSave().stats.kills'), 0);
});

test('v1 save migration clears old permanent upgrades but preserves currency and heroes', async () => {
  const g = await globals({
    stored: {
      coins: 900,
      perm: { hp: 3 },
      chars: { knight: 1, ranger: 1 },
      char: 'ranger',
      stats: { kills: 12 },
      set: { sfx: 0.2 },
    },
  });
  assert.deepEqual(g.json('S.perm'), {});
  assert.equal(g.run('S.ver'), 2);
  assert.equal(g.run('S._mig'), 1);
  assert.equal(g.run('S.coins'), 900);
  assert.equal(g.run('S.chars.ranger'), 1);
  assert.equal(g.run('S.stats.kills'), 12);
  assert.equal(g.run('S.stats.runs'), 0);
  assert.equal(g.run('S.set.sfx'), 0.2);
  assert.equal(g.run('S.set.mus'), 0.5);
});

test('v2 save keeps permanent upgrades, fills nested defaults and persists locally', async () => {
  const g = await globals({ stored: { ver: 2, coins: 123, perm: { hp: 2 }, stats: { kills: 9 } } });
  assert.equal(g.run('S.perm.hp'), 2);
  assert.equal(g.run('S._mig'), undefined);
  g.run('save()');
  const saved = JSON.parse(g.storage.get('ashen_arena_v1'));
  assert.equal(saved.coins, 123);
  assert.equal(saved.stats.kills, 9);
  assert.equal(saved.stats.bosses, 0);
  assert.equal(g.events.writes, 1);
});

test('corrupt JSON or denied storage falls back safely; failed save does not throw', async () => {
  for (const opts of [{ stored: '{broken' }, { deniedStorage: true }]) {
    const g = await globals(opts);
    assert.equal(g.run('S.coins'), 0);
    assert.doesNotThrow(() => g.run('save()'));
  }
});

test('heroes reference real weapons and specials with valid numeric starting stats', async () => {
  const g = await globals();
  assert.deepEqual(
    g.json(
      'Object.entries(CHARS).filter(([id,c]) => !WEP[c.wep] || !SPECIALS[c.sp] || !(c.hp>0 && c.spd>0 && c.dmg>0 && c.cost>=0))'
    ),
    []
  );
  assert.equal(g.run('CHARS.knight.cost'), 0);
  assert.ok(g.run('Object.keys(CHARS).length') > 0);
});

test('all weapons have complete evolutions that point to an enabled upgrade', async () => {
  const g = await globals();
  assert.deepEqual(g.json('Object.keys(WEP).sort()'), g.json('Object.keys(EVO).sort()'));
  assert.deepEqual(
    g.json(
      'Object.entries(WEP).filter(([id,w]) => !(w.dmg>0 && w.cd>0 && w.range>0 && w.cost>=0) || w.evo.length!==2 || !UP[EVO[id].up] || UP[EVO[id].up].off)'
    ),
    []
  );
  assert.deepEqual(g.json('[wTier(1),wTier(2),wTier(3),wTier(4),wTier(5)]'), [0, 0, 1, 1, 2]);
});

test('upgrade families/tree/mission/achievement IDs are unique and references valid', async () => {
  const g = await globals();
  assert.equal(
    g.run('var ids=PATHS.flatMap(p=>p.steps); ids.length===new Set(ids).size && ids.every(id=>UP[id] && PATH_OF[id])'),
    true
  );
  assert.equal(
    g.run('var treeIds=TREE.flatMap(b=>b.nodes.map(n=>n.id)); treeIds.length===new Set(treeIds).size'),
    true
  );
  assert.equal(
    g.run('MISSIONS.length===new Set(MISSIONS.map(m=>m.id)).size && MISSIONS.every(m=>m.goal>0 && m.c>=0)'),
    true
  );
  assert.equal(
    g.run('ACH.length===new Set(ACH.map(a=>a.id)).size && ACH.every(a=>typeof a.t==="function" && a.c>=0)'),
    true
  );
});

test('derived hero stats combine shop/tree/upgrades; armor is capped and hp clamped', async () => {
  const g = await globals();
  g.run('newRun(); S.perm={hp:2,dmg:2}; S.tree={D1:1,A1:1}; G.ups={hp:1,dmg:1,armor:99}; G.p.hp=999; recalc()');
  assert.equal(g.run('G.p.maxHp'), 178);
  assert.equal(g.run('G.p.hp'), 178);
  near(g.run('G.p.dmgMul'), 1.22 * 1.12);
  assert.equal(g.run('G.p.armor'), 0.4);
  assert.ok(g.run('xpNeed(10)>xpNeed(2) && xpNeed(2)>xpNeed(1)'));
});

test('card slots and weights exclude retired/maxed/new overflow cards without blocking owned ones', async () => {
  const g = await globals();
  g.run('newRun(); G.ups={fire:1,bolt:1,nova:1,orbit:1,shield:1,dash:1}');
  assert.equal(g.run('ownedUps(true).length'), 6);
  assert.equal(g.run('upWeight("aura",[60,24,9,3])'), 0);
  assert.ok(g.run('upWeight("fire",[60,24,9,3])') > 0);
  assert.equal(g.run('upWeight("dashlen",[60,24,9,3])'), 0);
  g.run('G.ups.fire=UP.fire.max');
  assert.equal(g.run('upWeight("fire",[60,24,9,3])'), 0);
  assert.equal(g.run('isSkill("luck")'), false);
});

test('eligible full evolution is in the actual card pool and already evolved weapons are excluded', async () => {
  const g = await globals();
  g.run('newRun(); G.weapons=[{id:"sword",lvl:5}]; G.ups.fire=1');
  assert.equal(g.run('rollCards(100,0).some(c=>c.k==="evo" && c.id==="sword")'), true);
  g.run('G.weapons[0].evo=1');
  assert.equal(g.run('rollCards(100,0).some(c=>c.k==="evo")'), false);
});

test('upgrade preview restores stats/upgrades/allies rather than mutating the real run', async () => {
  const g = await globals();
  g.run('newRun()');
  const before = g.json('({p:G.p,ups:G.ups,allies:G.allies})');
  assert.match(g.run('upPreview("hp")'), /120 ← 138/);
  assert.deepEqual(g.json('({p:G.p,ups:G.ups,allies:G.allies})'), before);
});

test('rank comparator prioritizes bosses, kills, fewer runs, then time; level does not rank', async () => {
  const g = await globals();
  assert.ok(g.run('rankCmp({b:2,k:0,r:20},{b:1,k:999,r:1})') < 0);
  assert.ok(g.run('rankCmp({b:2,k:10,r:20},{b:2,k:9,r:1})') < 0);
  assert.ok(g.run('rankCmp({b:2,k:10,r:1,t:90},{b:2,k:10,r:2,t:1})') < 0);
  assert.ok(g.run('rankCmp({b:2,k:10,r:1,t:8},{b:2,k:10,r:1,t:9})') < 0);
  assert.equal(g.run('rankCmp({l:99},{l:1})'), 0);
  assert.equal(g.run('rankCmp({}, {})'), 0);
});

test('score codes reject invalid numeric data and local scores retain only improved entries', async () => {
  const g = await globals();
  assert.deepEqual(g.json('readCode(mkCode({n:"فارس",k:3,l:2,t:65.9,b:1}))'), { n: 'فارس', k: 3, l: 2, t: 65, b: 1 });
  assert.equal(g.run('readCode(packCode("AR1",["name","NaN","2","3","1"],"#vamos"))'), null);
  assert.equal(g.run('addScore({n:"a",b:1,k:8,l:2,t:30})'), true);
  assert.equal(g.run('addScore({n:"a",b:0,k:99,l:99,t:1})'), false);
  assert.equal(g.run('addScore({n:"a",b:2,k:1,l:1,t:90})'), true);
  assert.equal(g.run('S.board.length'), 1);
  assert.equal(g.run('S.board[0].b'), 2);
  g.run('for(let i=0;i<40;i++) addScore({n:"n"+i,b:i,k:1,l:1,t:1})');
  assert.equal(g.run('S.board.length'), 30);
  assert.equal(g.run('S.board[0].b'), 39);
  assert.equal(g.events.network.length, 0);
});

test('daily missions are deterministic, distinct by kind, reward once, and lab runs do not count', async () => {
  const g = await globals();
  g.run('newRun()');
  const ids = g.json('daily().ids');
  g.run('S.daily=null');
  assert.deepEqual(g.json('daily().ids'), ids);
  assert.equal(g.run('new Set(daily().ids.map(id=>missionById(id).k)).size'), 3);
  g.run('S.daily={day:todayKey(),ids:["boss3"],prog:{},done:{}}; dailyTrack("boss",3); dailyTrack("boss",3)');
  assert.equal(g.run('S.coins'), 380);
  assert.equal(g.run('S.sp'), 1);
  g.run('S.daily.prog={}; S.daily.done={}; G.lab=true; dailyTrack("boss",3)');
  assert.deepEqual(g.json('S.daily.prog'), {});
  assert.equal(g.run('S.coins'), 380);
});

test('opening the hall draws it and asks for the online board exactly once', async () => {
  const g = await globals();
  g.run(
    'var boardDraws=0,boardLoads=0; drawBoard=()=>{boardDraws++}; loadOnline=()=>{boardLoads++}; menuState=()=>{}; go("board")'
  );
  assert.equal(g.node('board').hidden, false);
  assert.equal(g.node('menu').hidden, true);
  assert.equal(g.run('boardDraws'), 1);
  assert.equal(g.run('boardLoads'), 1);
  g.run('go("menu")');
  for (const fn of g.events.timers) fn();
  assert.equal(g.node('menu').hidden, false);
  assert.equal(g.node('board').hidden, true);
  assert.equal(g.events.network.length, 0); // the stub stands in for the real fetch
});
