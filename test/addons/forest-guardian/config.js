'use strict';
(() => {
  const registry = window.ASHEN_ADDONS;
  if (!registry || typeof registry.define !== 'function') throw new Error('Load ASHEN_ADDONS registry before forest-guardian/config.js');
  const script = document.currentScript;
  if (!script || !script.src) throw new Error('guardian config requires an external classic script');
  const file = new URL('./model.glb', script.src).href;
  const version = '1.0.0-c0c1701';
  const sourceRevision = 'c0c1701f7c35abc8766c0fd9bdac61417bb524d5';
  const assetSha256 = '42f0173405d09ce24999912cb8f8103d1bb02764fcfbe3426a7c06b036808cfa';
  registry.define('forest-guardian', {
    actorKey: 'guardian', version, sourceRevision, file, assetSha256,
    actor: { file, version, assetSha256, height: null, yaw: 0, locomotionYaw: -Math.PI / 2, groundOffset: 0, clips: {} },
    bossKind: 0,
  });
})();
