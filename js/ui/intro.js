'use strict';
/* Boot intro ("VAMOS يقدّم") and the floating embers behind the main menu. */
function initIntro() {
  const m = $('menu'),
    it = $('intro'),
    E = $('embers');
  for (let i = 0; i < 18; i++) {
    const e = document.createElement('i');
    e.style.left = Math.random() * 100 + '%';
    e.style.setProperty('--x', Math.random() * 120 - 60 + 'px');
    e.style.animationDuration = 5 + Math.random() * 7 + 's';
    e.style.animationDelay = -Math.random() * 10 + 's';
    e.style.opacity = 0.35 + Math.random() * 0.6;
    E.appendChild(e);
  }
  // Tapping skips the intro; otherwise it fades by itself and the menu's entrance delay (--d) is cleared.
  const end = () => {
    it.classList.add('done');
    m.classList.remove('boot');
  };
  it.addEventListener('pointerdown', end);
  setTimeout(() => it.classList.add('done'), 2700);
  setTimeout(() => m.classList.remove('boot'), 5200);
}
