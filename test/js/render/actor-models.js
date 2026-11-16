'use strict';
/* SAMPLE only: one local knight and one forest guardian. No baked geometry/crowd changes.
   See runtime-integration.md for the small parent-owned hooks. No loading side effects. */
const ACTOR_CONFIG = {
  version: 1,
  textureEdge: 1024,
  fade: 0.08,
  knight: {
    file: 'assets/models/overhaul/knight.glb', height: 3.0, yaw: 0, locomotionYaw: -Math.PI / 2, groundOffset: 0,
    clips: {}, handBone: null,
    // PROVISIONAL: actual provider bone axes must be calibrated, not a KayKit socket.
    weapon: { position: [0, 0, 0], rotation: [Math.PI, 0, 0], scale: 1 },
  },
  guardian: {
    file: 'assets/models/overhaul/guardian.glb', height: null, yaw: 0, locomotionYaw: -Math.PI / 2, groundOffset: 0, clips: {},
  },
};
const ACTOR_MODELS = (() => {
  const assets = {}, pending = {}, events = new WeakMap();
  let knightRig = null, bossRig = null, bossEntity = null, tail = null, generation = 0;
  let environmentTarget = null;
  function environment() {
    if (environmentTarget) return environmentTarget.texture;
    if (typeof renderer === 'undefined' || !THREE.PMREMGenerator) return null;
    const probe = new THREE.Scene();
    probe.background = new THREE.Color(0x8e99aa);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const materials = [];
    for (const [color, x, y, z, sx, sy, sz] of [
      [0xfff1d9, -4, 3, 2, 1, 6, 6],
      [0xc9e0ff, 4, 2, -3, 1, 5, 5],
      [0xffffff, 0, 6, 0, 7, 1, 7],
    ]) {
      const material = new THREE.MeshBasicMaterial({ color });
      materials.push(material);
      const card = new THREE.Mesh(geometry, material);
      card.position.set(x, y, z); card.scale.set(sx, sy, sz); probe.add(card);
    }
    const generator = new THREE.PMREMGenerator(renderer);
    try { environmentTarget = generator.fromScene(probe, 0.08, 0.1, 20); }
    finally { generator.dispose(); geometry.dispose(); for (const m of materials) m.dispose(); }
    return environmentTarget.texture;
  }
  const aliases = {
    idle: ['idle', 'standingidle', 'breathingidle'],
    walk: ['walk', 'walking'], run: ['run', 'running', 'jog', 'jogging'],
    attack: ['attack', 'swing', 'slash', 'meleeattack', 'swordattack', 'swordswing', 'swordslash'],
    hurt: ['hurt', 'hit', 'hitreaction', 'damage', 'takinghit'],
    fall: ['fall', 'death', 'die', 'dying', 'fallingdown', 'knockdown'],
  };
  const compact = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function clipName(name) {
    let n = String(name || '').split(/[|/]/).pop().toLowerCase();
    n = n.replace(/([a-z])([0-9])/g, '$1 $2').replace(/[^a-z0-9]+/g, ' ').trim();
    const words = n.split(' ');
    while (words.length > 1 && /^(animation|anim|armature|rig|knight|guardian|mixamo|com)$/.test(words[0])) words.shift();
    while (words.length > 1 && /^\d+$/.test(words[words.length - 1])) words.pop();
    return words.join('');
  }
  function selectClips(clips, overrides = {}) {
    const out = {};
    for (const role in aliases) {
      const valid = clips.filter(c => c.duration > 0 && c.tracks && c.tracks.length);
      out[role] = overrides[role]
        ? valid.find(c => c.name === overrides[role])
        : valid.find(c => c.name.toLowerCase() === role) || valid.find(c => clipName(c.name) === role) ||
          valid.find(c => aliases[role].includes(clipName(c.name)));
      if (!out[role]) delete out[role];
    }
    return out;
  }
  function rootNodes(root) {
    const pinned = new Set([root]);
    root.traverse(o => {
      const name = compact(o.name).replace(/^mixamorig/, '');
      if ((o.isBone && (!o.parent || !o.parent.isBone)) || /^(hips?|pelvis|root|rootbone|rootmotion|bip001pelvis)$/.test(name)) {
        pinned.add(o);
        for (let p = o.parent; p && p !== root; p = p.parent) if (!p.isBone) pinned.add(p);
      }
    });
    return pinned;
  }
  function trackNode(root, parsed) {
    if (parsed.objectName === 'bones') {
      let bone;
      root.traverse(o => { if (o.isBone && (o.name === parsed.objectIndex || o.uuid === parsed.objectIndex)) bone = o; });
      return bone;
    }
    return THREE.PropertyBinding.findNode(root, parsed.nodeName);
  }
  function pinClip(clip, root) {
    const copy = clip.clone(), pinned = rootNodes(root);
    root.updateMatrixWorld(true);
    for (const track of copy.tracks) {
      let parsed;
      try { parsed = THREE.PropertyBinding.parseTrackName(track.name); } catch { continue; }
      if (parsed.propertyName !== 'position') continue;
      const node = trackNode(root, parsed);
      if (!node || !pinned.has(node)) continue;
      const cubic = !!(track.createInterpolant && track.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline);
      const stride = track.getValueSize();
      if (stride !== (cubic ? 9 : 3)) continue;
      const basis = node.parent && node.parent.matrixWorld;
      const worldBasis = basis && basis.elements && typeof basis.clone === 'function';
      const matrix = worldBasis && basis.elements;
      const inverse = worldBasis && basis.clone().invert().elements;
      const rest = worldBasis && node.position.clone().applyMatrix4(basis);
      const pin = (offset, tangent) => {
        if (!worldBasis) {
          track.values[offset] = tangent ? 0 : node.position.x;
          track.values[offset + 2] = tangent ? 0 : node.position.z;
          return;
        }
        const x = track.values[offset], y = track.values[offset + 1], z = track.values[offset + 2];
        const vertical = matrix[1] * x + matrix[5] * y + matrix[9] * z + (tangent ? 0 : matrix[13]);
        const horizontalX = tangent ? 0 : rest.x, horizontalZ = tangent ? 0 : rest.z;
        track.values[offset] = inverse[0] * horizontalX + inverse[4] * vertical + inverse[8] * horizontalZ + (tangent ? 0 : inverse[12]);
        track.values[offset + 1] = inverse[1] * horizontalX + inverse[5] * vertical + inverse[9] * horizontalZ + (tangent ? 0 : inverse[13]);
        track.values[offset + 2] = inverse[2] * horizontalX + inverse[6] * vertical + inverse[10] * horizontalZ + (tangent ? 0 : inverse[14]);
      };
      for (let i = 0; i < track.values.length; i += stride) {
        const v = i + (cubic ? 3 : 0);
        pin(v, false);
        if (cubic) for (const t of [i, i + 6]) pin(t, true);
      }
    }
    return copy;
  }
  function resources(root, out = { geometries: new Set(), materials: new Set(), textures: new Set(), skeletons: new Set() }) {
    if (!root || !root.traverse) return out;
    root.traverse(o => {
      if (o.geometry) out.geometries.add(o.geometry);
      if (o.skeleton) out.skeletons.add(o.skeleton);
      for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
        out.materials.add(m);
        for (const k in m) if (m[k] && m[k].isTexture) out.textures.add(m[k]);
      }
    });
    return out;
  }
  function disposeResources(r, keep = resources(null)) {
    const images = new Set();
    for (const key of ['geometries', 'materials', 'textures', 'skeletons'])
      for (const item of r[key]) if (!keep[key].has(item)) {
        if (key === 'textures' && environmentTarget && item === environmentTarget.texture) continue;
        if (key === 'textures' && item.image && item.image.close) images.add(item.image);
        if (item.dispose) item.dispose();
        else if (key === 'skeletons' && item.boneTexture) { item.boneTexture.dispose(); item.boneTexture = null; }
      }
    for (const t of keep.textures) images.delete(t.image);
    for (const im of images) im.close();
  }
  // Legacy rigs/weapons mix shared primitives/caches and private halo/tier materials.
  // Protect both active references and off-scene caches before disposing only private resources.
  function sharedResources(exclude) {
    const keep = resources(null);
    if (typeof scene !== 'undefined') for (const child of scene.children) if (child !== exclude) resources(child, keep);
    for (const key in assets) resources(assets[key].root, keep);
    if (typeof WEP_MODELS !== 'undefined') for (const key in WEP_MODELS) resources(WEP_MODELS[key], keep);
    if (typeof GEO !== 'undefined') for (const key in GEO) keep.geometries.add(GEO[key]);
    for (const g of [typeof BOX !== 'undefined' && BOX, typeof SPH !== 'undefined' && SPH,
      typeof CYL !== 'undefined' && CYL, typeof CONE !== 'undefined' && CONE]) if (g) keep.geometries.add(g);
    if (typeof HERO_GEOS !== 'undefined') for (const key in HERO_GEOS) {
      const h = HERO_GEOS[key];
      keep.geometries.add(h.base);
      for (const role in h.clips) for (const g of h.clips[role]) keep.geometries.add(g);
    }
    if (typeof matC !== 'undefined') for (const key in matC) keep.materials.add(matC[key]);
    if (typeof lamV !== 'undefined') keep.materials.add(lamV);
    return keep;
  }
  function clearWeapon(R) {
    if (!R || !R.wp) return;
    const old = resources(R.wp);
    while (R.wp.children.length) R.wp.remove(R.wp.children[0]);
    disposeResources(old, sharedResources(R.g));
  }
  function capTextures(root) {
    const resized = new Map();
    for (const tex of resources(root).textures) {
      const im = tex.image, w = im && (im.width || im.naturalWidth), h = im && (im.height || im.naturalHeight);
      if (!w || !h) throw new Error('Texture has no decoded image dimensions');
      if (Math.max(w, h) <= ACTOR_CONFIG.textureEdge) continue;
      if (tex.isCompressedTexture || tex.isDataTexture || Array.isArray(im))
        throw new Error('Oversized compressed/data texture: pre-resize GLB maps to <=1024');
      let canvas = resized.get(im);
      if (!canvas) {
        canvas = document.createElement('canvas');
        const ratio = ACTOR_CONFIG.textureEdge / Math.max(w, h);
        canvas.width = Math.max(1, Math.floor(w * ratio)); canvas.height = Math.max(1, Math.floor(h * ratio));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot resize texture: pre-resize GLB maps to <=1024');
        ctx.drawImage(im, 0, 0, canvas.width, canvas.height); resized.set(im, canvas);
      }
      tex.image = canvas; tex.needsUpdate = true;
      // Keep GLTFLoader's encoding, flipY, UV set, wrapping and sampler unchanged.
    }
    for (const im of resized.keys()) if (im.close) im.close();
  }
  function skinnedBounds(root) {
    const box = new THREE.Box3(), v = new THREE.Vector3();
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.update();
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        if (o.isSkinnedMesh) o.boneTransform(i, v);
        v.applyMatrix4(o.matrixWorld); box.expandByPoint(v);
      }
    });
    return box;
  }
  function findHand(root, override) {
    let found = null;
    root.traverse(o => {
      if (!o.isBone) return;
      const n = compact(o.name).replace(/^mixamorig/, '');
      if (override ? o.name === override : /^(righthand|handr|rhand|bip001rhand)$/.test(n)) found = found || o;
    });
    return found;
  }
  function prepare(key, gl, targetHeight) {
    if (!gl.scene) throw new Error('GLB has no scene');
    const root = gl.scene, r = resources(root);
    let skinned = false, pbr = false;
    root.traverse(o => {
      if (o.isSkinnedMesh && o.skeleton) skinned = true;
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    const reflection = environment();
    for (const m of r.materials) if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
      pbr = true; m.skinning = true; m.needsUpdate = true;
      if (reflection) { m.envMap = reflection; m.envMapIntensity = 0.7; }
    }
    if (!skinned || !pbr || !r.textures.size) throw new Error('Sample requires a skinned root with textured PBR materials');
    capTextures(root);
    const clips = selectClips((gl.animations || []).map(c => pinClip(c, root)), ACTOR_CONFIG[key].clips);
    if (!clips.idle && !clips.walk && !clips.run) throw new Error('No recognized idle/walk/run clip; set ACTOR_CONFIG.' + key + '.clips to exact provider names');
    // Fit actual skinned vertices at a real idle pose (r128 Box3 ignores skin deformation).
    const fitMixer = new THREE.AnimationMixer(root), idle = clips.idle || clips.walk || clips.run;
    fitMixer.clipAction(idle).play(); fitMixer.update(0);
    const box = skinnedBounds(root), h = box.max.y - box.min.y;
    fitMixer.stopAllAction(); fitMixer.uncacheRoot(root);
    if (!(h > 0) || !Number.isFinite(h) || !(targetHeight > 0)) throw new Error('Invalid actor/target bounds');
    const rest = [];
    root.traverse(o => rest.push({ o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }));
    return { root, clips, rest, fit: targetHeight / h,
      offset: [-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2],
      diagnostics: { clips: Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, c.name])),
        hand: key === 'knight' && (findHand(root, ACTOR_CONFIG.knight.handBone) || {}).name,
        height: targetHeight, textureEdges: [...r.textures].map(t => [t.image.width, t.image.height]) } };
  }
  function restore(asset) {
    for (const t of asset.rest) { t.o.position.copy(t.p); t.o.quaternion.copy(t.q); t.o.scale.copy(t.s); }
    asset.root.updateMatrixWorld(true);
  }
  function makeRig(key) {
    const asset = assets[key], cfg = ACTOR_CONFIG[key], g = new THREE.Group(), fit = new THREE.Group(), offset = new THREE.Group();
    g.name = 'ashenActor-' + key;
    g.userData.actor = key;
    restore(asset);
    g.add(fit); fit.add(offset); offset.add(asset.root);
    fit.scale.setScalar(asset.fit); offset.position.set(...asset.offset); fit.rotation.y = cfg.yaw;
    const mixer = new THREE.AnimationMixer(asset.root), actions = {};
    for (const role in asset.clips) actions[role] = mixer.clipAction(asset.clips[role]);
    const a = { key, asset, g, fit, mixer, actions, role: null, current: null, shot: null, previous: null, clock: null, wall: null, seen: {} };
    mixer.addEventListener('finished', event => { if (event.action === a.current && a.shot !== 'fall') a.shot = null; });
    scene.add(g);
    change(a, 'idle'); mixer.update(0);
    return a;
  }
  function resolved(a, role) {
    if (a.actions[role]) return role;
    if (role === 'idle') return a.actions.walk ? 'walk' : a.actions.run ? 'run' : null;
    if (role === 'run' || role === 'walk') return a.actions[role === 'run' ? 'walk' : 'run'] ? (role === 'run' ? 'walk' : 'run') : a.actions.idle ? 'idle' : null;
    return null; // Missing attack/hurt/fall is NOT invented from a locomotion clip.
  }
  function change(a, role, restart = false, duration, progress = 0) {
    const nextRole = resolved(a, role);
    if (!nextRole) return false;
    if (nextRole === a.role && !restart) return true;
    const next = a.actions[nextRole], old = a.current, one = /^(attack|hurt|fall)$/.test(nextRole);
    next.reset(); next.enabled = true; next.clampWhenFinished = one;
    next.setLoop(one ? THREE.LoopOnce : THREE.LoopRepeat, one ? 1 : Infinity);
    next.setEffectiveWeight(1); next.setEffectiveTimeScale(1);
    if (one && duration > 0) next.setDuration(duration);
    next.time = Math.min(0.98, Math.max(0, progress)) * next.getClip().duration;
    next.play();
    if (old && old !== next) { old.fadeOut(ACTOR_CONFIG.fade); next.fadeIn(ACTOR_CONFIG.fade); }
    a.role = nextRole; a.current = next; a.shot = one ? nextRole : null;
    a.shotAge = 0;
    return true;
  }
  function notify(entity, role) {
    if (!entity || !/^(attack|hurt|fall)$/.test(role)) return;
    const ev = events.get(entity) || {}; ev[role] = (ev[role] || 0) + 1; events.set(entity, ev);
  }
  function signals(a, entity, boss) {
    const prev = a.previous, ev = events.get(entity) || {}, newEntity = !prev || prev.entity !== entity;
    if (newEntity) { a.seen = {}; a.shot = null; }
    const fired = role => (ev[role] || 0) !== (a.seen[role] || 0);
    const dead = !!entity.dead || (Number.isFinite(entity.hp) && entity.hp <= 0);
    const attack = boss
      ? [1, 3, 4].includes(entity.st) && (newEntity || prev.st !== entity.st || entity.stT > prev.stT + 0.02)
      : entity.swing > 0 && (newEntity || entity.swing > prev.swing + 0.02 || prev.swing <= 0);
    const result = {
      dead, fall: fired('fall') || (dead && (newEntity || !prev.dead)),
      hurt: fired('hurt') || (!newEntity && entity.hp < prev.hp),
      attack: fired('attack') || attack,
    };
    a.seen = { ...ev };
    a.previous = { entity, dead, hp: entity.hp, swing: entity.swing || 0, st: entity.st, stT: entity.stT || 0,
      x: entity.x, z: entity.z, walk: entity.walk || 0 };
    return result;
  }
  function delta(a, clock, now) {
    const dt = a.clock === null ? 0 : Math.max(0, Math.min(0.1, clock - a.clock));
    a.clock = clock; a.wall = now; return dt;
  }
  function animate(a, s, move, dt, attackDuration, progress) {
    if (a.shot === 'hurt') {
      a.shotAge = (a.shotAge || 0) + dt;
      if (a.shotAge >= 0.45) { a.shot = null; change(a, move); }
    }
    // A revived player may keep the same state object; release the clamped death pose.
    if (!s.dead && a.shot === 'fall') { a.shot = null; change(a, move, true); }
    if (s.fall || s.dead) {
      if (a.shot !== 'fall') change(a, 'fall', true);
    } else if (s.hurt && change(a, 'hurt', true)) {
      // Real health loss, not boss wind-up flash.
    } else if (s.attack && a.shot !== 'hurt') change(a, 'attack', true, attackDuration, progress);
    if (!a.shot) change(a, move);
    a.mixer.update(dt);
  }
  function weaponSync(R) {
    const a = R && R.actor;
    if (!a || !a.hand || !R.wp) return;
    const cfg = ACTOR_CONFIG.knight.weapon;
    a.g.updateMatrixWorld(true);
    a.hand.matrixWorld.decompose(a.hp, a.hq, a.hs);
    // Rigid sibling of the fitted/skinned body: cancel inherited scale and never skin the weapon.
    a.g.worldToLocal(a.hp);
    a.g.getWorldQuaternion(a.gq).invert(); a.hq.premultiply(a.gq);
    a.align.setFromEuler(new THREE.Euler(...cfg.rotation));
    R.wp.position.copy(a.hp);
    a.offset.set(...cfg.position).applyQuaternion(a.hq); R.wp.position.add(a.offset);
    R.wp.quaternion.copy(a.hq).multiply(a.align); R.wp.scale.setScalar(cfg.scale);
  }
  function releaseRig(R) {
    if (!R || !R.g) return;
    if (R.actor) {
      const a = R.actor;
      clearWeapon(R); a.mixer.stopAllAction(); a.mixer.uncacheRoot(a.asset.root);
      a.asset.root.parent.remove(a.asset.root); restore(a.asset);
      a.g.parent && a.g.parent.remove(a.g);
      if (a === knightRig) knightRig = null;
    } else {
      const old = resources(R.g);
      R.g.parent && R.g.parent.remove(R.g);
      disposeResources(old, sharedResources(R.g));
    }
    for (const k of ['g', 'actor', 'wp', 'hm', 'anim', 'aL', 'aR', 'lL', 'lR']) R[k] = null;
    R.wpHand = false;
  }
  function buildRig(R, charId, wep) {
    if (typeof PM === 'undefined' || R !== PM || charId !== 'knight' || !assets.knight) return false;
    releaseRig(R);
    const a = makeRig('knight'); knightRig = a;
    R.actor = a; R.char = charId; R.g = a.g; R.hm = R.anim = null; R.wpHand = false;
    R.wp = new THREE.Group(); R.g.add(R.wp);
    a.hand = findHand(a.asset.root, ACTOR_CONFIG.knight.handBone);
    for (const k of ['hp', 'hs', 'offset']) a[k] = new THREE.Vector3();
    for (const k of ['hq', 'gq', 'align']) a[k] = new THREE.Quaternion();
    R.wp.visible = !!a.hand;
    if (!a.hand) console.warn('actor knight: no real right-hand BONE; held weapon hidden. Set ACTOR_CONFIG.knight.handBone.');
    if (typeof buildWeapon === 'function') buildWeapon(R, wep);
    weaponSync(R); return true;
  }
  function pose(R, p, wepId, playing, now) {
    const a = R && R.actor; if (!a) return false;
    const old = a.previous, s = signals(a, p, false);
    const game = typeof G !== 'undefined' && G, frozen = game && playing && game.state !== 'play' && game.state !== 'watch';
    const watching = game && game.state === 'watch';
    const watcher = typeof LIVE !== 'undefined' && LIVE && LIVE.watch;
    const watchClock = watcher && Number.isFinite(watcher.vt) ? watcher.vt : now / 1000;
    const clock = !playing || s.dead ? now / 1000 : watching ? watchClock : game ? game.t : now / 1000;
    const dt = delta(a, clock, now);
    let move = playing && (p.moving || p.dashT > 0) ? 'run' : 'idle';
    if (move === 'run' && old && dt > 0 && p.dashT <= 0) {
      const gaitSpeed = Math.max(0, (p.walk - old.walk) / dt / 1.5);
      if (gaitSpeed > 0 && gaitSpeed < (p.speed || 6) * 0.5) move = 'walk';
    }
    a.g.position.set(p.x, ACTOR_CONFIG.knight.groundOffset, p.z); a.g.rotation.set(0, p.face || 0, 0);
    // Keep the run cycle intact while moving: weapon hits still fire, but the body does not
    // swap to the standing attack clip and snap back every swing.
    if (p.moving && !p.dashT) { s.attack = false; if (a.shot === 'attack') a.shot = null; }
    animate(a, s, move, frozen && !s.dead ? 0 : dt, 0.2, p.swing > 0 ? 1 - p.swing : 0);
    // The provider's locomotion clips are authored side-on; turn the body back to its facing.
    const loco = a.role === 'run' || a.role === 'walk';
    const targetYaw = ACTOR_CONFIG.knight.yaw + (loco ? ACTOR_CONFIG.knight.locomotionYaw : 0);
    a.fit.rotation.y += (targetYaw - a.fit.rotation.y) * Math.min(1, dt * 14);
    if (a.current) a.current.setEffectiveTimeScale(a.role === 'run' ? 1.25 : 1);
    weaponSync(R); return true;
  }
  function destroyBoss() {
    if (!bossRig) return;
    bossRig.mixer.stopAllAction(); bossRig.mixer.uncacheRoot(bossRig.asset.root);
    bossRig.asset.root.parent.remove(bossRig.asset.root); restore(bossRig.asset);
    bossRig.g.parent && bossRig.g.parent.remove(bossRig.g);
    bossRig = bossEntity = tail = null;
  }
  function bossRender(e, now) {
    if (!e || e.kind !== 0 || !assets.guardian || e.dead) return false;
    if (!bossRig || bossEntity !== e) { destroyBoss(); bossRig = makeRig('guardian'); bossEntity = e; }
    tail = null;
    const a = bossRig, old = a.previous, s = signals(a, e, true), dt = delta(a, e.t || 0, now);
    const cine = typeof CINE !== 'undefined' && CINE.on && CINE.freeze && CINE.boss === e;
    const moving = !cine && (e.st === 2 || (old && Math.hypot(e.x - old.x, e.z - old.z) > 0.001));
    a.g.visible = true; a.g.position.set(e.x, (e.y || 0) + ACTOR_CONFIG.guardian.groundOffset, e.z);
    a.g.rotation.set(0, e.face || 0, 0); a.g.scale.setScalar(e.scale || 1);
    animate(a, s, moving ? (e.st === 2 ? 'run' : 'walk') : 'idle', e.frz > 0 ? 0 : dt, Math.max(0.08, e.stT || 0.5), 0);
    const loco = a.role === 'run' || a.role === 'walk';
    const targetYaw = ACTOR_CONFIG.guardian.yaw + (loco ? ACTOR_CONFIG.guardian.locomotionYaw : 0);
    a.fit.rotation.y += (targetYaw - a.fit.rotation.y) * Math.min(1, dt * 14);
    // Preserve original aura/bar in renderer/HUD; only the old body is suppressed.
    if (typeof bossMesh !== 'undefined') bossMesh.visible = false;
    return true;
  }
  function bossHide(e, now = performance.now()) {
    if (e && e === bossEntity && e.dead && bossRig && bossRig.actions.fall) {
      const life = Math.min(2, bossRig.actions.fall.getClip().duration);
      change(bossRig, 'fall', true, life); bossRig.mixer.update(0);
      tail = { entity: e, until: now + life * 1000, last: now }; return;
    }
    destroyBoss();
  }
  function bossFrame(now) {
    if (tail) {
      const game = typeof G !== 'undefined' && G;
      if (now >= tail.until || !game || game.state === 'menu') { destroyBoss(); return; }
      bossRig.mixer.update(Math.max(0, Math.min(0.1, (now - tail.last) / 1000))); tail.last = now;
    } else if (bossEntity && (typeof G === 'undefined' || !G || G.boss !== bossEntity)) destroyBoss();
  }
  function load() {
    if (!THREE.GLTFLoader || (typeof IS_SANDBOX !== 'undefined' && IS_SANDBOX) ||
      (typeof location !== 'undefined' && !/^https?:$/.test(location.protocol))) return Promise.resolve([]);
    const token = generation, loader = new THREE.GLTFLoader();
    // Snapshot BEFORE old loadModels replaces GEO.boss0 asynchronously.
    const cfg = ACTOR_CONFIG.guardian;
    if (!cfg.height && typeof GEO !== 'undefined' && GEO.boss0) {
      GEO.boss0.computeBoundingBox(); cfg.height = GEO.boss0.boundingBox.max.y - GEO.boss0.boundingBox.min.y;
    }
    return Promise.all(['knight', 'guardian'].map(key => {
      if (assets[key]) return Promise.resolve(true);
      if (pending[key]) return pending[key];
      pending[key] = new Promise(resolve => {
        const failed = error => { console.warn('actor fallback', key, error); resolve(false); };
        try {
          loader.load(ACTOR_CONFIG[key].file + '?v=' + ACTOR_CONFIG.version, gl => {
            try {
              if (token !== generation) { disposeResources(resources(gl.scene)); resolve(false); return; }
              assets[key] = prepare(key, gl, ACTOR_CONFIG[key].height);
              if (key === 'knight') {
                if (typeof PORTRAITS !== 'undefined') delete PORTRAITS.knight;
                if (typeof S !== 'undefined' && S.char === 'knight' && typeof buildPlayer === 'function') buildPlayer();
              }
              console.info('actor ready', key, assets[key].diagnostics); resolve(true);
            } catch (error) {
              if (assets[key]) { console.warn('actor loaded; rebuild needs verification', key, error); resolve(true); }
              else { disposeResources(resources(gl.scene)); failed(error); }
            }
          }, undefined, failed);
        } catch (error) { failed(error); }
      }).finally(() => { if (token === generation) delete pending[key]; });
      return pending[key];
    }));
  }
  function dispose() {
    generation++;
    if (knightRig && typeof PM !== 'undefined') releaseRig(PM);
    destroyBoss();
    for (const key in assets) { disposeResources(resources(assets[key].root)); delete assets[key]; }
    for (const key in pending) delete pending[key];
    if (environmentTarget) { environmentTarget.dispose(); environmentTarget = null; }
  }
  return { load, buildRig, pose, releaseRig, clearWeapon, weaponSync, notify, bossRender, bossHide, bossFrame, dispose,
    selectClips, pinClip, findHand, diagnostics: () => Object.fromEntries(Object.entries(assets).map(([k, a]) => [k, a.diagnostics])) };
})();
function loadActors() { return ACTOR_MODELS.load(); }
function buildActorRig(R, charId, wep) { return ACTOR_MODELS.buildRig(R, charId, wep); }
function actorRigPose(R, p, wepId, playing, now) { return ACTOR_MODELS.pose(R, p, wepId, playing, now); }
function actorReleaseRig(R) { ACTOR_MODELS.releaseRig(R); }
function actorWeaponWillRebuild(R) { ACTOR_MODELS.clearWeapon(R); }
function actorWeaponSync(R) { ACTOR_MODELS.weaponSync(R); }
function actorNotify(entity, role) { ACTOR_MODELS.notify(entity, role); }
function actorBossRender(e, now) { return ACTOR_MODELS.bossRender(e, now); }
function actorBossHide(e, now) { ACTOR_MODELS.bossHide(e, now); }
function actorBossFrame(now) { ACTOR_MODELS.bossFrame(now); }
function disposeActors() { ACTOR_MODELS.dispose(); }
