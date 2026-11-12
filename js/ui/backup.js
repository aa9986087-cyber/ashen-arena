'use strict';
/* Progress backup: the whole profile as one signed code (AS1-…), to move it to another device
   or keep it safe from a cleared browser. The signature stops casual edits, not a determined cheat. */
const BACKUP_SALT = '#vamos-save';
function backupCode() {
  const json = JSON.stringify(S);
  return 'AS1-' + b64(json) + '.' + sig(json + BACKUP_SALT);
}
/** Parse a backup code; returns the profile object, or null if it is not a valid code. */
function readBackup(txt) {
  const m = /AS1-([A-Za-z0-9_-]+)\.([a-z0-9]+)/.exec((txt || '').replace(/\s+/g, ''));
  if (!m) return null;
  try {
    const json = unb64(m[1]);
    if (sig(json + BACKUP_SALT) !== m[2]) return null;
    const o = JSON.parse(json);
    return o && typeof o.coins === 'number' && o.chars && typeof o.chars === 'object' ? o : null;
  } catch (e) {
    return null;
  }
}
let restoreArm = null;
$('bkCopy').onclick = () => {
  const t = backupCode(),
    box = $('bkIn');
  const shown = () => {
    box.value = t;
    box.focus();
    box.select();
  };
  try {
    navigator.clipboard.writeText(t).then(
      () => toast('نُسخ كود تقدمك، احفظه في مكان آمن'),
      () => (shown(), toast('انسخ الكود من الخانة'))
    );
  } catch (e) {
    shown();
    toast('انسخ الكود من الخانة');
  }
};
$('bkLoad').onclick = () => {
  const o = readBackup($('bkIn').value);
  if (!o) {
    AU.play('deny');
    toast('الكود غير صحيح. الصقه كامل كما نسخته');
    return;
  }
  // a second tap confirms, because this replaces the current progress
  if (restoreArm !== $('bkIn').value) {
    restoreArm = $('bkIn').value;
    $('bkLoad').textContent = 'اضغط مرة ثانية للتأكيد';
    toast('بيتبدل تقدمك الحالي بتقدم الكود: 🪙 ' + o.coins + '، ✨ ' + (o.sp || 0));
    return;
  }
  restoreArm = null;
  $('bkLoad').textContent = 'استرجع';
  const gifts = Object.assign({}, o.gifts, S.gifts);
  S = Object.assign(defSave(), o);
  S.stats = Object.assign(defSave().stats, o.stats || {});
  S.set = Object.assign(defSave().set, o.set || {});
  S.gifts = gifts; // a gift redeemed on this device stays redeemed
  save();
  $('bkIn').value = '';
  if (G.state !== 'paused') {
    newRun();
    buildPlayer();
  }
  drawSet();
  wallet();
  AU.play('win');
  toast('رجع تقدمك ✓');
};
