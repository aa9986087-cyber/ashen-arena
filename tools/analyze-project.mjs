import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { analyze } from 'eslint-scope';

// Advisory analysis only: never deletes source, guesses runtime coverage, or uploads data.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || path.join(root, 'docs', 'generated'));
const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root })
  .toString()
  .split('\0')
  .filter(Boolean)
  .filter(
    f => !f.startsWith('docs/generated/') && !f.startsWith('test-results/') && !f.startsWith('playwright-report/')
  );
const allFiles = [
  ...new Set([...tracked, ...['tools/analyze-project.mjs'].filter(f => fs.existsSync(path.join(root, f)))]),
].sort();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tags = [...html.matchAll(/<(script|link)\b[^>]*\b(src|href)=["']([^"']+)["'][^>]*>/gi)];
const runtime = tags.map(m => m[3].split('?')[0]).filter(p => p.startsWith('js/'));
const styles = tags.map(m => m[3].split('?')[0]).filter(p => p.startsWith('css/'));
const groupDefinitions = [
  ['core', 'الأساس والحفظ', '#d6b96d', 'js/core/'],
  ['data', 'بيانات اللعبة', '#a7b5cd', 'js/data/'],
  ['game', 'قواعد اللعب', '#f29b55', 'js/game/'],
  ['render', 'العالم والرسم', '#70bf98', 'js/render/'],
  ['audio', 'الصوت', '#de9dbc', 'js/audio/'],
  ['duel', 'المبارزات', '#e17777', 'js/duel/'],
  ['coop', 'التعاون', '#81b4dc', 'js/coop/'],
  ['ui', 'الواجهات', '#bb9fe1', 'js/ui/'],
  ['entry', 'الدخول والتحكم', '#eadab4', ''],
  ['css', 'التنسيق', '#8ca3ba', 'css/'],
  ['assets', 'الأصول', '#829587', 'assets/'],
  ['backend', 'Supabase', '#8ccaad', 'supabase/'],
  ['tools', 'أدوات التطوير', '#b3aaa1', 'tools/'],
];
function category(file) {
  return groupDefinitions.find(g => g[3] && file.startsWith(g[3]))?.[0] || 'entry';
}
function lineOf(text, offset) {
  return text.slice(0, offset).split('\n').length;
}
const fileNodes = allFiles.map(file => {
  const bytes = fs.readFileSync(path.join(root, file));
  const extension = path.extname(file).slice(1) || 'config';
  const textLike = ['js', 'mjs', 'py', 'css', 'html', 'md', 'sql', 'json', 'txt'].includes(extension);
  return {
    id: file,
    label: path.basename(file),
    path: file,
    group: category(file),
    type: 'file',
    extension,
    bytes: bytes.length,
    lines: textLike ? bytes.toString('utf8').split('\n').length : null,
    hash: crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12),
    runtime: runtime.includes(file) || styles.includes(file) || file === 'index.html',
    symbols: [],
    status: 'used',
    role: '',
    notes: [],
  };
});
const files = new Map(fileNodes.map(n => [n.id, n]));
const sources = new Map();
const definitions = new Map();
const refs = [];
const tokenGroups = new Map();
const navigation = [];
const domAccess = [];
const literals = [];
const parseErrors = [];
for (const file of runtime) {
  if (!files.has(file)) continue;
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  sources.set(file, source);
  const tokens = [];
  try {
    const ast = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      locations: true,
      ranges: true,
      onToken: tokens,
    });
    const scope = analyze(ast, { ecmaVersion: 2022, sourceType: 'script', optimistic: false, ignoreEval: false });
    for (const variable of scope.globalScope.variables) {
      if (!variable.defs.length) continue;
      const def = variable.defs[0];
      const name = variable.name;
      const line = def.name.loc.start.line;
      const symbol = {
        name,
        line,
        kind: def.type,
        localReferences: variable.references.filter(r => r.isRead()).length,
      };
      files.get(file).symbols.push(symbol);
      const arr = definitions.get(name) || [];
      arr.push({ file, line, symbol });
      definitions.set(name, arr);
    }
    for (const ref of scope.globalScope.through) {
      if (ref.isRead()) refs.push({ file, name: ref.identifier.name, line: ref.identifier.loc.start.line });
    }
    walk.simple(ast, {
      Literal(n) {
        if (typeof n.value === 'string') literals.push({ file, value: n.value, line: n.loc.start.line });
      },
      CallExpression(n) {
        const name = n.callee.type === 'Identifier' ? n.callee.name : '';
        const arg = n.arguments[0];
        if (!arg || arg.type !== 'Literal' || typeof arg.value !== 'string') return;
        if (name === 'go' || name === 'goNow')
          navigation.push({ file, target: arg.value, line: n.loc.start.line, source: null, kind: 'dynamic' });
        if (name === '$' || name === 'show') domAccess.push({ file, id: arg.value, line: n.loc.start.line });
      },
    });
    // Exact 36-token blocks are advisory duplicate candidates, not a pass/fail gate.
    for (let i = 0; i + 36 < tokens.length; i += 12) {
      const window = tokens.slice(i, i + 36);
      const hash = window.map(t => `${t.type.label}:${String(t.value ?? '')}`).join('|');
      const arr = tokenGroups.get(hash) || [];
      arr.push({ file, line: window[0].loc.start.line, end: window.at(-1).loc.end.line });
      tokenGroups.set(hash, arr);
    }
    const comment = source.match(/\/\*([\s\S]*?)\*\//);
    files.get(file).role = comment ? comment[1].replace(/\s+/g, ' ').trim().slice(0, 280) : '';
  } catch (err) {
    parseErrors.push({ file, error: err.message });
  }
}
const edgeMap = new Map();
function link(source, target, kind, evidence) {
  if (source === target || !files.has(source) || !files.has(target)) return;
  const key = `${source}\0${target}\0${kind}`;
  const edge = edgeMap.get(key) || { id: `e${edgeMap.size}`, source, target, kind, count: 0, evidence: [] };
  edge.count++;
  if (edge.evidence.length < 24) edge.evidence.push(evidence);
  edgeMap.set(key, edge);
}
for (const ref of refs) {
  const def = definitions.get(ref.name) || [];
  if (def.length === 1)
    link(ref.file, def[0].file, 'static', { symbol: ref.name, line: ref.line, definitionLine: def[0].line });
}
for (const p of [...runtime, ...styles])
  link('index.html', p, 'static', { symbol: 'HTML resource', line: lineOf(html, html.indexOf(p)) });
const idLocations = new Map();
const stack = [];
for (const match of html.matchAll(/<\/?[A-Za-z][^>]*>/g)) {
  const text = match[0],
    closing = text.startsWith('</'),
    tag = /^<\/?([\w-]+)/.exec(text)?.[1];
  if (closing) {
    const index = stack.map(s => s.tag).lastIndexOf(tag);
    if (index >= 0) stack.splice(index);
    continue;
  }
  const attrs = Object.fromEntries([...text.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map(m => [m[1], m[2]]));
  if (attrs.id)
    idLocations.set(attrs.id, {
      line: lineOf(html, match.index),
      screen: attrs.class?.split(/\s+/).includes('screen'),
    });
  const enclosing = [...stack].reverse().find(s => s.screen)?.id || null;
  if (attrs['data-go'])
    navigation.push({
      file: 'index.html',
      line: lineOf(html, match.index),
      target: attrs['data-go'],
      source: enclosing,
      kind: 'static',
    });
  if (
    !['input', 'img', 'link', 'meta', 'br', 'hr', 'source', 'path', 'circle', 'rect'].includes(tag) &&
    !text.endsWith('/>')
  ) {
    stack.push({ tag, id: attrs.id, screen: attrs.class?.split(/\s+/).includes('screen') });
  }
}
for (const ref of domAccess)
  if (idLocations.has(ref.id))
    link(ref.file, 'index.html', 'static', {
      symbol: `DOM #${ref.id}`,
      line: ref.line,
      definitionLine: idLocations.get(ref.id).line,
    });
const binaryFiles = fileNodes.filter(n => n.group === 'assets');
for (const lit of literals) {
  const direct = lit.value.split('?')[0].replace(/^\.\//, '');
  if (files.has(direct)) link(lit.file, direct, 'static', { symbol: lit.value, line: lit.line });
  else if (/\.(glb|mp3|m4a|png)$/.test(direct)) {
    const candidates = binaryFiles.filter(n => path.basename(n.path) === path.basename(direct));
    for (const target of candidates)
      link(lit.file, target.id, 'dynamic', {
        symbol: lit.value,
        line: lit.line,
        note: 'Filename match with a runtime path prefix; verify configuration.',
      });
  }
}
const snippet = (file, line, length = 3) =>
  (sources.get(file) || (file === 'index.html' ? html : ''))
    .split('\n')
    .slice(Math.max(0, line - 1), line - 1 + length)
    .join('\n');
for (const e of edgeMap.values()) for (const ev of e.evidence) ev.snippet = snippet(e.source, ev.line);
const reads = new Map();
for (const ref of refs) reads.set(ref.name, (reads.get(ref.name) || 0) + 1);
const candidates = [];
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
for (const [name, defs] of definitions) {
  if (defs.length !== 1) continue;
  const d = defs[0];
  if (d.symbol.localReferences || reads.get(name) || readme.includes(name + '(')) continue;
  // Dynamic access, HTML handlers and intentionally exported names cannot be proven dead here.
  candidates.push({
    file: d.file,
    name,
    line: d.line,
    confidence: 'candidate',
    reason: 'No lexical reads found. Dynamic properties, external use and callbacks require human confirmation.',
  });
}
const duplicateBlocks = [];
const duplicateKeys = new Set();
for (const occurrences of tokenGroups.values()) {
  const unique = [...new Map(occurrences.map(o => [`${o.file}:${o.line}`, o])).values()];
  if (new Set(unique.map(o => o.file)).size < 2) continue;
  const key = unique
    .map(o => `${o.file}:${Math.floor(o.line / 8)}`)
    .sort()
    .join('|');
  if (duplicateKeys.has(key)) continue;
  duplicateKeys.add(key);
  duplicateBlocks.push({ occurrences: unique.slice(0, 6), confidence: 'candidate', tokenCount: 36 });
}
const screens = [...idLocations]
  .filter(([, info]) => info.screen)
  .map(([id, info]) => ({
    id: `screen:${id}`,
    screenId: id,
    label: id,
    group: 'screens',
    type: 'screen',
    extension: 'screen',
    line: info.line,
    path: 'index.html',
    role: 'Screen declared in index.html. Navigation edges show literal targets, not all runtime transitions.',
    symbols: [],
    status: 'used',
    notes: [],
  }));
const screenIds = new Set(screens.map(s => s.screenId));
const routeEdges = [];
const routeKeys = new Set();
for (const n of navigation) {
  if (!screenIds.has(n.target)) continue;
  const from = n.source && screenIds.has(n.source) ? `screen:${n.source}` : n.file;
  const key = `${from}->${n.target}:${n.kind}`;
  if (routeKeys.has(key)) continue;
  routeKeys.add(key);
  routeEdges.push({
    id: `r${routeEdges.length}`,
    source: from,
    target: `screen:${n.target}`,
    kind: n.kind,
    count: 1,
    evidence: [{ file: n.file, line: n.line, symbol: `go(${n.target})`, snippet: snippet(n.file, n.line) }],
  });
}
for (const node of fileNodes) {
  node.notes.push(
    ...candidates.filter(c => c.file === node.id).map(c => `${c.name}:${c.line} — candidate only, not safe deletion.`)
  );
  if (!node.runtime && node.group === 'tools') node.status = 'tool';
  else if (!node.runtime && ![...edgeMap.values()].some(e => e.target === node.id) && node.group === 'assets')
    node.status = 'dynamic';
}
const groups = groupDefinitions.map(([id, label, color]) => ({
  id,
  label,
  color,
  files: fileNodes.filter(f => f.group === id).length,
}));
const moduleMap = new Map();
for (const e of edgeMap.values()) {
  const source = files.get(e.source).group,
    target = files.get(e.target).group;
  if (source === target) continue;
  const key = `${source}->${target}:${e.kind}`;
  const m = moduleMap.get(key) || {
    id: `m${moduleMap.size}`,
    source: `module:${source}`,
    target: `module:${target}`,
    kind: e.kind,
    count: 0,
    evidence: [],
  };
  m.count += e.count;
  if (m.evidence.length < 8) m.evidence.push({ file: e.source, targetFile: e.target, ...e.evidence[0] });
  moduleMap.set(key, m);
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root })
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean);
const graph = {
  meta: {
    name: 'Ashen Arena',
    baseCommit: commit,
    generatedAt: new Date().toISOString(),
    modifiedFiles: dirty,
    fileCount: fileNodes.length,
    runtimeScripts: runtime.length,
    globalSymbols: [...definitions.values()].flat().length,
    edges: edgeMap.size,
    screens: screens.length,
    limitations:
      'Static lexical global references + literal DOM/resources/navigation. Dynamic lookup and runtime reachability are not exhaustively proven. A candidate is not dead code.',
    direction: 'source uses target (consumer → provider)',
    phase: 'local-preview-not-published',
  },
  groups,
  nodes: fileNodes,
  edges: [...edgeMap.values()],
  screens,
  routeEdges,
  modules: groups.map(g => ({
    id: `module:${g.id}`,
    label: g.label,
    group: g.id,
    type: 'module',
    extension: 'module',
    files: g.files,
    role: `${g.files} files`,
    symbols: [],
    status: 'used',
    notes: [],
  })),
  moduleEdges: [...moduleMap.values()],
  candidates,
  duplicateBlocks: duplicateBlocks.slice(0, 150),
  parseErrors,
};
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'graph.json'), JSON.stringify(graph, null, 2) + '\n');
const mmd = [
  'flowchart LR',
  ...groups.map(g => `  ${g.id}["${g.label} (${g.files})"]`),
  ...[...moduleMap.values()]
    .filter(e => e.kind === 'static')
    .map(e => `  ${e.source.slice(7)} --> ${e.target.slice(7)}`),
].join('\n');
fs.writeFileSync(path.join(output, 'architecture.mmd'), mmd + '\n');
fs.writeFileSync(
  path.join(output, 'analysis.json'),
  JSON.stringify({ candidates, duplicateBlocks, parseErrors, limitations: graph.meta.limitations }, null, 2) + '\n'
);
console.log(
  JSON.stringify({
    output,
    files: fileNodes.length,
    runtimeScripts: runtime.length,
    edges: edgeMap.size,
    candidates: candidates.length,
    duplicateCandidates: duplicateBlocks.length,
    parseErrors: parseErrors.length,
  })
);
if (parseErrors.length) process.exitCode = 1;
