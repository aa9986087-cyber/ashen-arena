'use strict';
/* Skill tree screen: one column per branch (first skill at the top), each skill a tile; tapping a skill opens
   its details at once in a sheet fixed to the bottom of the screen, with its unlock button. */
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
  A4: '<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/>',
  A5: '<path d="M6 18 18 6M15 6h3v3M5 15l4 4M3 21l3-3"/><path d="M14 14l4 4"/>',
  D4: '<path d="M4 15l3-9h10l3 9-8 6z"/><path d="M8 11h8"/>',
  D5: '<path d="M12 21c-5-3-8-6-8-10a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 4-3 7-8 10z"/><path d="M12 7v8M9 11h6"/>',
  U4: '<path d="M12 3c3 3 5 5 5 8a5 5 0 0 1-10 0c0-3 2-5 5-8z"/><path d="M8 18l-2 3M16 18l2 3"/>',
  U5: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M12 8v8M8 12h8"/>',
  S1: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  S2: '<path d="M4 12h10M6 8h10M8 16h10"/><path d="M18 6l3 6-3 6"/>',
  S3: '<path d="M13 2 5 13h6l-1 9 8-11h-6z"/>',
  S4: '<path d="M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6z"/><path d="M12 8v5"/><circle cx="12" cy="16" r=".6"/>',
  S5: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  W1: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.7 0-3 1-3 2.2 0 2.8 6 1.4 6 4.2 0 1.3-1.3 2.3-3 2.3-1.2 0-2.3-.6-2.8-1.6M12 6v2M12 16v2"/>',
  W2: '<path d="M4 6c3-1 6-1 8 1 2-2 5-2 8-1v13c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 7v13"/>',
  W3: '<path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z"/>',
  W4: '<path d="M4 9h16v11H4z"/><path d="M4 9l2-5h12l2 5M12 9v11M9 14h6"/>',
  W5: '<rect x="4" y="5" width="16" height="15" rx="2"/><circle cx="12" cy="12.5" r="3"/><path d="M12 9.5V8M8 20v1M16 20v1"/>',
};
const TREE_COL = ['#ff7a5a', '#5aaaff', '#3fd6b8', '#b98aff', '#ffcf40'];
/** Id of the skill shown in the sheet (null = none). */
let treeSel = null;
/** 'own' (unlocked), 'av' (can be unlocked now) or 'lock' (the one before it isn't yet). */
function treeState(br, i) {
  const n = br.nodes[i];
  return S.tree[n.id] ? 'own' : i === 0 || S.tree[br.nodes[i - 1].id] ? 'av' : 'lock';
}
const treeSvg = id => '<svg viewBox="0 0 24 24" aria-hidden="true">' + (TREE_IC[id] || '') + '</svg>';
/** open: the screen is being opened (columns fade in); otherwise a redraw after a tap keeps everything still,
    including how far the columns are scrolled. */
function drawTree(open = true) {
  const V = $('treeView'),
    sx = V.scrollLeft,
    sy = $('tree').scrollTop;
  if (open) treeSel = null;
  V.classList.toggle('still', !open);
  V.innerHTML = '';
  TREE.forEach((br, bi) => {
    const col = el('section', 'tcol');
    col.style.setProperty('--bc', TREE_COL[bi % TREE_COL.length]);
    col.style.animationDelay = bi * 0.05 + 's';
    const own = br.nodes.filter(n => S.tree[n.id]).length,
      head = el('header', 'thead');
    head.append(el('b', '', br.n), el('small', '', own + ' / ' + br.nodes.length));
    const bar = el('i', 'tprog');
    bar.appendChild(el('em')).style.width = (own / br.nodes.length) * 100 + '%';
    head.appendChild(bar);
    col.appendChild(head);
    br.nodes.forEach((n, i) => {
      const stt = treeState(br, i),
        b = el(
          'button',
          'tnode ' + stt + (treeSel === n.id ? ' sel' : '') + (stt === 'av' && S.sp >= n.c ? ' can' : '')
        );
      b.innerHTML = '<span class="tic">' + treeSvg(n.id) + '</span>';
      b.append(el('span', 'tnm', n.n), el('span', 'tco', stt === 'own' ? '✓' : stt === 'lock' ? '🔒' : n.c + ' ✨'));
      b.setAttribute('aria-label', n.n);
      b.onclick = () => {
        treeSel = treeSel === n.id ? null : n.id;
        AU.play('select');
        drawTree(false);
      };
      col.appendChild(b);
    });
    V.appendChild(col);
  });
  V.scrollLeft = sx;
  $('tree').scrollTop = sy;
  treeSheet();
}
/** The sheet with the chosen skill: what it does, its cost, and the button to unlock it. */
function treeSheet() {
  const I = $('tvInfo');
  let bi = -1,
    ni = -1;
  TREE.forEach((br, b) =>
    br.nodes.forEach((n, i) => {
      if (n.id === treeSel) ((bi = b), (ni = i));
    })
  );
  I.classList.toggle('on', bi >= 0);
  if (bi < 0) return;
  const br = TREE[bi],
    n = br.nodes[ni],
    stt = treeState(br, ni);
  I.innerHTML = '';
  I.style.setProperty('--bc', TREE_COL[bi % TREE_COL.length]);
  const ic = el('span', 'tic big');
  ic.innerHTML = treeSvg(n.id);
  const txt = el('div', 'ttxt');
  txt.append(
    el('small', '', br.n + ' · المهارة ' + (ni + 1) + ' من ' + br.nodes.length),
    el('h3', '', n.n),
    el('p', '', n.d)
  );
  const b = el(
    'button',
    'btn' + (stt === 'av' ? ' go' : ''),
    stt === 'own'
      ? '✓ مفعّلة'
      : stt === 'lock'
        ? '🔒 فعّل «' + br.nodes[ni - 1].n + '» أول'
        : 'فعّلها بـ ' + n.c + ' ✨'
  );
  b.disabled = stt !== 'av';
  b.onclick = () => {
    if (S.sp < n.c) {
      AU.play('deny');
      toast('تحتاج ' + (n.c - S.sp) + ' نقطة مهارة إضافية');
      return;
    }
    S.sp -= n.c;
    S.tree[n.id] = 1;
    AU.play('unlock');
    save();
    newRun();
    drawTree(false);
    wallet();
  };
  const x = el('button', 'iconBtn tx', '✖');
  x.setAttribute('aria-label', 'إغلاق');
  x.onclick = () => {
    treeSel = null;
    drawTree(false);
  };
  I.append(ic, txt, b, x);
}
