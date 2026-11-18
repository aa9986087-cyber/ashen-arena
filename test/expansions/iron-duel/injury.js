'use strict';

const FORGE_WOUNDS = 8;
const FORGE_ANATOMY = ['head','body','armR','armL','legR','legL'];
const FORGE_ANATOMY_LABEL = { head:'إصابة الرأس', body:'إصابة الجذع', armR:'إصابة ذراع السلاح',
  armL:'إصابة الذراع اليسرى', legR:'إصابة الساق اليمنى', legL:'إصابة الساق اليسرى' };
const FORGE_WOUND_BONES = ['Head','spine_02','pelvis','upperarm_r','lowerarm_r','upperarm_l','lowerarm_l',
  'thigh_r','calf_r','thigh_l','calf_l'];
const forgeSurfaceQ = new THREE.Quaternion();
const forgeSurfaceP = new THREE.Vector3(), forgeSurfaceN = new THREE.Vector3(), forgeSurfaceT = new THREE.Vector3();

function forgeInjurySet(f) {
  return f.forgeInjuries || (f.forgeInjuries = []);
}

function forgeInjuryMaterial(f, m) {
  if (!m.isMeshStandardMaterial || m.userData.forgeInjury) return;
  if (!f.forgeWoundUniforms) {
    f.forgeWoundUniforms = {
      forgeCount: {value: 0},
      forgeSites: {value: Array.from({length: FORGE_WOUNDS}, () => new THREE.Vector4())},
      forgeNormals: {value: Array.from({length: FORGE_WOUNDS}, () => new THREE.Vector4())},
      forgeTangents: {value: Array.from({length: FORGE_WOUNDS}, () => new THREE.Vector3())},
    };
  }
  m.userData.forgeInjury = true;
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, f.forgeWoundUniforms);
    shader.vertexShader = 'varying vec3 vForgeWorld;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      'vForgeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
    shader.fragmentShader = `
      varying vec3 vForgeWorld;
      uniform int forgeCount;
      uniform vec4 forgeSites[${FORGE_WOUNDS}];
      uniform vec4 forgeNormals[${FORGE_WOUNDS}];
      uniform vec3 forgeTangents[${FORGE_WOUNDS}];
    ` + shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float wet = 0.0;
      for (int i = 0; i < ${FORGE_WOUNDS}; i++) {
        if (i >= forgeCount) break;
        vec3 delta = vForgeWorld - forgeSites[i].xyz;
        vec3 direction = forgeNormals[i].xyz;
        float depth = dot(delta, direction);
        float radius = forgeSites[i].w;
        if (abs(depth) > 0.145 || dot(delta, delta) > (radius + 0.16) * (radius + 0.16)) continue;
        float x = dot(delta, forgeTangents[i]) / radius;
        float y = dot(delta, cross(direction, forgeTangents[i])) / radius;
        float feather = sin(x * 57.0 + sin(y * 35.0) * 2.0) * sin(y * 41.0);
        float mode = forgeNormals[i].w;
        if (mode < 0.4) {
          float bruise = 1.0 - smoothstep(0.29, 0.93, length(vec2(x, y * 1.4)) + feather * 0.15);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.105, 0.016, 0.041), bruise * 0.83);
        } else {
          float edge = abs(y + sin(x * 8.0) * 0.034) + 0.028 * feather;
          float endFade = 1.0 - smoothstep(0.55, 1.05, abs(x));
          float cut = (1.0 - smoothstep(0.035, 0.12, edge)) * endFade;
          float smear = (1.0 - smoothstep(0.13, mode > 0.8 ? 0.55 : 0.40, edge + abs(x) * 0.15)) * endFade;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.266, 0.010, 0.016), smear * 0.91);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.072, 0.0025, 0.006), cut * 0.96);
          wet = max(wet, smear);
        }
      }
    `).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.34, wet * 0.72);');
  };
  m.needsUpdate = true;
}

function forgeUpdateWounds(f) {
  const uniforms = f.forgeWoundUniforms;
  if (!uniforms || !f.forgeInjuries) return;
  const list = f.forgeInjuries;
  const strong = S.forgeBlood !== 'light';
  uniforms.forgeCount.value = strong ? list.length : 0;
  if (!strong) return;
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    w.bone.getWorldQuaternion(forgeSurfaceQ);
    w.bone.localToWorld(forgeSurfaceP.copy(w.p));
    forgeSurfaceN.copy(w.n).applyQuaternion(forgeSurfaceQ);
    forgeSurfaceT.copy(w.t).applyQuaternion(forgeSurfaceQ);
    uniforms.forgeSites.value[i].set(forgeSurfaceP.x, forgeSurfaceP.y, forgeSurfaceP.z, w.radius);
    uniforms.forgeNormals.value[i].set(forgeSurfaceN.x, forgeSurfaceN.y, forgeSurfaceN.z, w.mode);
    uniforms.forgeTangents.value[i].copy(forgeSurfaceT);
  }
}

function forgeImpact(f, zone, push, amount) {
  const injuries = f.forgeDamage || (f.forgeDamage = {});
  injuries[zone] = Math.min(1, (injuries[zone] || 0) + amount * .48);
  f.forgeImpact = { zone, force: push.clone().multiplyScalar(amount), amount, age: 0 };
  f.forgeFallDirection = push.clone();
  f.forgeLastZone = zone;
}
function forgePenalty(f, name) {
  return f.forgeDamage?.[name] || 0;
}

function forgeWound(f, attacker, kind) {
  const hit = f.forgeContact;
  if (!hit?.pos || !hit.bone) return;
  const heavy = kind === 'heavy';
  const weapon = attacker.wp;
  const solid = weapon.cut > 0 && kind !== 'kick';
  const severity = clamp(hit.power * (heavy ? .98 : .56), .18, 1.2);
  const push = hit.dir.clone().multiplyScalar(.53).addScaledVector(hit.normal, -.80).setY(0);
  if (push.lengthSq() < .001) push.set(Math.sin(attacker.face), 0, Math.cos(attacker.face));
  forgeImpact(f, hit.zone, push.normalize(), severity);
  if (!GORE.scene || kind === 'kick' || kind === 'chip') return;

  const strong = S.forgeBlood !== 'light';
  const spray = hit.dir.clone().multiplyScalar(.68).addScaledVector(hit.normal, .50).normalize();
  if (solid) {
    goreSpray(hit.pos, spray, Math.round(strong ? (38 + 42 * severity) * weapon.blood : 8),
      3.4 + 2 * severity, .37);
    if (strong && heavy) goreStain(hit.pos.x, hit.pos.z, .25 + severity * .18, false);
    attacker.blood = Math.min(1, (attacker.blood || 0) + .13 + severity * .22);
    goreBlade(attacker);
  }
  const inverse = hit.bone.getWorldQuaternion(new THREE.Quaternion()).invert();
  const normal = hit.normal.clone();
  const tangent = hit.dir.clone().addScaledVector(normal, -hit.dir.dot(normal));
  if (tangent.lengthSq() < 1e-4) {
    tangent.crossVectors(normal, Math.abs(normal.y) < .8 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0));
  }
  const record = {
    id: f.forgeWoundSerial = (f.forgeWoundSerial || 0) + 1, zone: hit.zone, bone: hit.bone,
    p: hit.bone.worldToLocal(hit.pos.clone()), n: normal.applyQuaternion(inverse),
    t: tangent.normalize().applyQuaternion(inverse),
    radius: solid ? .086 + severity * (weapon.thrust ? .055 : .15) : .07 + severity * .12,
    mode: solid ? (heavy ? 1 : .65) : .25, strength: severity,
  };
  forgeRecordWound(f, record, strong && solid);
}

function forgeRecordWound(f, record, bleeding) {
  const list = forgeInjurySet(f);
  list.push(record);
  if (list.length > FORGE_WOUNDS) list.shift();
  if (bleeding && GORE.scene && GORE.jets.length < 16) {
    GORE.jets.push({f, bone: record.bone, point: record.p, normal: record.n,
      t: 0, dur: 3.6 + record.strength * 3.6, rate: 14 + record.strength * 17,
      drip: 1, acc: 0});
  }
  forgeUpdateWounds(f);
}

function forgeClearInjuries(f) {
  if (f.forgeInjuries) f.forgeInjuries.length = 0;
  if (f.forgeWoundUniforms) f.forgeWoundUniforms.forgeCount.value = 0;
  f.forgeImpact = f.forgeFall = f.forgeFallDirection = f.forgeLastZone = null;
  f.forgeWoundSerial = f.forgeRemoteWound = 0;
  f.forgeDamage = null;
  for (let i = GORE.jets.length - 1; i >= 0; i--) {
    if (GORE.jets[i].f === f && GORE.jets[i].point) GORE.jets.splice(i, 1);
  }
}

function forgeReact(f, dt) {
  const hit = f.forgeImpact;
  if (!hit || f.act === 'dead') return;
  hit.age += dt;
  if (hit.age > .86) {
    f.forgeImpact = null;
    return;
  }
  const strength = Math.sin(15 * hit.age) * Math.exp(-5 * hit.age) * hit.amount;
  const side = hit.force.x * Math.cos(f.face) - hit.force.z * Math.sin(f.face);
  const front = hit.force.x * Math.sin(f.face) + hit.force.z * Math.cos(f.face);
  const bend = (name, x, y, z) => {
    const bone = goreBone(f, name);
    if (bone) bone.quaternion.multiply(forgeSurfaceQ.setFromEuler(new THREE.Euler(x, y, z)));
  };
  bend('spine_01', strength * front * .47, strength * side * -.40, strength * side * -.38);
  if (hit.zone === 'head') bend('Head', strength * front * .67, 0, strength * side * -.52);
  if (hit.zone.startsWith('leg')) {
    const suffix = hit.zone === 'legR' ? '_r' : '_l';
    bend('thigh' + suffix, -.66 * strength, 0, side * strength * .33);
    bend('calf' + suffix, strength * .94, 0, 0);
    f.root.position.y -= Math.max(0, strength * .24);
  }
  if (hit.zone.startsWith('arm')) {
    const suffix = hit.zone === 'armR' ? '_r' : '_l';
    bend('upperarm' + suffix, front * strength * .70, 0, strength * -.62);
    bend('lowerarm' + suffix, -.62 * strength, 0, 0);
  }
}

function forgeFall(f, from) {
  if (f.act === 'dead' && f.forgeFall) return;
  const fallback = new THREE.Vector3(f.x - (from?.x ?? f.x - Math.sin(f.face)), 0, f.z - (from?.z ?? f.z - Math.cos(f.face)));
  const direction = f.forgeFallDirection || fallback.normalize();
  if (direction.lengthSq() < .01) direction.set(Math.sin(f.face), 0, Math.cos(f.face));
  f.forgeFall = {
    tilt: .06, speed: .9 + (f.forgeImpact?.amount || .4) * 1.8,
    axis: new THREE.Vector3(direction.z, 0, -direction.x),
    before: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), f.face),
    bend: f.forgeLastZone?.startsWith('leg') ? .86 : .47,
    base: ['thigh_r','calf_r','thigh_l','calf_l','upperarm_r','upperarm_l','spine_02'].map(name => {
      const bone = goreBone(f, name);
      return {bone, rotation: bone?.quaternion.clone()};
    }),
  };
  f.start('dead');
  f.kx = direction.x * (1 + f.forgeFall.speed);
  f.kz = direction.z * (1 + f.forgeFall.speed);
  if (f.sword.visible && GORE.scene) {
    f.sword.updateWorldMatrix(true, false);
    const dropped = new THREE.Group();
    f.sword.matrixWorld.decompose(dropped.position, dropped.quaternion, dropped.scale);
    const mesh = f.sword.clone(true);
    const half = (f.wp.hit[1] + .095) * .5;
    const center = half - .095;
    mesh.position.set(0, -center, 0);
    mesh.quaternion.identity();
    mesh.scale.setScalar(1);
    dropped.position.add(new THREE.Vector3(0, center, 0).applyQuaternion(dropped.quaternion));
    dropped.add(mesh);
    GORE.scene.add(dropped);
    GORE.pieces.push({obj:dropped, f, weapon:true, half, r:.023, t:0, rest:0,
      vx:direction.x * .95, vy:.42, vz:direction.z * .95, wx:1.6, wy:.51, wz:2.4});
  }
  f.sword.visible = false;
  if (GORE.scene && S.forgeBlood !== 'light' && (f.forgeInjuries?.some(w => w.mode > .4) || f.cuts))
    goreStain(f.x + direction.x * .62, f.z + direction.z * .62, 1.08 + f.forgeFall.speed * .16, true, .36);
  DS.death(f);
}

function forgeFallPose(f, dt) {
  const fall = f.forgeFall;
  if (!fall || f.act !== 'dead') {
    f.root.rotation.set(0, f.face, 0);
    forgeReact(f, dt);
    return;
  }
  if (fall.tilt < 1.52) {
    fall.speed += (4.9 * Math.sin(fall.tilt) + 2.9 * Math.cos(fall.tilt)) * dt;
    fall.tilt = Math.min(1.52, fall.tilt + fall.speed * dt);
  }
  else fall.speed = 0;
  f.root.quaternion.copy(forgeSurfaceQ.setFromAxisAngle(fall.axis, fall.tilt).multiply(fall.before));
  f.root.position.y = .20 * Math.sin(fall.tilt);
  const curl = Math.sin(fall.tilt) * fall.bend;
  fall.base.forEach(({bone, rotation}, i) => {
    if (!bone) return;
    const x = [curl * -.65, curl, curl * -.44, curl * .76, -.30, -.12, .10][i];
    bone.quaternion.copy(rotation).multiply(forgeSurfaceQ.setFromEuler(new THREE.Euler(x, 0, i === 4 ? -.18 : i === 5 ? .26 : 0)));
  });
}

function forgeWoundPacket(f) {
  const w = f.forgeInjuries?.at(-1);
  if (!w) return null;
  const coordinates = v => v.toArray().map(n => Math.round(n * 1000) / 1000);
  return [w.id, FORGE_WOUND_BONES.indexOf(w.bone.name), FORGE_ANATOMY.indexOf(w.zone),
    ...coordinates(w.p), ...coordinates(w.n), ...coordinates(w.t), w.radius, w.mode, w.strength];
}

function forgeReadWound(f, packet) {
  if (!packet || packet[0] <= (f.forgeRemoteWound || 0)) return;
  const [id, b, z, px, py, pz, nx, ny, nz, tx, ty, tz, radius, mode, strength] = packet;
  const bone = goreBone(f, FORGE_WOUND_BONES[b]);
  if (!bone) return;
  f.forgeRemoteWound = id;
  const n = new THREE.Vector3(nx, ny, nz).normalize(), p = new THREE.Vector3(px, py, pz);
  const t = new THREE.Vector3(tx, ty, tz).normalize();
  const normal = n.clone().applyQuaternion(bone.getWorldQuaternion(forgeSurfaceQ));
  const solid = mode > .4 && S.forgeBlood !== 'light';
  if (GORE.scene && mode > .4)
    goreSpray(bone.localToWorld(p.clone()), normal, solid ? 24 + strength * 25 : 7, 3 + strength, .37);
  forgeImpact(f, FORGE_ANATOMY[z], normal.setY(0).normalize().negate(), strength);
  forgeRecordWound(f, {id, bone, zone: FORGE_ANATOMY[z], p, n, t, radius, mode, strength}, solid);
}
