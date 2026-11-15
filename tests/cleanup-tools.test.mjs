import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const retargetSource = [...read('tools/retarget-swat.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('async function retarget'));
const retargetAST = parse(retargetSource, { ecmaVersion: 'latest', sourceType: 'script' });
const retargetFn = retargetAST.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'retarget');
function publicFunction(name) {
  const node = retargetAST.body.find(node => node.type === 'ExpressionStatement' &&
    node.expression.type === 'AssignmentExpression' && node.expression.left.object?.name === 'window' &&
    node.expression.left.property.name === name);
  assert.ok(node, `real source exports window.${name}`);
  return retargetSource.slice(node.start, node.end);
}
function vector(x = 0, y = 0, z = 0) {
  return { x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; },
    copy(other) { Object.assign(this, { x: other.x, y: other.y, z: other.z }); return this; },
    setScalar(value) { this.x = this.y = this.z = value; return this; } };
}

// Execute the actual rest-pose prelude, stopping before the animation sampler.
// No renderer, GLTF import, real model read or asset output is performed.
test('retarget rest-pose prelude preserves initializer evaluations and bone order', async () => {
  const events = [];
  function quaternion(label) { return { label, clone() { events.push('quat:' + label); return quaternion(label); } }; }
  function bone(name, y) {
    return { isBone: true, get name() { events.push('name:' + name); return name; },
      quaternion: quaternion(name + ':local'),
      position: { clone() { events.push('position-clone:' + name); return vector(0, y, 0); } },
      getWorldQuaternion(out) { events.push('worldQ:' + name); out.label = name + ':world'; return out; },
      getWorldPosition(out) { events.push('worldP:' + name); out.y = y; return out; } };
  }
  const targetBones = [bone('Hips', 4), bone('HandR', 5), bone('Finger', 6)];
  const sourceBones = [bone('Hips', 2), bone('HandR', 3)];
  const scene = bones => ({ updateMatrixWorld(flag) { events.push('update:' + flag); },
    traverse(callback) { for (const item of bones) callback(item); } });
  const T = scene(targetBones), Sx = scene(sourceBones);
  const loads = [];
  const end = retargetFn.body.body.find(node => node.type === 'VariableDeclaration' &&
    node.declarations.some(decl => decl.id.name === 'mixer'));
  assert.ok(end, 'prelude boundary remains the real animation mixer');
  const prefix = retargetSource.slice(retargetFn.body.start + 1, end.start);
  const context = vm.createContext({ load: async url => { loads.push(url); return { scene: url.startsWith('modular') ? T : Sx }; },
    THREE: { Vector3: function () { return vector(); }, Quaternion: function () { return quaternion('new'); } } });
  for (const name of ['bonesOf', 'worldQ']) {
    const declaration = retargetAST.body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(d => d.id.name === name));
    vm.runInContext(retargetSource.slice(declaration.start, declaration.end), context);
  }
  const result = await vm.runInContext(`(async () => {${prefix}\nreturn { ratio, restT, restS, restTLocal, order }; })()`, context);
  assert.deepEqual(loads, ['modular_men_Swat.glb', 'cyberpunk_pack_Character.glb']);
  assert.equal(result.ratio, 2);
  assert.deepEqual(Array.from(result.order, b => b.name), ['Hips', 'HandR', 'Finger']);
  assert.deepEqual(Object.keys(result.restT), ['Hips', 'HandR', 'Finger']);
  assert.deepEqual(Object.keys(result.restS), ['Hips', 'HandR']);
  assert.equal(result.restTLocal.Finger.label, 'Finger:local');
  assert.equal(result.restT.Hips.label, 'Hips:world');
  assert.equal(events.filter(e => e === 'position-clone:Hips').length, 1, 'unused clone result does not suppress its call');
  assert.equal(events.filter(e => e === 'update:true').length, 2);
  // The real filter is retained: every target bone name is read before local pose clones.
  const firstLocalClone = events.indexOf('quat:Hips:local');
  assert.equal(events.slice(0, firstLocalClone).filter(e => e === 'name:Finger').length, 3);
});

test('preview keeps slot overrides, four independent poses and property-getter effects', async () => {
  const loads = [], mixers = [], renders = [];
  let skeletonReads = 0;
  class Object3D {
    constructor() { this.position = vector(); this.rotation = vector(); this.scale = vector(1, 1, 1); this.children = []; }
    add(...children) { this.children.push(...children); }
    updateMatrixWorld() {}
    getWorldScale(out) { out.set(2, 2, 2); }
  }
  class AnimationMixer {
    constructor(object) { this.object = object; mixers.push(this); }
    clipAction(clip) { this.clip = clip; return { play() {} }; }
    setTime(time) { this.time = time; }
  }
  class Box3 { setFromObject() { this.max = { y: 4 }; this.min = { y: 0 }; return this; } }
  class Camera extends Object3D { lookAt(...args) { this.aim = args; } }
  const THREE = { Object3D, Scene: Object3D, Group: Object3D, HemisphereLight: Object3D, DirectionalLight: Object3D,
    Mesh: Object3D, BoxGeometry: Object3D, MeshStandardMaterial: Object3D, MeshBasicMaterial: Object3D,
    AnimationMixer, Box3, PerspectiveCamera: Camera, Vector3: function () { return vector(); } };
  Object.defineProperty(THREE, 'SkeletonUtils', { get() { skeletonReads++; return undefined; } });
  const slot = new Object3D();
  const clips = ['idle', 'run', 'attack'].map(name => ({ name, duration: 2 }));
  const scenes = [];
  const context = vm.createContext({ window: {}, THREE, retarget: async () => ({ T: new Object3D(), clips, slot }),
    load: async url => { loads.push(url); const scene = new Object3D(), hand = new Object3D();
      hand.isBone = true; hand.name = 'HandR'; scene.traverse = callback => callback(hand);
      scenes.push({ scene, hand }); return { scene }; },
    R: { render(...args) { renders.push(args); } }, c: { toDataURL(...args) { return args.join(':'); } } });
  vm.runInContext(publicFunction('preview'), context);
  const result = await context.window.preview([1, 2, 3], [4, 5, 6]);
  assert.equal(context.window.preview.length, 2);
  assert.equal(result, 'image/jpeg:0.88');
  assert.deepEqual(loads, Array(4).fill('modular_men_Swat.glb'));
  assert.equal(skeletonReads, 4, 'removing inst must not remove property reads');
  assert.deepEqual(mixers.map(m => m.clip.name), ['idle', 'run', 'run', 'attack']);
  assert.deepEqual(mixers.map(m => m.time), [0.6, 0.5, 1.4, 0.8]);
  for (const [i, { scene, hand }] of scenes.entries()) {
    assert.equal(scene.position.x, (i - 1.5) * 2.4);
    assert.equal(scene.scale.x, 0.5);
    assert.equal(scene.rotation.y, -0.6);
    const attached = hand.children[0];
    assert.equal(attached.name, 'handslot.r');
    assert.deepEqual([attached.rotation.x, attached.rotation.y, attached.rotation.z], [1, 2, 3]);
    assert.deepEqual([attached.position.x, attached.position.y, attached.position.z], [4, 5, 6]);
    assert.equal(attached.children[0].scale.x, 0.5, 'stand-in rifle compensates centimetre bone scaling');
  }
  assert.equal(renders.length, 1);
  assert.equal(renders[0][0].children.length, 6, 'both lights and all poses still reach the scene');
});

test('exportGlb retains public arity, binary result, animations and retarget side effects', async () => {
  const T = {}, clips = [{ name: 'idle' }], calls = [];
  let retargetCalls = 0;
  const context = vm.createContext({ window: {}, retarget: async () => { retargetCalls++; return { T, clips, slot: {} }; },
    btoa: string => Buffer.from(string, 'binary').toString('base64'), Uint8Array,
    THREE: { GLTFExporter: class { parse(scene, callback, options) { calls.push({ scene, options }); callback(Uint8Array.from([0, 127, 128, 255]).buffer); } } } });
  vm.runInContext(publicFunction('exportGlb'), context);
  assert.equal(context.window.exportGlb.length, 2, 'manual exported signature is not narrowed');
  assert.equal(await context.window.exportGlb([1, 2, 3], [4, 5, 6]), 'AH+A/w==');
  assert.equal(retargetCalls, 1);
  assert.equal(calls[0].scene, T);
  assert.equal(calls[0].options.animations, clips);
  assert.equal(calls[0].options.binary, true);
  assert.equal(calls[0].options.onlyVisible, false);
});

for (const file of ['tools/prepare-duelist.mjs', 'tools/add-duel-clips.mjs']) {
  test(`${file} keeps channel filtering, independent accessor copies and interpolation`, () => {
    const source = read(file), ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    let loop;
    walk.simple(ast, { ForOfStatement(node) {
      if (node.right.type === 'CallExpression' && node.right.callee.property?.name === 'listChannels') loop = node;
    } });
    assert.ok(loop, 'extract existing channel loop instead of duplicating its implementation');
    const input = new Float32Array([0, 1]), output = new Float32Array([0, 0, 0, 1]);
    const sampler = { getInput: () => ({ getArray: () => input }), getOutput: () => ({ getArray: () => output, getType: () => 'VEC4' }), getInterpolation: () => 'STEP' };
    const channels = [['HandR', 'rotation'], ['root', 'translation'], ['pelvis', 'translation'], ['HandR', 'translation'], ['HandR', 'scale'], ['missing', 'rotation'], [null, 'rotation']]
      .map(([name, targetPath]) => ({ getTargetNode: () => name && ({ getName: () => name }), getTargetPath: () => targetPath, getSampler: () => sampler }));
    function builder() { const value = {}; for (const key of ['Type', 'Array', 'Buffer', 'Input', 'Output', 'Interpolation', 'TargetNode', 'TargetPath', 'Sampler']) value['set' + key] = function (arg) { this[key] = arg; return this; }; return value; }
    const copied = [], accessors = [], buf = {};
    const doc = { createAccessor() { const b = builder(); accessors.push(b); return b; }, createAnimationSampler: builder, createAnimationChannel: builder };
    const bone = { HandR: {}, root: {}, pelvis: {} }, na = { addSampler() { return this; }, addChannel(channel) { copied.push(channel); return this; } };
    vm.runInNewContext(source.slice(loop.start, loop.end), { a: { listChannels: () => channels }, doc, bone, na, buf });
    assert.deepEqual(copied.map(c => c.TargetPath), ['rotation', 'translation', 'translation']);
    assert.deepEqual(copied.map(c => c.TargetNode), [bone.HandR, bone.root, bone.pelvis]);
    assert.equal(accessors.length, 6);
    for (const channel of copied) {
      assert.equal(channel.Sampler.Interpolation, 'STEP');
      assert.notEqual(channel.Sampler.Input.Array, input);
      assert.notEqual(channel.Sampler.Output.Array, output);
      assert.deepEqual(Array.from(channel.Sampler.Input.Array), [0, 1]);
      assert.deepEqual(Array.from(channel.Sampler.Output.Array), [0, 0, 0, 1]);
      assert.equal(channel.Sampler.Input.Type, 'SCALAR');
      assert.equal(channel.Sampler.Output.Type, 'VEC4');
      if (file.includes('add-duel')) assert.equal(channel.Sampler.Input.Buffer, buf);
    }
    input[0] = 99; output[0] = 99;
    assert.equal(copied[0].Sampler.Input.Array[0], 0);
    assert.equal(copied[0].Sampler.Output.Array[0], 0);
  });
}

test('legacy version stamp still updates only local double-quoted JS/CSS and is idempotent', () => {
  const source = '<script src="js/main.js?v=old"></script><link href="css/base.css"><script src="https://cdn.test/lib.js"></script><img src="assets/icon.png"><script src=\'js/untouched.js\'></script>';
  const python = "import ast,json,re,sys\np=json.loads(sys.stdin.read()); t=ast.parse(p['tool'])\nn=next(n for n in t.body if isinstance(n,ast.Assign) and any(isinstance(k,ast.Name) and k.id=='s' for k in n.targets) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='sub')\ne=ast.Expression(body=n.value); s=p['source']; v='202611152300'\nfirst=eval(compile(e,'actual-bump-version-expression','eval')); s=first\nprint(json.dumps([first,eval(compile(e,'actual-bump-version-expression','eval'))]))";
  const results = JSON.parse(execFileSync('python3', ['-c', python], { input: JSON.stringify({ source, tool: read('tools/bump-version.py') }), encoding: 'utf8' }));
  assert.equal(results[0], results[1]);
  assert.match(results[0], /src="js\/main\.js\?v=202611152300"/);
  assert.match(results[0], /href="css\/base\.css\?v=202611152300"/);
  assert.ok(results[0].includes('src="https://cdn.test/lib.js"'));
  assert.ok(results[0].includes('src="assets/icon.png"'));
  assert.ok(results[0].includes("src='js/untouched.js'"));
});

test('current chat sender still invokes legacy two-argument RPC only after 404', async () => {
  const source = read('js/ui/chat.js');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  const fn = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'chatSend');
  for (const error of [null, 'HTTP 404 missing owner overload', 'HTTP 400 slow']) {
    const requests = [], sounds = [], toasts = [];
    let refreshed = 0, focused = 0;
    const elements = { chatIn: { value: '  test message  ', focus() { focused++; } }, chatSend: { disabled: false } };
    const context = vm.createContext({ $: id => elements[id], S: { name: 'Test' }, profileKey: () => 'fictional-device-key',
      api: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); if (requests.length === 1 && error) throw new Error(error); },
      AU: { play: sound => sounds.push(sound) }, toast: text => toasts.push(text), chatLoad: () => { refreshed++; } });
    vm.runInContext('let chatBusy = false;\n' + source.slice(fn.start, fn.end), context);
    await vm.runInContext('chatSend()', context);
    assert.equal(requests[0].url, '/rest/v1/rpc/send_chat');
    assert.deepEqual(requests[0].body, { p_name: 'Test', p_msg: 'test message', p_key: 'fictional-device-key' });
    if (error?.includes('404')) {
      assert.equal(requests.length, 2);
      assert.deepEqual(requests[1].body, { p_name: 'Test', p_msg: 'test message' });
      assert.equal(elements.chatIn.value, '');
      assert.deepEqual(sounds, ['select']);
    } else if (error) {
      assert.equal(requests.length, 1, '400 must not bypass ownership rules using the old signature');
      assert.equal(elements.chatIn.value, 'test message');
      assert.equal(toasts.length, 1);
      assert.deepEqual(sounds, []);
    } else {
      assert.equal(requests.length, 1);
      assert.deepEqual(sounds, ['select']);
    }
    assert.equal(elements.chatSend.disabled, false);
    assert.equal(vm.runInContext('chatBusy', context), false);
    assert.equal(focused, 1);
    assert.equal(refreshed, 1);
  }
});

test('admin guard printer emits only canonical local functions and rejects a weakened guard', () => {
  const source = read('tools/print-admin-guards.mjs');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const body = source.slice(ast.body.find(node => node.type !== 'ImportDeclaration').start);
  const logs = [], reads = [];
  const context = vm.createContext({ console: { log: message => logs.push(message) }, fs: {
    readFileSync(file, encoding) { reads.push(file); assert.equal(encoding, 'utf8'); return read(file); },
  } });
  vm.runInContext(body, context);
  assert.deepEqual(reads, ['supabase/chat-admin.sql', 'supabase/duels.sql']);
  assert.equal(logs.length, 3);
  assert.match(logs[0], /TEST database first/);
  for (const [i, name] of ['admin_delete_chat', 'admin_delete_duels'].entries()) {
    assert.ok(logs[i + 1].startsWith('\ncreate or replace function public.' + name + '('));
    assert.match(logs[i + 1], /is distinct from/i);
    assert.ok(read(reads[i]).includes(logs[i + 1].trim()));
    assert.ok(logs[i + 1].endsWith('end $$;'));
  }
  assert.throws(() => vm.runInNewContext(body, { console: { log() {} }, fs: {
    readFileSync: file => read(file).replace(/is distinct from/gi, '<>'),
  } }), /Unsafe or missing guard/);
});
