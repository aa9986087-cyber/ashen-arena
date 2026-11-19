'use strict';

/* Keyed by boss kind so the roster follows its arena even if stage order changes. */
const STAGE_BESTIARY = {
  0: {
    models: ['forest-fungus', 'forest-stinger', 'forest-warden'],
    affinity: { fast: 1.4, wolf: 1.5, runner: 1.25, shield: .65 },
  },
  1: {
    models: ['desert-cactus', 'desert-raider', 'desert-golem'],
    affinity: { runner: 1.5, archer: 1.35, brute: 1.2, wolf: .55 },
  },
  4: {
    models: ['frost-yeti', 'frost-spirit', 'frost-golem'],
    affinity: { golem: 1.5, shield: 1.3, mage: 1.35, fast: .65 },
  },
  2: {
    models: ['castle-guard', 'castle-sorcerer', 'castle-knight'],
    affinity: { shield: 1.5, brute: 1.35, mage: 1.25, wolf: .55 },
  },
  3: {
    models: ['iron-scout', 'iron-gunner', 'iron-sentinel'],
    affinity: { archer: 1.5, shield: 1.3, bomber: 1.3, shaman: .6 },
  },
  5: {
    models: ['lava-demon', 'lava-drake', 'lava-beast'],
    affinity: { bomber: 1.5, mage: 1.35, golem: 1.25, shield: .7 },
  },
  6: {
    models: ['grave-skeleton', 'grave-ghost', 'grave-skull'],
    affinity: { shaman: 1.5, mage: 1.4, runner: 1.2, bomber: .65 },
  },
  abyss: {
    models: ['abyss-stalker', 'abyss-seer', 'abyss-horror'],
    affinity: { golem: 1.35, wolf: 1.25, runner: 1.25, shield: .65 },
  },
};
const BESTIARY_ROLE = {
  grunt: 0, fast: 0, wolf: 0, bomber: 0, runner: 0,
  archer: 1, mage: 1, shaman: 1,
  shield: 2, brute: 2, golem: 2,
};
const BESTIARY_HEIGHT = [1.8, 2.15, 2.45];
const BESTIARY_ASSETS = new URL('./models/', document.currentScript.src);
const bestiaryLoader = new THREE.GLTFLoader();
let activeBestiary = null;

function bestiaryFor(stage) {
  const arena = STAGES[stage];
  return STAGE_BESTIARY[arena.abyss ? 'abyss' : arena.bk];
}

function bestiaryWeight(type) {
  return bestiaryFor(G.stage).affinity[type] ?? 1;
}

function disposeBestiarySource(root) {
  const resources = new Set();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    resources.add(mesh.geometry);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  for (const resource of resources) resource.dispose();
}

function bakeBestiaryModel(file, role) {
  return bestiaryLoader.loadAsync(new URL(file + '.glb', BESTIARY_ASSETS).href).then(model => {
    try {
      return bakeModel(model.scene, model.animations, BESTIARY_HEIGHT[role], true, 1.08);
    } finally {
      disposeBestiarySource(model.scene);
    }
  });
}

function disposeBestiaryBatches(bestiary) {
  for (const look of bestiary?.looks || []) {
    if (!look) continue;
    for (const batch of [...look.walk, ...look.attack]) {
      scene.remove(batch.mesh);
      batch.mesh.dispose();
      batch.mesh.geometry.dispose();
    }
  }
}

function prepareBestiary(stage) {
  const roster = bestiaryFor(stage);
  if (activeBestiary?.roster === roster) return activeBestiary.ready;
  disposeBestiaryBatches(activeBestiary);
  const bestiary = { roster, looks: [] };
  activeBestiary = bestiary;
  bestiary.ready = Promise.allSettled(roster.models.map(bakeBestiaryModel)).then(models => {
    bestiary.looks = models.map((result, role) => {
      if (result.status === 'rejected') {
        console.warn('Monster model:', roster.models[role], result.reason);
        return null;
      }
      if (!result.value) return null;
      const { base, clips } = result.value;
      const walk = clips.walk || [base];
      const attack = clips.attack || [];
      if (activeBestiary !== bestiary) {
        for (const geo of new Set([...walk, ...attack])) geo.dispose();
        return null;
      }
      return {
        walk: walk.map(geo => inst(geo, lamV, 240, true)),
        attack: attack.map(geo => inst(geo, lamV, 80, true)),
      };
    });
  });
  return bestiary.ready;
}

function bestiaryLook(type) {
  return activeBestiary?.looks[BESTIARY_ROLE[type]];
}

function flushBestiary() {
  for (const look of activeBestiary?.looks || []) {
    if (!look) continue;
    look.walk.forEach(flush);
    look.attack.forEach(flush);
  }
}

function showBestiaryStage(stage) {
  AU.init();
  newRun();
  G.stage = stage;
  G.abyss = !!STAGES[stage].abyss;
  G.state = 'play';
  G.lab = true;
  G.god = true;
  G.noWaves = true;
  enterArena();
  // Same combat types as the campaign, placed up front so all three designs are easy to inspect.
  const samples = [['grunt', -5, 0], ['fast', -4, 5], ['archer', 5, -3], ['mage', 4, 5], ['brute', 1, -5]];
  for (const [type, x, z] of samples) spawn(type, x, z, false);
  banner(STAGES[stage].n, 'استعراض وحوش المرحلة', 2.5);
}

document.addEventListener('DOMContentLoaded', () => {
  const picker = $('bestiaryStage');
  STAGES.forEach((stage, index) => picker.add(new Option(stage.n, index)));
  picker.addEventListener('change', () => {
    if (picker.value === '') return;
    const stage = Number(picker.value);
    picker.value = '';
    showBestiaryStage(stage);
  });
});
