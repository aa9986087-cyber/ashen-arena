import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'acorn';
import { simple } from 'acorn-walk';
import { ROOT, read, filesIn, tags, localPath, scriptOrder } from '../helpers/project.mjs';

const runtimeFiles = (await filesIn('js')).filter(f => f.endsWith('.js'));

test(`all ${runtimeFiles.length} runtime JS files parse as classic scripts`, async () => {
  const failures = [];
  for (const file of runtimeFiles) {
    try {
      parse(await read(file), { ecmaVersion: 'latest', sourceType: 'script', locations: true });
    } catch (error) {
      failures.push(`${file}: ${error.message}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('index loads every runtime JS exactly once, without async/defer/module order changes', async () => {
  const order = await scriptOrder();
  assert.equal(new Set(order).size, order.length, 'duplicate local scripts');
  assert.deepEqual([...order].sort(), runtimeFiles);
  for (const { attrs } of tags(await read('index.html')).filter(
    t => t.tag === 'script' && localPath(t.attrs.src || '')
  )) {
    assert.equal(attrs.type === 'module' || 'async' in attrs || 'defer' in attrs, false, attrs.src);
  }
  assert.equal(order.at(-1), 'js/main.js');
});

test('HTML local script/link/image resources exist and stay inside the game folders', async () => {
  const refs = tags(await read('index.html'))
    .flatMap(t =>
      ['script', 'img', 'source'].includes(t.tag) ? [t.attrs.src] : t.tag === 'link' ? [t.attrs.href] : []
    )
    .filter(Boolean)
    .map(localPath)
    .filter(Boolean);
  assert.ok(refs.length > 0);
  for (const ref of refs) {
    assert.match(ref, /^(?:js|css|assets)\//, ref);
    assert.equal((await stat(path.join(ROOT, ref))).isFile(), true, ref);
  }
});

test('CSS local url assets exist', async () => {
  for (const file of (await filesIn('css')).filter(f => f.endsWith('.css'))) {
    const css = (await read(file)).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)) {
      const ref = localPath(match[1]);
      if (!ref) continue;
      const absolute = match[1].startsWith('/') ? path.join(ROOT, ref) : path.resolve(ROOT, path.dirname(file), ref);
      assert.ok(absolute.startsWith(ROOT), `${file}: ${ref}`);
      assert.equal((await stat(absolute)).isFile(), true, `${file}: ${ref}`);
    }
  }
});

test('HTML IDs are unique; SCREENS and data-go refer to existing screen elements', async () => {
  const html = tags(await read('index.html'));
  const ids = html.map(t => t.attrs.id).filter(Boolean);
  assert.equal(ids.length, new Set(ids).size, 'duplicate HTML IDs');
  let screens;
  simple(parse(await read('js/ui/screens.js'), { ecmaVersion: 'latest' }), {
    VariableDeclarator(node) {
      if (node.id.name === 'SCREENS') screens = node.init.elements.map(n => n.value);
    },
  });
  assert.ok(screens?.length);
  assert.equal(screens.length, new Set(screens).size);
  for (const id of screens) {
    const tag = html.find(t => t.attrs.id === id);
    assert.ok(tag, `SCREENS target ${id} missing`);
    assert.ok(tag.attrs.class.split(/\s+/).includes('screen'), `${id} lacks .screen`);
  }
  for (const tag of html.filter(t => 'data-go' in t.attrs))
    assert.ok(screens.includes(tag.attrs['data-go']), `data-go=${tag.attrs['data-go']}`);
});

test('hall of ash has five boards, a throne and an accessible rules panel', async () => {
  const src = await read('index.html');
  const html = tags(src);
  assert.equal(
    html.some(t => t.attrs.id === 'boardContent'),
    false
  );
  assert.equal(
    html.some(t => (t.attrs.class || '').includes('board-maint')),
    false
  );
  const tabs = html.filter(t => t.attrs['data-metric']).map(t => t.attrs['data-metric']);
  assert.deepEqual([...new Set(tabs)], ['week', 'endure', 'bosses', 'fast', 'kills']);
  assert.ok(html.some(t => t.attrs.id === 'podium'));
  assert.ok(html.some(t => t.attrs.id === 'boardLead'));
  assert.ok(html.some(t => t.attrs.id === 'bHow' && t.attrs['aria-expanded'] === 'false'));
  assert.match(src, /قاعة المجد/);
  assert.match(src, /js\/ui\/board-rank\.js/);
  assert.ok(html.some(t => t.attrs.id === 'bossCine'));
  assert.match(src, /js\/game\/boss-intro\.js/);
  assert.match(await read('js/game/spawning.js'), /bossIntroStart\(G\.boss\)/);
  assert.match(await read('js/game/update.js'), /if \(CINE\.freeze\) return;/);
  assert.ok(html.some(t => t.attrs.id === 'mProfile' && t.attrs['aria-label'] === 'ملفك الشخصي'));
  assert.match(await read('js/ui/profile.js'), /\$\('mProfile'\)\.onclick/);
});
