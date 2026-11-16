import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ctx = vm.createContext({
  location: { hostname: 'example.org', hash: '' },
  document: { querySelector: () => null },
});
vm.runInContext(fs.readFileSync(path.join(root, 'js/core/config.js'), 'utf8'), ctx);
const run = code => vm.runInContext(code, ctx);

test('musicFor picks the boss over the run and the menu everywhere else', () => {
  for (const st of ['play', 'cards', 'paused', 'lab']) assert.equal(run(`musicFor('${st}', false)`), 'run', st);
  assert.equal(run("musicFor('play', true)"), 'boss');
  for (const st of ['menu', 'over', 'intro', 'count', 'duel']) assert.equal(run(`musicFor('${st}', true)`), 'menu', st);
});

test('every theme in the soundtrack exists as a real audio file', () => {
  const themes = run('MUSIC');
  assert.deepEqual(Object.keys(themes).sort(), ['boss', 'lose', 'menu', 'run', 'win']);
  for (const [key, rel] of Object.entries(themes)) {
    const file = path.join(root, rel);
    assert.ok(fs.existsSync(file), `${key}: ${rel}`);
    const size = fs.statSync(file).size;
    assert.ok(size > 150_000, `${key} is ${size} bytes`); // a placeholder would be a few KB
  }
});
