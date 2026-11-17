'use strict';
/* Oath Warden combat; legacy reaper save key preserves ownership and purchases. */
const OATH_WARDEN = Object.freeze({hp:165,spd:6.5,dmg:1.2,cost:6500,guardReduction:0.6,guardCooldown:1.2,specialCooldown:18});
const WARDEN_SLAM_IMPACT = 0.52;
const WARDEN_SLAM_DURATION = 0.88;
const WARDEN_SCAR_DURATION = 4.5;
function wardenState() {
  if (!G.grave) G.grave = {};
  return G.grave.warden || (G.grave.warden = {guardReadyAt:0,wardUntil:0,cleave:null,specialAt:-10});
}
function wardenCanAct() {
  return S.char === 'reaper' && G.state === 'play' && !G.p.dead && !choosingCards();
}
/* Source position is mandatory: unknown sources never receive a guessed directional block. */
function wardenBlockDamage(damage, source) {
  if (!wardenCanAct()) return damage;
  const p=G.p, s=wardenState();
  let result=damage;
  if (source && Number.isFinite(source.x) && Number.isFinite(source.z) && G.t>=s.guardReadyAt) {
    const dx=source.x-p.x,dz=source.z-p.z,d=Math.hypot(dx,dz);
    const front=d>0.01 && (dx*Math.sin(p.face)+dz*Math.cos(p.face))/d>=0.5;
    if (front) {result*=1-(OATH_WARDEN.guardReduction+0.05*(G.grave?.training?.soulvessel||0));s.guardReadyAt=G.t+OATH_WARDEN.guardCooldown;}
  }
  // The temporary special ward and directional guard do not multiply into near immunity.
  if (G.t<s.wardUntil) result=Math.min(result,damage*0.6);
  return result;
}
function wardenSpecial(power, damageRank=0, radiusRank=0) {
  if (!wardenCanAct() || wardenState().cleave || !Number.isFinite(power) || power<=0) return false;
  const p = G.p, s = wardenState();
  const rank = v => Number.isFinite(v) ? clamp(Math.floor(v), 0, 3) : 0;
  s.wardUntil = G.t + 3;
  s.specialAt = G.t;
  s.cleave = {
    at: G.t + WARDEN_SLAM_IMPACT,
    power: power * (1 + 0.15 * rank(damageRank)),
    frontPower: power * 0.55,
    radius: 7 * p.area * (1 + 0.08 * rank(radiusRank)),
  };
  return true;
}
function wardenTick() {
  if(!wardenCanAct())return;
  const s=wardenState(),q=s.cleave;
  if(!q || G.t<q.at)return;
  s.cleave=null; // Consume before damage callbacks: re-entry cannot repeat the cleave.
  const p = G.p, forwardX = Math.sin(p.face), forwardZ = Math.cos(p.face);
  s.scar = { x: p.x, z: p.z, radius: q.radius, angle: p.face, at: G.t };
  vfxSparks(p.x, 0.25, p.z, 22, [1.5, 0.83, 0.35], 14, 0.17, 0.32);
  vfxSmoke(p.x, 0.12, p.z, 10, [0.56, 0.47, 0.36, 0.42], 2, 1.1, 0.45, 0.5);
  AU.play('boom');
  shake(0.7);
  // Saves from earlier releases have already applied the frontal hit.
  if (q.frontPower > 0) {
    eachInRadius(p.x, p.z, 4, e => {
      const dx = e.x - p.x, dz = e.z - p.z, distance = Math.hypot(dx, dz);
      if (distance > 0.01 && (dx * forwardX + dz * forwardZ) / distance < 0.5) return;
      hit(e, q.frontPower, { aoe: 1, quiet: 1, noCrit: 1, grave: 1 });
      if (!e.dead) e.frz = Math.max(e.frz || 0, e.boss ? 0.2 : 1.4);
    });
  }
  eachInRadius(p.x,p.z,q.radius,e=>hit(e,q.power*1.8,{aoe:1,quiet:1,noCrit:1,grave:1}));
}
