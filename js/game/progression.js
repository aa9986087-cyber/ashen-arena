'use strict';
/* Boss defeat, stage progression, the ending/abyss choice and achievements. */
/** Remove the boss bar/mesh and boss music state. */
function hideBoss() {
  G.bossOn = false;
  G.boss = null;
  bossMesh.visible = false;
  $('bossbar').hidden = true;
  MUS.boss = false;
}
function bossDown(e) {
  hideBoss();
  dailyTrack('boss', 1);
  G.slow = 1.2;
  shake(1);
  ring(e.x, e.z, 1, 16, 0.9, [1, 0.8, 0.3]);
  parts(e.x, 2, e.z, 80, 1, 0.75, 0.2, 16, 0.4, 1.2);
  for (const q of G.enemies)
    if (!q.dead && q !== e) {
      q.dead = true;
      parts(q.x, 1, q.z, 4, 1, 0.5, 0.3, 6, 0.2);
      drop(q.x, q.z, 0, q.xp);
    }
  G.eshots.length = 0;
  G.zones = G.zones.filter(z => z.f);
  for (let i = 0; i < (S.tree.W4 ? 24 : 12); i++) drop(e.x + rand(-3, 3), e.z + rand(-3, 3), 1, 4 + G.stage * 2);
  drop(e.x, e.z, 0, e.xp);
  drop(e.x, e.z + 1, 2, 40);
  for (const q of G.picks) q.mag = true;
  G.bossesRun++;
  S.stats.bosses++;
  S.stats.maxBoss = Math.max(S.stats.maxBoss, G.bossesRun);
  S.sp++;
  save();
  if (G.abyss) S.stats.abyss = (S.stats.abyss || 0) + 1;
  toast('هزمت ' + G.bossName + '. نقطة مهارة ✨ +1');
  G.bossReward = 1.6;
}
function nextStage() {
  if (G.abyss) G.depth++;
  else if (G.stage >= 5) {
    if (COOP.on) {
      coopEnd(true); // co-op: the last boss falls, the whole team wins together
      return true;
    }
    G.state = 'ending';
    showEnding();
    return true;
  } else G.stage++;
  G.wave = 0;
  G.waveT = 0;
  G.ringT = 12;
  G.calmT = 5; // five quiet seconds before the next stage's soldiers march in
  if (!G.abyss) setStage(G.stage);
  heal(G.p.maxHp * 0.3);
  if (COOP.on) coopStageCleared(); // the fallen rise again
  banner(
    G.abyss ? 'العمق ' + (G.depth + 1) : STAGES[G.stage].n,
    G.abyss ? 'الظلام يشتد' : 'المرحلة ' + (G.stage + 1),
    3
  );
}
function showEnding() {
  MUS.boss = false;
  AU.play('legend');
  cine('النهاية؟');
  $('endStats').textContent = 'الوقت ' + fmtT(G.t) + '، الأعداء ' + G.kills + '، المستوى ' + G.lvl;
  $('endTaunt').textContent = pick(TAUNTS).replace('{k}', G.kills);
  $('hud').hidden = true;
  show('ending', true);
}
$('endGo').onclick = () => {
  show('ending', false);
  $('hud').hidden = false;
  G.abyss = true;
  G.depth = 0;
  G.stage = STAGES.length - 1;
  G.wave = 0;
  G.waveT = 0;
  G.ringT = 8;
  setStage(G.stage);
  G.p.hp = G.p.maxHp;
  G.p.inv = 2.5;
  G.state = 'play';
  AU.play('boss');
  shake(1);
  banner('الهاوية', 'ما فيه نهاية هنا. بس كم تصمد.', 4);
  saveRun();
};
$('endExit').onclick = () => {
  show('ending', false);
  G.won = true;
  G.state = 'play';
  endRun();
};
function checkAch() {
  for (const a of ACH) {
    if (S.ach[a.id]) continue;
    if (a.t(S.stats, S)) {
      S.ach[a.id] = 1;
      S.coins += a.c;
      S.sp += a.sp;
      toast('🏆 ' + a.n + ': +' + a.c + ' 🪙' + (a.sp ? ' و ✨ +' + a.sp : ''));
      AU.play('win');
      save();
    }
  }
}
