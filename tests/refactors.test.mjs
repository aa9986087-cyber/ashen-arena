import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';

function clipboardContext(clipboard, copyResult = true) {
  const state = { appended: 0, removed: 0, copied: 0, restored: false, value: '', selected: false };
  const previous = {
    focus() {
      state.restored = true;
    },
  };
  const document = {
    activeElement: previous,
    createElement() {
      return {
        style: {},
        setAttribute() {},
        focus() {
          document.activeElement = this;
        },
        select() {
          state.selected = true;
          state.value = this.value;
        },
        setSelectionRange() {},
        remove() {
          state.removed++;
        },
      };
    },
    body: {
      appendChild() {
        state.appended++;
      },
    },
    execCommand(command) {
      assert.equal(command, 'copy');
      state.copied++;
      return copyResult;
    },
  };
  const context = vm.createContext({ navigator: clipboard === undefined ? {} : { clipboard }, document });
  vm.runInContext(fs.readFileSync('js/core/clipboard.js', 'utf8'), context);
  return { fn: vm.runInContext('copyToClipboard', context), state };
}

test('shared clipboard helper uses modern API without touching DOM', async () => {
  let text;
  const c = clipboardContext({
    async writeText(value) {
      text = value;
    },
  });
  assert.equal(await c.fn('اختبار'), true);
  assert.equal(text, 'اختبار');
  assert.equal(c.state.appended, 0);
});

test('rejected clipboard promise falls back outside hidden board and restores focus', async () => {
  const c = clipboardContext({
    async writeText() {
      throw new Error('denied');
    },
  });
  assert.equal(await c.fn('AR1-test'), true);
  assert.equal(c.state.appended, 1);
  assert.equal(c.state.removed, 1);
  assert.equal(c.state.value, 'AR1-test');
  assert.equal(c.state.selected, true);
  assert.equal(c.state.restored, true);
});

test('missing clipboard returns explicit failure if fallback is unavailable', async () => {
  const c = clipboardContext(undefined, false);
  assert.equal(await c.fn('test'), false);
  assert.equal(c.state.removed, 1);
});

test('all three clipboard consumers use the same shared helper', () => {
  for (const file of ['js/ui/leaderboard.js', 'js/ui/backup.js', 'js/ui/voice.js']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /copyToClipboard\(/, file);
    assert.doesNotMatch(source, /navigator\.clipboard\.writeText/, file);
  }
});

test('voice connection state changes the rendered status even with unchanged members', () => {
  const source = fs.readFileSync('js/ui/voice.js', 'utf8');
  const ast = parse(source, { ecmaVersion: 'latest' });
  const declaration = ast.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'vcPanelDraw');
  const nodes = { vcStatus: { textContent: '' }, vcRooms: { innerHTML: '', appendChild() {} } };
  const VC = {
    room: null,
    priv: null,
    list: [],
    mute: false,
    deaf: false,
    peers: new Map(),
    ch: null,
    panelSig: null,
    dragging: false,
  };
  const context = vm.createContext({
    VC,
    VOICE_ROOMS: [],
    $: id => nodes[id],
    vcIn: () => [],
    vcPrivCard: () => ({}),
    vcTalkDraw() {},
  });
  vm.runInContext(source.slice(declaration.start, declaration.end), context);
  vm.runInContext('vcPanelDraw()', context);
  assert.equal(nodes.vcStatus.textContent, 'جارٍ الاتصال…');
  VC.ch = {};
  vm.runInContext('vcPanelDraw()', context);
  assert.notEqual(nodes.vcStatus.textContent, 'جارٍ الاتصال…');
  assert.match(nodes.vcStatus.textContent, /اختر غرفة/);
});

test('viewer button receives pointer input and retired voice selectors are gone', () => {
  const hud = fs.readFileSync('css/hud.css', 'utf8');
  assert.match(/#viewers\s*\{([^}]+)\}/.exec(hud)[1], /pointer-events:\s*auto/);
  const screens = fs.readFileSync('css/screens.css', 'utf8');
  assert.doesNotMatch(screens, /\.vcChip\.more\s*\{|\.vcT\.more\s*\{/);
  assert.match(screens, /\.vcMore/);
});
