import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base=path.resolve(process.argv[2]), shot=process.argv[3];
const origin='http://forge-42.test';
const browser=await chromium.launch({
  executablePath:process.env.IRON_CHROMIUM||undefined,
  args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding'],
});
try{
  const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const errors=[];
  await ctx.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.origin!==origin)return route.abort();
    const f=path.resolve(base,'.'+(u.pathname==='/'?'/index.html':u.pathname));
    return f.startsWith(base+path.sep)?route.fulfill({path:f}).catch(()=>route.abort()):route.abort();
  });
  async function open(){
    const p=await ctx.newPage();
    p.setDefaultTimeout(45000);
    p.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
    p.on('console',m=>{if(m.type()==='error')console.error(m.text());});
    await p.goto(origin+'/?local=1',{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>!document.getElementById('train').disabled);
    return p;
  }
  const p=await open();
  if(shot)await p.screenshot({path:shot+'-menu.png'});
  await p.locator('#open-weapons').tap();
  assert.equal(await p.locator('#cards button').count(),13);
  await p.locator('[data-category=point]').tap();
  assert.equal(await p.locator('#cards button').count(),3);
  await p.locator('[data-id=spear]').tap();
  assert.equal(await p.locator('#gear-name').textContent(),'الرمح');
  await p.locator('#train').tap();
  await p.locator('#fight').waitFor();
  assert.equal(await p.evaluate(()=>bout.fighters[0].gear.name),'الرمح');
  const padbox=await p.locator('#blade').boundingBox();
  const footbox=await p.locator('#feet').boundingBox();
  const cdp=await ctx.newCDPSession(p);
  const finger=(b,dx,dy,id)=>({x:b.x+b.width/2+dx,y:b.y+b.height/2+dy,id});
  const send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  await send('touchStart',[finger(footbox,0,-24,1),finger(padbox,25,-24,2)]);
  await p.waitForFunction(()=>localControl.held&&localControl.my>.25&&localControl.ax>.3);
  const high=await p.evaluate(()=>bout.fighters[0].tip.p.y);
  await send('touchMove',[finger(footbox,0,-28,1),finger(padbox,-25,22,2)]);
  await p.waitForFunction(()=>localControl.ax<-.3&&localControl.ay<-.25);
  await p.waitForFunction(y=>bout.fighters[0].tip.p.y<y-.14,high);
  await send('touchCancel',[]);
  await p.waitForFunction(()=>!localControl.held&&localControl.mx===0&&localControl.my===0);
  if(shot)await p.screenshot({path:shot+'-match.png'});
  const cases=await p.evaluate(()=>{
    const simulate=(id,gap,attack)=>{
      const records=[], demo=new Bout(gear,id,'sword',2,e=>records.push(e.type)),[a,b]=demo.fighters;
      for(const [f,z] of [[a,-gap/2],[b,gap/2]]){
        const delta=z-f.spot.z;f.spot.z=z;
        for(const part of [...f.parts,f.hilt,f.tip]){part.p.z+=delta;part.old.z+=delta;}
      }
      const quiet=neutral();
      for(let i=0;i<64;i++)demo.tick([quiet,quiet]);
      for(let i=0;i<224;i++){
        const stage=i%47;
        demo.tick([attack?{...quiet,held:true,ax:stage<25?.92:-.92,ay:stage<25?.53:-.20}:quiet,quiet]);
      }
      return {hp:b.hp,dead:b.dead,outcome:demo.winner,records,drop:b.hilt.p.y,head:b.j.head.p.y,
        upright:a.j.head.p.y,blade:a.tip.p.distanceTo(a.hilt.p)};
    };
    return {near:simulate('sword',.83,true),far:simulate('sword',3.1,true),still:simulate('sword',.83,false),
      clash:simulate('claymore',1.15,true)};
  });
  console.log('physical contacts',cases);
  assert.ok(cases.near.dead&&cases.near.outcome===0&&cases.near.head<.7&&cases.near.drop<.70&&cases.near.upright>1.2);
  assert.equal(cases.far.hp,100);
  assert.equal(cases.still.hp,100);
  assert.ok(cases.clash.records.includes('clash'));
  await p.locator('#exit').tap();
  await p.locator('#melee').tap();
  await p.locator('#fight').waitFor();
  assert.equal(await p.evaluate(()=>bout.fighters.length),4);
  await p.locator('#exit').tap();
  const guest=await open();
  await p.locator('#online').tap();
  await p.locator('#host').tap();
  const code=await p.locator('#room-code').inputValue();
  await guest.locator('#online').tap();await guest.locator('#room-code').fill(code);await guest.locator('#join').tap();
  await Promise.all([p,guest].map(q=>q.locator('#fight').waitFor()));
  await p.waitForFunction(()=>room.latest>1&&room.lastInput>0);
  await guest.waitForFunction(()=>room.latest>1);
  const start=await p.evaluate(()=>bout.fighters[1].spot.z);
  const guestFeet=await guest.locator('#feet').boundingBox();
  const touch=await ctx.newCDPSession(guest);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger(guestFeet,0,-40,3)]});
  await p.waitForFunction(z=>bout.fighters[1].spot.z<z-.25,start);
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await guest.locator('#exit').tap();
  await p.waitForFunction(()=>!running&&document.getElementById('room-status').textContent.includes('غادر'));
  assert.deepEqual(errors,[]);
  console.log('mobile two-thumb input, injuries, fall, free-for-all and two-client transport passed');
}finally{await browser.close();}
