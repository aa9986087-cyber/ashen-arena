// Build assets/models/duelist.glb for the sword duel (run once):
//   node tools/prepare-duelist.mjs <src folder> assets/models/duelist.glb
// <src> holds the CC0 Quaternius packs: outfits/ (Modular Character Outfits - Fantasy, Standard),
// base/ (Universal Base Characters: Superhero_Male_FullBody, Hair_*), ual1.glb + ual2.glb (Universal Animation Library 1 & 2).
// Steps: merge outfit + head + hair + beard onto ONE skeleton, keep only the head of the base body,
// copy the clips the duel plays (renamed to their role), shrink textures for phones.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, mergeDocuments } from '@gltf-transform/functions';
import sharp from 'sharp';
const [SRC, OUT] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SRC + '/outfits/Male_Ranger.gltf'), root = doc.getRoot();
const scene0 = root.listScenes()[0];
const mainSkin = root.listSkins()[0];
const bone = Object.fromEntries(mainSkin.listJoints().map(j => [j.getName(), j]));
const meshParent = root.listNodes().find(n => n.getMesh() && n.getSkin())?.getParentNode?.() || null;

// --- head (from the full base body: keep triangles weighted to Head / neck), hair, beard
for (const [file, headOnly] of [['base/Superhero_Male_FullBody.gltf', true], ['base/Hair_Beard.gltf', false], ['base/Hair_SimpleParted.gltf', false]]) {
  const src = await io.read(SRC + '/' + file);
  const map = mergeDocuments(doc, src);
  for (const sk of src.getRoot().listSkins()) {
    const s = map.get(sk), joints = s.listJoints();
    if (headOnly) {
      const keep = new Set(joints.map((j, i) => (/^(Head|neck_01)$/.test(j.getName()) ? i : -1)).filter(i => i >= 0));
      for (const n of root.listNodes()) if (n.getSkin() === s && n.getMesh() && n.getName() === 'SuperHero_Male')
        for (const p of n.getMesh().listPrimitives()) {
          const J = p.getAttribute('JOINTS_0'), Wt = p.getAttribute('WEIGHTS_0'), I = p.getIndices();
          const w = v => { let t = 0; const a = J.getElement(v, []), b = Wt.getElement(v, []); for (let k = 0; k < 4; k++) if (keep.has(a[k])) t += b[k]; return t > 0.5; };
          const src = I.getArray(), out = [];
          for (let t = 0; t < src.length; t += 3) if (w(src[t]) && w(src[t + 1]) && w(src[t + 2])) out.push(src[t], src[t + 1], src[t + 2]);
          I.setArray(new Uint32Array(out));
        }
    }
    // rebind this skin to the outfit's skeleton (same bone names, same inverse binds)
    for (const j of joints) s.removeJoint(j);
    for (const j of joints) s.addJoint(bone[j.getName()]);
    s.setSkeleton(mainSkin.getSkeleton());
    for (const n of root.listNodes()) if (n.getSkin() === s && n.getMesh()) {
      for (const sc of root.listScenes()) sc.removeChild(n);
      n.getParentNode() && n.getParentNode().removeChild(n);
      (meshParent || scene0).addChild(n);
    }
  }
  for (const sc of root.listScenes()) if (sc !== scene0) sc.dispose();
}
// hair: a natural dark brown instead of the grey base texture
for (const m of root.listMaterials()) if (/hair|beard|eyebrow/i.test(m.getName())) m.setBaseColorFactor([0.32, 0.22, 0.15, 1]);

// --- animations
const CLIPS = {
  'ual1.glb': { Sword_Idle: 'idle', Walk_Loop: 'walk', Roll: 'roll', Hit_Chest: 'hit', Death01: 'death' },
  'ual2.glb': { Sword_Block: 'block', Sword_Regular_A: 'atk1', Sword_Regular_B: 'atk2', Sword_Regular_C: 'atk3', Sword_Heavy_Combo: 'heavy', Hit_Knockback: 'knock', Idle_Shield_Break: 'stagger' },
};
for (const [file, want] of Object.entries(CLIPS)) {
  const lib = await io.read(SRC + '/' + file);
  for (const a of lib.getRoot().listAnimations()) {
    const role = want[a.getName()];
    if (!role) continue;
    const na = doc.createAnimation(role);
    for (const ch of a.listChannels()) {
      const tn = ch.getTargetNode(), path = ch.getTargetPath(), b = tn && bone[tn.getName()];
      if (!b || path === 'scale') continue;
      if (path === 'translation' && !/^(root|pelvis)$/.test(tn.getName())) continue; // bone lengths are fixed
      const s = ch.getSampler();
      const inp = doc.createAccessor().setType('SCALAR').setArray(s.getInput().getArray().slice());
      const out = doc.createAccessor().setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice());
      const ns = doc.createAnimationSampler().setInput(inp).setOutput(out).setInterpolation(s.getInterpolation());
      na.addSampler(ns).addChannel(doc.createAnimationChannel().setTargetNode(b).setTargetPath(path).setSampler(ns));
    }
  }
}
// drop occlusion/roughness maps (lighting is simple in game); keep colour + normal, small for phones
for (const m of root.listMaterials()) { m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setMetallicFactor(0); m.setRoughnessFactor(0.8); }
const buf = root.listBuffers()[0];
for (const a of root.listAccessors()) a.setBuffer(buf);
for (const b of root.listBuffers()) if (b !== buf) b.dispose();
await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }));
await io.write(OUT, doc);
console.log('done', root.listAnimations().map(a => a.getName()).join(','));
