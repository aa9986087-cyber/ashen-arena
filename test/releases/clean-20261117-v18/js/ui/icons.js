'use strict';
/* Icons instead of emojis. Every emoji the game writes into the page is swapped for an SVG icon
   (game-icons.net / Lucide, see js/data/icon-set.js) as it lands in the DOM, so the rest of the
   code keeps writing plain strings. Canvas text goes through cvText(), which draws the same icons. */
const ICON_RE = new RegExp(
  '(' +
    Object.keys(ICON_MAP)
      .sort((a, b) => b.length - a.length)
      .map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|') +
    ')\\uFE0F?',
  'gu'
);
const ICON_TEST = new RegExp(ICON_RE.source, 'u');
const iconKey = e => ICON_MAP[e.replace(/️/g, '')];
const iconTpl = new Map();
/** One icon as a DOM element (cloned from a cached template). */
function iconEl(e) {
  const m = iconKey(e);
  if (!m) return document.createTextNode(e);
  let t = iconTpl.get(e);
  if (!t) {
    const [vb, body] = ICON_SVG[m[0]];
    t = document.createElement('i');
    t.className = 'gi';
    t.setAttribute('aria-hidden', 'true');
    t.innerHTML = '<svg viewBox="0 0 ' + vb + ' ' + vb + '" style="color:' + m[1] + '">' + body + '</svg>';
    iconTpl.set(e, t);
  }
  return t.cloneNode(true);
}
/** The icon as HTML (for code that builds innerHTML). */
function icon(e) {
  return iconEl(e).outerHTML;
}
/** Strips the emojis from a string (for places that can only hold text). */
const noEmoji = s =>
  String(s)
    .replace(ICON_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
const ICON_SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, TITLE: 1, svg: 1 };
function iconText(n) {
  const s = n.data;
  if (!s || !ICON_TEST.test(s)) return;
  const p = n.parentNode;
  if (!p || ICON_SKIP[p.nodeName]) return;
  // an <option> can only show text
  if (p.nodeName === 'OPTION') return void (n.data = noEmoji(s));
  const f = document.createDocumentFragment();
  let last = 0;
  ICON_RE.lastIndex = 0;
  for (let m; (m = ICON_RE.exec(s)); ) {
    if (m.index > last) f.appendChild(document.createTextNode(s.slice(last, m.index)));
    f.appendChild(iconEl(m[0]));
    last = m.index + m[0].length;
  }
  if (last < s.length) f.appendChild(document.createTextNode(s.slice(last)));
  p.replaceChild(f, n);
}
function iconize(root) {
  if (root.nodeType === 3) return iconText(root);
  if (root.nodeType !== 1 || ICON_SKIP[root.nodeName]) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
    list = [];
  for (let n; (n = w.nextNode()); ) if (ICON_TEST.test(n.data)) list.push(n);
  list.forEach(iconText);
}
iconize(document.body);
new MutationObserver(recs => {
  for (const r of recs) {
    if (r.type === 'characterData') iconText(r.target);
    else for (const n of r.addedNodes) iconize(n);
  }
}).observe(document.body, { childList: true, subtree: true, characterData: true });
// native dialogs and the tab title can't hold an icon
for (const k of ['alert', 'confirm', 'prompt']) {
  const f = window[k];
  window[k] = (m, ...a) => f.call(window, m === undefined ? m : noEmoji(m), ...a);
}

/* ---------- canvas ---------- */
const iconImgs = new Map();
/** The icon as an image for canvas (null until it has loaded). */
function iconImg(e) {
  const m = iconKey(e);
  if (!m) return null;
  let im = iconImgs.get(m[0] + m[1]);
  if (!im) {
    const [vb, body] = ICON_SVG[m[0]];
    im = new Image();
    im.src =
      'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
          vb +
          ' ' +
          vb +
          '" width="64" height="64" color="' +
          m[1] +
          '">' +
          body.replace(/currentColor/g, m[1]) +
          '</svg>'
      );
    iconImgs.set(m[0] + m[1], im);
  }
  return im.complete && im.naturalWidth ? im : null;
}
/** Draws the icon centred on x,y. */
function cvIcon(x, e, cx, cy, size) {
  const im = iconImg(e);
  if (im) x.drawImage(im, cx - size / 2, cy - size / 2, size, size);
}
/** fillText/strokeText that shows the emojis as icons (placed before the text; text is centred). */
function cvText(x, s, cx, cy, stroke) {
  s = String(s);
  if (!ICON_TEST.test(s)) return stroke ? x.strokeText(s, cx, cy) : x.fillText(s, cx, cy);
  const ems = s.match(ICON_RE) || [],
    t = noEmoji(s),
    size = parseFloat((x.font.match(/(\d+(?:\.\d+)?)px/) || [0, 16])[1]) * 1.05,
    tw = t ? x.measureText(t).width : 0,
    gap = t ? size * 0.25 : 0,
    iw = ems.length * size,
    al = x.textAlign,
    left = al === 'center' ? cx - (iw + gap + tw) / 2 : al === 'right' || al === 'end' ? cx - iw - gap - tw : cx,
    bl = x.textBaseline,
    my = bl === 'top' ? cy + size / 2 : bl === 'middle' ? cy : cy - size * 0.36;
  if (stroke) {
    if (t) {
      x.textAlign = 'left';
      x.strokeText(t, left + iw + gap, cy);
      x.textAlign = al;
    }
    return;
  }
  ems.forEach((e, i) => cvIcon(x, e, left + size * (i + 0.5), my, size));
  if (t) {
    x.textAlign = 'left';
    x.fillText(t, left + iw + gap, cy);
    x.textAlign = al;
  }
}
// canvas icons decode in the background so they're ready when first drawn
setTimeout(() => Object.keys(ICON_MAP).forEach(iconImg), 500);
