import test from 'node:test';
import assert from 'node:assert/strict';
import { globals } from './helpers/globals.mjs';

async function targeted(pid = 'fixture-penalty-one') {
  const g = await globals();
  g.context.pid = pid;
  g.run(`S.pid=pid; S.name='لاعب اختبار'; S.coins=9000; S.sp=17;
    S.stats={...S.stats,kills:5000,bosses:102,bestTime:2403,bestLvl:67,wb:25,wkk:500,wt:2403,wft:134};
    S.tree=Object.fromEntries(TREE.flatMap(b=>b.nodes.map(n=>[n.id,1])));
    S.perm=Object.fromEntries(Object.entries(PERM).map(([k,v])=>[k,v.max]));
    S.board=[{n:'لاعب اختبار',b:12,k:10513},{n:'لاعب آخر',b:2,k:200}];
    S.chars=Object.fromEntries(Object.keys(CHARS).map(id=>[id,1])); S.char='mage'; S.ach={first:1}; S.gifts={claimed:1};`);
  g.run("playerPenaltyDecision = pid === 'unrelated-device' ? null : {pid,id:PLAYER_PENALTY_ID,skill_nodes:4,shop_levels:4,heroes:3}");
  return g;
}

test('owner decision removes four tree leaves and four shop ranks without a refund or level loss', async () => {
  for (const pid of ['fixture-penalty-one','fixture-penalty-two']) {
    const g = await targeted(pid);
    const total = g.run('Object.values(S.perm).reduce((a,b)=>a+b,0)');
    assert.deepEqual(g.json('applyPlayerPenalty(S)'), {skillsRemoved:4,shopLevelsRemoved:4,heroesRemoved:3});
    assert.equal(g.run('Object.keys(S.tree).length'),21);
    assert.equal(g.run('Object.values(S.perm).reduce((a,b)=>a+b,0)'),total-4);
    assert.equal(g.run('S.coins'),0);
    assert.equal(g.run('S.sp'),17);
    assert.equal(g.run('S.stats.bestLvl'),67);
    assert.equal(g.run('TREE.every(b=>b.nodes.every((n,i)=>!S.tree[n.id]||b.nodes.slice(0,i).every(q=>S.tree[q.id])))'),true);
    assert.deepEqual(g.json('[S.chars,S.char,S.ach,S.gifts]'),[{knight:1,ranger:1,gunner:1,mage:1},'mage',{first:1},{claimed:1}]);
    assert.deepEqual(g.json('S.board'),[{n:'لاعب آخر',b:2,k:200}]);
    assert.deepEqual(g.json('[S.stats.kills,S.stats.bosses,S.stats.bestTime,S.stats.wb,S.stats.wkk]'),[0,0,0,0,0]);
    assert.equal(g.events.network.length,0);
  }
});

test('normal reloads do not repeat a penalty or confiscate newly earned currency', async () => {
  const g = await targeted();
  g.run('applyPlayerPenalty(S); S.coins=150; S.tree.A5=1; S.perm.hp++; save()');
  const reloaded = await globals({stored:JSON.parse(g.storage.get('ashen_arena_v1'))});
  reloaded.run('playerPenaltyDecision={pid:S.pid,id:PLAYER_PENALTY_ID}');
  const before = reloaded.json('S');
  assert.equal(reloaded.run('applyPlayerPenalty(S)'),null);
  assert.deepEqual(reloaded.json('S'),before);
});

test('same-name bystanders are untouched and renaming cannot evade the device correction', async () => {
  const g = await targeted('unrelated-device');
  const before = g.json('S');
  assert.equal(g.run('applyPlayerPenalty(S)'),null);
  assert.deepEqual(g.json('S'),before);
  g.run(`S.pid='fixture-penalty-one'; S.name='اسم جديد'; playerPenaltyDecision={pid:S.pid,id:PLAYER_PENALTY_ID}`);
  assert.ok(g.run('applyPlayerPenalty(S)'));
  assert.equal(g.run('S.coins'),0);
});

test('sparse saves cannot go negative, and pre-penalty backups are migrated again', async () => {
  const g = await targeted();
  g.run('var oldBackup=JSON.stringify(S); S.tree={A1:1}; S.perm={hp:1}; S.sp=0');
  assert.deepEqual(g.json('applyPlayerPenalty(S)'),{skillsRemoved:1,shopLevelsRemoved:1,heroesRemoved:3});
  assert.deepEqual(g.json('[S.tree,S.perm,S.sp]'),[{},{},0]);
  g.run('S=JSON.parse(oldBackup)');
  assert.ok(g.run('applyPlayerPenalty(S)'));
  assert.equal(g.run('S.coins'),0);
});

test('hero withdrawal keeps the starter, switches a withdrawn active hero, and never repeats older deductions', async () => {
  const g = await targeted();
  g.run("S.char='gunnerx'; S.penalties[PLAYER_PENALTY_ID]={skillsRemoved:4,shopLevelsRemoved:4}; S.coins=150");
  assert.deepEqual(g.json('applyPlayerPenalty(S)'),{skillsRemoved:4,shopLevelsRemoved:4,heroesRemoved:3});
  assert.equal(g.run('S.char'),'knight');
  assert.equal(g.run('S.coins'),150);
  assert.equal(g.run('Object.keys(S.tree).length'),25);
  assert.equal(g.run('applyPlayerPenalty(S)'),null);
  g.run("S.penalties={}; S.chars={knight:1,ranger:1}; S.char='ranger'");
  assert.equal(g.run('applyPlayerPenalty(S).heroesRemoved'),1);
  assert.deepEqual(g.json('S.chars'),{knight:1});
  assert.equal(g.run('S.char'),'knight');
});

test('enforcement discards old checkpoints so deleted results cannot be resumed', async () => {
  const g = await targeted();
  g.storage.set('ashen_arena_run',JSON.stringify({kills:10513,lvl:67}));
  assert.ok(g.run('enforcePlayerPenalty()'));
  assert.equal(g.storage.has('ashen_arena_run'),false);
  assert.equal(JSON.parse(g.storage.get('ashen_arena_v1')).coins,0);
  assert.equal(g.run('playerPenaltyReceipt(S)'), '2026-11-17-fair-play');
  assert.equal(g.run('enforcePlayerPenalty()'),null);
});

test('corrected scores use the device-key RPC; other players retain the existing endpoint', async () => {
  for (const pid of ['fixture-penalty-one','unrelated-device']) {
    const g = await targeted(pid);
    g.context.profileKey = () => 'local-test-device-key';
    g.run('applyPlayerPenalty(S)');
    await g.run('sendOnline({n:S.name,k:100,l:10,t:60,b:2})');
    assert.equal(g.events.network.length,1);
    const [url,options] = g.events.network[0];
    const body = JSON.parse(options.body);
    if (pid === 'fixture-penalty-one') {
      assert.ok(url.endsWith('/rpc/submit_penalized_score'));
      assert.equal(body.p_pid,pid);
      assert.equal(body.p_key,'local-test-device-key');
      assert.equal(body.p_penalty,'2026-11-17-fair-play');
      assert.equal(body.p_name,undefined);
    } else {
      assert.ok(url.endsWith('/rpc/submit_score'));
      assert.equal(body.p_name,'لاعب اختبار');
      assert.equal(body.p_key,undefined);
    }
  }
});

test('decision lookup authenticates this device and applies only the returned decision', async () => {
  const g = await targeted();
  g.run("S.pkey='local-fixture-secret'");
  let request;
  g.context.api = async (path,options) => {
    request = {path,body:JSON.parse(options.body)};
    assert.equal(g.node('mPlay').disabled,true);
    return {id:'2026-11-17-fair-play',skill_nodes:4,shop_levels:4,heroes:3,reset_coins:true};
  };
  assert.ok(await g.run('refreshPlayerPenalty()'));
  assert.deepEqual(request,{path:'/rest/v1/rpc/get_player_penalty',body:{p_pid:'fixture-penalty-one',p_key:'local-fixture-secret'}});
  assert.equal(g.run('S.coins'),0);
  assert.equal(g.run('playerPenaltyReady'),true);
  assert.equal(g.node('mPlay').disabled,false);
});

test('no decision or offline lookup preserves a bystander and releases the menu', async () => {
  for (const offline of [false,true]) {
    const g = await targeted('unrelated-device');
    g.run("S.pkey='local-fixture-secret'");
    const before = g.json('S');
    g.context.api = async () => {if(offline)throw Error('offline');return null;};
    assert.equal(await g.run('refreshPlayerPenalty()'),null);
    assert.deepEqual(g.json('S'),before);
    assert.equal(g.run('playerPenaltyReady'),true);
    assert.equal(g.node('mResume').disabled,false);
  }
});

test('revision 2 clears the point bank and reconciles rebuilt ranks without repeating coins, stats or hero withdrawal', async () => {
  const g=await targeted();
  g.run(`applyPlayerPenalty(S);S.coins=150;S.stats.kills=46;S.tree.A5=1;S.tree.D5=1;S.perm.hp=10;S.perm.dmg=10;
    playerPenaltyDecision={pid:S.pid,id:PLAYER_PENALTY_ID,revision:2,reset_skill_points:true,skill_node_limit:21,shop_levels:4,shop_types:4};`);
  const beforeHeroes=g.json('S.chars');
  const receipt=g.json('applyPlayerPenalty(S)');
  assert.equal(g.run('S.sp'),0);
  assert.equal(g.run('Object.keys(S.tree).length'),21);
  assert.equal(g.run('penaltyShopRanks(S.perm)'),10);
  assert.equal(receipt.shopTypesRemoved.length,4);
  assert.equal(g.run('S.coins'),150);
  assert.equal(g.run('S.stats.kills'),46);
  assert.deepEqual(g.json('S.chars'),beforeHeroes);
  assert.equal(receipt.revision,2);
  assert.equal(receipt.treeReconciled,2);
  assert.equal(receipt.skillPointsCleared,17);
  g.run('S.sp=5;S.coins=250;S.tree.A5=1;S.perm.hp=1;');
  const after=g.json('S');
  assert.equal(g.run('applyPlayerPenalty(S)'),null);
  assert.deepEqual(g.json('S'),after);
});

test('revision 2 first install applies the original deductions and zero points, while complete old deductions remain intact', async () => {
  const g=await targeted();
  g.run(`playerPenaltyDecision={...playerPenaltyDecision,revision:2,reset_skill_points:true,skill_node_limit:21,shop_types:4}`);
  const receipt=g.json('applyPlayerPenalty(S)');
  assert.equal(g.run('S.sp'),0);
  assert.equal(g.run('S.coins'),0);
  assert.deepEqual(receipt.report,{skill_points:0,coins:0,tree_nodes:21,shop_ranks:10,shop_types:2,heroes:4});
  const old=await targeted();
  old.run(`applyPlayerPenalty(S);playerPenaltyDecision={...playerPenaltyDecision,revision:2,reset_skill_points:true,skill_node_limit:21,shop_types:4}`);
  const state=old.json('[S.tree,S.chars]');
  old.run('applyPlayerPenalty(S)');
  assert.deepEqual(old.json('[S.tree,S.chars]'),state);
  assert.equal(old.run('Object.keys(S.perm).length'),2);
  assert.equal(old.run('S.sp'),0);
});

test('revision 2 acknowledgement sends the saved migration state, not a second deduction after offline play', async () => {
  const g=await targeted();
  g.run(`S.pkey='local-fixture-secret';playerPenaltyDecision={...playerPenaltyDecision,revision:2,reset_skill_points:true,skill_node_limit:21}`);
  const calls=[];
  let failAck=true;
  g.context.api=async(path,options)=>{
    const body=JSON.parse(options.body);calls.push({path,body});
    if(path.endsWith('get_player_penalty'))return {id:'2026-11-17-fair-play',revision:2,reset_skill_points:true,skill_node_limit:21,skill_nodes:4,shop_levels:4,shop_types:4,heroes:3};
    if(failAck)throw Error('offline');return true;
  };
  assert.ok(await g.run('refreshPlayerPenalty()'));
  assert.equal(g.run('S.sp'),0);
  g.run('S.sp=4;S.coins=123');failAck=false;
  assert.equal(await g.run('refreshPlayerPenalty()'),null);
  assert.equal(g.run('S.sp'),4);
  assert.equal(g.run('S.coins'),123);
  assert.equal(calls.at(-1).path,'/rest/v1/rpc/ack_player_penalty');
  assert.equal(calls.at(-1).body.p_receipt.report.skill_points,0);
  assert.equal(calls.at(-1).body.p_revision,2);
});
