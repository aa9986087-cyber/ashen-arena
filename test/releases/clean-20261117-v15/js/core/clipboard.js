'use strict';
/* Shared clipboard operation. UI callers own their messages; the fallback never depends on hidden screens. */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(String(text));
      return true;
    }
  } catch {
    // Clipboard permissions or browser support can fail; try a temporary focusable field.
  }
  let field, previous;
  try {
    previous = document.activeElement;
    field = document.createElement('textarea');
    field.value = String(text);
    field.readOnly = true;
    field.setAttribute('aria-hidden', 'true');
    field.style.cssText = 'position:fixed;top:0;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(field);
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, field.value.length);
    return !!document.execCommand('copy');
  } catch {
    return false;
  } finally {
    if (field) field.remove();
    try {
      if (previous && previous.focus) previous.focus({ preventScroll: true });
    } catch {}
  }
}
