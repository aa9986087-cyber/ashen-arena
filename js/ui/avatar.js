'use strict';
/* Profile pictures: a player picks a photo from his device; it is cropped to a square, shrunk to a small JPEG and
   stored with his profile (save_avatar RPC, checked against his device key). The chat shows each sender's picture
   (or his hero's portrait, or the first letter of his name, when he has none). */
const AVA = { map: new Map(), at: 0, busy: false, want: new Set() };
const AVA_SIZE = 160;
/** Crop the file to its centre square, scale it down and encode it (kept under the server's limit). */
function avatarEncode(file) {
  return new Promise((ok, no) => {
    const url = URL.createObjectURL(file),
      img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = c.height = AVA_SIZE;
      const x = c.getContext('2d'),
        s = Math.min(img.naturalWidth, img.naturalHeight);
      if (!s) return no(new Error('empty'));
      x.fillStyle = '#1a1626';
      x.fillRect(0, 0, AVA_SIZE, AVA_SIZE);
      x.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, AVA_SIZE, AVA_SIZE);
      let q = 0.86,
        d = c.toDataURL('image/jpeg', q);
      while (d.length > 55000 && q > 0.3) d = c.toDataURL('image/jpeg', (q -= 0.12));
      d.length > 58000 ? no(new Error('big')) : ok(d);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      no(new Error('not an image'));
    };
    img.src = url;
  });
}
/** Save (or, with null, remove) this player's picture on the server. */
async function avatarSave(data) {
  if (!S.name) return (askName(), false);
  try {
    await api('/rest/v1/rpc/save_avatar', {
      method: 'POST',
      body: JSON.stringify({ p_pid: myPid(), p_key: profileKey(), p_name: S.name, p_img: data }),
    });
  } catch (e) {
    const m = String(e.message);
    toast(m.includes('400') ? 'لحظة شوي وجرّب مرة ثانية' : 'ما انرفعت الصورة، تأكد من الإنترنت');
    return false;
  }
  S.avatar = data || '';
  save();
  AVA.map.set(S.name, { img: S.avatar, ch: S.char, t: Date.now() });
  AU.play('select');
  toast(data ? '📷 تم تحديث صورتك' : '🗑 انحذفت صورتك');
  avatarRefresh();
  return true;
}
// The 📷 button in your own card picks a photo and uploads it. The file input lives in the page for good and the 📷 button is a <label> for it: iPhone Safari drops a picker
// made on the fly (its choice never arrives), and a label is the one way every browser opens the photo picker.
$('avaFile').onchange = async () => {
  const inp = $('avaFile'),
    f = inp.files && inp.files[0];
  inp.value = ''; // the same photo can be picked again
  if (!f) return;
  let d;
  try {
    d = await avatarEncode(f);
  } catch (e) {
    return toast('ما قدرت أقرأ الصورة، جرّب صورة ثانية');
  }
  $('pcPic').style.backgroundImage = 'url(' + d + ')';
  if (await avatarSave(d)) profileOpen(S.name);
};
/** What to show for a player: his photo, else his hero, else nothing (the caller draws his initial). */
function avatarOf(name) {
  if (name === S.name && S.avatar) return S.avatar;
  const a = AVA.map.get(name);
  if (a && a.img) return a.img;
  const ch = name === S.name ? S.char : a && a.ch;
  return ch && CHARS[ch] ? heroPortrait(ch) || '' : '';
}
/** The round picture beside a chat message. */
function avatarEl(name) {
  const d = el('i', 'cav');
  d.dataset.n = name;
  avatarPaint(d);
  return profileLink(d, name);
}
function avatarPaint(d) {
  const src = avatarOf(d.dataset.n),
    bg = src ? 'url("' + src + '")' : '';
  if (d.dataset.src === src) return;
  d.dataset.src = src;
  d.style.backgroundImage = bg;
  d.textContent = src ? '' : [...String(d.dataset.n || '?')][0];
}
/** Pictures that just arrived: put them on the messages already shown. */
function avatarRefresh() {
  for (const d of document.querySelectorAll('.cav')) avatarPaint(d);
}
/** Fetch the pictures of these players (those not known, or known for over 2 minutes); redraw the chat after. */
async function avatarFetch(names) {
  const now = Date.now();
  for (const n of names) {
    const a = AVA.map.get(n);
    if (n && (!a || now - a.t > 120000)) AVA.want.add(n);
  }
  if (AVA.busy || !AVA.want.size || (typeof NET_LOCAL !== 'undefined' && NET_LOCAL)) return;
  AVA.busy = true;
  const list = [...AVA.want].slice(0, 40);
  list.forEach(n => AVA.want.delete(n));
  const q = list.map(n => '"' + n.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',');
  let changed = false;
  try {
    const rows = await api(
      '/rest/v1/profiles?select=name,avatar,stats&name=in.(' + encodeURIComponent(q) + ')&order=updated_at.desc'
    );
    const got = new Map();
    // the newest profile of each name; a picture from any of them if the newest has none
    for (const r of rows || []) {
      const g = got.get(r.name) || { img: '', ch: r.stats && r.stats.ch };
      if (!g.img && r.avatar) g.img = r.avatar;
      got.set(r.name, g);
    }
    for (const n of list) {
      const g = got.get(n) || { img: '', ch: '' },
        old = AVA.map.get(n);
      if (!old || old.img !== g.img || old.ch !== g.ch) changed = true;
      AVA.map.set(n, { img: g.img, ch: g.ch, t: now });
    }
  } catch (e) {
    for (const n of list) if (!AVA.map.has(n)) AVA.map.set(n, { img: '', ch: '', t: now - 90000 });
  }
  AVA.busy = false;
  if (changed) avatarRefresh();
  if (AVA.want.size) avatarFetch([]);
}
