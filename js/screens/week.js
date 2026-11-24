// Расписание тренировок: по каждому дню недели виден полный список упражнений. Нажатие на день — правка.
import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { weekPlan, weekdayOf } from '../store.js';
import { weekItems, exName, resolved } from '../data.js';
import { doseLabel } from '../format.js';
import { dayKey } from '../dates.js';
import { topbar } from '../ui.js';

export default function week() {
  const todayWd = weekdayOf(dayKey(Date.now()));
  const body = h('div', { class: 'pad stack' });
  body.append(h('p', { class: 'muted small' }, t('week.intro')),
    ...[1, 2, 3, 4, 5, 6, 7].map((wd) => {
      const rest = weekPlan.get(wd) === 'rest', items = rest ? [] : weekItems(wd);
      const lines = items.map((it, i) => h('div', { class: 'wk-line' }, h('span', { class: 'n' }, `${i + 1}.`), h('span', { class: 'grow' }, exName(it.ex)), h('span', { class: 'muted' }, doseLabel(resolved(it, 30)))));
      return h('button', { class: 'card wk-day' + (wd === todayWd ? ' me' : ''), type: 'button', onClick: () => router.go('weekday', { wd }) },
        h('div', { class: 'row-flex', style: { gap: '8px' } }, h('span', { class: 'h3 grow', style: { textAlign: 'left' } }, t('dayfull.' + (wd - 1))),
          wd === todayWd ? h('span', { class: 'badge' }, t('week.today')) : null, icon('chev-r', 18)),
        rest ? h('div', { class: 'small muted' }, t('week.rest')) : items.length ? h('div', { class: 'wk-lines' }, ...lines) : h('div', { class: 'small muted' }, t('week.empty')));
    }));
  return { el: h('div', null, topbar({ title: t('week.title') }), body) };
}
