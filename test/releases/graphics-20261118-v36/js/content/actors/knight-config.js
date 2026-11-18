'use strict';
(() => {
  const registry = ASHEN_ADDONS;
  if (!registry || typeof registry.define !== 'function') throw new Error('Load ASHEN_ADDONS registry before knight/config.js');
  const script = document.currentScript;
  if (!script || !script.src) throw new Error('knight config requires an external classic script');
  const file = new URL('../../../assets/models/knight/model.glb', script.src).href;
  const portrait = new URL('../../../assets/models/knight/portrait.jpg', script.src).href;
  const version = '1.0.0-c0c1701';
  const sourceRevision = 'c0c1701f7c35abc8766c0fd9bdac61417bb524d5';
  const assetSha256 = '9f367763d2d88ba24e6991fc21169eb0670d163edced41a30104feabc638e932';
  const melee = window.ASHEN_KNIGHT_MELEE;
  if (!melee) throw new Error('Load knight/melee.js before knight/config.js');
  registry.define('knight', {
    actorKey: 'knight', version, sourceRevision, file, portrait, assetSha256,
    actor: {
      file, version, assetSha256, height: 3.0, yaw: 0, locomotionYaw: -Math.PI / 2, groundOffset: 0,
      clips: {}, handBone: null,
      weapon: { position: [0, 0, 0], rotation: [Math.PI, 0, 0], scale: 1 },
    },
    hooks: {
      queueMelee: melee.queueMeleeImpact,
      updateMelee: melee.updateMeleeImpacts,
      clearMelee: melee.clearMeleeImpacts,
    },
    meleeTiming: melee.timing,
  });
})();
