import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const ctx = vm.createContext({});
const load = f => vm.runInContext(fs.readFileSync(new URL(f, root), 'utf8'), ctx);
load('js/core/utils.js');
load('js/ui/board-rank.js');
const run = code => vm.runInContext(code, ctx);

test('weekKey starts a new board every Monday (ISO weeks)', () => {
  assert.equal(run('weekKey(new Date(2026, 10, 16))'), '2026-W47');
  assert.equal(run('weekKey(new Date(2026, 10, 22))'), '2026-W47'); // Sunday stays in W47
  assert.equal(run('weekKey(new Date(2026, 10, 23))'), '2026-W48');
  assert.equal(run('weekKey(new Date(2027, 0, 1))'), '2026-W53'); // ISO edge: Friday of the last 2026 week
});

test('weeklyRoll adds each run and resets the counters on a new week', () => {
  run('var st = {}');
  run('weeklyRoll(st, {kills:10, bossesRun:1, t:120, bossT:90}, "2026-W47")');
  assert.deepEqual(JSON.parse(JSON.stringify(run('st'))), { wk: '2026-W47', wkk: 10, wb: 1, wt: 120, wft: 90 });
  run('weeklyRoll(st, {kills:5, bossesRun:2, t:80, bossT:70}, "2026-W47")');
  assert.equal(run('st.wkk'), 15);
  assert.equal(run('st.wb'), 3);
  assert.equal(run('st.wt'), 120); // the longest survival wins
  assert.equal(run('st.wft'), 70); // the fastest first boss wins
  run('weeklyRoll(st, {kills:1, bossesRun:0, t:30}, "2026-W48")');
  assert.deepEqual(JSON.parse(JSON.stringify(run('st'))), { wk: '2026-W48', wkk: 1, wb: 0, wt: 30, wft: 0 });
});

test('boardRank orders every board by its own feat and drops empty rows', () => {
  const rows = JSON.parse(
    run(`JSON.stringify([
      { n: 'A', b: 2, k: 50, lvl: 9, t: 300, ft: 120, wk: '2026-W47', wb: 3, wkk: 40, wt: 400, wft: 100 },
      { n: 'B', b: 5, k: 80, lvl: 6, t: 500, ft: 200, wk: '2026-W47', wb: 1, wkk: 90, wt: 500, wft: 140 },
      { n: 'C', b: 0, k: 10, lvl: 3, t: 60, ft: 0, wk: '2026-W46', wb: 9, wkk: 99, wt: 900, wft: 50 },
      { n: 'D', b: 1, k: 5, lvl: 4, t: 900, ft: 90, wk: '2026-W47', wb: 0, wkk: 5, wt: 200, wft: 80 }
    ])`)
  );
  const names = (id, now) =>
    run(`boardRank(${JSON.stringify(rows)}, '${id}', new Date(2026, 10, 18)).map(r => r.n).join()`);
  assert.equal(names('bosses'), 'B,A,D');
  assert.equal(names('kills'), 'B,A,C,D');
  assert.equal(names('endure'), 'D,B,A,C');
  assert.equal(names('fast'), 'D,A,B'); // nobody without a boss kill
  assert.equal(names('week'), 'A,B,D'); // C's numbers belong to last week
  const week = JSON.parse(run(`JSON.stringify(boardRank(${JSON.stringify(rows)}, 'week', new Date(2026, 10, 18)))`));
  assert.equal(week[0].text, '3 زعيم');
  assert.equal(week[0].sub, '40 قتلة · 6:40 صمود');
  const fast = JSON.parse(run(`JSON.stringify(boardRank(${JSON.stringify(rows)}, 'fast', new Date(2026, 10, 18)))`));
  assert.equal(fast[0].text, '1:30');
  assert.equal(run('boardMetric("nope").id'), 'week');
});
