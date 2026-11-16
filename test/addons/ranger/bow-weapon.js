'use strict';
/* Only the bow branch from c0c1701:test/js/render/player-model.js; no global model-table edits. */
(() => {
  function buildBow(R, id, t, ev, tc, em, s) {
    const registry = window.ASHEN_ADDONS;
    if (!registry || typeof registry.enabled !== 'function' || !registry.enabled('ranger') ||
      !R || R.char !== 'ranger' || id !== 'bow' || !R.wp || typeof THREE === 'undefined' ||
      typeof mesh !== 'function' || typeof lam !== 'function') return false;
    const w = R.wp;
    const b = new THREE.Mesh(
      new THREE.TorusGeometry(0.72 * s, 0.045 + 0.018 * t, 8, 18, Math.PI),
      lam(t ? tc : 0x5a321e, em)
    );
    b.rotation.set(Math.PI, Math.PI / 2, 0);
    b.castShadow = true;
    w.add(b);
    w.add(mesh(CYL, 0x342018, 0, 0, 0, 0.055 * s, 0.34 * s, 0.055 * s));
    w.add(mesh(BOX, t ? tc : 0xd7c6a0, 0, 0, 0, 0.018, 0.018, 1.44 * s, em));
    w.add(mesh(CONE, t ? tc : 0xd7c6a0, 0, -0.72 * s, 0, 0.06 * s, 0.18 * s, 0.06 * s, em));
    return true;
  }
  window.ASHEN_RANGER_BOW = Object.freeze({ buildBow });
})();
