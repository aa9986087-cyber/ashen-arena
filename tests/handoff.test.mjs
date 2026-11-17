import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { START, END, replaceAutomaticSection, makeSnapshot, updateHandoff } from '../tools/update-handoff.mjs';

test('automatic updates preserve all manual notes and reject ambiguous section markers', () => {
  const notes = `# قرارات المالك\nالجوال أولًا\n${START}\nقديم\n${END}\n## المتبقي\nلا تنشر التجربة في الأساسية\n`;
  const updated = replaceAutomaticSection(notes, 'سجل جديد');
  assert.equal(updated, notes.replace('قديم', 'سجل جديد'));
  assert.equal(replaceAutomaticSection(updated, 'سجل جديد'), updated);
  for (const broken of ['', START, END + START, notes + START, notes + END])
    assert.throws(() => replaceAutomaticSection(broken, 'new'), /one ordered/);
});

test('snapshot uses committed files and actual check outcomes, keeping failed/skipped states explicit', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'ashen-handoff-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  mkdirSync(path.join(root, 'docs')); mkdirSync(path.join(root, 'test'));
  writeFileSync(path.join(root, 'docs/HANDOFF.md'), `قرارات ثابتة\n${START}\nقديم\n${END}\nمهام متبقية\n`);
  writeFileSync(path.join(root, 'test/modular-config.json'), JSON.stringify({ release: 'clean-fixture-v1' }));
  git(['add', '.']); git(['commit', '-qm', 'base']);
  const before = git(['rev-parse', 'HEAD']);
  writeFileSync(path.join(root, 'docs/guide.md'), 'change');
  git(['add', '.']); git(['commit', '-qm', 'تحديث [رابط] `عنوان`']);
  const sha = git(['rev-parse', 'HEAD']);
  writeFileSync(path.join(root, 'not-uploaded.txt'), 'not part of this handoff');
  const options = { root, sha, before, repo: 'fixture/game', runId: '123', attempt: '2',
    check: 'failure', fast: 'success', mobile: 'skipped', profile: 'text', deploy: 'skipped', now: '2026-11-17T00:00:00Z' };
  const report = makeSnapshot(options);
  assert.ok(report.includes(sha)); assert.ok(report.includes('docs/guide.md'));
  assert.ok(report.includes('clean-fixture-v1')); assert.ok(report.includes('/runs/123/attempts/2'));
  assert.ok(report.includes('check: **فشل**')); assert.ok(report.includes('متصفح الجوال: **لم يُشغّل**'));
  assert.ok(!report.includes('not-uploaded.txt')); assert.ok(!report.includes('الفحوص ناجحة لهذا المرجع'));
  const unknown = makeSnapshot({ ...options, before: '0'.repeat(40), check: 'cancelled', fast: undefined });
  assert.ok(unknown.includes('تاريخ المقارنة غير متاح')); assert.ok(unknown.includes('**ملغى**'));
  assert.ok(unknown.includes('غير متاح؛ راجع سجل التشغيل'));
  assert.throws(() => makeSnapshot({ ...options, sha: 'HEAD; attack' }), /Invalid handoff/);
  updateHandoff({ GITHUB_SHA: sha, HANDOFF_BEFORE: before, GITHUB_REPOSITORY: 'fixture/game',
    GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2', HANDOFF_CHECK: 'success', HANDOFF_FAST: 'success',
    HANDOFF_MOBILE: 'success', HANDOFF_PROFILE: 'mobile', HANDOFF_DEPLOY: 'skipped' }, root);
  const saved = readFileSync(path.join(root, 'docs/HANDOFF.md'), 'utf8');
  assert.ok(saved.startsWith('قرارات ثابتة\n')); assert.ok(saved.endsWith('مهام متبقية\n'));
  assert.ok(saved.includes('الفحوص ناجحة لهذا المرجع'));
  assert.equal(git(['diff', '--name-only']), 'docs/HANDOFF.md');
});
