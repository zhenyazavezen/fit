// Список дел с галочками: используется в «Делах на сегодня» и на страницах своих вкладок.
import { h, icon, uid } from './util.js';
import { t } from './i18n.js';

/** items — начальный список [{id,t,d}], save(list) — сохранить, onUpdate(list) — после каждой перерисовки. */
/** repeat: { toggle(item) } — показывает кнопку «повторять каждый день»; onRemove(item) — дело удалено. */
export function checklist({ items, save, placeholder, onUpdate, repeat, onRemove }) {
  let list = items.map((x) => ({ ...x }));
  const box = h('div', { class: 'cl' });
  const input = h('input', { class: 'input', type: 'text', maxlength: '160', placeholder, 'aria-label': placeholder, enterkeyhint: 'done' });
  const commit = () => { save(list); draw(); };
  const add = () => {
    const v = input.value.trim(); if (!v) return;
    list.push({ id: 't_' + uid(), t: v, d: false }); input.value = ''; commit(); input.focus();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const hint = h('p', { class: 'small muted', hidden: true }, t('todo.repeatHint'));
  const addBtn = h('button', { class: 'btn cl-add', type: 'button', 'aria-label': placeholder, onClick: add }, icon('plus'));
  function draw() {
    box.replaceChildren(...list.map((x) => h('div', { class: 'cl-row' + (x.d ? ' done' : '') },
      h('button', { class: 'cl-main', type: 'button', role: 'checkbox', 'aria-checked': String(x.d), onClick: () => { x.d = !x.d; commit(); } },
        h('i', { class: 'cl-box' }, x.d ? icon('check') : null), h('span', { class: 'cl-text' }, x.t)),
      repeat ? h('button', { class: 'icon-btn rep' + (x.src ? ' on' : ''), type: 'button', 'aria-pressed': String(!!x.src), 'aria-label': t('todo.repeat'), onClick: () => { repeat.toggle(x); commit(); } }, icon('repeat', 18)) : null,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '×', onClick: () => { onRemove?.(x); list = list.filter((y) => y.id !== x.id); commit(); } }, icon('x', 18)))));
    hint.hidden = !repeat || !list.length;
    onUpdate?.(list);
  }
  draw();
  return { el: h('div', { class: 'stack', style: { gap: '10px' } }, box, hint, h('div', { class: 'cl-addrow' }, input, addBtn)) };
}
