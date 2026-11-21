// Страница своей вкладки: название задаёт пользователь; внутри — список дел и заметка.
import { h } from '../util.js';
import { t } from '../i18n.js';
import { tabsCfg, pages } from '../store.js';
import { checklist } from '../checklist.js';
import { debounce } from '../util.js';
import { openTabsEditor } from '../tabs.js';
import { icon } from '../util.js';

export default function ctab({ id }) {
  const c = tabsCfg.get().custom.find((x) => x.id === id);
  if (!c) return { el: h('div', { class: 'pad' }, h('p', { class: 'muted' }, t('exercise.notFound'))) };
  const page = pages.get(id);
  const st = { note: page.note, items: page.items };
  const cl = checklist({ items: page.items, save: (l) => { st.items = l; pages.set(id, { note: st.note, items: l }); }, placeholder: t('todo.add') });
  const note = h('textarea', { class: 'input note-area', maxlength: '3000', rows: '6', placeholder: t('tabs.notePh'), 'aria-label': t('tabs.note') });
  note.value = st.note;
  const saveNote = debounce(() => { st.note = note.value; pages.set(id, { note: st.note, items: st.items }); }, 400);
  note.addEventListener('input', saveNote);
  note.addEventListener('blur', () => { st.note = note.value; pages.set(id, { note: st.note, items: st.items }); });
  return { el: h('div', { class: 'pad stack' },
    h('div', { class: 'row-flex', style: { justifyContent: 'space-between' } },
      h('h1', { class: 'h1 page-title' }, (c.emoji ? c.emoji + ' ' : '') + c.name),
      h('button', { class: 'icon-btn', 'aria-label': t('tabs.title'), onClick: openTabsEditor }, icon('edit'))),
    h('h2', { class: 'h3' }, t('tabs.list')), cl.el,
    h('h2', { class: 'h3' }, t('tabs.note')), note) };
}
