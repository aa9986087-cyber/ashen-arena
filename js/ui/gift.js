'use strict';
/* Gift codes: GF1 codes add coins to the player's wallet, once per code per device. */
const GIFT_SALT = '#vamos-gift';
const GIFT_MAX = 100000;
/** Create a gift code worth `amount` coins. `id` must be unique per gift (it is what makes a code one-time). */
function mkGift(amount, id) {
  return packCode('GF1', [amount | 0, id || Date.now().toString(36)], GIFT_SALT);
}
function redeemGift(txt) {
  const f = unpackCode('GF1', txt, 2, GIFT_SALT),
    amount = f ? +f[0] : 0,
    id = f && f[1];
  if (!f || !(amount > 0 && amount <= GIFT_MAX) || !id) {
    AU.play('deny');
    toast('كود الهدية غير صحيح. الصقه كامل كما وصلك');
    return;
  }
  if (S.gifts[id]) {
    AU.play('deny');
    toast('هذا الكود مستخدم من قبل');
    return;
  }
  S.gifts[id] = 1;
  S.coins += amount;
  save();
  wallet();
  checkAch();
  AU.play('win');
  toast('🎁 وصلتك هدية: +' + amount + ' 🪙');
  $('giftIn').value = '';
}
$('giftOk').onclick = async () => {
  const v = $('giftIn').value;
  if (!(await tryDevCode(v))) redeemGift(v);
};
$('giftIn').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('giftOk').click();
});
