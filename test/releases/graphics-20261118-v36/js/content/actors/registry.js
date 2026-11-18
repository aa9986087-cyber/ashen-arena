'use strict';
/** Each addon owns its descriptor; this registry owns only selection and routing. */
const ASHEN_ADDONS = (() => {
  const definitions = new Map();
  const known = ['knight', 'ranger', 'forest-guardian'];
  const enabledIds = new Set(known);
  return {
    define(id, descriptor) {
      if (!known.includes(id) || definitions.has(id)) throw new Error('Invalid/duplicate addon: ' + id);
      definitions.set(id, descriptor);
    },
    enabled(id) { return enabledIds.has(id); },
    enabledIds() { return [...enabledIds]; },
    descriptor(id) { return definitions.get(id); },
    actorConfigs() {
      const configs = {};
      for (const [id, d] of definitions) if (enabledIds.has(id)) configs[d.actorKey] = d.actor;
      return configs;
    },
    queueMelee(apply) {
      const hooks = definitions.get('knight')?.hooks;
      if (enabledIds.has('knight') && S.char === 'knight' && PM.actor && PM.actor.upperActions?.attack && hooks?.queueMelee && hooks.queueMelee(apply)) return;
      apply();
    },
    updateMelee() {
      if (enabledIds.has('knight') && S.char === 'knight') definitions.get('knight')?.hooks?.updateMelee?.();
    },
    clearMelee() { if (enabledIds.has('knight')) definitions.get('knight')?.hooks?.clearMelee?.(); },
    weapon(R, id, t, ev, tc, em, s) {
      if (enabledIds.has('ranger') && R.char === 'ranger' && id === 'bow') {
        const build = definitions.get('ranger')?.hooks?.weapon;
        if (build) return build(R, id, t, ev, tc, em, s);
      }
      return false;
    },
  };
})();
