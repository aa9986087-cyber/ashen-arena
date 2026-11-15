import { test as base, expect } from '@playwright/test';
import path from 'node:path';
import { globals } from '../helpers/globals.mjs';
import { CDN_DIR, validateFixtures } from '../helpers/cdn-fixtures.mjs';

const rules = await globals();
const latestNews = rules.run('NEWS[0]?.id');
const fixtureProfile = { ...rules.json('defSave()'), name: 'Smoke-local', newsSeen: latestNews };
// Low quality is an existing user setting, not a renderer replacement. Keep WebGL, actual main/frame/update.
fixtureProfile.set = { ...fixtureProfile.set, sfx: 0, mus: 0, shadow: 0, qual: 0, eco: 1 };

const test = base.extend({
  isolated: [async ({ context, page, baseURL }, use, testInfo) => {
    const manifest = await validateFixtures();
    const libraries = new Map(manifest.map(item => [item.url, path.join(CDN_DIR, item.file)]));
    const observed = { blockedHTTP: [], blockedWebSocket: [], pageErrors: [], loadedRuntime: [], microphoneRequests: 0 };
    // Routes installed before navigation; no Supabase request or write can reach any production host.
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const fixture = libraries.get(request.url());
      if (fixture && request.method() === 'GET') {
        await route.fulfill({ path: fixture, contentType: 'text/javascript' }); return;
      }
      if (url.origin === new URL(baseURL).origin && ['GET', 'HEAD'].includes(request.method())) {
        if (/\/js\/.*\.js$/.test(url.pathname)) observed.loadedRuntime.push(url.pathname);
        await route.continue(); return;
      }
      observed.blockedHTTP.push({ url: request.url(), method: request.method() });
      // Deterministic offline response; this is a transport boundary, not a game/UI stub.
      if (/fonts\.googleapis\.com$/.test(url.hostname)) await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
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
      localStorage.removeItem('ashen_arena_run');
      window.__testMicrophoneRequests = 0;
      // Never prompt for or grant microphone access, even if a future regression tries it.
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => {
        window.__testMicrophoneRequests++;
        return Promise.reject(new DOMException('Microphone forbidden in smoke tests', 'NotAllowedError'));
      };
    }, fixtureProfile);
    await use(observed);
    observed.microphoneRequests = await page.evaluate(() => window.__testMicrophoneRequests || 0).catch(() => 0);
    await testInfo.attach('offline-boundary-and-runtime-errors', { body: JSON.stringify(observed, null, 2), contentType: 'application/json' });
    expect(observed.microphoneRequests, 'Smoke must never request microphone').toBe(0);
    expect(observed.pageErrors, 'Uncaught errors in real runtime (not suppressed)').toEqual([]);
  }, { auto: true }],
});

async function boot(page, isolated) {
  await page.goto('/#netlocal', { waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => typeof window.__game), { timeout: 20000, message: '__game must be exported by real js/main.js' }).toBe('object');
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
  const boardRequests = () => isolated.blockedHTTP.filter(r => /\/profiles\?.*select=name,stats,updated_at/.test(r.url)).length;
  const before = boardRequests();
  for (const button of ['#board .board-maint [data-go="menu"]', '#board > .wrap > .head [data-go="menu"]']) {
    await page.locator('#menu [data-go="board"]').click();
    await expect(page.locator('#board .board-maint')).toBeVisible();
    await expect(page.locator('#board .board-maint')).toContainText('الصدارة تحت الصيانة');
    await expect(page.locator('#boardContent')).toBeHidden();
    await page.locator(button).click();
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#board')).toBeHidden();
  }
  expect(boardRequests(), 'Opening maintenance board must not call loadOnline').toBe(before);
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
    await expect.poll(() => page.evaluate(s => Math.hypot(window.__game.G.p.x - s.x, window.__game.G.p.z - s.z), start)).toBeGreaterThan(0.1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.keyboard.down('ArrowRight');
    await expect.poll(() => page.evaluate(s => Math.hypot(window.__game.G.p.x - s.x, window.__game.G.p.z - s.z), start)).toBeGreaterThan(0.1);
    await page.keyboard.up('ArrowRight');
  }
  await expect.poll(() => page.evaluate(() => window.__game.G.t)).toBeGreaterThan(start.t);
  // Inspect the existing WebGL context: require a successful real draw, not a fake __game export.
  expect(await page.evaluate(() => {
    const canvas = document.getElementById('gl');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return !!gl && !gl.isContextLost() && canvas.width > 0 && canvas.height > 0 && gl.getError() === gl.NO_ERROR && renderer.info.render.calls > 0;
  })).toBe(true);
  // A real watched event and main liveTick display the button; no fake DOM/render or production channel.
  await page.evaluate(() => liveWatched({ from: 'smoke-observer', n: 'مشاهد محلي' }));
  await expect(page.locator('#viewers')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const button = document.getElementById('viewers');
    const box = button.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('#viewers') === button;
  }), { message: '#viewers must receive real pointer input through the HUD' }).toBe(true);
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
test('screens, maintenance, voice and real play/movement/pause/save in one isolated journey', async ({ page, isolated }, testInfo) => {
  await boot(page, isolated);
  await checkScreens(page, isolated);
  await checkRound(page, testInfo);
});
