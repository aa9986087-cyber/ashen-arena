'use strict';
/* Sword duel — blood and dismemberment: droplets that fly from wounds and splat on the stones, wounds that keep
   bleeding, blood on the blade, blood on the screen, and limbs cut off (the limb's bones collapse to a stump and a
   rigid copy of that limb, frozen in its pose, falls to the ground). */
const GORE_PARTS = {
  // bit, the bone cut off (with everything below it), stump size (m)
  head: { bit: 1, bone: 'Head', r: 0.048 },
  armL: { bit: 2, bone: 'lowerarm_l', r: 0.034 },
  armR: { bit: 4, bone: 'lowerarm_r', r: 0.034 },
  legL: { bit: 8, bone: 'calf_l', r: 0.045 },
  legR: { bit: 16, bone: 'calf_r', r: 0.045 },
  handL: { bit: 32, bone: 'hand_l', r: 0.03 },
  shoulderL: { bit: 64, bone: 'upperarm_l', r: 0.05 },
};
const GORE = { scene: null, sparks: [], drops: [], decals: [], pieces: [], jets: [], screen: [], decalN: 0 };
const GORE_MAXD = 600,
  GORE_MAXS = 260;
const goreCol = hex => new THREE.Color(hex).convertSRGBToLinear();
const gV = new THREE.Vector3(),
  gV2 = new THREE.Vector3(),
  gQ = new THREE.Quaternion(),
  gM = new THREE.Matrix4(),
  gS = new THREE.Vector3(),
  gUp = new THREE.Vector3(0, 1, 0);
/** A splat texture: one thick blob with a ragged rim and satellite droplets (white, tinted by the material). */
function goreSplatTex(round) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  const blob = (cx, cy, r) => {
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
  };
  blob(64, 64, round ? 40 : 26);
  for (let i = 0; i < (round ? 16 : 26); i++) {
    const a = Math.random() * Math.PI * 2,
      d = (round ? 30 : 18) + Math.random() * (round ? 16 : 40);
    blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, round ? 8 + Math.random() * 10 : 2 + Math.random() * 7);
  }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
/** Build the pools of meshes inside the duel arena (once). */
function goreInit(scene) {
  GORE.scene = scene;
  const dropMat = new THREE.MeshStandardMaterial({ color: goreCol(0x6a0404), roughness: 0.18, metalness: 0.1 });
  GORE.dropMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), dropMat, GORE_MAXD);
  GORE.dropMesh.frustumCulled = false;
  GORE.dropMesh.count = 0;
  scene.add(GORE.dropMesh);
  const decal = (round, n) => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(
      g,
      new THREE.MeshStandardMaterial({
        map: goreSplatTex(round),
        color: goreCol(0x560303),
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      n
    );
    m.frustumCulled = false;
    m.count = 0;
    m.renderOrder = 1;
    scene.add(m);
    return m;
  };
  GORE.splatMesh = decal(false, GORE_MAXS);
  GORE.poolMesh = decal(true, 24);
  // sparks of steel on steel: short bright streaks
  GORE.sparkMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
    160
  );
  GORE.sparkMesh.frustumCulled = false;
  GORE.sparkMesh.count = 0;
  scene.add(GORE.sparkMesh);
  GORE.capMat = new THREE.MeshStandardMaterial({ color: goreCol(0x5c0606), roughness: 0.22, metalness: 0.1 });
  GORE.boneMat = new THREE.MeshStandardMaterial({ color: goreCol(0xe8dcc4), roughness: 0.5 });
  GORE.capGeo = new THREE.SphereGeometry(1, 10, 8);
  GORE.boneGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.5, 8);
}
/** Wipe every drop, stain, limb and screen splash (a new match). */
function goreClear() {
  GORE.drops.length = 0;
  GORE.sparks.length = 0;
  GORE.decals.length = 0;
  GORE.jets.length = 0;
  GORE.screen.length = 0;
  GORE.decalN = 0;
  for (const p of GORE.pieces) GORE.scene.remove(p.obj);
  GORE.pieces.length = 0;
  if (GORE.dropMesh) GORE.dropMesh.count = GORE.splatMesh.count = GORE.poolMesh.count = 0;
  for (const f of [DUEL.me, DUEL.foe]) if (f) f.blood = 0;
  goreScreenDraw(true);
}
/** Blades meet: a burst of sparks where the swords cross (between the two, at sword height). */
function goreSparks(a, d, n) {
  if (!GORE.scene) return;
  const x = a.x + (d.x - a.x) * 0.55,
    z = a.z + (d.z - a.z) * 0.55;
  for (let i = 0; i < n; i++) {
    if (GORE.sparks.length >= 160) GORE.sparks.shift();
    const v = 2 + Math.random() * 5,
      th = Math.random() * Math.PI * 2,
      up = Math.random() * 0.9 + 0.1;
    GORE.sparks.push({
      x,
      y: 1.25 + rand(-0.1, 0.15),
      z,
      vx: Math.cos(th) * v * (1 - up * 0.5),
      vy: up * v,
      vz: Math.sin(th) * v * (1 - up * 0.5),
      t: 0,
      life: 0.18 + Math.random() * 0.3,
    });
  }
}
/** One droplet. */
function goreDrop(x, y, z, vx, vy, vz, s) {
  if (GORE.drops.length >= GORE_MAXD) GORE.drops.shift();
  GORE.drops.push({ x, y, z, vx, vy, vz, s });
}
/** A stain on the floor (round = a pool that keeps spreading). */
function goreStain(x, z, size, round, grow) {
  const list = GORE.decals;
  if (round) {
    list.push({ x, z, a: Math.random() * 6.3, s: 0, to: size, k: grow || 0.25, pool: 1 });
    const pools = list.filter(d => d.pool);
    if (pools.length > 24) list.splice(list.indexOf(pools[0]), 1);
    return;
  }
  const splats = list.filter(d => !d.pool);
  if (splats.length >= GORE_MAXS) list.splice(list.indexOf(splats[0]), 1);
  list.push({ x, z, a: Math.random() * 6.3, s: size * 0.4, to: size, k: 6, pool: 0, y: (GORE.decalN++ % 50) * 0.0002 });
}
/** A spray of `n` droplets from (x, y, z) roughly along (dx, dy, dz). */
function goreSpray(p, d, n, speed, spread) {
  for (let i = 0; i < n; i++) {
    const v = speed * (0.35 + Math.random() * 0.9);
    goreDrop(
      p.x + rand(-0.03, 0.03),
      p.y + rand(-0.03, 0.03),
      p.z + rand(-0.03, 0.03),
      (d.x + rand(-spread, spread)) * v,
      (d.y + rand(-spread, spread) * 0.7) * v,
      (d.z + rand(-spread, spread)) * v,
      0.004 + Math.random() * Math.random() * 0.016
    );
  }
}
function goreBone(f, name) {
  if (!f.bones) {
    f.bones = {};
    f.root.traverse(o => o.isBone && (f.bones[o.name] = o));
  }
  return f.bones[name];
}
/** A blow landed on `d` from `a`: blood bursts out of the wound, away from the blade, and the wound keeps bleeding. */
function goreHit(d, a, kind) {
  if (!GORE.scene) return;
  const heavy = kind === 'heavy',
    names = heavy
      ? ['neck_01', 'spine_03', 'clavicle_l', 'clavicle_r']
      : ['spine_03', 'spine_02', 'upperarm_l', 'upperarm_r', 'neck_01'],
    bone = goreBone(d, names[(Math.random() * names.length) | 0]);
  if (!bone) return;
  bone.getWorldPosition(gV);
  let ax = d.x - a.x,
    az = d.z - a.z;
  const L = Math.hypot(ax, az) || 1;
  ax /= L;
  az /= L;
  // out of the far side and along the swing (sideways), a little upward
  const side = Math.random() < 0.5 ? -1 : 1;
  gV2.set(ax * 0.7 - az * 0.5 * side, 0.35, az * 0.7 + ax * 0.5 * side).normalize();
  goreSpray(gV, gV2, kind === 'chip' ? 10 : heavy ? 70 : 38, heavy ? 5.2 : 3.6, 0.45);
  // a few drops back toward the attacker (and his blade)
  gV2.set(-ax, 0.5, -az).normalize();
  goreSpray(gV, gV2, heavy ? 14 : 6, 2.2, 0.5);
  GORE.jets.push({ f: d, bone, t: 0, dur: heavy ? 6 : 3.5, rate: heavy ? 18 : 10, drip: 1, acc: 0 });
  a.blood = Math.min(1, (a.blood || 0) + (heavy ? 0.35 : 0.2));
  goreBlade(a);
}
/** Blood on the sword: the steel darkens toward red the more blood it has drawn. */
function goreBlade(f) {
  const m = f.sword && f.sword.userData.steel;
  if (!m) return;
  const b = Math.min(1, f.blood || 0) * 0.85;
  m.color.setRGB(0.87 + (0.42 - 0.87) * b, 0.9 + (0.03 - 0.9) * b, 0.93 + (0.03 - 0.93) * b);
  m.roughness = 0.28 + b * 0.15;
}
/** Cut part `key` off fighter `f` (a blow from `a`, or the owner said so over the network). */
function goreCut(f, key, a) {
  const P = GORE_PARTS[key];
  if (!P || f.cuts & P.bit || !GORE.scene) return;
  f.cuts |= P.bit;
  const bone = goreBone(f, P.bone);
  if (!bone) return;
  f.root.updateMatrixWorld(true);
  // which bones go with the limb
  const sub = new Set();
  bone.traverse(o => o.isBone && sub.add(o));
  const pivot = bone.getWorldPosition(new THREE.Vector3());
  const piece = new THREE.Group();
  piece.position.copy(pivot);
  // freeze the limb's skinned vertices in their current pose into plain meshes
  f.root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const g = o.geometry,
      pos = g.attributes.position,
      si = g.attributes.skinIndex,
      sw = g.attributes.skinWeight,
      bones = o.skeleton.bones,
      inLimb = new Uint8Array(pos.count);
    let any = false;
    const get = ['getX', 'getY', 'getZ', 'getW'];
    for (let i = 0; i < pos.count; i++) {
      let w = 0,
        all = 0;
      for (let k = 0; k < 4; k++) {
        const wk = sw[get[k]](i);
        all += wk;
        if (sub.has(bones[si[get[k]](i)])) w += wk;
      }
      if (all > 0 && w / all >= 0.5) inLimb[i] = any = 1;
    }
    // the hood, hair and face go whole with the head (the hood hangs from the neck bones and would stay behind empty)
    const whole = key === 'head' && f.headMeshes.includes(o);
    if (whole) {
      inLimb.fill(1);
      any = true;
      o.visible = false;
      o.userData.cut = 1;
      (f.cutHidden = f.cutHidden || []).push(o);
    }
    if (!any) return;
    const idx = g.index ? g.index.array : null,
      triN = idx ? idx.length / 3 : pos.count / 3,
      map = new Int32Array(pos.count).fill(-1),
      outPos = [],
      outUv = [],
      outIdx = [],
      uv = g.attributes.uv;
    for (let t = 0; t < triN; t++) {
      const a0 = idx ? idx[t * 3] : t * 3,
        a1 = idx ? idx[t * 3 + 1] : t * 3 + 1,
        a2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
      if (!inLimb[a0] || !inLimb[a1] || !inLimb[a2]) continue;
      for (const v of [a0, a1, a2]) {
        if (map[v] < 0) {
          map[v] = outPos.length / 3;
          o.boneTransform(v, gV).applyMatrix4(o.matrixWorld).sub(pivot);
          outPos.push(gV.x, gV.y, gV.z);
          if (uv) outUv.push(uv.getX(v), uv.getY(v));
        }
        outIdx.push(map[v]);
      }
    }
    if (!outIdx.length) return;
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
    if (uv) ng.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2));
    ng.setIndex(outIdx);
    ng.computeVertexNormals();
    const mat = o.material.clone();
    mat.skinning = mat.morphTargets = mat.morphNormals = false;
    mat.side = THREE.DoubleSide;
    mat.vertexColors = false; // the outfit's vertex colours are material masks, not colours
    const m = new THREE.Mesh(ng, mat);
    m.castShadow = true;
    m.frustumCulled = false;
    piece.add(m);
  });
  // the sword falls with the sword arm
  if (key === 'armR' && f.sword) {
    const s = f.sword.clone();
    f.sword.matrixWorld.decompose(s.position, s.quaternion, s.scale);
    s.position.sub(pivot);
    piece.add(s);
    f.sword.visible = false;
  }
  // the raw end of the severed limb
  // (both wounds are flattened discs facing along the cut limb, not balls)
  const end = new THREE.Mesh(GORE.capGeo, GORE.capMat);
  end.scale.set(P.r, P.r * 0.4, P.r);
  end.quaternion.setFromUnitVectors(gUp, bone.parent.getWorldPosition(gV).sub(pivot).normalize());
  piece.add(end);
  GORE.scene.add(piece);
  // and the stump on the body: the limb's bones shrink to nothing at the joint, a wet cap with bone in the middle
  bone.scale.setScalar(1e-4);
  const parent = bone.parent,
    ws = parent.getWorldScale(gS).x || 1,
    cap = new THREE.Mesh(GORE.capGeo, GORE.capMat),
    marrow = new THREE.Mesh(GORE.boneGeo, GORE.boneMat);
  cap.position.copy(bone.position);
  cap.quaternion.setFromUnitVectors(gUp, gV.copy(bone.position).normalize());
  cap.scale.set(P.r / ws, (P.r * 0.4) / ws, P.r / ws);
  marrow.scale.set(0.8, 1.6, 0.8);
  marrow.position.y = 0.5;
  cap.add(marrow);
  parent.add(cap);
  (f.caps = f.caps || []).push(cap);
  // fling the limb away from the blade, spinning
  const src = a || (f === DUEL.me ? DUEL.foe : DUEL.me);
  let ax = f.x - src.x,
    az = f.z - src.z;
  const L = Math.hypot(ax, az) || 1;
  ax /= L;
  az /= L;
  const sp = key === 'head' ? 3.4 : 2.6;
  GORE.pieces.push({
    obj: piece,
    f,
    vx: ax * sp + rand(-1, 1),
    vy: key.startsWith('leg') ? 1.2 : 3.2,
    vz: az * sp + rand(-1, 1),
    wx: rand(-9, 9),
    wy: rand(-6, 6),
    wz: rand(-9, 9),
    r: P.r * 1.2,
    t: 0,
    rest: 0,
  });
  // a burst, then the stump pumps blood in pulses
  gV2.set(ax, 0.6, az).normalize();
  goreSpray(pivot, gV2, 90, 5.5, 0.6);
  const disarmed = key === 'armR' && f.act !== 'dead' && f.hp > 0;
  GORE.jets.push({ f, cap, bone: parent, t: 0, dur: disarmed ? 14 : 5, rate: disarmed ? 55 : 70, acc: 0, pump: 1 });
  GORE.jets.push({ piece: GORE.pieces[GORE.pieces.length - 1], t: 0, dur: 2.5, rate: 35, acc: 0, pump: 1 });
  // cut while still standing: it bleeds for a while (the owner's copy loses the health), and both sides are told
  if (f.act !== 'dead' && f.hp > 0) {
    DS.scream(f);
    f.bleedT = disarmed ? 99 : 5;
    if (!DUEL.watch)
      duelFloat(
        disarmed
          ? f === DUEL.me
            ? 'طاح سيفك مع يدك! 🩸 تفادى'
            : 'قطعت يد سيفه! 🩸 خلّص عليه'
          : f === DUEL.me
            ? 'انقطعت يدك! 🩸'
            : 'بترت يده! 🩸',
        'brk'
      );
    if (disarmed) {
      f.want.block = false;
      if (f.act === 'block') f.start('idle');
    }
  }
  if (f === DUEL.me && !DUEL.watch) goreScreen(5);
  else if (DUEL.view === 'fp' && !DUEL.watch && Math.hypot(f.x - DUEL.me.x, f.z - DUEL.me.z) < 2.6) goreScreen(3, true);
}
/** A new round: stumps heal, limbs come back, the severed ones on the floor are cleared away. */
function goreReset(f) {
  for (const P of Object.values(GORE_PARTS)) {
    const b = goreBone(f, P.bone);
    if (b) b.scale.setScalar(1);
  }
  for (const c of f.caps || []) c.parent && c.parent.remove(c);
  f.caps = [];
  for (const o of f.cutHidden || []) {
    o.visible = true;
    o.userData.cut = 0;
  }
  f.cutHidden = [];
  f.cuts = 0;
  f.bleedT = 0;
  if (f.sword) f.sword.visible = true;
  for (let i = GORE.pieces.length - 1; i >= 0; i--)
    if (GORE.pieces[i].f === f) {
      GORE.scene.remove(GORE.pieces[i].obj);
      GORE.pieces.splice(i, 1);
    }
  GORE.jets = GORE.jets.filter(j => j.f !== f && !(j.piece && j.piece.f === f));
}
/** The defender's own copy decides what a blow cuts off (sent to the other side with the fighter's state). */
function goreDecide(d, kind) {
  const r = Math.random();
  const has = k => d.cuts & GORE_PARTS[k].bit;
  if (d.hp <= 0) {
    let k;
    if (kind === 'heavy') k = r < 0.5 ? 'head' : r < 0.7 ? 'armR' : r < 0.85 ? 'legL' : 'legR';
    else k = r < 0.3 ? 'armR' : r < 0.6 ? 'armL' : r < 0.85 ? 'head' : 'legR';
    return has(k) ? (has('head') ? null : 'head') : k;
  }
  // mid-fight: the sword arm now and then (the fighter is left helpless and bleeding out), the off arm or hand more often
  // (legs and head only go with the killing blow)
  if (!has('armR') && r < (kind === 'heavy' ? 0.12 : 0.04)) return 'armR';
  if (has('armL')) return null;
  if (kind === 'heavy' && r < 0.4) return 'armL';
  if (kind === 'light' && r < 0.14 && !has('handL')) return 'handL';
  return null;
}
/* ---- per frame */
function goreUpdate(dt) {
  if (!GORE.scene || dt <= 0) return;
  const g = 11.5;
  // a fresh stump drains health for a few seconds (never below 5); a lost sword arm bleeds out, and that kills
  for (const f of [DUEL.me, DUEL.foe])
    if (f && f.bleedT > 0) {
      f.bleedT -= dt;
      if (f.remote || f.act === 'dead' || DUEL.phase !== 'fight') continue;
      if (f.cuts & GORE_PARTS.armR.bit) {
        f.hp = Math.max(0, f.hp - 6 * dt);
        if (f.hp <= 0) duelLethalGate(f);
        if (f.hp <= 0) {
          f.start('dead');
          f.play('death', 0.1, 0, true);
          DS.death(f);
        }
      } else f.hp = Math.max(Math.min(f.hp, 5), f.hp - 2.4 * dt);
    }
  // fighters bleeding: a dead body spreads a pool, a badly hurt one drips
  for (const f of [DUEL.me, DUEL.foe]) {
    if (!f) continue;
    if (f.act === 'dead') {
      if (!f.pooled) {
        f.pooled = 1;
        const p = goreBone(f, 'spine_02');
        if (p) {
          p.getWorldPosition(gV);
          goreStain(gV.x, gV.z, 1.9 + Math.random() * 0.5, true, 0.32);
        }
      }
    } else f.pooled = 0;
    if (f.hp < 40 && f.act !== 'dead' && Math.random() < dt * (40 - f.hp) * 0.25) {
      const b = goreBone(f, Math.random() < 0.5 ? 'spine_03' : 'upperarm_l');
      if (b) {
        b.getWorldPosition(gV);
        goreDrop(
          gV.x + rand(-0.1, 0.1),
          gV.y,
          gV.z + rand(-0.1, 0.1),
          rand(-0.2, 0.2),
          -0.3,
          rand(-0.2, 0.2),
          0.007 + Math.random() * 0.008
        );
      }
    }
  }
  // wounds and stumps
  for (let i = GORE.jets.length - 1; i >= 0; i--) {
    const j = GORE.jets[i];
    j.t += dt;
    if (j.t > j.dur) {
      GORE.jets.splice(i, 1);
      continue;
    }
    const fade = 1 - j.t / j.dur,
      beat = j.pump ? Math.max(0, Math.sin(j.t * 9)) ** 2 : 1;
    j.acc += dt * j.rate * fade * beat;
    if (j.acc < 1) continue;
    let dir;
    if (j.piece) {
      j.piece.obj.getWorldPosition(gV);
      dir = gV2.set(rand(-1, 1), 0.8, rand(-1, 1)).normalize();
    } else if (j.cap) {
      j.cap.getWorldPosition(gV);
      j.bone.getWorldPosition(gV2);
      dir = gV2.subVectors(gV, gV2).normalize();
      dir.y += 0.35;
    } else {
      j.bone.getWorldPosition(gV);
      dir = gV2.set(rand(-0.3, 0.3), -0.2, rand(-0.3, 0.3));
    }
    while (j.acc >= 1) {
      j.acc -= 1;
      if (j.drip)
        goreDrop(
          gV.x + rand(-0.06, 0.06),
          gV.y + rand(-0.06, 0.04),
          gV.z + rand(-0.06, 0.06),
          dir.x,
          dir.y,
          dir.z,
          0.008 + Math.random() * 0.01
        );
      else goreSpray(gV, dir, 1, (j.pump ? 3.2 : 1) * (0.5 + fade), 0.25);
    }
  }
  // flying droplets: fall, splat on the floor
  const D = GORE.drops;
  for (let i = D.length - 1; i >= 0; i--) {
    const p = D[i];
    p.vy -= g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.y <= 0.01) {
      if (Math.hypot(p.x, p.z) < 10.8 && (p.s > 0.008 || Math.random() < 0.35))
        goreStain(p.x, p.z, p.s * (14 + Math.random() * 12), false);
      D.splice(i, 1);
    }
  }
  // severed limbs: tumble, bounce, roll to a stop and bleed a pool where they lie
  for (const p of GORE.pieces) {
    p.t += dt;
    const o = p.obj;
    if (p.rest) continue;
    p.vy -= g * dt;
    o.position.x += p.vx * dt;
    o.position.y += p.vy * dt;
    o.position.z += p.vz * dt;
    gQ.setFromAxisAngle(gV.set(p.wx, p.wy, p.wz).normalize(), Math.hypot(p.wx, p.wy, p.wz) * dt);
    o.quaternion.premultiply(gQ);
    if (o.position.y < p.r) {
      o.position.y = p.r;
      if (Math.abs(p.vy) > 1.2) {
        p.vy *= -0.32;
        goreStain(o.position.x, o.position.z, 0.25 + Math.random() * 0.2, false);
      } else p.vy = 0;
      p.vx *= 0.82;
      p.vz *= 0.82;
      p.wx *= 0.75;
      p.wy *= 0.75;
      p.wz *= 0.75;
      if (Math.hypot(p.vx, p.vz) < 0.08 && p.vy === 0 && p.t > 0.6) {
        p.rest = 1;
        goreStain(o.position.x, o.position.z, 0.7 + Math.random() * 0.3, true, 0.18);
      }
    }
    const rr = Math.hypot(o.position.x, o.position.z);
    if (rr > DM.arena + 0.4) {
      o.position.x *= (DM.arena + 0.4) / rr;
      o.position.z *= (DM.arena + 0.4) / rr;
      p.vx *= -0.3;
      p.vz *= -0.3;
    }
  }
  // sparks: fly, fall, fade by shrinking
  const SP = GORE.sparks,
    km = GORE.sparkMesh;
  for (let i = SP.length - 1; i >= 0; i--) {
    const p = SP[i];
    p.t += dt;
    if (p.t > p.life) {
      SP.splice(i, 1);
      continue;
    }
    p.vy -= 9 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
  }
  for (let i = 0; i < SP.length; i++) {
    const p = SP[i],
      sp = Math.hypot(p.vx, p.vy, p.vz),
      k = 1 - p.t / p.life;
    gQ.setFromUnitVectors(gUp, gV.set(p.vx, p.vy, p.vz).divideScalar(sp || 1));
    gM.compose(gV.set(p.x, p.y, p.z), gQ, gS.set(0.012 * k, 0.03 + sp * 0.022 * k, 0.012 * k));
    km.setMatrixAt(i, gM);
  }
  km.count = SP.length;
  km.instanceMatrix.needsUpdate = true;
  // write the instances
  const dm = GORE.dropMesh;
  for (let i = 0; i < D.length; i++) {
    const p = D[i],
      sp = Math.hypot(p.vx, p.vy, p.vz);
    gQ.setFromUnitVectors(gUp, gV.set(p.vx, p.vy, p.vz).divideScalar(sp || 1));
    gM.compose(gV.set(p.x, p.y, p.z), gQ, gS.set(p.s, p.s * (1 + Math.min(4, sp * 0.45)), p.s));
    dm.setMatrixAt(i, gM);
  }
  dm.count = D.length;
  dm.instanceMatrix.needsUpdate = true;
  let ns = 0,
    np = 0;
  const sm = GORE.splatMesh,
    pm = GORE.poolMesh;
  for (const d of GORE.decals) {
    if (d.s < d.to) d.s = Math.min(d.to, d.s + (d.pool ? d.k * dt : (d.to - d.s) * d.k * dt + 0.001));
    gQ.setFromAxisAngle(gUp, d.a);
    gM.compose(gV.set(d.x, d.pool ? 0.009 : 0.012 + d.y, d.z), gQ, gS.set(d.s, 1, d.s));
    if (d.pool) pm.setMatrixAt(np++, gM);
    else sm.setMatrixAt(ns++, gM);
  }
  sm.count = ns;
  pm.count = np;
  sm.instanceMatrix.needsUpdate = pm.instanceMatrix.needsUpdate = true;
  goreScreenDraw(false, dt);
}
/* ---- blood on the lens (first person) */
function goreScreen(n, center) {
  if (DUEL.watch) return;
  for (let i = 0; i < n; i++) {
    const edge = !center && Math.random() < 0.75,
      side = Math.random() < 0.5;
    GORE.screen.push({
      x: edge ? (side ? rand(0, 0.3) : rand(0.7, 1)) : rand(0.25, 0.75),
      y: edge ? rand(0, 0.75) : rand(0.15, 0.6),
      r: rand(0.03, 0.09) * (center ? 0.7 : 1),
      life: 3.2 + Math.random() * 1.5,
      t: 0,
      drips: Array.from({ length: 1 + ((Math.random() * 3) | 0) }, () => ({
        o: rand(-0.7, 0.7),
        v: rand(0.02, 0.07),
        l: 0,
        w: rand(0.12, 0.3),
      })),
      blobs: Array.from({ length: 7 }, () => [rand(-0.55, 0.55), rand(-0.55, 0.55), rand(0.35, 0.7)]),
      dots: Array.from({ length: 14 }, () => {
        const a = Math.random() * 6.3,
          d = rand(1.1, 3.2);
        return [Math.cos(a) * d, Math.sin(a) * d, rand(0.05, 0.22)];
      }),
    });
  }
  if (GORE.screen.length > 18) GORE.screen.splice(0, GORE.screen.length - 18);
}
function goreScreenDraw(clear, dt = 0) {
  const c = $('dGore');
  if (!c) return;
  const S2 = GORE.screen;
  if (!S2.length && !GORE.screenDrew && !clear) return;
  const w = Math.round(W * 0.5),
    h = Math.round(H * 0.5);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const x = c.getContext('2d');
  x.clearRect(0, 0, w, h);
  GORE.screenDrew = S2.length > 0;
  const u = Math.min(w, h);
  for (let i = S2.length - 1; i >= 0; i--) {
    const s = S2[i];
    s.t += dt;
    if (s.t > s.life) {
      S2.splice(i, 1);
      continue;
    }
    const a = Math.min(1, s.t * 12) * Math.min(1, (s.life - s.t) / 1.4),
      cx = s.x * w,
      cy = s.y * h,
      r = s.r * u;
    x.globalAlpha = a * 0.88;
    x.fillStyle = '#620404';
    for (const [dx, dy, br] of s.blobs) {
      x.beginPath();
      x.arc(cx + dx * r, cy + dy * r, br * r, 0, Math.PI * 2);
      x.fill();
    }
    for (const [dx, dy, dr] of s.dots) {
      x.beginPath();
      x.arc(cx + dx * r, cy + dy * r, dr * r, 0, Math.PI * 2);
      x.fill();
    }
    // drips running down the glass
    x.fillStyle = '#5a0303';
    for (const d of s.drips) {
      d.l = Math.min(0.45, d.l + d.v * dt);
      const dx = cx + d.o * r,
        dw = d.w * r,
        dl = d.l * h;
      x.fillRect(dx - dw / 2, cy, dw, dl);
      x.beginPath();
      x.arc(dx, cy + dl, dw * 0.75, 0, Math.PI * 2);
      x.fill();
    }
  }
  x.globalAlpha = 1;
}
