'use strict';
/* Tiny DOM helpers shared by every UI module. */
const $ = id => document.getElementById(id);
/** Create an element with an optional class and text content. */
function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}
/** Row of level pips (filled up to l, out of max). */
function pips(l, max) {
  const d = el('div', 'pips');
  for (let i = 0; i < max; i++) d.appendChild(el('i', i < l ? 'on' : ''));
  return d;
}
