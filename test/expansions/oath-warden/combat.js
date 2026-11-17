'use strict';
/* Draft combat module. Not loaded by any release until the approved model arrives. */
const OATH_WARDEN = Object.freeze({hp:165,spd:6.5,dmg:1.2,cost:6500,guardReduction:0.6,guardCooldown:1.2,specialCooldown:18});
function wardenState() {
  if (!G.grave) G.grave = {};
  return G.grave.warden || (G.grave.warden = {guardReadyAt:0,wardUntil:0,cleave:null});
}
function wardenCanAct() {
  return S.char === 'oathwarden' && G.state === 'play' && !G.p.dead && !choosingCards();
}
/* Source position is mandatory: unknown sources never receive a guessed directional block. */
function wardenBlockDamage(damage, source) {
  if (!wardenCanAct()) return damage;
  const p=G.p, s=wardenState();
  let result=damage;
  if (source && Number.isFinite(source.x) && Number.isFinite(source.z) && G.t>=s.guardReadyAt) {
    const dx=source.x-p.x,dz=source.z-p.z,d=Math.hypot(dx,dz);
    const front=d>0.01 && (dx*Math.sin(p.face)+dz*Math.cos(p.face))/d>=0.5;
    if (front) {result*=1-OATH_WARDEN.guardReduction;s.guardReadyAt=G.t+OATH_WARDEN.guardCooldown;}
  }
  // The temporary special ward and directional guard do not multiply into near immunity.
  if (G.t<s.wardUntil) result=Math.min(result,damage*0.6);
  return result;
}
function wardenSpecial(power, damageRank=0, radiusRank=0) {
  if (!wardenCanAct() || wardenState().cleave || !Number.isFinite(power) || power<=0) return false;
  const p=G.p,s=wardenState(),f=p.face;
  const rank=v=>Number.isFinite(v)?clamp(Math.floor(v),0,3):0;
  s.wardUntil=G.t+3;
  s.cleave={at:G.t+0.28,power:power*(1+0.15*rank(damageRank)),radius:7*p.area*(1+0.08*rank(radiusRank))};
  ring(p.x,p.z,0.5,4,0.28,[0.8,0.9,1.2]);
  eachInRadius(p.x,p.z,4,e=>{
    const dx=e.x-p.x,dz=e.z-p.z,d=Math.hypot(dx,dz);
    if(d>0.01 && (dx*Math.sin(f)+dz*Math.cos(f))/d<0.5)return;
    hit(e,power*0.55,{aoe:1,quiet:1,noCrit:1,grave:1});
    if(!e.dead)e.frz=Math.max(e.frz||0,e.boss?0.2:1.4);
  });
  return true;
}
function wardenTick() {
  if(!wardenCanAct())return;
  const s=wardenState(),q=s.cleave;
  if(!q || G.t<q.at)return;
  s.cleave=null; // Consume before damage callbacks: re-entry cannot repeat the cleave.
  const p=G.p;
  ring(p.x,p.z,0.5,q.radius,0.4,[1.1,0.85,0.4]);
  eachInRadius(p.x,p.z,q.radius,e=>hit(e,q.power*1.8,{aoe:1,quiet:1,noCrit:1,grave:1}));
}
