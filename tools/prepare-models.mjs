// Prepare the chosen models for the game (run once; outputs go to assets/models/):
//  - drop animations (the game bakes one static pose), shrink textures (colours are sampled per vertex)
//  - remove props the game draws itself, attach weapons to the skeletons' hands
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, mergeDocuments, unpartition } from '@gltf-transform/functions';
import sharp from 'sharp';
// usage: node tools/prepare-models.mjs <folder with the downloaded source packs> assets/models
// needs: npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 sharp@0.33
const C = process.argv[2], OUT = process.argv[3];
const SK = C + '/kaykit-skeletons/Assets/gltf/'; // KayKit Skeletons weapon props
const jobs = {
  'hero-knight.glb': { src: 'hero/kk_Knight.glb', drop: /^(1H_Sword|1H_Sword_Offhand|2H_Sword|Rectangle_Shield|Round_Shield|Spike_Shield)$/ },
  'boss-flame.glb': { src: 'um_Flying/Dragon_Evolved.gltf' },
  'boss-frost.glb': { src: 'um_Big/Yeti.gltf' },
  'boss-forest.glb': { src: 'um_Big/Orc_Skull.gltf' },
  'boss-knight.glb': { src: 'um_Big/Demon.gltf' },
  'grunt.glb': { src: 'mon/kk_Skeleton_Minion.glb', attach: [['Skeleton_Axe', 'handslot.r']] },
  'shield.glb': { src: 'mon/kk_Skeleton_Warrior.glb', attach: [['Skeleton_Blade', 'handslot.r'], ['Skeleton_Shield_Large_A', 'handslot.l']] },
  'archer.glb': { src: 'mon/kk_Skeleton_Rogue.glb', attach: [['Skeleton_Crossbow', 'handslot.r']] },
  'mage.glb': { src: 'mon/kk_Skeleton_Mage.glb', attach: [['Skeleton_Staff', 'handslot.r']] },
  'wolf.glb': { src: 'mon/q_Wolf.glb' },
  'fast.glb': { src: 'mon/q_Spider.glb' },
  'runner.glb': { src: 'mon/q_Snake_angry.glb' },
  'bomber.glb': { src: 'um_Flying/Demon.gltf' },
  'shaman.glb': { src: 'um_Flying/Alpaking_Evolved.gltf' },
};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const [out, job] of Object.entries(jobs)) {
  const doc = await io.read(C + '/' + job.src), root = doc.getRoot();
  for (const a of root.listAnimations()) {
    for (const s of a.listSamplers()) s.dispose();
    for (const c of a.listChannels()) c.dispose();
    a.dispose();
  }
  if (job.drop) for (const n of root.listNodes()) if (job.drop.test(n.getName())) n.dispose();
  for (const [file, slotName] of job.attach || []) {
    const src = await io.read(SK + file + '.gltf'), kids = src.getRoot().listScenes()[0].listChildren();
    const map = mergeDocuments(doc, src), slot = root.listNodes().find(n => n.getName() === slotName);
    for (const k of kids) { const t = map.get(k); for (const s of root.listScenes()) s.removeChild(t); slot.addChild(t); }
    for (const s of root.listScenes().slice(1)) s.dispose();
  }
  for (const acc of root.listAccessors()) if (acc.listParents().every(p => p.propertyType === 'Root')) acc.dispose();
  await doc.transform(unpartition(), dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'png', resize: [256, 256] }));
  await io.write(OUT + '/' + out, doc);
}
console.log('done');
