/**
 * Tiny templating helpers. `html` escapes every interpolated value unless it was
 * produced by `html` itself (or wrapped in `raw`), which keeps user-entered profile
 * text from ever being interpreted as markup.
 */
const SAFE = Symbol('safe-html');

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function raw(str) {
  return { [SAFE]: true, value: String(str) };
}

function renderValue(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(renderValue).join('');
  if (typeof v === 'object' && v[SAFE]) return v.value;
  return escapeHtml(v);
}

export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s + (i < values.length ? renderValue(values[i]) : '');
  });
  return raw(out);
}

export function mount(el, template) {
  el.innerHTML = template.value;
  // Widths are applied through the CSSOM so the strict Content-Security-Policy
  // (no inline style attributes) still allows bar charts.
  el.querySelectorAll('[data-width]').forEach((node) => {
    node.style.width = `${Math.max(0, Math.min(100, Number(node.dataset.width)))}%`;
  });
}

let toastTimer;
export function toast(message, kind = 'info') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.dataset.kind = kind;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 3500);
}
