'use strict';
/* Developer mode: unlocked on this device by the developer code typed in Settings → gift code.
   Only a salted SHA-256 fingerprint of the code is stored here, never the code itself. */
const DEV_SALT = '#ashen-dev';
const DEV_HASH = '1926f87aeb709d1d1375db8618e66a31ababfcaf85406bb48f9c6e52cde9db7a';
async function sha256hex(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
/** Returns true when the text was a developer code attempt (handled here), false for anything else. */
async function tryDevCode(txt) {
  const c = String(txt || '')
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!c.startsWith('VAMOS-')) return false;
  let ok = false;
  try {
    ok = (await sha256hex(DEV_SALT + c)) === DEV_HASH;
  } catch (e) {}
  if (!ok) {
    AU.play('deny');
    toast('الكود غير صحيح');
    return true;
  }
  S.dev = 1;
  save();
  enableDev();
  $('giftIn').value = '';
  AU.play('win');
  toast('👑 وضع المطور مفعّل');
  return true;
}
/** A small helper: give, save, refresh the wallet and say what happened. */
function devDo(msg, fn) {
  fn();
  save();
  wallet();
  checkAch();
  AU.play('select');
  toast(msg);
}
function buildDev() {
  const T = $('devTools');
  T.innerHTML = '';
  labBtn(T, '🪙 +10,000 عملة', () => devDo('+10,000 🪙', () => (S.coins += 10000)));
  labBtn(T, '✨ +10 نقاط مهارة', () => devDo('+10 نقاط مهارة', () => (S.sp += 10)));
  labBtn(T, '🦸 افتح كل الأبطال', () =>
    devDo('كل الأبطال مفتوحين', () => Object.keys(CHARS).forEach(k => (S.chars[k] = 1)))
  );
  labBtn(T, '🗡️ افتح كل الأسلحة', () =>
    devDo('كل الأسلحة مفتوحة', () => Object.keys(WEP).forEach(k => (S.weps[k] = 1)))
  );
  labBtn(T, '💪 التطويرات الدائمة كاملة', () =>
    devDo('كل التطويرات الدائمة كاملة', () => Object.keys(PERM).forEach(k => (S.perm[k] = PERM[k].max)))
  );
  labBtn(T, '🌳 شجرة المهارات كاملة', () =>
    devDo('كل عقد المهارات مفتوحة', () => TREE.forEach(br => br.nodes.forEach(n => (S.tree[n.id] = 1))))
  );
  labBtn(T, '♻️ صفّر شجرة المهارات', () =>
    devDo('الشجرة صفّرت، ونقاطك رجعت لك', () => {
      let n = 0;
      TREE.forEach(br => br.nodes.forEach(q => S.tree[q.id] && (n += q.c || 1)));
      S.tree = {};
      S.sp += n;
    })
  );
  labBtn(T, '📅 مهام اليوم جديدة', () =>
    devDo('انعطيت مهام يوم جديدة', () => {
      S.daily = null;
      if (typeof menuState === 'function') menuState();
    })
  );
  labBtn(T, '🚪 أطفئ وضع المطور', () => {
    S.dev = 0;
    save();
    toast('انطفى وضع المطور. ترجع تفعله بنفس الكود');
    setTimeout(() => location.reload(), 900);
  });
}
function enableDev() {
  LAB = true;
  $('mLab').hidden = false;
  $('labBtn').hidden = false;
  $('devBox').hidden = false;
  buildDev();
}
if (S.dev) enableDev();
