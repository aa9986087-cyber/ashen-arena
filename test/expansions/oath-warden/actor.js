'use strict';
/* The owner's approved Dark Knight asset. Independent of the three existing addons. */
const WARDEN_ACTOR={asset:null,pending:null,rig:null,error:null,environment:null};
function wardenLoadModel(){
 if(WARDEN_ACTOR.asset)return Promise.resolve(WARDEN_ACTOR.asset);
 if(WARDEN_ACTOR.pending)return WARDEN_ACTOR.pending;
 WARDEN_ACTOR.pending=new Promise((resolve,reject)=>{
  new THREE.GLTFLoader().load(new URL('../../expansions/oath-warden/model.glb?v=3',location.href).href,gl=>{
   const root=gl.scene;
   if(!WARDEN_ACTOR.environment){
    const env=new THREE.Scene();env.background=new THREE.Color(0x9aa5b5);
    const pmrem=new THREE.PMREMGenerator(renderer);WARDEN_ACTOR.environment=pmrem.fromScene(env,0.05,0.1,20);pmrem.dispose();
   }
   root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;
    for(const m of (Array.isArray(o.material)?o.material:[o.material])){if(m){m.envMap=WARDEN_ACTOR.environment.texture;m.envMapIntensity=1.1;m.needsUpdate=true;}}
   }});
   const clips={};
   for(const clip of gl.animations){const prepared=clip.name==='special'?THREE.AnimationUtils.subclip(clip,'special',8,39,30):clip;clips[clip.name]=ACTOR_MODELS.pinClip(prepared,root);}
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
 if (a.trail) {
  a.trail.mesh.parent?.remove(a.trail.mesh);
  a.trail.mesh.geometry.dispose();
  a.trail.mesh.material.dispose();
 }
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
 const trail=R===PM?makeWardenTrail(root.getObjectByName('_Sword_Hand')):null;
 const a={g,fit,root,mixer,actions,upper,lower,trail,role:'idle',previousTime:null,previousNow:null,swing:0,attackAt:-10,wasDead:false};
 WARDEN_ACTOR.rig=a;R.warden=a;R.g=g;R.char='reaper';R.actor=null;R.anim=R.hm=null;R.wpHand=false;
 for(const id of ['aL','aR','lL','lR'])R[id]=new THREE.Group();
 R.wp=new THREE.Group();g.add(R.wp);scene.add(g);
 return true;
}
// Keep at most eight blade poses in one reusable mesh. The short ribbon follows
// the actual weapon in three dimensions instead of drawing a shape on the floor.
const WARDEN_TRAIL_SAMPLES = 8;
function makeWardenTrail(sword) {
 if (!sword?.geometry) return null;
 sword.geometry.computeBoundingBox();
 const blade = sword.geometry.boundingBox;
 const tip = new THREE.Vector3(0, 0, blade.min.z);
 const inner = new THREE.Vector3(0, 0, (blade.min.z + blade.max.z) / 2);
 const geometry = new THREE.BufferGeometry();
 const vertexCount = (WARDEN_TRAIL_SAMPLES - 1) * 6;
 for (const name of ['position', 'color']) {
  geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3)
    .setUsage(THREE.DynamicDrawUsage));
 }
 geometry.setDrawRange(0, 0);
 const material = new THREE.MeshBasicMaterial({
  vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  side: THREE.DoubleSide, toneMapped: false,
 });
 const mesh = new THREE.Mesh(geometry, material);
 mesh.frustumCulled = false;
 mesh.visible = false;
 scene.add(mesh);
 return { sword, tip, inner, mesh, times: new Float32Array(WARDEN_TRAIL_SAMPLES),
  points: new Float32Array(WARDEN_TRAIL_SAMPLES * 6), world: new THREE.Vector3(), count: 0 };
}
function updateWardenTrail(trail, clock, cutting, keepTrail) {
 if (!trail) return;
 const { times, points, mesh, sword, world } = trail;
 if (!keepTrail || clock < times[trail.count - 1]) trail.count = 0;
 while (trail.count && clock - times[0] > 0.12) {
  times.copyWithin(0, 1, trail.count);
  points.copyWithin(0, 6, trail.count * 6);
  trail.count--;
 }
 if (cutting && (!trail.count || clock - times[trail.count - 1] >= 1 / 90)) {
  if (trail.count === WARDEN_TRAIL_SAMPLES) {
   times.copyWithin(0, 1);
   points.copyWithin(0, 6);
   trail.count--;
  }
  sword.updateWorldMatrix(true, false);
  let offset = trail.count * 6;
  for (const end of [trail.inner, trail.tip]) {
   world.copy(end).applyMatrix4(sword.matrixWorld).toArray(points, offset);
   offset += 3;
  }
  times[trail.count++] = clock;
 }
 mesh.visible = trail.count > 1;
 if (!mesh.visible) return;
 const geometry = mesh.geometry, pos = geometry.attributes.position, col = geometry.attributes.color;
 let vertex = 0;
 for (let i = 1; i < trail.count; i++) {
  for (const index of [2*i-2, 2*i-1, 2*i+1, 2*i-2, 2*i+1, 2*i]) {
   const offset = index * 3;
   const fade = Math.max(0, 1 - (clock - times[index >> 1]) / 0.12);
   const brightness = fade * (index % 2 ? 1 : 0.08);
   pos.setXYZ(vertex, points[offset], points[offset + 1], points[offset + 2]);
   col.setXYZ(vertex++, brightness, brightness * 0.8, brightness * 0.54);
  }
 }
 geometry.setDrawRange(0, vertex);
 pos.needsUpdate = col.needsUpdate = true;
}
function wardenPose(R,p,wepId,playing,now){
 const a=R.warden;
 if(!a || a!==WARDEN_ACTOR.rig)return false;
 const clock=playing&&!p.dead?G.t:now*0.001,dt=a.previousTime===null?0:clamp(clock-a.previousTime,0,0.08);a.previousTime=clock;
 a.g.position.set(p.x,0,p.z);a.g.rotation.y=playing?p.face:Math.sin(now*0.0005)*0.3;
 const state=G.grave?.warden,special=state&&state.specialAt!==undefined?clock-state.specialAt:10;
 const specialActive=playing&&special>=0&&special<0.65&&!p.dead;
 // Auto-attacks cannot restart or replace the special, even when movement changes.
 if(!specialActive&&p.swing>a.swing+0.1){a.attackAt=clock;a.attackIndex=((a.attackIndex??-1)+1)%3;a.variant=['attack','attack2','attack3'][a.attackIndex];}
 a.swing=p.swing;
 let role=p.dead?'fall':specialActive?(special<0.18?'bash':'special'):clock-a.attackAt<0.6?(a.variant||'attack'):(playing&&p.moving?'run':'idle');
 if(!a.actions[role])role='idle';
 const moving=playing&&p.moving&&!p.dead;
 const upper=moving&&a.upper[role],lower=upper&&a.lower.run;
 const changed=role!==a.role||!!upper!==a.layered;
 if(changed){
  for(const action of [...Object.values(a.actions),...Object.values(a.upper),...Object.values(a.lower)])action.stop();
  const active=upper||a.actions[role];active.reset();
  if(!['idle','run','walk'].includes(role)){active.setLoop(THREE.LoopOnce,1);active.clampWhenFinished=true;}
  active.play();if(lower)lower.reset().play();a.role=role;a.layered=!!upper;
 }
 const active=upper||a.actions[role];
 const duration=role==='bash'?0.18:role==='special'?0.47:['attack','attack2','attack3'].includes(role)?0.6:role==='fall'?0.8:null;
 if(duration)active.timeScale=active.getClip().duration/duration;else active.timeScale=moving?1.05:1;
 a.fit.rotation.y += ((role==='run'||role==='walk'?0:Math.PI/2)-a.fit.rotation.y)*Math.min(1,dt*16);
 if(specialActive){active.paused=true;active.time=clamp((special-(role==='bash'?0:0.18))/(role==='bash'?0.18:0.47),0,0.999)*active.getClip().duration;}else if(['attack','attack2','attack3'].includes(role)){
  const t=clamp(clock-a.attackAt,0,0.6);
  const phase=t<0.18?t/0.18*0.25:t<0.32?0.25+(t-0.18)/0.14*0.45:0.7+(t-0.32)/0.28*0.3;
  active.paused=true;active.time=Math.min(0.999,phase)*active.getClip().duration;
 }else active.paused=false;
 a.mixer.update(dt);
 const cut = specialActive && special >= 0.24 && special < 0.43;
 updateWardenTrail(a.trail,clock,cut,playing && !p.dead && special>=0 && special<0.65);
 // Root position tracks are pinned; locomotion never pulls the actor away from its hitbox.
 return true;
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
