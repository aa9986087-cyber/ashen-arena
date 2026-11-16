import { chromium } from '../../node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const url = process.argv[2] || 'http://127.0.0.1:8098/test/?v=clean-20261117-v5';
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof G !== 'undefined' && G.state === 'menu', null, { timeout: 15000 });
  await page.evaluate(() => { S.name = 'اختبار محلي'; document.querySelector('#nameScr').hidden = true; document.querySelector('#mPlay').click(); });
  await page.waitForFunction(() => G.state === 'play', null, { timeout: 10000 });
  const result = await page.evaluate(() => {
    // 100 critical hits over one simulated second: old code would heal 300 HP.
    G.p.maxHp = 100; G.p.hp = 10; G.p.crit = 1; G.p.leech = 0;
    G.ups.vamp = 3; G.t = 0; G.healSecT = undefined; G.healSec = 0;
    G.enemies.length = 0;
    const e = { hp: 1e9, maxHp: 1e9, dead: false, r: 1, x: 0, z: 1, type: 'grunt', ward: 0, flash: 0 };
    G.enemies.push(e);
    for (let i = 0; i < 100; i++) { G.t += 0.01; hit(e, 1, { quiet: 1, aoe: 1 }); }
    const healed = G.p.hp;
    // A maxed vampire card must not be pickable again.
    G.p.hp = G.p.maxHp; G.ups.vamp = 3; G.state = 'cards'; G.cardPicked = false;
    curCards = [{ k: 'up', id: 'vamp', r: 1 }];
    chooseCard(0);
    const stacked = G.ups.vamp;
    G.state = 'play';
    return { healed, stacked, lab: LAB };
  });
  assert.ok(result.healed > 10 && result.healed <= 18.01, 'vampire healing must be capped at 8 HP per second: ' + result.healed);
  assert.equal(result.stacked, 3, 'vampire card must stay at its maximum of 3');
  assert.equal(result.lab, false, 'lab must not be public without #lab in the test path');
  assert.deepEqual(errors, [], 'JavaScript exceptions');
  console.log('PASS', JSON.stringify(result));
} finally { await browser.close(); }
