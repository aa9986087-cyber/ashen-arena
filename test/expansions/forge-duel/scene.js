const read=async url=>{
  const response=await fetch(url);
  if(!response.ok)throw new Error(url);
  return response.arrayBuffer();
};
const parse=bytes=>new Promise((resolve,reject)=>new THREE.GLTFLoader().parse(bytes,'',resolve,reject));
const lerp=(a,b,t)=>a+(b-a)*t;

function groundMaterial() {
  const size=1024,c=document.createElement('canvas');
  c.width=c.height=size;
  const g=c.getContext('2d');
  let seed=91;
  const noise=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  g.fillStyle='#28201c';g.fillRect(0,0,size,size);
  for(let y=0;y<12;y++)for(let x=-1;x<9;x++){
    const a=x*128+y%2*64,b=y*86,s=33+noise()*25;
    g.fillStyle=`rgb(${s+18},${s+10},${s+4})`;
    g.beginPath();g.moveTo(a+3,b+7);g.lineTo(a+121,b+3);g.lineTo(a+126,b+80);g.lineTo(a+6,b+84);g.closePath();g.fill();
    g.fillStyle='#987b5530';g.fillRect(a+8,b+5,112,2);
    for(let i=0;i<26;i++){
      g.fillStyle=i%2?'#cbb08b21':'#1c0e0b3b';
      g.fillRect(a+6+noise()*110,b+8+noise()*73,2+noise()*21,1+noise()*3);
    }
  }
  for(let i=0;i<19000;i++){
    g.fillStyle=i%2?'#d9ac7724':'#10090940';
    g.fillRect(noise()*size,noise()*size,1+noise()*3,1+noise()*2);
  }
  const tex=new THREE.CanvasTexture(c);
  tex.encoding=THREE.sRGBEncoding;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(2,2);tex.anisotropy=4;
  const bump=tex.clone();bump.encoding=THREE.LinearEncoding;bump.needsUpdate=true;
  return new THREE.MeshStandardMaterial({map:tex,bumpMap:bump,bumpScale:.066,roughness:.96});
}

function buildYard(scene) {
  scene.background=new THREE.Color(0x32374a);
  scene.fog=new THREE.FogExp2(0x65534f,.039);
  scene.add(new THREE.HemisphereLight(0xbabbd0,0x72482c,.48));
  const dome=new THREE.Mesh(new THREE.SphereGeometry(38,24,14),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color(0x1d243b)},horizon:{value:new THREE.Color(0xb97f62)}},
    vertexShader:'varying float height; void main(){ height=normalize(position).y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader:'varying float height; uniform vec3 top; uniform vec3 horizon; void main(){ gl_FragColor=vec4(mix(horizon,top,smoothstep(-.11,.53,height)),1.); }'
  }));
  dome.renderOrder=-20;scene.add(dome);
  const far=new THREE.MeshBasicMaterial({color:0x393a46});
  for(let i=0;i<16;i++){
    const reef=new THREE.Mesh(new THREE.ConeGeometry(2.8+(i%5)*.2,2.1+(i*3%7)*.45,5),far);
    reef.position.set((i%8-3.5)*3.8,-.8,i<8?24:-22);
    reef.rotation.y=i*.77;
    scene.add(reef);
  }
  const sky=new THREE.DirectionalLight(0xffd4a4,.75);
  sky.position.set(3,7,2);
  sky.castShadow=true;
  sky.shadow.mapSize.set(1024,1024);
  Object.assign(sky.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:20});
  sky.shadow.normalBias=.027;
  scene.add(sky);
  const rim=new THREE.DirectionalLight(0xabc3de,.63);rim.position.set(-2,4,-7);scene.add(rim);

  const floor=new THREE.Mesh(new THREE.PlaneGeometry(14,12),groundMaterial());
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const stone=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.98});
  const blocks=[], position=(x,y,z,w,h,d,rotation=0)=>blocks.push([x,y,z,w,h,d,rotation]);
  for(let row=0;row<5;row++) {
    const height=.57*row+.28;
    for(let col=-5;col<=5;col++){
      const x=col*1.18+(row%2)*.57;
      if(Math.abs(x)<1.03||(row>2&&Math.abs(x)>2.65))continue;
      position(x,height,5.34,1.15,.54,.47);
    }
    if(row<2)for(const side of [-1,1])for(let col=-6;col<=6;col++)position(side*5.73,height,col*.93+row%2*.45,.39,.53,.91);
    if(row<2)for(let col=-5;col<=5;col++)position(col*1.18+(row%2)*.57,height,-5.38,1.15,.54,.47);
  }
  for(let i=0;i<=10;i++){
    const a=Math.PI*i/10;
    position(Math.cos(a)*1.08,1.53+Math.sin(a)*1.09,5.07,.44,.35,.58,a-Math.PI/2);
  }
  for(const x of [-3.45,-1.33,1.33,3.45]){
    for(let y=0;y<(Math.abs(x)>3?4:5);y++)position(x,.34+y*.60,5.02,.46,.59,.76);
    position(x,.13,4.99,.66,.24,.93);
    position(x,Math.abs(x)>3?2.39:3,4.99,.62,.24,.91);
  }
  const masonry=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),stone,blocks.length);
  const transform=new THREE.Object3D();
  blocks.forEach(([x,y,z,w,h,d,r],i)=>{
    transform.position.set(x,y,z);transform.scale.set(w,h,d);transform.rotation.z=r;transform.updateMatrix();
    masonry.setMatrixAt(i,transform.matrix);
    masonry.setColorAt(i,new THREE.Color().setHSL(.068+(i%9)*.002,.24,.24+(i*7%12)*.009));
  });
  masonry.instanceMatrix.needsUpdate=true;
  masonry.receiveShadow=true;
  scene.add(masonry);
  const cloth=new THREE.MeshStandardMaterial({color:0x532b25,roughness:.94,side:THREE.DoubleSide});
  for(const side of [-1,1]){
    const flag=new THREE.Shape();
    flag.moveTo(-.37,.56);flag.lineTo(.37,.56);flag.lineTo(.37,-.34);flag.lineTo(0,-.62);flag.lineTo(-.37,-.34);flag.closePath();
    const hanging=new THREE.Mesh(new THREE.ShapeGeometry(flag),cloth);
    hanging.position.set(side*2.22,1.94,4.96);scene.add(hanging);
    const mark=new THREE.Mesh(new THREE.RingGeometry(.119,.144,4),new THREE.MeshBasicMaterial({color:0xbe8852,side:THREE.DoubleSide}));
    mark.position.copy(hanging.position).add(V(0,.17,-.008));mark.rotation.y=Math.PI;
    hanging.receiveShadow=true;scene.add(mark);
  }
  const dark=new THREE.MeshStandardMaterial({color:0x100c0e,roughness:1});
  const door=new THREE.Mesh(new THREE.BoxGeometry(2.0,2.8,.12),dark);
  door.position.set(0,1.4,5.82);scene.add(door);
  const iron=new THREE.MeshStandardMaterial({color:0x3d332c,roughness:.69,metalness:.74});
  for(let i=-3;i<=3;i++){
    const bar=new THREE.Mesh(new THREE.BoxGeometry(.065,2.78,.07),iron);
    bar.position.set(i*.25,1.39,5.33);scene.add(bar);
  }

  const warmth=new THREE.MeshBasicMaterial({color:0xf8a648});
  const torchLights=[];
  for(const [x,z] of [[-3.4,4.62],[3.4,4.62],[-5.65,-1.65],[5.65,-1.65]]){
    const cup=new THREE.Mesh(new THREE.CylinderGeometry(.23,.12,.14,10),iron);
    cup.position.set(x,1.84,z);scene.add(cup);
    const flame=new THREE.Mesh(new THREE.ConeGeometry(.103,.31,7),warmth);
    flame.position.set(x,2.05,z);scene.add(flame);
    const light=new THREE.PointLight(0xff9439,1.24,5.8,1.43);
    light.position.set(x,2.12,z+.10);scene.add(light);
    torchLights.push([flame,light]);
  }
  const c=document.createElement('canvas');c.width=c.height=64;
  const h=c.getContext('2d'),grad=h.createRadialGradient(32,32,4,32,32,32);
  grad.addColorStop(0,'rgba(14,10,9,.7)');grad.addColorStop(1,'rgba(14,10,9,0)');
  h.fillStyle=grad;h.fillRect(0,0,64,64);
  const shadow=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false});
  return {torchLights,shadow};
}

const nameToJoint={Head:'head',upperarm_r:'sr',lowerarm_r:'er',hand_r:'hr',
  upperarm_l:'sl',lowerarm_l:'el',hand_l:'hl',
  thigh_r:'tr',calf_r:'kr',foot_r:'fr',thigh_l:'tl',calf_l:'kl',foot_l:'fl'};
const childByBone={upperarm_r:'lowerarm_r',lowerarm_r:'hand_r',upperarm_l:'lowerarm_l',lowerarm_l:'hand_l',
  thigh_r:'calf_r',calf_r:'foot_r',thigh_l:'calf_l',calf_l:'foot_l'};
const order=['pelvis','spine_01','spine_02','spine_03','neck_01','Head',
  'upperarm_r','lowerarm_r','hand_r','upperarm_l','lowerarm_l','hand_l',
  'thigh_r','calf_r','foot_r','thigh_l','calf_l','foot_l'];
const tunics=[0x7795a1,0xaa7760,0x849374,0x9e8a61];

class Figurine {
  constructor(gltf, weapon, shadowMat, theme) {
    this.group=new THREE.Group();
    this.body=gltf.scene;
    this.group.add(this.body);
    this.body.updateMatrixWorld(true);
    let skeleton;
    this.body.traverse(o=>{
      if(!o.isSkinnedMesh)return;
      skeleton ||= o.skeleton;
      o.material=o.material.clone();
      if(o.material.name==='Trousers')o.material.color.setHex(tunics[theme]);
      else if(o.material.name.startsWith('Skin'))o.material.color.setHex([0xbd886c,0xad7c5f,0xc29371,0xa7765d][theme]);
      o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
    });
    this.bones=Object.fromEntries(skeleton.bones.map(b=>[b.name,b]));
    this.bind=Object.fromEntries(order.map(name=>{
      const b=this.bones[name];
      return [name,{at:b.getWorldPosition(V()),q:b.getWorldQuaternion(new THREE.Quaternion())}];
    }));
    this.weapon=weapon;
    this.weapon.traverse(o=>{if(o.isMesh)o.castShadow=true;});
    this.group.add(weapon);
    this.shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.53,1.40),shadowMat);
    this.shadow.rotation.x=-Math.PI/2;this.group.add(this.shadow);
    this.marks=[];
  }

  mark(mesh,key,offset,normal) {
    const name=Object.keys(nameToJoint).find(name=>nameToJoint[name]===key)||(key==='hips'?'pelvis':'spine_03');
    const bone=this.bones[name];
    const inverse=bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.group.add(mesh);
    this.marks.push({mesh,key,bone,offset:offset.clone().applyQuaternion(inverse),normal:normal.clone().applyQuaternion(inverse)});
    if(this.marks.length>10){
      const old=this.marks.shift().mesh;
      this.group.remove(old);old.geometry.dispose();
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    const maps=new Set();
    this.body.traverse(o=>{
      if(!o.isMesh)return;
      if(o.material.map)maps.add(o.material.map);
      o.geometry.dispose();o.material.dispose();
    });
    for(const map of maps)map.dispose();
    for(const {mesh} of this.marks)mesh.geometry.dispose();
    this.shadow.geometry.dispose();
  }

  pose(f) {
    const yaw=new THREE.Quaternion().setFromAxisAngle(UP,f.yaw);
    const axis=f.j.chest.p.clone().sub(f.j.hips.p).normalize();
    const tilt=new THREE.Quaternion().setFromUnitVectors(UP,axis);
    const frame=tilt.clone().multiply(yaw);
    const physical=name=>{
      if(nameToJoint[name])return f.j[nameToJoint[name]].p;
      if(name==='pelvis')return f.j.hips.p;
      const how=(this.bind[name].at.y-this.bind.pelvis.at.y)/(1.35-.95);
      if(name==='neck_01')return f.j.chest.p.clone().lerp(f.j.head.p,.60);
      return f.j.hips.p.clone().lerp(f.j.chest.p,how);
    };
    for(const name of order){
      const b=this.bones[name],proto=this.bind[name];
      const point=physical(name);
      const q=frame.clone().multiply(proto.q);
      if(childByBone[name]){
        const child=childByBone[name];
        const rest=this.bind[child].at.clone().sub(proto.at).normalize().applyQuaternion(frame);
        const current=physical(child).clone().sub(point).normalize();
        if(current.lengthSq()>.01)q.premultiply(new THREE.Quaternion().setFromUnitVectors(rest,current));
      }
      const parentFrame=b.parent.getWorldQuaternion(new THREE.Quaternion());
      b.position.copy(b.parent.worldToLocal(point.clone()));
      b.quaternion.copy(parentFrame.invert().multiply(q));
      b.updateWorldMatrix(false,false);
    }
    this.weapon.position.copy(f.hilt.p);
    const tip=f.tip.p.clone().sub(f.hilt.p).normalize();
    const cross=V(tip.z,0,-tip.x).normalize();
    if(cross.lengthSq()<.05)cross.set(1,0,0);
    this.weapon.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(cross,tip,cross.clone().cross(tip)));
    this.shadow.position.copy(f.j.hips.p).setY(.009);
    this.shadow.scale.setScalar(f.dead?1.24:1);
    for(const {mesh,key,bone,offset,normal} of this.marks){
      const q=bone.getWorldQuaternion(new THREE.Quaternion());
      mesh.position.copy(f.j[key].p).add(offset.clone().applyQuaternion(q));
      mesh.quaternion.setFromUnitVectors(V(0,0,1),normal.clone().applyQuaternion(q));
    }
  }
}
