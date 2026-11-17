'use strict';
(() => {
  const registry = window.ASHEN_ADDONS;
  if (!registry || typeof registry.define !== 'function') throw new Error('Load ASHEN_ADDONS registry before forest-guardian/config.js');
  const script = document.currentScript;
  if (!script || !script.src) throw new Error('guardian config requires an external classic script');
  const ancient = typeof location !== 'undefined' && /(?:^|[?&])forest=ancient(?:&|$)/.test(location.search);
  const file = ancient ? new URL('./ancient-tree.glb', script.src).href : new URL('./model.glb', script.src).href;
  const version = ancient ? 'ancient-1' : '1.0.0-c0c1701';
  const sourceRevision = ancient ? 'sketchfab:a5dbf31a53f34fc6952b6c9b38341151' : 'c0c1701f7c35abc8766c0fd9bdac61417bb524d5';
  const assetSha256 = ancient
    ? '50de25741f45dcbde98867354dbc0d2757b5a684aac9983ed5490df45599bd89'
    : '42f0173405d09ce24999912cb8f8103d1bb02764fcfbe3426a7c06b036808cfa';
  registry.define('forest-guardian', {
    actorKey: 'guardian', version, sourceRevision, file, assetSha256,
    actor: {
      file, version, assetSha256, height: null, yaw: 0, locomotionYaw: ancient ? 0 : -Math.PI / 2, groundOffset: 0,
      clips: ancient ? { special: 'rootSlam' } : {},
    },
    bossKind: 0,
  });
})();
