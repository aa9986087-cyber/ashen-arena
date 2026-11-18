'use strict';

const FORGE_ATTACKS = new Set(['light', 'heavy', 'kick']);
const FORGE_ZONES = [
  ['head', 'neck_01', 'Head', 0.14, 1.24],
  ['body', 'spine_01', 'neck_01', 0.23, 1],
  ['armR', 'upperarm_r', 'hand_r', 0.12, 0.82],
  ['armL', 'upperarm_l', 'hand_l', 0.12, 0.82],
  ['legR', 'thigh_r', 'calf_r', 0.15, 0.76],
  ['legL', 'thigh_l', 'calf_l', 0.15, 0.76],
];
const forgeY = new THREE.Vector3(0, 1, 0);
const forgeAxis = new THREE.Vector3();
const forgeLocal = new THREE.Quaternion();
const forgeWorld = new THREE.Quaternion();
const forgeTurn = new THREE.Quaternion();
const forgeRootAxis = new THREE.Vector3(0, 0, 1);

function forgeRig(f) {
  if (!f.forgeRig) {
    // Resolve once, after the loaded animation rig is available.
    f.forgeRig = FORGE_ZONES.flatMap(([key, from, to, radius, power]) => {
      const a = goreBone(f, from), b = goreBone(f, to);
      if (!a || !b) return [];
      return [{ key, a, b, radius, power, p: new THREE.Vector3(), q: new THREE.Vector3() }];
    });
  }
  return f.forgeRig;
}

function forgeBeginAction(f, act) {
  if (!FORGE_ATTACKS.has(act)) {
    f.forgeSweep = null;
    return;
  }
  f.forgeAttack = (f.forgeAttack || 0) + 1;
  f.forgeDirection = f.forgeAim || 0;
  f.forgeAim = 0;
  f.forgeSweep = null;
}

// Sword and axe like an oblique cut; the spear keeps the point in front.
// Align the assembled mesh with its actual swept capsule, not a separate damage cone.
function forgeWeaponPose(f, strike) {
  const kind = strike || f.act;
  if (!f.sword?.parent) return;
  if (!f.forgeGrip || f.forgeGripSword !== f.sword) {
    f.forgeGripSword = f.sword;
    f.forgeGrip = f.sword.quaternion.clone();
  }
  if (!FORGE_ATTACKS.has(kind) || kind === 'kick' || f.armless) {
    f.sword.quaternion.copy(f.forgeGrip);
    return;
  }
  const M = f.M[kind];
  const p = clamp(f.t / M.t, 0, 1);
  const wind = p < 0.26 ? p / 0.26 : 1;
  const cut = clamp((f.t - M.hitFrom + 0.055) / (M.hitTo - M.hitFrom + 0.065), 0, 1);
  const swing = cut * cut * (3 - 2 * cut);
  const sign = f.forgeDirection || (kind === 'light' && f.combo % 2 === 0 ? -1 : 1);
  const thrust = f.wpId === 'spear';
  const arc = thrust ? 0.27 : kind === 'heavy' ? 1.14 : 1.43;
  const yaw = f.face + arc * (1 - 2 * swing) * sign * wind;
  const rise = thrust ? 0.12 : kind === 'heavy' ? 0.64 - swing * 1.05 : 0.14 - swing * 0.22;
  forgeAxis.set(Math.sin(yaw), rise, Math.cos(yaw)).normalize();
  forgeWorld.setFromUnitVectors(forgeY, forgeAxis);
  f.sword.parent.getWorldQuaternion(forgeLocal).invert();
  f.sword.quaternion.copy(forgeLocal.multiply(forgeWorld));
}

function forgeFootwork(f, vx, vz, dt) {
  if (f.remote || f.act === 'dodge') return [vx, vz];
  const mass = f.wpId === 'axe' || f.wpId === 'mace' ? 1.18 : 1;
  const accelerating = Math.hypot(vx, vz) > Math.hypot(f.vx || 0, f.vz || 0);
  const rate = (accelerating ? 8.1 : 12.8) / mass;
  const grip = 1 - Math.exp(-rate * dt);
  f.vx = (f.vx || 0) + (vx - (f.vx || 0)) * grip;
  f.vz = (f.vz || 0) + (vz - (f.vz || 0)) * grip;
  if (f.act === 'heavy' && f.t >= f.M.heavy.hitFrom && f.t <= f.M.heavy.hitTo) {
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
  forgeTurn.setFromAxisAngle(forgeRootAxis, f.forgeLean - current);
  bone.quaternion.multiply(forgeTurn);
}

// Closest points between two finite segments. The endpoints are limited, so thrusts
// cannot hit behind the blade or beyond the actual tip.
function forgeClosest(p, q, a, b) {
  const u = q.clone().sub(p), v = b.clone().sub(a), w = p.clone().sub(a);
  const aa = u.dot(u), bb = u.dot(v), cc = v.dot(v), dd = u.dot(w), ee = v.dot(w);
  const det = aa * cc - bb * bb;
  let s = aa > 1e-8 && cc > 1e-8 && det > 1e-8 ? clamp((bb * ee - cc * dd) / det, 0, 1) : 0;
  let t = cc > 1e-8 ? (bb * s + ee) / cc : 0;
  if (t < 0 || t > 1 || cc <= 1e-8) {
    t = clamp(t, 0, 1);
    if (aa > 1e-8) s = clamp((bb * t - dd) / aa, 0, 1);
  }
  const x = p.clone().addScaledVector(u, s), y = a.clone().addScaledVector(v, t);
  return { gap: x.distanceToSquared(y), x, y, s };
}

function forgeReadBlade(f) {
  if (!f.sword?.visible || f.armless) return null;
  f.sword.updateWorldMatrix(true, false);
  const [min, max] = f.wp.hit;
  return [
    f.sword.localToWorld(new THREE.Vector3(0, min, 0)),
    f.sword.localToWorld(new THREE.Vector3(0, max, 0)),
  ];
}

function forgeContact(f, o, sweep, blade, strike, dt) {
  if (strike === 'kick') {
    const dx = o.x - f.x, dz = o.z - f.z;
    return Math.hypot(dx, dz) < DM.kick.reach &&
      Math.abs(wrapAng(Math.atan2(dx, dz) - f.face)) < DM.kick.arc ? {} : null;
  }
  if (!blade) return null;
  if (Math.hypot(o.x - f.x, o.z - f.z) > 3.7) return null;
  o.root.updateMatrixWorld(true);
  const zones = forgeRig(o);
  for (const z of zones) {
    z.a.getWorldPosition(z.p);
    z.b.getWorldPosition(z.q);
  }
  const from = sweep || blade;
  const travel = Math.max(from[0].distanceTo(blade[0]), from[1].distanceTo(blade[1]));
  const steps = Math.max(1, Math.min(8, Math.ceil(travel / 0.085)));
  const radius = f.wpId === 'mace' ? 0.115 : 0.05;
  const impactSpeed = travel / Math.max(dt, 0.009);
  const momentum = clamp(0.83 + impactSpeed * 0.019, 0.84, 1.14);
  const opposing = FORGE_ATTACKS.has(o.act) && o.act !== 'kick' &&
    o.t > o.M[o.act].hitFrom - 0.065 && o.t < o.M[o.act].hitTo ? forgeReadBlade(o) : null;
  for (let step = 0; step <= steps; step++) {
    const s = step / steps;
    const start = from[0].clone().lerp(blade[0], s), tip = from[1].clone().lerp(blade[1], s);
    if (opposing && forgeClosest(start, tip, opposing[0], opposing[1]).gap < 0.085 ** 2)
      return { clash: true };
    let first = null;
    for (const z of zones) {
      const hit = forgeClosest(start, tip, z.p, z.q);
      if (hit.gap > (z.radius + radius) ** 2 || (first && first.gap <= hit.gap)) continue;
      first = { pos: hit.y, gap: hit.gap, zone: z.key, bone: z.b, power: z.power * (0.78 + 0.27 * hit.s) * momentum };
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
  forgeWeaponPose(f, strike);
  const blade = (strike || FORGE_ATTACKS.has(f.act)) && f.act !== 'kick' ? forgeReadBlade(f) : null;
  const prior = f.forgeSweep;
  f.forgeSweep = blade;
  if (!strike || f.hitDone || DUEL.phase !== 'fight' || DUEL.fin || DUEL.kc || f.hp <= 0) return;
  for (const o of f.others || [foe]) {
    if (!o || o === f || o.remote || o.act === 'dead' || o.gone) continue;
    const contact = forgeContact(f, o, prior, blade, strike, dt);
    if (!contact) continue;
    if (contact.clash) {
      f.stagger(0.38);
      o.stagger(0.38);
      o.spend(8);
      if (!f.remote) f.spend(8);
      f.onHit?.('clash', o);
      break;
    }
    f.hitDone = true;
    o.forgeContact = contact.pos ? contact : null;
    try {
      f.onHit?.(duelResolve(f, o, strike), o);
    } finally {
      o.forgeContact = null;
    }
    break;
  }
}

function forgeWound(victim, attacker, kind) {
  const hit = victim.forgeContact;
  if (!hit || !GORE.scene || kind === 'chip') {
    if (hit && kind === 'chip') goreHit(victim, attacker, kind);
    return;
  }
  const heavy = kind === 'heavy';
  const strong = S.forgeBlood !== 'light';
  const weight = attacker.wp?.blood ?? 1;
  const n = Math.round((strong ? (heavy ? 44 : 24) : 8) * weight);
  goreSpray(hit.pos, hit.dir, n, heavy ? 5.4 : 3.45, heavy ? 0.31 : 0.25);
  if (strong && GORE.jets.length < 12) {
    GORE.jets.push({ f: victim, bone: hit.bone, t: 0, dur: heavy ? 3.2 : 1.55, rate: 8, drip: 1, acc: 0 });
    if (heavy) goreStain(hit.pos.x, hit.pos.z, 0.25 + hit.power * 0.12, false);
  }
  attacker.blood = Math.min(1, (attacker.blood || 0) + (heavy ? 0.33 : 0.14));
  goreBlade(attacker);
}
