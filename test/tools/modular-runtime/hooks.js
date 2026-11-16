'use strict';
/** Install addon routes only in the test build. No production entry or old test source is edited. */
let addonBossContinuation = null;
const addonBaseNewRun = newRun;
newRun = function () {
  if (typeof actorBossHide === 'function') actorBossHide();
  ASHEN_ADDONS.clearMelee();
  addonBossContinuation = null;
  CINE.pending = false;
  return addonBaseNewRun();
};
const addonBaseBuildPlayer = buildPlayer;
buildPlayer = function () {
  if (ASHEN_ADDONS.enabled(S.char) && typeof loadActor === 'function') loadActor(S.char);
  return addonBaseBuildPlayer();
};
const addonBasePortrait = heroPortrait;
heroPortrait = function (id) {
  const descriptor = ASHEN_ADDONS.descriptor(id);
  if (ASHEN_ADDONS.enabled(id) && descriptor?.portrait) return descriptor.portrait;
  return addonBasePortrait(id);
};
const addonBaseEnterArena = enterArena;
enterArena = function () {
  const result = addonBaseEnterArena();
  if (ASHEN_ADDONS.enabled('forest-guardian')) loadBossActor(0);
  return result;
};
const addonBaseBossIntro = bossIntroStart;
function resumeAddonBossIntro() {
  const continuation = addonBossContinuation;
  if (!continuation) return;
  const { game, boss } = continuation;
  if (G !== game || G.boss !== boss || boss.dead || G.state === 'over' || G.state === 'menu') {
    addonBossContinuation = null;
    if (G === game) CINE.pending = false;
    return;
  }
  // Pause, cards and countdown are temporary: retain readiness until the first live frame.
  if (!continuation.ready || G.state !== 'play') return;
  addonBossContinuation = null;
  CINE.pending = false;
  addonBaseBossIntro(boss); // A failed asset request uses the existing base fallback, never a frozen session.
}
bossIntroStart = function (e) {
  if (!ASHEN_ADDONS.enabled('forest-guardian') || e?.kind !== 0 || COOP.on || DUEL.on)
    return addonBaseBossIntro(e);
  if (G.state === 'lab' && typeof closeLab === 'function') closeLab();
  if (!bossIntroEligible() || CINE.on || CINE.pending) return addonBaseBossIntro(e);
  if (ACTOR_MODELS.diagnostics().guardian) return addonBaseBossIntro(e);
  const continuation = { game: G, boss: e, ready: false };
  addonBossContinuation = continuation;
  CINE.pending = true;
  bossMesh.visible = false;
  Promise.resolve(loadBossActor(0)).catch(() => []).then(() => {
    if (addonBossContinuation !== continuation) return;
    continuation.ready = true;
    resumeAddonBossIntro();
  });
  return true;
};
