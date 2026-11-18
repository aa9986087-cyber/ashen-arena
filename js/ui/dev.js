'use strict';
/* Developer tools are unlocked for this tab with the existing code. */
const DEV_SALT = '#ashen-dev';
const DEV_HASH = '1926f87aeb709d1d1375db8618e66a31ababfcaf85406bb48f9c6e52cde9db7a';
let developerKey = '';

function devButton(parent, label, action) {
  const button = el('button', 'btn sm', label);
  button.type = 'button';
  button.onclick = action;
  parent.append(button);
  return button;
}

function lockDeveloperMode() {
  developerKey = '';
  $('devBox').hidden = true;
  $('mLab').hidden = true;
  $('devTools').replaceChildren();
  if (G?.lab) toMenu();
}

function showDeveloperTools() {
  const tools = $('devTools');
  tools.replaceChildren();
  devButton(tools, 'فتح المختبر', startLab);
  const action = (label, apply) => devButton(tools, label, () => {
    if (!developerKey) return;
    apply();
    save();
    wallet();
    AU.play('select');
  });
  action('إضافة 10,000 عملة', () => { S.coins += 10000; });
  action('إضافة 10 نقاط مهارة', () => { S.sp += 10; });
  action('فتح الأبطال', () => Object.keys(CHARS).forEach(id => { S.chars[id] = 1; }));
  action('فتح الأسلحة', () => Object.keys(WEP).forEach(id => { S.weps[id] = 1; }));
  action('إكمال التطويرات الدائمة', () => Object.keys(PERM).forEach(id => { S.perm[id] = PERM[id].max; }));
  action('فتح شجرة المهارات', () => TREE.forEach(branch => branch.nodes.forEach(node => { S.tree[node.id] = 1; })));
  devButton(tools, 'إيقاف وضع المطوّر', () => {
    lockDeveloperMode();
    toast('توقّف وضع المطوّر');
  });
  $('devBox').hidden = false;
  $('mLab').hidden = false;
}

async function tryDevCode(value) {
  const code = String(value || '').toUpperCase().replace(/\s+/g, '');
  if (!code.startsWith('VAMOS-')) return false;
  let hash = '';
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(DEV_SALT + code));
    hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  } catch {}
  if (hash !== DEV_HASH) {
    AU.play('deny');
    toast('كود المطوّر غير صحيح');
    return true;
  }
  developerKey = code;
  showDeveloperTools();
  $('giftIn').value = '';
  if (!$('settings').hidden) $('devBox').scrollIntoView({ block: 'nearest' });
  AU.play('win');
  toast('وضع المطوّر مفعّل');
  return true;
}
