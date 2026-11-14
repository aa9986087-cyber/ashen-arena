'use strict';
/* Skill tree screen, vertical: a tab per branch; the chosen branch is a path of skills from top to bottom,
   with the chosen skill's details beside it (under it on a phone held upright). Nothing floats, so the details
   are always right where you look. */
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
let treeBr = 0,
  treeSel = null;
/** 'own' (unlocked), 'av' (can be unlocked now) or 'lock' (the one before it isn't yet). */
function treeState(br, i) {
  const n = br.nodes[i];
  return S.tree[n.id] ? 'own' : i === 0 || S.tree[br.nodes[i - 1].id] ? 'av' : 'lock';
}
const treeSvg = id => '<svg viewBox="0 0 24 24" aria-hidden="true">' + (TREE_IC[id] || '') + '</svg>';
/** The first skill of a branch still to get (or its last one). */
const treeNext = br => (br.nodes.find(n => !S.tree[n.id]) || br.nodes[br.nodes.length - 1]).id;
/** open: the screen is being opened (fresh selection, fade in); a redraw after a tap keeps everything still. */
function drawTree(open = true) {
  const V = $('treeView');
  if (open) {
    treeSel = treeNext(TREE[treeBr]);
  }
  V.classList.toggle('still', !open);
  V.innerHTML = '';
  // the branches
  const tabs = el('div', 'ttabs');
  TREE.forEach((br, bi) => {
    const own = br.nodes.filter(n => S.tree[n.id]).length,
      t = el('button', 'ttab' + (bi === treeBr ? ' on' : ''));
    t.style.setProperty('--bc', TREE_COL[bi]);
    t.append(el('b', '', br.n), el('small', '', own + '/' + br.nodes.length));
    if (br.nodes.some((n, i) => treeState(br, i) === 'av' && S.sp >= n.c)) t.appendChild(el('i', 'dot'));
    t.onclick = () => {
      treeBr = bi;
      treeSel = treeNext(br);
      AU.play('select');
      drawTree(false);
    };
    tabs.appendChild(t);
  });
  V.appendChild(tabs);
  const br = TREE[treeBr],
    body = el('div', 'tbody');
  body.style.setProperty('--bc', TREE_COL[treeBr]);
  // the branch, top to bottom
  const path = el('div', 'tpath');
  br.nodes.forEach((n, i) => {
    const stt = treeState(br, i),
      b = el('button', 'tnode ' + stt + (treeSel === n.id ? ' sel' : '') + (stt === 'av' && S.sp >= n.c ? ' can' : ''));
    const ic = el('span', 'tic');
    ic.innerHTML = treeSvg(n.id);
    ic.appendChild(el('i', 'tnum', String(i + 1)));
    b.append(ic, el('span', 'tnm', n.n), el('span', 'tco', stt === 'own' ? '✓' : stt === 'lock' ? '🔒' : n.c + ' ✨'));
    b.setAttribute('aria-label', n.n);
    b.onclick = () => {
      treeSel = n.id;
      AU.play('select');
      drawTree(false);
      // a phone held upright: the details are under the path, bring them into view
      const inf = $('treeView').querySelector('.tinfo');
      if (inf && inf.getBoundingClientRect().bottom > innerHeight)
        inf.scrollIntoView({ behavior: 'smooth', block: 'end' });
    };
    path.appendChild(b);
  });
  body.appendChild(path);
  body.appendChild(treeInfo(br));
  V.appendChild(body);
}
/** The chosen skill: what it does, its cost, and the button to unlock it. */
function treeInfo(br) {
  const ni = Math.max(
      0,
      br.nodes.findIndex(n => n.id === treeSel)
    ),
    n = br.nodes[ni],
    stt = treeState(br, ni),
    I = el('div', 'tinfo');
  const ic = el('span', 'tic big');
  ic.innerHTML = treeSvg(n.id);
  const top = el('div', 'ttop'),
    txt = el('div', 'ttxt');
  txt.append(el('small', '', br.n + ' · المهارة ' + (ni + 1) + ' من ' + br.nodes.length), el('h3', '', n.n));
  top.append(ic, txt);
  const st = el(
    'p',
    'tst ' + stt,
    stt === 'own'
      ? 'مفعّلة ✓'
      : stt === 'lock'
        ? 'مقفلة: فعّل «' + br.nodes[ni - 1].n + '» أول'
        : 'السعر: ' + n.c + ' ✨ · معك ' + S.sp + ' ✨'
  );
  const b = el(
    'button',
    'btn' + (stt === 'av' ? ' go' : ''),
    stt === 'own' ? '✓ مفعّلة' : stt === 'lock' ? '🔒 مقفلة' : 'فعّلها بـ ' + n.c + ' ✨'
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
    treeSel = treeNext(br);
    drawTree(false);
    wallet();
  };
  I.append(top, el('p', 'tdesc', n.d), st, b);
  return I;
}
