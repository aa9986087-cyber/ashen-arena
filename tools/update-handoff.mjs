import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const START = '<!-- AUTO-HANDOFF:START -->';
export const END = '<!-- AUTO-HANDOFF:END -->';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const labels = { success: 'ناجح', failure: 'فشل', cancelled: 'ملغى', skipped: 'لم يُشغّل' };
const result = value => labels[value] || 'غير متاح؛ راجع سجل التشغيل';
const text = value => String(value).replace(/[\r\n`<>\[\]\\]/g, ' ').slice(0, 180);

export function replaceAutomaticSection(source, section) {
  if (source.split(START).length !== 2 || source.split(END).length !== 2 || source.indexOf(START) > source.indexOf(END))
    throw new Error('Expected one ordered automatic handoff section; manual notes were not changed.');
  return source.slice(0, source.indexOf(START) + START.length) + '\n' + section.trim() + '\n' + source.slice(source.indexOf(END));
}

export function makeSnapshot({ root = ROOT, sha, before, repo, runId, attempt = '1', check, fast, mobile, profile,
  deploy, now = new Date().toISOString() }) {
  if (!/^[a-f0-9]{40}$/.test(sha || '') || !/^[\w.-]+\/[\w.-]+$/.test(repo || '') ||
      !/^\d+$/.test(runId || '') || !/^\d+$/.test(attempt)) throw new Error('Invalid handoff source/run identifiers');
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const commit = git(['rev-parse', '--verify', `${sha}^{commit}`]).trim();
  let base;
  try {
    if (!/^[a-f0-9]{40}$/.test(before || '') || /^0+$/.test(before)) throw new Error('No event base');
    base = git(['rev-parse', '--verify', `${before}^{commit}`]).trim();
  } catch { /* Keep missing history explicit rather than describing a partial diff as complete. */ }
  const files = base ? git(['diff', '--no-renames', '--name-only', '-z', base, commit, '--']).split('\0').filter(Boolean) : [];
  const title = text(git(['show', '-s', '--format=%s', commit]).trim());
  const recent = git(['log', '-5', '--first-parent', '--format=%h %s', commit]).trim().split('\n');
  let preview = 'غير متاح';
  try { preview = text(JSON.parse(git(['show', `${commit}:test/modular-config.json`])).release); } catch {}
  return [
    '## آخر حالة محفوظة تلقائيًا', '',
    `- وقت التسجيل (UTC): ${text(now)}.`,
    `- مرجع العمل: [\`${commit}\`](https://github.com/${repo}/commit/${commit}).`,
    `- آخر تعديل: ${title}.`,
    `- [سجل الفحوص — المحاولة ${attempt}](https://github.com/${repo}/actions/runs/${runId}/attempts/${attempt}).`,
    `- بوابة check: **${result(check)}**؛ الاختبارات السريعة: **${result(fast)}**.`,
    `- مسار الفحص: ${['text', 'mobile'].includes(profile) ? profile : 'غير متاح'}؛ متصفح الجوال: **${result(mobile)}**.`,
    `- نشر GitHub Actions: **${result(deploy)}**. عند استخدام Pages legacy يكون النشر منفصلًا؛ نجاح الفحوص وحده لا يثبت ظهوره على الموقع.`,
    `- إصدار التجربة المسجل: \`${preview}\`. هذا لا يعني نقل إصلاحاتها إلى الأساسية.`, '',
    '### الملفات المتغيرة في هذا الرفع', '',
    ...(base ? [`مقارنةً بـ\`${base.slice(0, 12)}\`: ${files.length} ملفًا.`,
      ...files.slice(0, 12).map(file => `- \`${text(file)}\``),
      ...(files.length > 12 ? [`- وبقية ${files.length - 12} ملفًا في رابط commit أعلاه.`] : [])]
      : ['تاريخ المقارنة غير متاح في checkout؛ راجع فرق commit على GitHub.']), '',
    '### أحدث خمس دفعات على main', '',
    ...recent.map(item => `- ${text(item)}`), '',
    check === 'success' ? 'الفحوص ناجحة لهذا المرجع؛ تابع العمل المتبقي المكتوب في القسم اليدوي.'
      : 'ابدأ بمراجعة سجل الفحوص لهذا المرجع؛ لا تفترض نجاح التعديل أو نشره.',
    'هذا سجل Git والفحوص، وليس تفريغًا للمحادثة. القرارات والمهام غير المرفوعة تبقى في القسم اليدوي.',
  ].join('\n');
}

export function updateHandoff(env = process.env, root = ROOT) {
  const file = new URL('docs/HANDOFF.md', pathToFileURL(root + '/'));
  const section = makeSnapshot({ root, sha: env.GITHUB_SHA, before: env.HANDOFF_BEFORE,
    repo: env.GITHUB_REPOSITORY, runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
    check: env.HANDOFF_CHECK, fast: env.HANDOFF_FAST, mobile: env.HANDOFF_MOBILE,
    profile: env.HANDOFF_PROFILE, deploy: env.HANDOFF_DEPLOY });
  writeFileSync(file, replaceAutomaticSection(readFileSync(file, 'utf8'), section));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) updateHandoff();
