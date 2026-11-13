// Add more Universal Animation Library clips to an already built duelist.glb (no need to rebuild it from the packs):
//   node tools/add-duel-clips.mjs <ual1.glb> assets/models/duelist.glb
// Same rules as prepare-duelist.mjs: match bones by name, rotations only (plus root/pelvis translation).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [UAL, FILE] = process.argv.slice(2);
const WANT = { Sprint_Loop: 'run', Jog_Fwd_Loop: 'jog' };
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(FILE),
  root = doc.getRoot(),
  buf = root.listBuffers()[0];
const bone = Object.fromEntries(root.listSkins()[0].listJoints().map(j => [j.getName(), j]));
for (const a of root.listAnimations()) if (Object.values(WANT).includes(a.getName())) a.dispose();
const lib = await io.read(UAL);
for (const a of lib.getRoot().listAnimations()) {
  const role = WANT[a.getName()];
  if (!role) continue;
  const na = doc.createAnimation(role);
  for (const ch of a.listChannels()) {
    const tn = ch.getTargetNode(),
      path = ch.getTargetPath(),
      b = tn && bone[tn.getName()];
    if (!b || path === 'scale') continue;
    if (path === 'translation' && !/^(root|pelvis)$/.test(tn.getName())) continue;
    const s = ch.getSampler();
    const inp = doc.createAccessor().setType('SCALAR').setArray(s.getInput().getArray().slice()).setBuffer(buf);
    const out = doc.createAccessor().setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice()).setBuffer(buf);
    const ns = doc.createAnimationSampler().setInput(inp).setOutput(out).setInterpolation(s.getInterpolation());
    na.addSampler(ns).addChannel(doc.createAnimationChannel().setTargetNode(b).setTargetPath(path).setSampler(ns));
  }
}
await io.write(FILE, doc);
console.log('clips:', root.listAnimations().map(a => a.getName()).join(','));
