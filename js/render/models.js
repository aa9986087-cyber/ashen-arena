'use strict';
/* 3D models in assets/models/ that replace the procedural shapes, baked to vertex colours.
   Animated models are baked into a few snapshots per clip and played as a flip-book (cheap for big crowds).
   To add one: put the .glb in assets/models/ and list it here. Sources and licences: assets/models/README.md */
/** file → what it replaces: a GEO key (enemy type or boss0…boss5), or hero:<CHARS id> (or hero:* for every hero).
    Use { to, size, tint } for options: size scales the fitted height, tint:true darkens it for a scarier look. */
const MODEL_FILES = {
  'hero-knight.glb': 'hero:knight',
  'hero-berserker.glb': 'hero:berserker',
  'hero-mage.glb': 'hero:mage',
  'hero-ranger.glb': 'hero:ranger',
  'hero-assassin.glb': 'hero:assassin',
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
const MODEL_VER = 6;
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
/** How many snapshots are baked per clip (more = smoother, more memory). */
const ANIM_FRAMES = { walk: 8, run: 10, idle: 8, attack: 8 };
/**
 * Bake a loaded glTF scene into vertex-coloured geometry the game can draw cheaply.
 * Static models give one geometry. Animated ones also give, per clip role (walk / run / idle / attack),
 * a list of snapshot geometries ("frames") that share the index and colours and differ only in position.
 * Every frame uses the scale/offset of the first one, so the model doesn't jitter between frames.
 * If the model has a right-hand slot (KayKit rigs: handslot.r), each frame also records where that hand is
 * (geometry.userData.hand = { p, q }) so the game can put the hero's weapon in it.
 * Returns { base, clips: { role: [geometry…] } } or null.
 */
function bakeModel(root, animations, targetH, scary) {
  // 1 · collect vertices once: colours and the index never change between frames
  const meshes = [],
    col = [],
    index = [],
    samp = new Map();
  let n = 0;
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const g = o.geometry,
      P = g.attributes.position,
      UV = g.attributes.uv,
      VC = g.attributes.color,
      idx = g.index,
      mats = Array.isArray(o.material) ? o.material : [o.material],
      total = idx ? idx.count : P.count,
      groups = g.groups && g.groups.length ? g.groups : [{ start: 0, count: total, materialIndex: 0 }],
      off = n,
      vc = new Float32Array(P.count * 3).fill(1);
    let used = false;
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
        index.push(off + i);
        let c = mc;
        if (sp) {
          const tc = sp(UV.getX(i), UV.getY(i));
          c = [c[0] * tc[0], c[1] * tc[1], c[2] * tc[2]];
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
        vc.set(c, i * 3);
        used = true;
      }
    }
    if (!used) return;
    meshes.push({ o, P, skin: o.isSkinnedMesh && typeof o.boneTransform === 'function' });
    for (let i = 0; i < vc.length; i++) col.push(vc[i]);
    n += P.count;
  });
  if (index.length < 3) return null;
  const colAttr = new THREE.Float32BufferAttribute(col, 3),
    idxAttr = new THREE.BufferAttribute(n > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1),
    v = new THREE.Vector3();
  let norm = null; // [offsetX, offsetY, offsetZ, scale] fixed by the first snapshot
  const hand = root.getObjectByName('handslot.r') || root.getObjectByName('handslotr'),
    hp = new THREE.Vector3(),
    hq = new THREE.Quaternion(),
    hs = new THREE.Vector3();
  // 2 · one snapshot of the current pose
  const snapshot = () => {
    root.updateMatrixWorld(true);
    const pos = new Float32Array(n * 3);
    let w = 0;
    for (const m of meshes) {
      if (m.skin && m.o.skeleton) m.o.skeleton.update();
      for (let i = 0; i < m.P.count; i++) {
        if (m.skin) m.o.boneTransform(i, v);
        else v.fromBufferAttribute(m.P, i);
        v.applyMatrix4(m.o.matrixWorld);
        pos[w++] = v.x;
        pos[w++] = v.y;
        pos[w++] = v.z;
      }
    }
    if (!norm) {
      const b = new THREE.Box3().setFromArray(pos),
        h = b.max.y - b.min.y || 1;
      norm = [-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2, targetH / h];
    }
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] = (pos[i] + norm[0]) * norm[3];
      pos[i + 1] = (pos[i + 1] + norm[1]) * norm[3];
      pos[i + 2] = (pos[i + 2] + norm[2]) * norm[3];
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(idxAttr);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', colAttr);
    geo.computeVertexNormals();
    if (hand) {
      hand.matrixWorld.decompose(hp, hq, hs);
      geo.userData.hand = {
        p: new THREE.Vector3((hp.x + norm[0]) * norm[3], (hp.y + norm[1]) * norm[3], (hp.z + norm[2]) * norm[3]),
        q: hq.clone(),
      };
    }
    return geo;
  };
  // 3 · step every clip the game uses through its frames
  const clips = {},
    mixer = animations && animations.length ? new THREE.AnimationMixer(root) : null;
  for (const role in ANIM_FRAMES) {
    const clip = mixer && animations.find(a => a.name === role);
    if (!clip) continue;
    const act = mixer.clipAction(clip).play(),
      k = ANIM_FRAMES[role];
    clips[role] = [];
    for (let f = 0; f < k; f++) {
      mixer.setTime((f / k) * clip.duration);
      clips[role].push(snapshot());
    }
    act.stop();
  }
  const first = Object.values(clips)[0];
  return { base: first ? first[0] : snapshot(), clips };
}
/** Pick a frame from a clip by cycle progress (0…1, wraps). */
const animFrame = (frames, t) => frames[((((t % 1) + 1) % 1) * frames.length) | 0];
function loadModels() {
  if (!THREE.GLTFLoader || !/^https?:$/.test(location.protocol) || IS_SANDBOX) return;
  const L = new THREE.GLTFLoader();
  let left = Object.keys(MODEL_FILES).length;
  const done = () => --left || warmGPU(); // all in: push every model and frame to the GPU before play needs it
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
          const baked = bakeModel(gl.scene, gl.animations, th * (o.size || 1), !!o.tint);
          if (!baked) return;
          const g = baked.base;
          if (hero) {
            HERO_GEOS[hero] = baked;
            if (hero === '*' || hero === S.char) buildPlayer();
          } else {
            GEO[key] = g;
            if (baked.clips.walk || baked.clips.attack) ANIM[key] = baked.clips;
            if (EM[key]) {
              EM[key].mesh.geometry = g;
              // one instanced mesh per walk frame; enemies are sorted into them each frame
              if (baked.clips.walk)
                EMA[key] = baked.clips.walk.map((fg, i) => (i ? inst(fg, lamV, EM[key].max, true) : EM[key]));
              if (baked.clips.attack)
                EMAA[key] = baked.clips.attack.map(fg => inst(fg, lamV, (EM[key].max / 3) | 0, true));
            }
            if (G.boss && 'boss' + G.boss.kind === key) bossMesh.geometry = g;
          }
        } catch (e) {
          console.warn('model', file, e);
        } finally {
          done();
        }
      },
      undefined,
      () => {
        console.warn('model missing', file);
        done();
      }
    );
  }
}
