'use strict';
/* Run lifecycle: start, resume (saved run), end, pause, back to menu. */
const RUN_KEY = 'ashen_arena_run';
function saveRun() {
  if (COOP.on) return; // a co-op run can't be resumed alone
  if (!G || G.lab || (G.state !== 'play' && G.state !== 'paused' && G.state !== 'cards' && G.state !== 'count')) return;
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
        sk: G.sk,
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
        weapons: G.weapons.map(w => ({ id: w.id, lvl: w.lvl, evo: w.evo ? 1 : 0 })),
        specCd: G.specCd,
        potCd: G.potCd,
        pots: G.pots,
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
  const D = daily(),
    left = D.ids.filter(id => !D.done[id]).length;
  $('dailyBadge').hidden = !left;
  $('dailyBadge').textContent = left;
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
    state: 'count',
    countT: 3,
    t: +o.t || 0,
    kills: o.kills | 0,
    coins: o.coins | 0,
    lvl: Math.max(1, o.lvl | 0),
    xp: +o.xp || 0,
    pending: o.pending | 0,
    stage: o.stage | 0,
    wave: clamp(o.wave | 0, 0, 5),
    waveT: +o.waveT || 0,
    sk: o.sk | 0,
    cycle: o.cycle | 0,
    abyss: !!o.abyss,
    depth: o.depth | 0,
    bossesRun: o.bossesRun | 0,
    rerolls: o.rerolls | 0,
    revives: o.revives | 0,
    ups: o.ups || {},
    pacts: o.pacts || {},
    specCd: +o.specCd || 0,
    potCd: +o.potCd || 0,
    pots: clamp(o.pots | 0, 0, POT_MAX),
  });
  G.need = xpNeed(G.lvl);
  G.weapons = o.weapons
    .filter(w => WEP[w.id])
    .map(w => ({ id: w.id, lvl: clamp(w.lvl | 0, 1, 5), cd: 0.6, evo: w.evo && w.lvl >= 5 ? 1 : 0 }));
  if (!G.weapons.length) G.weapons = [{ id: CHARS[o.char].wep, lvl: 1, cd: 0.3 }];
  if (o.bossOn) {
    G.wave = 5;
    G.sk = 1e6; // its boss comes back as soon as the run goes on
  }
  if (o.bossRew) {
    G.bossDone = true;
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
/** What the skill tree gives at the start of every run (solo and co-op alike). */
function runPerks() {
  if (S.tree.U5) G.pending++; // a free upgrade card right away
  if (S.tree.W5) G.coins = 60;
}
function startRun() {
  AU.init();
  clearRun();
  newRun();
  G.state = 'play';
  enterArena();
  S.stats.runs++;
  runPerks();
  dailyTrack('run', 1);
  banner(
    STAGES[0].n,
    IN.touch
      ? 'اسحب بإصبعك في أي مكان للحركة\nالأسلحة تهاجم وحدها، وجرع الشفاء تلقاها بالبطاقات أو يطيحها الأعداء الأقوياء'
      : 'الأسهم للحركة، المسافة للمراوغة، حرف Q للضربة الخاصة، حرف R تشرب جرعة (إذا معك)\nالأسلحة تهاجم وحدها، واضغط الفأرة للتصويب اليدوي',
    4.5
  );
  for (let i = 0; i < 6; i++) spawnAround('grunt', false, rand(13, 18));
}
function endRun() {
  if (G.state === 'over') return;
  if (COOP.on) coopClose();
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
  setTimeout(profileSync, 500);
  // stat tiles; plain numbers count up from zero
  $('ovSum').innerHTML = '';
  const rows = [
    ['💀', 'الأعداء', G.kills],
    ['⭐', 'المستوى', G.lvl],
    ['⏱', 'الوقت', fmtT(G.t)],
    ['👑', 'زعماء هُزموا', G.bossesRun],
    ['🪙', 'العملات المحفوظة', kept + ' من ' + G.coins],
    ['🗺️', 'وصلت إلى', STAGES[G.stage].n + (G.abyss ? ' (العمق ' + (G.depth + 1) + ')' : ''), 1],
  ];
  for (const [icon, label, v, wide] of rows) {
    const tile = el('div', 'st' + (wide ? ' wide' : '')),
      b = el('b', '', v);
    tile.append(el('i', '', icon), b, el('span', '', label));
    $('ovSum').appendChild(tile);
    if (typeof v === 'number' && v > 0) countUp(b, v);
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
/** Freeze the game and count n..1 before play resumes (after a pause). */
function countIn(n) {
  G.state = 'count';
  G.countT = n;
}
/** Per frame (real time): the resume countdown and the calm after a boss. */
function updCount(dt) {
  const c = $('count');
  let n = 0,
    sub = '';
  if (G.state === 'count') {
    G.countT -= dt;
    if (G.countT <= 0) G.state = 'play';
    else n = Math.ceil(G.countT);
  } else if (G.state === 'play' && G.calmT > 0) {
    n = Math.ceil(G.calmT);
    sub = 'الجنود قادمون';
  }
  c.hidden = !n;
  if (n && c.dataset.n !== String(n)) {
    c.dataset.n = n;
    c.querySelector('b').textContent = n;
    c.querySelector('p').textContent = sub;
    pop(c.querySelector('b'), 'cnt');
    AU.play('tick');
  }
  if (!n) c.dataset.n = '';
}
function pause(on) {
  if (on) drawStats();
  if (COOP.on) {
    // co-op: the others keep fighting, nothing stops; the menu only offers to leave
    show('pause', on);
    return;
  }
  if (on && (G.state === 'play' || G.state === 'count')) {
    G.state = 'paused';
    show('pause', true);
    saveRun();
  } else if (!on && G.state === 'paused') {
    show('pause', false);
    countIn(3);
    show('settings', false);
  }
}
/** Animate an element's number from 0 to v (about 0.9 s). */
function countUp(elm, v) {
  const t0 = performance.now(),
    step = () => {
      const k = Math.min(1, (performance.now() - t0) / 900);
      elm.textContent = Math.round(v * (1 - Math.pow(1 - k, 3)));
      if (k < 1) setTimeout(step, 30);
    };
  elm.textContent = 0;
  setTimeout(step, 250);
}
