// Prepare the chosen models for the game (run once; outputs go to assets/models/):
//  - keep only the clips the game plays, renamed to their role (walk / run / idle / attack);
//    shrink textures (colours are sampled per vertex)
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
  'hero-knight.glb': { src: 'hero/kk_Knight.glb', clips: { idle: 'Idle', run: 'Running_A', attack: '1H_Melee_Attack_Slice_Diagonal' }, drop: /^(1H_Sword|1H_Sword_Offhand|2H_Sword|Rectangle_Shield|Round_Shield|Spike_Shield)$/ },
  // other heroes: their own weapons are removed because the game draws each hero's current weapon
  'hero-berserker.glb': { src: 'hero/kk_Barbarian.glb', clips: { idle: 'Idle', run: 'Running_A', attack: '2H_Melee_Attack_Chop' }, drop: /^(1H_Axe|1H_Axe_Offhand|2H_Axe|Mug|Barbarian_Round_Shield)$/ },
  'hero-mage.glb': { src: 'hero/kk_Mage.glb', clips: { idle: 'Idle', run: 'Running_A', attack: 'Spellcast_Shoot' }, drop: /^(Spellbook|Spellbook_open|1H_Wand|2H_Staff)$/ },
  'hero-ranger.glb': { src: 'hero/kk_Rogue.glb', clips: { idle: 'Idle', run: 'Running_A', attack: '2H_Ranged_Shoot' }, drop: /^(Knife|Knife_Offhand|1H_Crossbow|2H_Crossbow|Throwable)$/ },
  'hero-assassin.glb': { src: 'hero/kk_Rogue_Hooded.glb', clips: { idle: 'Idle', run: 'Running_A', attack: '1H_Ranged_Shoot' }, drop: /^(Knife|Knife_Offhand|1H_Crossbow|2H_Crossbow|Throwable)$/ },
  'boss-flame.glb': { src: 'um_Flying/Dragon_Evolved.gltf', clips: { walk: 'Fast_Flying', attack: 'Punch' } },
  'boss-frost.glb': { src: 'um_Big/Yeti.gltf', clips: { walk: 'Walk', attack: 'Punch' } },
  'boss-forest.glb': { src: 'um_Big/Orc_Skull.gltf', clips: { walk: 'Walk', attack: 'Punch' } },
  'boss-knight.glb': { src: 'um_Big/Demon.gltf', clips: { walk: 'Walk', attack: 'Punch' } },
  'grunt.glb': { src: 'mon/kk_Skeleton_Minion.glb', clips: { walk: 'Walking_D_Skeletons' }, attach: [['Skeleton_Axe', 'handslot.r']] },
  'shield.glb': { src: 'mon/kk_Skeleton_Warrior.glb', clips: { walk: 'Walking_D_Skeletons' }, attach: [['Skeleton_Blade', 'handslot.r'], ['Skeleton_Shield_Large_A', 'handslot.l']] },
  'archer.glb': { src: 'mon/kk_Skeleton_Rogue.glb', clips: { walk: 'Walking_A' }, attach: [['Skeleton_Crossbow', 'handslot.r']] },
  'mage.glb': { src: 'mon/kk_Skeleton_Mage.glb', clips: { walk: 'Walking_A' }, attach: [['Skeleton_Staff', 'handslot.r']] },
  'wolf.glb': { src: 'mon/q_Wolf.glb', clips: { walk: 'AnimalArmature|Walk' } },
  'fast.glb': { src: 'mon/q_Spider.glb', clips: { walk: 'SpiderArmature|Spider_Walk' } },
  'runner.glb': { src: 'mon/q_Snake_angry.glb', clips: { walk: 'SnakeArmature|Snake_Walk' } },
  'bomber.glb': { src: 'um_Flying/Demon.gltf', clips: { walk: 'Flying_Idle' } },
  'shaman.glb': { src: 'um_Flying/Alpaking_Evolved.gltf', clips: { walk: 'Fast_Flying' } },
};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const [out, job] of Object.entries(jobs)) {
  const doc = await io.read(C + '/' + job.src), root = doc.getRoot();
  const roleOf = Object.fromEntries(Object.entries(job.clips || {}).map(([role, name]) => [name, role]));
  for (const a of root.listAnimations()) {
    if (roleOf[a.getName()]) { a.setName(roleOf[a.getName()]); continue; }
    for (const s of a.listSamplers()) s.dispose();
    for (const c of a.listChannels()) c.dispose();
    a.dispose();
  }
  const kept = root.listAnimations().map(a => a.getName());
  for (const role in job.clips || {}) if (!kept.includes(role)) throw new Error(out + ': clip not found: ' + job.clips[role]);
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
