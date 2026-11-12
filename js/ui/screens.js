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
      body: [el('p', '', c.d + ' الصحة ' + c.hp + '.')],
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
function drawShop() {
  const g = $('permGrid');
  g.innerHTML = '';
  for (const id in PERM) {
    const u = PERM[id],
      l = S.perm[id] || 0;
    itemCard(g, {
      cls: l >= u.max ? ' done' : '',
      icon: u.i,
      title: u.n,
      body: [el('p', '', u.d + ' لكل مستوى'), pips(l, u.max)],
      btn: l >= u.max ? 'اكتمل' : 'طوّر بـ ' + permCost(l) + ' 🪙',
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
      ],
      btn: own ? 'مفتوح' : 'افتح بـ ' + d.cost + ' 🪙',
      disabled: !!own,
      onClick: () =>
        buy(d.cost, () => {
          S.weps[id] = 1;
          drawShop();
        }),
    });
  }
}
function drawAch() {
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
  $('oSide').textContent = S.set.left ? 'يسار' : 'يمين';
  document.body.classList.toggle('actsLeft', !!S.set.left);
  $('oReset').textContent = resetArm ? 'اضغط مجدداً للتأكيد' : 'امسح';
  sun.castShadow = !!S.set.shadow;
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
  show('pause', false);
  G.state = 'play';
  endRun();
};
