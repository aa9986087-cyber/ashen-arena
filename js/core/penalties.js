'use strict';
/* Owner-issued, one-time corrections, bound to device IDs rather than display names.
   These are local save migrations, not an anti-tamper boundary. Server guards reject old uploads. */
const PLAYER_PENALTY_ID = '2026-11-17-fair-play';
let playerPenaltyDecision = null;
let playerPenaltyReady = false;
function penaltyRevision(decision) {
  return Number.isInteger(decision?.revision) && decision.revision > 0 ? decision.revision : 1;
}
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
    const applied = enforcePlayerPenalty();
    try { await acknowledgePlayerPenalty(); } catch { /* Retry after reconnect; never repeat local deductions. */ }
    return applied;
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
  if (!penalty) return null;
  const revision = penaltyRevision(penalty), complete = previous && Number.isInteger(previous.heroesRemoved);
  if (complete && (previous.revision || 1) >= revision) return null;
  const tree = profile.tree || (profile.tree = {}),
    perm = profile.perm || (profile.perm = {}),
    stats = profile.stats || (profile.stats = {}),
    chars = profile.chars || (profile.chars = {});
  let skillsRemoved = 0,
    shopLevelsRemoved = 0,
    heroesRemoved = 0;
  if (complete) {
    // Repair the retained point balance, and only ranks repurchased above the original penalty limits.
    const reconciliation = reconcilePenaltyLimits(profile,penalty);
    const pointsCleared = penalty.reset_skill_points ? Math.max(0, Number.isFinite(profile.sp) ? profile.sp : 0) : 0;
    if (penalty.reset_skill_points) profile.sp = 0;
    const receipt = {...previous,revision,skillPointsCleared:pointsCleared,...reconciliation};
    receipt.report = penaltyReport(profile);
    profile.penalties[PLAYER_PENALTY_ID] = receipt;
    return receipt;
  }
  if (!previous) {
    // Remove the deepest unlocked nodes first, keeping the remaining prerequisites intact.
    skillsRemoved = removePenaltySkills(tree, penalty.skill_nodes ?? 4);
    // Purchase history isn't stored; remove four ranks from the highest shop upgrades.
    shopLevelsRemoved = penalty.shop_types ? 0 : removePenaltyShop(perm, penalty.shop_levels ?? 4);
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
  if (revision > 1) {
    const receipt = profile.penalties[PLAYER_PENALTY_ID];
    Object.assign(receipt,reconcilePenaltyLimits(profile,penalty));
    receipt.revision = revision;
    receipt.skillPointsCleared = penalty.reset_skill_points && Number.isFinite(profile.sp) ? Math.max(0,profile.sp) : 0;
    if (penalty.reset_skill_points) profile.sp = 0;
    receipt.report = penaltyReport(profile);
  }
  return profile.penalties[PLAYER_PENALTY_ID];
}
function reconcilePenaltyLimits(profile, penalty) {
  const treeLimit=Number.isInteger(penalty.skill_node_limit)?Math.max(0,penalty.skill_node_limit):TREE.flatMap(b=>b.nodes).length-4;
  const shopLimit=Math.max(0,Object.values(PERM).reduce((sum,p)=>sum+p.max,0)-(penalty.shop_levels||4));
  const result = {
    treeReconciled:removePenaltySkills(profile.tree,Math.min(4,Math.max(0,Object.keys(profile.tree).filter(id=>profile.tree[id]).length-treeLimit))),
    shopReconciled:penalty.shop_types ? 0 : removePenaltyShop(profile.perm,Math.min(4,Math.max(0,penaltyShopRanks(profile.perm)-shopLimit))),
  };
  if (penalty.shop_types) {
    const before=penaltyShopRanks(profile.perm);
    const ids=Object.keys(PERM).filter(id=>Number.isFinite(profile.perm[id])&&profile.perm[id]>0)
      .sort((a,b)=>profile.perm[b]-profile.perm[a]).slice(0,penalty.shop_types);
    for(const id of ids)delete profile.perm[id];
    result.shopTypesRemoved=ids;
    result.shopRanksWithdrawn=before-penaltyShopRanks(profile.perm);
  }
  return result;
}
function removePenaltySkills(tree, amount) {
  const nodes = TREE.flatMap((branch, branchIndex) => branch.nodes.map((node,depth)=>({id:node.id,depth,branchIndex})))
    .sort((a,b)=>b.depth-a.depth||a.branchIndex-b.branchIndex);
  let removed = 0;
  for (const node of nodes) { if (removed >= amount) break; if (tree[node.id]) { delete tree[node.id]; removed++; } }
  return removed;
}
function removePenaltyShop(perm, amount) {
  let removed = 0;
  for (let i=0;i<amount;i++) {
    const id=Object.keys(PERM).filter(k=>Number.isFinite(perm[k])&&perm[k]>0).sort((a,b)=>perm[b]-perm[a])[0];
    if(!id)break;
    if(--perm[id]<=0)delete perm[id];
    removed++;
  }
  return removed;
}
function penaltyShopRanks(perm) {
  return Object.keys(PERM).reduce((sum,id)=>sum+(Number.isFinite(perm[id])?Math.max(0,Math.floor(perm[id])):0),0);
}
function penaltyReport(profile) {
  return {skill_points:profile.sp,coins:profile.coins,tree_nodes:Object.keys(profile.tree).filter(id=>profile.tree[id]).length,
    shop_ranks:penaltyShopRanks(profile.perm),shop_types:Object.keys(PERM).filter(id=>profile.perm[id]>0).length,
    heroes:Object.keys(profile.chars).filter(id=>profile.chars[id]).length};
}
async function acknowledgePlayerPenalty() {
  const decision=playerPenalty(S),receipt=S.penalties?.[PLAYER_PENALTY_ID];
  if (!decision || penaltyRevision(decision)<2 || !receipt?.report || receipt.revision!==penaltyRevision(decision)) return false;
  return api('/rest/v1/rpc/ack_player_penalty',{method:'POST',body:JSON.stringify({p_pid:S.pid,p_key:S.pkey,
    p_penalty:PLAYER_PENALTY_ID,p_revision:receipt.revision,p_receipt:receipt}),signal:AbortSignal.timeout(4000)});
}
function enforcePlayerPenalty() {
  const applied = applyPlayerPenalty(S);
  if (applied) {
    clearRun(); // A pre-correction checkpoint must not re-submit the deleted results.
    save();
  }
  return applied;
}
