'use strict';
/* Player profiles: each device uploads a small public card of its progress (Supabase `profiles`, updated through
   the save_profile RPC with a device key only that device knows). Tapping a player's name anywhere opens the card. */
function profileKey() {
  if (!S.pkey) {
    const a = new Uint8Array(16);
    (window.crypto || {}).getRandomValues
      ? crypto.getRandomValues(a)
      : a.forEach((_, i) => (a[i] = Math.random() * 256));
    S.pkey = [...a].map(b => b.toString(16).padStart(2, '0')).join('');
    save();
  }
  return S.pkey;
}
/** The public part of this player's progress. */
function profileStats() {
  const st = S.stats;
  return {
    lvl: st.bestLvl | 0,
    t: Math.round(st.bestTime || 0),
    b: st.bosses | 0,
    mb: st.maxBoss | 0,
    ab: st.abyss | 0,
    k: st.kills | 0,
    r: st.runs | 0,
    lg: st.legend | 0,
    ev: st.evos | 0,
    h: Object.keys(S.chars || {}).length,
    ach: Object.keys(S.ach || {}).length,
    tr: Object.keys(S.tree || {}).length,
    ch: S.char,
  };
}
let profileBusy = false;
async function profileSync() {
  if (!S.name || profileBusy || (typeof NET_LOCAL !== 'undefined' && NET_LOCAL)) return;
  profileBusy = true;
  try {
    await api('/rest/v1/rpc/save_profile', {
      method: 'POST',
      body: JSON.stringify({ p_pid: myPid(), p_key: profileKey(), p_name: S.name, p_stats: profileStats() }),
    });
  } catch (e) {}
  profileBusy = false;
}
/** How far a player got, in words. */
function profileReach(s) {
  if ((s.mb | 0) >= 6) return 'أنهى المراحل الست' + (s.ab ? '، ونزل الهاوية ' + s.ab + ' مرة' : '');
  const i = Math.min(5, s.mb | 0);
  return 'وصل المرحلة ' + (i + 1) + ': ' + STAGES[i].n;
}
/** Open the card of the player called `name` (the newest profile with that name). */
async function profileOpen(name) {
  if (!name) return;
  AU.play('select');
  const box = $('pcard');
  box.hidden = false;
  $('pcName').textContent = name;
  $('pcBody').innerHTML = '';
  $('pcBody').appendChild(el('p', 'note', '…'));
  $('pcPic').style.backgroundImage = '';
  let prof = null,
    duels = [],
    score = null;
  const mine = name === S.name;
  try {
    const q = encodeURIComponent(name);
    const [p, d, sc] = await Promise.all([
      mine
        ? null
        : api(
            '/rest/v1/profiles?select=name,stats,updated_at,avatar&name=eq.' + q + '&order=updated_at.desc&limit=1'
          ).catch(() => []),
      api('/rest/v1/duels?select=a,b,winner&or=(a.eq.' + q + ',b.eq.' + q + ')&limit=500').catch(() => []),
      api('/rest/v1/scores?select=kills,lvl,t,bosses&name=eq.' + q + '&limit=1').catch(() => []),
    ]);
    prof = mine ? { name, stats: profileStats(), updated_at: new Date().toISOString() } : p && p[0];
    duels = d || [];
    score = sc && sc[0];
  } catch (e) {}
  if (box.hidden || $('pcName').textContent !== name) return; // closed or switched meanwhile
  const B = $('pcBody');
  B.innerHTML = '';
  if (!prof && !score && !duels.length) {
    B.appendChild(el('p', 'note', 'ما عنده ملف للحين. يطلع ملفه بعد ما يلعب جولة بالتحديث الجديد.'));
    return;
  }
  const s = (prof && prof.stats) || {};
  // the player's own photo; else his hero's portrait
  const photo = mine ? S.avatar : prof && prof.avatar;
  if (photo) $('pcPic').style.backgroundImage = 'url(' + photo + ')';
  if (prof && !mine) AVA.map.set(name, { img: photo || '', ch: s.ch, t: Date.now() });
  if (mine) {
    // your card: change or remove your picture
    const row = el('div', 'pcAva');
    const up = el('button', 'btn sm go', photo ? '📷 غيّر صورتك' : '📷 حط صورتك');
    up.onclick = avatarPick;
    row.appendChild(up);
    if (photo) {
      const rm = el('button', 'btn sm', '🗑 احذفها');
      rm.onclick = async () => (await avatarSave(null)) && profileOpen(S.name);
      row.appendChild(rm);
    }
    B.appendChild(row);
  }
  if (s.ch && CHARS[s.ch]) {
    const img = photo ? '' : heroPortrait(s.ch);
    if (img) $('pcPic').style.backgroundImage = 'url(' + img + ')';
    $('pcHero').textContent = CHARS[s.ch].i + ' ' + CHARS[s.ch].n;
  } else $('pcHero').textContent = '';
  const row = (icon, label, val) => {
    const r = el('div', 'pcRow');
    r.append(el('span', '', icon + ' ' + label), el('b', '', val));
    B.appendChild(r);
  };
  if (prof) {
    B.appendChild(el('p', 'pcReach', '🗺️ ' + profileReach(s)));
    row('⭐', 'أعلى مستوى', s.lvl || 0);
    row('⏱', 'أطول جولة', fmtT(s.t || 0));
    row('👑', 'زعماء هزمهم', s.b || 0);
    row('💀', 'أعداء قتلهم', (s.k || 0).toLocaleString('en'));
    row('🎮', 'جولات لعبها', s.r || 0);
    row('🦸', 'أبطال مفتوحة', (s.h || 1) + ' / ' + Object.keys(CHARS).length);
    row('🏆', 'إنجازات', (s.ach || 0) + ' / ' + ACH.length);
  }
  if (!prof && score) {
    // no profile yet (hasn't played since profiles arrived): build the card from the leaderboard record
    B.appendChild(el('p', 'pcReach', '🗺️ ' + profileReach({ mb: score.bosses })));
    row('💀', 'أحسن جولة', score.kills + ' قتلة');
    row('⭐', 'أعلى مستوى', score.lvl);
    row('⏱', 'أطول جولة', fmtT(score.t || 0));
    row('👑', 'زعماء في جولة وحدة', score.bosses || 0);
  } else if (score) row('📊', 'رقمه في الصدارة', score.kills + ' قتلة · مستوى ' + score.lvl);
  if (duels.length) {
    const w = duels.filter(r => r.winner === name).length;
    row('⚔️', 'المبارزات', w + ' فوز · ' + (duels.length - w) + ' خسارة');
  }
  if (prof && !mine) B.appendChild(el('p', 'note pcSeen', 'آخر ظهور ' + chatAgo(prof.updated_at)));
  if (!prof)
    B.appendChild(
      el('p', 'note pcSeen', 'باقي معلوماته (الأبطال، الإنجازات، مجموع القتلات) تطلع بعد ما يلعب بالتحديث الجديد.')
    );
}
$('pcClose').onclick = () => ($('pcard').hidden = true);
$('pcard').onclick = e => {
  if (e.target.id === 'pcard') $('pcard').hidden = true;
};
/** Make an element (holding a player's name) open that player's card. */
function profileLink(elm, name) {
  elm.classList.add('pname');
  elm.onclick = e => {
    e.stopPropagation();
    profileOpen(name);
  };
  return elm;
}
setTimeout(profileSync, 4000);
