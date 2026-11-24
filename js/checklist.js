// Тетрадь-список с галочками: «Дела на сегодня», «Тренировки на сегодня», страницы своих вкладок.
// Однострочное поле, «+» или Enter добавляют запись; список обновляется по месту (без перерисовки всего списка и скачков прокрутки).
import { h, icon, uid } from './util.js';
import { t } from './i18n.js';

/** items — начальный список [{id,t,d}], save(list) — сохранить, onUpdate(list) — после каждого изменения.
 *  repeat: { toggle(item) } — кнопка «повторять»; onRemove(item) — запись удалена. */
export function checklist({ items, save, placeholder, onUpdate, repeat, onRemove }) {
  let list = items.map((x) => ({ ...x }));
  const box = h('div', { class: 'cl' });
  const input = h('input', { class: 'input', type: 'text', maxlength: '160', placeholder, 'aria-label': placeholder, enterkeyhint: 'done', autocomplete: 'off', autocapitalize: 'sentences' });
  const changed = () => { save(list); onUpdate?.(list); };

  function rowFor(x) {
    const row = h('div', { class: 'cl-row' + (x.d ? ' done' : ''), dataset: { id: x.id } });
    const mark = h('i', { class: 'cl-box' }, x.d ? icon('check') : null);
    const main = h('button', { class: 'cl-main', type: 'button', role: 'checkbox', 'aria-checked': String(!!x.d) }, mark, h('span', { class: 'cl-text' }, x.t));
    main.addEventListener('click', () => {
      x.d = !x.d; row.classList.toggle('done', x.d); main.setAttribute('aria-checked', String(x.d)); mark.replaceChildren(...(x.d ? [icon('check')] : [])); changed();
    });
    const rep = repeat ? h('button', { class: 'icon-btn rep' + (x.src ? ' on' : ''), type: 'button', 'aria-pressed': String(!!x.src), 'aria-label': t('todo.repeat'), title: t('todo.repeat') }, icon('repeat', 18)) : null;
    rep?.addEventListener('click', () => { repeat.toggle(x); rep.classList.toggle('on', !!x.src); rep.setAttribute('aria-pressed', String(!!x.src)); changed(); });
    const del = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.delete') }, icon('x', 18));
    del.addEventListener('click', () => { onRemove?.(x); list = list.filter((y) => y.id !== x.id); row.remove(); changed(); });
    row.append(main, rep, del);
    return row;
  }

  function add() {
    const v = input.value.replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!v) return;
    const x = { id: 't_' + uid(), t: v, d: false };
    list.push(x); box.append(rowFor(x)); input.value = '';
    changed();
    addrow.scrollIntoView({ block: 'nearest' });       // поле остаётся на виду, без резких прыжков
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  // Кнопка «+» не забирает фокус у поля: клавиатура остаётся открытой, можно писать дальше.
  const addBtn = h('button', { class: 'btn cl-add', type: 'button', 'aria-label': placeholder }, icon('plus'));
  addBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  addBtn.addEventListener('click', add);
  const addrow = h('div', { class: 'cl-addrow' }, input, addBtn);

  box.append(...list.map(rowFor));
  onUpdate?.(list);
  return { el: h('div', { class: 'stack', style: { gap: '10px' } }, box, addrow) };
}
