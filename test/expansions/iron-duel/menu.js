'use strict';

function forgeBuildMenu() {
  const wrap = $('duelMenu').querySelector('.wrap');
  const headings = [...wrap.querySelectorAll(':scope > h4')];
  wrap.querySelector('.head h2').textContent = 'حلبة النغالة';
  const tabs = el('nav', 'forgeNav');
  tabs.setAttribute('aria-label', 'تجهيز المبارزة');
  const loadout = el('div', 'forgeLoadout');
  const panels = [['fighter','المقاتل'], ['weapons','الأسلحة'], ['room','الأونلاين']].map(([id, label]) => {
    const tab = el('button', 'forgeTab', label);
    const panel = el('section', 'forgePanel');
    tab.id = 'forge-tab-' + id;
    tab.type = 'button';
    panel.id = 'forge-panel-' + id;
    tab.setAttribute('aria-controls', panel.id);
    tabs.append(tab);
    return { tab, panel };
  });
  const show = index => panels.forEach(({ tab, panel }, i) => {
    panel.hidden = i !== index;
    tab.setAttribute('aria-pressed', String(i === index));
  });
  panels.forEach(({ tab }, i) => { tab.onclick = () => show(i); });
  const [gear, weapons, rooms] = panels.map(item => item.panel);
  const actions = el('div', 'forgeActions');
  wrap.querySelector('.head').after(loadout, tabs, gear, weapons, rooms, actions);
  show(0);
  const stage = el('div', 'forgeStage fighterStage');
  const portrait = document.createElement('img');
  portrait.alt = '';
  portrait.src = forgeArtURL('fighter');
  const bio = el('div', 'forgeStageCopy');
  bio.append(el('h3', '', 'مقاتل الحلبة'));
  stage.append(portrait, bio);
  const selection = el('div', 'forgeWardrobe');
  gear.append(stage, selection);
  weapons.append($('dmWeapons'));
  headings[0].hidden = true;
  actions.append($('dmTrain'), $('ffaTrain'));
  forgeRefreshLoadout();

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
  selection.append(gore);
  $('dmTrain').textContent = 'ابدأ مبارزة تدريبية';
  $('ffaTrain').textContent = 'تدريب ضد ٣ خصوم';

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
  rooms.append(online);
  if (window.IRON_STANDALONE) {
    msg.textContent = 'نسخة التدريب للجوال. الغرف متاحة من النسخة المستضافة.';
    code.hidden = row.hidden = true;
    panels[2].tab.hidden = true;
  }

  const room = new URLSearchParams(location.search).get('room');
  if (room && /^[a-z0-9]{5,16}$/.test(room)) {
    code.value = room;
    if (!window.IRON_STANDALONE) show(2);
  }
  const open = (id, mine) => {
    if (!/^[a-z0-9]{5,16}$/.test(id) || DUEL.on || host.disabled) {
      msg.textContent = 'اكتب رمز الغرفة أول.';
      return;
    }
    host.disabled = join.disabled = true;
    const kind = local ? 'local' : 'live';
    return duelStartOnline('iron-v5-' + kind + '-' + id, mine, 'خصم المبارزة')
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
    const grip = $('dForgeGrip');
    const recent = DUEL.phase === 'fight' ? DUEL.me.forgeImpact : null;
    grip.textContent = recent ? FORGE_ANATOMY_LABEL[recent.zone] : DUEL.me.st < DUEL.me.M.light.st ? 'استعد نَفَسك' :
      DUEL.round === 1 && DUEL.clock > 53 && DUEL.phase === 'fight' ? 'اسحب النصل لتوجيه الضربة' : '';
    grip.classList.toggle('tired', !!recent || DUEL.me.st < DUEL.me.M.light.st);
  };
  const top = el('div', 'forgeDuelExtras');
  const invite = el('b', '', '');
  invite.id = 'dForgeRoom';
  const grip = el('small', '', 'اسحب زر النصل لتوجيه الضربة');
  grip.id = 'dForgeGrip';
  top.append(invite, grip);
  $('dTop').after(top);
  const controls = { dKick: 'رفس', dLock: 'تثبيت', dDodge: 'مراوغة', dBlock: 'صد', dAtk: 'النصل' };
  for (const [id, label] of Object.entries(controls)) $(id).textContent = label;

  for (const node of [headings[1], headings[2], headings[3], headings[1]?.nextElementSibling,
    $('ffaCreate'), $('ffaRoom'), $('ffaStatus'), $('ffaRooms'), $('dmStatus'), $('dmList'), $('dmRec')]) {
    if (node) node.hidden = true;
  }
}

function forgeRefreshLoadout() {
  const loadout = document.querySelector('.forgeLoadout');
  if (!loadout) return;
  const weapon = DUEL_WEAPONS[S.duelW] || DUEL_WEAPONS.sword;
  loadout.replaceChildren(
    el('strong', '', weapon.n),
  );
}

forgeBuildMenu();

const forgeAttackButton = $('dAtk');
let forgePointer = null;

function forgeReleaseBlade(fire = false) {
  const pointer = forgePointer, f = DUEL.me;
  forgePointer = null;
  if (pointer && forgeAttackButton.hasPointerCapture(pointer.id)) forgeAttackButton.releasePointerCapture(pointer.id);
  forgeAttackButton.classList.remove('held', 'steering');
  if (!pointer || !f) return;
  if (f.forgeGesture?.held) {
    f.forgeGesture.held = false;
    f.forgeGesture.release = f.t;
  }
  if (fire && !pointer.dragged && !pointer.charged && DUEL.phase === 'fight') {
    if (performance.now() - pointer.time >= DUEL_HOLD * 1000) f.heavy();
    else f.light();
  }
}

function forgeClearControls() {
  forgeReleaseBlade();
  DUEL.atkDown = -1;
  DUEL.heavyFired = DUEL.blockHeld = DUEL.blockWas = DUEL.rmb = false;
  DUEL.look = DUEL.joy = null;
  DUEL.yaw = DUEL.tilt = 0;
  $('dJoy').hidden = true;
  for (const button of $('dActs').querySelectorAll('.held')) {
    const id = button.forgeHeldBy;
    if (id != null && button.hasPointerCapture(id)) button.releasePointerCapture(id);
    button.forgeHeldBy = null;
    button.classList.remove('held');
  }
  if (DUEL.me) Object.assign(DUEL.me.want, { mx:0, mz:0, run:false, block:false });
}

function forgeTickControls() {
  const pointer = forgePointer;
  if (!pointer || pointer.charged || pointer.dragged) return;
  if (performance.now() - pointer.time >= DUEL_HOLD * 1000) pointer.charged = DUEL.me.heavy();
}

forgeAttackButton.addEventListener('pointerdown', event => {
  if (forgePointer || !DUEL.on || DUEL.phase !== 'fight' || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  forgeAttackButton.setPointerCapture(event.pointerId);
  forgeAttackButton.classList.add('held');
  forgePointer = { id:event.pointerId, ...duelPt(event), time:performance.now(), dragged:false, charged:false };
});
forgeAttackButton.addEventListener('pointermove', event => {
  const f = DUEL.me, pointer = forgePointer;
  if (!f || pointer?.id !== event.pointerId || DUEL.phase !== 'fight') return;
  const position = duelPt(event);
  const dx = position.x - pointer.x, dy = position.y - pointer.y;
  if (!pointer.dragged && Math.hypot(dx, dy) < 9) return;
  pointer.dragged = true;
  const x = clamp(-dx / 75, -1, 1), y = clamp(-dy / 65, -1, 1);
  if (!pointer.steering) {
    if (pointer.charged && f.act !== 'heavy') return;
    f.forgeAim = -Math.sign(x);
    f.forgeGesture = { x, y, held:true, release:0 };
    if (!pointer.charged && !f.light()) {
      f.forgeGesture = null;
      f.forgeAim = 0;
      return;
    }
    pointer.steering = true;
  }
  if (f.forgeGesture) Object.assign(f.forgeGesture, { x, y });
  forgeAttackButton.classList.add('steering');
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  forgeAttackButton.addEventListener(type, event => {
    if (forgePointer?.id === event.pointerId) forgeReleaseBlade(type === 'pointerup');
  });
}
addEventListener('blur', () => { if (DUEL.on) forgeClearControls(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && DUEL.on) forgeClearControls(); });
