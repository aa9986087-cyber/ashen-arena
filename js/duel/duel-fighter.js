'use strict';
/* Sword duel — one fighter: the model (assets/models/duelist.glb), the sword, animations and the rules of each move.
   The same class drives the local player, the training bot and (later) the online opponent. */
const DUEL_URL = MODEL_DIR + 'duelist.glb';
/** Move timings (seconds), damage, stamina costs. Light beats heavy (it lands first), block beats light,
    heavy breaks a block, and a block raised just in time (the first DM.parry seconds) is a parry that staggers. */
const DM = {
  light: { t: 0.56, hitFrom: 0.2, hitTo: 0.32, dmg: 10, st: 14, reach: 2.25, arc: 1.1 },
  heavy: { t: 1.1, hitFrom: 0.62, hitTo: 0.78, dmg: 26, st: 28, reach: 2.45, arc: 1.25 },
  kick: { t: 0.62, hitFrom: 0.2, hitTo: 0.34, dmg: 5, st: 18, reach: 1.95, arc: 0.9 },
  dodge: { t: 0.5, iFrom: 0.04, iTo: 0.38, st: 22, spd: 5.4 },
  parry: 0.2,
  execHp: 30, // a heavy blow on a reeling fighter at or below this health is an execution
  blockCost: 12,
  hp: 100,
  stMax: 100,
  stRegen: 32,
  stDelay: 0.7,
  walk: 2.6,
  jog: 3.8, // stick pushed well forward: a jog, free of stamina
  run: 5.3, // sprint (stick pushed all the way forward / C): drains stamina
  runCost: 14,
  back: 2.0,
  blockWalk: 1.2,
  arena: 10,
};
let duelBuf = null; // the glb bytes: fetched once, parsed once per fighter (so each has its own skeleton and materials)
async function duelLoad() {
  if (!duelBuf) {
    const r = await fetch(DUEL_URL + '?v=' + MODEL_VER);
    if (!r.ok) throw new Error('duelist ' + r.status);
    duelBuf = await r.arrayBuffer();
  }
  return new Promise((ok, no) => new THREE.GLTFLoader().parse(duelBuf.slice(0), '', ok, no));
}
/** A one-handed sword: diamond blade, gilded guard and pommel, leather grip (origin = the grip, blade along +Y). */
function duelSword() {
  const g = new THREE.Group(),
    steel = new THREE.MeshStandardMaterial({ color: 0xdfe5ec, metalness: 0.75, roughness: 0.28 }),
    gold = new THREE.MeshStandardMaterial({ color: 0xb8913e, metalness: 0.7, roughness: 0.35 }),
    leather = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.9 });
  const sh = new THREE.Shape();
  sh.moveTo(-0.028, 0);
  sh.lineTo(0.028, 0);
  sh.lineTo(0.021, 0.84);
  sh.lineTo(0, 0.97);
  sh.lineTo(-0.021, 0.84);
  sh.closePath();
  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(sh, {
      depth: 0.006,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.004,
      bevelSegments: 1,
    }),
    steel
  );
  blade.position.set(0, 0.125, -0.003);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.03, 0.045), gold);
  guard.position.y = 0.115;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.022, 0.2, 8), leather);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), gold);
  pommel.position.y = -0.11;
  g.add(blade, guard, grip, pommel);
  g.traverse(o => o.isMesh && (o.castShadow = true));
  g.userData.steel = steel;
  return g;
}
/** Copy of an outfit texture with its green cloth moved to hue `hue` (degrees); leather, metal and skin untouched.
    One canvas per (image, hue), shared by every mesh using that atlas. */
const duelTexCache = new Map();
function duelRecolor(tex, hue) {
  const img = tex.image,
    key = hue + ':' + tex.uuid;
  if (!img || !img.width) return tex;
  if (duelTexCache.has(key)) return duelTexCache.get(key);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height),
    p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i] / 255,
      g = p[i + 1] / 255,
      b = p[i + 2] / 255,
      mx = Math.max(r, g, b),
      mn = Math.min(r, g, b),
      dl = mx - mn;
    if (dl < 0.08 || mx !== g) continue; // only clearly green pixels
    let h = 60 * ((b - r) / dl + 2);
    if (h < 70 || h > 175) continue;
    const s = dl / mx,
      v = mx,
      H = (((hue % 360) + 360) % 360) / 60,
      k = Math.floor(H),
      f = H - k,
      P = v * (1 - s),
      Q = v * (1 - s * f),
      T = v * (1 - s * (1 - f)),
      rgb = [
        [v, T, P],
        [Q, v, P],
        [P, v, T],
        [P, Q, v],
        [T, P, v],
        [v, P, Q],
      ][k % 6];
    p[i] = rgb[0] * 255;
    p[i + 1] = rgb[1] * 255;
    p[i + 2] = rgb[2] * 255;
  }
  x.putImageData(d, 0, 0);
  const t = tex.clone();
  t.image = c;
  t.needsUpdate = true;
  duelTexCache.set(key, t);
  return t;
}
/** Seat the sword in the fist, from the hand's own finger joints: the grip sits in front of the palm (thumb side),
    the blade leaves the fist on the index-finger side (pinky → index), its edge leading along the fingers. */
function duelGrip(hand, sword) {
  const j = n => (hand.children.find(c => c.name === n) || {}).position;
  const I = j('index_01_r'),
    P = j('pinky_01_r'),
    T = j('thumb_01_r');
  if (!I || !P || !T) return;
  const across = I.clone().sub(P).normalize(), // blade axis
    fingers = I.clone().add(P).multiplyScalar(0.5),
    fwd = fingers.clone().normalize(),
    palm = new THREE.Vector3().crossVectors(fwd, across).normalize();
  if (palm.dot(T) < 0) palm.negate(); // the palm faces the thumb's side
  const edge = new THREE.Vector3().crossVectors(across, palm).normalize();
  sword.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(edge, across, palm));
  // in the curl of the fingers: a little short of the knuckles, a little in front of the palm
  sword.position.copy(fingers.multiplyScalar(0.72)).add(palm.multiplyScalar(0.03));
}
const gKq = new THREE.Quaternion(),
  gKx = new THREE.Vector3(1, 0, 0),
  gKz = new THREE.Vector3(0, 0, 1);
class Duelist {
  /** gltf: a freshly parsed duelist.glb; tint: hue (degrees) for the cloth, so the two fighters are told apart. */
  constructor(gltf, tint, pitch = 110) {
    this.pitch = pitch; // voice pitch (Hz) of this fighter's grunts
    this.root = gltf.scene;
    this.mixer = new THREE.AnimationMixer(this.root);
    this.acts = {};
    for (const a of gltf.animations) this.acts[a.name] = this.mixer.clipAction(a);
    this.headMeshes = []; // head, hood, hair: hidden in first person
    this.fpHide = []; // everything but the arms: hidden in first person (you see your arms and sword)
    this.root.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        if (/Hood|SuperHero|Hair|Beard|Eyebrow|Eyes|Plane/i.test(o.name) || /hair|beard/i.test(o.material.name))
          this.headMeshes.push(o);
        if (!/Arms/i.test(o.name)) this.fpHide.push(o);
        if (tint !== undefined && /Ranger/i.test(o.name) && o.material.map)
          o.material.map = duelRecolor(o.material.map, tint);
      }
      if (o.isBone && o.name === 'hand_r' && !this.hand) this.hand = o;
      if (o.isBone && o.name === 'Head' && !this.headBone) this.headBone = o;
    });
    // the kick bends these bones by hand; idle clips may not animate them, so their rest pose is kept to restore
    const kb = {};
    this.root.traverse(o => o.isBone && (kb[o.name] = o));
    this.kickBones = [kb.thigh_r, kb.calf_r, kb.spine_01];
    this.kickRest = this.kickBones.map(b => b && b.quaternion.clone());
    this.setWeapon('sword');
    this.want = { mx: 0, mz: 0, block: false };
    this.reset(0, 0, 0);
  }
  /** Take up weapon `id` (duel-weapons.js): its mesh in the hand, its moves. */
  setWeapon(id) {
    const W = DUEL_WEAPONS[id] || DUEL_WEAPONS.sword;
    if (this.wp === W && this.sword) return;
    const shown = !this.sword || this.sword.visible;
    if (this.sword && this.sword.parent) this.sword.parent.remove(this.sword);
    this.wp = W;
    this.wpId = DUEL_WEAPONS[id] ? id : 'sword';
    this.sword = W.build();
    this.sword.traverse(o => o.isMesh && (o.castShadow = true));
    if (!this.sword.userData.steel)
      this.sword.traverse(o => o.isMesh && o.material.metalness > 0.5 && (this.sword.userData.steel = o.material));
    this.sword.userData.hit = W.hit;
    this.sword.visible = shown;
    if (this.hand) {
      this.hand.add(this.sword);
      duelGrip(this.hand, this.sword);
    }
    this.M = duelMoves(W);
    if (typeof goreBlade === 'function') goreBlade(this);
  }
  reset(x, z, face) {
    Object.assign(this, { nx: x, nz: z, nf: face, nmx: 0, nmz: 0 });
    Object.assign(this, { x, z, face, hp: DM.hp, st: DM.stMax, stT: 0, act: 'idle', t: 0, stun: 0, hitDone: false });
    Object.assign(this, { combo: 0, comboT: 0, kx: 0, kz: 0, dx: 0, dz: 0, blockT: 0, moving: 0 });
    this.want.mx = this.want.mz = 0;
    this.want.block = false;
    // stop every clip (a finished death clip stays clamped at full weight and would blend into the new round's pose)
    this.mixer.stopAllAction();
    this.cur = null;
    goreReset(this); // stumps heal between rounds
    this.kcSeen = false;
    this.play('idle', 0);
  }
  /** Cross-fade to an animation; `dur` stretches the clip to last that many seconds. */
  play(name, fade = 0.12, dur = 0, once = false) {
    const a = this.acts[name];
    if (!a) return;
    const speed = dur ? a.getClip().duration / dur : 1;
    if (this.cur === a && !once) {
      a.timeScale = speed;
      return;
    }
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.timeScale = speed;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.cur && this.cur !== a && fade) a.crossFadeFrom(this.cur, fade, false);
    else if (this.cur && this.cur !== a) this.cur.stop();
    a.play();
    this.cur = a;
  }
  get free() {
    return this.act === 'idle' || this.act === 'block';
  }
  spend(c) {
    this.st = Math.max(0, this.st - c);
    this.stT = DM.stDelay;
  }
  start(act) {
    this.act = act;
    this.t = 0;
    this.hitDone = false;
  }
  /** The sword fell with the sword arm: no swings, no guard. */
  get armless() {
    return !!(this.cuts & 4);
  }
  /** A swing thrown out of a sprint carries the run into it: a lunge forward. */
  lunge() {
    if (!this.running) return;
    this.running = false;
    this.kx += Math.sin(this.face) * 5;
    this.kz += Math.cos(this.face) * 5;
  }
  light() {
    if (this.armless || !this.free || this.st < this.M.light.st * 0.5) return false;
    this.lunge();
    this.spend(this.M.light.st);
    this.start('light');
    if (this.comboT <= 0) this.combo = 0;
    this.play(['atk1', 'atk2', 'atk3'][this.combo++ % 3], 0.08, this.M.light.t * 1.15, true);
    DS.light(this);
    this.onMove && this.onMove({ k: 'light', c: this.combo });
    return true;
  }
  /** A front kick: short and weak, but it breaks a raised guard (and a heavy blow still rising) and shoves. */
  kick() {
    if (!this.free || this.st < DM.kick.st * 0.5) return false;
    this.spend(DM.kick.st);
    this.start('kick');
    this.play('idle', 0.1);
    DS.dodge();
    this.onMove && this.onMove({ k: 'kick' });
    return true;
  }
  /** The kick has no clip in the model: bend the right leg on top of whatever plays.
      Chamber (knee up, bent), snap it straight forward, hold, put it down. */
  kickPose() {
    const [th, ca, sp] = this.kickBones;
    // a runner leans into the stride (only without the sprint clip: that one leans by itself)
    if (sp && this.lean > 0.01 && !this.acts.run) {
      gKq.setFromAxisAngle(gKx, -0.42 * this.lean);
      sp.quaternion.multiply(gKq);
      this.kickDirty = true;
    }
    if (this.act !== 'kick') return;
    if (!th || !ca) return;
    this.kickDirty = true;
    const t = this.t,
      ease = v => v * v * (3 - 2 * v);
    let lift, bend;
    if (t < 0.16) {
      const k = ease(t / 0.16);
      lift = 1.55 * k;
      bend = 1.5 * k;
    } else if (t < 0.28) {
      const k = ease((t - 0.16) / 0.12);
      lift = 1.55 + 0.45 * k;
      bend = 1.5 - 1.6 * k;
    } else if (t < 0.4) {
      lift = 2.0;
      bend = -0.1;
    } else {
      const k = 1 - ease(Math.min(1, (t - 0.4) / 0.22));
      lift = 2.0 * k;
      bend = -0.1 * k;
    }
    gKq.setFromAxisAngle(gKx, -lift);
    th.quaternion.multiply(gKq);
    gKq.setFromAxisAngle(gKz, -0.25 * lift);
    th.quaternion.multiply(gKq);
    gKq.setFromAxisAngle(gKz, bend);
    ca.quaternion.multiply(gKq);
    if (sp) {
      // lean back a little to balance the leg
      gKq.setFromAxisAngle(gKx, 0.14 * lift);
      sp.quaternion.multiply(gKq);
    }
  }
  /** Put the kicking leg back to rest before the clips write this frame (they may not touch these bones). */
  kickReset() {
    if (!this.kickDirty) return;
    this.kickDirty = false;
    this.kickBones.forEach((b, i) => b && b.quaternion.copy(this.kickRest[i]));
  }
  heavy() {
    if (this.armless || !this.free || this.st < this.M.heavy.st * 0.5) return false;
    this.lunge();
    this.spend(this.M.heavy.st);
    this.start('heavy');
    this.play('heavy', 0.1, this.M.heavy.t * 1.6, true);
    DS.heavy(this);
    this.onMove && this.onMove({ k: 'heavy' });
    return true;
  }
  /** Pull a heavy swing back before it falls (a feint): costs stamina, leaves the opponent guessing. */
  feint(net) {
    if (this.act !== 'heavy' || this.t > this.M.heavy.hitFrom - 0.08) return false;
    if (!net) this.spend(10);
    this.start('idle');
    this.play('idle', 0.14);
    this.sword.userData.steel.emissive.setRGB(0, 0, 0);
    DS.dodge();
    if (!net) this.onMove && this.onMove({ k: 'feint' });
    return true;
  }
  /** Roll: (lx, lz) = direction in the fighter's own frame (x right, z forward); none = backwards. */
  dodge(lx, lz, wx, wz) {
    if (!this.free || this.st < DM.dodge.st * 0.5) return false;
    if (!lx && !lz) lz = -1;
    const L = Math.hypot(lx, lz) || 1,
      f = this.face,
      fx = Math.sin(f),
      fz = Math.cos(f);
    this.dx = wx !== undefined ? wx : (fx * lz - fz * lx) / L;
    this.dz = wz !== undefined ? wz : (fz * lz + fx * lx) / L;
    this.spend(DM.dodge.st);
    this.start('dodge');
    this.play('roll', 0.06, DM.dodge.t, true);
    DS.dodge();
    this.onMove && this.onMove({ k: 'dodge', dx: +this.dx.toFixed(3), dz: +this.dz.toFixed(3) });
    return true;
  }
  /** Online, on the opponent's copy: start the move its owner just started (no stamina checks — the owner did them). */
  netMove(m) {
    if (m.k === 'feint') return this.feint(true);
    if (m.k === 'kick') {
      this.st = DM.stMax;
      if (!this.free) this.start('idle');
      return this.kick();
    }
    this.st = DM.stMax;
    if (!this.free) this.start('idle');
    if (m.k === 'light') {
      this.combo = Math.max(0, (m.c | 0) - 1);
      this.comboT = 1;
      this.light();
    } else if (m.k === 'heavy') this.heavy();
    else if (m.k === 'dodge') this.dodge(0, -1, m.dx, m.dz);
  }
  /** Online, on the opponent's copy: the owner's broadcast state (position, health, stamina, guard, reactions). */
  netState(s) {
    if (s.w && s.w !== this.wpId) this.setWeapon(s.w); // the weapon its owner holds
    if (DUEL.fin || DUEL.intro) return; // a finisher or the walk-out is playing: it moves both fighters itself
    // limbs its owner lost (the owner decides, everyone else copies)
    if (s.cu & ~this.cuts) for (const k in GORE_PARTS) if (s.cu & GORE_PARTS[k].bit) goreCut(this, k);
    this.nx = s.x;
    this.nz = s.z;
    this.nf = s.f;
    this.nmx = s.mx;
    this.nmz = s.mz;
    this.running = !!s.rn;
    this.hp = s.hp;
    this.st = s.st;
    this.want.block = s.a === 'block';
    if (s.a === this.act) return;
    const other = this === DUEL.me ? DUEL.foe : DUEL.me;
    if (s.a === 'hit' || s.a === 'knock') goreHit(this, other, s.a === 'hit' ? 'light' : 'heavy');
    if (s.a === 'dead') {
      if (!duelFinisher(this, other, s.fv)) {
        this.start('dead');
        this.play('death', 0.1, 0, true);
        DS.death(this);
      }
    } else if (s.a === 'kicked') {
      this.start('kicked');
      this.stun = 0.55;
      this.play('hit', 0.05, this.stun * 1.4, true);
      DS.kick(this);
    } else if (s.a === 'hit' || s.a === 'knock') {
      this.start(s.a);
      this.stun = s.a === 'knock' ? 0.75 : 0.4;
      this.play(s.a, 0.05, this.stun * 1.4, true);
      DS.hurt(this, s.a === 'knock');
    } else if (s.a === 'stagger') this.stagger(0.9);
    else if (
      s.a === 'idle' &&
      (this.act === 'hit' ||
        this.act === 'knock' ||
        this.act === 'kicked' ||
        this.act === 'stagger' ||
        this.act === 'dead')
    )
      this.start('idle');
  }
  /** Took a hit (kind: light | heavy | chip). */
  damage(v, from, kind) {
    this.hp = Math.max(0, this.hp - v);
    if (this.hp <= 0) duelLethalGate(this); // may hold him at 1 (a dead man's blow, or the host must agree first)
    const ax = this.x - from.x,
      az = this.z - from.z,
      L = Math.hypot(ax, az) || 1,
      W = (from && from.wp) || DUEL_WEAPONS.sword,
      kb = (kind === 'heavy' ? 7 : kind === 'kick' ? 9 : 3) * (kind === 'kick' ? 1 : W.kb);
    this.kx = (ax / L) * kb;
    this.kz = (az / L) * kb;
    // the killing blow: a staged finisher plays it out (the wound comes when its blade gets there)
    if (this.hp <= 0 && typeof duelFinisher === 'function' && duelFinisher(this, from, finPick(this, this.execute))) {
      this.execute = false;
      return;
    }
    if (kind === 'kick') {
      // a boot, not a blade: no blood, no limbs; a stumble back
      if (this.hp <= 0) {
        this.start('dead');
        this.play('death', 0.1, 0, true);
        DS.death(this);
        return;
      }
      DS.kick(this);
      this.start('kicked'); // its own state: the other side mustn't draw blood for it
      this.stun = 0.55;
      this.play('hit', 0.05, this.stun * 1.4, true);
      return;
    }
    goreHit(this, from, kind);
    const cut = this.execute && !(this.cuts & 1) && W.cut ? 'head' : goreDecide(this, kind, from);
    this.execute = false;
    if (cut) goreCut(this, cut, from);
    if (this.hp <= 0) {
      this.start('dead');
      this.play('death', 0.1, 0, true);
      DS.death(this);
      return;
    }
    DS.hurt(this, kind === 'heavy', from);
    this.start(kind === 'heavy' ? 'knock' : 'hit');
    this.stun = (kind === 'heavy' ? 0.75 : 0.4) * W.stun;
    this.play(kind === 'heavy' ? 'knock' : 'hit', 0.05, this.stun * 1.4, true);
  }
  stagger(dur) {
    this.start('stagger');
    this.stun = dur;
    this.play('stagger', 0.06, dur * 1.3, true);
  }
  update(dt, foe) {
    this.t += dt;
    this.comboT -= dt;
    if ((this.stT -= dt) <= 0)
      this.st = Math.min(DM.stMax, this.st + DM.stRegen * dt * (this.act === 'block' ? 0.5 : 1));
    // lock-on: always turn toward the opponent, slowly while swinging (side-steps can dodge a heavy)
    const toFoe = wrapAng(Math.atan2(foe.x - this.x, foe.z - this.z) - this.face);
    const turn = this.remote
      ? 0
      : this.freeLook
        ? // free movement: you turn yourself; a swing only bends a little toward a foe already in front of you
          (this.act === 'light' || this.act === 'heavy' || this.act === 'kick') &&
          Math.abs(toFoe) < 1.1 &&
          Math.hypot(foe.x - this.x, foe.z - this.z) < this.M.heavy.reach + 1.2
          ? 3.5
          : 0
        : this.act === 'light' || this.act === 'kick'
          ? 3
          : this.act === 'heavy'
            ? 1.8
            : this.act === 'dodge' || this.act === 'dead'
              ? 0
              : 10;
    this.face += clamp(toFoe, -turn * dt, turn * dt);
    const fx = Math.sin(this.face),
      fz = Math.cos(this.face);
    let vx = 0,
      vz = 0;
    // block: hold to raise, release to lower
    if (this.want.block && this.act === 'idle' && !this.armless) {
      this.start('block');
      this.blockT = this.preBlock || 0; // the bot can raise its guard 'early' (a plain block, not a parry)
      this.preBlock = 0;
      this.play('block', 0.06, 0, true);
    } else if (!this.want.block && this.act === 'block') this.start('idle');
    if (this.act === 'block') this.blockT += dt;
    if (this.free) {
      let mx = this.remote ? this.nmx || 0 : this.want.mx,
        mz = this.remote ? this.nmz || 0 : this.want.mz;
      const m = Math.hypot(mx, mz);
      if (m > 1) {
        mx /= m;
        mz /= m;
      }
      // sprint: only forward, only on your feet with breath left (the owner decides; a copy is told)
      if (!this.remote)
        this.running = !!this.want.run && this.act === 'idle' && mz > 0.5 && this.st > 2 && !this.armless;
      if (this.running && !this.remote) {
        this.st = Math.max(0, this.st - DM.runCost * dt);
        this.stT = DM.stDelay;
      }
      // between a walk and the sprint: a jog when the stick is pushed well forward
      this.jogging = !this.running && this.act === 'idle' && mz > 0.5 && m > 0.7 && !!this.acts.jog;
      const sp =
        (this.act === 'block'
          ? DM.blockWalk
          : this.running
            ? DM.run
            : this.jogging
              ? DM.jog
              : mz < -0.1
                ? DM.back
                : DM.walk) * (this.armless ? 0.65 : 1);
      vx = (fx * mz - fz * mx) * sp;
      vz = (fz * mz + fx * mx) * sp;
      this.moving = Math.min(1, m) * (mz < -0.1 ? -1 : 1);
      if (this.act === 'idle') {
        // a real sprint clip when running (Universal Animation Library), the walk otherwise
        const run = this.running && this.acts.run,
          jog = this.jogging;
        if (m > 0.15) this.play(run ? 'run' : jog ? 'jog' : 'walk', run || jog ? 0.2 : 0.15, 0);
        else this.play('idle', 0.2, 0);
        if (m > 0.15)
          this.cur.timeScale =
            run || jog ? 1.05 : (mz < -0.1 ? -1 : 1) * clamp(m, 0.5, 1) * (this.running ? 2.05 : 1.1);
      }
    } else {
      this.moving = 0;
      if (!this.remote) this.running = false;
    }
    // weight: speed builds up and bleeds off instead of snapping (a roll and knock-backs stay instant)
    if (this.act !== 'dodge') {
      const k = 1 - Math.exp(-(Math.hypot(vx, vz) > Math.hypot(this.vx || 0, this.vz || 0) ? 9 : 12) * dt);
      this.vx = (this.vx || 0) + (vx - (this.vx || 0)) * k;
      this.vz = (this.vz || 0) + (vz - (this.vz || 0)) * k;
      vx = this.vx;
      vz = this.vz;
    } else this.vx = this.vz = 0;
    this.lean = (this.lean || 0) + ((this.running ? 1 : 0) - (this.lean || 0)) * Math.min(1, dt * 7);
    if (this.act === 'dodge' && this.t < DM.dodge.t * 0.85) {
      vx = this.dx * DM.dodge.spd;
      vz = this.dz * DM.dodge.spd;
    }
    // swings: sword glows while a heavy winds up; land the blow inside the hit window
    const M = this.M[this.act] || DM[this.act];
    this.sword.userData.steel.emissive.setRGB(
      this.act === 'heavy' && this.t < this.M.heavy.hitTo ? Math.min(1, this.t / this.M.heavy.hitFrom) * 0.9 : 0,
      this.act === 'heavy' && this.t < this.M.heavy.hitTo ? Math.min(1, this.t / this.M.heavy.hitFrom) * 0.18 : 0,
      0
    );
    if (
      !foe.remote &&
      (this.act === 'light' || this.act === 'heavy' || this.act === 'kick') &&
      !this.hitDone &&
      this.t >= M.hitFrom &&
      this.t <= M.hitTo
    ) {
      const dx = foe.x - this.x,
        dz = foe.z - this.z;
      if (Math.hypot(dx, dz) < M.reach && Math.abs(wrapAng(Math.atan2(dx, dz) - this.face)) < M.arc) {
        this.hitDone = true;
        this.onHit && this.onHit(duelResolve(this, foe, this.act));
      }
    }
    // end of timed states
    if (M && this.t >= M.t) {
      if (this.act === 'light') this.comboT = 0.7;
      this.start('idle');
    }
    if (
      (this.act === 'hit' || this.act === 'knock' || this.act === 'kicked' || this.act === 'stagger') &&
      this.t >= this.stun
    )
      this.start('idle');
    if (this.remote) {
      // the opponent's copy glides to where its owner says it is
      const k = Math.min(1, dt * 14);
      if (this.nx !== undefined) {
        this.x += (this.nx - this.x) * k;
        this.z += (this.nz - this.z) * k;
        this.face += wrapAng(this.nf - this.face) * k;
      }
      this.kickReset();
      this.mixer.update(dt);
      this.kickPose();
      this.root.position.set(this.x, 0, this.z);
      this.root.rotation.y = this.face;
      return;
    }
    // move, knock-back, stay apart and inside the ring
    const kd = Math.max(0, 1 - 7 * dt);
    this.x += (vx + this.kx) * dt;
    this.z += (vz + this.kz) * dt;
    this.kx *= kd;
    this.kz *= kd;
    const sx = this.x - foe.x,
      sz = this.z - foe.z,
      sd = Math.hypot(sx, sz);
    if (sd < 0.8 && sd > 0.001) {
      this.x = foe.x + (sx / sd) * 0.8;
      this.z = foe.z + (sz / sd) * 0.8;
    }
    const r = Math.hypot(this.x, this.z);
    if (r > DM.arena) {
      this.x *= DM.arena / r;
      this.z *= DM.arena / r;
    }
    this.kickReset();
    this.mixer.update(dt);
    this.kickPose();
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.face;
  }
}
/** What happens when attacker `a` lands a swing of `kind` on defender `d`. Returns the outcome name. */
function duelResolve(a, d, kind) {
  const M = (a.M && a.M[kind]) || DM[kind],
    W = a.wp || DUEL_WEAPONS.sword;
  if (d.act === 'dead') return 'none';
  // a blow from a man already down, or after the round is decided, lands on nothing
  if (a.act === 'dead' || a.hp <= 0 || DUEL.fin || (DUEL.phase !== 'fight' && !DUEL.watch)) return 'none';
  if (d.act === 'dodge' && d.t > DM.dodge.iFrom && d.t < DM.dodge.iTo) return 'miss';
  if (kind === 'kick') {
    // the boot goes through a raised guard (and stops a heavy blow still rising): the defender reels open
    const ax = d.x - a.x,
      az = d.z - a.z,
      L = Math.hypot(ax, az) || 1;
    if (d.act === 'block' || (d.act === 'heavy' && d.t < d.M.heavy.hitFrom)) {
      d.stagger(0.95);
      d.kx = (ax / L) * 8;
      d.kz = (az / L) * 8;
      DS.breakGuard();
      return 'kickbreak';
    }
    d.damage(DM.kick.dmg, a, 'kick');
    return 'kick';
  }
  if (d.act === 'block' && Math.abs(wrapAng(Math.atan2(a.x - d.x, a.z - d.z) - d.face)) < 1.4) {
    if (d.blockT < DM.parry) {
      a.stagger(kind === 'heavy' ? 1.1 : 0.9);
      d.st = Math.min(DM.stMax, d.st + 15);
      DS.parry();
      return 'parry';
    }
    const cost = DM.blockCost * W.block; // a mace's blows wear a guard down twice as fast
    if (kind === 'heavy' || d.st < cost) {
      d.stagger(0.8);
      d.damage(M.dmg * 0.3, a, 'chip');
      if (d.act !== 'dead') d.stagger(0.8);
      DS.breakGuard();
      return 'break';
    }
    d.spend(cost);
    if (W.chip) {
      // an axe bites through a guard a little
      d.hp = Math.max(1, d.hp - M.dmg * W.chip);
      goreHit(d, a, 'chip');
    }
    a.kx -= Math.sin(a.face) * 2.5;
    a.kz -= Math.cos(a.face) * 2.5;
    DS.block();
    return 'block';
  }
  // a clean hit, and what made it special:
  //  - an execution: a heavy blow on a reeling or felled fighter low on health ends it, head first
  //  - a riposte: any blow on a fighter reeling (from your perfect parry or a broken guard) cuts 60% deeper
  //  - a combo: the third light blow of a chain cuts 40% deeper and drives the foe back
  const reeling = d.act === 'stagger' || d.act === 'knock' || d.act === 'hit' || d.act === 'kicked';
  let dmg = M.dmg,
    tag = 'hit';
  if (kind === 'heavy' && reeling && d.hp <= DM.execHp) {
    d.execute = true;
    dmg = d.hp;
    tag = 'exec';
  } else if (d.act === 'stagger') {
    dmg *= 1.6;
    tag = 'riposte';
  } else if (kind === 'light' && a.combo > 0 && a.combo % 3 === 0) {
    dmg *= 1.4;
    tag = 'combo';
  }
  d.damage(dmg, a, tag === 'combo' ? 'heavy' : kind);
  return tag;
}
/** Outcomes that drew blood. */
const DUEL_HITS = { hit: 1, riposte: 1, combo: 1, exec: 1 };
