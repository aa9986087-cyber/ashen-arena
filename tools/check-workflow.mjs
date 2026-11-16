import fs from 'node:fs';
const text = fs.readFileSync(new URL('../.github/workflows/game-pages.yml', import.meta.url), 'utf8');
const jobs = [...text.matchAll(/^  (\w+):$/gm)].map(m => m[1]);
if (!jobs.includes('check') || !jobs.includes('pages') || !jobs.includes('deploy')) {
  throw new Error('missing jobs: ' + jobs.join(','));
}
if (!/if: needs\.pages\.outputs\.actions == 'true'/.test(text)) throw new Error('deploy guard missing');
console.log('workflow ok:', jobs.join(' -> '));
