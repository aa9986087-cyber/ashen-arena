import vm from 'node:vm';
import { read, scriptOrder } from './project.mjs';

// These stand-ins are boundary adapters only. Rules, data, navigation, and persistence are source code.
// Browser smoke does not use this DOM adapter, or replace the renderer/main.
export async function globals({ stored, deniedStorage = false, files, sources = {} } = {}) {
  const storage = new Map(stored === undefined ? [] : [['ashen_arena_v1', typeof stored === 'string' ? stored : JSON.stringify(stored)]]);
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, {
        id, hidden: id !== 'menu', dataset: {}, style: {}, textContent: '', innerHTML: '',
        classList: { add: v => classes.add(v), remove: v => classes.delete(v), toggle: v => classes.has(v) ? classes.delete(v) : classes.add(v), contains: v => classes.has(v) },
        addEventListener() {}, setAttribute() {},
      });
    }
    return nodes.get(id);
  }
  const events = { network: [], timers: [], sound: [], toasts: [], writes: 0 };
  const context = vm.createContext({
    console, atob, btoa, AbortSignal, location: { hostname: '127.0.0.1', hash: '#netlocal' },
    document: { getElementById: node, querySelectorAll: () => [], querySelector: () => null, addEventListener() {} },
    localStorage: {
      getItem(key) { if (deniedStorage) throw new Error('storage denied'); return storage.get(key) ?? null; },
      setItem(key, value) { if (deniedStorage) throw new Error('storage denied'); events.writes++; storage.set(key, value); },
      removeItem(key) { storage.delete(key); },
    },
    fetch(...args) { events.network.push(args); throw new Error('network forbidden in unit tests'); },
    setTimeout(fn) { events.timers.push(fn); return events.timers.length; },
    clearTimeout() {},
    AU: { init() {}, play: sound => events.sound.push(sound) },
    toast: text => events.toasts.push(text),
    vfxClear() {},
  });
  const selected = files ?? [
    'js/core/utils.js', 'js/core/config.js', 'js/core/dom.js', 'js/core/codes.js', 'js/core/save.js', 'js/core/penalties.js',
    'js/data/weapons.js', 'js/data/characters.js', 'js/data/upgrades.js', 'js/data/achievements.js',
    'js/data/stages.js', 'js/data/enemies.js', 'js/data/missions.js', 'js/data/news.js',
    'js/game/state.js', 'js/game/combat.js', 'js/game/specials.js', 'js/game/cards.js', 'js/game/run.js', 'js/game/daily.js',
    'js/ui/screens.js', 'js/ui/leaderboard.js',
  ];
  const order = await scriptOrder();
  for (const file of selected) if (!order.includes(file)) throw new Error(`Required rules script is absent from index: ${file}`);
  const loaded = [];
  for (const file of order.filter(f => selected.includes(f))) {
    new vm.Script(sources[file] ?? await read(file), { filename: file }).runInContext(context, { timeout: 1000 });
    loaded.push(file);
  }
  return { context, nodes, node, storage, events, loaded, run: src => vm.runInContext(src, context, { timeout: 1000 }),
    json: src => JSON.parse(vm.runInContext(`JSON.stringify(${src})`, context, { timeout: 1000 })) };
}
