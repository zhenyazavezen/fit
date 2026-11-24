// Карточка «на сегодня» с галочками: общая для «Дел на сегодня» (главная) и «Тренировок на сегодня» (раздел «Тренировки»).
import { h, icon, uid } from './util.js';
import { t } from './i18n.js';
import * as router from './router.js';
import { dayKey } from './dates.js';
import { checklist } from './checklist.js';

/** list — todos или workoutsToday; k — префикс текстов: 'todo' | 'wtoday'; route — экран «Расписание и история». */
export function dayCard({ list, k, key, route }) {
  const day = dayKey(Date.now());
  const bar = h('i'), count = h('span', { class: 'small muted row-flex', style: { gap: '4px', whiteSpace: 'nowrap' } });
  const upd = (items) => {
    const n = items.length, d = items.filter((x) => x.d).length;
    bar.style.width = (n ? (d / n) * 100 : 0) + '%';
    if (n && d === n) count.replaceChildren(icon('check', 16), t('todo.allDone'));
    else count.textContent = !n ? t('todo.none') : t('todo.progress', { d, n });
  };
  // «Повторять каждый день»: запись запоминается в постоянном списке и появляется в каждом новом дне, пока её не удалят.
  const repeat = { toggle: (x) => {
    const daily = list.daily();
    if (x.src) { list.setDaily(daily.filter((r) => r.id !== x.src)); delete x.src; }
    else { const id = 'r_' + uid(); list.setDaily([...daily, { id, t: x.t, days: [1, 2, 3, 4, 5, 6, 7] }]); x.src = id; }
  } };
  const onRemove = (x) => { if (x.src) list.setDaily(list.daily().filter((r) => r.id !== x.src)); };
  const cl = checklist({ items: list.forDay(day), save: (l) => list.set(day, l), placeholder: t(k + '.add'), onUpdate: upd, repeat, onRemove });
  return h('section', { class: 'card todo htile', dataset: { key }, 'aria-label': t(k + '.title') },
    h('div', { class: 'row-flex', style: { justifyContent: 'space-between' } }, h('h2', { class: 'h3' }, t(k + '.title')), count),
    h('div', { class: 'bar', role: 'progressbar', 'aria-label': t(k + '.title') }, bar), cl.el,
    h('button', { class: 'link-btn row-flex', style: { gap: '4px', alignSelf: 'flex-start' }, type: 'button', onClick: () => router.go(route) }, t('myday.open'), icon('chev-r', 16)));
}
