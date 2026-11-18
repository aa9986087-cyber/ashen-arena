'use strict';

const FORGE_ATTACKS = new Set(['light', 'heavy', 'kick']);
const FORGE_ZONES = [
  ['head', 'neck_01', 'Head', .12, 1.27, 'Head'],
  ['body', 'spine_01', 'neck_01', .225, 1, 'spine_02'],
  ['body', 'pelvis', 'spine_01', .18, .85, 'pelvis'],
  ['armR', 'upperarm_r', 'lowerarm_r', .091, .83, 'upperarm_r'],
  ['armR', 'lowerarm_r', 'hand_r', .075, .76, 'lowerarm_r'],
  ['armL', 'upperarm_l', 'lowerarm_l', .091, .83, 'upperarm_l'],
  ['armL', 'lowerarm_l', 'hand_l', .075, .76, 'lowerarm_l'],
  ['legR', 'thigh_r', 'calf_r', .132, .83, 'thigh_r'],
  ['legR', 'calf_r', 'foot_r', .092, .77, 'calf_r'],
  ['legL', 'thigh_l', 'calf_l', .132, .83, 'thigh_l'],
  ['legL', 'calf_l', 'foot_l', .092, .77, 'calf_l'],
];
const FORGE_STEP = 1 / 120;
const forgeAxis = new THREE.Vector3();
const forgeLocal = new THREE.Quaternion();
const forgeWorld = new THREE.Quaternion();
const forgeTurn = new THREE.Quaternion();
const forgeRootAxis = new THREE.Vector3(0, 0, 1);

function forgeRig(f) {
  if (!f.forgeRig) {
    // Resolve once, after the loaded animation rig is available.
    f.forgeRig = FORGE_ZONES.flatMap(([key, from, to, radius, power, marker]) => {
      const a = goreBone(f, from), b = goreBone(f, to);
      if (!a || !b) return [];
      return [{ key, a, b, radius, power, bone: goreBone(f, marker) || b, cut: GORE_PARTS[key]?.bone === from ? GORE_PARTS[key].bit : 0, p: new THREE.Vector3(), q: new THREE.Vector3() }];
    });
  }
  return f.forgeRig;
}

function forgeBeginAction(f, act) {
  if (!FORGE_ATTACKS.has(act)) {
    f.forgeSweep = null;
    f.forgeGesture = null;
    return;
  }
  f.forgeAttack = (f.forgeAttack || 0) + 1;
  f.forgeDirection = f.forgeAim || 0;
  f.forgeAim = 0;
  f.forgeSweep = null;
}

// Each spring has a position and velocity. A heavier weapon accelerates and recovers more slowly.
function forgeDrive(state, targets, mass, dt) {
  state.clock = Math.min(state.clock + dt, .05);
  while (state.clock >= FORGE_STEP) {
    state.clock -= FORGE_STEP;
    for (let i = 0; i < targets.length; i++) {
      state.speed[i] += (175 * (targets[i] - state.pose[i]) - 19 * state.speed[i]) * FORGE_STEP / mass;
      state.pose[i] += state.speed[i] * FORGE_STEP;
    }
  }
}

function forgeTurnBone(bone, child, target) {
  const from = bone.getWorldPosition(new THREE.Vector3());
  const actual = child.getWorldPosition(new THREE.Vector3()).sub(from).normalize();
  const desired = target.clone().sub(from).normalize();
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  world.premultiply(new THREE.Quaternion().setFromUnitVectors(actual, desired));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
  bone.updateWorldMatrix(true, true);
}

// Preserve both segment lengths and direct the elbow outward to avoid flipping as the wrist crosses the chest.
function forgeArm(hand, target, pole) {
  const elbow = hand.parent, shoulder = elbow.parent;
  const pivot = shoulder.getWorldPosition(new THREE.Vector3());
  const upper = pivot.distanceTo(elbow.getWorldPosition(new THREE.Vector3()));
  const lower = elbow.getWorldPosition(new THREE.Vector3()).distanceTo(hand.getWorldPosition(new THREE.Vector3()));
  const dir = target.clone().sub(pivot);
  const len = clamp(dir.length(), Math.abs(upper - lower) + .014, upper + lower - .012);
  dir.normalize();
  const mid = (upper * upper - lower * lower + len * len) / (2 * len);
  const bend = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const joint = pivot.clone().addScaledVector(dir, mid).addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - mid * mid)));
  forgeTurnBone(shoulder, elbow, joint);
  forgeTurnBone(elbow, hand, pivot.addScaledVector(dir, len));
}

function forgeManual(f) {
  return f.act === 'light' && !!f.forgeGesture;
}

function forgeWeaponPose(f, dt) {
  if (!f.hand || f.armless || !f.sword?.visible) return;
  const guard = f.act === 'block';
  if (f.act !== 'light' && f.act !== 'heavy' && !guard) {
    f.forgeMotion = null;
    return;
  }
  if (!f.forgeGrip || f.forgeGripSword !== f.sword) {
    f.forgeGripSword = f.sword;
    f.forgeGrip = f.sword.quaternion.clone().invert();
  }
  const M = f.M[f.act] || f.M.light, heavy = f.act === 'heavy', thrust = f.wp.thrust;
  const gesture = f.forgeGesture;
  const sign = f.forgeDirection || (!heavy && f.combo % 2 === 0 ? -1 : 1);
  const ramp = clamp((f.t - M.hitFrom + .11) / (M.hitTo - M.hitFrom + .04), 0, 1);
  const sweep = 1 - 2 * ramp;
  const yaw = guard ? -.88 : gesture ? gesture.x * 1.95 : thrust ? sign * sweep * .28 : sign * sweep * (heavy ? .91 : 1.30);
  const pitch = guard ? .68 : gesture ? gesture.y * 1.12 + .08 : thrust ? .15 : heavy ? .98 - 1.33 * ramp : .36 - .58 * ramp;
  const forward = guard ? .40 : gesture ? .54 + .08 * (1 - Math.abs(gesture.x)) : thrust ? .36 + .31 * Math.sin(ramp * Math.PI) : .46 + .15 * Math.sin(ramp * Math.PI);
  const state = f.forgeMotion || (f.forgeMotion = { pose: [sign * (thrust ? .22 : .94), heavy ? .75 : .28, .45],
    speed: [0, 0, 0], clock: 0, recoil: 0 });
  state.recoil = Math.max(0, state.recoil - dt);
  const stopped = state.recoil > 0;
  forgeDrive(state, stopped ? [state.pose[0], state.pose[1], .30] : [yaw, pitch, forward], f.wp.mass * (1 + forgePenalty(f, 'armR') * .9), dt);
  const [angle, rise, extension] = state.pose;
  const spine = goreBone(f, 'spine_01');
  if (spine) {
    const twist = clamp(angle * .115 + state.speed[0] * .014, -.24, .24);
    const lean = clamp((extension - .43) * .6 - (stopped ? .1 : 0), -.12, .16);
    spine.quaternion.multiply(forgeTurn.setFromEuler(new THREE.Euler(lean, twist, 0)));
  }
  const side = new THREE.Vector3(Math.cos(f.face), 0, -Math.sin(f.face));
  const front = new THREE.Vector3(Math.sin(f.face), 0, Math.cos(f.face));
  const origin = f.root.getWorldPosition(new THREE.Vector3());
  const right = f.hand.parent.parent.getWorldPosition(new THREE.Vector3()).sub(origin).dot(side) > 0 ? 1 : -1;
  const wrist = origin.clone().addScaledVector(front, extension).addScaledVector(side, right * .20 + Math.sin(angle) * .39);
  wrist.y += 1.27 + Math.sin(rise) * .34;
  const pole = side.clone().multiplyScalar(right).add(new THREE.Vector3(0, -.78, 0));
  forgeArm(f.hand, wrist, pole);
  const actual = f.hand.getWorldPosition(new THREE.Vector3());
  const low = Math.asin(clamp((.07 - actual.y) / Math.max(.1, f.wp.hit[1]), -.99, 0));
  const altitude = clamp(rise, low, 1.33);
  forgeAxis.set(Math.sin(f.face + angle) * Math.cos(altitude), Math.sin(altitude), Math.cos(f.face + angle) * Math.cos(altitude));
  const edge = new THREE.Vector3(forgeAxis.z, 0, -forgeAxis.x).normalize();
  const flat = edge.clone().cross(forgeAxis);
  forgeWorld.setFromRotationMatrix(new THREE.Matrix4().makeBasis(edge, forgeAxis, flat));
  f.hand.parent.getWorldQuaternion(forgeLocal).invert();
  f.hand.quaternion.copy(forgeLocal.multiply(forgeWorld).multiply(f.forgeGrip));

  if ((heavy || thrust) && !(f.cuts & GORE_PARTS.armL.bit) && forgePenalty(f, 'armL') < .6) {
    const support = goreBone(f, 'hand_l');
    if (support) {
      const handle = f.sword.getWorldPosition(new THREE.Vector3()).addScaledVector(forgeAxis, -.12);
      const shoulder = f.hand.parent.parent;
      if (handle.distanceTo(support.parent.parent.getWorldPosition(new THREE.Vector3())) <
          shoulder.position.length() + support.parent.position.length() + support.position.length() + .12)
        forgeArm(support, handle, pole.clone().negate().add(new THREE.Vector3(0, -1.1, 0)));
    }
  }
}

function forgeRecoil(f, strength) {
  const motion = f.forgeMotion;
  if (!motion) return;
  motion.recoil = .11 + strength * .06;
  motion.speed = motion.speed.map(speed => -speed * strength);
}

function forgeFootwork(f, vx, vz, dt) {
  if (f.remote || f.act === 'dodge') return [vx, vz];
  const mass = f.wp?.mass || 1;
  const accelerating = Math.hypot(vx, vz) > Math.hypot(f.vx || 0, f.vz || 0);
  const rate = (accelerating ? 8.1 : 12.8) / mass;
  const injury = Math.max(forgePenalty(f, 'legL'), forgePenalty(f, 'legR'));
  const grip = 1 - Math.exp(-rate * dt);
  vx *= 1 - injury * .43;
  vz *= 1 - injury * .43;
  f.vx = (f.vx || 0) + (vx - (f.vx || 0)) * grip;
  f.vz = (f.vz || 0) + (vz - (f.vz || 0)) * grip;
  if (f.act === 'heavy' && f.t >= f.M.heavy.hitFrom && f.t <= f.M.heavy.hitTo && Math.hypot(f.vx, f.vz) > .25) {
    // An attack commits the feet in one direction, followed by recovery.
    return [f.vx + Math.sin(f.face) * 0.78 / mass, f.vz + Math.cos(f.face) * 0.78 / mass];
  }
  return [f.vx, f.vz];
}

function forgeBodyLean(f, dt) {
  const bone = goreBone(f, 'spine_01');
  if (!bone) return;
  const current = f.forgeLean || 0;
  const lateral = Math.cos(f.face) * (f.vx || 0) - Math.sin(f.face) * (f.vz || 0);
  const desired = f.free && !f.remote ? clamp(lateral * 0.045, -0.17, 0.17) : 0;
  f.forgeLean = current + (desired - current) * (1 - Math.exp(-7 * dt));
  forgeTurn.setFromAxisAngle(forgeRootAxis, f.forgeLean);
  bone.quaternion.multiply(forgeTurn);
}

// Closest points between two finite segments. The endpoints are limited, so thrusts
// cannot hit behind the blade or beyond the actual tip.
function forgeClosest(p, q, a, b) {
  const u = q.clone().sub(p), v = b.clone().sub(a), w = p.clone().sub(a);
  const aa = u.dot(u), bb = u.dot(v), cc = v.dot(v), dd = u.dot(w), ee = v.dot(w);
  const det = aa * cc - bb * bb;
  let s = det > 1e-8 ? clamp((bb * ee - cc * dd) / det, 0, 1) : 0;
  let t = cc > 1e-8 ? clamp((bb * s + ee) / cc, 0, 1) : 0;
  if (aa > 1e-8) s = clamp((bb * t - dd) / aa, 0, 1);
  if (cc > 1e-8) t = clamp((bb * s + ee) / cc, 0, 1);
  const x = p.clone().addScaledVector(u, s), y = a.clone().addScaledVector(v, t);
  return { gap: x.distanceToSquared(y), x, y, s };
}

function forgeReadBlade(f) {
  if (!f.sword?.visible || f.armless) return null;
  f.sword.updateWorldMatrix(true, false);
  const [min, max] = f.wp.hit;
  const marks = f.wp.contact || [[0, min, 0], [0, max, 0]];
  return marks.map(point => f.sword.localToWorld(new THREE.Vector3(...point)));
}

function forgeContact(f, o, sweep, blade, strike, dt) {
  if (!blade) return null;
  const boot = strike === 'kick';
  if (Math.hypot(o.x - f.x, o.z - f.z) > 3.7) return null;
  o.root.updateMatrixWorld(true);
  const zones = forgeRig(o).filter(z => !(o.cuts & z.cut));
  for (const z of zones) {
    z.a.getWorldPosition(z.p);
    z.b.getWorldPosition(z.q);
  }
  const from = sweep || blade;
  const travel = Math.max(from[0].distanceTo(blade[0]), from[1].distanceTo(blade[1]));
  const steps = Math.max(1, Math.min(8, Math.ceil(travel / 0.085)));
  const radius = boot ? .091 : f.wp.radius || .05;
  const impactSpeed = travel / Math.max(dt, 0.009);
  const angularSpeed = Math.hypot(...(f.forgeMotion?.speed.slice(0, 2) || [0, 0]));
  if (!sweep || impactSpeed < (forgeManual(f) ? 1.65 : .65) || (forgeManual(f) && angularSpeed < 1.35)) return null;
  const momentum = clamp(.61 + impactSpeed * f.wp.mass * .065, .68, 1.22);
  const fighting = o.act === 'light' || o.act === 'heavy';
  const guarding = o.act === 'block';
  const opposing = !boot && (fighting || guarding) ? forgeReadBlade(o) : null;
  for (let step = 0; step <= steps; step++) {
    const s = step / steps;
    const start = from[0].clone().lerp(blade[0], s), tip = from[1].clone().lerp(blade[1], s);
    if (opposing && forgeClosest(start, tip, opposing[0], opposing[1]).gap < 0.085 ** 2)
      return guarding ? { guard: true, power: momentum } : { clash: true };
    let first = null;
    for (const z of zones) {
      const hit = forgeClosest(start, tip, z.p, z.q);
      if (hit.gap > (z.radius + radius) ** 2 || (first && first.gap <= hit.gap)) continue;
      const normal = hit.x.clone().sub(hit.y);
      if (normal.lengthSq() < 1e-6) normal.set(Math.sin(f.face + Math.PI), 0, Math.cos(f.face + Math.PI));
      normal.normalize();
      first = { pos: hit.y.clone().addScaledVector(normal, z.radius * .88), normal, gap: hit.gap, zone: z.key, bone: z.bone, power: z.power * (0.78 + 0.27 * hit.s) * momentum };
    }
    if (first) {
      first.dir = blade[1].clone().sub(from[1]);
      if (first.dir.lengthSq() < 0.001) first.dir.copy(tip).sub(start);
      first.dir.normalize();
      return first;
    }
  }
  return null;
}

function forgePoseAndStrike(f, foe, strike, dt) {
  forgeFallPose(f, dt);
  forgeWeaponPose(f, dt);
  forgeUpdateWounds(f);
  const blade = f.act === 'kick' && !(f.cuts & GORE_PARTS.legR.bit)
    ? ['foot_r','ball_leaf_r'].map(name => goreBone(f, name).getWorldPosition(new THREE.Vector3()))
    : (f.act === 'light' || f.act === 'heavy') ? forgeReadBlade(f) : null;
  const prior = f.forgeSweep;
  f.forgeSweep = blade;
  if (!strike || f.hitDone || DUEL.phase !== 'fight' || DUEL.fin || DUEL.kc || f.hp <= 0) return;
  for (const o of f.others || [foe]) {
    if (!o || o === f || o.remote || o.act === 'dead' || o.gone) continue;
    const contact = forgeContact(f, o, prior, blade, strike, dt);
    if (!contact) continue;
    if (contact.clash) {
      forgeRecoil(f, .52);
      forgeRecoil(o, .52);
      f.stagger(0.24);
      o.stagger(0.24);
      o.spend(8);
      if (!f.remote) f.spend(8);
      f.onHit?.('clash', o);
      break;
    }
    f.hitDone = true;
    o.forgeContact = contact;
    try {
      const result = duelResolve(f, o, strike);
      if (!['miss', 'none'].includes(result)) forgeRecoil(f, contact.guard ? .65 : .26);
      f.onHit?.(result, o);
    } finally {
      o.forgeContact = null;
    }
    break;
  }
}
