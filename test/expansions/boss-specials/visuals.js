'use strict';

/* [time relative to impact, lift, pitch, yaw, roll]. Authored separately for each boss. */
const BOSS_SPECIAL_POSES = [
  [[-1,0,0,0,0],[-.63,0,.20,-.18,-.12],[-.12,.55,-.36,0,.04],[0,0,.37,0,0],[.24,0,.13,0,0],[.58,0,0,0,0]],
  [[-1,0,0,0,0],[-.65,.34,-.15,-.32,.16],[-.17,.95,-.27,1.5,-.18],[0,.72,-.14,TAU,0],[.22,.31,.15,TAU,.12],[.58,0,0,TAU,0]],
  [[-1,0,0,0,0],[-.68,0,.19,-.22,-.12],[-.3,0,-.31,-.35,.14],[-.10,0,-.42,-.16,.08],[0,0,.49,0,-.08],[.23,0,.18,0,0],[.58,0,0,0,0]],
  [[-1,0,0,0,0],[-.62,0,-.12,.12,-.09],[-.12,0,-.42,0,0],[0,.24,-.59,0,.16],[.16,0,-.28,0,-.08],[.39,0,.17,0,0],[.58,0,0,0,0]],
  [[-1,0,0,0,0],[-.7,0,-.08,.14,.16],[-.14,.6,-.41,0,0],[0,0,.55,0,0],[.26,0,.18,0,.08],[.58,0,0,0,0]],
  [[-1,0,0,0,0],[-.58,.3,-.19,-.12,-.14],[-.12,1.9,-.50,0,0],[0,1.36,.31,0,.04],[.27,.85,.28,0,-.08],[.58,0,0,0,0]],
  [[-1,0,0,0,0],[-.65,0,.14,-.30,-.18],[-.12,.35,-.33,-.18,.12],[0,0,.39,0,0],[.25,0,.13,0,-.12],[.58,0,0,0,0]],
];
function poseBossSpecial(model, e) {
  if (!e.bossSpecial) return;
  const spec = BOSS_SPECIALS[e.kind], track = BOSS_SPECIAL_POSES[e.kind];
  const t = Math.max(-1, (e.bossSpecial.elapsed < spec.wind)
    ? e.bossSpecial.elapsed / spec.wind - 1 : e.bossSpecial.elapsed - spec.wind);
  const right = track.findIndex(key => key[0] >= t);
  const b = track[right < 0 ? track.length - 1 : right];
  const a = track[Math.max(0, right < 0 ? track.length - 1 : right - 1)];
  const k = a === b ? 1 : (t - a[0]) / (b[0] - a[0]);
  model.position.y = (e.y || 0) + lerp(a[1], b[1], k);
  model.rotation.set(lerp(a[2], b[2], k), e.face + lerp(a[3], b[3], k), lerp(a[4], b[4], k));
}

/* These meshes use the same polygons that resolve damage. All sites reuse the game's zone pool. */
const bossWarningGeometry = Object.fromEntries(Object.entries(BOSS_SPECIAL_FOOTPRINTS).map(([key, points]) => {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  return [key, new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2)];
}));
const bossShellGeometry = new THREE.CylinderGeometry(.18, .35, 1.55, 6);
const BOSS_SHELL_FLIGHT = .31;

function drawBossWarning(mesh, zone, progress) {
  const form = zone.bossGround;
  mesh.geometry = form ? bossWarningGeometry[form.form] : discGeo;
  mesh.rotation.set(form ? 0 : -Math.PI / 2, form?.yaw || 0, 0);
  mesh.position.set(zone.x, 0.1, zone.z);
  if (form) mesh.scale.set(zone.r, 1, zone.r);
  else mesh.scale.set(zone.r, zone.r, 1);
  mesh.material.opacity = form ? .28 + .5 * progress : .18 + .4 * progress;
}

/* [side, forward, yaw, width, length] for the scorch marks.
   [side, forward, yaw, tilt, width, height, depth] for the raised pieces. */
const BOSS_IMPACT_LOOK = [
  { color: 0x81c954, detail: 0x4a771f, rise: 1.2, mesh: 'spikes',
    scars: [[-.11,-.23,-.28,.1,1.19],[.08,.28,.34,.11,.83],[-.31,.18,-.77,.08,.68]],
    pieces: [[-.09,-.28,.12,-.67,.54,2.1,.71],[.19,.12,.5,.84,.41,1.64,.43],[-.21,.38,-.81,-.83,.37,1.21,.36]] },
  { color: 0xf2ba68, detail: 0xa66c30, rise: 0, mesh: 'spikes',
    scars: [[-.38,-.23,-.44,.13,.6],[-.04,-.42,1.39,.13,.58],[.33,-.31,.92,.14,.56],[.47,.02,.08,.11,.45],[.31,.31,-.61,.11,.45]],
    pieces: [] },
  { color: 0xff4d51, detail: 0xab2637, rise: .24, mesh: 'spikes',
    scars: [[0,0,0,.09,1.98],[0,0,Math.PI/2,.09,1.98]],
    pieces: [[0,0,0,1.46,.13,3.3,.32],[0,0,Math.PI/2,1.46,.12,2.9,.24]] },
  { color: 0xffa04a, detail: 0x573c2c, rise: .29, mesh: 'rubble',
    scars: [[-.48,0,0,.15,1.45],[.48,0,0,.15,1.45],[0,-.56,Math.PI/2,.14,1.0],[0,.56,Math.PI/2,.14,1.0]],
    pieces: [[-.24,-.19,.4,-.63,.48,.81,.56],[.23,.22,-.7,.44,.49,1.1,.44]] },
  { color: 0xa9edff, detail: 0x54a7d3, rise: 1.48, mesh: 'crystals',
    scars: [[0,0,.55,.13,1.78],[-.27,-.17,-.84,.11,1.2],[.2,.25,1.4,.12,.9]],
    pieces: [[-.3,-.21,.2,.35,.71,2.4,.56],[.18,-.16,.45,-.18,.65,3.1,.61],[.05,.38,-.29,.49,.47,1.7,.43],[-.46,.21,.7,-.49,.44,1.31,.42]] },
  { color: 0xff7528, detail: 0xb5321a, rise: .52, mesh: 'spikes',
    scars: [[-.24,.06,-.35,.16,1.3],[.24,.08,.36,.17,1.3],[0,.3,0,.19,1.26]],
    pieces: [[-.37,.04,-.28,.82,.73,2.15,.66],[0,.31,0,.97,.95,2.5,.62],[.4,.13,.42,.82,.71,1.98,.64]] },
  { color: 0x9cbeaf, detail: 0x486e5c, rise: 1.6, mesh: 'headstones',
    scars: [[-.29,0,.55,.12,.89],[.3,.08,-.55,.1,.83],[0,-.37,Math.PI/2,.11,.88]],
    pieces: [[0,0,.09,-.13,1.13,2.59,.49],[-.43,.27,-.24,.31,.66,1.32,.37],[.41,.23,.51,-.28,.62,1.12,.38]] },
];
const bossHeadstoneShape = new THREE.Shape([
  [-.5,-.5],[.5,-.5],[.5,.22],[.32,.43],[0,.51],[-.32,.43],[-.5,.22],
].map(([x, y]) => new THREE.Vector2(x, y)));
const bossImpactScar = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 96);
const bossImpactMeshes = {
  spikes: new THREE.InstancedMesh(new THREE.ConeGeometry(.5, 1, 5), new THREE.MeshBasicMaterial(), 64),
  rubble: new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.6, 0), new THREE.MeshLambertMaterial(), 24),
  crystals: new THREE.InstancedMesh(new THREE.OctahedronGeometry(.65), new THREE.MeshBasicMaterial(), 40),
  headstones: new THREE.InstancedMesh(new THREE.ExtrudeGeometry(bossHeadstoneShape, {
    depth: .5, steps: 1, bevelEnabled: false,
  }).translate(0, 0, -.25), new THREE.MeshLambertMaterial(), 32),
};
const bossImpactPools = [bossImpactScar, ...Object.values(bossImpactMeshes)];
for (const mesh of bossImpactPools) {
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
}
const bossImpactMatrix = new THREE.Object3D(), bossImpactColor = new THREE.Color();

function bossSpecialImpact(z) {
  const kind = z.sty - 1, look = BOSS_IMPACT_LOOK[kind];
  const impacts = G.bossSpecialImpacts ||= [];
  if (impacts.length >= 22) impacts.shift();
  const angle = z.bossGround.yaw;
  impacts.push({ x: z.x, z: z.z, r: z.r, kind, angle, form: z.bossGround.form, started: G.t });
  bossImpactColor.setHex(look.color);
  parts(z.x, .55, z.z, 5, bossImpactColor.r, bossImpactColor.g, bossImpactColor.b, 7, .17, .6);
  if (kind === 1) {
    for (let i = 0; i < 5; i++) {
      const a = angle + TAU * i / 5;
      vfxP({ smoke: 1, x: z.x, y: .2, z: z.z, life: .76, s: .8, s1: 1.6,
        r: .88, g: .52, b: .2, a: .76, orbit: { cx: z.x, cz: z.z, ang: a, rad: z.r * .53, w: 8, rise: 3.6, grow: .8 } });
    }
  }
  if (kind === 3) vfxSmoke(z.x, .2, z.z, 4, [.28,.24,.22,.8], z.r * .48, 1.15, .9);
  if (kind === 5) vfxFlame(z.x, z.z, 2.3, 3);
  if (z.d === BOSS_SPECIALS[kind].wind) {
    AU.play(kind === 2 ? 'sword' : 'boom');
    shake(kind === 2 ? .65 : .42);
  }
}

function placeBossImpact(mesh, mark, side, front, height, yaw, tilt, width, tall, length, color) {
  if (mesh.count >= mesh.instanceMatrix.count) return;
  const sin = Math.sin(mark.angle), cos = Math.cos(mark.angle);
  const index = mesh.count++;
  bossImpactMatrix.position.set(mark.x + (side * cos + front * sin) * mark.r,
    height, mark.z + (front * cos - side * sin) * mark.r);
  bossImpactMatrix.rotation.set(tilt, yaw + mark.angle, 0, 'YXZ');
  bossImpactMatrix.scale.set(width, tall, length);
  bossImpactMatrix.updateMatrix();
  mesh.setMatrixAt(index, bossImpactMatrix.matrix);
  mesh.setColorAt(index, color);
}

function drawBossSpecialImpacts(active) {
  for (const mesh of bossImpactPools) mesh.count = 0;
  if (active && G.bossSpecialImpacts?.length) {
    G.bossSpecialImpacts = G.bossSpecialImpacts.filter(mark => G.t - mark.started < 3.1);
    for (const mark of G.bossSpecialImpacts) {
      const age = G.t - mark.started, style = BOSS_IMPACT_LOOK[mark.kind];
      const fade = 1 - clamp((age - 1.25) / 1.85, 0, 1);
      const growth = clamp(age * 13 + .12, .12, 1);
      const lift = growth * (1 - clamp((age - style.rise) / .4, 0, 1));
      const fissure = mark.form === 'fissure';
      bossImpactColor.setHex(style.detail).multiplyScalar(.65 + fade * .35);
      for (const [side, front, yaw, width, length] of fissure ? style.scars.slice(0, 1) : style.scars) {
        placeBossImpact(bossImpactScar, mark, side, front, .132, yaw, 0,
          width * mark.r * fade, .025, length * mark.r * fade, bossImpactColor);
      }
      if (lift <= 0) continue;
      bossImpactColor.setHex(style.color);
      for (const [side, front, yaw, tilt, width, height, depth] of fissure ? style.pieces.slice(0, 1) : style.pieces) {
        const vertical = height * lift;
        placeBossImpact(bossImpactMeshes[style.mesh], mark, side, front, vertical * .43,
          yaw, tilt, width * growth, vertical, depth * growth, bossImpactColor);
      }
    }
  }
  for (const mesh of bossImpactPools) {
    if (!mesh.count) continue;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
}
