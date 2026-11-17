import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../test/expansions/oath-warden/combat.js',import.meta.url),'utf8');
function setup(){
 const c=vm.createContext({S:{char:'reaper'},G:{state:'play',t:0,p:{x:0,z:0,face:0,area:1,dead:false},enemies:[]},choosingCards:()=>false,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),vfxSparks:()=>{},vfxSmoke:()=>{},shake:()=>{},AU:{play:()=>{}}});
 c.eachInRadius=(x,z,r,fn)=>{for(const e of c.G.enemies)if(!e.dead&&Math.hypot(e.x-x,e.z-z)<=r)fn(e);};
 c.hit=(e,d)=>{e.hp-=d;if(e.hp<=0)e.dead=true;};vm.runInContext(source,c);return {c,run:s=>vm.runInContext(s,c)};
}
test('guard distinguishes front, rear and unknown sources and respects its recovery',()=>{
 const {run}=setup();assert.equal(run('wardenBlockDamage(100,{x:0,z:-3})'),100);
 assert.equal(run('wardenBlockDamage(100,null)'),100);
 assert.equal(run('wardenBlockDamage(100,{x:0,z:3})'),40);
 assert.equal(run('wardenBlockDamage(100,{x:0,z:3})'),100);
 assert.equal(run('G.t=1.2;wardenBlockDamage(100,{x:0,z:3})'),40);
 assert.equal(run("S.char='knight';wardenBlockDamage(100,{x:0,z:3})"),100);
});
test('jump strike lands once after its windup and waits through pause',()=>{
 const {c,run}=setup();const front={x:0,z:3,hp:1000},rear={x:0,z:-3,hp:1000};c.G.enemies=[front,rear];
 assert.equal(run('wardenSpecial(100)'),true);assert.equal(front.hp,1000);assert.equal(rear.hp,1000);
 assert.equal(run('wardenSpecial(100)'),false);
 run("G.t=0.6;G.state='paused';wardenTick()");assert.equal(front.hp,1000);assert.equal(rear.hp,1000);
 run("G.state='play';wardenTick();wardenTick()");assert.equal(front.hp,765);assert.equal(rear.hp,820);
});
test('boss stun is short; temporary ward has an expiry and never multiplies guard reduction',()=>{
 const {c,run}=setup();c.G.enemies=[{x:0,z:2,hp:1000,boss:true}];run('wardenSpecial(100);G.t=0.6;wardenTick()');assert.equal(c.G.enemies[0].frz,0.2);
 assert.equal(run('wardenBlockDamage(100,{x:0,z:2})'),40);
 assert.equal(run('wardenBlockDamage(100,null)'),60);
 assert.equal(run('G.t=3;wardenBlockDamage(100,null)'),100);
});
