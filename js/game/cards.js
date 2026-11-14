'use strict';
/* Level-up / boss reward cards, and the HUD loadout chips. */
function rollCards(n, minR, skip) {
  const luck = S.tree.U4 ? 1.5 : 1,
    RW = [60, 24 * luck, 9 * luck, (3.2 + G.lvl * 0.22) * luck],
    pool = [],
    has = k => skip && skip.some(c => c.k === k.k && c.id === k.id);
  for (const id in UP) {
    const u = UP[id],
      l = G.ups[id] || 0;
    if (l < u.max && u.r >= minR) {
      const c = { k: 'up', id, r: u.r, w: RW[u.r] };
      if (!has(c)) pool.push(c);
    }
  }
  for (const w of G.weapons)
    if (w.lvl < 5) {
      const r = w.lvl === 2 || w.lvl === 4 ? 2 : 1;
      if (r >= minR) {
        const c = { k: 'wup', id: w.id, r, w: RW[r] * 1.4 };
        if (!has(c)) pool.push(c);
      }
    }
  // a full evolution is almost always offered as soon as it becomes possible
  for (const w of G.weapons)
    if (w.lvl >= 5 && !w.evo && EVO[w.id] && G.ups[EVO[w.id].up]) {
      const c = { k: 'evo', id: w.id, r: 3, w: 400 };
      if (!has(c)) pool.push(c);
    }
  if (G.lvl >= 3 && minR <= 1)
    for (const id in PACT)
      if (!G.pacts[id]) {
        const c = { k: 'pact', id, r: 1, w: RW[1] * 0.75 };
        if (!has(c)) pool.push(c);
      }
  if (G.weapons.length < 3 && minR <= 1)
    for (const id in WEP)
      if ((S.weps[id] || id === CHARS[S.char].wep) && !G.weapons.find(w => w.id === id)) {
        const c = { k: 'wnew', id, r: 1, w: RW[1] * 0.8 };
        if (!has(c)) pool.push(c);
      }
  const out = [];
  while (out.length < n && pool.length) {
    let tot = 0;
    for (const c of pool) tot += c.w;
    let r = Math.random() * tot,
      i = 0;
    for (; i < pool.length - 1; i++) {
      r -= pool[i].w;
      if (r <= 0) break;
    }
    out.push(pool.splice(i, 1)[0]);
  }
  if (out.length < n && minR > 0) return out.concat(rollCards(n - out.length, 0, out));
  if (!out.length) out.push({ k: 'heal', r: 0 }, { k: 'gold', r: 0 });
  return out;
}
/* What an upgrade changes, as a number you can read: [label, value of the hero now]. */
const pctOf = v => Math.round(v * 100) + '%';
const UP_STAT = {
  hp: ['الصحة القصوى', p => p.maxHp],
  dmg: ['قوة الضرر', p => pctOf(p.dmgMul)],
  aspd: ['سرعة الهجوم', p => pctOf(p.aspd)],
  crit: ['فرصة الحرجة', p => pctOf(p.crit)],
  area: ['المدى', p => pctOf(p.area)],
  regen: ['تجدد الصحة', p => p.regen.toFixed(1) + '/ث'],
  armor: ['تقليل الضرر', p => pctOf(p.armor)],
  speed: ['سرعة الحركة', p => p.speed.toFixed(1)],
  dashlen: ['مسافة المراوغة', p => p.dashLen.toFixed(1) + 'م'],
  magnet: ['مدى الجذب', p => p.magnet.toFixed(1) + 'م'],
  multi: ['مقذوفات إضافية', p => '+' + p.multi],
  shield: ['الدرع', p => p.shieldMax],
  dash: ['تجهيز المراوغة', p => p.dashMax.toFixed(1) + 'ث'],
  coins: ['العملات', p => pctOf(p.goldMul)],
  xp: ['الخبرة', p => pctOf(p.xpMul)],
  critdmg: ['ضرر الحرجة', p => '×' + p.critMul.toFixed(1)],
  pspeed: ['سرعة المقذوف', p => pctOf(p.pspd)],
  pierce: ['اختراق إضافي', p => '+' + p.pierceAdd],
  size: ['حجم المقذوف', p => pctOf(p.sizeMul)],
  cdr: ['وقت التجهيز', p => pctOf(p.cdr)],
  kb: ['قوة الدفع', p => pctOf(p.kbMul)],
  iframe: ['حماية بعد الضربة', p => '+' + p.iframe.toFixed(2) + 'ث'],
  bossdmg: ['ضرر الزعماء', p => pctOf(p.bossMul)],
  army: ['الجنود', () => (G.ups.army ? 1 + G.ups.army : 0)],
};
/** "Max health: 120 ← 138": the stat an upgrade changes, now and after taking it (worked out, then undone). */
function upPreview(id) {
  const st = UP_STAT[id];
  if (!st) return '';
  const p = G.p,
    keep = Object.assign({}, p),
    allies = G.allies.length,
    had = id in G.ups,
    a = st[1](p);
  G.ups[id] = (G.ups[id] || 0) + 1;
  recalc();
  const b = st[1](p);
  G.ups[id]--;
  if (!had) delete G.ups[id];
  Object.assign(p, keep);
  G.allies.length = allies;
  return st[0] + ': ' + a + ' ← ' + b;
}
function cardInfo(c) {
  if (c.k === 'up') {
    const u = UP[c.id],
      l = G.ups[c.id] || 0;
    let syn = '';
    if (u.syn && G.ups[u.syn[0]]) syn = u.syn[1];
    for (const w of G.weapons)
      if (!w.evo && EVO[w.id] && EVO[w.id].up === c.id)
        syn =
          'يكمّل تطور ' +
          WEP[w.id].i +
          ' ← ' +
          EVO[w.id].i +
          ' ' +
          EVO[w.id].n +
          (w.lvl < 5 ? ' (لما يوصل المستوى 5)' : '');
    return {
      i: u.i,
      n: u.n,
      d: u.d,
      st: upPreview(c.id),
      lv: u.max > 1 ? 'مستواك ' + l + ' ← ' + (l + 1) + ' (من ' + u.max + ')' : 'مرة وحدة',
      syn,
    };
  }
  if (c.k === 'wup') {
    const w = G.weapons.find(x => x.id === c.id),
      d = WEP[c.id],
      nl = w.lvl + 1;
    return {
      i: d.i,
      n: d.n,
      d: nl === 3 ? 'يتطور شكل السلاح: ' + d.evo[0] : nl === 5 ? 'الشكل الأسطوري: ' + d.evo[1] : 'ضرر +30% وهجوم أسرع',
      lv: 'مستواه ' + w.lvl + ' ← ' + nl + ' (من 5)',
      syn: nl === 5 && EVO[c.id] ? 'يتطور كامل مع ' + UP[EVO[c.id].up].i + ' ' + UP[EVO[c.id].up].n : '',
    };
  }
  if (c.k === 'evo') {
    const v = EVO[c.id];
    return { i: v.i, n: v.n, d: v.d, lv: 'تطور كامل: ' + WEP[c.id].n + ' + ' + UP[v.up].n, syn: '' };
  }
  if (c.k === 'wnew') {
    const d = WEP[c.id];
    return { i: d.i, n: d.n, d: 'سلاح إضافي يهاجم تلقائياً مع أسلحتك', lv: 'سلاح جديد', syn: '' };
  }
  if (c.k === 'pact') {
    const q = PACT[c.id];
    return { i: q.i, n: q.n, d: '✅ ' + q.pro + '\n❌ ' + q.con, lv: 'صفقة: مرة وحدة', syn: '' };
  }
  if (c.k === 'heal') return { i: '🍖', n: 'وليمة', d: 'تستعيد 40% من صحتك', lv: '', syn: '' };
  return { i: '💰', n: 'كنز', d: '+40 عملة', lv: '', syn: '' };
}
let curCards = [];
function openCards(mode) {
  if (COOP.on)
    G.cardsOpen = true; // co-op: the world keeps going for the others
  else G.state = 'cards';
  G.cardMode = mode;
  const n = mode === 'boss' ? 3 : S.tree.U1 ? 4 : 3;
  curCards = rollCards(n, mode === 'boss' ? 2 : 0);
  $('cardTitle').textContent = mode === 'boss' ? 'غنيمة الزعيم' : 'ارتفع مستواك!';
  $('cardSub').textContent = mode === 'boss' ? 'اختر مكافأة نادرة' : 'المستوى ' + G.lvl + '. اختر تطويراً واحداً';
  if (mode === 'level') {
    G.pending--;
    AU.play('level');
  } else AU.play('win');
  drawCards();
  show('cards', true);
}
function drawCards() {
  const row = $('cardRow');
  row.innerHTML = '';
  curCards.forEach((c, i) => {
    const f = cardInfo(c),
      b = document.createElement('button');
    b.className = 'card r' + c.r + (c.k === 'pact' ? ' pact' : '');
    if (c.k !== 'pact') b.style.setProperty('--rc', 'var(--r' + c.r + ')');
    b.style.animationDelay = i * 0.07 + 's';
    b.innerHTML =
      '<span class="ic"></span><span class="body"><span class="rar"></span><h3></h3><p></p><span class="st"></span><span class="syn"></span><span class="lv"></span></span>';
    b.querySelector('.ic').textContent = f.i;
    b.querySelector('.rar').textContent = c.k === 'pact' ? 'صفقة بثمن' : RAR[c.r];
    b.querySelector('h3').textContent = f.n;
    b.querySelector('p').textContent = f.d;
    b.querySelector('.st').textContent = f.st || '';
    b.querySelector('.st').hidden = !f.st;
    b.querySelector('.syn').textContent = f.syn;
    b.querySelector('.lv').textContent = f.lv;
    b.onclick = () => chooseCard(i);
    row.appendChild(b);
  });
  const rr = $('reroll');
  rr.hidden = !(G.rerolls > 0 && G.cardMode === 'level');
  rr.textContent = '🎲 بدّل البطاقات (' + G.rerolls + ')';
}
const RESUME_T = 0.8;
function chooseCard(i) {
  const c = curCards[i];
  if (!c || (G.state !== 'cards' && !G.cardsOpen)) return;
  const p = G.p;
  if (c.k === 'up') {
    G.ups[c.id] = (G.ups[c.id] || 0) + 1;
    if (c.id === 'revive') G.revives++;
    recalc();
    if (c.id === 'hp') heal(18);
    if (c.id === 'shield') p.shield = p.shieldMax;
  } else if (c.k === 'wup') {
    const w = G.weapons.find(x => x.id === c.id);
    w.lvl++;
    if (w === G.weapons[0]) buildWeapon();
  } else if (c.k === 'evo') {
    const w = G.weapons.find(x => x.id === c.id);
    w.evo = 1;
    S.stats.evos = (S.stats.evos || 0) + 1;
    if (w === G.weapons[0]) buildWeapon();
  } else if (c.k === 'wnew') G.weapons.push({ id: c.id, lvl: 1, cd: 0.2 });
  else if (c.k === 'pact') {
    const r0 = p.hp / p.maxHp;
    G.pacts[c.id] = 1;
    recalc();
    p.hp = Math.max(1, Math.min(p.maxHp, r0 * p.maxHp));
  } else if (c.k === 'heal') heal(p.maxHp * 0.4);
  else G.coins += 40;
  if (c.r === 3) {
    S.stats.legend++;
    cine(cardInfo(c).n || UP[c.id].n);
    AU.play('legend');
    shake(0.8);
    ring(p.x, p.z, 0.5, 12, 0.8, [1, 0.8, 0.2]);
    parts(p.x, 1, p.z, 60, 1, 0.8, 0.2, 14, 0.3, 1.2);
  } else {
    AU.play('select');
    ring(p.x, p.z, 0.5, 4, 0.35, c.r === 2 ? [0.7, 0.4, 1] : [0.3, 0.9, 0.8]);
  }
  if (c.r === 3 && c.k === 'up') $('cine').querySelector('b').textContent = UP[c.id].n;
  refreshLoadout();
  const mode = G.cardMode;
  if (mode === 'boss' && (!COOP.on || COOP.host) && nextStage()) {
    G.cardsOpen = false;
    show('cards', false);
    return;
  }
  if (G.pending > 0) {
    openCards('level');
    return;
  }
  show('cards', false);
  G.cardsOpen = false;
  // straight back into the fight: a moment of slow motion that eases up to full speed (solo; co-op's world
  // never stopped), and a short shield so nothing lands on you while you find your bearings
  G.state = 'play';
  G.p.inv = Math.max(G.p.inv, 1.2);
  if (!COOP.on) G.resumeT = RESUME_T;
  saveRun();
}
function cine(t) {
  const e = $('cine');
  e.querySelector('b').textContent = t;
  e.classList.remove('on');
  void e.offsetWidth;
  e.classList.add('on');
}
function refreshLoadout() {
  const L = $('loadout');
  L.innerHTML = '';
  const chip = (cls, icon, lvl) => {
    const c = el('div', 'chip' + cls, icon);
    if (lvl != null) c.appendChild(el('b', '', lvl));
    L.appendChild(c);
  };
  for (const w of G.weapons) chip(' w' + (w.evo ? ' evo' : ''), w.evo ? EVO[w.id].i : WEP[w.id].i, w.evo ? '★' : w.lvl);
  for (const id in G.pacts || {}) chip(' pact', PACT[id].i);
  for (const id in G.ups) if (G.ups[id]) chip('', UP[id].i, G.ups[id]);
  L.classList.toggle('wide', L.children.length > 9);
}

/** The pause screen's "your stats" panel: the hero's numbers and every upgrade with its level. */
function drawStats() {
  const box = $('pStats'),
    p = G.p;
  box.innerHTML = '';
  box.appendChild(el('b', 'psT', 'قدراتك'));
  const main = el('div', 'psMain');
  for (const [k, v] of [
    ['❤️', Math.ceil(p.hp) + ' / ' + p.maxHp],
    ['⚔️', pctOf(p.dmgMul)],
    ['⚡', pctOf(p.aspd)],
    ['🎯', pctOf(p.crit)],
    ['👟', p.speed.toFixed(1)],
    ['🧱', pctOf(p.armor)],
  ])
    main.appendChild(el('span', '', k + ' ' + v));
  box.appendChild(main);
  const list = el('div', 'psList');
  for (const w of G.weapons)
    list.appendChild(
      el(
        'span',
        w.evo ? 'evo' : '',
        (w.evo ? EVO[w.id].i + ' ' + EVO[w.id].n : WEP[w.id].i + ' ' + WEP[w.id].n) +
          (w.evo ? ' ★' : ' ' + w.lvl + '/5')
      )
    );
  for (const id in G.ups)
    if (G.ups[id]) {
      const u = UP[id],
        st = UP_STAT[id];
      list.appendChild(
        el('span', '', u.i + ' ' + u.n + ' ' + G.ups[id] + '/' + u.max + (st ? ' · ' + st[0] + ' ' + st[1](p) : ''))
      );
    }
  box.appendChild(list);
}
$('reroll').onclick = () => {
  if (G.rerolls > 0) {
    G.rerolls--;
    curCards = rollCards(curCards.length, 0);
    AU.play('select');
    drawCards();
  }
};
