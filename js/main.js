'use strict';
/* Boot: build the initial scene, open the menu, start the music and the frame loop. */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000,
    dt = Math.min(raw, 0.05);
  last = now;
  if (DUEL.on) {
    duelFrame(dt);
    AU.music();
    perfTick(raw * 1000);
    return;
  }
  if (G.state === 'play') update(dt * (G.slow > 0 ? 0.35 : 1) * (G.slowmo ? 0.3 : 1));
  updCount(Math.min(raw, 0.25)); // real seconds, even on a slow device
  perfTick(raw * 1000);
  AU.music();
  if (!AU.ctx) CM.tick();
  render(dt, now);
}
initIntro();
setupBloom();
newRun();
setStage(0);
buildPlayer();
resize();
drawSet();
go('menu');
warmGPU();
try {
  loadModels();
} catch (e) {}
if (!S.name) askName();
if (S._mig) {
  delete S._mig;
  save();
  setTimeout(() => toast('تغيّرت أسعار المتجر، فرجعت التطويرات الدائمة للصفر. عملاتك وأبطالك محفوظة'), 1200);
}
CM.set(MUSIC_URL);
window.__game = {
  get G() {
    return G;
  },
  get S() {
    return S;
  },
  update,
  startRun,
  chooseCard,
  spawnBoss,
  special,
  dash,
};
requestAnimationFrame(frame);
