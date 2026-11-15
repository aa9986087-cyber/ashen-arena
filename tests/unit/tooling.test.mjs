import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../helpers/project.mjs';
import { startServer } from '../../tools/test-server.mjs';
import { packageGame } from '../../tools/package-game.mjs';

async function tempDir(t) {
  await mkdir(path.join(ROOT, 'test-results'), { recursive: true });
  const dir = await mkdtemp(path.join(ROOT, 'test-results/tooling-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('local static server serves game resources but rejects writes, hidden files and traversal', async t => {
  const server = await startServer({ port: 0 });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const main = await fetch(`${base}/?v=test`);
  assert.equal(main.status, 200); assert.match(await main.text(), /ساحة الرماد/);
  assert.match(main.headers.get('content-type'), /text\/html/);
  assert.equal(main.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${base}/js/main.js?v=1`, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(base, { method: 'POST', body: 'never allowed' })).status, 405);
  for (const url of ['/package.json', '/.git/config', '/tests/helpers/globals.mjs', '/tools/test-server.mjs', '/js/%2e%2e%2fpackage.json', '/js/%5c..%5cpackage.json', '/css/']) {
    assert.equal((await fetch(base + url)).status, 404, url);
  }
});

test('production artifact contains only index/css/js/assets/.nojekyll; revisions never edit source', async t => {
  const dir = await tempDir(t), root = path.join(dir, 'source'), output = path.join(dir, 'artifact');
  for (const name of ['js', 'css', 'assets', 'tests/fixtures/cdn', '.github']) await mkdir(path.join(root, name), { recursive: true });
  const source = '<link href="css/base.css?v=123" rel="stylesheet"><script src="https://cdn.example/three.js"></script><script src="js/main.js?v=123"></script>\n';
  await writeFile(path.join(root, 'index.html'), source);
  await writeFile(path.join(root, 'js/main.js'), 'window.realGame = true;\n');
  await writeFile(path.join(root, 'css/base.css'), 'body { color: red; }\n');
  await writeFile(path.join(root, 'assets/icon.svg'), '<svg/>\n');
  await writeFile(path.join(root, 'tests/fixtures/cdn/library.js'), 'MUST NOT SHIP');
  await writeFile(path.join(root, '.github/private.yml'), 'MUST NOT SHIP');
  await writeFile(path.join(root, 'package.json'), '{}\n');
  await mkdir(output); await writeFile(path.join(output, 'stale.js'), 'MUST DISAPPEAR');
  const result = await packageGame({ root, output, commit: 'abc123' });
  assert.deepEqual((await readdir(output)).sort(), ['.nojekyll', 'assets', 'css', 'index.html', 'js']);
  const html = await readFile(path.join(output, 'index.html'), 'utf8');
  assert.match(html, /js\/main\.js\?v=123&rev=abc123-[a-f0-9]{16}/);
  assert.match(html, /css\/base\.css\?v=123&rev=abc123-[a-f0-9]{16}/);
  assert.match(html, /src="https:\/\/cdn.example\/three.js"/);
  assert.equal(await readFile(path.join(root, 'index.html'), 'utf8'), source);
  assert.equal(result.revisionedResources, 2);
  await writeFile(path.join(root, 'js/main.js'), 'window.realGame = "changed";\n');
  await packageGame({ root, output, commit: 'abc123' });
  assert.notEqual(await readFile(path.join(output, 'index.html'), 'utf8'), html, 'changed JS needs a different revision');
});

test('packager refuses symlinks and unsafe output locations', async t => {
  const dir = await tempDir(t), root = path.join(dir, 'source');
  for (const name of ['js', 'css', 'assets']) await mkdir(path.join(root, name), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<html></html>\n');
  await symlink(path.join(root, 'index.html'), path.join(root, 'js/escape.js'));
  await assert.rejects(packageGame({ root, output: path.join(dir, 'artifact'), commit: 'test' }), /Refusing symlink/);
  await assert.rejects(packageGame({ root, output: root, commit: 'test' }), /Output must be inside/);
});
