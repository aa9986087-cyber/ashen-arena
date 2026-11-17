import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'acorn';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const NEWS = 'js/data/news.js';

// The text lane accepts literal bulletin data, never executable code hidden in news.js.
export function isNewsData(source) {
  const literal = node => {
    if (!node) return false;
    if (node.type === 'Literal') return !node.regex && ['string', 'number', 'boolean'].includes(typeof node.value);
    if (node.type === 'ArrayExpression') return node.elements.every(literal);
    return node.type === 'ObjectExpression' && node.properties.every(p =>
      p.type === 'Property' && p.kind === 'init' && !p.method && !p.computed && !p.shorthand && literal(p.value));
  };
  try {
    const body = parse(source, { ecmaVersion: 'latest', sourceType: 'script' }).body;
    const declaration = body[1];
    return body.length === 2 && body[0].directive === 'use strict' &&
      declaration.type === 'VariableDeclaration' && declaration.kind === 'const' &&
      declaration.declarations.length === 1 && declaration.declarations[0].id.name === 'NEWS' &&
      declaration.declarations[0].init?.type === 'ArrayExpression' && literal(declaration.declarations[0].init);
  } catch { return false; }
}

export function classifyChanges(paths, newsSource) {
  const text = paths.length > 0 && paths.every(file =>
    ['AGENTS.md', 'README.md', '.rgignore', 'test/AGENTS.md'].includes(file) ||
    /^docs\/[^\n]+\.(md|txt)$/.test(file) || (file === NEWS && isNewsData(newsSource)));
  return { profile: text ? 'text' : 'mobile', browser: !text, analyze: !text, files: paths.length };
}

export function planFromGit({ base = 'origin/main', head, root = ROOT } = {}) {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    // Resolve refs before using them as arguments; missing/initial/shallow history takes the safe lane.
    const resolve = ref => git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
    const baseSha = resolve(base), headSha = resolve(head || 'HEAD');
    let names = git(['diff', '--no-renames', '--name-only', '-z', baseSha, headSha, '--']);
    if (!head) names += git(['diff', '--no-renames', '--name-only', '-z', headSha, '--']) +
      git(['ls-files', '--others', '--exclude-standard', '-z']);
    const paths = [...new Set(names.split('\0').filter(Boolean))];
    let news;
    if (paths.includes(NEWS)) {
      try { news = head ? git(['show', `${headSha}:${NEWS}`]) : readFileSync(new URL(NEWS, pathToFileURL(root + '/')), 'utf8'); }
      catch { /* A deleted bulletin requires browser checks. */ }
    }
    return classifyChanges(paths, news);
  } catch {
    return { ...classifyChanges([]), reason: 'Missing comparison history; run mobile checks.' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = { '--base': 'base', '--head': 'head', '--github-output': 'output' }[args[i]];
    if (!key || !args[i + 1]) throw new Error('Usage: change-scope.mjs [--base ref] [--head ref] [--github-output path]');
    options[key] = args[i + 1];
  }
  const plan = planFromGit(options);
  console.log(JSON.stringify(plan));
  if (options.output) appendFileSync(options.output, `profile=${plan.profile}\nbrowser=${plan.browser}\nanalyze=${plan.analyze}\n`);
}
