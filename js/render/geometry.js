'use strict';
/* Procedural low-poly models: every enemy, boss and prop is merged into one vertex-coloured geometry. */
function part(geo, color, x, y, z, sx, sy, sz, rx, ry, rz) {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)),
    new THREE.Vector3(sx, sy, sz)
  );
  return { geo, color, m };
}
function merge(parts) {
  const pos = [],
    nor = [],
    col = [];
  for (const p of parts) {
    const g = p.geo.clone().toNonIndexed();
    g.applyMatrix4(p.m);
    const P = g.attributes.position.array,
      N = g.attributes.normal.array,
      c = new THREE.Color(p.color);
    for (let i = 0; i < P.length; i++) {
      pos.push(P[i]);
      nor.push(N[i]);
    }
    for (let i = 0; i < P.length / 3; i++) col.push(c.r, c.g, c.b);
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
const human = (body, leg, skin, w) => [
  part(BOX, leg, -0.2, 0.35, 0, 0.26, 0.7, 0.3),
  part(BOX, leg, 0.2, 0.35, 0, 0.26, 0.7, 0.3),
  part(BOX, body, 0, 1.08, 0, w || 0.75, 0.82, 0.45),
  part(SPH, skin, 0, 1.76, 0, 0.52, 0.52, 0.52),
  part(BOX, body, -(w || 0.75) / 2 - 0.12, 1.08, 0, 0.2, 0.72, 0.22),
  part(BOX, body, (w || 0.75) / 2 + 0.12, 1.08, 0.12, 0.2, 0.72, 0.22, -0.5),
];
const GEO = {
  grunt: merge(
    human(0x9c3b32, 0x3a2a2a, 0xd9a37a).concat([
      part(BOX, 0x565c68, 0, 1.96, 0, 0.56, 0.2, 0.56),
      part(CYL, 0x6b4a2a, 0.52, 1.2, 0.35, 0.06, 2.2, 0.06, 0.25),
      part(CONE, 0xc8ccd4, 0.52, 2.3, 0.63, 0.16, 0.4, 0.16, 0.25),
    ])
  ),
  fast: merge(
    human(0x6a3fa0, 0x2b1a44, 0xcfa07e, 0.55).concat([
      part(CONE, 0x3b2260, 0, 2.02, 0, 0.62, 0.55, 0.62),
      part(BOX, 0xd8dde6, 0.45, 0.95, 0.45, 0.06, 0.06, 0.6),
      part(BOX, 0xd8dde6, -0.45, 0.95, 0.45, 0.06, 0.06, 0.6),
    ])
  ),
  archer: merge(
    human(0x3f7a44, 0x2b3a22, 0xd9a37a).concat([
      part(CONE, 0x2c5530, 0, 2.08, 0, 0.7, 0.5, 0.7),
      part(BOX, 0x8a5a2b, 0.55, 1.15, 0.4, 0.07, 1.3, 0.07),
      part(BOX, 0x5a3a1b, -0.15, 1.2, -0.3, 0.2, 0.7, 0.14, 0, 0, 0.3),
    ])
  ),
  shield: merge(
    human(0x5b6f8a, 0x2c3442, 0xd9a37a, 0.9).concat([
      part(SPH, 0x8c98a8, 0, 1.86, 0, 0.6, 0.5, 0.6),
      part(BOX, 0xb0b8c4, 0, 1.05, 0.46, 1.05, 1.35, 0.1),
      part(BOX, 0xc23a2e, 0, 1.12, 0.52, 0.34, 0.34, 0.04),
    ])
  ),
  brute: merge([
    part(SPH, 0x5d4636, 0, 1.05, 0, 1.6, 1.7, 1.4),
    part(SPH, 0x6d5444, 0, 2.0, 0.3, 0.75, 0.7, 0.7),
    part(CONE, 0xe8e0c8, -0.34, 2.45, 0.3, 0.2, 0.6, 0.2, 0, 0, 0.4),
    part(CONE, 0xe8e0c8, 0.34, 2.45, 0.3, 0.2, 0.6, 0.2, 0, 0, -0.4),
    part(SPH, 0x4d3a2c, -1, 1.05, 0.1, 0.62, 1.15, 0.62),
    part(SPH, 0x4d3a2c, 1, 1.05, 0.1, 0.62, 1.15, 0.62),
    part(BOX, 0xff3020, -0.16, 2.05, 0.63, 0.1, 0.08, 0.06),
    part(BOX, 0xff3020, 0.16, 2.05, 0.63, 0.1, 0.08, 0.06),
    part(BOX, 0x3d2e22, -0.4, 0.2, 0, 0.5, 0.4, 0.6),
    part(BOX, 0x3d2e22, 0.4, 0.2, 0, 0.5, 0.4, 0.6),
  ]),
  ally: merge(
    human(0x2f6fd0, 0x1c2c4c, 0xe0b090).concat([
      part(SPH, 0xd0d6e0, 0, 1.9, 0, 0.58, 0.42, 0.58),
      part(BOX, 0x30343c, 0.5, 1.15, 0.5, 0.1, 0.12, 0.9),
    ])
  ),
  blade: merge([
    part(BOX, 0xdfe6f2, 0, 0, 0.55, 0.14, 0.06, 1.3),
    part(BOX, 0x8a5a2b, 0, 0, -0.2, 0.5, 0.1, 0.12),
    part(BOX, 0x5a3a1b, 0, 0, -0.42, 0.1, 0.1, 0.34),
  ]),
  tree: merge([
    part(CYL, 0x5a3d24, 0, 0.9, 0, 0.45, 1.8, 0.45),
    part(CONE, 0x2d6a36, 0, 2.6, 0, 2.6, 2.4, 2.6),
    part(CONE, 0x377a40, 0, 3.9, 0, 1.9, 2, 1.9),
    part(CONE, 0x44904c, 0, 5, 0, 1.2, 1.5, 1.2),
  ]),
  rock: merge([part(SPH, 0x767c84, 0, 0.4, 0, 2, 1.2, 1.6), part(SPH, 0x8a9098, 0.7, 0.3, 0.5, 1, 0.8, 1)]),
  cactus: merge([
    part(CYL, 0x4f8a4a, 0, 1.3, 0, 0.6, 2.6, 0.6),
    part(CYL, 0x4f8a4a, 0.6, 1.6, 0, 0.3, 1, 0.3),
    part(CYL, 0x4f8a4a, -0.6, 1.2, 0, 0.3, 0.8, 0.3),
    part(BOX, 0x4f8a4a, 0.38, 1.2, 0, 0.5, 0.26, 0.26),
    part(BOX, 0x4f8a4a, -0.38, 0.9, 0, 0.5, 0.26, 0.26),
  ]),
  dune: merge([
    part(SPH, 0xa8824a, 0, 0.1, 0, 3.4, 0.9, 2.4),
    part(BOX, 0xece4d0, 0.6, 0.55, 0.3, 1.2, 0.1, 0.12, 0, 0.5, 0.2),
    part(SPH, 0xece4d0, -0.5, 0.6, 0.2, 0.4, 0.36, 0.4),
  ]),
  pillar: merge([
    part(BOX, 0x4b4a58, 0, 0.2, 0, 1.5, 0.4, 1.5),
    part(CYL, 0x6c6b7c, 0, 2.4, 0, 1, 4.2, 1),
    part(BOX, 0x4b4a58, 0, 4.7, 0, 1.5, 0.4, 1.5),
  ]),
  flag: merge([
    part(CYL, 0x3a3a44, 0, 2.2, 0, 0.12, 4.4, 0.12),
    part(BOX, 0xb0282a, 0.75, 3.5, 0, 1.4, 1.5, 0.05),
    part(BOX, 0xe8b030, 0.75, 3.5, 0.03, 0.5, 0.5, 0.03),
  ]),
  crate: merge([
    part(BOX, 0x6f7550, 0, 0.6, 0, 1.5, 1.2, 1.5),
    part(BOX, 0x4b5036, 0, 0.6, 0, 1.56, 0.16, 1.56),
    part(BOX, 0x4b5036, 0, 1.5, 0.2, 1, 0.6, 1, 0, 0.4),
  ]),
  barrier: merge([
    part(BOX, 0x9a9a94, 0, 0.5, 0, 3.4, 1, 0.6),
    part(BOX, 0xe0b020, -0.9, 0.5, 0, 0.5, 1.02, 0.62),
    part(BOX, 0xe0b020, 0.9, 0.5, 0, 0.5, 1.02, 0.62),
  ]),
  wolf: merge([
    part(BOX, 0x6e6e78, 0, 0.72, 0, 0.5, 0.5, 1.3),
    part(BOX, 0x7c7c86, 0, 0.95, 0.78, 0.42, 0.42, 0.5),
    part(BOX, 0x55555e, 0, 0.85, 1.08, 0.2, 0.2, 0.3),
    part(CONE, 0x55555e, -0.14, 1.25, 0.7, 0.14, 0.26, 0.14),
    part(CONE, 0x55555e, 0.14, 1.25, 0.7, 0.14, 0.26, 0.14),
    part(BOX, 0x55555e, -0.18, 0.25, 0.45, 0.14, 0.5, 0.14),
    part(BOX, 0x55555e, 0.18, 0.25, 0.45, 0.14, 0.5, 0.14),
    part(BOX, 0x55555e, -0.18, 0.25, -0.45, 0.14, 0.5, 0.14),
    part(BOX, 0x55555e, 0.18, 0.25, -0.45, 0.14, 0.5, 0.14),
    part(BOX, 0x55555e, 0, 0.9, -0.8, 0.12, 0.12, 0.5, 0.6),
    part(BOX, 0xffd030, -0.1, 1, 1.04, 0.06, 0.06, 0.04),
    part(BOX, 0xffd030, 0.1, 1, 1.04, 0.06, 0.06, 0.04),
  ]),
  runner: merge([
    part(BOX, 0x8a9a82, -0.2, 0.55, -0.05, 0.16, 1.1, 0.16, 0.25),
    part(BOX, 0x8a9a82, 0.2, 0.55, -0.05, 0.16, 1.1, 0.16, -0.25),
    part(BOX, 0x6a7a64, 0, 1.25, 0.25, 0.5, 0.8, 0.36, 0.75),
    part(SPH, 0x9aab90, 0, 1.55, 0.75, 0.42, 0.38, 0.5),
    part(BOX, 0x1a1a14, 0, 1.48, 1.0, 0.3, 0.06, 0.06),
    part(BOX, 0x6a7a64, -0.34, 1.2, 0.6, 0.12, 0.85, 0.12, 1.1),
    part(BOX, 0x6a7a64, 0.34, 1.2, 0.6, 0.12, 0.85, 0.12, 1.1),
    part(CONE, 0xe8e0c8, -0.34, 0.95, 1.0, 0.06, 0.3, 0.06, 2.2),
    part(CONE, 0xe8e0c8, 0.34, 0.95, 1.0, 0.06, 0.3, 0.06, 2.2),
    part(CONE, 0x4a5644, 0, 1.55, 0.0, 0.1, 0.4, 0.1, -0.6),
    part(CONE, 0x4a5644, 0, 1.3, -0.1, 0.1, 0.35, 0.1, -0.8),
  ]),
  bomber: merge(
    human(0x8a2f1f, 0x2a1a1a, 0xd9a37a, 0.6).concat([
      part(CYL, 0x3a3a3a, 0, 1.15, -0.42, 0.62, 0.85, 0.62),
      part(CYL, 0xa02a1a, 0, 1.15, -0.42, 0.64, 0.2, 0.64),
      part(SPH, 0xffaa20, 0, 1.72, -0.42, 0.18, 0.18, 0.18),
      part(BOX, 0x2a1a1a, 0, 1.98, 0, 0.5, 0.14, 0.5),
    ])
  ),
  mage: merge([
    part(CONE, 0x3a2a6a, 0, 0.95, 0, 1.1, 1.9, 1.1),
    part(SPH, 0xcfa07e, 0, 2.0, 0, 0.5, 0.5, 0.5),
    part(CONE, 0x241a44, 0, 2.5, 0, 0.7, 0.9, 0.7),
    part(CYL, 0x241a44, 0, 2.1, 0, 0.9, 0.05, 0.9),
    part(SPH, 0xff5ad0, 0.55, 1.5, 0.4, 0.3, 0.3, 0.3),
    part(BOX, 0x3a2a6a, 0.45, 1.4, 0.2, 0.18, 0.6, 0.18, -0.6),
  ]),
  shaman: merge(
    human(0x2f7d6b, 0x1c3a34, 0xb58a6a).concat([
      part(SPH, 0xe8e0c8, 0, 1.8, 0.14, 0.46, 0.5, 0.36),
      part(BOX, 0x1a1a1a, -0.1, 1.84, 0.32, 0.09, 0.09, 0.04),
      part(BOX, 0x1a1a1a, 0.1, 1.84, 0.32, 0.09, 0.09, 0.04),
      part(CONE, 0xd03030, -0.2, 2.25, 0, 0.1, 0.5, 0.1, 0, 0, 0.3),
      part(CONE, 0xe0b030, 0, 2.3, 0, 0.1, 0.55, 0.1),
      part(CONE, 0xd03030, 0.2, 2.25, 0, 0.1, 0.5, 0.1, 0, 0, -0.3),
      part(CYL, 0x5a3a1b, 0.55, 1.3, 0.3, 0.07, 2.4, 0.07),
      part(SPH, 0x50ff80, 0.55, 2.6, 0.3, 0.32, 0.32, 0.32),
    ])
  ),
  golem: merge([
    part(BOX, 0x6a6258, 0, 1.3, 0, 1.6, 1.5, 1.1),
    part(BOX, 0x7a7268, 0, 2.3, 0.1, 0.7, 0.6, 0.6),
    part(BOX, 0x5a5248, -1.2, 1.1, 0, 0.6, 1.7, 0.7),
    part(BOX, 0x5a5248, 1.2, 1.1, 0, 0.6, 1.7, 0.7),
    part(BOX, 0x4a443c, -0.45, 0.3, 0, 0.6, 0.6, 0.8),
    part(BOX, 0x4a443c, 0.45, 0.3, 0, 0.6, 0.6, 0.8),
    part(BOX, 0x40e0ff, -0.16, 2.34, 0.41, 0.12, 0.1, 0.04),
    part(BOX, 0x40e0ff, 0.16, 2.34, 0.41, 0.12, 0.1, 0.04),
    part(BOX, 0x40e0ff, 0, 1.4, 0.56, 0.4, 0.4, 0.04),
    part(SPH, 0x8a8278, -1.2, 2.0, 0, 0.8, 0.5, 0.8),
    part(SPH, 0x8a8278, 1.2, 2.0, 0, 0.8, 0.5, 0.8),
  ]),
  snowtree: merge([
    part(CYL, 0x4a3424, 0, 0.9, 0, 0.45, 1.8, 0.45),
    part(CONE, 0x2f5a48, 0, 2.6, 0, 2.6, 2.4, 2.6),
    part(CONE, 0xf2f6fa, 0, 3.2, 0, 2.1, 1.3, 2.1),
    part(CONE, 0x3a6a56, 0, 3.9, 0, 1.9, 2, 1.9),
    part(CONE, 0xf2f6fa, 0, 4.5, 0, 1.4, 1.1, 1.4),
    part(CONE, 0xf8fbff, 0, 5.2, 0, 0.9, 1.2, 0.9),
  ]),
  ice: merge([
    part(CONE, 0x9fdcf5, 0, 1.1, 0, 1, 2.2, 1),
    part(CONE, 0xc8f0ff, 0.6, 0.7, 0.3, 0.6, 1.4, 0.6, 0, 0, -0.3),
    part(CONE, 0x7fc8ea, -0.5, 0.6, -0.2, 0.7, 1.2, 0.7, 0, 0, 0.35),
    part(SPH, 0xeef6fb, 0, 0.15, 0, 2.2, 0.4, 2),
  ]),
  deadtree: merge([
    part(CYL, 0x2a1c18, 0, 1.5, 0, 0.45, 3, 0.45),
    part(CYL, 0x2a1c18, 0.6, 2.6, 0, 0.16, 1.6, 0.16, 0, 0, -0.9),
    part(CYL, 0x2a1c18, -0.5, 2.2, 0, 0.16, 1.3, 0.16, 0, 0, 0.8),
    part(CYL, 0x2a1c18, 0, 3.4, 0.3, 0.14, 1.2, 0.14, 0.5),
  ]),
  lavarock: merge([
    part(SPH, 0x2a2422, 0, 0.5, 0, 2.2, 1.4, 1.8),
    part(SPH, 0xff6a1a, 0, 0.95, 0, 1, 0.5, 0.8),
    part(SPH, 0xffc040, 0, 1.08, 0, 0.5, 0.3, 0.4),
    part(SPH, 0x3a302c, 0.9, 0.3, 0.6, 1, 0.7, 1),
  ]),
  boss4: merge(
    human(0x8fb8d8, 0x4a6a8a, 0xcfe4f2, 1).concat([
      part(SPH, 0xdff2ff, 0, 1.86, 0, 0.62, 0.56, 0.62),
      part(CONE, 0x9fdcf5, -0.22, 2.4, 0, 0.14, 0.6, 0.14),
      part(CONE, 0xc8f0ff, 0, 2.5, 0, 0.16, 0.75, 0.16),
      part(CONE, 0x9fdcf5, 0.22, 2.4, 0, 0.14, 0.6, 0.14),
      part(BOX, 0x40c8ff, 0, 1.82, 0.3, 0.34, 0.07, 0.05),
      part(BOX, 0xdff2ff, -0.66, 1.52, 0, 0.44, 0.3, 0.52),
      part(BOX, 0xdff2ff, 0.66, 1.52, 0, 0.44, 0.3, 0.52),
      part(CYL, 0x6a8aa8, 0.74, 1.3, 0.6, 0.08, 2.4, 0.08, 1.2),
      part(BOX, 0xc8f0ff, 0.74, 1.75, 1.6, 0.1, 0.9, 0.7),
      part(BOX, 0xeaf6ff, 0, 1.1, -0.3, 1, 1.5, 0.06),
    ])
  ),
  boss5: merge([
    part(SPH, 0x2a1c18, 0, 1.1, 0, 1.7, 1.8, 1.5),
    part(SPH, 0x3a2420, 0, 2.1, 0.3, 0.8, 0.75, 0.75),
    part(CONE, 0xff8a20, -0.45, 2.75, 0.3, 0.2, 0.9, 0.2, 0, 0, 0.5),
    part(CONE, 0xff8a20, 0.45, 2.75, 0.3, 0.2, 0.9, 0.2, 0, 0, -0.5),
    part(SPH, 0xff5a10, 0, 1.2, 0.62, 0.7, 0.7, 0.3),
    part(SPH, 0xffd040, 0, 1.2, 0.72, 0.36, 0.36, 0.2),
    part(SPH, 0x1e1412, -1.05, 1.1, 0.1, 0.7, 1.3, 0.7),
    part(SPH, 0x1e1412, 1.05, 1.1, 0.1, 0.7, 1.3, 0.7),
    part(SPH, 0xff6a1a, -1.05, 0.5, 0.2, 0.5, 0.5, 0.5),
    part(SPH, 0xff6a1a, 1.05, 0.5, 0.2, 0.5, 0.5, 0.5),
    part(BOX, 0xffe060, -0.18, 2.15, 0.66, 0.14, 0.1, 0.06),
    part(BOX, 0xffe060, 0.18, 2.15, 0.66, 0.14, 0.1, 0.06),
    part(BOX, 0x1e1412, -0.45, 0.2, 0, 0.55, 0.4, 0.7),
    part(BOX, 0x1e1412, 0.45, 0.2, 0, 0.55, 0.4, 0.7),
  ]),
  bones: merge([
    part(SPH, 0xe8e0c8, 0, 0.36, 0, 0.74, 0.64, 0.74),
    part(BOX, 0xff2030, -0.15, 0.42, 0.33, 0.14, 0.12, 0.05),
    part(BOX, 0xff2030, 0.15, 0.42, 0.33, 0.14, 0.12, 0.05),
    part(BOX, 0x1a1012, 0, 0.2, 0.34, 0.3, 0.1, 0.05),
    part(SPH, 0xd8cfb8, 0.8, 0.28, 0.4, 0.56, 0.5, 0.56),
    part(BOX, 0xe8e0c8, -0.7, 0.12, 0.5, 1.3, 0.12, 0.14, 0, 0.6),
    part(BOX, 0xe8e0c8, 0.3, 0.1, -0.7, 1.1, 0.1, 0.12, 0, -0.4),
    part(CONE, 0x0c0508, -1.1, 1.7, -0.3, 0.55, 3.4, 0.55, 0, 0, 0.12),
    part(CONE, 0x14070c, 1, 1.2, -0.6, 0.45, 2.4, 0.45, 0, 0, -0.15),
    part(CONE, 0x0c0508, 0.1, 0.9, -1.1, 0.35, 1.8, 0.35),
  ]),
  post: merge([part(BOX, 0x3a3840, 0, 1.1, 0, 0.8, 2.2, 0.8), part(BOX, 0xf2a23a, 0, 2.35, 0, 0.5, 0.3, 0.5)]),
  boss0: merge([
    part(SPH, 0x3d5a30, 0, 1.1, 0, 1.7, 1.8, 1.5),
    part(SPH, 0x54402c, 0, 2.1, 0.3, 0.8, 0.75, 0.75),
    part(CONE, 0xd8c8a0, -0.5, 2.8, 0.3, 0.16, 1, 0.16, 0, 0, 0.6),
    part(CONE, 0xd8c8a0, 0.5, 2.8, 0.3, 0.16, 1, 0.16, 0, 0, -0.6),
    part(CONE, 0xd8c8a0, -0.25, 2.75, 0.3, 0.12, 0.7, 0.12, 0, 0, 0.2),
    part(CONE, 0xd8c8a0, 0.25, 2.75, 0.3, 0.12, 0.7, 0.12, 0, 0, -0.2),
    part(SPH, 0x2d4a26, -1.05, 1.1, 0.1, 0.7, 1.3, 0.7),
    part(SPH, 0x2d4a26, 1.05, 1.1, 0.1, 0.7, 1.3, 0.7),
    part(BOX, 0x7dff60, -0.18, 2.15, 0.66, 0.12, 0.1, 0.06),
    part(BOX, 0x7dff60, 0.18, 2.15, 0.66, 0.12, 0.1, 0.06),
    part(BOX, 0x54402c, -0.45, 0.2, 0, 0.55, 0.4, 0.7),
    part(BOX, 0x54402c, 0.45, 0.2, 0, 0.55, 0.4, 0.7),
  ]),
  boss1: merge([
    part(CONE, 0xb8862e, 0, 0.95, 0, 1.7, 1.9, 1.7),
    part(BOX, 0xd8a848, 0, 1.6, 0, 0.9, 0.6, 0.55),
    part(SPH, 0xc89868, 0, 2.2, 0, 0.6, 0.6, 0.6),
    part(CYL, 0xffd040, 0, 2.55, 0, 0.62, 0.16, 0.62),
    part(CONE, 0xffd040, -0.2, 2.78, 0, 0.12, 0.34, 0.12),
    part(CONE, 0xffd040, 0.2, 2.78, 0, 0.12, 0.34, 0.12),
    part(CONE, 0xffd040, 0, 2.8, 0.2, 0.12, 0.38, 0.12),
    part(CYL, 0x7a5a20, 0.85, 1.5, 0.2, 0.08, 3, 0.08),
    part(SPH, 0x40e0ff, 0.85, 3.05, 0.2, 0.4, 0.4, 0.4),
    part(BOX, 0xd8a848, -0.62, 1.5, 0, 0.24, 0.8, 0.26),
    part(BOX, 0xd8a848, 0.62, 1.5, 0.15, 0.24, 0.8, 0.26, -0.5),
  ]),
  boss2: merge(
    human(0x1c1c24, 0x101016, 0x2a2a34, 0.95).concat([
      part(SPH, 0x2a2a34, 0, 1.85, 0, 0.64, 0.6, 0.64),
      part(BOX, 0xff2a2a, 0, 1.8, 0.3, 0.36, 0.07, 0.06),
      part(CONE, 0xb01a1a, 0, 2.4, -0.1, 0.2, 0.8, 0.2, -0.4),
      part(BOX, 0x34343e, -0.62, 1.5, 0, 0.42, 0.3, 0.5),
      part(BOX, 0x34343e, 0.62, 1.5, 0, 0.42, 0.3, 0.5),
      part(BOX, 0xa8b0c0, 0.72, 1.3, 0.95, 0.16, 0.06, 2),
      part(BOX, 0x5a1010, 0, 1.1, -0.3, 0.9, 1.4, 0.06),
    ])
  ),
  boss3: merge([
    part(BOX, 0x5a6068, 0, 1.25, 0, 1.5, 1.2, 1),
    part(BOX, 0x3a3e44, 0, 0.4, 0, 1.1, 0.6, 0.8),
    part(BOX, 0x6e747c, 0, 2.1, 0.05, 0.8, 0.5, 0.7),
    part(BOX, 0xff3020, 0, 2.12, 0.4, 0.6, 0.12, 0.06),
    part(BOX, 0x44484e, -1.1, 1.7, 0, 0.6, 0.6, 0.9),
    part(BOX, 0x44484e, 1.1, 1.7, 0, 0.6, 0.6, 0.9),
    part(CYL, 0x202226, -1.1, 1.7, 0.5, 0.18, 0.3, 0.18, 1.57),
    part(CYL, 0x202226, 1.1, 1.7, 0.5, 0.18, 0.3, 0.18, 1.57),
    part(BOX, 0x3a3e44, -0.45, 0.1, 0, 0.5, 0.3, 1),
    part(BOX, 0x3a3e44, 0.45, 0.1, 0, 0.5, 0.3, 1),
    part(BOX, 0xe0b020, 0, 1.3, 0.52, 0.5, 0.3, 0.04),
  ]),
};
