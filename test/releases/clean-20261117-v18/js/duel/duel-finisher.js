'use strict';
/* Sword duel — finishers: the killing blow plays out as one of four staged executions. The two fighters are set
   at the right distance, the killer plays a real swing, and the wound happens only when the blade actually reaches
   it (the sword's edge is tested against the target bone every frame), in slow motion, with its own camera.
   The fallen fighter's own copy picks the finisher and sends it with its state, so everyone sees the same one. */
const FIN_KINDS = [
  { name: 'قطع الرأس', d: 0.95 },
  { name: 'الطعنة الأرضية', d: 1.25 },
  { name: 'بتر وشق', d: 1.4 },
  { name: 'الشق من الكتف', d: 1.2 },
];
const FIN_BLUNT = ['تحطيم الجمجمة', 'السحق الأرضي', 'كسر وسحق', 'سحق الكتف'];
const fA = new THREE.Vector3(),
  fB = new THREE.Vector3(),
  fP = new THREE.Vector3(),
  fQ = new THREE.Vector3();
/** Choose a finisher the victim's body still allows (an execution is always the head). */
function finPick(v, exec) {
  if (exec && !(v.cuts & GORE_PARTS.head.bit)) return 0;
  const ok = [0, 1, 2, 3].filter(
    k =>
      !(k === 0 && v.cuts & GORE_PARTS.head.bit) &&
      !(k === 2 && v.cuts & GORE_PARTS.armR.bit) &&
      !(k === 3 && v.cuts & (GORE_PARTS.shoulderL.bit | GORE_PARTS.armL.bit))
  );
  return ok.length ? ok[(Math.random() * ok.length) | 0] : 1;
}
/** Start a finisher on `v` (fallen to `k`'s blow). kind: 0-3, or -1 to choose. Returns false if one is running. */
function duelFinisher(v, k, kind) {
  if (DUEL.fin || !k || !GORE.scene) return false;
  if (kind === undefined || kind < 0 || kind > 3) kind = finPick(v, false);
  v.finV = kind;
  v.start('dead');
  v.kcSeen = true; // not the plain killcam
  v.pooled = 1; // the pool spreads once the body is down
  for (const f of [v, k]) {
    f.kx = f.kz = f.vx = f.vz = 0;
    f.running = false;
    f.want.block = false;
  }
  // set the stage: the victim stays, the killer stands at the finisher's distance, facing him
  let dx = v.x - k.x,
    dz = v.z - k.z,
    L = Math.hypot(dx, dz);
  if (L < 0.01) ((dx = Math.sin(v.face + Math.PI)), (dz = Math.cos(v.face + Math.PI)), (L = 1));
  dx /= L;
  dz /= L;
  const d = FIN_KINDS[kind].d;
  // keep both inside the ring
  const r = Math.hypot(v.x, v.z);
  if (r > DM.arena - 1.6) {
    v.x *= (DM.arena - 1.6) / r;
    v.z *= (DM.arena - 1.6) / r;
  }
  k.x = v.x - dx * d;
  k.z = v.z - dz * d;
  k.face = Math.atan2(dx, dz);
  v.face = Math.atan2(-dx, -dz);
  k.start('idle');
  k.mixer.stopAllAction();
  v.mixer.stopAllAction();
  k.cur = v.cur = null;
  k.play('idle', 0);
  v.play('stagger', 0.05, 1.8, true);
  DUEL.fin = { v, k, kind, t: 0, real: 0, hit: -1, hit2: -1, stage: 0, dx, dz, cut: false };
  DUEL.hitStop = 0;
  DUEL.kc = null;
  const who = k === DUEL.me ? $('dNameMe').textContent : $('dNameFoe').textContent;
  const T = $('dCineT');
  T.textContent = '☠️ ' + (k.wp && !k.wp.cut ? FIN_BLUNT[kind] : FIN_KINDS[kind].name);
  T.appendChild(el('small', '', who));
  $('duel').classList.add('cine');
  document.documentElement.classList.add('cine');
  return true;
}
/** The finisher's clock: steady and a little slow up to the blow, nearly frozen right after it, then back. */
function finScale() {
  const F = DUEL.fin;
  if (F.hit < 0) return 0.6;
  const a = F.real - F.hit;
  return a < 1.0 ? 0.12 : Math.min(1, 0.12 + ((a - 1.0) / 0.9) * 0.88);
}
/** Distance from a point to the killer's blade (guard to tip). */
function finBladeDist(k, p) {
  const h = k.sword.userData.hit || [0.2, 1.07];
  k.sword.localToWorld(fA.set(0, h[0], 0));
  k.sword.localToWorld(fB.set(0, h[1], 0));
  fQ.subVectors(fB, fA);
  const t = clamp(fP.subVectors(p, fA).dot(fQ) / fQ.lengthSq(), 0, 1);
  return fP.copy(fA).addScaledVector(fQ, t).distanceTo(p);
}
/** Has the blade reached bone `name` of the victim (within its clip window, or at the window's end as a backstop)? */
function finReach(F, clipName, from, to, bone, rad) {
  const a = F.k.acts[clipName],
    t = a ? a.time : 0,
    b = goreBone(F.v, bone);
  if (!b || t < from) return false;
  b.getWorldPosition(fQ.set(0, 0, 0));
  const p = fQ.clone();
  const dist = finBladeDist(F.k, p),
    hit = dist < rad;
  if (hit || t >= to) F.how = (hit ? 'touch ' : 'late ') + dist.toFixed(2); // for tuning
  return hit || t >= to;
}
/** Take a part off, unless the weapon is blunt (a mace breaks bones instead: more blood, a crack). */
function finCut(F, part, k) {
  if (k.wp && !k.wp.cut) {
    const b = goreBone(F.v, GORE_PARTS[part].bone);
    if (b) {
      b.getWorldPosition(fP);
      goreSpray(fP, gV2.set(F.dx, 0.6, F.dz).normalize(), 40, 4, 0.7);
    }
    rPlay('bone', 1, 0.85);
    return;
  }
  goreCut(F.v, part, k);
}
/** A wound opens: blood bursts out along the blade's travel, the hit lands with weight. */
function finWound(F, bone, n, heavy) {
  const b = goreBone(F.v, bone);
  if (!b) return;
  b.getWorldPosition(fP);
  gV2.set(F.dx, 0.45, F.dz).normalize();
  goreSpray(fP, gV2, n, heavy ? 6 : 4.5, 0.55);
  gV2.set(-F.dx, 0.6, -F.dz).normalize();
  goreSpray(fP, gV2, (n / 4) | 0, 3, 0.5); // back onto the killer and his blade
  GORE.jets.push({ f: F.v, bone: b, t: 0, dur: 6, rate: 22, drip: 1, acc: 0 });
  F.k.blood = Math.min(1, (F.k.blood || 0) + 0.45);
  goreBlade(F.k);
  DUEL.shake = 0.35;
  if (F.hit < 0) {
    F.hit = F.real;
    DS.finisher();
    DS.finWound(F.kind, F.v);
  } else DS.hurt(F.v, true); // the first of two blows already took its sound
}
/** Start clip `name` on fighter f at clip time `at` (seconds), once. */
function finPlay(f, name, at, fade = 0.1, speed = 1) {
  f.play(name, fade, 0, true);
  if (f.cur) {
    f.cur.time = at || 0;
    f.cur.timeScale = speed;
  }
}
/** One finisher frame (instead of the fighters' own update): the script, then the animation. */
function finStep(dt) {
  const F = DUEL.fin,
    v = F.v,
    k = F.k;
  F.t += dt;
  const T = F.t;
  if (F.kind === 0) {
    // the execution: beaten, he sinks to his knees; the blade comes down on the back of his neck
    if (F.stage === 0) {
      finPlay(v, 'death', 0, 0.2, 0.8);
      F.stage = 1;
    }
    if (F.stage === 1 && v.cur && v.cur.time >= 0.7) {
      v.cur.timeScale = 0; // held on his knees
      F.stage = 2;
    }
    if (F.stage < 3 && T > 0.6 && !F.raised) {
      F.raised = true;
      finPlay(k, 'heavy', 2.3, 0.15); // the sword goes up over the head...
    }
    if (F.stage === 2 && finReach(F, 'heavy', 2.5, 2.7, 'neck_01', 0.2)) {
      // ...and down through the neck
      finCut(F, 'head', k);
      finWound(F, 'neck_01', 80, true);
      F.stage = 3;
      F.at = T;
    }
    if (F.stage === 3 && T > F.at + 0.12) {
      if (v.cur) v.cur.timeScale = 0.9; // the body slumps the rest of the way
      F.stage = 4;
    }
  } else if (F.kind === 1) {
    // on the ground: a boot sends him down, the killer walks up and drives the blade into his chest
    if (F.stage === 0) {
      k.act = 'kick';
      k.t = 0;
      F.stage = 1;
    }
    if (F.stage === 1) {
      k.t += dt;
      if (k.t > 0.22 && !F.kicked) {
        F.kicked = true;
        finPlay(v, 'knock', 0, 0.05, 0.75);
        DS.kick(v);
        DUEL.shake = 0.25;
      }
      if (k.t > 0.62) {
        k.start('idle');
        F.stage = 2;
      }
    }
    if (F.stage === 2 && T > 1.45) {
      // walk up to where his chest now lies
      const c = goreBone(v, 'spine_03');
      c.getWorldPosition(fP);
      F.goal = { x: fP.x - F.dx * 1.42, z: fP.z - F.dz * 1.42, x0: k.x, z0: k.z, t0: T };
      k.play('walk', 0.15);
      F.stage = 3;
    }
    if (F.stage === 3) {
      const g = F.goal,
        e = Math.min(1, (T - g.t0) / 0.55);
      k.x = g.x0 + (g.x - g.x0) * e;
      k.z = g.z0 + (g.z - g.z0) * e;
      if (e >= 1) {
        finPlay(k, 'heavy', 2.3, 0.12);
        F.stage = 4;
      }
    }
    if (F.stage === 4 && finReach(F, 'heavy', 2.5, 2.74, 'spine_03', 0.28)) {
      finWound(F, 'spine_03', 80, true);
      F.stage = 5;
    }
  } else if (F.kind === 2) {
    // first the sword hand, then across the belly
    if (F.stage === 0 && T > 0.25) {
      finPlay(k, 'atk3', 0, 0.08, 0.85);
      F.stage = 1;
    }
    if (F.stage === 1 && finReach(F, 'atk3', 0.1, 0.36, 'lowerarm_r', 0.2)) {
      finCut(F, 'armR', k);
      finWound(F, 'lowerarm_r', 40, false);
      F.stage = 2;
    }
    if (F.stage === 2 && finReach(F, 'atk3', 0.55, 0.8, 'spine_02', 0.3)) {
      finWound(F, 'spine_02', 70, true);
      F.stage = 3;
      F.at = T;
    }
    if (F.stage === 3 && T > F.at + 0.1) {
      finPlay(v, 'death', 0, 0.15);
      F.stage = 4;
    }
  } else {
    // from above, down through the collarbone: the whole arm goes
    if (F.stage === 0 && T > 0.3) {
      finPlay(k, 'heavy', 2.3, 0.12);
      F.stage = 1;
    }
    if (F.stage === 1 && finReach(F, 'heavy', 2.45, 2.72, 'clavicle_l', 0.24)) {
      finCut(F, 'shoulderL', k);
      finWound(F, 'clavicle_l', 90, true);
      F.stage = 2;
      F.at = T;
    }
    if (F.stage === 2 && T > F.at + 0.15) {
      finPlay(v, 'death', 0, 0.15);
      F.stage = 3;
    }
  }
  // the body is down: let the pool spread
  if (F.hit >= 0 && F.real - F.hit > 0.9) v.pooled = 0;
  // animate both by hand (their own update would steer and move them)
  for (const f of [v, k]) {
    f.kickReset();
    f.mixer.update(dt);
    f.kickPose();
    f.root.position.set(f.x, 0, f.z);
    f.root.rotation.y = f.face;
    f.root.updateMatrixWorld(true);
  }
}
/** The finisher's camera: a framing per finisher, drifting slowly while the blow lands. */
function finCamera(dt, cam) {
  const F = DUEL.fin,
    v = F.v,
    k = F.k,
    sx = -F.dz,
    sz = F.dx, // the side, across the line between them
    mx = (v.x + k.x) / 2,
    mz = (v.z + k.z) / 2,
    p = Math.min(1, F.real / 4.5),
    e = p * p * (3 - 2 * p);
  let px, py, pz, lx, ly, lz, fov;
  if (F.kind === 0) {
    // low profile at neck height, sliding round toward the victim's face
    const a = 0.35 + e * 0.7;
    px = mx + sx * 2.3 * Math.cos(a) + F.dx * 2.3 * Math.sin(a);
    pz = mz + sz * 2.3 * Math.cos(a) + F.dz * 2.3 * Math.sin(a);
    py = 1.25 + e * 0.2;
    ((lx = v.x * 0.7 + k.x * 0.3), (ly = 1.35 - e * 0.45), (lz = v.z * 0.7 + k.z * 0.3));
    fov = 42;
  } else if (F.kind === 1) {
    // high over the killer's shoulder, looking down on the man on the ground
    px = k.x - F.dx * 0.9 + sx * 1.3;
    pz = k.z - F.dz * 0.9 + sz * 1.3;
    py = 2.1 - e * 0.5;
    ((lx = v.x + F.dx * 0.6), (ly = 0.5), (lz = v.z + F.dz * 0.6));
    fov = 50;
  } else if (F.kind === 2) {
    // over the victim's shoulder onto the killer, then swinging out to the side
    const a = e * 1.2;
    px = v.x + F.dx * 1.6 * Math.cos(a) + sx * (0.7 + 1.6 * Math.sin(a));
    pz = v.z + F.dz * 1.6 * Math.cos(a) + sz * (0.7 + 1.6 * Math.sin(a));
    py = 1.6 - e * 0.5;
    ((lx = mx), (ly = 1.15), (lz = mz));
    fov = 46;
  } else {
    // from low beside the victim, looking up at the blade coming down
    px = v.x + sx * 1.9 + F.dx * 0.6;
    pz = v.z + sz * 1.9 + F.dz * 0.6;
    py = 0.55 + e * 0.6;
    ((lx = mx), (ly = 1.55 - e * 0.6), (lz = mz));
    fov = 48;
  }
  dT.set(px, py, pz);
  if (!F.camSet) {
    F.camSet = true;
    cam.position.copy(dT);
    dLook.set(lx, ly, lz);
  } else cam.position.lerp(dT, Math.min(1, dt * 3));
  dLook.lerp(dV.set(lx, ly, lz), Math.min(1, dt * 4));
  const s = DUEL.shake;
  if (s > 0) cam.position.add(dV.set(rand(-s, s) * 0.12, rand(-s, s) * 0.12, rand(-s, s) * 0.12));
  cam.lookAt(dLook);
  cam.fov = fov;
}
function finEnd() {
  const F = DUEL.fin;
  DUEL.fin = null;
  if (F) {
    if (F.hit < 0) F.v.pooled = 0; // (otherwise its pool already spread)
    if (F.k.act !== 'dead') {
      F.k.start('idle');
      F.k.play('idle', 0.3);
    }
  }
  $('duel').classList.remove('cine');
  document.documentElement.classList.remove('cine');
  if ($('dMsg').querySelector('b').textContent) pop($('dMsg'), 'show');
}
