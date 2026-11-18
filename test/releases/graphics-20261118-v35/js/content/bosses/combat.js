'use strict';

/* Ground silhouettes are also the damage regions. Coordinates are local to each site's facing. */
const BOSS_SPECIAL_FOOTPRINTS = {
  root: [[-.18,-.99],[.24,-.7],[.11,-.27],[.43,.18],[.15,.98],[-.17,.62],[-.09,.29],[-.42,-.14],[-.23,-.43]],
  wind: [[-.98,.24],[-.79,-.49],[-.36,-.75],[.23,-.71],[.77,-.35],[.96,.13],[.52,.52],[-.05,.63],[-.58,.39],[-.25,.08],[-.71,.12]],
  cross: [[-.21,-.98],[.21,-.98],[.21,-.21],[.98,-.21],[.98,.21],[.21,.21],[.21,.98],[-.21,.98],[-.21,.21],[-.98,.21],[-.98,-.21],[-.21,-.21]],
  fissure: [[-.17,-.95],[.23,-.54],[.12,-.17],[.31,.22],[.08,.96],[-.21,.39],[-.13,.1],[-.29,-.3]],
  shell: [[-.61,-.83],[.61,-.83],[.69,-.65],[.69,.65],[.61,.83],[-.61,.83],[-.69,.65],[-.69,-.65]],
  ice: [[-.93,-.2],[-.3,-.9],[.06,-.45],[.81,-.72],[.5,-.14],[.88,.31],[.22,.94],[-.03,.56],[-.7,.75],[-.49,.33]],
  flame: [[-.29,-.96],[.3,-.96],[.47,-.34],[.76,-.23],[.93,.57],[.53,.42],[.37,.96],[.09,.67],[-.25,.93],[-.37,.56],[-.91,.6],[-.62,-.24]],
  grave: [[-.63,-.71],[.63,-.71],[.63,.42],[.43,.72],[0,.91],[-.43,.72],[-.63,.42]],
};

function bossSpecialContains(zone, x, z) {
  const turn = zone.bossGround;
  const dx = (x - zone.x) / zone.r, dz = (z - zone.z) / zone.r;
  const side = dx * turn.cos - dz * turn.sin, front = dx * turn.sin + dz * turn.cos;
  const points = BOSS_SPECIAL_FOOTPRINTS[turn.form];
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i], [xj, zj] = points[j];
    if ((zi > front) !== (zj > front) && side < (xj - xi) * (front - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/* Each site is [sideways, forward, size, impact offset, angle offset, optional alternate shape]. */
const BOSS_SPECIALS = [
  {
    name: 'زحف الجذور', form: 'root', hint: 'اخرج عن مسار الجذور', hp: 1.12, damage: 1.08, cd: 13, wind: 1.4, clipImpact: 1.05, power: 1.15,
    pattern: [[0, 3, 2.0, 0], [0, 6.5, 2.0, .12], [0, 10, 2.1, .24], [0, 13.5, 2.2, .36],
      [-3.6, 9, 1.9, .24, -.72], [3.6, 9, 1.9, .24, .72], [-6, 11.8, 2.0, .42, -.72], [6, 11.8, 2.0, .42, .72]],
  },
  {
    name: 'طوق العاصفة', form: 'wind', hint: 'اترك مركز العاصفة أو ادخل بين الأعمدة', hp: 1.16, damage: 1.10, cd: 13, wind: 1.48, clipImpact: 1.1, power: 1.2,
    target: true,
    pattern: [[0, 0, 2.5, 0], [-4.5, 0, 2.0, .22, -Math.PI / 2], [4.5, 0, 2.0, .22, Math.PI / 2], [0, 4.5, 2.0, .22, Math.PI], [0, -4.5, 2.0, .22]],
  },
  {
    name: 'شقّ القلعة', form: 'cross', hint: 'راوغ عن نقطة الهبوط ثم ابتعد عن الشقوق', hp: 1.21, damage: 1.12, cd: 12, wind: 1.52, clipImpact: 1.15, power: 1.35,
    target: true, leap: true,
    pattern: [[0, 0, 3.5, 0, Math.PI / 4], [-3.5, -3.5, 2.0, .19, Math.PI / 4, 'fissure'],
      [3.5, -3.5, 2.0, .19, -Math.PI / 4, 'fissure'], [-3.5, 3.5, 2.0, .19, -Math.PI / 4, 'fissure'],
      [3.5, 3.5, 2.0, .19, Math.PI / 4, 'fissure']],
  },
  {
    name: 'نداء القصف', form: 'shell', hornAt: 1.05, hint: 'مرّ من الممر بين خطوط القصف', hp: 1.19, damage: 1.11, cd: 14, wind: 1.6, clipImpact: 1.25, power: 1.25,
    target: true,
    pattern: [[-4, -6, 2.35, 0], [-4, -2, 2.35, .13], [-4, 2, 2.35, .26], [-4, 6, 2.35, .39],
      [4, -6, 2.35, .39], [4, -2, 2.35, .26], [4, 2, 2.35, .13], [4, 6, 2.35, 0],
      [0, 0, 2.0, .56]],
  },
  {
    name: 'صدع الجليد', form: 'ice', hint: 'تحرّك لجانب موجة الجليد', hp: 1.18, damage: 1.10, cd: 13, wind: 1.52, clipImpact: 1.15, power: 1.24,
    pattern: [[-1.8, 4, 2.4, 0], [1.8, 4, 2.4, 0], [-3, 7.5, 2.5, .15], [3, 7.5, 2.5, .15],
      [-4.6, 11, 2.7, .3], [4.6, 11, 2.7, .3], [0, 12.5, 2.8, .43]],
  },
  {
    name: 'نفَس الجحيم', form: 'flame', hint: 'راوغ جانبًا قبل أن ينفث النار', hp: 1.23, damage: 1.14, cd: 12, wind: 1.48, clipImpact: 1.1, power: 1.29,
    pattern: [[0, 4, 2.5, 0], [-1.8, 7.5, 2.8, .11], [1.8, 7.5, 2.8, .11], [-4.6, 11, 2.9, .23],
      [0, 11, 3.0, .23], [4.6, 11, 2.9, .23], [-5.8, 15, 2.9, .35], [0, 15, 3.2, .35], [5.8, 15, 2.9, .35]],
  },
  {
    name: 'نهضة الشواهد', form: 'grave', hint: 'ابتعد عن الأرض المتشققة قبل أن تنهض الشواهد', hp: 1.25, damage: 1.15, cd: 12, wind: 1.55, clipImpact: 1.2, power: 1.3,
    target: true,
    pattern: [[0, 0, 2.8, 0], [-4.2, 2.8, 2.1, .21], [4.2, 2.8, 2.1, .21],
      [-3.0, -3.8, 2.1, .35], [3.0, -3.8, 2.1, .35], [0, 5.3, 2.2, .44]],
  },
];
if (BOSS_ULTS[6]) BOSS_ULTS[6].zone = 0x7dba9b;

function bossSpecialActive() {
  return !G.abyss && !COOP.on;
}
function strengthenPreviewBoss(e) {
  const special = BOSS_SPECIALS[e.kind];
  if (!special || !bossSpecialActive()) return;
  e.maxHp *= special.hp;
  e.hp = e.maxHp;
  e.dmg *= special.damage;
  e.bossSpecialCd = 7.5;
  e.previewCadence = true;
}
/* Busy time covers the attack's last projectile launch or impact; recovery follows it. */
const CAMPAIGN_ATTACK_TIME = [
  [1.68, .18, 0],
  [.15, 1.35, 0],
  [1.42, .15, 0],
  [1.78, .79, .18],
  [.62, 1.88, .18],
  [1.65, 1.63, 1.35],
  [1.8, 1.54, 0],
];

function campaignBossAttack(e, slot) {
  if (!e.previewCadence) return true;
  if (e.bossAttackGap > 0 || e.st !== 0) return false;
  e.bossAttackBusy = CAMPAIGN_ATTACK_TIME[e.kind][slot - 1] ?? .12;
  e.bossAttackGap = e.bossAttackBusy + 1.1;
  return true;
}

function campaignBossResting(e) {
  return e.previewCadence && e.bossAttackGap > 0 && !(e.bossAttackBusy > 0) && e.st === 0;
}

function bossSpecialPoseTime(e) {
  const { wind, clipImpact } = BOSS_SPECIALS[e.kind], t = e.bossSpecial.elapsed;
  return t < wind ? t * clipImpact / wind : clipImpact + t - wind;
}

function startBossSpecial(e, p, special) {
  const face = Math.atan2(p.x - e.x, p.z - e.z);
  const destination = clampToCircle({ x: p.x, z: p.z }, ARENA - 4);
  const center = special.target ? destination : e;
  const cast = { owner: e, face, elapsed: 0, x: e.x, z: e.z, destination,
    end: special.wind + special.pattern.at(-1)[3] + .58 };
  e.bossSpecial = cast;
  e.bossSpecialCd = special.cd;
  e.st = 4;
  e.stT = special.wind;
  e.face = face;
  const sin = Math.sin(face), cos = Math.cos(face);
  for (const [side, forward, radius, offset, turn = 0, form = special.form] of special.pattern) {
    const x = center.x + side * cos + forward * sin;
    const z = center.z - side * sin + forward * cos;
    if (x * x + z * z > (ARENA + 1) ** 2) continue;
    zone(x, z, radius, special.wind + offset, e.dmg * special.power, false, 'boss-special');
    const yaw = face + turn;
    Object.assign(G.zones.at(-1), { bossCast: cast, bossGround: { form, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw) } });
  }
  banner('⚠ ' + special.name, special.hint, special.wind + .12, true);
  if (special.hornAt === undefined) AU.play('boss');
}
/* Returns true while this boss owns its attack timeline and stops ordinary movement/attacks. */
function updateBossSpecial(e, p, dt) {
  const special = BOSS_SPECIALS[e.kind];
  if (!special || !bossSpecialActive()) return false;
  if (!e.bossSpecial) {
    e.bossAttackGap = Math.max(0, (e.bossAttackGap || 0) - dt);
    e.bossAttackBusy = Math.max(0, (e.bossAttackBusy || 0) - dt);
    e.bossSpecialCd = (e.bossSpecialCd ?? 7.5) - dt * (e.hp < e.maxHp * .5 ? 1.15 : 1);
    if (e.bossSpecialCd > 0 || e.bossAttackGap > 0 || e.st !== 0 || e.gravePhase ||
        Math.hypot(p.x - e.x, p.z - e.z) > 28) return false;
    startBossSpecial(e, p, special);
    return true;
  }
  const cast = e.bossSpecial;
  cast.elapsed += dt;
  if (special.hornAt !== undefined && !cast.hornCalled && cast.elapsed >= special.hornAt) {
    cast.hornCalled = true;
    AU.play('warhorn');
  }
  e.face = cast.face;
  e.stT = Math.max(0, special.wind - cast.elapsed);
  if (special.leap) {
    const phase = clamp((cast.elapsed - .28) / (special.wind - .28), 0, 1);
    e.st = phase > 0 && phase < 1 ? 3 : 4;
    e.x = cast.x + (cast.destination.x - cast.x) * phase;
    e.z = cast.z + (cast.destination.z - cast.z) * phase;
    e.y = 6.7 * Math.sin(Math.PI * phase);
  }
  if (cast.elapsed >= cast.end) {
    e.bossSpecial = null;
    e.st = 0;
    e.y = 0;
    e.bossAttackBusy = 0;
    e.bossAttackGap = 1.35;
  }
  return true;
}
