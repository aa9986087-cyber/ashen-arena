import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { globals } from './helpers/globals.mjs';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await fs.readFile(new URL('test/modular-config.json', root), 'utf8'));
const release = `test/releases/${config.release}/`;
async function fixture(count) {
  const g = await globals();
  const noop = () => {};
  Object.assign(g.context, {
    COOP:{on:false,host:true,hpMul:1,cntMul:1}, OBST:[], eSrc:0,
    coopDmgF:()=>1, parts:noop,text:noop,ring:noop,vfxKill:noop,
  });
  for (const file of ['js/game/spawning.js', 'js/game/enemy-ai.js'])
    new vm.Script(await fs.readFile(new URL(release+file,root),'utf8'),{filename:release+file}).runInContext(g.context);
  // The shared test-build fix is loaded separately, just as it is in the served bundle.
  const helper = new URL('test/tools/modular-runtime/shaman-healing.js',root);
  new vm.Script(await fs.readFile(helper,'utf8')).runInContext(g.context);
  g.run(`newRun(); G.state='play'; G.god=true; G.noWaves=true; G.p.crit=0;
    Math.random=()=>0.5;
    var victim=spawn('grunt',0,2); victim.hp=victim.maxHp=500; victim.spd=0;
    var healers=[];`);
  g.context.count = count;
  g.run(`for(let i=0;i<count;i++){const e=spawn('shaman',3,2);e.spd=0;e.cd=0;healers.push(e);}`);
  return g;
}

test('sustained solo damage remains lethal with eight overlapping healers', async () => {
  const g=await fixture(8);
  g.run(`for(let frame=0;frame<600&&!victim.dead;frame++){
    G.t+=0.05; hit(victim,5,{noCrit:1,quiet:1,aoe:1}); updEnemies(0.05);
  }`);
  assert.equal(g.run('victim.dead'),true,'100 damage/second must not be cancelled by stacking healer pulses');
  assert.equal(g.run('G.kills'),1);
  assert.equal(g.run('Number.isFinite(victim.hp)'),true);
});

test('a second healer cannot bypass the shared cooldown, including on later frames', async () => {
  const g=await fixture(1);
  g.run('victim.hp=100; G.t=0; updEnemies(0);');
  assert.equal(g.run('victim.hp'),250,'one healer retains its original 30% heal');
  g.run(`victim.hp=100; G.t=1;
    var second=spawn('shaman',3,2);second.spd=0;second.cd=0;updEnemies(0);`);
  assert.equal(g.run('victim.hp'),100,'staggered healers share the same recipient cooldown');
  g.run('G.t=4.5; healers[0].cd=0; second.cd=0; updEnemies(0);');
  assert.equal(g.run('victim.hp'),250,'healing resumes once after the original 4.5 seconds');
});

test('healing still excludes bosses, dead allies, self, full health and out-of-range targets', async () => {
  const g=await fixture(1);
  g.run('victim.frz=1'); // Keep the fixture boss stationary; its attack AI is unrelated to allied healing.
  for(const mode of ['boss','dead','far','full']) {
    g.context.mode=mode;
    g.run(`victim.dead=mode==='dead';victim.boss=mode==='boss';victim.x=mode==='far'?20:0;
      victim.hp=mode==='full'?500:100;healers[0].cd=0;G.t+=5;updEnemies(0);`);
    assert.equal(g.run('victim.hp'),mode==='full'?500:100,mode);
  }
  g.run('healers[0].hp=1;healers[0].cd=0;G.t+=5;updEnemies(0);');
  assert.equal(g.run('healers[0].hp'),1);
});
