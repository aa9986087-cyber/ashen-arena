/* Position constraints run at a fixed rate. The same bodies drive contact, visuals and falls. */
const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const limit = (x,a,b) => Math.max(a, Math.min(b,x));
const STEP = 1/90;
const UP = V(0,1);
const JOINTS = [
  ['hips',0,.95,0,.15,3], ['chest',0,1.35,0,.17,3], ['head',0,1.60,-.025,.108,.9],
  ['sr',-.212,1.455,-.055,.077,.65], ['er',-.46,1.455,-.055,.061,.55], ['hr',-.70,1.455,-.055,.056,.55],
  ['sl',.212,1.455,-.055,.077,.65], ['el',.46,1.455,-.055,.061,.55], ['hl',.70,1.455,-.055,.056,.55],
  ['tr',-.114,.97,0,.102,1.15], ['kr',-.114,.54,0,.083,.87], ['fr',-.114,.086,-.03,.084,.72],
  ['tl',.114,.97,0,.102,1.15], ['kl',.114,.54,0,.083,.87], ['fl',.114,.086,-.03,.084,.72],
];
const LINKS = [
  ['hips','chest'],['chest','head'],['chest','sr'],['chest','sl'],['sr','sl'],['sr','head'],['sl','head'],
  ['hips','sr'],['hips','sl'],['sr','er'],['er','hr'],['sl','el'],['el','hl'],
  ['hips','tr'],['hips','tl'],['tr','tl'],['tr','chest'],['tl','chest'],['tr','kr'],['kr','fr'],['tl','kl'],['kl','fl'],
];
const ZONES = [
  ['الرأس','head','head',.123,1.28],['الصدر','hips','chest',.225,1],
  ['الذراع اليمنى','sr','er',.078,.77],['الساعد الأيمن','er','hr',.068,.73],
  ['الذراع اليسرى','sl','el',.078,.77],['الساعد الأيسر','el','hl',.068,.73],
  ['الساق اليمنى','tr','kr',.113,.78],['الساق اليمنى','kr','fr',.087,.72],
  ['الساق اليسرى','tl','kl',.113,.78],['الساق اليسرى','kl','fl',.087,.72],
];
const neutral = () => ({mx:0,my:0,ax:0,ay:0,held:false,guard:false,push:false});

function particle(position, radius, mass) {
  return {p:position, old:position.clone(), r:radius, inv:1/mass};
}

function links(a,b,length) {
  const move = b.p.clone().sub(a.p);
  const span = move.length();
  if (span < .0001) return;
  move.multiplyScalar((span-length)/(span*(a.inv+b.inv)));
  a.p.addScaledVector(move,a.inv);
  b.p.addScaledVector(move,-b.inv);
}

function attraction(p, goal, strength, cap=.09) {
  const displacement = goal.clone().sub(p.p);
  const distance = displacement.length();
  if (distance > .00001) p.p.addScaledVector(displacement, Math.min(strength, cap/distance));
}

function closest(p,q,a,b) {
  const u=q.clone().sub(p),v=b.clone().sub(a),w=p.clone().sub(a);
  const uu=u.dot(u), vv=v.dot(v), uv=u.dot(v), ud=u.dot(w), vd=v.dot(w);
  const det=uu*vv-uv*uv;
  let s=det>1e-8 ? limit((uv*vd-ud*vv)/det,0,1) : 0;
  let t=vv>1e-8 ? limit((uv*s+vd)/vv,0,1) : 0;
  if(uu>1e-8) s=limit((uv*t-ud)/uu,0,1);
  if(vv>1e-8) t=limit((uv*s+vd)/vv,0,1);
  const x=p.clone().addScaledVector(u,s), y=a.clone().addScaledVector(v,t);
  return {s,t,x,y,d:x.distanceTo(y)};
}

function velocity(a,b,f) {
  return a.p.clone().sub(a.old).lerp(b.p.clone().sub(b.old),f).divideScalar(STEP);
}

class Fighter {
  constructor(gear, x,z, yaw, tint) {
    this.input=neutral();
    this.gear=gear;
    this.tint=tint;
    this.hp=100;
    this.breath=100;
    this.legs=0;
    this.arm=0;
    this.dead=false;
    this.yaw=yaw;
    this.spot=V(x,0,z);
    this.walk=V();
    this.step=0;
    this.injuries=[];
    this.j={};
    for(const [name,a,b,c,r,m] of JOINTS) this.j[name]=particle(V(a,b,c).applyAxisAngle(UP,yaw).add(this.spot),r,m);
    this.parts=JOINTS.map(([n])=>this.j[n]);
    this.links=LINKS.map(([a,b])=>[this.j[a],this.j[b],this.j[a].p.distanceTo(this.j[b].p)]);
    const hand=this.j.hr.p.clone().add(V(.04,0,.07).applyAxisAngle(UP,yaw));
    this.hilt=particle(hand,.05,gear.mass*.74);
    this.tip=particle(hand.clone().addScaledVector(V(-.5,.38,.77).normalize().applyAxisAngle(UP,yaw),gear.tip),.055,gear.mass);
    this.cool=0;
  }

  drive(rival) {
    const u=this.input;
    const desiredYaw=Math.atan2(rival.spot.x-this.spot.x,rival.spot.z-this.spot.z);
    const diff=Math.atan2(Math.sin(desiredYaw-this.yaw),Math.cos(desiredYaw-this.yaw));
    this.yaw+=limit(diff,-.048,.048);
    const forward=V(Math.sin(this.yaw),0,Math.cos(this.yaw)), right=V(-forward.z,0,forward.x);
    const stick=right.clone().multiplyScalar(u.mx).addScaledVector(forward,u.my);
    if(stick.lengthSq()>1) stick.normalize();
    const scale=(1-this.legs*.40)*(u.guard?.52:u.held?.80:1);
    this.walk.lerp(stick.multiplyScalar(2.20*scale),.13);
    this.spot.addScaledVector(this.walk,STEP);
    this.spot.x=limit(this.spot.x,-4.9,4.9);
    this.spot.z=limit(this.spot.z,-4.1,4.1);
    this.step+=this.walk.length()*STEP*5.9;
    const stride=Math.min(.34,this.walk.length()*.17);
    const dir=this.walk.clone().normalize();
    const active=u.held||u.guard||u.push;
    this.breath=limit(this.breath+(active?-10:23)*STEP,0,100);
    const armForce=(.66+this.breath*.0034)*(1-this.arm*.46);

    const along=(x,y,z)=>this.spot.clone().addScaledVector(right,x).addScaledVector(forward,z).setY(y);
    attraction(this.j.hips,along(0,.925+Math.cos(this.step*2)*stride*.089,0),.31);
    attraction(this.j.chest,along(0,1.325,this.walk.dot(forward)*.037),.34);
    attraction(this.j.head,along(0,1.61,.014),.22);
    attraction(this.j.sr,along(.213,1.435,0),.36);
    attraction(this.j.sl,along(-.213,1.435,0),.36);
    attraction(this.j.tr,along(.115,.958,0),.26);
    attraction(this.j.tl,along(-.115,.958,0),.26);
    for(const [hand,knee,side,phase] of [['fr','kr',1,0],['fl','kl',-1,Math.PI]]){
      const t=this.step+phase;
      const foot=along(side*.122,.086+Math.max(0,Math.sin(t))*stride*.48,-side*.046)
        .addScaledVector(dir,Math.cos(t)*stride);
      attraction(this.j[hand],foot,.42);
      attraction(this.j[knee],along(side*.13,.535,.115).addScaledVector(dir,Math.cos(t)*stride*.38),.17);
    }

    const steer=u.held?u.ax:0;
    const lift=u.held?u.ay:0;
    const theta=u.guard ? 1.19 : u.push ? steer*.43 : u.held ? -.15+steer*(this.gear.type==='point'?.93:1.56) : .53;
    const pitch=u.guard?.34:u.push?.10+lift*.47:u.held?.20+lift*1.08:.43;
    const axis=forward.clone().multiplyScalar(Math.cos(theta)*Math.cos(pitch))
      .addScaledVector(right,Math.sin(theta)*Math.cos(pitch)).addScaledVector(UP,Math.sin(pitch));
    const grip=u.guard?along(.11,1.20,.41):along(.205+steer*.28,1.19+lift*.27,u.push?.61:.41+Math.max(0,1-Math.abs(steer))*.11);
    attraction(this.j.hr,grip,.45*armForce);
    attraction(this.j.er,along(.355+Math.max(0,steer)*.10,1.14,.15),.19);
    attraction(this.j.el,along(-.35,1.10,.12),.14);
    const second=this.gear.two&&(u.push||u.guard||Math.abs(steer)<.73);
    attraction(this.j.hl,second?grip.clone().addScaledVector(axis,-.16):along(-.25,1.04,.24),second?.39:.17);
    attraction(this.tip,grip.clone().addScaledVector(axis,this.gear.tip),(.34*armForce)/this.gear.mass,.136/Math.sqrt(this.gear.mass));
  }

  integrate() {
    for(const p of [...this.parts,this.hilt,this.tip]){
      const previous=p.p.clone();
      const drag=this.dead?.978:p===this.tip?.955:.91;
      p.p.addScaledVector(p.p.clone().sub(p.old),drag);
      p.p.y-=9.8*STEP*STEP;
      p.old.copy(previous);
    }
  }

  constrain() {
    for(const args of this.links) links(...args);
    if(!this.dead) links(this.j.hr,this.hilt,.060);
    links(this.hilt,this.tip,this.gear.tip);
    for(const p of [...this.parts,this.hilt,this.tip]){
      if(p.p.y<p.r) {
        p.p.y=p.r;
        p.old.x+=(p.p.x-p.old.x)*.29;
        p.old.z+=(p.p.z-p.old.z)*.29;
      }
      p.p.x=limit(p.p.x,-5.4,5.4);
      p.p.z=limit(p.p.z,-4.6,4.6);
    }
  }

  damage(zone, amount, point, normal, emit) {
    this.hp=Math.max(0,this.hp-amount);
    if(zone[1]==='er'||zone[1]==='sr') this.arm=limit(this.arm+amount/52,0,1);
    if(zone[1]==='tr'||zone[1]==='tl'||zone[1]==='kr'||zone[1]==='kl') this.legs=limit(this.legs+amount/71,0,1);
    const particle=this.j[zone[1]];
    particle.old.addScaledVector(normal,Math.min(.13,amount*.0041));
    this.j.chest.old.addScaledVector(normal,Math.min(.07,amount*.0025));
    this.cool=.22;
    this.injuries.push({key:zone[1],p:point.clone(), offset:point.clone().sub(particle.p), amount, text:zone[0]});
    if(this.injuries.length>12) this.injuries.shift();
    this.dead=this.hp<=0;
    if(this.dead) this.j.hips.old.addScaledVector(normal,.075);
    emit({type:this.dead?'fall':'hit',f:this,at:point,normal,amount,zone:zone[0]});
  }
}

function blade(f, guard=false, old=false) {
  const h=old?f.hilt.old:f.hilt.p, t=old?f.tip.old:f.tip.p;
  const axis=t.clone().sub(h).normalize();
  const side=V(axis.z,0,-axis.x).normalize();
  const low=guard?.12:f.gear.start;
  return [h.clone().addScaledVector(axis,low).addScaledVector(side,guard?0:f.gear.offset*.65),
    t.clone().addScaledVector(side,f.gear.offset)];
}

class Bout {
  constructor(weapons, gear, rival, count, emit) {
    this.weapons=weapons;
    this.fighters=[new Fighter(weapons[gear],0,-1.8,0,0),new Fighter(weapons[rival],0,1.8,Math.PI,1)];
    if(count===4) this.fighters.push(new Fighter(weapons.axe,-3,.1,Math.PI/2,2),new Fighter(weapons.sabre,3,.1,-Math.PI/2,3));
    this.emit=emit;
    this.time=0;
    this.end=0;
    this.winner=-1;
    this.acc=0;
  }

  advance(dt, controls) {
    this.acc=Math.min(.09,this.acc+dt);
    while(this.acc>=STEP) {
      this.acc-=STEP;
      this.tick(controls);
    }
  }

  tick(controls) {
    this.time=this.end?Math.min(this.end+2.4,this.time+STEP):this.time+STEP;
    const alive=this.fighters.filter(f=>!f.dead);
    for(let i=0;i<this.fighters.length;i++){
      const f=this.fighters[i];
      f.cool=Math.max(0,f.cool-STEP);
      if(!f.dead){
        const rivals=(this.end?this.fighters:alive).filter(t=>t!==f);
        const rival=rivals.reduce((a,b)=>!a||f.spot.distanceToSquared(b.spot)<f.spot.distanceToSquared(a.spot)?b:a,null);
        if(rival){
          f.input=this.end?neutral():controls[i]||botControl(f,rival,this.time+i*.47);
          f.drive(rival);
        }
      }
      f.integrate();
    }
    for(let iter=0;iter<6;iter++) {
      for(const f of this.fighters) f.constrain();
      for(let i=0;i<alive.length;i++) for(let j=i+1;j<alive.length;j++) {
        const a=alive[i],b=alive[j];
        const n=b.j.hips.p.clone().sub(a.j.hips.p).setY(0);
        const gap=n.length();
        if(gap<.65 && gap>.001){
          n.multiplyScalar((.65-gap)*.24/gap);
          a.j.hips.p.sub(n); b.j.hips.p.add(n);
          a.spot.addScaledVector(n,-.12); b.spot.addScaledVector(n,.12);
        }
      }
    }
    if(this.end)return;
    for(let i=0;i<alive.length;i++) for(let j=i+1;j<alive.length;j++) this.contact(alive[i],alive[j]);
    const left=this.fighters.filter(f=>!f.dead);
    if(left.length<=1||this.time>=100){
      const winner=left.length===1?left[0]:this.fighters.slice().sort((a,b)=>b.hp-a.hp)[0];
      this.winner=winner.hp===0?-1:this.fighters.indexOf(winner);
      this.end=this.time;
      this.emit({type:'end',winner:this.winner});
    }
  }

  contact(a,b) {
    if(a.dead||b.dead||a.spot.distanceToSquared(b.spot)>10)return;
    const [p,q]=blade(a,true),[r,s]=blade(b,true);
    const clash=closest(p,q,r,s);
    if(clash.d<.072){
      const av=velocity(a.hilt,a.tip,clash.s),bv=velocity(b.hilt,b.tip,clash.t);
      const impulse=av.clone().sub(bv);
      const n=clash.x.clone().sub(clash.y);
      if(n.lengthSq()<1e-6)n.copy(impulse).negate();
      n.normalize();
      const closing=-impulse.dot(n);
      if(closing>1.35){
        for(const [f,side] of [[a,1],[b,-1]]) {
          f.tip.old.addScaledVector(n,-side*limit(closing*.009/f.gear.mass,.014,.11));
          f.hilt.old.addScaledVector(n,-side*.019);
          f.tip.p.addScaledVector(n,side*(.078-clash.d)*.47);
        }
        if(a.cool<.10&&b.cool<.10){
          this.emit({type:'clash',at:clash.x,normal:n,amount:closing});
          a.cool=b.cool=.12;
        }
        return;
      }
    }
    this.strike(a,b);
    if(!b.dead)this.strike(b,a);
  }

  strike(a,b) {
    if(a.cool>0 || !(a.input.held || a.input.push))return;
    const [p,q]=blade(a),[oldP,oldQ]=blade(a,false,true);
    const axis=q.clone().sub(p).normalize();
    let first=null;
    for(const fraction of [.26,.57,1]){
      const start=oldP.clone().lerp(p,fraction),end=oldQ.clone().lerp(q,fraction);
      for(const zone of ZONES){
        const x=b.j[zone[1]],y=b.j[zone[2]];
        const xAt=x.old.clone().lerp(x.p,fraction),yAt=y.old.clone().lerp(y.p,fraction);
        const hit=closest(start,end,xAt,yAt);
        if(hit.d>a.gear.radius+zone[3] || first && hit.s>first.contact.s)continue;
        const v=velocity(a.hilt,a.tip,hit.s*.76+.24).sub(velocity(x,y,hit.t));
        const n=hit.x.clone().sub(hit.y);
        if(n.lengthSq()<1e-6)n.copy(v).negate();
        n.normalize();
        const closing=-v.dot(n);
        const force=a.gear.type==='point' ? Math.max(0,v.dot(axis))*.72+closing*.44 : closing;
        if(force<1.85)continue;
        first={zone,contact:hit,n,force};
      }
      if(first)break;
    }
    if(!first)return;
    const {zone,contact,n,force}=first;
    const power=limit((force-1.1)*a.gear.power*zone[4]*2.7,3,38);
    b.damage(zone,power,contact.y.clone().addScaledVector(n,zone[3]*.91),n,this.emit);
    a.tip.old.addScaledVector(n,-limit(force*.006/a.gear.mass,.013,.081));
    a.cool=.27;
  }
}

function botControl(f,o,t) {
  const d=f.spot.distanceTo(o.spot);
  const reach=f.gear.type==='point'&&f.gear.start>.7?1.77:limit(f.gear.tip+.14,.80,1.48);
  const phase=(t%1.70)/1.70;
  const threatened=d<1.95&&o.input.held&&phase<.22;
  return {mx:Math.sin(t*1.61)*.30,my:d>reach+.17?.87:d<reach-.27?-.68:phase<.46?.20:.03,
    ax:limit(Math.cos(Math.PI*phase)*1.17,-1,1),ay:.27-Math.sin(Math.PI*phase)*.69,
    held:d<reach+.40&&phase>.15,guard:threatened,push:f.gear.type==='point'&&d<reach+.29&&phase>.40&&phase<.69};
}
