// Общие элементы интерфейса. Всё строится через h(): текст вставляется как textContent.
import { h, icon } from './util.js';
import { t } from './i18n.js';
import * as router from './router.js';
import { haptic } from './feedback.js';
import { reducedMotion } from './util.js';

const layer = () => document.getElementById('layer');

export function topbar({ title = '', back = true, actions = [] } = {}) {
  return h('div', { class: 'topbar' },
    back ? h('button', { class: 'icon-btn', 'aria-label': t('common.back'), onClick: () => router.back() }, icon('chev-l')) : null,
    h('div', { class: 'title' }, title),
    ...actions);
}

export function chip({ label, pressed = false, onClick, iconName }) {
  const b = h('button', { class: 'chip', 'aria-pressed': String(pressed), type: 'button' }, iconName ? icon(iconName) : null, label);
  b.addEventListener('click', () => { haptic('select'); onClick?.(b); });
  return b;
}

export function segmented(options, value, onChange) {
  const root = h('div', { class: 'seg', role: 'group' });
  const render = (v) => root.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  for (const o of options) {
    root.append(h('button', { dataset: { v: o.value }, type: 'button', 'aria-pressed': String(o.value === value), onClick: () => { render(o.value); haptic('select'); onChange(o.value); } }, o.label));
  }
  return root;
}

export function toggle(checked, onChange, label) {
  const b = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(!!checked), 'aria-label': label, type: 'button' });
  b.addEventListener('click', () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); haptic('select'); onChange(v); });
  return b;
}

export function stepper({ value, min, max, step = 1, onChange, format = String, label = '' }) {
  let v = value;
  const out = h('div', { class: 'val num', 'aria-live': 'polite' }, format(v));
  const set = (n) => { v = Math.min(max, Math.max(min, n)); out.textContent = format(v); minus.disabled = v <= min; plus.disabled = v >= max; onChange(v); };
  const minus = h('button', { class: 'icon-btn', type: 'button', 'aria-label': label + ' −', onClick: () => set(v - step) }, icon('minus'));
  const plus = h('button', { class: 'icon-btn', type: 'button', 'aria-label': label + ' +', onClick: () => set(v + step) }, icon('plus'));
  minus.disabled = v <= min; plus.disabled = v >= max;
  return h('div', { class: 'stepper' }, minus, out, plus);
}

export function badge(text) { return h('span', { class: 'badge' }, text); }

export function empty({ icon: name = 'info', title, text, action }) {
  return h('div', { class: 'empty' }, icon(name), h('h3', { class: 'h3' }, title), text ? h('p', null, text) : null, action || null);
}

export function noteBox(text, iconName = 'info') { return h('div', { class: 'note' }, icon(iconName), h('div', null, text)); }

/** Нижняя шторка. Системная «Назад» закрывает её. Возвращает {close, body, foot}. */
export function sheet({ title, body, foot, onClose } = {}) {
  const scrim = h('div', { class: 'scrim' });
  const closeBtn = h('button', { class: 'icon-btn', 'aria-label': t('common.close'), type: 'button' }, icon('x'));
  const bodyEl = h('div', { class: 'body' }, ...(Array.isArray(body) ? body : [body]));
  const footEl = foot ? h('div', { class: 'foot' }, ...(Array.isArray(foot) ? foot : [foot])) : null;
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '' },
    h('div', { class: 'grab' }), h('header', null, h('h2', { class: 'h2' }, title || ''), closeBtn), bodyEl, footEl);
  const root = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } }, scrim, panel);
  layer().append(root);
  const prevFocus = document.activeElement;
  let closed = false;
  const off = router.onBack(() => close());
  function close() {
    if (closed) return; closed = true; off();
    const done = () => { root.remove(); try { prevFocus?.focus?.({ preventScroll: true }); } catch { /* ignore */ } onClose?.(); };
    done();
  }
  scrim.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  panel.querySelector('button')?.focus?.({ preventScroll: true });
  return { close, body: bodyEl, foot: footEl, root };
}

/** Подтверждение. Возвращает Promise<boolean>. */
export function confirmDialog({ title, text, confirm, cancel = t('common.cancel'), danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const ans = (v) => { if (answered) return; answered = true; s.close(); resolve(v); };
    const s = sheet({
      title,
      body: text ? h('p', { class: 'muted' }, text) : [],
      foot: [h('button', { class: 'btn ghost', type: 'button', onClick: () => ans(false) }, cancel), h('button', { class: 'btn' + (danger ? ' danger' : ''), type: 'button', onClick: () => ans(true) }, confirm)],
      onClose: () => { if (!answered) { answered = true; resolve(false); } },
    });
  });
}

let toastTimer;
export function toast(message, ms = 2400) {
  layer().querySelectorAll('.toast').forEach((n) => n.remove());
  const el = h('div', { class: 'toast', role: 'status' }, message);
  layer().append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), ms);
}

