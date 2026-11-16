import { chromium } from '../../node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const url = process.argv[2] || 'http://127.0.0.1:8098/test/';
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
const results = [];
try {
  const modes = process.env.MODULAR_BASE_ONLY === '1' ? [''] : ['', 'knight', 'ranger', 'forest-guardian', 'knight,ranger,forest-guardian'];
  for (const mode of modes) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
    const errors = [], assets = [], remote = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('request', r => {
      const u = new URL(r.url());
      if (u.pathname.includes('/addons/') && /\.glb/.test(u.pathname)) assets.push(u.pathname);
      if (u.hostname.endsWith('supabase.co')) remote.push(r.url());
    });
    const target = new URL(url); target.searchParams.set('addons', mode);
    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof G !== 'undefined' && G.state === 'menu', null, { timeout: 15000 });
    const boot = await page.evaluate(() => ({ enabled: ASHEN_ADDONS.enabledIds(), state: G.state, loadScreen: !!document.querySelector('#loadScr'), netLocal: NET_LOCAL, release: ASHEN_TEST_RELEASE.release, three: THREE.REVISION }));
    assert.equal(boot.loadScreen, false); assert.equal(boot.netLocal, true); assert.equal(boot.state, 'menu');
    await page.evaluate(() => { S.name = 'اختبار محلي'; document.querySelector('#nameScr').hidden = true; });
    if (mode.includes('ranger')) {
      await page.evaluate(() => { S.chars.ranger = 1; S.char = 'ranger'; newRun(); buildPlayer(); });
      await page.waitForFunction(() => PM.char === 'ranger' && !!PM.actor, null, { timeout: 20000 });
    } else if (mode === 'knight') {
      await page.waitForFunction(() => PM.char === 'knight' && !!PM.actor, null, { timeout: 20000 });
    }
    await page.waitForTimeout(350);
    if (mode === '') {
      assert.equal(assets.length, 0, 'baseline must not fetch any addon model');
      assert.deepEqual(await page.evaluate(() => ACTOR_MODELS.diagnostics()), {});
      await page.screenshot({ path: '/tmp/ashen-new-clean-menu.png' });
    }
    await page.evaluate(() => document.querySelector('#mPlay').click());
    await page.waitForFunction(() => G.state === 'play', null, { timeout: 10000 });
    let boss = null;
    if (mode.includes('forest-guardian')) {
      await page.evaluate(() => { G.forceBoss = 0; spawnBoss(); });
      await page.waitForFunction(() => CINE.on && !CINE.pending && !!ACTOR_MODELS.diagnostics().guardian, null, { timeout: 25000 });
      boss = await page.evaluate(() => ({ pending: !!CINE.pending, cine: CINE.on, actorReady: !!ACTOR_MODELS.diagnostics().guardian, primitive: bossMesh.visible }));
      assert.equal(boss.actorReady, true); assert.equal(boss.primitive, false);
    }
    const final = await page.evaluate(() => ({ state: G.state, hero: S.char, actor: !!PM.actor, diagnostics: Object.keys(ACTOR_MODELS.diagnostics()) }));
    for (const request of assets) {
      if (request.includes('/knight/')) assert(mode.includes('knight'));
      if (request.includes('/ranger/')) assert(mode.includes('ranger'));
      if (request.includes('/forest-guardian/')) assert(mode.includes('forest-guardian'));
    }
    assert.deepEqual(remote, [], 'test must not connect to production database');
    assert.deepEqual(errors, [], 'JavaScript exceptions');
    const result = { mode: mode || 'baseline', boot, final, assets, boss, errors };
    results.push(result); console.log('PASS', JSON.stringify(result));
    await page.close();
  }
  await fs.writeFile('/tmp/ashen-modular-browser-results.json', JSON.stringify(results, null, 2));
} finally { await browser.close(); }
