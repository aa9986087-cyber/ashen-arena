'use strict';
/* Score card: a 1080×1350 image of the finished run (hero portrait + stats) to share or save. */
/** Draw the hero as it stands in the arena, close up, into a 2D context. */
function drawHeroPortrait(x, dx, dy, size) {
  try {
    const p = G.p,
      cam = camera.clone();
    cam.aspect = 1;
    cam.updateProjectionMatrix();
    // in front of the hero, slightly to the side, framing the whole body
    const a = (PM.g ? PM.g.rotation.y : p.face) + 0.45;
    cam.position.set(p.x + Math.sin(a) * 5.2, 2.6, p.z + Math.cos(a) * 5.2);
    cam.lookAt(p.x, 1.15, p.z);
    const W0 = W,
      H0 = H;
    if (PM.g) PM.g.visible = true; // it may be mid-blink from invulnerability
    renderer.setSize(size, size, false);
    renderer.render(scene, cam);
    x.drawImage(renderer.domElement, dx, dy, size, size);
    renderer.setSize(W0, H0, false);
  } catch (e) {}
}
async function scoreCard() {
  try {
    await Promise.all([document.fonts.load('120px Lalezar'), document.fonts.load('800 40px Tajawal')]);
  } catch (e) {}
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1350;
  const x = c.getContext('2d'),
    r = lastRun,
    ch = CHARS[S.char],
    stage = STAGES[G.stage].n + (G.abyss ? ' · العمق ' + (G.depth + 1) : '');
  x.direction = 'rtl';
  x.textAlign = 'center';
  const bg = x.createRadialGradient(540, 420, 80, 540, 600, 900);
  bg.addColorStop(0, '#3a2412');
  bg.addColorStop(0.55, '#1a1426');
  bg.addColorStop(1, '#07060c');
  x.fillStyle = bg;
  x.fillRect(0, 0, 1080, 1350);
  // embers
  for (let i = 0; i < 70; i++) {
    x.fillStyle = 'rgba(255,' + ((120 + Math.random() * 80) | 0) + ',40,' + (0.15 + Math.random() * 0.5) + ')';
    x.beginPath();
    x.arc(Math.random() * 1080, Math.random() * 1350, 1.5 + Math.random() * 3, 0, TAU);
    x.fill();
  }
  // title
  const tg = x.createLinearGradient(0, 70, 0, 230);
  tg.addColorStop(0, '#fff6dc');
  tg.addColorStop(0.5, '#f6c45a');
  tg.addColorStop(1, '#c9781f');
  x.font = '150px Lalezar, Tajawal, sans-serif';
  x.fillStyle = tg;
  x.shadowColor = 'rgba(242,120,40,.6)';
  x.shadowBlur = 30;
  x.fillText('ساحة الرماد', 540, 220);
  x.shadowBlur = 0;
  // hero portrait in a gold ring
  x.save();
  x.beginPath();
  x.arc(540, 520, 210, 0, TAU);
  x.clip();
  x.fillStyle = '#24302a';
  x.fillRect(330, 310, 420, 420);
  drawHeroPortrait(x, 330, 310, 420);
  x.restore();
  x.lineWidth = 10;
  x.strokeStyle = '#f6c45a';
  x.beginPath();
  x.arc(540, 520, 210, 0, TAU);
  x.stroke();
  x.font = '800 54px Tajawal, sans-serif';
  x.fillStyle = '#fff1d6';
  x.fillText(ch.i + ' ' + ch.n + ' · ' + r.n, 540, 820);
  // the big number
  x.font = '190px Lalezar, Tajawal, sans-serif';
  x.fillStyle = '#ffd9a0';
  x.fillText(String(r.k), 540, 1010);
  x.font = '800 40px Tajawal, sans-serif';
  x.fillStyle = '#a9a48f';
  x.fillText('عدو سقط', 540, 1060);
  // stat row
  const stats = [
    ['المستوى', r.l],
    ['الوقت', fmtT(r.t)],
    ['الزعماء', r.b],
  ];
  stats.forEach((s, i) => {
    const cx = 900 - i * 360;
    x.font = '800 30px Tajawal, sans-serif';
    x.fillStyle = '#a9a48f';
    x.fillText(s[0], cx, 1150);
    x.font = '800 56px Tajawal, sans-serif';
    x.fillStyle = '#fff1d6';
    x.fillText(String(s[1]), cx, 1215);
  });
  x.font = '800 32px Tajawal, sans-serif';
  x.fillStyle = '#f6c45a';
  x.fillText('وصلت إلى: ' + stage, 540, 1280);
  x.font = '700 26px Tajawal, sans-serif';
  x.fillStyle = '#7f7a66';
  x.fillText(
    'تحداني في ' + location.host + location.pathname.replace(/index\.html$/, '') + '  ·  صنعها Vamos',
    540,
    1330
  );
  return c;
}
$('ovShot').onclick = async () => {
  if (!lastRun) return;
  const c = await scoreCard();
  c.toBlob(async b => {
    if (!b) return toast('ما قدرت أرسم الصورة');
    const f = new File([b], 'ashen-arena.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [f] }))
      try {
        await navigator.share({ files: [f], text: shareText(lastRun) });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'ashen-arena.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('نزلت صورة نتيجتك');
  }, 'image/png');
};
