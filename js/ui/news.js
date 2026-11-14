'use strict';
/* The news bulletin: a window over the menu listing the updates. The newspaper button in the menu's corner
   shows a dot while there's an update you haven't seen; a new one also opens the bulletin once by itself. */
const newsUnseen = () => NEWS.length && S.newsSeen !== NEWS[0].id;
function newsDot() {
  $('newsDot').hidden = !newsUnseen();
}
function openNews() {
  const L = $('newsList');
  L.innerHTML = '';
  NEWS.forEach((n, k) => {
    const card = el('article', 'nItem' + (k === 0 ? ' latest' : ''));
    const hd = el('header');
    hd.append(el('h3', '', n.title), el('small', 'nWhen', n.date + (n.time ? ' · ' + n.time : '')));
    if (n.tag && k === 0) hd.appendChild(el('span', 'nTag', n.tag));
    card.appendChild(hd);
    const ul = el('ul');
    for (const it of n.items) {
      const li = el('li');
      li.append(el('i', '', it.i), el('span', '', it.t));
      ul.appendChild(li);
    }
    card.appendChild(ul);
    L.appendChild(card);
  });
  $('news').hidden = false;
  L.scrollTop = 0;
  AU.play('select');
  S.newsSeen = NEWS[0].id;
  save();
  newsDot();
}
function closeNews() {
  $('news').hidden = true;
}
$('mNews').onclick = () => openNews();
$('newsClose').onclick = closeNews;
$('newsOk').onclick = closeNews;
$('news').onclick = e => e.target === $('news') && closeNews();
newsDot();
// a new update: show it once, when the menu is up (after the intro and the name)
(function newsAuto() {
  if (!newsUnseen()) return;
  // only over the main menu itself: no other screen up, nothing moving between screens, not in a run or a duel
  const ready = () =>
    !$('menu').hidden &&
    !$('menu').classList.contains('boot') &&
    !$('menu').classList.contains('leaving') &&
    SCREENS.every(s => s === 'menu' || $(s).hidden) &&
    $('intro').classList.contains('done') &&
    $('nameScr').hidden &&
    $('duel').hidden &&
    $('hud').hidden;
  // the menu has to stay up for a moment (not a screen passing by); keeps trying while you're elsewhere
  let n = 0,
    calm = 0;
  const t = setInterval(() => {
    if (++n > 600 || !newsUnseen()) return clearInterval(t);
    calm = ready() ? calm + 1 : 0;
    if (calm >= 3) {
      clearInterval(t);
      openNews();
    }
  }, 400);
})();
