'use strict';
if (navigator.maxTouchPoints > 0 && matchMedia('(pointer:coarse)').matches) {
  IN.touch = true; document.body.classList.remove('mouse');
}
const graveBaseShop = drawShop;
function graveIcon(id) {
  const box = el('span', 'graveIcon');
  const glyphs = { soulvessel: 'M8 5h8l-2 5c6 7 2 11-2 11s-8-4-2-11z',
    soulflame: 'M12 3c2 6 6 6 6 11a6 6 0 1 1-12 0c0-3 3-5 6-11z',
    soulguard: 'M12 3l8 4v6c0 5-8 8-8 8s-8-3-8-8V7z',
    soulcourt: 'M5 18v-7a7 7 0 0 1 14 0v7l-3-2-4 3-4-3z',
    warden: 'M12 3l8 4v6c0 5-8 8-8 8s-8-3-8-8V7z',
    hunter: 'M6 5l12 14M18 5L6 19M8 3l-4 4M16 3l4 4',
    lantern: 'M8 7h8l3 12H5zM9 7V5a3 3 0 0 1 6 0v2M12 11v5' };
  box.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + glyphs[id] + '"/></svg>';
  return box;
}
drawShop = function () {
  graveSyncTraining(); graveBaseShop();
  let section = $('graveShop');
  if (!section) { section = el('section', 'graveShop'); section.id = 'graveShop'; $('permGrid').after(section); }
  section.innerHTML = '';
  section.append(el('h2', '', 'عهود المقبرة — في التجربة'),
    el('p', '', 'التدريب يفتح بطاقات العهد ويرفع حدها إلى المستوى المشترى؛ البطاقة نفسها تختارها أثناء الجولة. كل الأسعار بالعملات ونقاط المهارة الحالية.'));
  const p = graveProfile();
  if (!p.demoClaimed) {
    const demo = el('button', 'btn sm', 'أضف رصيد تجربة: 25000 🪙 و50 ✨');
    demo.id = 'graveDemo';
    demo.onclick = () => {
      const profile = graveProfile();
      if (profile.demoClaimed || G.state !== 'menu') return;
      profile.demoClaimed = true; S.coins += 25000; S.sp += 50; save(); wallet(); drawShop();
    };
    section.append(el('p', '', 'رصيد اختياري مرة واحدة لتجربة المحتوى. يبقى في هذه المعاينة ولا ينتقل للعبة الأساسية.'), demo);
  }
  for (const [kind, data, label] of [['training', GRAVE_TRAINING, 'تدريب العهد'], ['relics', GRAVE_RELICS, 'آثار — تجهيز واحد لكل جولة']]) {
    section.append(el('h3', '', label));
    const grid = el('div', 'graveGrid'); section.append(grid);
    for (const [id, def] of Object.entries(data)) {
      const level = p[kind][id], max = level >= 3, training = kind === 'training';
      const coins = (training ? GRAVE_TRAIN_COST : GRAVE_RELIC_COST)[level];
      const sp = (training ? GRAVE_TRAIN_SP : GRAVE_RELIC_SP)[level];
      const card = itemCard(grid, { title: def.n,
        cls: ' graveCard' + (p.active === id ? ' sel' : ''),
        body: [graveIcon(id), el('p', '', def.d), el('p', 'permNow', 'المستوى ' + level + ' من 3'), pips(level, 3)],
        btn: max ? 'اكتمل' : 'طوّر · ' + coins + ' 🪙 + ' + sp + ' ✨',
        disabled: max || S.coins < coins || S.sp < sp,
        onClick: () => { if (graveBuy(kind, id, level)) { AU.play('ok'); wallet(); drawShop(); } },
      });
      card.dataset.grave = id;
      if (!training && level) {
        const b = el('button', 'btn sm ghost', p.active === id ? 'إلغاء التجهيز' : 'جهّز الأثر');
        b.dataset.graveEquip = id;
        b.onclick = () => { if (graveEquip(p.active === id ? '' : id)) { drawShop(); AU.play('select'); } };
        card.append(b);
      }
    }
  }
};
let graveHud = null, graveHudText = '';
function graveMeter() {
  if (!graveHud) { graveHud = el('div', 'graveMeter'); graveHud.id = 'graveMeter'; $('hud').append(graveHud); }
  const on = !!G && ['play', 'cards', 'paused', 'count'].includes(G.state) && graveEnabled();
  graveHud.hidden = !on;
  if (!on) return;
  const g = graveState();
  const value = 'الأرواح ' + Math.floor(g.souls) + ' من ' + graveCapacity() + (g.barrier > 0 ? ' · حاجز ' + Math.ceil(g.barrier) : '');
  if (value !== graveHudText) { graveHud.textContent = value; graveHudText = value; }
}
