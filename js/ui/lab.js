'use strict';
/* Test lab (debug tools): enabled in the Claude preview or with #lab in the URL. */
function labBtn(parent, label, fn, isOn) {
  const b = el('button', 'btn' + (isOn && isOn() ? ' on' : ''), label);
  b.onclick = () => {
    fn();
    if (isOn) b.classList.toggle('on', !!isOn());
  };
  parent.appendChild(b);
  return b;
}
function clearField() {
  for (const e of G.enemies) e.dead = true;
  G.enemies.length = 0;
  G.eshots.length = 0;
  G.zones = G.zones.filter(z => z.f);
  if (G.boss) hideBoss();
}
function buildLab() {
  const M = $('labMon'),
    B = $('labBoss'),
    St = $('labStage'),
    T = $('labTools');
  M.innerHTML = B.innerHTML = St.innerHTML = T.innerHTML = '';
  for (const k in EN)
    labBtn(M, MON_N[k] || k, () => {
      for (let i = 0; i < 3; i++) spawnAround(k, false, rand(9, 13));
      closeLab();
    });
  labBtn(M, '⭐ نخبة عشوائي', () => {
    spawnAround(pick(Object.keys(EN)), true, 11);
    closeLab();
  });
  STAGES.filter(q => !q.abyss).forEach(q =>
    labBtn(B, q.boss, () => {
      clearField();
      G.forceBoss = q.bk;
      spawnBoss();
      G.forceBoss = null;
      G.wave = 5;
      closeLab();
    })
  );
  STAGES.forEach((q, i) =>
    labBtn(St, q.n, () => {
      clearField();
      G.abyss = !!q.abyss;
      G.depth = 0;
      G.stage = i;
      G.wave = 0;
      G.waveT = 0;
      setStage(i);
      banner(q.n, '', 1.5);
      closeLab();
    })
  );
  labBtn(
    T,
    '🛡️ لا تموت',
    () => {
      G.god = !G.god;
    },
    () => G.god
  );
  labBtn(
    T,
    '⏸ إيقاف الموجات',
    () => {
      G.noWaves = !G.noWaves;
    },
    () => G.noWaves
  );
  labBtn(
    T,
    '🐢 حركة بطيئة',
    () => {
      G.slowmo = !G.slowmo;
    },
    () => G.slowmo
  );
  labBtn(T, '🧹 امسح الأعداء', () => {
    clearField();
    closeLab();
  });
  labBtn(T, '⬆️ +3 مستويات', () => {
    G.pending += 3;
    closeLab();
  });
  labBtn(T, '💥 أعطني صفقة', () => {
    closeLab();
    G.state = 'cards';
    G.cardMode = 'level';
    curCards = Object.keys(PACT)
      .filter(k => !G.pacts[k])
      .slice(0, 3)
      .map(id => ({ k: 'pact', id, r: 1 }));
    if (!curCards.length) {
      G.state = 'play';
      return;
    }
    $('cardTitle').textContent = 'صفقات للتجربة';
    $('cardSub').textContent = '';
    drawCards();
    show('cards', true);
  });
  labBtn(T, '⚔️ طوّر السلاح', () => {
    const w = G.weapons[0];
    if (w.lvl < 5) {
      w.lvl++;
      buildWeapon();
      refreshLoadout();
    }
  });
  labBtn(T, '🧬 تطور كامل', () => {
    const w = G.weapons[0];
    w.lvl = 5;
    G.ups[EVO[w.id].up] = Math.max(1, G.ups[EVO[w.id].up] || 0);
    w.evo = 1;
    recalc();
    buildWeapon();
    refreshLoadout();
  });
  labBtn(T, '🌟 كل الـ72 تطوير', () => {
    for (const k in UP) G.ups[k] = UP[k].max;
    recalc();
    refreshLoadout();
    closeLab();
  });
  labBtn(T, '✨ كل التطويرات الجديدة', () => {
    for (const k of Object.keys(UP).slice(Object.keys(UP).indexOf('hole') + 1)) G.ups[k] = UP[k].max;
    recalc();
    refreshLoadout();
    closeLab();
  });
  labBtn(T, '🔁 بدّل السلاح', () => {
    const ids = Object.keys(WEP),
      w = G.weapons[0];
    w.id = ids[(ids.indexOf(w.id) + 1) % ids.length];
    w.evo = 0;
    buildWeapon();
    refreshLoadout();
    toast(WEP[w.id].i + ' ' + WEP[w.id].n);
  });
  labBtn(T, '🏁 شاشة النهاية', () => {
    show('lab', false);
    G.state = 'ending';
    showEnding();
  });
  labBtn(T, '❤️ صحة كاملة', () => {
    G.p.hp = G.p.maxHp;
  });
}
function openLab() {
  if (!LAB || G.state !== 'play') return;
  G.state = 'lab';
  buildLab();
  show('lab', true);
}
function closeLab() {
  show('lab', false);
  if (G.state === 'lab') G.state = 'play';
}
$('labBtn').onclick = openLab;
$('labClose').onclick = closeLab;
$('mLab').onclick = () => {
  startRun();
  G.lab = true;
  G.god = true;
  G.noWaves = true;
  clearField();
  G.p.inv = 0;
  banner('المختبر', 'اضغط 🧪 فوق عشان تستدعي أي وحش أو زعيم', 3);
  setTimeout(() => {
    if (G.state === 'play' && G.lab) for (let i = 0; i < 4; i++) spawnAround('runner', false, rand(10, 13));
  }, 1200);
};
if (LAB) {
  $('mLab').hidden = false;
  $('labBtn').hidden = false;
}
