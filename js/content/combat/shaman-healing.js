'use strict';
/* Several healers share one recovery window per recipient, so a crowd cannot heal-lock an enemy. */
const SHAMAN_HEAL_INTERVAL = 4.5;
function healShamanAlly(healer, ally) {
  if (G.state !== 'play' || healer.dead || ally.dead || ally === healer || ally.boss) return false;
  if (ally.hp >= ally.maxHp || (ally.x - healer.x) ** 2 + (ally.z - healer.z) ** 2 >= 49) return false;
  if (ally.shamanHealAt !== undefined && G.t - ally.shamanHealAt + 1e-8 < SHAMAN_HEAL_INTERVAL) return false;
  ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * 0.3);
  ally.shamanHealAt = G.t;
  return true;
}
