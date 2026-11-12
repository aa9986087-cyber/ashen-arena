'use strict';
/* Skill tree screen: three branches drawn bottom-up as hexagon nodes, plus a detail panel for the selected node. */
/** Line icons (SVG path markup, 24×24 viewBox) for each TREE node id. */
const TREE_IC = {
  A1: '<path d="M5 19 17 7l2-4-4 2L3 17zM4 14l6 6M3 21l2-2"/>',
  A2: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  A3: '<path d="M12 3v18M5 7v14M19 7v14M10 6l2-3 2 3M3 10l2-3 2 3M17 10l2-3 2 3"/>',
  D1: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  D2: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/><path d="M9 14a3 3 0 0 0 3 3"/>',
  D3: '<path d="M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  U1: '<rect x="3" y="6" width="7" height="12" rx="1"/><rect x="9" y="4" width="7" height="12" rx="1"/><rect x="14" y="8" width="7" height="12" rx="1"/>',
  U2: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r=".8"/><circle cx="15" cy="15" r=".8"/><circle cx="15" cy="9" r=".8"/><circle cx="9" cy="15" r=".8"/>',
  U3: '<path d="M6 9h12l-1 11H7z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/><path d="M10 14h4"/>',
};
/** Id of the node shown in the detail panel (null = none). */
let treeSel = null;
/** 'own' (unlocked), 'av' (can be unlocked now) or 'lock' (previous node missing). */
function treeState(br, i) {
  const n = br.nodes[i];
  return S.tree[n.id] ? 'own' : i === 0 || S.tree[br.nodes[i - 1].id] ? 'av' : 'lock';
}
function drawTree() {
  const V = $('treeView');
  V.innerHTML = '';
  const row = el('div', 'tvb');
  TREE.forEach((br, bi) => {
    const col = el('div', 'tvcol');
    col.dataset.b = bi;
    const nm = el('div', 'tvname', br.n);
    nm.style.animationDelay = bi * 0.08 + 's';
    col.appendChild(nm);
    for (let i = br.nodes.length - 1; i >= 0; i--) {
      const n = br.nodes[i],
        stt = treeState(br, i),
        d = el('div', 'tvn ' + stt + (treeSel === n.id ? ' sel' : ''));
      d.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (TREE_IC[n.id] || '') + '</svg>';
      d.appendChild(el('span', 'cost', n.c + ' ✨'));
      d.style.animationDelay = 0.12 + bi * 0.06 + (br.nodes.length - 1 - i) * 0.1 + 's';
      d.setAttribute('role', 'button');
      d.setAttribute('aria-label', n.n);
      d.onclick = () => {
        treeSel = n.id;
        AU.play('select');
        drawTree();
      };
      col.appendChild(d);
      col.appendChild(el('div', 'tvlink' + (stt === 'own' ? ' on' : '')));
    }
    row.appendChild(col);
  });
  V.appendChild(row);
  V.appendChild(el('div', 'tvjoin'));
  const root = el('div', 'tvroot');
  root.innerHTML = '<div><b>' + S.sp + '</b><small>نقاط مهارة</small></div>';
  V.appendChild(root);
  const I = $('tvInfo');
  I.innerHTML = '';
  let found = null,
    bi = 0,
    ni = 0;
  TREE.forEach((br, b) =>
    br.nodes.forEach((n, i) => {
      if (n.id === treeSel) {
        found = n;
        bi = b;
        ni = i;
      }
    })
  );
  if (!found) {
    const t = el('div', 'tvi');
    t.append(
      el('h3', '', 'اختر مهارة'),
      el(
        'p',
        'hint',
        'اضغط أي شكل في الشجرة تشوف وش يسوي. تكسب نقطة ✨ عن كل زعيم تهزمه وعن بعض الإنجازات، وكل فرع ينفتح من تحت لفوق.'
      )
    );
    I.appendChild(t);
    return;
  }
  const br = TREE[bi],
    stt = treeState(br, ni),
    t = el('div', 'tvi');
  t.dataset.b = bi;
  t.append(el('h3', '', found.n + ' · ' + br.n), el('p', '', found.d));
  const b = el(
    'button',
    'btn',
    stt === 'own' ? '✓ مفعّلة' : stt === 'lock' ? '🔒 افتح اللي قبلها أول' : 'فعّلها بـ ' + found.c + ' ✨'
  );
  b.disabled = stt !== 'av';
  b.onclick = () => {
    if (S.sp < found.c) {
      AU.play('deny');
      toast('تحتاج ' + (found.c - S.sp) + ' نقطة مهارة إضافية');
      return;
    }
    S.sp -= found.c;
    S.tree[found.id] = 1;
    AU.play('unlock');
    save();
    newRun();
    drawTree();
    wallet();
  };
  t.appendChild(b);
  I.appendChild(t);
}
