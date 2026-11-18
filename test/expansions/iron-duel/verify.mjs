/** Mobile review gate. The browser uses real WebGL and a private two-tab transport. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const build = path.resolve(process.argv[2]);
const output = process.argv[3];
const origin = 'http://iron-preview.test';
const browser = await chromium.launch(process.env.IRON_CHROMIUM ? {
  executablePath: process.env.IRON_CHROMIUM,
  args: ['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding'],
} : {
  args: ['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding'],
});
try {
  const ctx = await browser.newContext({ viewport:{width:844,height:390}, deviceScaleFactor:1, isMobile:true, hasTouch:true });
  const errors = [];
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const file = path.resolve(build, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(build + path.sep)) return route.abort();
    return route.fulfill({path:file}).catch(() => route.abort());
  });
  await ctx.routeWebSocket('**/*', ws => ws.close());
  await ctx.addInitScript(() => {
    localStorage.setItem('ashen_arena_v1', '{"coins":4521}');
    if (!localStorage.getItem('ashen_iron_duel_profile_v1')) localStorage.setItem('ashen_iron_duel_profile_v1',
      JSON.stringify({ver:2,name:'Iron QA',newsSeen:'9999',set:{sfx:0,mus:0,qual:0,shadow:0,eco:1}}));
    // Drop the first round event and one attack packet. State snapshots should recover both.
    const Original = BroadcastChannel;
    window.BroadcastChannel = class extends Original {
      constructor(name) { super(name); this.nameForTest = name; }
      postMessage(data) {
        if (this.nameForTest.startsWith('ashen-iron-v2:duel-iron-v2-local-')) {
          const drop = window.__ironDrop;
          if (drop?.has(data.e)) { drop.delete(data.e); return; }
        }
        super.postMessage(data);
      }
    };
  });
  const page = async () => {
    const p = await ctx.newPage();
    p.setDefaultTimeout(60000);
    p.on('pageerror', e => { errors.push(String(e)); console.error(e.stack); });
    p.on('console', m => { if (m.type() === 'warning' && m.text().startsWith('duel')) console.error(m.text()); });
    await p.goto(origin + '/?local=1', {waitUntil:'domcontentloaded'});
    await p.evaluate(() => {
      // The test skips unrelated first-visit prompts; game and battle UI remain real.
      document.getElementById('news').hidden = true;
    });
    await p.locator('#mDuel').tap();
    await p.getByRole('heading', {name:'حلبة النغالة'}).waitFor();
    return p;
  };

  const p1 = await page();
  assert.equal(await p1.locator('.forgeWeaponCard').count(), 13);
  await p1.getByRole('button',{name:'طعن',exact:true}).tap();
  assert.equal(await p1.locator('.forgeWeaponCard').count(), 3);
  await p1.getByRole('button',{name:/الخنجر الطويل/}).tap();
  await p1.waitForFunction(() => Array.from(document.querySelectorAll('.forgeWeaponVisual')).every(n => n.style.backgroundImage));
  await p1.getByRole('button',{name:'مقاتل الحلبة',exact:true}).tap();
  await p1.locator('#dmTrain').tap();
  await p1.waitForFunction(() => DUEL.on && DUEL.ready && DUEL.round===1);
  await p1.evaluate(() => {
    for(let i=0;i<600 && DUEL.phase!=='fight';i++){
      duelStep(1/30);
      duelRotTick(1/30);
    }
  });
  assert.equal(await p1.evaluate(() => DUEL.phase),'fight');
  console.log('Training loaded and the first round started');
  assert.equal(await p1.evaluate(() => DUEL.me.forgeStyle), 3);
  assert.equal(await p1.evaluate(() => DUEL.me.wpId), 'dirk');
  assert.ok(await p1.evaluate(() => DUEL.me.forgeFigure.pieces.every(p => p.isSkinnedMesh && p.visible)));
  assert.ok(await p1.evaluate(() => DUEL.me.forgeFigure.legacy.every(p => !p.visible)));
  assert.ok(await p1.evaluate(() => DUEL.me.sword.getObjectByName('dirk')));
  const weapons = await p1.evaluate(() => DUEL_WEAPON_IDS.map(id => {
    DUEL.me.setWeapon(id);
    return DUEL.me.sword.name === id && forgeReadBlade(DUEL.me).every(v => v.toArray().every(Number.isFinite));
  }));
  assert.ok(weapons.every(Boolean));
  const results = await p1.evaluate(() => {
    DUEL.bot = null;
    DUEL.view = 'tps';
    const a=DUEL.me,d=DUEL.foe;
    const setup = distance => {
      a.setWeapon('sword'); d.setWeapon('sword');
      a.reset(0,0,0); d.reset(0,distance,Math.PI);
      a.freeLook = d.freeLook = false;
      a.update(0, d);d.update(0,a);
    };
    const swing = distance => {
      setup(distance);
      a.light();
      for(let i=0;i<68;i++){a.update(1/120,d);d.update(1/120,a);}
      return d.hp;
    };
    const near=swing(1.15), marks=d.forgeInjuries?.length || 0, far=swing(3.4);
    const drops=GORE.drops.length;
    setup(3);
    a.want.mz=1;
    a.update(1/60,d);
    const first=a.vz;
    for(let i=0;i<18;i++)a.update(1/60,d);
    const moving=a.vz;
    a.want.mz=0;a.update(1/60,d);
    return {near,far,drops,marks,first,moving,coasting:a.vz};
  });
  console.log('Contact and movement',results);
  assert.ok(results.near < 100, JSON.stringify(results));
  assert.equal(results.far, 100);
  assert.ok(results.drops>0 && results.marks>0);
  assert.ok(results.first>0 && results.first<results.moving && results.coasting>0);
  if (output) await p1.screenshot({path:output});
  await p1.evaluate(() => duelExit());
  await p1.locator('#mDuel').tap();

  const p2 = await page();
  await p1.evaluate(() => { window.__ironDrop = new Set(['rd', 'mv']); });
  await p1.locator('#forgeHost').tap();
  const room = await p1.locator('#forgeRoom').inputValue();
  await p2.locator('#forgeRoom').fill(room);
  await p2.locator('#forgeJoin').tap();
  // Keep the same game clock, but avoid software-rendering two arenas every tick in CI.
  await Promise.all([p1,p2].map(p => p.evaluate(() => {
    duelFrame = () => {};
    window.setInterval(() => {
      if (!DUEL.net?.ready || !DUEL.ready) return;
      duelInput(1/30);
      duelStep(1/30);
      duelNetTick(1/30);
    }, 25);
  })));
  await Promise.all([p1,p2].map(p => p.waitForFunction(() => DUEL.net?.ready && DUEL.phase === 'fight' && DUEL.round === 1)));
  assert.equal(await p1.evaluate(() => window.__ironDrop.has('rd')), false);

  // Both tabs agree who is where; a dropped one-time attack is recovered from the state stream.
  await p1.evaluate(() => {
    DUEL.me.setWeapon('sword'); DUEL.me.reset(0,-0.52,0);
  });
  await p2.evaluate(() => {
    DUEL.me.setWeapon('sword'); DUEL.me.reset(0,0.52,Math.PI);
  });
  await p1.waitForFunction(() => Math.abs(DUEL.foe.z-.52)<.1);
  await p2.waitForFunction(() => Math.abs(DUEL.foe.z+.52)<.1);
  await p1.locator('#dAtk').tap();
  await p2.waitForFunction(() => DUEL.me.hp < 100 && DUEL.foe.forgeRemoteAttack > 0);
  const hp = await p2.evaluate(() => DUEL.me.hp);
  await p1.waitForFunction(value => Math.abs(DUEL.foe.hp-value) <= .5,hp);
  await p1.waitForTimeout(300);
  assert.equal(await p2.evaluate(() => DUEL.me.hp),hp,'one attack must never cause two separate hits');
  assert.equal(await p1.evaluate(() => window.__ironDrop.has('mv')), false);
  await p1.evaluate(() => { DUEL.clock = 0; });
  await Promise.all([p1,p2].map(p => p.waitForFunction(() => DUEL.round===2 && DUEL.phase==='fight')));
  assert.deepEqual(await p1.evaluate(() => DUEL.score),[1,0]);
  assert.deepEqual(await p2.evaluate(() => DUEL.score),[0,1]);
  await p2.evaluate(() => duelExit());
  await p1.waitForFunction(() => DUEL.phase === 'over');
  assert.equal(await p1.evaluate(() => JSON.parse(localStorage.getItem('ashen_arena_v1')).coins),4521);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({results, online:'invitation, attack recovery, score/round agreement, disconnect passed'}));
} finally {
  await browser.close();
}
