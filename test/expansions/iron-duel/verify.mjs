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
        if (this.nameForTest.startsWith('ashen-iron-v5:duel-iron-v5-local-')) {
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
    p.on('console', m => {
      if (m.type() === 'warning' && m.text().startsWith('duel')) console.error(m.text());
      if (m.type() === 'error' && /shader|WebGLProgram/i.test(m.text())) errors.push(m.text());
    });
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
  await p1.locator('#forge-tab-weapons').tap();
  assert.equal(await p1.locator('.forgeWeaponCard').count(), 13);
  await p1.getByRole('button',{name:'طعن',exact:true}).tap();
  assert.equal(await p1.locator('.forgeWeaponCard').count(), 3);
  await p1.getByRole('button',{name:/الخنجر الطويل/}).tap();
  await p1.waitForFunction(() => Array.from(document.querySelectorAll('.forgeWeaponVisual')).every(n => n.complete && n.naturalWidth > 1));
  assert.equal(await p1.locator('.weaponStage h3').textContent(), 'الخنجر الطويل');
  await p1.locator('#forge-tab-fighter').tap();
  assert.equal(await p1.locator('.fighterStage h3').textContent(), 'مقاتل الحلبة');
  await p1.waitForFunction(() => document.querySelector('.fighterStage img').naturalWidth > 1);
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
  await p1.evaluate(() => { window.__ironFrame = duelFrame; duelFrame = () => {}; });
  assert.equal(await p1.evaluate(() => DUEL.me.forgeStyle), 0);
  assert.ok(await p1.evaluate(() => {
    const materials = DUEL.me.forgeFigure.pieces.map(p => p.material.name);
    return materials.includes('SkinTorso') && materials.includes('Trousers') &&
      materials.includes('SkinFeet') && !materials.some(part => /tunic|armor/i.test(part)) &&
      !!DUEL.me.forgeFigure.pieces.find(p => p.material.name === 'Trousers')?.material.map;
  }));
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
      forgeFightStep([[a,d],[d,a]], 0);
    };
    const swing = distance => {
      setup(distance);
      a.light();
      for(let i=0;i<68;i++) forgeFightStep([[a,d],[d,a]], 1/120);
      return d.hp;
    };
    const near=swing(1.15), marks=d.forgeInjuries?.length || 0;
    const uniformCount=d.forgeWoundUniforms.forgeCount.value;
    const hitZone=d.forgeInjuries?.[0].zone;
    const far=swing(3.4);
    setup(3);
    a.want.mx = 1;
    a.heavy();
    const turn = a.face;
    for (let i=0;i<32;i++) forgeFightStep([[a,d],[d,a]], 1/120);
    const strafe = { direction:a.x, face:a.face - turn, planted:!!a.forgeGait?.legs._l };
    setup(3);
    a.dodge(1,0);
    for (let i=0;i<16;i++) forgeFightStep([[a,d],[d,a]], 1/120);
    const roll = { direction:a.x, facing:Math.sin(a.root.rotation.y - a.face) };
    setup(.64);
    const centre = (a.z+d.z) * .5;
    const balanced = Math.abs(centre-.32) < .00001 && (d.z-a.z) >= .74;

    const drops=GORE.drops.length;
    setup(3);
    a.want.mz=1;
    a.update(1/60,d);
    const first=a.vz;
    for(let i=0;i<18;i++)a.update(1/60,d);
    const moving=a.vz;
    a.want.mz=0;a.update(1/60,d);
    return {near,far,strafe,roll,balanced,drops,marks,uniformCount,hitZone,first,moving,coasting:a.vz};
  });
  console.log('Contact and movement',results);
  assert.ok(results.near < 100, JSON.stringify(results));
  assert.equal(results.far, 100);
  assert.ok(results.drops>0 && results.marks>0 && results.uniformCount>0 && results.hitZone);
  assert.ok(results.strafe.direction < -.12 && Math.abs(results.strafe.face) < .5 && results.strafe.planted, JSON.stringify(results.strafe));
  assert.ok(results.roll.direction < -.25 && results.roll.facing < -.65, JSON.stringify(results.roll));
  assert.ok(results.balanced);
  assert.ok(results.first>0 && results.first<results.moving && results.coasting>0);
  if (output) {
    await p1.evaluate(() => {
      const a = DUEL.me, b = DUEL.foe;
      a.reset(-.17, 0, 0);
      b.reset(.17, 1.32, Math.PI);
      $('dMsg').classList.remove('show');
      a.want.mx = 1;
      a.light();
      for (let i=0;i<26;i++) forgeFightStep([[a,b],[b,a]], 1/120);
      duelCamera(.24);
      renderer.render(DUEL.scene, DUEL.cam);
    });
    await p1.screenshot({path:output});
  }
  await p1.evaluate(() => {
    DUEL.me.setWeapon('sword');
    DUEL.phase = 'fight';
    DUEL.me.reset(0, 0, 0);
    DUEL.foe.reset(0, 3.1, Math.PI);
    forgeFightStep([[DUEL.me,DUEL.foe],[DUEL.foe,DUEL.me]], 0);
  });
  const button = await p1.locator('#dAtk').boundingBox();
  const finger = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
  const cdp = await ctx.newCDPSession(p1);
  const touch = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] });
  const readDrag = () => p1.evaluate(() => {
    const f = DUEL.me;
    for (let i=0;i<27;i++) forgeFightStep([[f,DUEL.foe],[DUEL.foe,f]],1/120);
    return { aim: f.forgeGesture?.y, tip: forgeReadBlade(f)[1].toArray(), hit: DUEL.foe.hp };
  });
  await touch('touchStart', finger);
  await touch('touchMove', { x: finger.x - 50, y: finger.y - 69 });
  await p1.waitForFunction(() => DUEL.me.forgeGesture?.y > .9);
  const raised = await readDrag();
  await touch('touchMove', { x: finger.x - 24, y: finger.y + 30 });
  await p1.waitForFunction(() => DUEL.me.forgeGesture?.y < -.4, null, {timeout:4000});
  const lowered = await readDrag();
  await touch('touchEnd');
  assert.ok(raised.aim > .9 && lowered.aim < -.4, JSON.stringify({raised,lowered}));
  assert.ok(raised.tip[1] - lowered.tip[1] > .60, JSON.stringify({raised,lowered}));
  assert.equal(lowered.hit, 100);
  assert.equal(await p1.evaluate(() => DUEL.me.forgeGesture?.held), false);
  const cancelled = await (async () => {
    await p1.evaluate(() => DUEL.me.reset(0, 0, 0));
    await touch('touchStart', finger);
    await touch('touchCancel');
    return p1.evaluate(() => !forgePointer && DUEL.me.act === 'idle' && DUEL.me.st === 100);
  })();
  assert.ok(cancelled, 'a cancelled touch must not swing or consume stamina');
  await cdp.detach();
  const injuries = await p1.evaluate(() => {
    const a = DUEL.me, d = DUEL.foe;
    const initial = () => { a.reset(0,0,0); d.reset(0,1.14,Math.PI); d.want.mz=1; };
    initial();
    for (let i=0;i<18;i++) d.update(1/60, a);
    const healthy = Math.abs(d.vz);
    initial();
    const bone = goreBone(d,'calf_r');
    d.forgeContact = { bone, pos:bone.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,0,-.09)),
      normal:new THREE.Vector3(0,0,-1), dir:new THREE.Vector3(1,-.2,0).normalize(), zone:'legR', power:1 };
    d.damage(23, a, 'heavy');
    d.forgeContact = null;
    const penalty = forgePenalty(d, 'legR');
    const point = GORE.jets.find(j => j.f === d && j.point);
    const wet = point?.bone === bone;
    d.start('idle');
    d.kx = d.kz = 0;
    for (let i=0;i<18;i++) d.update(1/60, a);
    const injured = Math.abs(d.vz);
    d.hp = 4;
    d.damage(10, a, 'light');
    for (let i=0;i<70;i++) forgeFightStep([[a,d],[d,a]], 1/120);
    return {healthy, injured, penalty, wet, dead:d.act, tilt:d.forgeFall?.tilt, wound:d.forgeInjuries.length, cuts:d.cuts,
      camera:!!(DUEL.fin || DUEL.kc), ground:d.root.position.y, dropped:GORE.pieces.some(p => p.f === d && p.weapon)};
  });
  assert.ok(injuries.penalty > 0 && injuries.injured < injuries.healthy && injuries.wet, JSON.stringify(injuries));
  assert.ok(injuries.dead === 'dead' && injuries.tilt > .7 && injuries.wound > 0 && !injuries.camera && injuries.dropped && injuries.cuts === 0, JSON.stringify(injuries));
  await p1.evaluate(() => { duelFrame = window.__ironFrame; });

  await p1.evaluate(() => duelExit());
  await p1.locator('#mDuel').tap();

  console.log('Touch steering and release passed');
  await p1.locator('#ffaTrain').tap();
  await p1.waitForFunction(() => DUEL.ffa?.all?.length === 4);
  await p1.evaluate(() => {
    ffaStep(1/60);
    duelExit();
  });
  assert.ok(await p1.evaluate(() => ffaExtra.every(f => !f.root.visible && !f.forgeShadow?.visible)));
  await p1.locator('#mDuel').tap();
  const p2 = await page();
  await p1.evaluate(() => { window.__ironDrop = new Set(['rd', 'mv']); });
  await p1.locator('#forge-tab-room').tap();
  await p2.locator('#forge-tab-room').tap();
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
  console.log('Both room clients entered round 1');

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
  await p1.waitForFunction(value => Math.abs(DUEL.foe.hp-value) <= .5 && DUEL.foe.forgeInjuries?.length > 0,hp);
  const woundZones = await Promise.all([
    p1.evaluate(() => DUEL.foe.forgeInjuries.at(-1).zone),
    p2.evaluate(() => DUEL.me.forgeInjuries.at(-1).zone),
  ]);
  assert.equal(woundZones[0],woundZones[1]);
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
