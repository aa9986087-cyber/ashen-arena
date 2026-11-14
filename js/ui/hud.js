'use strict';
/* In-run HUD (bars, counters, cooldowns). Only touches the DOM when a value changes. */
const hud = { hp: -1, sh: -1, xp: -1, t: -1, k: -1, c: -1, l: -1, st: '' };
function drawHud() {
  const p = G.p,
    hpw = Math.round((p.hp / p.maxHp) * 100),
    hpT = Math.ceil(p.hp) + ' / ' + p.maxHp;
  if (hud.hp !== hpT) {
    hud.hp = hpT;
    $('hpbar').querySelector('i').style.width = hpw + '%';
    $('hpbar').querySelector('em').style.width = hpw + '%';
    $('hpbar').querySelector('b').textContent = hpT;
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
    if (hud.c >= 0 && G.coins > hud.c) pop($('sCoins'));
    hud.c = G.coins;
    $('sCoins').textContent = '🪙 ' + G.coins;
  }
  if (hud.l !== G.lvl) {
    if (hud.l > 0 && G.lvl > hud.l) {
      pop($('lvl'));
      pop($('xpbar'), 'xpf');
    }
    hud.l = G.lvl;
    $('lvl').textContent = G.lvl;
  }
  // the stage line, and a small countdown of the enemies left before its boss
  const Q = stageQuota(),
    left = Math.max(0, Q.total - (G.sk || 0)),
    st =
      STAGES[G.stage].n +
      (G.abyss ? '، العمق ' + (G.depth + 1) : '') +
      (G.bossOn ? '' : '، الموجة ' + (G.wave + 1) + ' من 6');
  if (hud.st !== st) {
    hud.st = st;
    $('siName').textContent = st;
  }
  const cnt = G.bossOn ? 'boss' : G.bossDone ? 'done' : left;
  if (hud.left !== cnt) {
    const was = hud.left;
    hud.left = cnt;
    const b = $('siLeft');
    b.textContent = cnt === 'boss' ? '👑 الزعيم' : cnt === 'done' ? '✓' : '💀 ' + left;
    b.className = cnt === 'boss' ? 'boss' : '';
    b.style.setProperty('--left', (typeof cnt === 'number' ? (left / Q.total) * 100 : 0) + '%');
    if (typeof was === 'number' && typeof cnt === 'number' && cnt < was && cnt <= 10) pop(b);
  }
  if (G.boss) {
    const bw = Math.max(0, Math.round((G.boss.hp / G.boss.maxHp) * 400) / 4); // only restyle when it moves a quarter percent
    if (hud.bw !== bw) {
      hud.bw = bw;
      $('bossbar').querySelector('i').style.width = bw + '%';
    }
  }
  cooldown($('bDash'), p.dashCd / p.dashMax);
  cooldown($('bSpec'), G.specCd / specCdMax());
  cooldown($('bPot'), G.potCd / POT_CD);
}
/** Show a button's cooldown (1 = just used, 0 = ready) and flash it when it comes back. */
function cooldown(btn, k) {
  k = clamp(k, 0, 1);
  const was = +btn.dataset.cd || 0;
  if (Math.abs(was - k) < 0.01 && !(k === 0 && was > 0)) return;
  btn.style.setProperty('--cd', k);
  btn.dataset.cd = k;
  if (k === 0 && was > 0) pop(btn, 'ready');
}
