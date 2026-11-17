import { test as base, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { globals } from '../helpers/globals.mjs';
import { CDN_DIR, validateFixtures } from '../helpers/cdn-fixtures.mjs';

const rules = await globals();
const latestNews = rules.run('NEWS[0]?.id');
const testFiles = fileURLToPath(new URL('../../test/',import.meta.url));
const { release, enabledExpansions = [], forestDefault } = JSON.parse(await fs.readFile(path.join(testFiles, 'modular-config.json'), 'utf8'));
const previewLatestNews = runInNewContext((await fs.readFile(path.join(testFiles, 'releases', release, 'js/data/news.js'), 'utf8')) + '\nNEWS[0]?.id');
const fixtureProfile = { ...rules.json('defSave()'), name: 'Smoke-local', newsSeen: latestNews };
// Low quality is an existing user setting, not a renderer replacement. Keep WebGL, actual main/frame/update.
fixtureProfile.set = { ...fixtureProfile.set, sfx: 0, mus: 0, shadow: 0, qual: 0, eco: 1 };

const test = base.extend({
  isolated: [
    async ({ context, page, baseURL }, use, testInfo) => {
      const manifest = await validateFixtures();
      const libraries = new Map(manifest.map(item => [item.url, path.join(CDN_DIR, item.file)]));
      const observed = {
        blockedHTTP: [],
        blockedWebSocket: [],
        pageErrors: [],
        loadedRuntime: [],
        microphoneRequests: 0,
      };
      // Use each targeted device in an isolated browser, never its real storage or production API.
      const profile = structuredClone(fixtureProfile);
      profile.pid = testInfo.project.name === 'mobile' ? 'fixture-penalty-two' : 'fixture-penalty-one';
      profile.pkey = "local-browser-fixture-key";
      profile.coins = 9000;
      profile.sp = 17;
      profile.chars = Object.fromEntries(rules.json('Object.keys(CHARS)').map(id=>[id,1]));
      profile.tree = Object.fromEntries(rules.json('TREE.flatMap(b=>b.nodes.map(n=>n.id))').map(id=>[id,1]));
      profile.perm = rules.json('Object.fromEntries(Object.entries(PERM).map(([k,v])=>[k,v.max]))');
      profile.stats = {...profile.stats,bestLvl:67,kills:76650,bosses:102,bestTime:2403};
      if (testInfo.title.startsWith('preview:')) {
        // The pinned preview can have an older bulletin than production.
        profile.newsSeen = previewLatestNews;
        // A fresh combat profile avoids the optional U5 level card interrupting this scenario.
        profile.tree = {};
        profile.perm = {};
        if (testInfo.title.includes('gravebound')) { profile.coins = 60000; profile.sp = 150; }
      }
      // Routes installed before navigation; no Supabase request or write can reach any production host.
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const fixture = libraries.get(request.url());
        if (fixture && request.method() === 'GET') {
          await route.fulfill({ path: fixture, contentType: 'text/javascript' });
          return;
        }
        if (url.origin === new URL(baseURL).origin && ['GET', 'HEAD'].includes(request.method())) {
          // Serve the real generated preview from a transport fixture; the production-only server stays restricted.
          if (url.pathname.startsWith('/test/')) {
            const relative = url.pathname === '/test/' ? 'index.html' : url.pathname.slice('/test/'.length);
            const file = path.resolve(testFiles,relative);
            if (!file.startsWith(testFiles)) return route.fulfill({status:404,body:''});
            try {await fs.access(file); await route.fulfill({path:file});}
            catch {await route.fulfill({status:404,body:''});}
            return;
          }
          if (/\/js\/.*\.js$/.test(url.pathname)) observed.loadedRuntime.push(url.pathname);
          await route.continue();
          return;
        }
        observed.blockedHTTP.push({ url: request.url(), method: request.method() });
        if (url.pathname === '/rest/v1/rpc/get_player_penalty') {
          const body = request.postDataJSON();
          await route.fulfill({status:200,contentType:'application/json',
            body:JSON.stringify(body.p_pid === profile.pid && body.p_key === profile.pkey
              ? {id:'2026-11-17-fair-play',skill_nodes:4,shop_levels:4,heroes:3,reset_coins:true} : null)});
          return;
        }
        // Deterministic offline response; this is a transport boundary, not a game/UI stub.
        if (/fonts\.googleapis\.com$/.test(url.hostname))
          await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
        else await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      });
      await context.routeWebSocket('**/*', ws => {
        observed.blockedWebSocket.push(ws.url());
        ws.close({ code: 1000, reason: 'Offline test: production realtime forbidden' });
        // Intentionally never call connectToServer().
      });
      page.on('pageerror', error => observed.pageErrors.push(error.stack || error.message));
      await context.addInitScript(profile => {
        localStorage.setItem('ashen_arena_v1', JSON.stringify(profile));
        localStorage.setItem('ashen_arena_modular_test_v1', JSON.stringify(profile));
        localStorage.setItem('ashen_arena_run', JSON.stringify({v:1,kills:1000,lvl:67}));
        window.__prePenaltyProfile = JSON.stringify(profile);
        window.__testMicrophoneRequests = 0;
        // Never prompt for or grant microphone access, even if a future regression tries it.
        if (navigator.mediaDevices)
          navigator.mediaDevices.getUserMedia = () => {
            window.__testMicrophoneRequests++;
            return Promise.reject(new DOMException('Microphone forbidden in smoke tests', 'NotAllowedError'));
          };
      }, profile);
      await use(observed);
      observed.microphoneRequests = await page.evaluate(() => window.__testMicrophoneRequests || 0).catch(() => 0);
      await testInfo.attach('offline-boundary-and-runtime-errors', {
        body: JSON.stringify(observed, null, 2),
        contentType: 'application/json',
      });
      expect(observed.microphoneRequests, 'Smoke must never request microphone').toBe(0);
      expect(observed.pageErrors, 'Uncaught errors in real runtime (not suppressed)').toEqual([]);
    },
    { auto: true },
  ],
});

async function boot(page, isolated) {
  await page.goto('/#netlocal', { waitUntil: 'load' });
  await expect
    .poll(() => page.evaluate(() => typeof window.__game), {
      timeout: 20000,
      message: '__game must be exported by real js/main.js',
    })
    .toBe('object');
  await page.evaluate(() => window.__game.ready);
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#menu')).not.toHaveClass(/boot/);
  expect(isolated.loadedRuntime).toContain('/js/main.js');
  await expect(page.locator('#nameScr')).toBeHidden();
  await expect(page.locator('#news')).toBeHidden();
}

async function checkScreens(page, isolated) {
  for (const screen of ['chars', 'shop', 'tree', 'ach', 'settings']) {
    await page.locator(`#menu [data-go="${screen}"]`).click();
    await expect(page.locator(`#${screen}`)).toBeVisible();
    await expect(page.locator('#menu')).toBeHidden();
    if (screen === 'chars') await expect(page.locator('#charGrid .item').first()).toBeVisible();
    if (screen === 'shop') await expect(page.locator('#wepGrid .item').first()).toBeVisible();
    if (screen === 'settings') await page.locator('#setBack').click();
    else await page.locator(`#${screen} [data-go="menu"]`).click();
    await expect(page.locator('#menu')).toBeVisible();
  }
  const boardRequests = () =>
    isolated.blockedHTTP.filter(r => /\/profiles\?.*select=name,stats,updated_at/.test(r.url)).length;
  const before = boardRequests();
  await page.locator('#menu [data-go="board"]').click();
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#boardTabs')).toBeVisible();
  await expect(page.locator('#boardTabs button')).toHaveCount(5);
  await page.locator('#boardTabs button[data-metric="endure"]').click();
  await expect(page.locator('#boardTabs button[data-metric="endure"]')).toHaveClass(/active/);
  await expect(page.locator('#boardLead')).toContainText('أطول مدة بقاء');
  await expect(page.locator('#boardList .rk, #boardList .boardEmpty').first()).toBeVisible();
  await page.locator('#board [data-go="menu"]').click();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#board')).toBeHidden();
  const asked = boardRequests() - before;
  expect(asked, 'Opening the hall asks for the online board once').toBeGreaterThanOrEqual(1);
  expect(asked).toBeLessThanOrEqual(2);
  // #netlocal uses the real netJoin/BroadcastChannel path. Same members, only connection status changes.
  const members = await page.evaluate(() => VC.list.map(p => p.id));
  const connectingStatus = await page.evaluate(() => {
    document.getElementById('mVoice').click();
    return document.getElementById('vcStatus').textContent;
  });
  expect(connectingStatus).toContain('جارٍ الاتصال');
  await expect(page.locator('#voice')).toBeVisible();
  await expect(page.locator('#vcStatus')).toContainText('اختر غرفة وادخلها');
  expect(await page.evaluate(() => VC.list.map(p => p.id))).toEqual(members);
  await page.locator('#vcClose').click();
  await expect(page.locator('#voice')).toBeHidden();
}

async function checkPlayerPenalty(page) {
  const originalShopRanks = rules.run('Object.values(PERM).reduce((sum,p)=>sum+p.max,0)');
  const state = () => page.evaluate(() => ({
    coins:S.coins,sp:S.sp,nodes:Object.keys(S.tree).length,heroes:Object.keys(S.chars).length,
    shopRanks:Object.values(S.perm).reduce((sum,n)=>sum+n,0),
    level:S.stats.bestLvl,kills:S.stats.kills,bosses:S.stats.bosses,
    receipt:profileStats().penalty,checkpoint:localStorage.getItem('ashen_arena_run'),
  }));
  const expected = {coins:0,sp:17,nodes:21,heroes:4,shopRanks:originalShopRanks-4,level:67,
    kills:0,bosses:0,receipt:'2026-11-17-fair-play',checkpoint:null};
  expect(await state()).toEqual(expected);
  expect(await page.evaluate(() => {S.coins=25;save();return enforcePlayerPenalty();})).toBeNull();
  expect((await state()).coins).toBe(25);
}

async function checkOldPenaltyBackup(page) {
  // Exercise the actual import UI: an old backup cannot restore pre-penalty wealth or upgrades.
  const oldCode = await page.evaluate(() => 'AS1-'+b64(window.__prePenaltyProfile)+'.'+sig(window.__prePenaltyProfile+BACKUP_SALT));
  await page.locator('#menu [data-go="settings"]').click();
  await page.locator('#bkIn').fill(oldCode);
  await page.locator('#bkLoad').click();
  await page.locator('#bkLoad').click();
  await expect(page.locator('#toast')).toContainText('رجع تقدمك');
  expect(await page.evaluate(() => ({
    coins:S.coins,sp:S.sp,nodes:Object.keys(S.tree).length,heroes:Object.keys(S.chars).length,
    shopRanks:Object.values(S.perm).reduce((sum,n)=>sum+n,0),
    level:S.stats.bestLvl,kills:S.stats.kills,bosses:S.stats.bosses,
    receipt:profileStats().penalty,checkpoint:localStorage.getItem('ashen_arena_run'),
  }))).toEqual({coins:0,sp:17,nodes:21,heroes:4,
    shopRanks:rules.run('Object.values(PERM).reduce((sum,p)=>sum+p.max,0)')-4,
    level:67,kills:0,bosses:0,receipt:'2026-11-17-fair-play',checkpoint:null});
  await page.locator('#setBack').click();
  await expect(page.locator('#menu')).toBeVisible();
}

async function checkRound(page, testInfo) {
  await page.locator('#mPlay').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#menu')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__game.G.state)).toBe('play');
  await expect.poll(() => page.evaluate(() => window.__game.G.t)).toBeGreaterThan(0);
  const start = await page.evaluate(() => ({ x: window.__game.G.p.x, z: window.__game.G.p.z, t: window.__game.G.t }));
  if (testInfo.project.name === 'mobile') {
    // CDP dispatches real touch input (not assignments to G/IN); hold the game's existing joystick.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 620, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: 620, id: 1 }] });
    await expect
      .poll(() => page.evaluate(s => Math.hypot(window.__game.G.p.x - s.x, window.__game.G.p.z - s.z), start))
      .toBeGreaterThan(0.1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.keyboard.down('ArrowRight');
    await expect
      .poll(() => page.evaluate(s => Math.hypot(window.__game.G.p.x - s.x, window.__game.G.p.z - s.z), start))
      .toBeGreaterThan(0.1);
    await page.keyboard.up('ArrowRight');
  }
  await expect.poll(() => page.evaluate(() => window.__game.G.t)).toBeGreaterThan(start.t);
  // Inspect the existing WebGL context: require a successful real draw, not a fake __game export.
  expect(
    await page.evaluate(() => {
      const canvas = document.getElementById('gl');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      return (
        !!gl &&
        !gl.isContextLost() &&
        canvas.width > 0 &&
        canvas.height > 0 &&
        gl.getError() === gl.NO_ERROR &&
        renderer.info.render.calls > 0
      );
    })
  ).toBe(true);
  // A real watched event and main liveTick display the button; no fake DOM/render or production channel.
  await page.evaluate(() => liveWatched({ from: 'smoke-observer', n: 'مشاهد محلي' }));
  await expect(page.locator('#viewers')).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const button = document.getElementById('viewers');
          const box = button.getBoundingClientRect();
          return (
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('#viewers') === button
          );
        }),
      { message: '#viewers must receive real pointer input through the HUD' }
    )
    .toBe(true);
  await page.locator('#viewers').click();
  await expect(page.locator('#toast')).toContainText('مشاهد محلي');
  await page.locator('#pauseBtn').click();
  await expect(page.locator('#pause')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__game.G.state)).toBe('paused');
  await page.locator('#pSave').click();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
  await expect(page.locator('#mResume')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ashen_arena_run')).v)).toBe(1);
}

// One actual boot per viewport, all prior assertions retained. No redundant scene/model reload between scenarios.
test('screens, penalties, backup restore, voice and real play/movement/pause/save in one isolated journey', async ({
  page,
  isolated,
}, testInfo) => {
  test.setTimeout(120000); // The same boot now also verifies the targeted save migration and real backup UI.
  await boot(page, isolated);
  await checkPlayerPenalty(page);
  await checkScreens(page, isolated);
  await checkRound(page, testInfo);
  await checkOldPenaltyBackup(page);
});

// Controlled combat fixture, real preview bundle/AI/damage/rendering; every production request remains blocked.
test('preview: overlapping shamans remain killable in a long solo run and after save/resume', async ({page}) => {
  test.setTimeout(120000);
  await page.goto('/test/#netlocal',{waitUntil:'load'});
  await expect.poll(()=>page.evaluate(()=>typeof window.__game),{timeout:30000}).toBe('object');
  await page.evaluate(()=>window.__game.ready);
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#menu')).not.toHaveClass(/boot/);
  await page.locator('#mPlay').click();
  await expect.poll(()=>page.evaluate(()=>G.state)).toBe('play');
  const sustain = () => page.evaluate(() => {
    G.noWaves=true; G.god=true; G.enemies=[]; G.weapons=[]; G.p.crit=0; G.ups={};
    const victim=spawn('grunt',G.p.x,G.p.z+2);
    victim.hp=victim.maxHp=500;victim.spd=0;
    for(let i=0;i<8;i++) {const e=spawn('shaman',G.p.x+3,G.p.z+2);e.spd=0;e.cd=0;}
    const start=G.t, kills=G.kills;
    for(let frame=0;frame<600&&!victim.dead;frame++) {
      G.t+=0.05;hit(victim,5,{noCrit:1,quiet:1,aoe:1});updEnemies(0.05);
    }
    return {dead:victim.dead,killDelta:G.kills-kills,elapsed:G.t-start,hp:victim.hp};
  });
  await page.evaluate(()=>{G.t=7200;});
  const first=await sustain();
  expect(first.dead).toBe(true);
  expect(first.killDelta).toBe(1);
  expect(first.elapsed).toBeLessThan(10);
  expect(Number.isFinite(first.hp)).toBe(true);
  await page.locator('#pauseBtn').click();
  await page.locator('#pSave').click();
  await expect(page.locator('#mResume')).toBeVisible();
  await page.locator('#mResume').click();
  await expect.poll(()=>page.evaluate(()=>G.state),{timeout:10000}).toBe('play');
  expect((await sustain()).dead).toBe(true);
  expect(await page.evaluate(()=>renderer.info.render.calls)).toBeGreaterThan(0);
});

test('preview: gravebound purchases, reaper touch special, save/resume and seventh boss use the real bundle', async ({page}, testInfo) => {
  test.skip(!enabledExpansions.includes('gravebound'), 'Gravebound is disabled in this preview configuration.');
  test.setTimeout(180000);
  await page.goto('/test/#netlocal', {waitUntil:'load'});
  await expect.poll(()=>page.evaluate(()=>typeof window.__game), {timeout:45000}).toBe('object');
  await page.evaluate(()=>window.__game.ready);
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#menu')).not.toHaveClass(/boot/);
  await page.locator('#menu [data-go="chars"]').click();
  await page.evaluate(async()=>{await wardenLoadModel();drawChars();});
  const hero = page.locator('#charGrid .item').filter({has:page.locator('img[alt="حارس العهد"]')});
  await expect(hero.locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);
  await hero.locator('img').screenshot({path:testInfo.outputPath('warden-portrait.png')});
 expect(await hero.locator('img').evaluate(img=>{
    const c=document.createElement('canvas');c.width=c.height=220;const x=c.getContext('2d');x.drawImage(img,0,0,220,220);
    const p=x.getImageData(0,0,220,220).data;let bright=0;for(let i=0;i<p.length;i+=4)if(p[i]+p[i+1]+p[i+2]>280)bright++;
    return bright;
  })).toBeGreaterThan(30);
  await hero.locator('img').screenshot({path:testInfo.outputPath('reaper-portrait.png')});
  await hero.getByRole('button', {name:/افتح/}).click();
  expect(await page.evaluate(()=>S.char)).toBe('reaper');
  // Existing achievements may reward this veteran profile when a new hero is bought.
  const funds = await page.evaluate(()=>[S.coins,S.sp]);
  await page.locator('#chars [data-go="menu"]').click();
  await page.locator('#menu [data-go="shop"]').click();
  await page.locator('#graveDemo').click();
  await expect(page.locator('#graveDemo')).toHaveCount(0);
  for (const id of ['soulvessel','soulcourt','soulguard','lantern']) {
    await page.locator(`#graveShop [data-grave="${id}"]`).getByRole('button', {name:/طوّر/}).click();
  }
  expect(await page.evaluate(()=>[S.coins,S.sp,S.grave.active])).toEqual([funds[0]+25000-5400,funds[1]+50-11,'lantern']);
  await page.locator('#shop [data-go="menu"]').click();
  await page.locator('#mPlay').click();
  await expect.poll(()=>page.evaluate(()=>G.state)).toBe('play');
  await page.evaluate(()=>{
    G.noWaves=true;G.god=true;G.enemies=[];
    G.p.hp=G.p.maxHp/2;
    const before=G.p.hp;
    for(let i=0;i<12;i++){const e=spawn('grunt',G.p.x+1,G.p.z);e.hp=1;hit(e,10,{quiet:1,noCrit:1});}
    window.__reaperHeal={gain:G.p.hp-before,cap:G.p.maxHp*0.05};
    G.enemies=[];G.picks=[];G.pending=0;
    for(const sign of [-1,1]){const e=spawn('grunt',G.p.x+sign*4,G.p.z);e.hp=e.maxHp=10000;}
    window.__circleTargets=G.enemies.slice();
  });
  const healing=await page.evaluate(()=>window.__reaperHeal);
  expect(healing.gain).toBe(0);expect(healing.gain).toBeLessThanOrEqual(healing.cap+0.001);
  await expect(page.locator('#graveMeter')).toContainText('صد أمامي');
  const start = await page.evaluate(()=>({x:G.p.x,z:G.p.z}));
  if (testInfo.project.name==='mobile') {
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:620,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:620,id:1}]});
    await expect.poll(()=>page.evaluate(s=>Math.hypot(G.p.x-s.x,G.p.z-s.z),start)).toBeGreaterThan(0.1);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    await page.locator('#bSpec').tap();
  } else { await page.keyboard.press('KeyQ'); }
  await expect.poll(()=>page.evaluate(()=>window.__circleTargets.every(e=>e.hp<e.maxHp))).toBe(true);
  expect(await page.evaluate(()=>G.grave.ghosts.length)).toBe(0);
  await expect(page.locator('#graveMeter')).toContainText('قفزة وضربة أرضية');
  expect(await page.evaluate(()=>PM.char==='reaper'&&!!PM.warden&&WARDEN_ACTOR.asset.clips.bash&&renderer.info.render.calls>0)).toBe(true);
  await page.evaluate(()=>graveCollect(5));
  await page.evaluate(()=>{bannerT=0;$('banner').classList.remove('on');G.texts=[];});
  await page.screenshot({path:testInfo.outputPath('grave-reaper.png')});
  await page.locator('#pauseBtn').click();await page.locator('#pSave').click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen_arena_modular_test_run_v1')));
  expect(saved.char).toBe('reaper');expect(saved.grave.souls).toBe(0);expect(saved.grave.relic).toBe('lantern');
  await page.locator('#mResume').click();
  await expect.poll(()=>page.evaluate(()=>G.state),{timeout:15000}).toBe('play');
  expect(await page.evaluate(()=>G.grave.relic)).toBe('lantern');
  await page.evaluate(()=>{G.god=true;G.noWaves=true;G.enemies=[];G.picks=[];G.pending=0;G.stage=5;nextStage();spawnBoss();});
  await expect.poll(()=>page.evaluate(()=>CINE.on),{timeout:45000}).toBe(false);
  await expect(page.locator('#bossbar')).toContainText('حفّار القبور');
  expect(await page.evaluate(() => {
    const body = scene.getObjectByName('ashenActor-boss6') || graveBossModel;
    return G.stage === 6 && G.boss.kind === 6 && body?.visible;
  })).toBe(true);
  await page.evaluate(()=>{G.boss.x=G.p.x;G.boss.z=G.p.z-4;G.boss.graveDig=9;G.boss.graveSlam=5;bannerT=0;$('banner').classList.remove('on');$('count').hidden=true;G.texts=[];});
  await expect.poll(()=>page.evaluate(()=>Math.abs((scene.getObjectByName('ashenActor-boss6') || graveBossModel).position.z - G.boss.z))).toBeLessThan(1);
  await page.screenshot({path:testInfo.outputPath('gravekeeper.png')});
  await page.evaluate(()=>{G.boss.graveDig=0;});
  await expect.poll(()=>page.evaluate(()=>!!G.boss.gravePhase),{timeout:10000}).toBe(true);
  expect(await page.evaluate(()=>G.zones.some(z=>!z.f&&z.r===3.6))).toBe(true);
});

test('preview: reaper starts without hidden aerial attacks', async ({page})=>{
  test.setTimeout(90000);
  await page.goto('/test/#netlocal',{waitUntil:'load'});
  await expect.poll(()=>page.evaluate(()=>typeof window.__game),{timeout:45000}).toBe('object');
  await page.evaluate(()=>window.__game.ready);
  const result=await page.evaluate(()=>{
    S.char='reaper';S.chars.reaper=1;S.tree={};S.perm={};newRun();G.state='play';G.god=true;G.noWaves=true;
    const zones=[],old=zone;
    zone=function(...args){zones.push({friendly:args[5],kind:args[6],stack:new Error().stack});return old(...args);};
    for(let i=0;i<4;i++){const e=spawn('grunt',G.p.x+Math.cos(i)*2,G.p.z+Math.sin(i)*2);e.hp=e.maxHp=100000;}
    for(let i=0;i<600;i++){G.pending=0;G.picks=[];G.cardsOpen=false;update(0.05);}
    SPECIALS.reap.f(G.p,100);G.t+=0.6;wardenTick();
    return {zones,ups:G.ups,special:heroSpecial().n,hp:G.p.hp};
  });
  console.log('REAPER_AERIAL_PROBE',JSON.stringify(result));
  expect(result.zones).toEqual([]);
});

test('preview: warden visual direction and original animated GLB',async({page},testInfo)=>{
 test.setTimeout(90000);
 await page.goto('/test/#netlocal',{waitUntil:'load'});
 await expect.poll(()=>page.evaluate(()=>typeof window.__game),{timeout:45000}).toBe('object');
 await page.evaluate(()=>window.__game.ready);
 await page.evaluate(async()=>{S.char='reaper';S.chars.reaper=1;newRun();await wardenLoadModel();buildPlayer();});
 await expect(page.locator('#menu')).not.toHaveClass(/boot/);
 await page.locator('#menu [data-go="chars"]').click();
 const hero=page.locator('#charGrid .item').filter({has:page.locator('img[alt="حارس العهد"]')});
 await expect(hero.locator('img')).toHaveAttribute('src',/^data:image\/jpeg/);
 await hero.locator('img').evaluate(img=>img.decode());
 await hero.locator('img').screenshot({path:testInfo.outputPath('warden-portrait.png')});
 expect(await hero.locator('img').evaluate(img=>{const c=document.createElement('canvas');c.width=c.height=260;const x=c.getContext('2d');x.drawImage(img,0,0,260,260);const p=x.getImageData(0,0,260,260).data;let n=0;for(let i=0;i<p.length;i+=4)if(p[i]+p[i+1]+p[i+2]>300)n++;return n;})).toBeGreaterThan(50);
 await hero.locator('img').screenshot({path:testInfo.outputPath('warden-portrait.png')});
 expect(await page.evaluate(()=>Object.keys(WARDEN_ACTOR.asset.clips).sort())).toEqual(['attack','attack2','attack3','bash','block','fall','hurt','idle','run','special','walk']);
 await page.locator('#chars [data-go="menu"]').click();await page.locator('#mPlay').click();
 await expect.poll(()=>page.evaluate(()=>G.state)).toBe('play');
 await page.evaluate(()=>{G.noWaves=true;G.god=true;G.enemies=[];bannerT=0;$('banner').classList.remove('on');$('count').hidden=true;G.texts=[];G.p.face=0;G.p.moving=0;});
 await expect.poll(()=>page.evaluate(()=>G.t)).toBeGreaterThan(1.2);
 await page.screenshot({path:testInfo.outputPath('warden-in-game.png')});
 expect(await page.evaluate(()=>!!PM.warden&&PM.char==='reaper'&&renderer.info.render.calls>0)).toBe(true);
});

test('preview: warden jump deals area damage on landing and leaves visible ground cracks', async ({page},testInfo) => {
 test.setTimeout(90000);
 await page.goto('/test/#netlocal',{waitUntil:'load'});
 await expect.poll(()=>page.evaluate(()=>typeof window.__game),{timeout:45000}).toBe('object');
 await page.evaluate(()=>window.__game.ready);
 await page.evaluate(async()=>{S.char='reaper';S.chars.reaper=1;newRun();await wardenLoadModel();buildPlayer();});
 await expect(page.locator('#menu')).not.toHaveClass(/boot/);
 await page.locator('#mPlay').click();
 await expect.poll(()=>page.evaluate(()=>G.state)).toBe('play');
 const result = await page.evaluate(() => {
  G.noWaves=true;G.god=true;G.enemies=[];G.pending=0;G.picks=[];G.p.swing=0;G.p.face=0;
  const p=G.p, start=G.t, ringsBefore=G.rings.length, now=performance.now();
  const front=spawn('grunt',p.x,p.z+3), rear=spawn('grunt',p.x,p.z-3);
  front.hp=rear.hp=10000;
  graveRelease(100);
  const sword=PM.warden.root.getObjectByName('_Sword_Hand');
  sword.geometry.computeBoundingBox();
  const pose=(offset,moving)=>{
   G.t=start+offset;
   p.moving=moving;
   wardenPose(PM,p,'scythe',true,now+offset*1000);
   sword.updateWorldMatrix(true,false);
   const tip=new THREE.Vector3(0,0,sword.geometry.boundingBox.min.z).applyMatrix4(sword.matrixWorld);
   return {height:tip.y,bodyY:PM.g.position.y,role:PM.warden.role};
  };
  const raised=pose(0.28,1);wardenTick();
  const before=[front.hp,rear.hp];
  const landed=pose(0.54,0);wardenTick();
  const damage=[10000-front.hp,10000-rear.hp];
  wardenTick();
  const duplicate=10000-front.hp!==damage[0];
  renderWardenScar(true);
  const origin = wardenScarMesh.position.clone();
  const visible = wardenScarMesh.visible && wardenScarMesh.children[0].geometry.attributes.position.count > 200;
  p.x += 4;
  pose(2,0);renderWardenScar(true);
  const staysOnGround = wardenScarMesh.visible && wardenScarMesh.position.equals(origin);
  pose(5.1,0);renderWardenScar(true);
  const expired = !wardenScarMesh.visible;
  p.x = origin.x;
  G.state='paused';
  const paused=pose(0.54,0);
  bannerT=0;$('banner').classList.remove('on');$('count').hidden=true;G.texts=[];
  render(0,now);
  return {raised,landed,paused,before,damage,duplicate,visible,staysOnGround,expired,rings:G.rings.length-ringsBefore};
 });
 expect(result.before).toEqual([10000,10000]);
 expect(result.visible).toBe(true);
 expect(result.staysOnGround).toBe(true);
 expect(result.expired).toBe(true);
 expect(result.raised.bodyY).toBeGreaterThan(2.5);
 expect(result.landed.bodyY).toBe(0);
 expect(result.raised.role).toBe('special');
 expect(result.landed.role).toBe('special');
 expect(result.raised.height-result.landed.height).toBeGreaterThan(1);
 expect(result.paused.height).toBeCloseTo(result.landed.height,5);
 expect(result.damage[0]).toBeGreaterThan(result.damage[1]);
 expect(result.damage[1]).toBeGreaterThan(0);
 expect(result.duplicate).toBe(false);
 expect(result.rings).toBe(0);
 await page.screenshot({path:testInfo.outputPath('warden-jump-impact.png')});
});

test('preview: warden normal attacks cycle three heavy clips without movement restarting them',async({page},testInfo)=>{
 test.setTimeout(90000);
 await page.goto('/test/#netlocal',{waitUntil:'load'});
 await expect.poll(()=>page.evaluate(()=>typeof window.__game),{timeout:45000}).toBe('object');
 await page.evaluate(()=>window.__game.ready);
 await page.evaluate(async()=>{S.char='reaper';S.chars.reaper=1;newRun();await wardenLoadModel();buildPlayer();});
 await expect(page.locator('#menu')).not.toHaveClass(/boot/);
 await page.locator('#mPlay').click();await expect.poll(()=>page.evaluate(()=>G.state)).toBe('play');
 const result=await page.evaluate(()=>{
  G.noWaves=true;G.god=true;G.enemies=[];G.pending=0;G.picks=[];const p=G.p,a=PM.warden,start=G.t,results=[];
  const pose=(t,moving)=>{G.t=t;p.moving=moving;wardenPose(PM,p,'scythe',true,performance.now());};
  for(let i=0;i<3;i++){
   const t=start+i;p.swing=0;pose(t,0);fire(G.weapons[0],0);pose(t,0);const role=a.role;
   pose(t+0.2,1);const first=a.upper[role].time;
   pose(t+0.4,0);const after=a.actions[role].time;
   results.push({role,first,after});pose(t+0.7,0);
  }
  G.state='paused';return {results,cd:WEP.scythe.cd,damage:WEP.scythe.dmg};
 });
 expect(result.results.map(x=>x.role)).toEqual(['attack','attack2','attack3']);
 for(const r of result.results)expect(r.after).toBeGreaterThan(r.first);
 expect(result.cd).toBe(0.85);expect(result.damage).toBe(30);
 await page.screenshot({path:testInfo.outputPath('warden-heavy-attacks.png')});
});

test('preview: warden faces the touch joystick while attacking an enemy behind', async ({page,context}, testInfo) => {
 test.skip(testInfo.project.name !== 'mobile');
 test.setTimeout(90000);
 await page.goto('/test/#netlocal',{waitUntil:'load'});
 await expect.poll(()=>page.evaluate(()=>typeof window.__game),{timeout:45000}).toBe('object');
 await page.evaluate(()=>window.__game.ready);
 await page.evaluate(async()=>{S.char='reaper';S.chars.reaper=1;newRun();await wardenLoadModel();buildPlayer();});
 await expect(page.locator('#menu')).not.toHaveClass(/boot/);
 await page.locator('#mPlay').click();
 await expect.poll(()=>page.evaluate(()=>G.state)).toBe('play');
 await page.evaluate(()=>{
  G.noWaves=true;G.god=true;G.enemies=[];G.picks=[];G.pending=0;
  const p=G.p;
  p.face=-Math.PI/2;p.speed=1.8;
  const enemy=spawn('grunt',p.x-1.4,p.z);
  enemy.hp=enemy.maxHp=10000;enemy.spd=0;
  G.weapons[0].cd=5;
  window.wardenFacingProbe={enemy,startX:p.x};
 });
 const touch=await context.newCDPSession(page);
 try {
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:620,id:1}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:620,id:1}]});
  await expect.poll(()=>page.evaluate(()=>{
   const {enemy,startX}=window.wardenFacingProbe;
   return G.p.x>startX && enemy.x<G.p.x && IN.mvx>0.5 && Math.sin(PM.g.rotation.y)>0.95;
  })).toBe(true);
  await page.evaluate(()=>{
   const {enemy}=window.wardenFacingProbe;
   enemy.x=G.p.x-1.4;enemy.z=G.p.z;
   G.weapons[0].cd=0;
  });
  await expect.poll(()=>page.evaluate(()=>{
   const {enemy}=window.wardenFacingProbe;
   return enemy.hp<enemy.maxHp && PM.warden.layered && Math.sin(PM.g.rotation.y)>0.95 &&
    Math.abs(PM.warden.fit.rotation.y)<0.2;
  })).toBe(true);
 } finally {
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await touch.detach();
 }
});

test('preview: seven boss specials warn, animate, hit on cue and leave ground marks', async ({ page }, testInfo) => {
  test.skip(!enabledExpansions.includes('boss-specials'), 'Campaign boss specials are disabled.');
  test.setTimeout(90000);
  await page.goto('/test/#lab', { waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => typeof window.__game), { timeout: 45000 }).toBe('object');
  await page.evaluate(() => window.__game.ready);
  await page.locator('#mPlay').tap();
  await expect.poll(() => page.evaluate(() => G.state)).toBe('play');

  const checks = await page.evaluate(async () => {
    const results = [];
    for (const stage of STAGES.filter(s => !s.abyss)) {
      const kind = stage.bk;
      newRun();
      G.state = 'paused';
      const actorKey = typeof bossActorKey === 'function' ? bossActorKey(kind) : null;
      if (actorKey) await loadBossActor(kind);
      Object.assign(G, { state: 'play', stage: STAGES.indexOf(stage), noWaves: true });
      Object.assign(CINE, { on: false, pending: null });
      const p = G.p;
      Object.assign(p, { x: 0, z: 8, inv: 0, hp: 1000, maxHp: 1000, shield: 0 });
      G.bossName = stage.boss;
      const boss = makeBoss(kind, 0, 0);
      boss.bossSpecialCd = 0;
      const step = 1 / 60;
      update(step);
      const skill = BOSS_SPECIALS[kind], pose = new THREE.Object3D();
      const warnings = G.zones.filter(z => z.kind === 'boss-special');
      if (!warnings.length) throw Error('Missing warning for ' + stage.boss);
      const target = warnings.find(z => z.d === skill.wind);
      const hpBefore = p.hp;
      const warningDamage = target.dmg;
      const moveBefore = boss.bossSpecial.elapsed;
      boss.frz = .13;
      update(step);
      const froze = boss.bossSpecial.elapsed === moveBefore && target.l === moveBefore;
      boss.frz = 0;
      while (boss.bossSpecial.elapsed < skill.wind * .8) update(step);
      poseBossSpecial(pose, boss);
      const poseBefore = [pose.position.y, pose.rotation.x, pose.rotation.y, pose.rotation.z];
      const safeDuringWarning = p.hp === hpBefore;
      render(0, performance.now());
      const model = actorKey && scene.getObjectByName('ashenActor-' + actorKey);
      const skeleton = model && model.getObjectByProperty('isSkinnedMesh', true)?.skeleton;
      const jointsBefore = skeleton?.bones.map(bone => bone.quaternion.toArray());
      Object.assign(p, { x: target.x, z: target.z, inv: 0 });
      while (boss.bossSpecial.elapsed < skill.wind + .045) update(step);
      render(0, performance.now());
      const marks = bossImpactScar.count;
      const clip = actorKey && ACTOR_MODELS.diagnostics()[actorKey]?.clips.special;
      const jointShift = skeleton?.bones.some((bone, i) => bone.quaternion.toArray()
        .some((value, axis) => Math.abs(value - jointsBefore[i][axis]) > .03));
      results.push({
        kind, actorKey, clip, jointShift, name: skill.name, health: boss.maxHp, warningDamage, safeDuringWarning, froze, poseBefore,
        hit: hpBefore > p.hp, marks, landed: kind !== 2 || boss.y < .1,
      });
      // Resume the loop with the visual on the last boss for a phone-sized screenshot.
      G.state = 'paused';
      render(0, performance.now());
    }
    return results;
  });
  expect(checks).toHaveLength(7);
  expect(new Set(checks.map(x => x.name)).size).toBe(7);
  expect(new Set(checks.map(x => x.poseBefore.join(','))).size).toBe(7);
  for (const row of checks) {
    expect(row.health).toBeGreaterThan(2500);
    expect(row.warningDamage).toBeGreaterThan(20);
    expect(row.safeDuringWarning && row.hit && row.froze && row.landed).toBe(true);
    expect(row.marks).toBeGreaterThan(0);
    if (row.actorKey) {
      expect(row.clip).toBe(row.kind === 0 ? 'rootSlam' : 'special');
      expect(row.jointShift).toBe(true);
    }
  }
  if (forestDefault === 'ancient') {
    expect(checks.filter(row => row.actorKey).map(row => row.kind)).toEqual(expect.arrayContaining([0, 1, 2, 4, 5, 6]));
  }
  await page.screenshot({ path: testInfo.outputPath('boss-special-impact.png') });
});

test('preview: ancient forest guardian raises its arms and slams on the root warning clock', async ({ page }, testInfo) => {
  test.skip(release !== 'clean-20261117-v26' && forestDefault !== 'ancient', 'The ancient tree review asset is not in this build.');
  test.setTimeout(90000);
  const loads = [];
  page.on('request', request => {
    if (/\/forest-guardian\/[^/?]+\.glb/.test(request.url())) loads.push(request.url());
  });
  await page.goto('/test/?forest=ancient#lab', { waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => typeof window.__game), { timeout: 45000 }).toBe('object');
  await page.evaluate(() => window.__game.ready);
  const selection = await page.evaluate(() => ({
    alternative: ACTOR_CONFIG.guardian.file.endsWith('/ancient-tree.glb'),
    sameHeight: ACTOR_CONFIG.guardian.height === null,
  }));
  expect(selection.alternative).toBe(true);
  expect(selection.sameHeight).toBe(true);
  expect(loads).toEqual([]);
  await page.locator('#mLab').tap();
  await page.locator('#labBtn').tap();
  await page.locator('#labBoss').getByRole('button', { name: 'حارس الغابة' }).tap();
  await expect.poll(() => page.evaluate(() => ACTOR_MODELS.diagnostics().guardian?.clips.special), {
    timeout: 20000,
  }).toBe('rootSlam');

  const result = await page.evaluate(() => {
    bossIntroEnd();
    const boss = G.boss, p = G.p;
    G.enemies = [boss];
    Object.assign(boss, { x: p.x, z: p.z - 6, st: 0, bossSpecialCd: 0 });
    const step = 1 / 60;
    update(step);
    const measure = () => {
      render(0, performance.now());
      const body = scene.getObjectByName('ashenActor-guardian');
      const skinned = body.getObjectByProperty('isSkinnedMesh', true);
      const hand = skinned.skeleton.bones.find(bone => bone.name.startsWith('Hand') && bone.name.endsWith('R'));
      const hips = skinned.skeleton.bones.find(bone => bone.name === 'Hips');
      return hand.getWorldPosition(new THREE.Vector3()).y - hips.getWorldPosition(new THREE.Vector3()).y;
    };
    const armed = measure();
    while (boss.bossSpecial.elapsed < .92) update(step);
    const raised = measure();
    const warningsBeforeHit = G.zones.filter(z => z.kind === 'boss-special').length;
    while (boss.bossSpecial.elapsed < 1.05) update(step);
    const landed = measure();
    const marks = bossImpactScar.count;
    const clock = boss.bossSpecial.elapsed;
    G.state = 'paused';
    const paused = measure();
    return { armed, raised, landed, paused, warningsBeforeHit, marks, clock };
  });
  expect(loads).toHaveLength(1);
  expect(loads[0]).toContain('/ancient-tree.glb');
  expect(result.raised - result.armed).toBeGreaterThan(1.5);
  expect(result.raised - result.landed).toBeGreaterThan(1);
  expect(result.paused).toBeCloseTo(result.landed, 4);
  expect(result.warningsBeforeHit).toBeGreaterThan(0);
  expect(result.marks).toBeGreaterThan(0);
  expect(result.clock).toBeLessThan(1.08);
  await page.screenshot({ path: testInfo.outputPath('ancient-tree-root-slam.png') });
});
