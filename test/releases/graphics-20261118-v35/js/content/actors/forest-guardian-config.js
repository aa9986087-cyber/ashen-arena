'use strict';
(() => {
  const registry = ASHEN_ADDONS;
  if (!registry || typeof registry.define !== 'function') throw new Error('Load ASHEN_ADDONS registry before forest-guardian/config.js');
  const script = document.currentScript;
  if (!script || !script.src) throw new Error('guardian config requires an external classic script');
  const file = new URL('../../../assets/models/forest-guardian/ancient-tree.glb', script.src).href;
  const version = 'ancient-1';
  const sourceRevision = 'sketchfab:a5dbf31a53f34fc6952b6c9b38341151';
  const assetSha256 = '50de25741f45dcbde98867354dbc0d2757b5a684aac9983ed5490df45599bd89';
  registry.define('forest-guardian', {
    actorKey: 'guardian', version, sourceRevision, file, assetSha256,
    actor: {
      file, version, assetSha256, height: null, yaw: 0, locomotionYaw: 0, groundOffset: 0,
      clips: { special: 'rootSlam' },
    },
    bossKind: 0,
  });
})();
