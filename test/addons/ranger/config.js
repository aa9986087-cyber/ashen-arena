'use strict';
(() => {
  const registry = window.ASHEN_ADDONS;
  if (!registry || typeof registry.define !== 'function') throw new Error('Load ASHEN_ADDONS registry before ranger/config.js');
  const script = document.currentScript;
  if (!script || !script.src) throw new Error('ranger config requires an external classic script');
  const file = new URL('./model.glb', script.src).href;
  const portrait = new URL('./portrait.jpg', script.src).href;
  const version = '1.0.0-c0c1701';
  const sourceRevision = 'c0c1701f7c35abc8766c0fd9bdac61417bb524d5';
  const assetSha256 = '3ec74d3dc91bff0f8a7709eace04ea89b90e1f92bfa29dc65aec565c33a9cb07';
  const bow = window.ASHEN_RANGER_BOW;
  if (!bow) throw new Error('Load ranger/bow-weapon.js before ranger/config.js');
  registry.define('ranger', {
    actorKey: 'ranger', version, sourceRevision, file, portrait, assetSha256,
    actor: {
      file, version, assetSha256, height: 2.5, yaw: 0, locomotionYaw: -Math.PI / 2, groundOffset: 0,
      clips: { idle: 'idle', run: 'run', attack: 'shoot', hurt: 'hurt', fall: 'fall' }, handBone: null,
      weapon: { position: [0, 0, 0], rotation: [Math.PI, 0, 0], scale: 1 },
      weaponBuilder: bow.buildBow,
    },
    hooks: { weapon: bow.buildBow },
  });
})();
