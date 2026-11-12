'use strict';
/* Signed, copy-pasteable codes (score shares, gift codes): PREFIX-<base64url(field|field|…|signature)>.
   The signature only stops casual editing; the salt is visible in the page source. */
/** FNV-1a hash as a short base-36 string. */
const sig = s => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};
/** UTF-8 safe, URL-safe base64 without padding. */
const b64 = s =>
  btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
/** Build a signed code from fields (fields must not contain '|'). */
function packCode(prefix, fields, salt) {
  const body = fields.join('|');
  return prefix + '-' + b64(body + '|' + sig(body + salt));
}
/** Find a code with this prefix anywhere in txt; returns its n fields (strings), or null if missing or tampered. */
function unpackCode(prefix, txt, n, salt) {
  const m = new RegExp(prefix + '-([A-Za-z0-9_-]+)').exec(txt || '');
  if (!m) return null;
  try {
    const p = unb64(m[1]).split('|');
    if (p.length !== n + 1) return null;
    const f = p.slice(0, n);
    return sig(f.join('|') + salt) === p[n] ? f : null;
  } catch (err) {
    return null;
  }
}
