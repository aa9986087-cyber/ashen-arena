import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';

test('coopStart clears old event timestamp for a new host session', () => {
  const source = fs.readFileSync('js/coop/coop.js', 'utf8');
  const ast = parse(source, { ecmaVersion: 'latest' });
  const fn = ast.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'coopStart');
  const COOP = { evTs: 900, peers: new Map(), ens: new Map(), predDead: new Set(), usedES: new Set() };
  const noop = () => {};
  const ch = {
    on() {
      return this;
    },
  };
  const context = vm.createContext({
    COOP,
    myPid: () => 'me',
    performance: { now: () => 10 },
    coopScale: noop,
    coopArena: noop,
    AU: { init: noop },
    clearRun: noop,
    newRun: noop,
    G: {},
    enterArena: noop,
    S: { stats: { runs: 0 } },
    runPerks: noop,
    $: () => ({}),
    banner: noop,
  });
  vm.runInContext(source.slice(fn.start, fn.end), context);
  context.roster = [
    { id: 'host', n: 'مضيف', ch: 'knight' },
    { id: 'me', n: 'لاعب', ch: 'mage' },
  ];
  context.ch = ch;
  vm.runInContext('coopStart(ch, roster, false)', context);
  assert.equal(COOP.evTs, 0, 'previous host event clock must never gate a new session');
  COOP.evTs = 3000;
  context.roster[0].id = 'new-host';
  vm.runInContext('coopStart(ch, roster, false)', context);
  assert.equal(COOP.evTs, 0);
  assert.equal(COOP.hostId, 'new-host');
});
