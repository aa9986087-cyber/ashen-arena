import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, read, tags } from './project.mjs';

export const CDN_DIR = path.join(ROOT, 'tests/.cache/cdn');
export const LOCK = path.join(ROOT, 'tests/fixtures/cdn-lock.json');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function libraryURLs() {
  return tags(await read('index.html')).filter(t => t.tag === 'script' && /^https:\/\//.test(t.attrs.src || '')).map(t => t.attrs.src);
}
export async function fixtureManifest() {
  const locked = JSON.parse(await readFile(LOCK, 'utf8'));
  const urls = await libraryURLs();
  if (JSON.stringify(urls) !== JSON.stringify(locked.map(f => f.url))) throw new Error('index CDN URLs changed. Review and run npm run test:fixtures -- --refresh-lock');
  return locked;
}
export async function validateFixtures() {
  const manifest = await fixtureManifest();
  for (const item of manifest) {
    let bytes;
    try { bytes = await readFile(path.join(CDN_DIR, item.file)); }
    catch { throw new Error('Missing CDN fixtures. Run npm run test:fixtures before smoke.'); }
    if (sha256(bytes) !== item.sha256) throw new Error(`CDN fixture hash mismatch: ${item.file}`);
  }
  return manifest;
}
async function prepare(refresh) {
  await mkdir(CDN_DIR, { recursive: true });
  const urls = await libraryURLs();
  const manifest = refresh ? urls.map((url, i) => ({ url, file: `${String(i + 1).padStart(2, '0')}-${new URL(url).pathname.split('/').at(-1)}` })) : await fixtureManifest();
  for (const item of manifest) {
    const target = path.join(CDN_DIR, item.file);
    if (!refresh) {
      try { if (sha256(await readFile(target)) === item.sha256) { console.log(`Verified ${item.file}`); continue; } } catch {}
    }
    let bytes;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Fetching ${item.url} (attempt ${attempt})`);
        const response = await fetch(item.url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length) throw new Error('Empty script');
        break;
      } catch (error) { if (attempt === 3) throw error; }
    }
    const hash = sha256(bytes);
    if (!refresh && hash !== item.sha256) throw new Error(`Remote library changed: ${item.url}. Review before refreshing lock.`);
    item.sha256 = hash;
    await writeFile(target, bytes);
  }
  if (refresh) await writeFile(LOCK, JSON.stringify(manifest, null, 2) + '\n');
  await validateFixtures();
  console.log(`${manifest.length} real CDN scripts ready; hashes verified. Libraries stay outside production artifacts.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await prepare(process.argv.includes('--refresh-lock'));
