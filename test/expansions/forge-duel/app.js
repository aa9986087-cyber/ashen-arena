const $=id=>document.getElementById(id);
const canvas=$('arena');
const localControl=neutral(), keys=new Set(), pointerResets=[];
let renderer,scene,camera,world,weaponSource,figureBytes,gear={};
let selected='sword', category='all', models=[], showcase, bout, running=false, localIndex=0;
let count=2, last=0, flashUntil=0, hintUntil=0, fx=[], lastEvent=null, frame=0;
let room=null, loadingMatch=false;
const fxShape=new THREE.IcosahedronGeometry(1,0);
const dropsMat=new THREE.MeshStandardMaterial({color:0x6e1a16,roughness:.38});
const sparksMat=new THREE.MeshBasicMaterial({color:0xffc278});
const cutMat=new THREE.MeshStandardMaterial({color:0x701e18,roughness:.58,side:THREE.DoubleSide});

function resize() {
  if(!renderer)return;
  renderer.setSize(innerWidth,innerHeight,false);
  camera.aspect=innerWidth/innerHeight;
  camera.fov=camera.aspect<1?57:47;
  camera.updateProjectionMatrix();
}

async function model(id,tint) {
  const rig=await parse(figureBytes.slice(0));
  const weapon=weaponSource.getObjectByName(id)?.clone(true);
  if(!weapon)throw new Error('السلاح غير متاح');
  return new Figurine(rig,weapon,world.shadow,tint);
}

async function viewWeapon() {
  const id=selected;
  const next=await model(id,0);
  if(id!==selected||running){next.dispose(scene);return;}
  if(showcase)showcase.dispose(scene);
  showcase=next;
  scene.add(next.group);
  const preview=new Fighter(gear[id],-1.33,0,.36,0);
  const trainingTarget=new Fighter(gear.sword,-.37,3.4,Math.PI,1);
  preview.input.guard=true;
  for(let i=0;i<110;i++){
    preview.drive(trainingTarget,i*STEP);preview.integrate();
    for(let n=0;n<6;n++)preview.constrain();
  }
  showcase.pose(preview);
}

function showSelected() {
  $('gear-name').textContent=gear[selected].name;
  $('gear-preview').src='assets/'+selected+'.webp';
}

function showCards() {
  $('cards').replaceChildren();
  for(const [id,weapon] of Object.entries(gear)){
    if(category!=='all' && category!==weapon.type)continue;
    const item=document.createElement('button'), img=document.createElement('img');
    item.type='button';item.dataset.id=id;item.setAttribute('aria-pressed',String(id===selected));
    img.src='assets/'+id+'.webp';img.alt='';
    item.append(img,weapon.name);
    item.onclick=()=>{
      selected=id;showSelected();
      try{localStorage.setItem('ashen_42_gear',id);}catch{}
      $('catalog').close();viewWeapon().catch(showError);
    };
    $('cards').append(item);
  }
  for(const b of $('filters').children)b.setAttribute('aria-pressed',String(b.dataset.category===category));
}

function status(message) {
  $('combat-message').textContent=message;
  flashUntil=performance.now()+1150;
}

function effects(event) {
  lastEvent=event;
  if(event.type==='end'){
    clearControls();
    status(event.winner<0?'تعادل':event.winner===localIndex?'حسمت المواجهة':'سقطت في الحلبة');
    return;
  }
  if(event.type==='hit'||event.type==='fall'){
    if(event.f===bout.fighters[localIndex])status('إصابة • '+event.zone);
    if(event.type==='fall')status(event.f===bout.fighters[localIndex]?'سقطت':'الخصم سقط');
    const target=models[bout.fighters.indexOf(event.f)];
    if(target){
      const w=event.f.injuries.at(-1);
      if(w){
        const mark=new THREE.Mesh(new THREE.CircleGeometry(.042+event.amount*.001,12),cutMat);
        mark.scale.set(1.4,.34,1);
        target.mark(mark,w.key,w.offset.clone().addScaledVector(event.normal,.006),event.normal);
      }
    }
  }
  if(!event.at)return;
  const isClash=event.type==='clash', n=isClash?16:Math.min(25,7+Math.ceil(event.amount*.80));
  for(let i=0;i<n;i++){
    const p=new THREE.Mesh(fxShape,isClash?sparksMat:dropsMat);
    p.position.copy(event.at);
    p.scale.setScalar(isClash?.012+Math.random()*.012:.016+Math.random()*.008);
    scene.add(p);
    const v=V((Math.random()-.5)*2.6,.85+Math.random()*2.9,(Math.random()-.5)*2.6)
      .addScaledVector(event.normal,isClash?1.1:.9);
    fx.push({p,v,t:.25+Math.random()*.48});
  }
  audioHit(isClash,event.amount);
}

let sound;
function audioHit(metal,power) {
  if(!sound||sound.state!=='running')return;
  const o=sound.createOscillator(), g=sound.createGain(), t=sound.currentTime;
  o.type=metal?'triangle':'sine';
  o.frequency.setValueAtTime(metal?795+power*46:110+power*3,t);
  o.frequency.exponentialRampToValueAtTime(metal?310:41,t+.115);
  g.gain.setValueAtTime(metal?.066:.11,t);
  g.gain.exponentialRampToValueAtTime(.001,t+.15);
  o.connect(g);g.connect(sound.destination);o.start(t);o.stop(t+.16);
}

function enableSound() {
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(Audio&&!sound)sound=new Audio();
  sound?.resume().catch(()=>{});
}

function clearModels() {
  for(const item of models)item.dispose(scene);
  models=[];
  for(const {p} of fx)scene.remove(p);
  fx=[];
}

async function startMatch(num=2, network=null) {
  if(loadingMatch)return;
  loadingMatch=true;
  count=num;
  localIndex=network?.host===false?1:0;
  const mine=network?.host===false?network.hostGear:selected;
  const rival=network?.guestGear|| (selected==='sword'?'axe':'sword');
  clearControls();enableSound();
  $('load-status').textContent='جاري تجهيز المقاتلين…';
  const next=new Bout(gear,mine,rival,num,event=>{
    effects(event);
    if(network?.host)roomEvent(event);
  });
  let loaded;
  try{loaded=await Promise.all(next.fighters.map(f=>model(Object.keys(gear).find(k=>gear[k]===f.gear),f.tint)));}
  finally{loadingMatch=false;}
  if(network && room!==network) {
    for(const m of loaded)m.dispose(scene);
    return;
  }
  if(!network){
    for(let i=0;i<40;i++) next.tick(next.fighters.map(()=>neutral()));
    next.time=0;
  }
  clearModels();
  bout=next;models=loaded;
  for(const item of models)scene.add(item.group);
  if(showcase)showcase.group.visible=false;
  $('lobby').hidden=true;
  $('fight').hidden=false;
  $('result').hidden=true;
  $('retry').hidden=!!network;
  $('rival-score').querySelector('b').textContent=num===4?'أقرب خصم':'الخصم';
  clearControls();
  hintUntil=performance.now()+5000;
  running=true;last=0;
  if(network)network.started=true;
  $('rooms').close();
  $('load-status').textContent='';
}

function leave() {
  closeRoom();
  running=false;bout=null;
  clearControls();clearModels();
  if(showcase)showcase.group.visible=true;
  $('fight').hidden=true;$('lobby').hidden=false;$('load-status').textContent='';
}

function render(dt,now) {
  for(const [flame,light] of world.torchLights){
    const wave=Math.sin(now*.013+flame.position.x)+Math.sin(now*.008+flame.position.z);
    flame.scale.y=1+wave*.13;light.intensity=1.18+wave*.14;
  }
  if(running&&bout){
    if(room&&!room.host)guestAdvance(dt);
    else{
      const controls=[localControl];
      if(room)controls[1]=performance.now()-room.lastInput<620?room.remoteInput:neutral();
      bout.advance(dt,controls);
      if(room?.host)sendSnapshot();
    }
    if(room)roomTick();
    if(!running)return;
    bout.fighters.forEach((f,i)=>models[i].pose(f));
    const f=bout.fighters[localIndex];
    const foes=bout.fighters.filter(q=>q!==f&&!q.dead);
    const rival=foes.reduce((a,b)=>!a||f.spot.distanceToSquared(b.spot)<f.spot.distanceToSquared(a.spot)?b:a,null)||bout.fighters[1-localIndex];
    const front=V(Math.sin(f.yaw),0,Math.cos(f.yaw)),side=V(front.z,0,-front.x);
    const aim=f.j.hips.p.clone().lerp(rival.j.hips.p,.36).setY(innerWidth<innerHeight?1.0:1.09);
    const behind=f.j.hips.p.clone().addScaledVector(front,innerWidth<innerHeight?-4.65:-3.6).addScaledVector(side,-.95).setY(2.33);
    if(camera.position.distanceToSquared(behind)>52)camera.position.copy(behind);
    else camera.position.lerp(behind,1-Math.exp(-9*dt));
    camera.lookAt(aim);
    if(frame%4===0)hud(f,rival,now);
  }else{
    const portrait=innerWidth<innerHeight;
    camera.position.set(portrait?-1.16:-.85,portrait?1.66:1.62,portrait?3.58:3.23);
    camera.lookAt(portrait?-1.41:-.21,portrait?.78:1.04,0);
  }
  for(let i=fx.length-1;i>=0;i--){
    const drop=fx[i];drop.t-=dt;
    if(drop.t<=0){scene.remove(drop.p);fx.splice(i,1);continue;}
    drop.v.y-=9.8*dt;
    drop.p.position.addScaledVector(drop.v,dt);
    if(drop.p.position.y<.021){drop.p.position.y=.021;drop.v.multiplyScalar(.16);}
  }
  renderer.render(scene,camera);
}

function hud(f,rival,now){
  for(const [id,fig] of [['me-score',f],['rival-score',rival]]){
    $(id).querySelector('.bar i').style.width=fig.hp+'%';
    $(id).querySelector('.balance i').style.width=fig.breath+'%';
  }
  const time=Math.max(0,Math.ceil(100-bout.time));
  $('clock').value=Math.floor(time/60)+':'+String(time%60).padStart(2,'0');
  if(now>flashUntil&&!bout.end)$('combat-message').textContent=now<hintUntil?'اسحب النصل، وحرّك قدميك لتضبط المسافة':'';
  if(bout.end && bout.time-bout.end>=1.65 && $('result').hidden){
    $('verdict').textContent=bout.winner<0?'تعادل':bout.winner===localIndex?'فزت بالمبارزة':'خسرت المبارزة';
    $('result').hidden=false;
  }
}

function loop(now){
  requestAnimationFrame(loop);
  const dt=last?Math.min(.05,(now-last)/1000):.016;
  last=now;frame++;
  if(!document.hidden)render(dt,now);
}

function hold(id,key){
  const el=$(id);
  let pointer=null;
  const clear=()=>{
    if(pointer!==null&&el.hasPointerCapture(pointer))el.releasePointerCapture(pointer);
    pointer=null;localControl[key]=false;el.setAttribute('aria-pressed','false');
  };
  el.addEventListener('pointerdown',e=>{
    if(!running||bout?.end||pointer!==null||e.button!==0)return;
    e.preventDefault();pointer=e.pointerId;el.setPointerCapture(pointer);
    localControl[key]=true;el.setAttribute('aria-pressed','true');
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,e=>{if(e.pointerId===pointer)clear();});
  pointerResets.push(clear);
}

function pad(id,weapon){
  const el=$(id);
  let pointer=null;
  const zero=()=>{
    if(pointer!==null&&el.hasPointerCapture(pointer))el.releasePointerCapture(pointer);
    pointer=null;
    if(weapon)Object.assign(localControl,{ax:0,ay:0,held:false});
    else Object.assign(localControl,{mx:0,my:0});
    el.classList.remove('active');el.style.setProperty('--x','0px');el.style.setProperty('--y','0px');
  };
  const aim=e=>{
    const b=el.getBoundingClientRect(), radius=b.width*.41;
    let x=(e.clientX-b.left-b.width/2)/radius,y=(e.clientY-b.top-b.height/2)/radius;
    const dist=Math.hypot(x,y);
    if(dist>1){x/=dist;y/=dist;}
    const scale=dist<.105?0:(Math.min(1,dist)-.105)/(.895*Math.max(.105,Math.min(dist,1)));
    x*=scale;y*=scale;
    if(weapon)Object.assign(localControl,{ax:x,ay:-y,held:true});
    else Object.assign(localControl,{mx:x,my:-y});
    el.style.setProperty('--x',x*radius*.64+'px');el.style.setProperty('--y',y*radius*.64+'px');
  };
  el.addEventListener('pointerdown',e=>{
    if(!running||bout?.end||pointer!==null||e.button!==0)return;
    e.preventDefault();pointer=e.pointerId;el.setPointerCapture(pointer);el.classList.add('active');aim(e);
  });
  el.addEventListener('pointermove',e=>{if(e.pointerId===pointer)aim(e);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,e=>{if(e.pointerId===pointer)zero();});
  pointerResets.push(zero);
}

function clearControls(){
  for(const reset of pointerResets)reset();
  Object.assign(localControl,neutral());keys.clear();
}

function handleKey(e,on){
  if(!running||['INPUT','BUTTON'].includes(e.target.tagName?e.target.tagName:''))return;
  if(e.code==='Escape'&&on){leave();return;}
  if(!['KeyA','KeyD','KeyW','KeyS','ShiftLeft','Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code))return;
  e.preventDefault();on?keys.add(e.code):keys.delete(e.code);
  const dir=(a,b)=>Number(keys.has(a))-Number(keys.has(b));
  Object.assign(localControl,{mx:dir('KeyD','KeyA'),my:dir('KeyW','KeyS'),guard:keys.has('ShiftLeft'),push:keys.has('Space'),
    ax:dir('ArrowRight','ArrowLeft'),ay:dir('ArrowUp','ArrowDown'),held:['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].some(c=>keys.has(c))});
}
function showError(){
  $('load-status').textContent='تعذّر تجهيز الحلبة. حدّث الصفحة وحاول مرة ثانية.';
}
async function boot(){
  try{
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(1.5,devicePixelRatio||1));
    renderer.outputEncoding=THREE.sRGBEncoding;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(48,1,.09,46);world=buildYard(scene);
    resize();addEventListener('resize',resize);addEventListener('orientationchange',clearControls);
    const [weaponBytes,body,stats]=await Promise.all([read('assets/weapons.glb'),read('assets/figures.glb'),
      fetch('weapons.json').then(r=>{if(!r.ok)throw new Error('weapons');return r.json();})]);
    figureBytes=body;weaponSource=(await parse(weaponBytes)).scene;gear=stats;
    try{const saved=localStorage.getItem('ashen_42_gear');if(Object.hasOwn(gear,saved))selected=saved;}catch{}
    showSelected();await viewWeapon();showCards();
    for(const id of ['train','melee','open-weapons','online'])$(id).disabled=false;
    $('load-status').textContent='';
    requestAnimationFrame(loop);
  }catch(error){console.error(error);showError();}
}
for(const [id,number] of [['train',2],['melee',4],['retry',0]])$(id).onclick=()=>startMatch(number||count).catch(showError);
for(const id of ['exit','back'])$(id).onclick=leave;
for(const [kind,label] of [['all','الكل'],['edge','قطع'],['point','طعن'],['blunt','طرق']]){
  const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.category=kind;
  b.onclick=()=>{category=kind;showCards();};$('filters').append(b);
}
$('open-weapons').onclick=()=>{$('catalog').showModal();showCards();};
$('online').onclick=()=>$('rooms').showModal();
for(const dialog of ['catalog','rooms'])$(dialog).querySelector('.close').onclick=()=>$(dialog).close();
pad('feet',false);pad('blade',true);hold('guard','guard');hold('push','push');
addEventListener('keydown',e=>handleKey(e,true));
addEventListener('keyup',e=>handleKey(e,false));
addEventListener('blur',clearControls);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearControls();});
boot();
