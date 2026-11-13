'use strict';
/* Sword duel — one fighter: the model (assets/models/duelist.glb), the sword, animations and the rules of each move.
   The same class drives the local player, the training bot and (later) the online opponent. */
const DUEL_URL = MODEL_DIR + 'duelist.glb';
/** Move timings (seconds), damage, stamina costs. Light beats heavy (it lands first), block beats light,
    heavy breaks a block, and a block raised just in time (the first DM.parry seconds) is a parry that staggers. */
const DM = {
  light: { t: 0.56, hitFrom: 0.2, hitTo: 0.32, dmg: 10, st: 14, reach: 2.25, arc: 1.1 },
  heavy: { t: 1.1, hitFrom: 0.62, hitTo: 0.78, dmg: 26, st: 28, reach: 2.45, arc: 1.25 },
  dodge: { t: 0.5, iFrom: 0.04, iTo: 0.38, st: 22, spd: 5.4 },
  parry: 0.2,
  blockCost: 12,
  hp: 100,
  stMax: 100,
  stRegen: 32,
  stDelay: 0.7,
  walk: 2.6,
  back: 2.0,
  blockWalk: 1.2,
  arena: 8.5,
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
    this.sword = duelSword();
    if (this.hand) {
      this.hand.add(this.sword);
      duelGrip(this.hand, this.sword);
    }
    this.want = { mx: 0, mz: 0, block: false };
    this.reset(0, 0, 0);
  }
  reset(x, z, face) {
    Object.assign(this, { x, z, face, hp: DM.hp, st: DM.stMax, stT: 0, act: 'idle', t: 0, stun: 0, hitDone: false });
    Object.assign(this, { combo: 0, comboT: 0, kx: 0, kz: 0, dx: 0, dz: 0, blockT: 0, moving: 0 });
    this.want.mx = this.want.mz = 0;
    this.want.block = false;
    this.cur = null;
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
  light() {
    if (!this.free || this.st < DM.light.st * 0.5) return false;
    this.spend(DM.light.st);
    this.start('light');
    if (this.comboT <= 0) this.combo = 0;
    this.play(['atk1', 'atk2', 'atk3'][this.combo++ % 3], 0.08, DM.light.t * 1.15, true);
    DS.light(this);
    return true;
  }
  heavy() {
    if (!this.free || this.st < DM.heavy.st * 0.5) return false;
    this.spend(DM.heavy.st);
    this.start('heavy');
    this.play('heavy', 0.1, DM.heavy.t * 1.6, true);
    DS.heavy(this);
    return true;
  }
  /** Roll: (lx, lz) = direction in the fighter's own frame (x right, z forward); none = backwards. */
  dodge(lx, lz) {
    if (!this.free || this.st < DM.dodge.st * 0.5) return false;
    if (!lx && !lz) lz = -1;
    const L = Math.hypot(lx, lz) || 1,
      f = this.face,
      fx = Math.sin(f),
      fz = Math.cos(f);
    this.dx = (fx * lz - fz * lx) / L;
    this.dz = (fz * lz + fx * lx) / L;
    this.spend(DM.dodge.st);
    this.start('dodge');
    this.play('roll', 0.06, DM.dodge.t, true);
    DS.dodge();
    return true;
  }
  /** Took a hit (kind: light | heavy | chip). */
  damage(v, from, kind) {
    this.hp = Math.max(0, this.hp - v);
    const ax = this.x - from.x,
      az = this.z - from.z,
      L = Math.hypot(ax, az) || 1,
      kb = kind === 'heavy' ? 7 : 3;
    this.kx = (ax / L) * kb;
    this.kz = (az / L) * kb;
    if (this.hp <= 0) {
      this.start('dead');
      this.play('death', 0.1, 0, true);
      DS.death(this);
      return;
    }
    DS.hurt(this, kind === 'heavy');
    this.start(kind === 'heavy' ? 'knock' : 'hit');
    this.stun = kind === 'heavy' ? 0.75 : 0.4;
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
    const turn =
      this.act === 'light' ? 3 : this.act === 'heavy' ? 1.8 : this.act === 'dodge' || this.act === 'dead' ? 0 : 10;
    this.face += clamp(wrapAng(Math.atan2(foe.x - this.x, foe.z - this.z) - this.face), -turn * dt, turn * dt);
    const fx = Math.sin(this.face),
      fz = Math.cos(this.face);
    let vx = 0,
      vz = 0;
    // block: hold to raise, release to lower
    if (this.want.block && this.act === 'idle') {
      this.start('block');
      this.blockT = this.preBlock || 0; // the bot can raise its guard 'early' (a plain block, not a parry)
      this.preBlock = 0;
      this.play('block', 0.06, 0, true);
    } else if (!this.want.block && this.act === 'block') this.start('idle');
    if (this.act === 'block') this.blockT += dt;
    if (this.free) {
      let mx = this.want.mx,
        mz = this.want.mz;
      const m = Math.hypot(mx, mz);
      if (m > 1) {
        mx /= m;
        mz /= m;
      }
      const sp = this.act === 'block' ? DM.blockWalk : mz < -0.1 ? DM.back : DM.walk;
      vx = (fx * mz - fz * mx) * sp;
      vz = (fz * mz + fx * mx) * sp;
      this.moving = Math.min(1, m) * (mz < -0.1 ? -1 : 1);
      if (this.act === 'idle') {
        if (m > 0.15) this.play('walk', 0.15, 0);
        else this.play('idle', 0.2, 0);
        if (m > 0.15) this.cur.timeScale = (mz < -0.1 ? -1 : 1) * clamp(m, 0.5, 1) * 1.1;
      }
    } else this.moving = 0;
    if (this.act === 'dodge' && this.t < DM.dodge.t * 0.85) {
      vx = this.dx * DM.dodge.spd;
      vz = this.dz * DM.dodge.spd;
    }
    // swings: sword glows while a heavy winds up; land the blow inside the hit window
    const M = DM[this.act];
    this.sword.userData.steel.emissive.setRGB(
      this.act === 'heavy' && this.t < DM.heavy.hitTo ? Math.min(1, this.t / DM.heavy.hitFrom) * 0.9 : 0,
      this.act === 'heavy' && this.t < DM.heavy.hitTo ? Math.min(1, this.t / DM.heavy.hitFrom) * 0.18 : 0,
      0
    );
    if ((this.act === 'light' || this.act === 'heavy') && !this.hitDone && this.t >= M.hitFrom && this.t <= M.hitTo) {
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
    if ((this.act === 'hit' || this.act === 'knock' || this.act === 'stagger') && this.t >= this.stun)
      this.start('idle');
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
    this.mixer.update(dt);
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.face;
  }
}
/** What happens when attacker `a` lands a swing of `kind` on defender `d`. Returns the outcome name. */
function duelResolve(a, d, kind) {
  const M = DM[kind];
  if (d.act === 'dead') return 'none';
  if (d.act === 'dodge' && d.t > DM.dodge.iFrom && d.t < DM.dodge.iTo) return 'miss';
  if (d.act === 'block' && Math.abs(wrapAng(Math.atan2(a.x - d.x, a.z - d.z) - d.face)) < 1.4) {
    if (d.blockT < DM.parry) {
      a.stagger(kind === 'heavy' ? 1.1 : 0.9);
      d.st = Math.min(DM.stMax, d.st + 15);
      DS.parry();
      return 'parry';
    }
    if (kind === 'heavy' || d.st < DM.blockCost) {
      d.stagger(0.8);
      d.damage(M.dmg * 0.3, a, 'chip');
      if (d.act !== 'dead') d.stagger(0.8);
      DS.breakGuard();
      return 'break';
    }
    d.spend(DM.blockCost);
    a.kx -= Math.sin(a.face) * 2.5;
    a.kz -= Math.cos(a.face) * 2.5;
    DS.block();
    return 'block';
  }
  d.damage(M.dmg, a, kind);
  return 'hit';
}
