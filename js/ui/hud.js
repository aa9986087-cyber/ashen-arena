'use strict';
/* In-run HUD (bars, counters, cooldowns). Only touches the DOM when a value changes. */
const hud = { hp: -1, sh: -1, xp: -1, t: -1, k: -1, c: -1, l: -1, st: '' };
function drawHud() {
  const p = G.p,
    hpw = Math.round((p.hp / p.maxHp) * 100),
    hpT = Math.ceil(p.hp) + ' / ' + p.maxHp;
  if (hud.hp !== hpT) {
    hud.hp = hpT;
    $('hpbar').firstElementChild.style.width = hpw + '%';
    $('hpbar').lastElementChild.textContent = hpT;
  }
  const sh = p.shieldMax ? Math.round((p.shield / p.shieldMax) * 100) : -1;
  if (hud.sh !== sh) {
    hud.sh = sh;
    $('shbar').hidden = sh < 0;
    $('shbar').firstElementChild.style.width = Math.max(0, sh) + '%';
  }
  const xp = Math.round((G.xp / G.need) * 200);
  if (hud.xp !== xp) {
    hud.xp = xp;
    $('xpbar').firstElementChild.style.width = xp / 2 + '%';
  }
  const t = G.t | 0;
  if (hud.t !== t) {
    hud.t = t;
    $('sTime').textContent = '⏱ ' + fmtT(t);
  }
  if (hud.k !== G.kills) {
    hud.k = G.kills;
    $('sKills').textContent = '💀 ' + G.kills;
  }
  if (hud.c !== G.coins) {
    hud.c = G.coins;
    $('sCoins').textContent = '🪙 ' + G.coins;
  }
  if (hud.l !== G.lvl) {
    hud.l = G.lvl;
    $('lvl').textContent = G.lvl;
  }
  const st =
    STAGES[G.stage].n +
    (G.abyss ? '، العمق ' + (G.depth + 1) : '') +
    (G.bossOn ? '، الزعيم' : '، الموجة ' + (G.wave + 1) + ' من 6');
  if (hud.st !== st) {
    hud.st = st;
    $('stageInfo').textContent = st;
  }
  if (G.boss) $('bossbar').querySelector('i').style.width = Math.max(0, (G.boss.hp / G.boss.maxHp) * 100) + '%';
  $('bDash').querySelector('u').style.transform = 'scaleY(' + clamp(p.dashCd / p.dashMax, 0, 1) + ')';
  $('bSpec').querySelector('u').style.transform = 'scaleY(' + clamp(G.specCd / 18, 0, 1) + ')';
}
