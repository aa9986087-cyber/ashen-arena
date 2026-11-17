'use strict';
/* Instanced meshes for everything drawn in bulk. */
const EM = {};
/** Animated enemy types: one instanced mesh per walk frame (EMA[type][0] is EM[type]). Filled by loadModels(). */
const EMA = {};
/** Same for the attack clip (played while an enemy's atkT > 0). */
const EMAA = {};
/** Baked clips of loaded models by GEO key, e.g. ANIM.boss4.attack = [geometry…]. */
const ANIM = {};
for (const k in EN) EM[k] = inst(GEO[k], lamV, k === 'brute' || k === 'golem' ? 40 : k === 'grunt' ? 170 : 110, true);
const IAlly = inst(GEO.ally, lamV, 8, true),
  IBlade = inst(GEO.blade, basV, 8),
  IB = inst(white(new THREE.BoxGeometry(1, 1, 1)), basV, 420),
  IS = inst(white(new THREE.SphereGeometry(0.5, 8, 6)), basV, 520),
  IP = inst(white(new THREE.BoxGeometry(1, 1, 1)), basV, 600),
  IG = inst(white(new THREE.OctahedronGeometry(0.5)), basV, 380),
  ICoin = inst(white(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 10)), basV, 120);
