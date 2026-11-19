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
const forgeUpAxis = new THREE.Vector3(0, 1, 0);

function forgeRig(f) {
  if (!f.forgeRig) {
    // Resolve once, after the loaded animation rig is available.
    f.forgeRig = FORGE_ZONES.flatMap(([key, from, to, radius, power, marker]) => {
      const a = goreBone(f, from), b = goreBone(f, to);
      if (!a || !b) return [];
      return [{ key, a, b, radius, power, bone: goreBone(f, marker) || b, cut: GORE_PARTS[key]?.bone === from ? GORE_PARTS[key].bit : 0, p: new THREE.Vector3(), q: new THREE.Vector3(), beforeP: new THREE.Vector3(), beforeQ: new THREE.Vector3() }];
    });
  }
  return f.forgeRig;
}

function forgeBeginAction(f, act) {
  f.forgeSweep = null;
  if (!FORGE_ATTACKS.has(act)) {
    f.forgeGesture = null;
    return;
  }
  f.forgeAttack = (f.forgeAttack || 0) + 1;
  f.forgeDirection = f.forgeAim || 0;
  f.forgeAim = 0;
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
function forgeChain(hand, target, pole) {
  const elbow = hand.parent, shoulder = elbow.parent;
  const pivot = shoulder.getWorldPosition(new THREE.Vector3());
  const upper = pivot.distanceTo(elbow.getWorldPosition(new THREE.Vector3()));
  const lower = elbow.getWorldPosition(new THREE.Vector3()).distanceTo(hand.getWorldPosition(new THREE.Vector3()));
  const dir = target.clone().sub(pivot);
  const distance = dir.length();
  if (upper < .02 || lower < .02 || distance < .001) return;
  const len = clamp(distance, Math.abs(upper - lower) + .014, upper + lower - .012);
  dir.multiplyScalar(1 / distance);
  const mid = (upper * upper - lower * lower + len * len) / (2 * len);
  const bend = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (bend.lengthSq() < 1e-4) bend.crossVectors(dir, forgeRootAxis);
  if (bend.lengthSq() < 1e-4) bend.set(1, 0, 0);
  bend.normalize();
  const joint = pivot.clone().addScaledVector(dir, mid).addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - mid * mid)));
  forgeTurnBone(shoulder, elbow, joint);
  forgeTurnBone(elbow, hand, pivot.addScaledVector(dir, len));
}

function forgeManual(f) {
  return (f.act === 'light' || f.act === 'heavy') && !!f.forgeGesture;
}

function forgeWeaponPose(f, dt) {
  if (!f.hand || f.armless || !f.sword?.visible) return;
  const guard = f.act === 'block';
  const attacking = f.act === 'light' || f.act === 'heavy';
  if (!attacking && !guard && f.act !== 'idle') {
    f.forgeMotion = null;
    return;
  }
  if (!f.forgeGrip || f.forgeGripSword !== f.sword) {
    f.forgeGripSword = f.sword;
    f.forgeGrip = f.sword.quaternion.clone().invert();
  }
  const M = f.M[f.act] || f.M.light, heavy = f.act === 'heavy', thrust = f.wp.thrust;
  const gesture = f.forgeGesture;
  const sign = f.forgeDirection || (heavy || f.combo % 2 ? -1 : 1);
  const ramp = clamp((f.t - M.hitFrom + .115) / (M.hitTo - M.hitFrom + .045), 0, 1);
  const sweep = 1 - 2 * ramp;
  const reach = thrust ? Math.sin(ramp * Math.PI * .91) : Math.sin(ramp * Math.PI);
  const turn = f.wp.twoHanded ? 1.18 : 1.42;
  const yaw = guard ? -1.08 : gesture ? gesture.x * (thrust ? .68 : 1.74) :
    !attacking ? -.36 : thrust ? sign * sweep * .25 : sign * sweep * turn;
  const pitch = guard ? .90 : gesture ? gesture.y * (thrust ? .76 : 1.07) + .12 :
    !attacking ? .59 : thrust ? .16 : heavy ? 1.04 - 1.41 * ramp : .32 - .50 * ramp;
  const forward = guard ? .37 : gesture ? (thrust ? .37 + Math.hypot(gesture.x, gesture.y) * .22 : .48) :
    !attacking ? .28 : thrust ? .34 + .34 * reach : .43 + .27 * reach;
  const state = f.forgeMotion || (f.forgeMotion = { pose: [-.36, .59, .28],
    speed: [0, 0, 0], clock: 0, recoil: 0 });
  // Automatic attacks start at the ready position and reach their wind-up target before the hit window.
  const windUp = attacking && !gesture && f.t < M.hitFrom - .11;
  const readyYaw = windUp ? sign * (thrust ? .24 : turn) : yaw;
  const readyPitch = windUp && heavy && !thrust ? 1.04 : pitch;
  state.recoil = Math.max(0, state.recoil - dt);
  const stopped = state.recoil > 0;
  forgeDrive(state, stopped ? [state.pose[0], state.pose[1], .30] : [readyYaw, readyPitch, forward], f.wp.mass * (1 + forgePenalty(f, 'armR') * .9), dt);
  const [angle, rise, extension] = state.pose;
  const spine = goreBone(f, 'spine_01');
  if (spine) {
    const twist = clamp(angle * .115 + state.speed[0] * .014, -.24, .24);
    const strikeLean = attacking ? .115 * (1 - Math.min(1, Math.abs(angle))) : 0;
    const lean = clamp((extension - .43) * .83 + strikeLean - (stopped ? .10 : 0), -.12, .23);
    spine.quaternion.multiply(forgeTurn.setFromEuler(new THREE.Euler(lean, twist, 0)));
  }
  const side = new THREE.Vector3(Math.cos(f.face), 0, -Math.sin(f.face));
  const front = new THREE.Vector3(Math.sin(f.face), 0, Math.cos(f.face));
  const origin = f.root.getWorldPosition(new THREE.Vector3());
  const right = f.hand.parent.parent.getWorldPosition(new THREE.Vector3()).sub(origin).dot(side) > 0 ? 1 : -1;
  const wrist = origin.clone().addScaledVector(front, extension).addScaledVector(side, right * (.14 + .055 * Math.abs(Math.sin(angle))) + Math.sin(angle) * .34);
  wrist.y += 1.27 + Math.sin(rise) * .34;
  const pole = side.clone().multiplyScalar(right).add(new THREE.Vector3(0, -.78, 0));
  forgeChain(f.hand, wrist, pole);
  const actual = f.hand.getWorldPosition(new THREE.Vector3());
  const low = Math.asin(clamp((.07 - actual.y) / Math.max(.1, f.wp.hit[1]), -.99, 0));
  const altitude = clamp(rise, low, 1.33);
  forgeAxis.set(Math.sin(f.face + angle) * Math.cos(altitude), Math.sin(altitude), Math.cos(f.face + angle) * Math.cos(altitude));
  const edge = new THREE.Vector3(forgeAxis.z, 0, -forgeAxis.x).normalize();
  const flat = edge.clone().cross(forgeAxis);
  forgeWorld.setFromRotationMatrix(new THREE.Matrix4().makeBasis(edge, forgeAxis, flat));
  f.hand.parent.getWorldQuaternion(forgeLocal).invert();
  f.hand.quaternion.copy(forgeLocal.multiply(forgeWorld).multiply(f.forgeGrip));

  if (f.wp.twoHanded && !(f.cuts & (GORE_PARTS.armL.bit | GORE_PARTS.handL.bit)) && forgePenalty(f, 'armL') < .6) {
    const support = goreBone(f, 'hand_l');
    if (support) {
      const handle = f.sword.getWorldPosition(new THREE.Vector3()).addScaledVector(forgeAxis, -.12);
      const wristReach = support.parent.position.length() + support.position.length();
      const distance = handle.distanceTo(support.parent.parent.getWorldPosition(new THREE.Vector3()));
      const grip = 1 - clamp((distance - wristReach + .045) / .11, 0, 1);
      if (grip > 0) {
        const target = support.getWorldPosition(new THREE.Vector3()).lerp(handle, grip);
        forgeChain(support, target, pole.clone().negate().add(new THREE.Vector3(0, -1.1, 0)));
      }
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
  return [f.vx, f.vz];
}

function forgeBodyLean(f, dt) {
  const bone = goreBone(f, 'spine_01');
  if (!bone) return;
  const current = f.forgeLean || 0;
  const lateral = Math.cos(f.face) * (f.vx || 0) - Math.sin(f.face) * (f.vz || 0);
  const desired = f.act === 'dead' ? 0 : clamp(lateral * .046, -.18, .18);
  f.forgeLean = current + (desired - current) * (1 - Math.exp(-7 * dt));
  forgeTurn.setFromAxisAngle(forgeRootAxis, f.forgeLean);
  bone.quaternion.multiply(forgeTurn);
}

function forgeFeet(f, dt) {
  if (!['idle','block','light','heavy'].includes(f.act)) {
    f.forgeGait = null;
    return;
  }
  const speed = Math.hypot(f.vx, f.vz);
  const gait = f.forgeGait || (f.forgeGait = { phase:.48, blend:0, legs:{} });
  gait.blend += ((speed > .18 ? 1 : 0) - gait.blend) * (1 - Math.exp(-10 * dt));
  if (gait.blend < .015) {
    f.forgeGait = null;
    return;
  }
  gait.phase = (gait.phase + dt * clamp(.82 + speed * .49, .85, 3.4)) % 1;
  const forward = new THREE.Vector3(Math.sin(f.face), 0, Math.cos(f.face));
  const side = new THREE.Vector3(forward.z, 0, -forward.x);
  const hip = goreBone(f, 'pelvis').getWorldPosition(new THREE.Vector3());
  for (const [suffix, sign, offset] of [['_l', 1, 0], ['_r', -1, .5]]) {
    const part = suffix === '_l' ? 'legL' : 'legR';
    if (f.cuts & GORE_PARTS[part].bit) continue;
    const foot = goreBone(f, 'foot' + suffix);
    if (!foot?.parent?.parent) continue;
    const before = foot.getWorldPosition(new THREE.Vector3());
    const orientation = foot.getWorldQuaternion(new THREE.Quaternion());
    const phase = (gait.phase + offset) % 1;
    const swing = phase < .44;
    if (!swing && gait.blend > .1) {
      const skeleton = f.forgeFigure?.pieces[0]?.skeleton;
      if (!foot.userData.forgeFlatFoot && skeleton) {
        const inverse = skeleton.boneInverses[skeleton.bones.indexOf(foot)];
        if (inverse) foot.userData.forgeFlatFoot = new THREE.Quaternion().setFromRotationMatrix(inverse.clone().invert());
      }
      if (foot.userData.forgeFlatFoot) {
        const level = new THREE.Quaternion().setFromAxisAngle(forgeUpAxis, f.face).multiply(foot.userData.forgeFlatFoot);
        orientation.slerp(level, gait.blend);
      }
    }
    const neutral = new THREE.Vector3(hip.x, .087, hip.z)
      .addScaledVector(side, sign * .132).addScaledVector(forward, sign * .055);
    const leg = gait.legs[suffix] || (gait.legs[suffix] = { swing:false, plant:neutral.clone(), from:neutral.clone(), to:neutral.clone() });
    if (swing && !leg.swing) {
      leg.from.copy(leg.plant);
      leg.to.copy(neutral);
      const lead = Math.min(.21, .32 / Math.max(.7, speed));
      leg.to.x += f.vx * lead;
      leg.to.z += f.vz * lead;
      if (leg.to.clone().sub(neutral).dot(side) * sign < -.08)
        leg.to.addScaledVector(side, sign * -.08 - leg.to.clone().sub(neutral).dot(side));
    } else if (!swing && leg.swing) leg.plant.copy(leg.to);
    leg.swing = swing;
    const p = clamp(phase / .44, 0, 1);
    const target = swing ? leg.from.clone().lerp(leg.to, p * p * (3 - 2 * p)) : leg.plant.clone();
    if (swing) target.y += Math.sin(Math.PI * p) * (.055 + Math.min(.11, speed * .027)) *
      (1 - forgePenalty(f, part) * .38);
    if (target.distanceTo(neutral) > .52) target.lerp(neutral, .75);
    target.lerp(before, 1 - gait.blend * (f.running ? .83 : .95));
    forgeChain(foot, target, forward);
    foot.quaternion.copy(foot.parent.getWorldQuaternion(forgeLocal).invert().multiply(orientation));
  }
}

function forgeSeparate(fighters) {
  for (let i = 0; i < fighters.length; i++) {
    const [a] = fighters[i];
    if (a.gone || a.act === 'dead') continue;
    for (let j = i + 1; j < fighters.length; j++) {
      const [b] = fighters[j];
      if (b.gone || b.act === 'dead' || a.remote && b.remote) continue;
      let dx = b.x - a.x, dz = b.z - a.z;
      const gap = Math.hypot(dx, dz), body = .75;
      if (gap >= body) continue;
      if (gap > 1e-4) { dx /= gap; dz /= gap; }
      else { dx = Math.sin(a.face); dz = Math.cos(a.face); }
      for (const [fighter, other, sign] of [[a,b,-1],[b,a,1]]) {
        if (fighter.remote) continue;
        const push = (body - gap) * (other.remote ? 1 : .5);
        fighter.x += dx * push * sign;
        fighter.z += dz * push * sign;
        const r = Math.hypot(fighter.x, fighter.z);
        if (r > DM.arena) { fighter.x *= DM.arena / r; fighter.z *= DM.arena / r; }
        fighter.root.position.x = fighter.x;
        fighter.root.position.z = fighter.z;
      }
    }
  }
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
  return { gap: x.distanceToSquared(y), x, y, s, t };
}

function forgeReadBlade(f, guard = false) {
  if (!f.sword?.visible || f.armless) return null;
  f.sword.updateWorldMatrix(true, false);
  const [min, max] = f.wp.hit;
  const marks = f.wp.contact || [[0, min, 0], [0, max, 0]];
  const segment = guard ? [[0, .10, 0], marks[1]] : marks;
  return segment.map(point => f.sword.localToWorld(new THREE.Vector3(...point)));
}

function forgeContact(f, o, sweep, blade, strike, dt) {
  if (!sweep || !blade || Math.hypot(o.x - f.x, o.z - f.z) > 3.7) return null;
  const boot = strike === 'kick';
  const heel = blade[0].clone().sub(sweep[0]), toe = blade[1].clone().sub(sweep[1]);
  const distance = Math.max(heel.length(), toe.length());
  const rotation = toe.clone().sub(heel).length();
  const elapsed = Math.max(dt, .004);
  if (distance / elapsed < .55 || (forgeManual(f) && rotation / elapsed < .82 &&
      Math.abs(f.forgeMotion?.speed[2] || 0) < .52)) return null;
  const steps = Math.min(12, Math.max(2, Math.ceil(distance / .043)));
  const radius = boot ? .085 : f.wp.radius || .05;
  const zones = forgeRig(o);
  const opposes = o.act === 'light' || o.act === 'heavy';
  const guarding = o.act === 'block';
  const opposing = !boot && (opposes || guarding) ? o.forgeGuardBlade : null;
  const contactPoint = (start, tip, a, b, gap, time, previous) => {
    const hit = forgeClosest(start, tip, a, b);
    if (hit.gap > gap ** 2) return null;
    const velocity = heel.clone().lerp(toe, hit.s);
    if (previous) velocity.addScaledVector(a.clone().sub(previous[0]).lerp(b.clone().sub(previous[1]), hit.t), -1 / time);
    const speed = velocity.length() / elapsed;
    if (speed < (forgeManual(f) ? 1.18 : .55)) return null;
    const momentum = clamp(.61 + speed * (boot ? 1 : f.wp.mass) * .065, .68, 1.22);
    return {hit, velocity, momentum, time};
  };
  for (let step = 1; step <= steps; step++) {
    const time = step / steps;
    const start = sweep[0].clone().addScaledVector(heel, time), tip = sweep[1].clone().addScaledVector(toe, time);
    let first = null;
    if (opposing) {
      const prior = o.forgePreviousGuard || opposing;
      const p = prior[0].clone().lerp(opposing[0], time), q = prior[1].clone().lerp(opposing[1], time);
      const block = contactPoint(start, tip, p, q, .078, time, prior);
      if (block) first = { guard: guarding, clash: opposes, power: block.momentum,
        pos: block.hit.x.clone().lerp(block.hit.y, .5), time, along: block.hit.s };
    }
    for (const z of zones) {
      if ((o.cuts & z.cut) || !z.ready) continue;
      const a = z.beforeP.clone().lerp(z.p, time), b = z.beforeQ.clone().lerp(z.q, time);
      const body = contactPoint(start, tip, a, b, z.radius + radius, time, [z.beforeP, z.beforeQ]);
      if (!body || (first && first.along + .055 < body.hit.s)) continue;
      if (first && body.hit.s >= first.along - .055 && (first.guard || first.clash || body.hit.gap >= first.gap)) continue;
      const {hit, velocity, momentum} = body;
      const normal = hit.x.clone().sub(hit.y);
      if (normal.lengthSq() < 1e-5) normal.copy(velocity).negate();
      normal.normalize();
      first = { pos: hit.y.clone().addScaledVector(normal, z.radius * .9), normal, time, along: hit.s,
        gap: hit.gap, zone: z.key, bone: z.bone, dir: velocity.normalize(),
        power: z.power * (.78 + .27 * hit.s) * momentum };
    }
    if (first) return first;
  }
  return null;
}

function forgeSampleFighter(f, dt) {
  forgeFallPose(f, dt);
  if (f.act === 'dodge' && Math.hypot(f.dx, f.dz) > .2) {
    const heading = wrapAng(Math.atan2(f.dx, f.dz) - f.face);
    const amount = Math.min(1, f.t / .07, (DM.dodge.t - f.t) / .10);
    f.root.rotation.y = f.face + heading * amount;
  }
  if (f.act !== 'dead') {
    forgeBodyLean(f, dt);
    forgeFeet(f, dt);
    forgeWeaponPose(f, dt);
  }
  forgeGroundShadow(f);
  forgeUpdateWounds(f);
  const boot = f.act === 'kick' && !(f.cuts & GORE_PARTS.legR.bit);
  const foot = boot && goreBone(f, 'foot_r'), toe = boot && goreBone(f, 'ball_leaf_r');
  f.forgePrior = f.forgeSweep;
  f.forgeSweep = foot && toe ? [foot, toe].map(b => b.getWorldPosition(new THREE.Vector3())) :
    (f.act === 'light' || f.act === 'heavy') ? forgeReadBlade(f) : null;
  f.forgePreviousGuard = f.forgeGuardBlade;
  f.forgeGuardBlade = f.act === 'block' || f.forgeSweep && !boot ? forgeReadBlade(f, true) : null;
  if (f.act === 'dead') return;
  for (const z of forgeRig(f)) {
    z.beforeP.copy(z.p);
    z.beforeQ.copy(z.q);
    z.a.getWorldPosition(z.p);
    z.b.getWorldPosition(z.q);
    if (!z.ready) {
      z.beforeP.copy(z.p);
      z.beforeQ.copy(z.q);
      z.ready = true;
    }
  }
}

// Sample every fighter at the same step before adjudicating either blade.
function forgeFightStep(fighters, dt) {
  for (const [f, foe] of fighters) {
    const x = f.x, z = f.z;
    f.update(dt, foe);
    if (f.remote && dt > .002) {
      const blend = 1 - Math.exp(-12 * dt);
      f.vx += (clamp((f.x - x) / dt, -DM.run, DM.run) - f.vx) * blend;
      f.vz += (clamp((f.z - z) / dt, -DM.run, DM.run) - f.vz) * blend;
    }
  }
  forgeSeparate(fighters);
  for (const [f] of fighters) forgeSampleFighter(f, dt);
  if (DUEL.phase !== 'fight' || DUEL.fin || DUEL.kc) return;
  const contacts = [];
  for (const [f, foe] of fighters) {
    const kind = f.act, M = f.M[kind] || DM[kind];
    if (!FORGE_ATTACKS.has(kind) || f.hitDone || f.hp <= 0 ||
        (forgeManual(f) ? f.t < .035 : f.t < M.hitFrom || f.t - dt > M.hitTo)) continue;
    let best;
    for (const o of f.others || [foe]) {
      if (!o || o === f || o.remote || o.act === 'dead' || o.gone) continue;
      const hit = forgeContact(f, o, f.forgePrior, f.forgeSweep, kind, dt);
      if (hit && (!best || hit.time < best.hit.time || (hit.time === best.hit.time && hit.along < best.hit.along)))
        best = { f, o, hit, kind };
    }
    if (best) contacts.push(best);
  }
  contacts.sort((a, b) => a.hit.time - b.hit.time || Number(!!b.hit.clash) - Number(!!a.hit.clash));
  for (const { f, o, hit, kind } of contacts) {
    if (f.act !== kind || f.hitDone || o.act === 'dead' || o.hp <= 0) continue;
    f.hitDone = true;
    if (hit.clash) {
      forgeRecoil(f, .52);
      forgeRecoil(o, .52);
      f.stagger(.26);
      o.stagger(.26);
      o.spend(8);
      if (!f.remote) f.spend(8);
      f.onHit?.('clash', o, kind, hit.pos);
      continue;
    }
    o.forgeContact = hit;
    try {
      const result = duelResolve(f, o, kind);
      if (!['miss', 'none'].includes(result)) forgeRecoil(f, hit.guard ? .65 : .26);
      f.onHit?.(result, o, kind, hit.pos);
    } finally {
      o.forgeContact = null;
    }
  }
}

function forgeAdvance(fighters, dt) {
  const parts = Math.max(1, Math.ceil(dt / .021));
  for (let i = 0; i < parts; i++) forgeFightStep(fighters, dt / parts);
}
