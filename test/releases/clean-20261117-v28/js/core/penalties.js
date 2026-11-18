'use strict';
/* Owner-issued, one-time corrections, bound to device IDs rather than display names.
   These are local save migrations, not an anti-tamper boundary. Server guards reject old uploads. */
const PLAYER_PENALTY_ID = '2026-11-17-fair-play';
let playerPenaltyDecision = null;
let playerPenaltyReady = false;
function playerPenalty(profile) {
  return playerPenaltyDecision && playerPenaltyDecision.pid === profile.pid ? playerPenaltyDecision : null;
}
/** Fetch only this device's decision; identities and the administrative ledger stay on the server. */
async function refreshPlayerPenalty() {
  playerPenaltyReady = false;
  $('mPlay').disabled = $('mResume').disabled = true;
  playerPenaltyDecision = null;
  const pid = S.pid;
  try {
    if (!pid || !S.pkey) return null;
    const decision = await api('/rest/v1/rpc/get_player_penalty', {
      method: 'POST',
      body: JSON.stringify({ p_pid: pid, p_key: S.pkey }),
      signal: AbortSignal.timeout(4000),
    });
    if (pid !== S.pid) return null;
    if (decision && decision.id === PLAYER_PENALTY_ID)
      playerPenaltyDecision = { ...decision, pid };
    return enforcePlayerPenalty();
  } catch {
    // Offline play stays available; server guards continue rejecting uncorrected uploads.
    return null;
  } finally {
    playerPenaltyReady = true;
    $('mPlay').disabled = $('mResume').disabled = false;
  }
}
function playerPenaltyReceipt(profile) {
  return playerPenalty(profile) && profile.penalties && profile.penalties[PLAYER_PENALTY_ID]
    ? PLAYER_PENALTY_ID
    : '';
}
function applyPlayerPenalty(profile) {
  const penalty = playerPenalty(profile);
  const previous = profile.penalties && profile.penalties[PLAYER_PENALTY_ID];
  if (!penalty || (previous && Number.isInteger(previous.heroesRemoved))) return null;
  const tree = profile.tree || (profile.tree = {}),
    perm = profile.perm || (profile.perm = {}),
    stats = profile.stats || (profile.stats = {}),
    chars = profile.chars || (profile.chars = {});
  let skillsRemoved = 0,
    shopLevelsRemoved = 0,
    heroesRemoved = 0;
  if (!previous) {
    // Remove the deepest unlocked nodes first, keeping the remaining prerequisites intact.
    const nodes = TREE.flatMap((branch, branchIndex) =>
      branch.nodes.map((node, depth) => ({ id: node.id, depth, branchIndex }))
    ).sort((a, b) => b.depth - a.depth || a.branchIndex - b.branchIndex);
    for (const node of nodes) {
      if (skillsRemoved === 4) break;
      if (!tree[node.id]) continue;
      delete tree[node.id];
      skillsRemoved++;
    }
    // Purchase history isn't stored; remove four ranks from the highest shop upgrades.
    for (let i = 0; i < 4; i++) {
      const id = Object.keys(PERM)
        .filter(k => Number.isFinite(perm[k]) && perm[k] > 0)
        .sort((a, b) => perm[b] - perm[a])[0];
      if (!id) break;
      if (--perm[id] <= 0) delete perm[id];
      shopLevelsRemoved++;
    }
    profile.coins = 0;
    for (const key of ['kills', 'bosses', 'bestTime', 'maxBoss', 'abyss', 'ft', 'wb', 'wkk', 'wt', 'wft']) stats[key] = 0;
    profile.board = (profile.board || []).filter(row => row.n !== profile.name);
  }
  // The starter stays playable; withdraw the three most expensive owned heroes.
  const heroes = Object.keys(CHARS)
    .filter(id => id !== 'knight' && chars[id])
    .sort((a, b) => CHARS[b].cost - CHARS[a].cost);
  for (const id of heroes.slice(0, 3)) {
    delete chars[id];
    heroesRemoved++;
  }
  if (!chars[profile.char]) {
    chars.knight = 1;
    profile.char = 'knight';
  }
  profile.penalties = Object.assign({}, profile.penalties, {
    [PLAYER_PENALTY_ID]: {
      skillsRemoved: previous ? previous.skillsRemoved : skillsRemoved,
      shopLevelsRemoved: previous ? previous.shopLevelsRemoved : shopLevelsRemoved,
      heroesRemoved,
    },
  });
  return profile.penalties[PLAYER_PENALTY_ID];
}
function enforcePlayerPenalty() {
  const applied = applyPlayerPenalty(S);
  if (applied) {
    clearRun(); // A pre-correction checkpoint must not re-submit the deleted results.
    save();
  }
  return applied;
}
