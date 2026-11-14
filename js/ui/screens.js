'use strict';
/* Menu screens: navigation, heroes, shop, skill tree, achievements, settings, and button wiring. */
const SCREENS = [
  'menu',
  'chars',
  'shop',
  'tree',
  'ach',
  'settings',
  'cards',
  'pause',
  'over',
  'board',
  'ending',
  'lab',
  'chat',
  'duelMenu',
  'coopMenu',
  'liveScr',
];
function show(id, on) {
  $(id).hidden = !on;
}
let goTok = 0,
  goFirst = true;
/** Navigate to a menu screen with a short leave/wipe transition (instant on first call). */
function go(id) {
  const cur = SCREENS.find(q => q !== 'cards' && q !== id && !$(q).hidden),
    tok = ++goTok;
  if (goFirst || !cur) {
    goFirst = false;
    goNow(id);
    return;
  }
  $(cur).classList.add('leaving');
  pop($('wipe'), 'run');
  AU.play('nav');
  setTimeout(() => {
    if (tok === goTok) goNow(id);
  }, 185);
}
/** Show only `keep` (clearing transition classes). With no argument every screen is hidden, the 'cards' overlay included. */
function hideScreens(keep) {
  for (const s of SCREENS) {
    if (s === 'cards' && keep !== undefined) continue;
    $(s).hidden = s !== keep;
    $(s).classList.remove('leaving');
  }
}
function goNow(id) {
  hideScreens(id);
  if (id !== 'menu' && typeof closeNews === 'function') closeNews(); // the bulletin belongs to the menu
  if (id === 'chars') drawChars();
  if (id === 'shop') drawShop();
  if (id === 'tree') drawTree();
  if (id === 'ach') drawAch();
  if (id === 'settings') drawSet();
  if (id === 'board') {
    drawBoard();
    loadOnline();
  }
  if (id === 'menu') menuState();
  wallet();
}
let walletLast = null;
function wallet() {
  const ch = walletLast !== null && walletLast !== S.coins + '|' + S.sp;
  walletLast = S.coins + '|' + S.sp;
  document.querySelectorAll('.wCoins').forEach(e => {
    e.textContent = '🪙 ' + S.coins;
    if (ch) pop(e);
  });
  document.querySelectorAll('.wSp').forEach(e => {
    e.textContent = '✨ ' + S.sp;
    if (ch) pop(e);
  });
}
/** Shop/menu tile: .item with a title (optional icon), body nodes, and an optional action button. */
function itemCard(parent, o) {
  const it = el('div', 'item' + (o.cls || ''));
  let h;
  if (o.icon != null) {
    h = el('h3');
    h.append(el('span', 'ic', o.icon), el('span', '', o.title));
  } else h = el('h3', '', o.title);
  it.append(h, ...o.body);
  if (o.btn != null) {
    const b = el('button', 'btn sm', o.btn);
    if (o.old) b.appendChild(el('s', 'oldPrice', o.old + ' 🪙')); // the price before the sale
    b.disabled = o.disabled;
    b.onclick = o.onClick;
    it.appendChild(b);
  }
  parent.appendChild(it);
  return it;
}
function buy(cost, fn) {
  if (S.coins < cost) {
    AU.play('deny');
    toast('تحتاج ' + (cost - S.coins) + ' عملة إضافية');
    return;
  }
  S.coins -= cost;
  fn();
  AU.play('coin');
  save();
  checkAch();
  wallet();
}
/** <img> with the hero's 3D portrait (empty if it could not be drawn). */
function portraitImg(id) {
  const img = el('img', 'portrait');
  img.alt = CHARS[id].n;
  img.src = heroPortrait(id) || '';
  return img;
}
function drawChars() {
  const g = $('charGrid');
  g.innerHTML = '';
  for (const id in CHARS) {
    const c = CHARS[id],
      own = S.chars[id];
    itemCard(g, {
      cls: S.char === id ? ' sel' : '',
      icon: c.i,
      title: c.n,
      body: [
        portraitImg(id),
        el('p', '', c.d + ' الصحة ' + c.hp + '.'),
        el('p', 'spx', SPECIALS[c.sp].i + ' ' + SPECIALS[c.sp].n + ': ' + SPECIALS[c.sp].d),
      ],
      btn: S.char === id ? 'مُختار' : own ? 'اختر' : 'افتح بـ ' + c.cost + ' 🪙',
      disabled: S.char === id,
      onClick: () => {
        if (own) {
          S.char = id;
          save();
          AU.play('select');
          newRun();
          buildPlayer();
          drawChars();
        } else
          buy(c.cost, () => {
            S.chars[id] = 1;
            S.char = id;
            newRun();
            buildPlayer();
            drawChars();
          });
      },
    });
  }
}
/** The hero's numbers as a run starts (shop, skill tree and hero all counted). noPerm: without the shop's part. */
function heroStartStats(noPerm) {
  const keepG = G,
    keepPerm = S.perm;
  try {
    if (noPerm) S.perm = {};
    G = { p: { hp: 0, x: 0, z: 0 }, ups: {}, pacts: {}, allies: [] };
    // what newRun gives from the skill tree
    if (S.tree.A3) G.ups.multi = 1;
    if (S.tree.D3) G.ups.shield = 1;
    recalc();
    return G.p;
  } finally {
    G = keepG;
    S.perm = keepPerm;
  }
}
/** The shop's hero card: the current hero's look and every stat he starts a run with
    (the green part is what the shop's upgrades add). */
function drawShopHero() {
  const box = $('shopHero'),
    ch = CHARS[S.char],
    sp = heroSpecial(),
    p = heroStartStats(),
    pct = v => Math.round(v * 100) + '%';
  box.innerHTML = '';
  const pic = el('div', 'shPic'),
    img = new Image();
  img.src = heroPortrait(S.char) || '';
  img.alt = ch.n;
  pic.appendChild(img);
  const info = el('div', 'shInfo'),
    name = el('div', 'shName');
  name.append(el('b', '', ch.i + ' ' + ch.n), el('small', '', ch.d));
  info.appendChild(name);
  const grid = el('div', 'shStats');
  const row = (ic, label, v, perm, fmt) => {
    const r = el('div', 'shSt');
    r.append(el('i', '', ic), el('span', '', label), el('b', '', fmt(v)));
    const add = perm && permBonus(perm);
    if (add) r.appendChild(el('em', '', add + ' من المتجر'));
    grid.appendChild(r);
  };
  const n0 = v => String(Math.round(v)),
    n1 = v => v.toFixed(1);
  row('❤️', 'الصحة', p.maxHp, 'hp', n0);
  row('⚔️', 'قوة الضرر', p.dmgMul, 'dmg', pct);
  row('⚡', 'سرعة الهجوم', p.aspd, '', pct);
  row('🎯', 'فرصة الحرجة', p.crit, '', pct);
  row('💢', 'ضرر الحرجة', p.critMul, '', v => '×' + v.toFixed(1));
  row('👟', 'سرعة الحركة', p.speed, 'spd', n1);
  row('🧱', 'تقليل الضرر', 1 - p.taken * (1 - p.armor), '', pct);
  row('💚', 'تجدد الصحة', p.regen, '', v => v.toFixed(1) + '/ث');
  row('🧲', 'مدى الجذب', p.magnet, 'mag', v => v.toFixed(1) + 'م');
  row('📘', 'الخبرة', p.xpMul, 'xp', pct);
  row('🪙', 'العملات', p.goldMul, 'gold', pct);
  row('💨', 'تجهيز المراوغة', p.dashMax, '', v => v.toFixed(1) + 'ث');
  if (p.multi) row('🔱', 'مقذوفات إضافية', p.multi, '', v => '+' + v);
  if (p.shieldMax) row('🔵', 'درع الطاقة', p.shieldMax, '', n0);
  info.appendChild(grid);
  // the special, the starting weapon, and what the skill tree adds
  const extra = el('div', 'shExtra');
  extra.append(
    el('span', '', sp.i + ' ' + sp.n + ' · كل ' + Math.round(sp.cd * (S.tree.S1 ? 0.85 : 1)) + 'ث'),
    el('span', '', WEP[ch.wep].i + ' ' + WEP[ch.wep].n + (S.tree.A5 ? ' (مستوى 2)' : ''))
  );
  for (const br of TREE) for (const n of br.nodes) if (S.tree[n.id]) extra.appendChild(el('span', 'tr', '✨ ' + n.n));
  info.appendChild(extra);
  box.append(pic, info);
}
function drawShop() {
  drawShopHero();
  const g = $('permGrid');
  g.innerHTML = '';
  for (const id in PERM) {
    const u = PERM[id],
      l = S.perm[id] || 0;
    itemCard(g, {
      cls: l >= u.max ? ' done' : '',
      icon: u.i,
      title: u.n,
      body: [
        el('p', '', u.d + ' لكل مستوى'),
        el(
          'p',
          'permNow',
          'مستواك ' +
            l +
            ' من ' +
            u.max +
            ' · ' +
            u.s +
            ': ' +
            (permBonus(id, l) || '+0' + u.u) +
            (l < u.max ? ' ← ' + permBonus(id, l + 1) : ' (الأقصى)')
        ),
        pips(l, u.max),
      ],
      btn: l >= u.max ? 'اكتمل' : 'طوّر بـ ' + permCost(l) + ' 🪙',
      old: l < u.max && permCostOld(l) !== permCost(l) ? permCostOld(l) : 0,
      disabled: l >= u.max,
      onClick: () =>
        buy(permCost(l), () => {
          S.perm[id] = l + 1;
          drawShop();
        }),
    });
  }
  const w = $('wepGrid');
  w.innerHTML = '';
  for (const id in WEP) {
    const d = WEP[id],
      own = S.weps[id];
    itemCard(w, {
      cls: own ? ' done' : '',
      icon: d.i,
      title: d.n,
      body: [
        el(
          'p',
          '',
          d.melee ? 'سلاح قريب يضرب كل من أمامك.' : 'عند المستوى 3: ' + d.evo[0] + '. عند 5: ' + d.evo[1] + '.'
        ),
        el(
          'p',
          'spx',
          'التطور الكامل: المستوى 5 + ' +
            UP[EVO[id].up].i +
            ' ' +
            UP[EVO[id].up].n +
            ' ← ' +
            EVO[id].i +
            ' ' +
            EVO[id].n
        ),
      ],
      btn: own ? 'مفتوح' : 'افتح بـ ' + wepCost(id) + ' 🪙',
      old: !own && wepCost(id) !== d.cost ? d.cost : 0,
      disabled: !!own,
      onClick: () =>
        buy(wepCost(id), () => {
          S.weps[id] = 1;
          drawShop();
        }),
    });
  }
}
function drawAch() {
  drawDaily();
  const g = $('achGrid');
  g.innerHTML = '';
  for (const a of ACH)
    itemCard(g, {
      cls: S.ach[a.id] ? ' done' : '',
      title: (S.ach[a.id] ? '🏆 ' : '🔒 ') + a.n,
      body: [el('p', '', a.d), el('p', '', 'المكافأة: ' + a.c + ' 🪙' + (a.sp ? ' و ' + a.sp + ' ✨' : ''))],
    });
}
let setFrom = 'menu',
  resetArm = false;
function drawSet() {
  $('oSfx').value = S.set.sfx;
  $('oMus').value = S.set.mus;
  $('oShadow').textContent = S.set.shadow ? 'مفعّلة' : 'متوقفة';
  $('oShake').textContent = S.set.shake ? 'مفعّل' : 'متوقف';
  $('oQual').textContent = S.set.qual ? 'عالية' : 'منخفضة';
  $('oFps').textContent = S.set.fps ? 'ظاهر' : 'مخفي';
  $('oEco').textContent = S.set.eco ? 'مفعّل' : 'متوقف';
  $('fps').hidden = !S.set.fps;
  $('oSide').textContent = S.set.left ? 'يسار' : 'يمين';
  document.body.classList.toggle('actsLeft', !!S.set.left);
  $('oReset').textContent = resetArm ? 'اضغط مجدداً للتأكيد' : 'امسح';
  sun.castShadow = !!S.set.shadow;
  RS = 1;
  resize();
}
$('oSfx').oninput = e => {
  S.set.sfx = +e.target.value;
  AU.init();
  AU.vol();
  AU.play('select');
  save();
};
$('oMus').oninput = e => {
  S.set.mus = +e.target.value;
  AU.init();
  AU.vol();
  save();
};
for (const [id, key] of [
  ['oShadow', 'shadow'],
  ['oShake', 'shake'],
  ['oSide', 'left'],
  ['oQual', 'qual'],
  ['oFps', 'fps'],
  ['oEco', 'eco'],
])
  $(id).onclick = () => {
    S.set[key] = S.set[key] ? 0 : 1;
    save();
    drawSet();
  };
$('oReset').onclick = () => {
  if (!resetArm) {
    resetArm = true;
    drawSet();
    return;
  }
  resetArm = false;
  // settings and redeemed gift codes survive a wipe (so a gift can't be claimed again)
  const keep = S.set,
    gifts = S.gifts;
  S = defSave();
  S.set = keep;
  S.gifts = gifts;
  save();
  toast('مُسح التقدم');
  askName();
  if (G.state !== 'paused') {
    newRun();
    buildPlayer();
  }
  drawSet();
  wallet();
};
$('setBack').onclick = () => {
  resetArm = false;
  if (setFrom === 'pause') {
    show('settings', false);
    show('pause', true);
  } else go('menu');
};
document.querySelectorAll('[data-go]').forEach(
  b =>
    (b.onclick = () => {
      AU.init();
      AU.play('select');
      setFrom = 'menu';
      go(b.dataset.go);
    })
);
$('mPlay').onclick = startRun;
$('mResume').onclick = resumeRun;
$('pSave').onclick = () => {
  if (COOP.on) return coopLeave(); // co-op can't be saved: leaving ends it for us
  saveRun();
  show('pause', false);
  toMenu();
};
$('ovRetry').onclick = startRun;
$('ovMenu').onclick = toMenu;
$('pauseBtn').onclick = () => pause(true);
$('pResume').onclick = () => pause(false);
$('pSet').onclick = () => {
  setFrom = 'pause';
  show('pause', false);
  show('settings', true);
  drawSet();
};
$('pQuit').onclick = () => {
  if (COOP.on) return coopLeave();
  show('pause', false);
  G.state = 'play';
  endRun();
};
