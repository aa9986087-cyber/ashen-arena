'use strict';
/* Hero portraits: each hero rendered in 3D (with their starting weapon) into a small image, cached. */
const PORTRAITS = {};
let portraitKey = '';
function heroPortrait(id) {
  // a newly loaded hero model invalidates the cache
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
    PM.g.rotation.y = 0.45;
    if (PM.anim && PM.anim.idle) PM.hm.geometry = PM.anim.idle[0];
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
