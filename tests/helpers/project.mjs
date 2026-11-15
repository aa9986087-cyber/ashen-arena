import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const read = file => readFile(path.join(ROOT, file), 'utf8');
export async function filesIn(dir) {
  const files = [];
  for (const entry of await readdir(path.join(ROOT, dir), { withFileTypes: true })) {
    const name = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await filesIn(name));
    else if (entry.isFile()) files.push(name);
  }
  return files.sort();
}

// A deliberately small tag/attribute scanner for this static HTML, not an HTML browser replacement.
// Strip comments so sample markup and commented scripts do not become resources or IDs.
export function tags(html) {
  return [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<([a-z][\w:-]*)\b([^<>]*)>/gi)].map(match => {
    const attrs = {};
    for (const attr of match[2].matchAll(/([^\s=/'">]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? '';
    }
    return { tag: match[1].toLowerCase(), attrs };
  });
}
export function localPath(url) {
  if (/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(url)) return null;
  return decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\/+/, '');
}
export async function scriptOrder() {
  return tags(await read('index.html')).filter(t => t.tag === 'script' && t.attrs.src)
    .map(t => localPath(t.attrs.src)).filter(Boolean);
}
