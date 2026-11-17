'use strict';
/* Small shared geometries; no downloads, textures, dynamic lights, or unbounded particles. */
const GRAVE_GEO = {
  stone: new THREE.BoxGeometry(1, 1, 1), bone: new THREE.CylinderGeometry(0.12, 0.15, 1, 7),
  head: new THREE.SphereGeometry(1, 12, 9),
  rock: new THREE.DodecahedronGeometry(1, 0),
  robe: new THREE.CylinderGeometry(0.38, 0.66, 1.35, 12),
  hood: new THREE.SphereGeometry(1, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.72),
  ring: new THREE.TorusGeometry(0.48, 0.035, 5, 20),
};
const GRAVE_MAT = {};
function graveMaterial(color, glow = 0) {
  const key = color + ':' + glow;
  return GRAVE_MAT[key] || (matC['grave:' + key] = GRAVE_MAT[key] = new THREE.MeshStandardMaterial({
    color, emissive: glow, roughness: 0.82, metalness: 0.25,
  }));
}
function gravePart(parent, shape, color, x, y, z, sx, sy, sz, glow = 0) {
  const m = new THREE.Mesh(GRAVE_GEO[shape], graveMaterial(color, glow));
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true;
  parent.add(m); return m;
}
const graveBladeShape = new THREE.Shape();
graveBladeShape.moveTo(-0.08, -1.45);
graveBladeShape.quadraticCurveTo(0.75, -1.58, 1.35, -0.8);
graveBladeShape.quadraticCurveTo(0.7, -1.36, -0.08, -1.27);
graveBladeShape.closePath();
const GRAVE_BLADE = new THREE.ExtrudeGeometry(graveBladeShape, { depth: 0.055, bevelEnabled: true,
  bevelSegments: 1, steps: 1, bevelSize: 0.015, bevelThickness: 0.015, curveSegments: 10 });
for (const [key, geo] of Object.entries(GRAVE_GEO)) GEO['grave-' + key] = geo;
GEO['grave-blade'] = GRAVE_BLADE;
const graveSpade = new THREE.Shape();
graveSpade.moveTo(-0.43,0);graveSpade.lineTo(0.43,0);
graveSpade.quadraticCurveTo(0.62,-0.55,0,-0.95);graveSpade.quadraticCurveTo(-0.62,-0.55,-0.43,0);
const GRAVE_SPADE = new THREE.ExtrudeGeometry(graveSpade,{depth:0.11,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:0.025,bevelThickness:0.025});
GEO['grave-spade']=GRAVE_SPADE;
function graveScythe(t = 0, evolved = false) {
  const g = new THREE.Group(), col = evolved ? 0xb29ada : [0x9daea4, 0x80bca3, 0xd1dfae][t];
  gravePart(g, 'bone', 0x453b32, 0, -0.65, 0, 0.48, 2, 0.48);
  const blade = new THREE.Mesh(GRAVE_BLADE, graveMaterial(col, t || evolved ? 0x173d30 : 0));
  g.add(blade);
  for (let i = 0; i <= t; i++) gravePart(g, 'stone', 0x87937e, 0, -0.3 - i * 0.35, 0.055, 0.16, 0.09, 0.07);
  g.scale.setScalar(evolved ? 1.15 : 1 + t * 0.06);
  return g;
}
const graveBaseWeaponModel = weaponModel;
weaponModel = function (id, t, ev, tc) { return id === 'scythe' ? graveScythe(t, ev) : graveBaseWeaponModel(id, t, ev, tc); };
const graveBaseRig = buildRig;
buildRig = function (R, id, wep) {
  if (id !== 'reaper') return graveBaseRig(R, id, wep);
  if (typeof actorReleaseRig === 'function') actorReleaseRig(R);
  else if (R.g) scene.remove(R.g);
  const g = new THREE.Group();
  R.char = id; R.actor = null; R.g = g; R.hm = R.anim = null; R.wpHand = false;
  const cloth = 0x233932, bone = 0xb3b19a, iron = 0x47554d;
  gravePart(g, 'robe', cloth, 0, 0.95, 0, 1, 1, 0.8);
  gravePart(g, 'head', 0x152722, 0, 1.72, -0.12, 0.4, 0.45, 0.31);
  gravePart(g, 'hood', 0x172923, 0, 2.35, -0.04, 0.34, 0.42, 0.36);
  gravePart(g, 'head', bone, 0, 2.32, 0.22, 0.18, 0.22, 0.14);
  gravePart(g,'stone',0x26332d,0,2.29,0.36,0.025,0.065,0.015);
  for(let i=-1;i<=1;i++)gravePart(g,'stone',0x303b32,i*0.04,2.2,0.34,0.018,0.045,0.02);
  for (const sign of [-1, 1]) {
    gravePart(g, 'stone', 0x101d19, sign * 0.075, 2.36, 0.35, 0.105, 0.035, 0.025);
    gravePart(g, 'head', 0x8de2b7, sign * 0.075, 2.36, 0.369, 0.018, 0.011, 0.008, 0x3b8b64);
    gravePart(g, 'rock', iron, sign * 0.5, 1.72, 0, 0.23, 0.15, 0.27);
    for (let i = 0; i < 3; i++) {
      const rib = gravePart(g, 'bone', bone, sign * 0.2, 1.5 - i * 0.14, 0.3, 0.35, 0.28, 0.3);
      rib.rotation.z = sign * 1.05;
    }
  }
  gravePart(g, 'stone', 0x9d9469, 0, 0.83, 0.34, 0.18, 0.19, 0.07);
  for (let i = 0; i < 5; i++) {
    const flap = gravePart(g, 'stone', i % 2 ? 0x1b3029 : cloth, (i - 2) * 0.22, 0.55 + (i % 2) * 0.09,
      -0.36, 0.23, 1.05, 0.06); flap.rotation.x = -0.12;
  }
  const limb = (x, y, length, leg) => {
    const p = new THREE.Group(); p.position.set(x, y, 0); g.add(p);
    gravePart(p, 'bone', leg ? 0x1b2824 : cloth, 0, -length / 2, 0, leg ? 0.9 : 1.05, length, leg ? 1 : 1.1);
    gravePart(p, 'stone', leg ? 0x283a31 : bone, 0, -length, 0.03, leg ? 0.22 : 0.16, 0.16, leg ? 0.35 : 0.15);
    return p;
  };
  R.lL = limb(-0.21, 0.65, 0.5, true); R.lR = limb(0.21, 0.65, 0.5, true);
  R.aL = limb(-0.51, 1.76, 0.7, false); R.aR = limb(0.51, 1.76, 0.7, false);
  R.wp = new THREE.Group(); R.wp.position.y = -0.7; R.aR.add(R.wp); R.aR.rotation.x = -1.2;
  scene.add(g); buildWeapon(R, wep);
};
/* Dedicated portrait scene avoids the live menu's fog/objects obscuring the new hero. */
const graveBasePortrait = heroPortrait;
heroPortrait = function (id) {
  if (id !== 'reaper') return graveBasePortrait(id);
  if (PORTRAITS.reaper) return PORTRAITS.reaper;
  const rig = {}, portrait = new THREE.Scene(), target = new THREE.WebGLRenderTarget(220, 220);
  const previous = renderer.getRenderTarget();
  try {
    buildRig(rig, 'reaper', {id:'scythe',lvl:3});
    portrait.add(rig.g); rig.g.rotation.y = -0.22;
    rig.aR.rotation.x=0;rig.aR.rotation.z=-0.05;rig.wp.rotation.z=Math.PI;
    portrait.background = new THREE.Color(0x14251e);
    portrait.add(new THREE.HemisphereLight(0xd5e9dc, 0x25382d, 1.25));
    const light = new THREE.DirectionalLight(0xffe8c5, 1.6); light.position.set(3,5,4); portrait.add(light);
    const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
    cam.position.set(0.8,2.1,5.6); cam.lookAt(0.15,1.2,0);
    renderer.setRenderTarget(target); renderer.render(portrait,cam);
    const bytes = new Uint8Array(220*220*4);renderer.readRenderTargetPixels(target,0,0,220,220,bytes);
    const canvas = document.createElement('canvas');canvas.width=canvas.height=220;
    const ctx=canvas.getContext('2d'), pixels=ctx.createImageData(220,220);
    for(let y=0;y<220;y++)pixels.data.set(bytes.subarray((219-y)*880,(220-y)*880),y*880);
    ctx.putImageData(pixels,0,0);
    return PORTRAITS.reaper=canvas.toDataURL('image/jpeg',0.9);
  } finally { renderer.setRenderTarget(previous);target.dispose();if(rig.g)portrait.remove(rig.g); }
};
function gravekeeperModel() {
  const g = new THREE.Group(), stone = 0x65736a, dark = 0x303d35;
  gravePart(g, 'robe', dark, 0, 1.2, 0, 1.6, 1.5, 1.2);
  gravePart(g, 'rock', stone, 0, 2.02, 0, 0.88, 0.77, 0.62);
  gravePart(g, 'hood', 0x26392e, 0, 3, -0.1, 0.52, 0.5, 0.5);
  gravePart(g, 'head', 0xb9b698, 0, 2.92, 0.34, 0.28, 0.3, 0.19);
  for (const s of [-1, 1]) {
    gravePart(g, 'stone', 0x10241b, s * 0.12, 3, 0.51, 0.14, 0.05, 0.025);
    gravePart(g, 'head', 0x9ace9c, s * 0.12, 3, 0.53, 0.025, 0.015, 0.012, 0x3c713f);
    gravePart(g, 'stone', dark, s * 0.42, 0.45, 0.1, 0.5, 0.8, 0.65);
    gravePart(g, 'rock', 0x7e8374, s * 0.95, 2.15, 0, 0.44, 0.3, 0.48);
    for (let i = 0; i < 3; i++) {
      const slab = gravePart(g, 'stone', stone, s * (0.2 + i * 0.16), 2.1 - i * 0.17, 0.56, 0.18, 0.08, 0.08);
      slab.rotation.z = s * 0.3;
    }
  }
  for (let i = 0; i < 3; i++) {
    const slab = gravePart(g, 'stone', [0x83877a, 0x70796d, 0x9b9b87][i], (i - 1) * 0.55, 2.5, -0.6, 0.46, 1.3 + i * 0.13, 0.22);
    slab.rotation.z = (i - 1) * 0.24;
  }
  const arm = new THREE.Group(); arm.position.set(0.98, 2.1, 0); g.add(arm); g.userData.arm = arm;
  gravePart(arm, 'bone', dark, 0, -0.55, 0, 2.2, 1.1, 2.2);
  gravePart(arm, 'bone', 0x6b5941, 0, -0.35, 0.16, 0.65, 2.1, 0.65);
  const shovel=new THREE.Mesh(GRAVE_SPADE,graveMaterial(0x939d91));shovel.position.set(0,-1.08,0.16);shovel.castShadow=true;arm.add(shovel);
  gravePart(g, 'bone', dark, -1, 1.6, 0, 2.2, 1.1, 2.2);
  return g;
}
let graveBossModel = null;
const graveBaseActorBossRender = actorBossRender;
actorBossRender = function (e, now) {
  if (e.kind !== 6) { if (graveBossModel) graveBossModel.visible = false; return graveBaseActorBossRender(e, now); }
  if (!graveBossModel) { graveBossModel = gravekeeperModel(); scene.add(graveBossModel); }
  graveBossModel.visible = true;
  graveBossModel.position.set(e.x, (e.y || 0) + Math.abs(Math.sin(e.t * 2)) * 0.06, e.z);
  graveBossModel.rotation.y = e.face;
  graveBossModel.scale.setScalar(2.25);
  graveBossModel.userData.arm.rotation.x = e.graveSwingUntil > G.t ? -1.4 * Math.sin((e.graveSwingUntil - G.t) * Math.PI) : Math.sin(e.t * 2) * 0.1;
  return true;
};
const GRAVE_SPIRITS = [];
for (let i = 0; i < 3; i++) {
  const g = new THREE.Group();
  gravePart(g, 'head', 0x74bc9b, 0, 0.2, 0, 0.2, 0.26, 0.18, 0x225c40);
  gravePart(g, 'robe', 0x345d4e, 0, -0.08, 0, 0.32, 0.3, 0.32);
  g.visible = false; scene.add(g); GRAVE_SPIRITS.push(g);
}
const graveBaseRender = render;
const graveBasePoseRig = poseRig;
poseRig = function (R,p,wepId,playing,now) {
  graveBasePoseRig(R,p,wepId,playing,now);
  if(R !== PM || R.char !== 'reaper' || !playing || wepId !== 'scythe' || !G.grave)return;
  const t=G.t-G.grave.lastSweepAt;
  if(t>=0&&t<0.3) {R.aR.rotation.z=-1.5+3*t/0.3;R.aL.rotation.x=-0.65;}
};
render = function (dt, now) {
  const playing = G && ['play', 'cards', 'paused', 'count', 'ending'].includes(G.state);
  if (graveBossModel && (!playing || !G.boss || G.boss.kind !== 6 || G.boss.dead)) graveBossModel.visible = false;
  const ghosts = playing ? G.grave?.ghosts || [] : [];
  GRAVE_SPIRITS.forEach((m, i) => { m.visible = !!ghosts[i]; if (ghosts[i]) m.position.set(ghosts[i].x, 1.7 + Math.sin(now * 0.003 + i) * 0.18, ghosts[i].z); });
  graveBaseRender(dt, now);
  graveMeter();
};
