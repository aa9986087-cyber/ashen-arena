'use strict';
/* Keyboard, mouse, touch joystick and on-screen action buttons. */
addEventListener('keydown', e => {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  IN.k[e.code] = true;
  if (G.state === 'play') {
    if (e.code === 'Space') {
      e.preventDefault();
      dash();
    }
    if (e.code === 'KeyQ' || e.code === 'KeyE') special();
    if (e.code === 'Escape' || e.code === 'KeyP') pause(true);
    if (e.code === 'KeyL' && LAB) openLab();
  } else if (G.state === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) {
    show('settings', false);
    pause(false);
  } else if (G.state === 'cards' && /^Digit[1-4]$/.test(e.code)) chooseCard(+e.code[5] - 1);
});
addEventListener('keyup', e => {
  IN.k[e.code] = false;
});
addEventListener('blur', () => {
  IN.k = {};
  IN.md = false;
  IN.atk = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause(true);
    saveRun();
  }
});
addEventListener('pagehide', saveRun);
const ray = new THREE.Raycaster(),
  gplane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  ndc = new THREE.Vector2(),
  hitP = new THREE.Vector3();
function setMouse(e) {
  IN.sx = e.clientX;
  IN.sy = e.clientY;
}
function mouseWorld() {
  ndc.set((IN.sx / W) * 2 - 1, -(IN.sy / H) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(gplane, hitP)) {
    IN.mx = +hitP.x || 0;
    IN.mz = +hitP.z || 0;
  }
}
const joyEl = $('joy');
glC.addEventListener('pointerdown', e => {
  AU.init();
  if (e.pointerType === 'touch') {
    if (!IN.touch) {
      IN.touch = true;
      document.body.classList.remove('mouse');
    }
    if (IN.joy === null && G.state === 'play') {
      IN.joy = e.pointerId;
      IN.j0x = e.clientX;
      IN.j0y = e.clientY;
      IN.jx = IN.jz = 0;
      joyEl.hidden = false;
      joyEl.style.left = e.clientX + 'px';
      joyEl.style.top = e.clientY + 'px';
      joyEl.firstElementChild.style.transform = '';
    }
  } else {
    IN.touch = false;
    document.body.classList.add('mouse');
    IN.md = true;
    setMouse(e);
  }
});
addEventListener('pointermove', e => {
  if (e.pointerId === IN.joy) {
    let dx = e.clientX - IN.j0x,
      dy = e.clientY - IN.j0y;
    const d = Math.hypot(dx, dy),
      m = 52;
    if (d > m) {
      dx *= m / d;
      dy *= m / d;
    }
    IN.jx = dx / m;
    IN.jz = dy / m;
    joyEl.firstElementChild.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  } else if (e.pointerType !== 'touch') setMouse(e);
});
function pUp(e) {
  if (e.pointerId === IN.joy) {
    IN.joy = null;
    IN.jx = IN.jz = 0;
    joyEl.hidden = true;
  }
  if (e.pointerType !== 'touch') IN.md = false;
}
addEventListener('pointerup', pUp);
addEventListener('pointercancel', pUp);
glC.addEventListener('contextmenu', e => e.preventDefault());
const hold = (id, down, up) => {
  const b = $(id);
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    AU.init();
    down();
  });
  if (up) {
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  }
};
hold('bDash', dash);
hold('bSpec', special);
hold(
  'bAtk',
  () => {
    IN.atk = true;
    $('bAtk').classList.add('held');
  },
  () => {
    IN.atk = false;
    $('bAtk').classList.remove('held');
  }
);
