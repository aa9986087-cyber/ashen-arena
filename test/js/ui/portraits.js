'use strict';
/* Hero portraits: static thumbnails keep the hero screen instant; the old 3D renderer is a fallback. */
const PORTRAIT_VER = 'heroes-20261116-v20';
const portraitFile = id => `assets/portraits/${id}.jpg?v=${PORTRAIT_VER}`;
const PORTRAIT_FILES = {
  knight: portraitFile('knight'),
  ranger: portraitFile('ranger'),
  gunner: portraitFile('gunner'),
  mage: portraitFile('mage'),
  berserker: portraitFile('berserker'),
  assassin: portraitFile('assassin'),
  gunnerx: portraitFile('gunnerx'),
};
const PORTRAITS = {};
let portraitKey = '';
let portraitsWarmed = false;
/** Fetch the small thumbnails while the player is still on the menu. */
function preloadPortraits() {
  if (portraitsWarmed) return;
  portraitsWarmed = true;
  for (const id in PORTRAIT_FILES) {
    const img = new Image();
    img.decoding = 'async';
    img.src = PORTRAIT_FILES[id];
  }
}
function heroPortrait(id) {
  if (PORTRAIT_FILES[id]) return PORTRAIT_FILES[id];
  // Fallback for a hero without a baked thumbnail: the old on-demand 3D render.
  // A newly loaded hero model invalidates this fallback cache.
  const key = Object.keys(HERO_GEOS).join();
  if (key !== portraitKey) {
    for (const k in PORTRAITS) delete PORTRAITS[k];
    portraitKey = key;
  }
  if (PORTRAITS[id]) return PORTRAITS[id];
  const prevChar = S.char,
    prevW = G.weapons,
    W0 = W,
    H0 = H;
  try {
    S.char = id;
    G.weapons = [{ id: CHARS[id].wep, lvl: 3, cd: 0 }];
    buildPlayer();
    PM.g.position.set(0, 0, 0);
    const hgv = HERO_GEOS[id] || HERO_GEOS['*'];
    PM.g.rotation.y = hgv && hgv.view !== undefined ? hgv.view : 0.45;
    if (PM.anim && PM.anim.idle) {
      const I = PM.anim.idle,
        hg = HERO_GEOS[id] || HERO_GEOS['*'];
      PM.hm.geometry = I[Math.min(I.length - 1, ((hg && hg.pose) || 0) * I.length) | 0];
    }
    const hd = PM.wpHand && PM.hm.geometry.userData.hand;
    if (hd) {
      PM.wp.position.copy(hd.p);
      PM.wp.quaternion.copy(hd.q).multiply(WP_ALIGN);
    }
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    cam.position.set(1.7, 2.3, 4.8);
    cam.lookAt(0, 1.2, 0);
    renderer.setSize(220, 220, false);
    renderer.render(scene, cam);
    PORTRAITS[id] = renderer.domElement.toDataURL('image/jpeg', 0.86);
  } catch (e) {
    PORTRAITS[id] = '';
  }
  renderer.setSize(W0, H0, false);
  S.char = prevChar;
  G.weapons = prevW;
  buildPlayer();
  return PORTRAITS[id];
}
