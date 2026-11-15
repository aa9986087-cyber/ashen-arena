import { mkdir, readdir, readFile, writeFile, copyFile, rm, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const GAME_OUTPUT = path.join(ROOT, 'dist/game');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function inventory(root, dir) {
  const result = [];
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const name = `${dir}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink in production artifacts: ${name}`);
    if (entry.isDirectory()) result.push(...await inventory(root, name));
    else if (entry.isFile()) result.push(name);
  }
  return result;
}
export async function packageGame({ root = ROOT, output = GAME_OUTPUT, commit } = {}) {
  root = path.resolve(root); output = path.resolve(output);
  // Prevent accidental deletion of source. Test copies are confined to test-results too.
  if (!(output.startsWith(path.join(ROOT, 'dist') + path.sep) || output.startsWith(path.join(ROOT, 'test-results') + path.sep))) throw new Error('Output must be inside dist/ or test-results/');
  if (output === root || root.startsWith(output + path.sep)) throw new Error('Output must be inside a separate artifact directory, never the source');
  if (!commit) {
    try { commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); }
    catch { commit = 'local'; }
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(commit)) throw new Error('Unsafe commit identifier');
  const entries = ['index.html'];
  if (!(await lstat(path.join(root, 'index.html'))).isFile()) throw new Error('index.html must be a regular file');
  for (const dir of ['css', 'js', 'assets']) {
    if (!(await lstat(path.join(root, dir))).isDirectory()) throw new Error(`Game folder must be a real directory: ${dir}`);
    entries.push(...await inventory(root, dir));
  }
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const hashes = new Map();
  for (const file of entries.sort()) {
    if (file === 'index.html') continue;
    const dest = path.join(output, file);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(path.join(root, file), dest);
    if (/^(?:js|css)\/.*\.(?:js|css)$/.test(file)) hashes.set(file, sha256(await readFile(dest)).slice(0, 16));
  }
  const source = await readFile(path.join(root, 'index.html'), 'utf8');
  const html = source.replace(/\b(src|href)=(['"])((?:js|css)\/[^'"]+\.(?:js|css)(?:\?[^'"]*)?)\2/g, (match, attr, quote, url) => {
    const parsed = new URL(url, 'https://artifact.invalid/');
    const file = decodeURIComponent(parsed.pathname).replace(/^\//, '');
    const hash = hashes.get(file);
    if (!hash) throw new Error(`Missing local script/style in artifact: ${file}`);
    // Keep the numeric source ?v= used by BUILD/update detection; revision busts stale JS/CSS independently.
    parsed.searchParams.set('rev', `${commit}-${hash}`);
    return `${attr}=${quote}${file}${parsed.search}${parsed.hash}${quote}`;
  });
  await writeFile(path.join(output, 'index.html'), html);
  await writeFile(path.join(output, '.nojekyll'), '');
  return { output, commit, files: entries.length + 1, revisionedResources: hashes.size };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(JSON.stringify(await packageGame({ commit: process.env.GITHUB_SHA }), null, 2));
