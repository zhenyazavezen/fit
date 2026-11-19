// Мелкие помощники для DOM. Текст всегда вставляется через textContent — innerHTML не используется.
const SVGNS = 'http://www.w3.org/2000/svg';

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return el;
}

export function h(tag, attrs = null, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  return append(el, kids);
}

export function icon(name, size, fill = false) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('class', fill ? 'ic fill' : 'ic');
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(SVGNS, 'use');
  u.setAttribute('href', '#i-' + name);
  s.append(u);
  if (size) { s.style.width = size + 'px'; s.style.height = size + 'px'; }
  return s;
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export const normalize = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').trim();
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function debounce(fn, ms) {
  let id;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
