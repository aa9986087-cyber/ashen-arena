import { chromium } from '../../node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const url = process.argv[2] || 'http://127.0.0.1:8098/test/';
const desktop = process.env.MODULAR_DESKTOP === '1';
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
const results = [];
try {
  const modes = process.env.MODULAR_CURRENT_ONLY === '1' ? [null] : process.env.MODULAR_BASE_ONLY === '1' ? [''] : ['', 'knight', 'ranger', 'forest-guardian', 'knight,ranger,forest-guardian'];
  for (const mode of modes) {
    const page = await browser.newPage({ viewport: desktop ? { width: 1280, height: 800 } : { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: !desktop });
    const errors = [], assets = [], remote = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('request', r => {
      const u = new URL(r.url());
      if (u.pathname.includes('/addons/') && /\.glb/.test(u.pathname)) assets.push(u.pathname);
      if (u.hostname.endsWith('supabase.co')) remote.push(r.url());
    });
    const target = new URL(url);
    if (mode === null) target.searchParams.delete('addons');
    else target.searchParams.set('addons', mode);
    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof G !== 'undefined' && G.state === 'menu', null, { timeout: 15000 });
    const boot = await page.evaluate(() => ({ enabled: ASHEN_ADDONS.enabledIds(), configured: ASHEN_TEST_RELEASE.enabledAddons, state: G.state, loadScreen: !!document.querySelector('#loadScr'), netLocal: NET_LOCAL, release: ASHEN_TEST_RELEASE.release, three: THREE.REVISION }));
    assert.equal(boot.loadScreen, false); assert.equal(boot.netLocal, true); assert.equal(boot.state, 'menu');
    if (mode === null) assert.deepEqual(boot.enabled, boot.configured, 'default activation must match the release config');
    const active = boot.enabled.join(',');
    await page.evaluate(() => { S.name = 'اختبار محلي'; document.querySelector('#nameScr').hidden = true; });
    if (active.includes('knight')) await page.waitForFunction(() => PM.char === 'knight' && !!PM.actor, null, { timeout: 20000 });
    if (active.includes('ranger')) {
      await page.evaluate(() => { S.chars.ranger = 1; go('chars'); });
      await page.waitForFunction(() => !document.querySelector('#chars').hidden && document.querySelector('#charGrid').children.length === Object.keys(CHARS).length);
      await page.evaluate(() => {
        const card = document.querySelector('#charGrid').children[Object.keys(CHARS).indexOf('ranger')];
        card.querySelector('button').click(); go('menu');
      });
      await page.waitForFunction(() => !document.querySelector('#menu').hidden && G.state === 'menu' && PM.char === 'ranger' && !!PM.actor, null, { timeout: 20000 });
    }
    await page.waitForTimeout(350);
    if (active === '') {
      assert.equal(assets.length, 0, 'baseline must not fetch any addon model');
      assert.deepEqual(await page.evaluate(() => ACTOR_MODELS.diagnostics()), {});
    }
    await page.evaluate(() => document.querySelector('#mPlay').click());
    await page.waitForFunction(() => G.state === 'play', null, { timeout: 10000 });
    let boss = null;
    if (active.includes('forest-guardian')) {
      await page.evaluate(() => { G.forceBoss = 0; spawnBoss(); });
      await page.waitForFunction(() => CINE.on && !CINE.pending && !!ACTOR_MODELS.diagnostics().guardian, null, { timeout: 25000 });
      boss = await page.evaluate(() => ({ pending: !!CINE.pending, cine: CINE.on, actorReady: !!ACTOR_MODELS.diagnostics().guardian, primitive: bossMesh.visible }));
      assert.equal(boss.actorReady, true); assert.equal(boss.primitive, false);
    }
    const final = await page.evaluate(() => ({ state: G.state, hero: S.char, actor: !!PM.actor, diagnostics: Object.keys(ACTOR_MODELS.diagnostics()) }));
    for (const request of assets) {
      if (request.includes('/knight/')) assert(active.includes('knight'));
      if (request.includes('/ranger/')) assert(active.includes('ranger'));
      if (request.includes('/forest-guardian/')) assert(active.includes('forest-guardian'));
    }
    assert.deepEqual(remote, [], 'test must not connect to production database');
    assert.deepEqual(errors, [], 'JavaScript exceptions');
    const result = { mode: mode === null ? 'configured-default' : mode || 'baseline', desktop, boot, final, assets, boss, errors };
    results.push(result); console.log('PASS', JSON.stringify(result));
    await page.close();
  }
  await fs.writeFile('/tmp/ashen-modular-browser-results.json', JSON.stringify(results, null, 2));
} finally { await browser.close(); }
