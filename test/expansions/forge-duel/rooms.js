/* Isolated rehearsal rooms. The host runs physical state; the guest sends controls. */
const randomID=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),x=>'0123456789abcdefghjkmnpqrstvwxyz'[x&31]).join('');
const validID=id=>typeof id==='string'&&/^[0-9a-z]{12}$/.test(id);
const finite=(v,low,high)=>typeof v==='number'&&Number.isFinite(v)&&v>=low&&v<=high;
const roundCoord=v=>Math.round(v*1000)/1000;
const wireVec=p=>p.toArray().map(roundCoord);

function closeRoom(notify=true) {
  if(!room)return;
  const old=room;room=null;
  if(notify)old.channel?.send('leave',{who:old.id});
  old.channel?.close();
  $('host').disabled=$('join').disabled=false;
}

async function openRoom(host,code) {
  closeRoom();
  if(!validID(code)){
    $('room-status').textContent='أدخل رمز الغرفة المكوّن من ١٢ خانة.';
    return;
  }
  enableSound();
  const R={host,code,id:randomID(),other:null,channel:null,started:false,starting:false,latest:0,
    position:null,sentAt:0,lastSeen:performance.now(),lastInput:0,remoteInput:neutral()};
  room=R;
  $('host').disabled=$('join').disabled=true;
  $('room-code').value=code;
  $('room-status').textContent=host?'جاري فتح الغرفة…':'جاري الانضمام…';
  try{
    const ch=await netJoin('ashen-forge-v42-'+code);
    if(room!==R){ch.close();return;}
    R.channel=ch;
    $('room-status').textContent=host?'شارك الرمز. المواجهة تبدأ عند انضمام خصمك.':'بانتظار المضيف…';
    if(host)navigator.clipboard?.writeText(code).catch(()=>{});
    ch.on('hello',data=>{
      if(!R.host||!validID(data?.id)||!Object.hasOwn(gear,data.weapon))return;
      if(R.other&&R.other!==data.id)return;
      R.other=data.id;
      R.guestGear=data.weapon;
      R.lastSeen=performance.now();
      ch.send('welcome',{host:R.id,to:R.other,weapon:selected,rival:R.guestGear});
      if(!R.starting){
        R.starting=true;
        startMatch(2,R).catch(()=>roomClosed('تعذّر بدء المواجهة.'));
      }
    }).on('welcome',data=>{
      if(R.host||data?.to!==R.id||!validID(data.host)||!Object.hasOwn(gear,data.weapon)||!Object.hasOwn(gear,data.rival)||R.starting)return;
      R.other=data.host;R.hostGear=data.weapon;R.guestGear=data.rival;
      R.lastSeen=performance.now();R.starting=true;
      startMatch(2,R).catch(()=>roomClosed('تعذّر بدء المواجهة.'));
    }).on('control',data=>{
      if(!R.host||data?.who!==R.other||!R.other||!Array.isArray(data.u)||data.u.length!==7)return;
      const [mx,my,ax,ay,held,guard,push]=data.u;
      if(![mx,my,ax,ay].every(v=>finite(v,-1,1))||![held,guard,push].every(v=>v===0||v===1))return;
      R.remoteInput={mx,my,ax,ay,held:!!held,guard:!!guard,push:!!push};
      R.lastInput=R.lastSeen=performance.now();
    }).on('pose',data=>{
      if(R.host||!R.other||data?.who!==R.other||!Number.isSafeInteger(data.n)||data.n<=R.latest||
        !finite(data.t,0,122)||!finite(data.end,0,101)||![-1,0,1].includes(data.win)||
        !Array.isArray(data.f)||data.f.length!==2||!data.f.every(a=>Array.isArray(a)&&a.length===55&&
          a.slice(0,2).every(n=>finite(n,0,100))&&finite(a[2],-20,20)&&(a[3]===0||a[3]===1)&&
          a.slice(4).every(n=>finite(n,-7,7))))return;
      R.position=data;R.latest=data.n;R.lastSeen=performance.now();
    }).on('effect',data=>{
      if(R.host||data?.who!==R.other||!R.other||!R.started||!bout||!['hit','fall','clash'].includes(data.type)||
        !finite(data.power,0,60)||!Array.isArray(data.at)||data.at.length!==3||data.at.some(n=>!finite(n,-7,7))||
        !Array.isArray(data.normal)||data.normal.length!==3||data.normal.some(n=>!finite(n,-1.01,1.01)))return;
      const f=bout.fighters[data.i], at=V(...data.at), normal=V(...data.normal);
      if(data.type!=='clash'){
        if(!f||!Object.hasOwn(f.j,data.key)||typeof data.zone!=='string'||data.zone.length>25)return;
        f.injuries.push({key:data.key,offset:at.clone().sub(f.j[data.key].p)});
      }
      effects({type:data.type,at,normal,f,amount:data.power,zone:data.zone});
    }).on('leave',data=>{if(R.other&&data?.who===R.other)roomClosed('غادر الخصم الغرفة.');});
    let nextHello=0;
    const pulse=()=>{
      if(room!==R||R.started)return;
      const now=performance.now();
      if(!host&&!R.starting&&now>=nextHello){
        ch.send('hello',{id:R.id,weapon:selected});
        nextHello=now+420;
      }
      if(now-R.lastSeen>(host?100000:15000)){
        roomClosed(host?'انتهى انتظار الخصم. افتح غرفة جديدة.':'المضيف غير متصل. تأكّد من الرمز.');
      }else setTimeout(pulse,235);
    };
    pulse();
  }catch{
    if(room===R)roomClosed('تعذّر الاتصال. تأكد من الشبكة وحاول مرة ثانية.');
  }
}

function roomClosed(message) {
  closeRoom(false);
  if(running){leave();$('rooms').showModal();}
  $('room-status').textContent=message;
}

function roomTick() {
  const R=room;
  const now=performance.now();
  if(now-R.lastSeen>10500){roomClosed('انقطع اتصال الخصم.');return;}
  if(!R.host&&now-R.sentAt>45){
    const u=localControl;
    R.channel.send('control',{who:R.id,u:[u.mx,u.my,u.ax,u.ay,+u.held,+u.guard,+u.push]});
    R.sentAt=now;
  }
}

function sendSnapshot() {
  const R=room,now=performance.now();
  if(now-R.sentAt<49)return;
  R.sentAt=now;
  R.latest++;
  const f=bout.fighters.map(p=>[roundCoord(p.hp),roundCoord(p.breath),roundCoord(Math.atan2(Math.sin(p.yaw),Math.cos(p.yaw))),+p.dead,
    ...[...p.parts,p.hilt,p.tip].flatMap(q=>wireVec(q.p))]);
  R.channel.send('pose',{who:R.id,n:R.latest,t:roundCoord(bout.time),end:roundCoord(bout.end),win:bout.winner,f});
}

function roomEvent(event) {
  if(!event.at||!room?.host)return;
  const i=bout.fighters.indexOf(event.f), key=event.f?.injuries.at(-1)?.key;
  room.channel.send('effect',{who:room.id,type:event.type,i,key,at:wireVec(event.at),
    normal:wireVec(event.normal),power:event.amount,zone:event.zone});
}

function guestAdvance(dt) {
  const p=room.position;
  if(!p)return;
  bout.time=p.t;
  if(p.end&&!bout.end){
    bout.end=p.end;bout.winner=p.win;
    effects({type:'end',winner:p.win});
  }
  bout.fighters.forEach((f,i)=>{
    const s=p.f[i], blend=Math.min(1,1-Math.exp(-22*dt));
    f.hp=s[0];f.breath=s[1];f.dead=!!s[3];
    f.yaw+=Math.atan2(Math.sin(s[2]-f.yaw),Math.cos(s[2]-f.yaw))*blend;
    [...f.parts,f.hilt,f.tip].forEach((q,j)=>q.p.lerp(V(...s.slice(4+j*3,7+j*3)),blend));
    f.spot.copy(f.j.hips.p).setY(0);
  });
}

$('host').onclick=()=>openRoom(true,randomID());
$('room-form').onsubmit=e=>{e.preventDefault();openRoom(false,$('room-code').value.trim().toLowerCase());};
$('rooms').addEventListener('close',()=>{if(room&&!room.started)closeRoom();});
addEventListener('pagehide',()=>closeRoom());
