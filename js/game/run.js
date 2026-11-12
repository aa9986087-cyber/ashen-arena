'use strict';
/* Run lifecycle: start, resume (saved run), end, pause, back to menu. */
const RUN_KEY = 'ashen_arena_run';
function saveRun() {
  if (!G || G.lab || (G.state !== 'play' && G.state !== 'paused' && G.state !== 'cards')) return;
  const p = G.p,
    inCards = G.state === 'cards';
  try {
    localStorage.setItem(
      RUN_KEY,
      JSON.stringify({
        v: 1,
        char: S.char,
        t: G.t,
        kills: G.kills,
        coins: G.coins,
        lvl: G.lvl,
        xp: G.xp,
        pending: G.pending + (inCards && G.cardMode === 'level' ? 1 : 0),
        stage: G.stage,
        wave: G.wave,
        waveT: G.waveT,
        cycle: G.cycle,
        abyss: G.abyss,
        depth: G.depth,
        bossOn: G.bossOn,
        bossRew: (inCards && G.cardMode === 'boss') || G.bossReward > 0,
        bossesRun: G.bossesRun,
        rerolls: G.rerolls,
        revives: G.revives,
        ups: G.ups,
        pacts: G.pacts,
        weapons: G.weapons.map(w => ({ id: w.id, lvl: w.lvl })),
        specCd: G.specCd,
        hp: p.hp,
        shield: p.shield,
        legCount: p.legCount,
      })
    );
  } catch (e) {}
}
function clearRun() {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch (e) {}
}
function loadRun() {
  try {
    const o = JSON.parse(localStorage.getItem(RUN_KEY));
    return o && o.v === 1 && CHARS[o.char] && STAGES[o.stage] && Array.isArray(o.weapons) ? o : null;
  } catch (e) {
    return null;
  }
}
function menuState() {
  const r = loadRun();
  $('mResume').hidden = !r;
  if (r) $('mResume').textContent = 'أكمل جولتك: المستوى ' + r.lvl + '، ' + fmtT(r.t);
  $('mPlayT').textContent = r ? 'جولة جديدة' : 'ابدأ المعركة';
}
function resumeRun() {
  const o = loadRun();
  if (!o) {
    startRun();
    return;
  }
  AU.init();
  S.char = o.char;
  newRun();
  Object.assign(G, {
    state: 'play',
    t: +o.t || 0,
    kills: o.kills | 0,
    coins: o.coins | 0,
    lvl: Math.max(1, o.lvl | 0),
    xp: +o.xp || 0,
    pending: o.pending | 0,
    stage: o.stage | 0,
    wave: clamp(o.wave | 0, 0, 5),
    waveT: +o.waveT || 0,
    cycle: o.cycle | 0,
    abyss: !!o.abyss,
    depth: o.depth | 0,
    bossesRun: o.bossesRun | 0,
    rerolls: o.rerolls | 0,
    revives: o.revives | 0,
    ups: o.ups || {},
    pacts: o.pacts || {},
    specCd: +o.specCd || 0,
  });
  G.need = xpNeed(G.lvl);
  G.weapons = o.weapons.filter(w => WEP[w.id]).map(w => ({ id: w.id, lvl: clamp(w.lvl | 0, 1, 5), cd: 0.6 }));
  if (!G.weapons.length) G.weapons = [{ id: CHARS[o.char].wep, lvl: 1, cd: 0.3 }];
  if (o.bossOn) {
    G.wave = 5;
    G.waveT = 23;
  }
  if (o.bossRew) {
    G.waveT = 0;
    G.bossReward = 0.8;
  }
  recalc();
  G.p.hp = clamp(+o.hp || 1, 1, G.p.maxHp);
  G.p.shield = Math.min(+o.shield || 0, G.p.shieldMax);
  G.p.legCount = o.legCount | 0;
  G.p.inv = 2.5;
  enterArena();
  banner('أكملت من حيث توقفت', STAGES[G.stage].n + (o.bossOn ? '\nالزعيم سيعود بعد لحظات' : ''), 3);
}
/** Build the arena for the current G and switch from menus to the HUD. */
function enterArena() {
  $('bSpec').firstChild.textContent = heroSpecial().i;
  setStage(G.stage);
  buildPlayer();
  refreshLoadout();
  goTok++;
  hideScreens();
  $('hud').hidden = false;
  $('bossbar').hidden = true;
  bossMesh.visible = false;
  MUS.on = true;
  MUS.boss = false;
}
function startRun() {
  AU.init();
  clearRun();
  newRun();
  G.state = 'play';
  enterArena();
  S.stats.runs++;
  banner(
    STAGES[0].n,
    IN.touch
      ? 'اسحب بإصبعك في أي مكان للحركة\nالأسلحة تهاجم وحدها'
      : 'WASD للحركة، Space للمراوغة، Q للضربة الخاصة\nالأسلحة تهاجم وحدها، واضغط الفأرة للتصويب اليدوي',
    4.5
  );
  for (let i = 0; i < 6; i++) spawnAround('grunt', false, rand(13, 18));
}
function endRun() {
  if (G.state === 'over') return;
  G.state = 'over';
  clearRun();
  MUS.on = false;
  MUS.boss = false;
  AU.play(G.won ? 'win' : 'over');
  const kept = G.lab ? 0 : Math.floor(G.coins * (S.tree.U3 || G.won ? 1 : 0.7));
  S.coins += kept;
  S.stats.bestLvl = Math.max(S.stats.bestLvl, G.lvl);
  S.stats.bestTime = Math.max(S.stats.bestTime, G.t);
  lastRun = { n: S.name || 'لاعب', k: G.kills, l: G.lvl, t: G.t | 0, b: G.bossesRun };
  if (G.lab) {
    $('ovTitle').textContent = 'انتهت تجربة المختبر';
  } else {
    const rec = addScore(lastRun);
    $('ovTitle').textContent = G.won
      ? rec
        ? 'خرجت منتصراً برقم قياسي!'
        : 'خرجت منتصراً'
      : G.abyss
        ? rec
          ? 'ابتلعتك الهاوية، برقم قياسي!'
          : 'ابتلعتك الهاوية'
        : rec
          ? 'رقم قياسي جديد!'
          : 'سقطت في الساحة';
    sendOnline(S.board.find(x => x.n === lastRun.n) || lastRun);
  }
  checkAch();
  save();
  $('ovSum').innerHTML = '';
  const rows = [
    ['الوقت', fmtT(G.t)],
    ['الأعداء', G.kills],
    ['المستوى', G.lvl],
    ['وصلت إلى', STAGES[G.stage].n + (G.abyss ? ' (العمق ' + (G.depth + 1) + ')' : '')],
    ['زعماء هُزموا', G.bossesRun],
    ['العملات المحفوظة', kept + ' من ' + G.coins],
  ];
  for (const r of rows) {
    const a = document.createElement('span');
    a.textContent = r[0];
    const b = document.createElement('b');
    b.textContent = r[1];
    $('ovSum').append(a, b);
  }
  $('hud').hidden = true;
  show('cards', false);
  show('pause', false);
  show('over', true);
}
function toMenu() {
  G.state = 'menu';
  MUS.on = false;
  $('hud').hidden = true;
  bossMesh.visible = false;
  newRun();
  setStage(0);
  buildPlayer();
  go('menu');
}
function pause(on) {
  if (on && G.state === 'play') {
    G.state = 'paused';
    show('pause', true);
    saveRun();
  } else if (!on && G.state === 'paused') {
    G.state = 'play';
    show('pause', false);
    show('settings', false);
  }
}
