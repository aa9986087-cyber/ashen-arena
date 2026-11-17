import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { globals } from './helpers/globals.mjs';
const root = new URL('../', import.meta.url);
const config = JSON.parse(await fs.readFile(new URL('test/modular-config.json', root), 'utf8'));
const release = `test/releases/${config.release}/`;
const graveTest = config.enabledExpansions?.includes('gravebound') ? test : test.skip;
async function fixture() {
  const sources = {};
  for (const name of ['combat', 'run']) sources[`js/game/${name}.js`] = await fs.readFile(new URL(release + `js/game/${name}.js`, root), 'utf8');
  const g = await globals({ sources });
  const noop = () => {};
  Object.assign(g.context, { COOP: { on: false, host: true, hpMul: 1, cntMul: 1, bossMul: 1 },
    OBST: [], eSrc: 0, coopDmgF: () => 1, bossMesh: { visible: false }, GEO: { boss0: {} }, MUS: {}, CM: { el: null },
    parts: noop, text: noop, ring: noop, vfxKill: noop, shake: noop, cine: noop, banner: noop, vfxHit: noop,
    vfxHeal: noop, vfxSparks: noop, vfxSmoke: noop, vfxBolt: noop, r1:value=>Math.round(value*10)/10,
    ASHEN_ADDONS:{queueMelee:fn=>fn()},
    enterArena: noop, buildPlayer: noop, setStage: noop });
  g.node('bossbar').querySelector = () => ({ textContent: '' });
  for (const name of ['spawning', 'boss-ults', 'progression', 'update', 'enemy-ai'])
    new vm.Script(await fs.readFile(new URL(release + `js/game/${name}.js`, root), 'utf8')).runInContext(g.context);
  new vm.Script(await fs.readFile(new URL('test/expansions/oath-warden/combat.js',root),'utf8')).runInContext(g.context);
  for (const name of ['data', 'gameplay'])
    new vm.Script(await fs.readFile(new URL(`test/expansions/gravebound/${name}.js`, root), 'utf8')).runInContext(g.context);
  g.run(`S.coins=60000; S.sp=150; S.char='reaper'; S.chars.reaper=1; newRun(); Math.random=()=>0.5;`);
  return g;
}
graveTest('grave shop spends both existing currencies atomically, rejects stale purchases and equips only one owned relic', async () => {
  const g = await fixture();
  assert.equal(g.run(`graveBuy('training','soulvessel',0)`), true);
  assert.deepEqual(g.json('[S.coins,S.sp,S.grave.training.soulvessel,UP.soulvessel.off,UP.soulvessel.max]'), [58800,147,1,1,3]);
  assert.equal(g.run(`graveBuy('training','soulvessel',0)`), false);
  g.run('S.sp=0');
  assert.equal(g.run(`graveBuy('training','soulguard',0)`), false);
  assert.equal(g.run('S.coins'), 58800);
  g.run('S.sp=150');
  assert.equal(g.run(`graveEquip('lantern')`), false);
  assert.equal(g.run(`graveBuy('relics','warden',0)`), true);
  assert.equal(g.run(`graveBuy('relics','lantern',0)`), true);
  assert.equal(g.run(`graveEquip('lantern')`), true);
  assert.equal(g.run('S.grave.active'), 'lantern');
  g.run(`newRun();G.state='play'`);
  assert.equal(g.run(`graveEquip('warden')`), false);
  assert.equal(g.run(`graveBuy('training','soulvessel',1)`), false);
});
graveTest('direct shop upgrades never require run cards; unknown profile fields cannot poison saved ranks', async () => {
  const g = await fixture();
  assert.equal(g.run(`upWeight('soulguard',[60,24,9,3])`), 0);
  g.run(`graveBuy('training','soulguard',0);newRun();G.state='play'`);
  assert.equal(g.run(`upWeight('soulguard',[60,24,9,3])`),0);
  assert.equal(g.run(`reaperRank('soulguard')`),1);
  g.run(`G.ups.soulguard=1`);
  assert.equal(g.run(`upWeight('soulguard',[60,24,9,3])`), 0);
  g.run(`S.grave={training:{soulvessel:Infinity,soulcourt:999},relics:{lantern:-1},active:'lantern'};graveSyncTraining()`);
  assert.deepEqual(g.json('[S.grave.training.soulvessel,S.grave.training.soulcourt,S.grave.active]'), [0,3,'']);
});
graveTest('souls and ghosts are bounded; special consumes souls and shield expires without stacking', async () => {
  const g = await fixture();
  g.run(`S.char='knight';graveState().relic='lantern';G.state='play';G.ups={soulvessel:3,soulguard:3,soulcourt:3,soulflame:3};graveCollect(500)`);
  assert.equal(g.run('graveState().souls'), 24);
  g.run('graveRelease(100)');
  assert.equal(g.run('graveState().souls'), 0);
  assert.equal(g.run('graveState().ghosts.length'), 2);
  const shield = g.run('graveState().barrier');
  assert.ok(shield > 0 && shield <= g.run('G.p.maxHp*0.2') + 1e-8);
  g.run('graveCollect(500);graveRelease(100)');
  assert.equal(g.run('graveState().ghosts.length'), 3);
  assert.equal(g.run('graveState().barrier'), shield);
  g.run('G.t+=9;graveTick(0.05)');
  assert.equal(g.run('graveState().barrier'), 0);
  g.run('graveTick(15)');
  assert.equal(g.run('graveState().ghosts.length'), 0);
});
graveTest('real save/resume retains the run relic, resources and ghost lifetime; old abyss checkpoints migrate', async () => {
  const g = await fixture();
  g.run(`graveBuy('relics','lantern',0);graveBuy('relics','warden',0);graveEquip('lantern');newRun();G.state='play';G.t=30;S.char='knight';G.ups.soulcourt=1;graveCollect(9);graveRelease(100);graveCollect(5);saveRun();`);
  const snap = g.json('loadRun()');
  assert.equal(snap.grave.souls, 5); assert.equal(snap.grave.ghosts.length, 1);
  g.run(`G.state='menu';graveEquip('warden');resumeRun()`);
  assert.deepEqual(g.json('[S.char,G.grave.relic,G.grave.rank,G.grave.souls,G.grave.ghosts[0].life]'), ['knight','lantern',1,5,8]);
  g.run(`var old=loadRun();old.abyss=true;old.stage=6;delete old.grave;localStorage.setItem(RUN_KEY,JSON.stringify(old));resumeRun()`);
  assert.equal(g.run('STAGES[G.stage].abyss'), true);
});
graveTest('seventh boss is reachable before ending; grave dig locks its warning destination and stays damageable', async () => {
  const g = await fixture();
  g.run(`G.state='play';G.stage=5;nextStage()`);
  assert.equal(g.run('G.stage'), 6);
  assert.equal(g.run('STAGES[G.stage].bk'), 6);
  g.run(`var boss=makeBoss(6,10,0);boss.graveDig=0;graveBossAI(boss,G.p,0.05);var target=boss.gravePhase.tx;G.p.x=7;graveBossAI(boss,G.p,0.05)`);
  assert.equal(g.run('boss.kind'), 6);
  assert.equal(g.run('boss.gravePhase.tx===target'), true);
  assert.ok(g.run('G.zones[0].d') >= 1.8);
  const hp = g.run('boss.hp');
  g.run(`hit(boss,20,{noCrit:1,quiet:1});`);
  assert.ok(g.run('boss.hp') < hp);
  g.run('G.stage=6;nextStage()');
  assert.equal(g.run('G.state'), 'ending');
});

graveTest('preview backup round-trips but the actual production importer rejects preview credit and heroes', async () => {
  const g = await fixture();
  new vm.Script(await fs.readFile(new URL(release+'js/ui/backup.js',root),'utf8')).runInContext(g.context);
  const code = g.run('backupCode()');
  assert.ok(code.startsWith('AT1-'));
  g.context.code = code;
  assert.equal(g.run('readBackup(code).char'), 'reaper');
  const prod = await globals();
  new vm.Script(await fs.readFile(new URL('js/ui/backup.js',root),'utf8')).runInContext(prod.context);
  prod.context.code = code;
  assert.equal(prod.run('readBackup(code)'), null);
  prod.context.code = code.replace('AT1-','AS1-');
  assert.equal(prod.run('readBackup(code)'), null);
});

graveTest('warden preserves prior ownership and purchase ranks; guard and pending special survive resume',async()=>{
 const g=await fixture();
 g.run(`graveBuy('training','soulvessel',0);newRun();G.state='play';G.t=20;G.p.face=0;var d=wardenBlockDamage(100,{x:0,z:3});graveRelease(100);saveRun();resumeRun();G.state='play'`);
 assert.equal(g.run('S.char'),'reaper');assert.equal(g.run('CHARS.reaper.n'),'حارس العهد');
 assert.equal(g.run('reaperRank("soulvessel")'),1);assert.equal(g.run('d'),35);
 assert.equal(g.run('G.grave.warden.guardReadyAt'),21.2);
 assert.ok(g.run('G.grave.warden.cleave.power')>0);
});
graveTest('warden overhead strike hits both sides only on impact with extra damage in front',async()=>{
 const g=await fixture();
 g.run(`G.state='play';G.p.face=0;var front=spawn('grunt',0,3),back=spawn('grunt',0,-3);front.hp=back.hp=10000;graveRelease(100)`);
 assert.equal(g.run('back.hp'),10000);assert.equal(g.run('front.hp'),10000);
 g.run('G.t+=0.3;wardenTick();wardenTick()');
 assert.ok(g.run('front.hp<back.hp && back.hp<10000'));assert.equal(g.run('G.grave.warden.cleave'),null);
});
