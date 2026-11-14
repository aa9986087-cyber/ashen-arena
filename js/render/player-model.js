'use strict';
/* Hero model built from primitives (or a loaded hero.glb), plus the held weapon. */
/** Baked hero models ({ base, clips }) by CHARS id ('*' = any hero), filled by loadModels(). */
/** Turns the procedural weapon (built pointing down -Y) to point along a KayKit hand slot (+Y). */
const WP_ALIGN = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));
const HERO_GEOS = {};
const PM = {};
const matC = {};
const lam = (c, em) => {
  const k = c + '_' + (em || 0);
  return matC[k] || (matC[k] = new THREE.MeshLambertMaterial({ color: c, emissive: em || 0 }));
};
function mesh(g, c, x, y, z, sx, sy, sz, em) {
  const m = new THREE.Mesh(g, lam(c, em));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}
function buildPlayer() {
  buildRig(PM, S.char);
}
/** Build a hero rig (body, limbs, held weapon) into R: the local hero is PM; co-op teammates get their own. */
function buildRig(R, charId, wep) {
  if (R.g) scene.remove(R.g);
  if (!CHARS[charId]) charId = 'knight';
  R.char = charId;
  const ch = CHARS[charId],
    g = new THREE.Group(),
    c = charId,
    gold = 0xd0a440,
    dark = 0x1e1e26;
  g.add(mesh(BOX, ch.col, 0, 1.25, 0, 0.8, 0.9, 0.5));
  g.add(mesh(BOX, 0x2a2a33, 0, 0.84, 0, 0.84, 0.14, 0.54));
  g.add(mesh(BOX, gold, 0, 0.84, 0.27, 0.18, 0.16, 0.04));
  g.add(mesh(BOX, ch.cape, 0, 1.3, 0.26, 0.3, 0.6, 0.03));
  g.add(mesh(SPH, 0xe8b88a, 0, 2.02, 0, 0.6, 0.6, 0.6));
  g.add(mesh(BOX, dark, -0.12, 2.05, 0.28, 0.08, 0.09, 0.05));
  g.add(mesh(BOX, dark, 0.12, 2.05, 0.28, 0.08, 0.09, 0.05));
  g.add(mesh(BOX, ch.cape, 0, 1.1, -0.31, 0.82, 1.35, 0.06));
  g.add(mesh(BOX, ch.cape, 0, 0.5, -0.36, 0.7, 0.3, 0.05));
  g.add(mesh(SPH, c === 'knight' || c === 'berserker' ? 0xb8c0cc : ch.cape, -0.52, 1.7, 0, 0.46, 0.32, 0.5));
  g.add(mesh(SPH, c === 'knight' || c === 'berserker' ? 0xb8c0cc : ch.cape, 0.52, 1.7, 0, 0.46, 0.32, 0.5));
  if (c === 'knight') {
    g.add(mesh(SPH, 0xb8c0cc, 0, 2.12, 0, 0.68, 0.5, 0.68));
    g.add(mesh(BOX, 0xb8c0cc, 0, 2.02, 0.3, 0.08, 0.3, 0.06));
    g.add(mesh(CONE, 0xd03030, 0, 2.6, -0.08, 0.18, 0.6, 0.18));
    g.add(mesh(BOX, 0xb8c0cc, 0, 1.3, 0.27, 0.6, 0.5, 0.04));
  }
  if (c === 'ranger') {
    g.add(mesh(CONE, ch.cape, 0, 2.3, -0.04, 0.78, 0.62, 0.78));
    g.add(mesh(CYL, 0x6b4a2a, -0.2, 1.4, -0.4, 0.2, 0.8, 0.2));
    g.add(mesh(CONE, 0xe8e0c8, -0.2, 1.9, -0.4, 0.16, 0.2, 0.16));
  }
  if (c === 'gunner') {
    g.add(mesh(SPH, 0x4d5230, 0, 2.14, 0, 0.7, 0.44, 0.7));
    g.add(mesh(BOX, 0x4d5230, 0, 2.1, 0.3, 0.5, 0.06, 0.3));
    g.add(mesh(BOX, 0x3d4024, 0, 1.25, -0.4, 0.6, 0.7, 0.24));
  }
  if (c === 'mage') {
    g.add(mesh(CYL, ch.cape, 0, 2.28, 0, 1, 0.06, 1));
    g.add(mesh(CONE, ch.cape, 0, 2.78, 0, 0.56, 1, 0.56));
    g.add(mesh(SPH, 0xffd040, 0, 3.3, 0, 0.14, 0.14, 0.14, 0x806000));
  }
  if (c === 'berserker') {
    g.add(mesh(SPH, 0x6a6a72, 0, 2.14, 0, 0.68, 0.46, 0.68));
    const h1 = mesh(CONE, 0xe8e0c8, -0.4, 2.4, 0, 0.14, 0.5, 0.14),
      h2 = mesh(CONE, 0xe8e0c8, 0.4, 2.4, 0, 0.14, 0.5, 0.14);
    h1.rotation.z = 0.7;
    h2.rotation.z = -0.7;
    g.add(h1);
    g.add(h2);
    g.add(mesh(BOX, 0x5a3a22, 0, 1.72, -0.1, 1.2, 0.26, 0.6));
    g.add(mesh(BOX, 0x8a5a3a, 0, 1.55, 0.27, 0.4, 0.3, 0.04));
  }
  if (c === 'assassin') {
    g.add(mesh(CONE, ch.cape, 0, 2.32, -0.04, 0.8, 0.66, 0.8));
    g.add(mesh(BOX, ch.cape, 0, 1.9, 0.24, 0.5, 0.2, 0.14));
    g.add(mesh(BOX, 0xb02020, 0, 0.84, 0.28, 0.5, 0.08, 0.03));
  }
  if (c === 'gunnerx') {
    g.add(mesh(SPH, 0x555a40, 0, 2.14, 0, 0.72, 0.48, 0.72));
    g.add(mesh(BOX, 0x202020, 0, 2.06, 0.29, 0.5, 0.14, 0.06));
    g.add(mesh(BOX, 0x60c8ff, -0.12, 2.06, 0.33, 0.16, 0.1, 0.03));
    g.add(mesh(BOX, 0x60c8ff, 0.12, 2.06, 0.33, 0.16, 0.1, 0.03));
    g.add(mesh(CYL, 0x3a3e30, 0.25, 1.3, -0.42, 0.26, 0.9, 0.26));
  }
  g.add(mesh(CYL, gold, -0.52, 1.62, 0, 0.5, 0.05, 0.54));
  g.add(mesh(CYL, gold, 0.52, 1.62, 0, 0.5, 0.05, 0.54));
  g.add(mesh(SPH, 0xffd75a, 0, 1.42, 0.27, 0.16, 0.16, 0.06, 0x8a5a00));
  g.add(mesh(BOX, gold, 0, 0.46, -0.39, 0.72, 0.07, 0.04));
  g.add(mesh(BOX, gold, -0.3, 1.25, 0.26, 0.04, 0.86, 0.03));
  g.add(mesh(BOX, gold, 0.3, 1.25, 0.26, 0.04, 0.86, 0.03));
  {
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.92, 32), addMat(0xffc84a, 0.32));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.05;
    g.add(halo);
  }
  const limb = (x, y, col, len, foot) => {
    const pv = new THREE.Group();
    pv.position.set(x, y, 0);
    pv.add(mesh(BOX, col, 0, -len / 2, 0, 0.28, len, 0.28));
    if (foot) pv.add(mesh(BOX, dark, 0, -len + 0.1, 0.07, 0.33, 0.22, 0.44));
    else pv.add(mesh(BOX, 0xe8b88a, 0, -len + 0.06, 0, 0.24, 0.16, 0.24));
    g.add(pv);
    return pv;
  };
  R.lL = limb(-0.22, 0.8, 0x34343f, 0.8, 1);
  R.lR = limb(0.22, 0.8, 0x34343f, 0.8, 1);
  R.aL = limb(-0.55, 1.65, ch.col, 0.75);
  R.aR = limb(0.55, 1.65, ch.col, 0.75);
  if (c === 'knight') {
    R.aL.add(mesh(BOX, 0xb8c0cc, -0.16, -0.45, 0.12, 0.1, 0.8, 0.62));
    R.aL.add(mesh(BOX, 0xa02a2a, -0.22, -0.45, 0.12, 0.04, 0.4, 0.3));
  }
  if (c === 'assassin') R.aL.add(mesh(BOX, 0xd8dde6, 0, -0.95, 0, 0.06, 0.5, 0.04));
  R.wp = new THREE.Group();
  R.wp.position.y = -0.75;
  R.aR.add(R.wp);
  const heroGeo = HERO_GEOS[charId] || HERO_GEOS['*'];
  if (heroGeo) {
    // a loaded model replaces the body; only the weapon in the right hand stays procedural
    for (const ch of g.children) if (ch !== R.aR) ch.visible = false;
    for (const ch of R.aR.children) if (ch !== R.wp) ch.visible = false;
    const hm = new THREE.Mesh(heroGeo.base, lamV);
    hm.castShadow = true;
    g.add(hm);
    R.hm = hm;
    R.anim = heroGeo.clips;
    // the weapon leaves the procedural arm and follows the model's own hand (see render)
    R.wpHand = !!heroGeo.base.userData.hand;
    if (R.wpHand) g.add(R.wp);
  } else {
    R.hm = R.anim = null;
    R.wpHand = false;
  }
  R.g = g;
  scene.add(g);
  buildWeapon(R, wep);
}
function buildWeapon(R = PM, wep) {
  const w = R.wp;
  while (w.children.length) w.remove(w.children[0]);
  const cur = wep || (R === PM && G && G.weapons && G.weapons[0]),
    id = cur ? cur.id : CHARS[R.char || S.char].wep,
    L = cur ? cur.lvl : 1,
    t = wTier(L);
  // an evolved weapon glows violet and is bigger
  const ev = cur && cur.evo,
    tc = ev ? 0xd070ff : [0xc3cad6, 0x62d0ff, 0xffc53d][t],
    em = ev ? 0x5a1488 : [0, 0x0a3a55, 0x7a4a00][t],
    s = ev ? 1.6 : 1 + t * 0.18;
  if (id === 'sword') {
    w.add(mesh(BOX, tc, 0, -0.78 * s, 0, 0.15 * s, 1.45 * s, 0.05, em));
    w.add(mesh(BOX, 0x6b4a2a, 0, -0.03, 0, 0.5, 0.1, 0.12));
  } else if (id === 'axe') {
    w.add(mesh(CYL, 0x6b4a2a, 0, -0.5, 0, 0.1, 1.3, 0.1));
    w.add(mesh(BOX, tc, 0, -1.05, 0.2 * s, 0.08, 0.55 * s, 0.6 * s, em));
    if (t) w.add(mesh(BOX, tc, 0, -1.05, -0.2 * s, 0.08, 0.45 * s, 0.4 * s, em));
  } else if (id === 'bow') {
    const b = new THREE.Mesh(
      new THREE.TorusGeometry(0.62 * s, 0.05 + 0.02 * t, 6, 14, Math.PI),
      lam(t ? tc : 0x8a5a2b, em)
    );
    b.rotation.set(Math.PI, Math.PI / 2, 0);
    b.castShadow = true;
    w.add(b);
    w.add(mesh(BOX, 0xf0f0f0, 0, 0, 0, 0.02, 0.02, 1.24 * s));
  } else if (id === 'pistol') {
    w.add(mesh(BOX, 0x30343c, 0, -0.22, 0, 0.15, 0.45, 0.16));
    w.add(mesh(BOX, tc, 0, -0.5 * s, 0, 0.1, 0.2 * s, 0.1, em));
  } else if (id === 'rifle') {
    w.add(mesh(BOX, 0x30343c, 0, -0.45, 0, 0.15, 1, 0.18));
    w.add(mesh(BOX, tc, 0, -1.02 * s, 0, 0.08, 0.3 * s, 0.08, em));
    w.add(mesh(BOX, 0x5a3a1b, 0, -0.2, -0.16, 0.12, 0.3, 0.2));
    if (t) w.add(mesh(BOX, tc, 0.12, -0.8, 0, 0.07, 0.5, 0.07, em));
  } else if (id === 'rocket') {
    w.add(mesh(CYL, 0x4d5230, 0, -0.4, 0, 0.32 * s, 1.4, 0.32 * s));
    const c = mesh(CONE, tc, 0, -1.25, 0, 0.34 * s, 0.4, 0.34 * s, em);
    c.rotation.x = Math.PI;
    w.add(c);
  } else if (id === 'staff') {
    w.add(mesh(CYL, 0x6b4a2a, 0, -0.5, 0, 0.09, 1.7, 0.09));
    w.add(mesh(SPH, tc, 0, -1.42, 0, 0.34 * s, 0.34 * s, 0.34 * s, [0x1a4a66, 0x0a6a95, 0xaa6a00][t]));
    if (t === 2) w.add(mesh(CYL, 0xffc53d, 0, -1.42, 0, 0.6, 0.04, 0.6, em));
  } else if (id === 'whip') {
    w.add(mesh(CYL, 0x3a2a1a, 0, -0.2, 0, 0.1, 0.45, 0.1));
    for (let i = 0; i < 5; i++)
      w.add(
        mesh(
          BOX,
          ev ? tc : 0x7fd0ff,
          Math.sin(i) * 0.08,
          -0.55 - i * 0.28 * s,
          0,
          0.06,
          0.3 * s,
          0.06,
          ev ? em : 0x1a5a88
        )
      );
  } else if (id === 'flame') {
    w.add(mesh(CYL, 0x8a2a1a, 0, -0.35, -0.12, 0.26, 0.6, 0.26));
    w.add(mesh(CYL, 0x30343c, 0, -0.85 * s, 0, 0.1, 0.7 * s, 0.1));
    w.add(mesh(CONE, ev ? tc : 0xff8a20, 0, -1.3 * s, 0, 0.14, 0.25, 0.14, ev ? em : 0x803000));
  } else if (id === 'shuriken') {
    for (const r of [0, Math.PI / 4]) {
      const b = mesh(BOX, tc, 0, -0.45, 0, 0.5 * s, 0.07, 0.12, em);
      b.rotation.y = r;
      w.add(b);
    }
  } else if (id === 'spear') {
    w.add(mesh(CYL, 0x6b4a2a, 0, -0.9, 0, 0.07, 2.4 * s, 0.07));
    const tip = mesh(CONE, tc, 0, -2.2 * s, 0, 0.16, 0.45, 0.16, em);
    tip.rotation.x = Math.PI;
    w.add(tip);
  } else if (id === 'hammer') {
    w.add(mesh(CYL, 0x6b4a2a, 0, -0.55, 0, 0.08, 1.2, 0.08));
    w.add(mesh(BOX, tc, 0, -1.15, 0, 0.6 * s, 0.4 * s, 0.4 * s, em));
  }
}
