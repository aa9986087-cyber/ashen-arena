'use strict';

function forgeBuildMenu() {
  const wrap = $('duelMenu').querySelector('.wrap');
  const headings = [...wrap.querySelectorAll(':scope > h4')];
  wrap.querySelector('.head h2').textContent = 'حلبة النغالة';
  const art = el('div', 'forgeArt');
  art.append(el('span', '', 'مبارزة ساحة الرماد'), el('strong', '', 'الفولاذ يحسمها'), el('p', '', 'حرّك قدمك قبل تضرب. قرّب النصل كفاية، وخل لك نَفَس للصدّ.'));
  wrap.querySelector('.head').after(art);
  const gear = el('div', 'forgeGear'), styles = el('div', 'forgeStyles'), look = el('p', 'forgeHint');
  gear.append(el('h4', 'sec', 'درع المقاتل'), styles, look);
  art.after(gear);
  const draw = () => {
    styles.replaceChildren();
    FORGE_STYLES.forEach((theme, i) => {
      const b = el('button', 'forgePick' + (forgeStyle() === i ? ' on' : ''));
      const icon = el('i', 'forgeHelm');
      icon.style.setProperty('--metal', '#' + theme.steel.toString(16).padStart(6, '0'));
      icon.style.setProperty('--trim', '#' + theme.edge.toString(16).padStart(6, '0'));
      b.append(icon, el('b', '', theme.name));
      b.onclick = () => {
        S.forgeStyle = theme.id;
        save();
        draw();
      };
      styles.append(b);
    });
    look.textContent = FORGE_STYLES[forgeStyle()].title;
  };
  draw();

  const gore = el('div', 'forgeGore');
  const gorePicker = document.createElement('select');
  gorePicker.setAttribute('aria-label', 'كثافة مؤثرات الإصابة');
  for (const [value, label] of [['full','مؤثرات كاملة'], ['light','مؤثرات خفيفة']]) {
    const option = el('option', '', label);
    option.value = value;
    gorePicker.append(option);
  }
  gorePicker.value = S.forgeBlood === 'light' ? 'light' : 'full';
  gorePicker.onchange = () => { S.forgeBlood = gorePicker.value; save(); };
  gore.append(el('span', '', 'مؤثرات الإصابة'), gorePicker);
  $('dmTrain').before(gore);
  $('dmTrain').textContent = 'ابدأ تدريب المبارزة';
  wrap.querySelector('.head + .forgeArt')?.setAttribute('aria-label', 'حلبة النغالة');
  const weaponLabel = $('dmWeapons').previousElementSibling;
  if (weaponLabel) weaponLabel.textContent = 'ترسانة الحلبة';
  $('ffaTrain').textContent = 'تدريب جماعي · ضد ثلاثة خصوم';

  const online = el('section', 'forgeOnline'), row = el('div', 'forgeRoomRow');
  const code = document.createElement('input');
  code.id = 'forgeRoom';
  code.placeholder = 'رمز الغرفة';
  code.setAttribute('aria-label', 'رمز الغرفة');
  code.autocapitalize = 'none';
  code.maxLength = 16;
  const host = el('button', 'btn go', 'افتح غرفة'), join = el('button', 'btn', 'انضم');
  const local = new URLSearchParams(location.search).has('local');
  const msg = el('p', 'note', local ? 'اختبار الاتصال بين تبويبين' : 'افتح غرفة وخذ رمزها. يكتبه خصمك في نفس نسخة التجربة.');
  const link = el('p', 'forgeInvite');
  host.id = 'forgeHost';
  join.id = 'forgeJoin';
  online.append(el('h4', 'sec', 'تبارز مع صديق'), msg, code, row, link);
  row.append(host, join);
  $('dmTrain').after(online);
  if (window.IRON_STANDALONE) {
    msg.textContent = 'نسخة التدريب للجوال. الغرف متاحة من النسخة المستضافة.';
    code.hidden = row.hidden = true;
  }

  const room = new URLSearchParams(location.search).get('room');
  if (room && /^[a-z0-9]{5,16}$/.test(room)) code.value = room;
  const open = (id, mine) => {
    if (!/^[a-z0-9]{5,16}$/.test(id) || DUEL.on || host.disabled) {
      msg.textContent = 'اكتب رمز الغرفة أول.';
      return;
    }
    host.disabled = join.disabled = true;
    const kind = local ? 'local' : 'live';
    return duelStartOnline('iron-v2-' + kind + '-' + id, mine, 'خصم المبارزة')
      .finally(() => { host.disabled = join.disabled = false; });
  };
  host.onclick = async () => {
    const key = Array.from(crypto.getRandomValues(new Uint8Array(7)), n => (n % 36).toString(36)).join('');
    code.value = key;
    link.textContent = 'رمز غرفتك · ' + key;
    try { await navigator.clipboard.writeText(key); }
    catch { /* The code stays visible when copying is unavailable. */ }
    toast('رمز الغرفة · ' + key);
    await open(key, true);
  };
  join.onclick = () => open(code.value.trim().toLowerCase(), false);
  const showInvite = () => {
    const codeText = DUEL.net?.room.split('-').pop();
    $('dForgeRoom').textContent = DUEL.phase === 'load' && codeText ? 'رمز الغرفة · ' + codeText : '';
  };
  const hud = duelHud;
  duelHud = function () {
    hud();
    showInvite();
    $('dForgeGrip').classList.toggle('tired', DUEL.me.st < DUEL.me.M.light.st);
  };
  const top = el('div', 'forgeDuelExtras');
  const invite = el('b', '', '');
  invite.id = 'dForgeRoom';
  const grip = el('small', '', 'سحب يمين أو يسار يغيّر جهة الضربة');
  grip.id = 'dForgeGrip';
  top.append(invite, grip);
  $('dTop').after(top);

  for (const node of [headings[1], headings[2], headings[3], headings[1]?.nextElementSibling,
    $('ffaCreate'), $('ffaRoom'), $('ffaStatus'), $('ffaRooms'), $('dmStatus'), $('dmList'), $('dmRec')]) {
    if (node) node.hidden = true;
  }
}

forgeBuildMenu();

const forgeAttackButton = $('dAtk');
let forgePointer = null;
forgeAttackButton.addEventListener('pointerdown', event => {
  forgePointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  if (DUEL.me) DUEL.me.forgeAim = 0;
});
forgeAttackButton.addEventListener('pointermove', event => {
  if (!DUEL.me || forgePointer?.id !== event.pointerId || DUEL.heavyFired) return;
  const delta = duelRotated() ? event.clientY - forgePointer.y : event.clientX - forgePointer.x;
  DUEL.me.forgeAim = Math.abs(delta) > 11 ? Math.sign(delta) : 0;
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  forgeAttackButton.addEventListener(type, () => { forgePointer = null; });
}
