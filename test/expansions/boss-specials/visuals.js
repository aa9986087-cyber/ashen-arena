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

/* Bounded instance pools for ground scars and the geometry that bursts out of them. */
const bossImpactScar = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial(), 64);
const bossImpactDebris = new THREE.InstancedMesh(new THREE.ConeGeometry(.5, 1, 5),
  new THREE.MeshBasicMaterial(), 64);
const bossImpactStone = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial(), 32);
for (const mesh of [bossImpactScar, bossImpactDebris, bossImpactStone]) {
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
}
const bossImpactMatrix = new THREE.Object3D(), bossImpactColor = new THREE.Color();
const BOSS_IMPACT_LOOK = [
  { color: 0x6cac43, detail: 0x355223, height: 2.7, width: .60, tilt: .50 }, // roots
  { color: 0xe9ae59, detail: 0xa87340, height: 1.9, width: .83, tilt: .85 }, // sand
  { color: 0xff5a4a, detail: 0x6f222b, height: 1.1, width: .19, tilt: 1.00 }, // sword
  { color: 0xffad50, detail: 0x50433a, height: 1.2, width: .52, tilt: .73 }, // shell
  { color: 0x98eaff, detail: 0x387da4, height: 3.4, width: .76, tilt: .18 }, // ice
  { color: 0xff822a, detail: 0xda4222, height: 1.85, width: .85, tilt: .98 }, // flame
  { color: 0x91ae9f, detail: 0x455449, height: 2.65, width: .89, tilt: .28 }, // gravestone
];
function bossSpecialImpact(z) {
  const kind = z.sty - 1, look = BOSS_IMPACT_LOOK[kind];
  const impacts = G.bossSpecialImpacts ||= [];
  if (impacts.length === 22) impacts.shift();
  impacts.push({ x: z.x, z: z.z, r: z.r, kind, angle: z.bossCast.face, started: G.t });
  bossImpactColor.setHex(look.color);
  parts(z.x, .55, z.z, 7, bossImpactColor.r, bossImpactColor.g, bossImpactColor.b, 7, .19, .7);
  if (z.d === BOSS_SPECIALS[kind].wind) {
    AU.play(kind === 2 ? 'sword' : 'boom');
    shake(kind === 2 ? .65 : .42);
  }
}
function placeBossImpact(mesh, x, y, z, yaw, tilt, width, height, length, color) {
  if (mesh.count >= mesh.instanceMatrix.count) return;
  const index = mesh.count++;
  bossImpactMatrix.position.set(x, y, z);
  bossImpactMatrix.rotation.set(tilt, yaw, 0, 'YXZ');
  bossImpactMatrix.scale.set(width, height, length);
  bossImpactMatrix.updateMatrix();
  mesh.setMatrixAt(index, bossImpactMatrix.matrix);
  mesh.setColorAt(index, color);
}
function drawBossSpecialImpacts(active) {
  const meshes = [bossImpactScar, bossImpactDebris, bossImpactStone];
  for (const mesh of meshes) mesh.count = 0;
  if (active && G.bossSpecialImpacts?.length) {
    G.bossSpecialImpacts = G.bossSpecialImpacts.filter(mark => G.t - mark.started < 3.1);
    for (const mark of G.bossSpecialImpacts) {
      const a = G.t - mark.started, style = BOSS_IMPACT_LOOK[mark.kind];
      const fade = 1 - clamp((a - 1.3) / 1.8, 0, 1);
      const growth = clamp(a * 10 + .05, .05, 1);
      const dwell = mark.kind === 0 || mark.kind === 4 || mark.kind === 6 ? 1.6 : .47;
      const lift = growth * (1 - clamp((a - dwell) / .42, 0, 1));
      for (let i = -1; i <= 1; i += 2) {
        const angle = mark.angle + i * .55;
        const dx = Math.sin(angle), dz = Math.cos(angle);
        bossImpactColor.setHex(style.detail).multiplyScalar(.58 + fade * .42);
        placeBossImpact(bossImpactScar, mark.x + i * dx * mark.r * .35, .13, mark.z + i * dz * mark.r * .35,
          angle, 0, (.08 + mark.r * .075) * fade, .03, mark.r * 1.28 * fade, bossImpactColor);
        if (lift <= 0) continue;
        const height = style.height * lift * (i < 0 ? 1 : .72);
        bossImpactColor.setHex(style.color);
        placeBossImpact(mark.kind === 6 || mark.kind === 3 ? bossImpactStone : bossImpactDebris,
          mark.x + i * dx * mark.r * .24, height * .39, mark.z + i * dz * mark.r * .24,
          angle, i * style.tilt, style.width * growth, height, style.width * (mark.kind === 6 ? .36 : 1), bossImpactColor);
      }
    }
  }
  for (const mesh of meshes) {
    if (!mesh.count) continue;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
}
