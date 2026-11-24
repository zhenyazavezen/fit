// «Мой день»: расписание дел по дням недели и история дел. Дела расписания сами появляются в списке «Дела на сегодня».
import { h, icon, uid } from '../util.js';
import { t } from '../i18n.js';
import { todos as todayTodos, workoutsToday, weekdayOf } from '../store.js';
import { dayKey } from '../dates.js';
import { topbar, chip, toast } from '../ui.js';

const ALL = [1, 2, 3, 4, 5, 6, 7];
const daysLabel = (days) => (days.length === 7 ? t('myday.everyDay') : days.map((n) => t('day.' + (n - 1))).join(', '));

export default function myday({ kind } = {}) {
  const wk = kind === 'workouts', todos = wk ? workoutsToday : todayTodos, P = wk ? 'mywk' : 'myday';
  const today = dayKey(Date.now());
  const st = { wd: weekdayOf(today), all: false };
  const el = h('div'), body = h('div', { class: 'pad stack' });
  el.append(topbar({ title: t(P + '.title') }), body);

  const addToday = (text) => { todos.set(today, [...todos.forDay(today), { id: 't_' + uid(), t: text, d: false }]); toast(t(P + '.added')); draw(); };
  const schedule = (text, days) => { todos.setDaily([...todos.daily(), ...[].concat(text).map((x) => ({ id: 'r_' + uid(), t: x, days }))]); draw(); };
  const unschedule = (r, wd) => {
    const rest = r.days.filter((n) => n !== wd), all = todos.daily();
    todos.setDaily(rest.length ? all.map((x) => (x.id === r.id ? { ...x, days: rest } : x)) : all.filter((x) => x.id !== r.id));
    if (wd === weekdayOf(today)) todos.set(today, todos.get(today).filter((x) => x.src !== r.id));   // сегодняшняя копия тоже уходит
    draw();
  };

  function draw() {
    const mine = todos.daily().filter((r) => r.days.includes(st.wd));
    const input = h('input', { class: 'input', type: 'text', maxlength: '160', placeholder: t(P + '.add'), 'aria-label': t(P + '.add'), enterkeyhint: 'done', autocomplete: 'off' });
    const add = () => { const v = input.value.replace(/\s+/g, ' ').trim(); if (v) schedule(v, st.all ? ALL : [st.wd]); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const todayTexts = new Set(todos.forDay(today).map((x) => x.t.trim().toLowerCase()));
    const hist = todos.history().filter((x) => x.t.trim());

    body.replaceChildren(
      h('p', { class: 'muted small' }, t(P + '.intro')),
      h('h2', { class: 'h3 group-title' }, t(P + '.schedule')),
      h('div', { class: 'days-row', role: 'group' }, ...ALL.map((n) => chip({ label: t('day.' + (n - 1)), pressed: st.wd === n, onClick: () => { st.wd = n; draw(); } }))),
      mine.length
        ? h('div', { class: 'list' }, ...mine.map((r) => h('div', { class: 'item' }, icon('repeat'),
            h('div', { class: 'grow' }, h('div', { class: 't' }, r.t), h('div', { class: 's' }, daysLabel(r.days))),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('myday.removeFromDay'), onClick: () => unschedule(r, st.wd) }, icon('x', 18)))))
        : h('p', { class: 'muted small' }, t(P + '.emptyDay', { day: t('day.' + (st.wd - 1)) })),
      h('div', { class: 'cl-addrow' }, input, h('button', { class: 'btn cl-add', type: 'button', 'aria-label': t(P + '.add'), onClick: add }, icon('plus'))),
      chip({ label: t('myday.everyDay'), pressed: st.all, iconName: 'repeat', onClick: () => { st.all = !st.all; draw(); } }),
      h('h2', { class: 'h3 group-title' }, t(P + '.history')),
      hist.length
        ? h('div', { class: 'stack', style: { gap: '8px' } }, h('p', { class: 'small muted' }, t(P + '.historyHint', { day: t('day.' + (st.wd - 1)) })),
            h('div', { class: 'list' }, ...hist.map((x) => {
              const inToday = todayTexts.has(x.t.trim().toLowerCase());
              return h('div', { class: 'item' }, h('div', { class: 'grow t' }, x.t),
                h('button', { class: 'icon-btn', type: 'button', disabled: inToday, 'aria-label': t('myday.toToday'), onClick: () => addToday(x.t) }, icon('plus', 20)),
                h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('myday.toSchedule'), onClick: () => schedule(x.t, [st.wd]) }, icon('repeat', 20)));
            })))
        : h('p', { class: 'muted small' }, t(P + '.noHistory')));
  }
  draw();
  return { el };
}
