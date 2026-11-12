'use strict';
/* 3D models in assets/models/ that replace the procedural shapes (baked to vertex colours, static pose).
   To add one: put the .glb in assets/models/ and list it here. Sources and licences: assets/models/README.md */
/** file → what it replaces: a GEO key (enemy type or boss0…boss5), or hero:<CHARS id> (or hero:* for every hero).
    Use { to, size, tint } for options: size scales the fitted height, tint:true darkens it for a scarier look. */
const MODEL_FILES = {
  'hero-knight.glb': 'hero:knight',
  'grunt.glb': 'grunt',
  'shield.glb': 'shield',
  'archer.glb': 'archer',
  'mage.glb': 'mage',
  'wolf.glb': { to: 'wolf', size: 1.3 },
  'fast.glb': { to: 'fast', size: 0.45 }, // a flat, wide spider: keep it low
  'runner.glb': 'runner',
  'bomber.glb': 'bomber',
  'shaman.glb': 'shaman',
  'boss-forest.glb': 'boss0',
  'boss-knight.glb': 'boss2',
  'boss-frost.glb': 'boss4',
  'boss-flame.glb': { to: 'boss5', size: 0.85 }, // wide wings
};
/** Bump to make browsers fetch updated model files. */
const MODEL_VER = 3;
const lin2s = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
function texSampler(tex) {
  try {
    const im = tex.image;
    if (!im || !im.width) return null;
    const c = document.createElement('canvas');
    c.width = im.width;
    c.height = im.height;
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data,
      w = c.width,
      h = c.height;
    return (u, v) => {
      u = ((u % 1) + 1) % 1;
      v = ((v % 1) + 1) % 1;
      const px = Math.min(w - 1, (u * w) | 0),
        py = Math.min(h - 1, ((tex.flipY ? 1 - v : v) * h) | 0),
        i = (py * w + px) * 4;
      return [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255];
    };
  } catch (e) {
    return null;
  }
}
function bakeModel(root, targetH, scary) {
  root.updateMatrixWorld(true);
  const pos = [],
    col = [],
    v = new THREE.Vector3(),
    samp = new Map();
  root.traverse(o => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const g = o.geometry,
      P = g.attributes.position,
      UV = g.attributes.uv,
      VC = g.attributes.color,
      idx = g.index,
      mats = Array.isArray(o.material) ? o.material : [o.material];
    const total = idx ? idx.count : P.count,
      groups = g.groups && g.groups.length ? g.groups : [{ start: 0, count: total, materialIndex: 0 }];
    const skin = o.isSkinnedMesh && typeof o.boneTransform === 'function';
    if (skin && o.skeleton) o.skeleton.update();
    for (const gr of groups) {
      const m = mats[gr.materialIndex || 0] || mats[0];
      if (!m || m.visible === false) continue;
      const mc = m.color ? [lin2s(m.color.r), lin2s(m.color.g), lin2s(m.color.b)] : [1, 1, 1];
      let sp = null;
      if (m.map && UV) {
        if (!samp.has(m.map)) samp.set(m.map, texSampler(m.map));
        sp = samp.get(m.map);
      }
      const end = Math.min(gr.start + gr.count, total);
      for (let k = gr.start; k < end; k++) {
        const i = idx ? idx.getX(k) : k;
        if (skin) o.boneTransform(i, v);
        else v.fromBufferAttribute(P, i);
        v.applyMatrix4(o.matrixWorld);
        pos.push(v.x, v.y, v.z);
        let c = mc;
        if (sp) {
          const t = sp(UV.getX(i), UV.getY(i));
          c = [c[0] * t[0], c[1] * t[1], c[2] * t[2]];
        }
        if (VC) c = [c[0] * lin2s(VC.getX(i)), c[1] * lin2s(VC.getY(i)), c[2] * lin2s(VC.getZ(i))];
        if (scary) {
          const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
          c = [
            (l * 0.45 + c[0] * 0.55) * 0.78 + 0.04,
            (l * 0.45 + c[1] * 0.55) * 0.66,
            (l * 0.45 + c[2] * 0.55) * 0.72,
          ];
        }
        col.push(c[0], c[1], c[2]);
      }
    }
  });
  if (pos.length < 9) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingBox();
  const b = geo.boundingBox,
    h = b.max.y - b.min.y || 1,
    sc = targetH / h;
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geo.scale(sc, sc, sc);
  geo.computeVertexNormals();
  return geo;
}
function loadModels() {
  if (!THREE.GLTFLoader || !/^https?:$/.test(location.protocol) || IS_SANDBOX) return;
  const L = new THREE.GLTFLoader();
  for (const file in MODEL_FILES) {
    const o = typeof MODEL_FILES[file] === 'string' ? { to: MODEL_FILES[file] } : MODEL_FILES[file],
      key = o.to,
      hero = key.startsWith('hero:') ? key.slice(5) : null;
    L.load(
      MODEL_DIR + file + '?v=' + MODEL_VER,
      gl => {
        try {
          let th = 2.5; // hero height; enemies keep the height of the shape they replace
          if (!hero) {
            const og = GEO[key];
            og.computeBoundingBox();
            th = og.boundingBox.max.y - og.boundingBox.min.y;
          }
          const g = bakeModel(gl.scene, th * (o.size || 1), !!o.tint);
          if (!g) return;
          if (hero) {
            HERO_GEOS[hero] = g;
            if (hero === '*' || hero === S.char) buildPlayer();
          } else {
            GEO[key] = g;
            if (EM[key]) EM[key].mesh.geometry = g;
            if (G.boss && 'boss' + G.boss.kind === key) bossMesh.geometry = g;
          }
        } catch (e) {
          console.warn('model', file, e);
        }
      },
      undefined,
      () => console.warn('model missing', file)
    );
  }
}
