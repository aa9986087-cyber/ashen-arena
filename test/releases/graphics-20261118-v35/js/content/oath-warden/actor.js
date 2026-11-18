'use strict';
const WARDEN_MODEL_URL = new URL('../../../assets/models/oath-warden/model.glb?v=3', document.currentScript.src).href;
/* The owner's approved Dark Knight asset. Independent of the three existing addons. */
const WARDEN_ACTOR={asset:null,pending:null,rig:null,error:null,environment:null};
function wardenLoadModel(){
 if(WARDEN_ACTOR.asset)return Promise.resolve(WARDEN_ACTOR.asset);
 if(WARDEN_ACTOR.pending)return WARDEN_ACTOR.pending;
 WARDEN_ACTOR.pending=new Promise((resolve,reject)=>{
  new THREE.GLTFLoader().load(WARDEN_MODEL_URL,gl=>{
   const root=gl.scene;
   if(!WARDEN_ACTOR.environment){
    const env=new THREE.Scene();env.background=new THREE.Color(0x9aa5b5);
    const pmrem=new THREE.PMREMGenerator(renderer);WARDEN_ACTOR.environment=pmrem.fromScene(env,0.05,0.1,20);pmrem.dispose();
   }
   root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;
    for(const m of (Array.isArray(o.material)?o.material:[o.material])){if(m){m.envMap=WARDEN_ACTOR.environment.texture;m.envMapIntensity=1.1;m.needsUpdate=true;}}
   }});
   const clips={};
   for (const clip of gl.animations) {
    if (clip.name !== 'special') clips[clip.name] = ACTOR_MODELS.pinClip(clip, root);
    // Isolate the overhead cut from the source's longer combo.
    if (clip.name === 'attack3') {
     const slam = THREE.AnimationUtils.subclip(clip, 'special', 23, 76, 30);
     clips.special = ACTOR_MODELS.pinClip(slam, root);
    }
   }
   WARDEN_ACTOR.asset={root,clips};delete PORTRAITS.reaper;
   if(S.char==='reaper')buildPlayer();
   if(!$('chars').hidden)drawChars();
   resolve(WARDEN_ACTOR.asset);
  },undefined,error=>{WARDEN_ACTOR.error=String(error);reject(error);});
 }).catch(error=>{console.warn('Warden asset unavailable',error);return null;});
 return WARDEN_ACTOR.pending;
}
function wardenRelease(){
 const a=WARDEN_ACTOR.rig;if(!a)return;
 a.mixer.stopAllAction();a.mixer.uncacheRoot(a.root);a.g.parent?.remove(a.g);
 WARDEN_ACTOR.rig=null;
}
function wardenBounds(root){
 root.updateMatrixWorld(true);const box=new THREE.Box3(),v=new THREE.Vector3();
 root.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;if(o.isSkinnedMesh)o.skeleton.update();
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);if(o.isSkinnedMesh)o.boneTransform(i,v);v.applyMatrix4(o.matrixWorld);box.expandByPoint(v);}});
 return box;
}
function wardenBuildRig(R,wep){
 if(!WARDEN_ACTOR.asset){wardenLoadModel();return false;}
 wardenRelease();
 if(R.g){if(R.actor)actorReleaseRig(R);else R.g.parent?.remove(R.g);}
 const {root,clips}=WARDEN_ACTOR.asset,g=new THREE.Group(),fit=new THREE.Group();
 g.add(fit);fit.add(root);root.position.set(0,0,0);root.rotation.set(0,0,0);root.scale.setScalar(1);
 const mixer=new THREE.AnimationMixer(root),actions={};
 for(const [name,clip]of Object.entries(clips))actions[name]=mixer.clipAction(clip);
 actions.idle.play();mixer.update(0);
 const box=wardenBounds(root),size=box.getSize(new THREE.Vector3());
 const scale=3.15/Math.max(size.y,0.1);fit.scale.setScalar(scale);root.position.set(-(box.min.x+box.max.x)/2,-box.min.y,-(box.min.z+box.max.z)/2);fit.rotation.y=Math.PI/2;
 const upper={},lower={};
 const leg=/LeftUpLeg|LeftLeg|LeftFoot|LeftToe|RightUpLeg|RightLeg|RightFoot|RightToe|Hips/;
 for(const [name,clip]of Object.entries(clips)){
  if(['attack','attack2','attack3','bash','special','block','hurt'].includes(name)){
   const c=clip.clone();c.name=name+'Upper';c.tracks=c.tracks.filter(t=>!leg.test(t.name));upper[name]=mixer.clipAction(c);
  }
  if(['run','walk'].includes(name)){
   const c=clip.clone();c.name=name+'Lower';c.tracks=c.tracks.filter(t=>leg.test(t.name));lower[name]=mixer.clipAction(c);
  }
 }
 const a={g,fit,root,mixer,actions,upper,lower,role:'idle',previousTime:null,previousNow:null,swing:0,attackAt:-10,wasDead:false};
 WARDEN_ACTOR.rig=a;R.warden=a;R.g=g;R.char='reaper';R.actor=null;R.anim=R.hm=null;R.wpHand=false;
 for(const id of ['aL','aR','lL','lR'])R[id]=new THREE.Group();
 R.wp=new THREE.Group();g.add(R.wp);scene.add(g);
 return true;
}
function wardenSlamFrame(elapsed) {
 // Source frames 36 and 49 are the raised sword and the ground contact.
 const apex = 0.31;
 if (elapsed < apex) return 13 * elapsed / apex;
 if (elapsed < WARDEN_SLAM_IMPACT) {
  return 13 + 13 * ((elapsed - apex) / (WARDEN_SLAM_IMPACT - apex)) ** 1.7;
 }
 return 26 + 26 * (elapsed - WARDEN_SLAM_IMPACT) / (WARDEN_SLAM_DURATION - WARDEN_SLAM_IMPACT);
}
function wardenPose(R,p,wepId,playing,now){
 const a=R.warden;
 if(!a || a!==WARDEN_ACTOR.rig)return false;
 const clock=playing&&!p.dead?G.t:now*0.001,dt=a.previousTime===null?0:clamp(clock-a.previousTime,0,0.08);a.previousTime=clock;
 a.g.position.set(p.x,0,p.z);a.g.rotation.y=playing?p.face:Math.sin(now*0.0005)*0.3;
 const state=G.grave?.warden,special=state&&state.specialAt!==undefined?clock-state.specialAt:10;
 const specialActive=playing&&special>=0&&special<WARDEN_SLAM_DURATION&&!p.dead;
 if (specialActive && special < WARDEN_SLAM_IMPACT) {
  const progress = special / WARDEN_SLAM_IMPACT;
  a.g.position.y = 3.4 * Math.sin(Math.PI * progress) ** 0.82;
 }
 // Auto-attacks cannot restart or replace the special, even when movement changes.
 if(!specialActive&&p.swing>a.swing+0.1){a.attackAt=clock;a.attackIndex=((a.attackIndex??-1)+1)%3;a.variant=['attack','attack2','attack3'][a.attackIndex];}
 a.swing=p.swing;
 const moving = playing && (p.moving || p.dashT > 0) && !p.dead;
 let role=p.dead?'fall':specialActive?'special':clock-a.attackAt<0.6?(a.variant||'attack'):(moving?'run':'idle');
 if(!a.actions[role])role='idle';
 const upper=moving&&!specialActive&&a.upper[role],lower=upper&&a.lower.run;
 const changed=role!==a.role||!!upper!==a.layered;
 if(changed){
  const strideTime = a.layered ? a.lower.run.time : a.role === 'run' ? a.actions.run.time : 0;
  for(const action of [...Object.values(a.actions),...Object.values(a.upper),...Object.values(a.lower)])action.stop();
  const active=upper||a.actions[role];active.reset();
  if(!['idle','run','walk'].includes(role)){active.setLoop(THREE.LoopOnce,1);active.clampWhenFinished=true;}
  active.play();
  if (lower) {
   lower.reset().play();
   lower.time = strideTime;
  } else if (role === 'run') active.time = strideTime;
  a.role=role;a.layered=!!upper;
 }
 const active=upper||a.actions[role];
 const duration=role==='special'?WARDEN_SLAM_DURATION:['attack','attack2','attack3'].includes(role)?0.6:role==='fall'?0.8:null;
 if(duration)active.timeScale=active.getClip().duration/duration;else active.timeScale=moving?1.05:1;
 // A running lower body keeps its authored alignment even during a sword swing.
 const runningPose = role === 'run' || role === 'walk' || !!lower;
 const fitYaw = runningPose ? 0 : Math.PI / 2;
 a.fit.rotation.y += (fitYaw - a.fit.rotation.y) * Math.min(1,dt*16);
 if (specialActive && role === 'special') {
  active.paused = true;
  active.time = Math.min(active.getClip().duration, wardenSlamFrame(special) / 30);
 } else if (['attack','attack2','attack3'].includes(role)) {
  const t=clamp(clock-a.attackAt,0,0.6);
  const phase=t<0.18?t/0.18*0.25:t<0.32?0.25+(t-0.18)/0.14*0.45:0.7+(t-0.32)/0.28*0.3;
  active.paused=true;active.time=Math.min(0.999,phase)*active.getClip().duration;
 }else active.paused=false;
 a.mixer.update(dt);
 // Root position tracks are pinned; locomotion never pulls the actor away from its hitbox.
 return true;
}
let wardenScarMesh = null;
function buildWardenScar() {
 // Each crack is a tapered jagged strip. Branches spread unevenly from the impact
 // so the affected area reads as broken ground rather than a targeting circle.
 const dark = [], embers = [];
 function strip(vertices, points, width, y) {
  const edges = points.map(([x, z, taper], i) => {
   const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
   const dx = next[0] - prev[0], dz = next[1] - prev[1];
   const offset = width * taper / (Math.hypot(dx, dz) || 1);
   return [[x - dz * offset, y, z + dx * offset], [x + dz * offset, y, z - dx * offset]];
  });
  for (let i = 1; i < edges.length; i++) {
   const [a, b] = edges[i - 1], [c, d] = edges[i];
   vertices.push(...a, ...b, ...c, ...c, ...b, ...d);
  }
 }
 function crack(points, width) {
  strip(dark, points, width, 0);
  strip(embers, points, width * 0.3, 0.012);
 }
 for (let i = 0; i < 7; i++) {
  const angle = i * TAU / 7;
  const radius = [0.97, 0.75, 0.91, 0.69, 0.88, 0.8, 0.96][i];
  const points = [0, 0.19, 0.37, 0.55, 0.77, 1].map((distance, j) => {
   const bend = angle + (j % 2 ? 0.1 : -0.12) * (i % 2 ? -1 : 1);
   const reach = radius * distance;
   return [Math.cos(bend) * reach, Math.sin(bend) * reach, 1 - distance];
  });
  crack(points, 0.041);
  for (const j of [2, 3]) {
   const [x, z, taper] = points[j];
   const branch = angle + (j === 2 ? -0.68 : 0.62);
   crack([[x, z, taper], [x + Math.cos(branch) * 0.13, z + Math.sin(branch) * 0.13, taper * 0.6],
    [x + Math.cos(branch + 0.18) * 0.26, z + Math.sin(branch + 0.18) * 0.26, 0]], 0.023);
  }
 }
 const group = new THREE.Group();
 for (const [vertices, color] of [[dark, 0x100b08], [embers, 0xffa042]]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.MeshBasicMaterial({
   color, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = vertices === dark ? 1 : 2;
  group.add(mesh);
 }
 group.visible = false;
 scene.add(group);
 return group;
}
function renderWardenScar(playing) {
 const scar = playing && S.char === 'reaper' && G.grave?.warden?.scar;
 const age = scar ? G.t - scar.at : WARDEN_SCAR_DURATION;
 const visible = age >= 0 && age < WARDEN_SCAR_DURATION;
 if (!visible) {
  if (wardenScarMesh) wardenScarMesh.visible = false;
  return;
 }
 const mesh = wardenScarMesh || (wardenScarMesh = buildWardenScar());
 mesh.visible = true;
 mesh.position.set(scar.x, 0.065, scar.z);
 mesh.scale.set(scar.radius, 1, scar.radius);
 mesh.rotation.y = scar.angle;
 const fade = Math.min(1, (WARDEN_SCAR_DURATION - age) / 1.25);
 mesh.children[0].material.opacity = fade * 0.96;
 mesh.children[1].material.opacity = fade * (0.25 + 0.75 * Math.max(0, 1 - age / 0.85));
}
function wardenPortrait(){
 if(PORTRAITS.reaper)return PORTRAITS.reaper;
 if(!WARDEN_ACTOR.asset){wardenLoadModel();return null;}
 const tmp={},oldRig=WARDEN_ACTOR.rig;
 // Render the actual GLB at idle, then rebuild the local actor without sharing mixers.
 wardenBuildRig(tmp,{id:'scythe',lvl:1});
 const a=tmp.warden,world=new THREE.Scene(),target=new THREE.WebGLRenderTarget(260,260),previous=renderer.getRenderTarget();
 try{
  world.background=new THREE.Color(0x202735);world.add(a.g);a.mixer.update(0.05);a.g.rotation.y=-0.25;
  world.add(new THREE.HemisphereLight(0xe4edff,0x54505b,1.6));
  const light=new THREE.DirectionalLight(0xffe7cb,2.1);light.position.set(3,5,4);world.add(light);
  const bounds=wardenBounds(a.g),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  const camera=new THREE.PerspectiveCamera(32,1,0.1,100),distance=Math.max(size.y,size.x)/(2*Math.tan(16*Math.PI/180))*1.2;
  camera.position.copy(center).add(new THREE.Vector3(0,size.y*0.06,distance));camera.lookAt(center);
  renderer.setRenderTarget(target);renderer.render(world,camera);
  const bytes=new Uint8Array(260*260*4);renderer.readRenderTargetPixels(target,0,0,260,260,bytes);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=260;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(260,260);
  for(let y=0;y<260;y++)pixels.data.set(bytes.subarray((259-y)*1040,(260-y)*1040),y*1040);
  ctx.putImageData(pixels,0,0);return PORTRAITS.reaper=canvas.toDataURL('image/jpeg',0.9);
 }finally{
  renderer.setRenderTarget(previous);target.dispose();wardenRelease();
  if(S.char==='reaper')buildPlayer();
 }
}
const wardenBaseBuildWeapon=buildWeapon;
buildWeapon=function(R=PM,wep){if(R.warden){R.wp.visible=false;return;}return wardenBaseBuildWeapon(R,wep);};
