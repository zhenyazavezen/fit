// Список дел с галочками: используется в «Делах на сегодня» и на страницах своих вкладок.
import { h, icon, uid } from './util.js';

/** items — начальный список [{id,t,d}], save(list) — сохранить, onUpdate(list) — после каждой перерисовки. */
export function checklist({ items, save, placeholder, onUpdate }) {
  let list = items.map((x) => ({ ...x }));
  const box = h('div', { class: 'cl' });
  const input = h('input', { class: 'input', type: 'text', maxlength: '160', placeholder, 'aria-label': placeholder, enterkeyhint: 'done' });
  const commit = () => { save(list); draw(); };
  const add = () => {
    const v = input.value.trim(); if (!v) return;
    list.push({ id: 't_' + uid(), t: v, d: false }); input.value = ''; commit(); input.focus();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const addBtn = h('button', { class: 'btn cl-add', type: 'button', 'aria-label': placeholder, onClick: add }, icon('plus'));
  function draw() {
    box.replaceChildren(...list.map((x) => h('div', { class: 'cl-row' + (x.d ? ' done' : '') },
      h('button', { class: 'cl-main', type: 'button', role: 'checkbox', 'aria-checked': String(x.d), onClick: () => { x.d = !x.d; commit(); } },
        h('i', { class: 'cl-box' }, x.d ? icon('check') : null), h('span', { class: 'cl-text' }, x.t)),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '×', onClick: () => { list = list.filter((y) => y.id !== x.id); commit(); } }, icon('x', 18)))));
    onUpdate?.(list);
  }
  draw();
  return { el: h('div', { class: 'stack', style: { gap: '10px' } }, box, h('div', { class: 'cl-addrow' }, input, addBtn)) };
}
