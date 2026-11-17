import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { classifyChanges, isNewsData, planFromGit } from '../tools/change-scope.mjs';

const bulletin = "'use strict'; const NEWS = [{id:'2026-11-17-0900',items:[{i:'🛠️',t:'تحسين'}]}];";

test('only documentation and literal bulletin edits take the text lane', () => {
  assert.equal(classifyChanges(['docs/PROJECT-MAP.md', 'AGENTS.md', 'test/AGENTS.md']).browser, false);
  assert.equal(classifyChanges(['js/data/news.js', 'README.md'], bulletin).profile, 'text');
  for (const file of ['js/game/combat.js', 'css/hud.css', 'index.html', 'assets/icon.svg',
    'test/tools/build-modular-test.py', 'test/releases/new/app.min.js', 'supabase/schema.sql',
    'tests/browser/smoke.spec.mjs', '.github/workflows/game-pages.yml', 'package-lock.json', 'unknown']) {
    assert.equal(classifyChanges(['docs/guide.md', 'js/data/news.js', file], bulletin).browser, true, file);
  }
  assert.equal(classifyChanges([]).browser, true);
});

test('executable, broken, or deleted news cannot bypass the mobile gate', () => {
  assert.equal(isNewsData(bulletin), true);
  for (const source of [undefined, '', "'use strict'; const NEWS = [getNews()];", bulletin + 'startGame();',
    "'use strict'; const NEWS = [{get title(){return attack();}}];",
    "'use strict'; const NEWS = [{[attack()]:'text'}];", "'use strict'; const NEWS = [...other];"]) {
    assert.equal(classifyChanges(['js/data/news.js'], source).browser, true, String(source));
  }
});

test('git planner includes working files, deletions and both sides of a rename; missing history is conservative', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'ashen-scope-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  mkdirSync(path.join(root, 'docs')); mkdirSync(path.join(root, 'js/data'), { recursive: true });
  writeFileSync(path.join(root, 'docs/guide.md'), 'guide');
  writeFileSync(path.join(root, 'js/data/news.js'), bulletin);
  git(['add', '.']); git(['commit', '-qm', 'base']);
  const base = git(['rev-parse', 'HEAD']);
  writeFileSync(path.join(root, 'docs/guide.md'), 'changed');
  assert.equal(planFromGit({ base, root }).profile, 'text');
  writeFileSync(path.join(root, 'new-runtime.js'), 'game();');
  assert.equal(planFromGit({ base, root }).profile, 'mobile');
  rmSync(path.join(root, 'new-runtime.js'));
  git(['mv', 'docs/guide.md', 'js/guide.js']);
  git(['commit', '-qam', 'rename']);
  assert.equal(planFromGit({ base, head: 'HEAD', root }).profile, 'mobile');
  git(['rm', '-q', 'js/data/news.js']); git(['commit', '-qm', 'delete news']);
  assert.equal(planFromGit({ base: 'HEAD~1', head: 'HEAD', root }).profile, 'mobile');
  assert.equal(planFromGit({ base: 'missing-ref', root }).profile, 'mobile');
});
