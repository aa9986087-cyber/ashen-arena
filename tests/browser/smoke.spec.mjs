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
const { release, enabledExpansions = [] } = JSON.parse(await fs.readFile(path.join(testFiles, 'modular-config.json'), 'utf8'));
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
  const hero = page.locator('#charGrid .item').filter({has:page.locator('img[alt="حاصد الأرواح"]')});
  await expect(hero.locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);
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
  expect(healing.gain).toBeGreaterThan(0);expect(healing.gain).toBeLessThanOrEqual(healing.cap+0.001);
  await expect(page.locator('#graveMeter')).toContainText('القتل يشفيك');
  const start = await page.evaluate(()=>({x:G.p.x,z:G.p.z}));
  if (testInfo.project.name==='mobile') {
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:620,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:620,id:1}]});
    await expect.poll(()=>page.evaluate(s=>Math.hypot(G.p.x-s.x,G.p.z-s.z),start)).toBeGreaterThan(0.1);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    await page.locator('#bSpec').tap();
  } else { await page.keyboard.press('KeyQ'); }
  expect(await page.evaluate(()=>window.__circleTargets.every(e=>e.hp<e.maxHp))).toBe(true);
  expect(await page.evaluate(()=>G.grave.ghosts.length)).toBe(0);
  await expect(page.locator('#graveMeter')).toContainText('منجل دائري');
  expect(await page.evaluate(()=>PM.char==='reaper'&&PM.g.children.length>15&&renderer.info.render.calls>0)).toBe(true);
  await page.evaluate(()=>graveCollect(5));
  await page.evaluate(()=>{bannerT=0;$('banner').classList.remove('on');G.texts=[];});
  await page.screenshot({path:testInfo.outputPath('grave-reaper.png')});
  await page.locator('#pauseBtn').click();await page.locator('#pSave').click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('ashen_arena_modular_test_run_v1')));
  expect(saved.char).toBe('reaper');expect(saved.grave.souls).toBe(5);expect(saved.grave.relic).toBe('lantern');
  await page.locator('#mResume').click();
  await expect.poll(()=>page.evaluate(()=>G.state),{timeout:15000}).toBe('play');
  expect(await page.evaluate(()=>G.grave.relic)).toBe('lantern');
  await page.evaluate(()=>{G.god=true;G.noWaves=true;G.enemies=[];G.picks=[];G.pending=0;G.stage=5;nextStage();spawnBoss();});
  await expect.poll(()=>page.evaluate(()=>CINE.on),{timeout:45000}).toBe(false);
  await expect(page.locator('#bossbar')).toContainText('حفّار القبور');
  expect(await page.evaluate(()=>G.stage===6&&G.boss.kind===6&&graveBossModel.visible)).toBe(true);
  await page.evaluate(()=>{G.boss.x=G.p.x;G.boss.z=G.p.z-4;G.boss.graveDig=9;G.boss.graveSlam=5;bannerT=0;$('banner').classList.remove('on');$('count').hidden=true;G.texts=[];});
  await expect.poll(()=>page.evaluate(()=>Math.abs(graveBossModel.position.z-G.boss.z))).toBeLessThan(1);
  await page.screenshot({path:testInfo.outputPath('gravekeeper.png')});
  await page.evaluate(()=>{G.boss.graveDig=0;});
  await expect.poll(()=>page.evaluate(()=>!!G.boss.gravePhase),{timeout:10000}).toBe(true);
  expect(await page.evaluate(()=>G.zones.some(z=>!z.f&&z.r===3.6))).toBe(true);
});
