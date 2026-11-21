// Календарь тренировок: месяц с числами, дни занятий отмечены; итоги месяца, сравнение с прошлым и список тренировок.
import { h, icon } from '../util.js';
import { t, getLang } from '../i18n.js';
import * as router from '../router.js';
import { history } from '../store.js';
import { period, byDay, groupByDay, streak } from '../stats.js';
import { dayKey, addDays, startOfDay } from '../dates.js';
import { spentLabel } from '../format.js';
import { topbar } from '../ui.js';

const timeOf = (ts) => new Date(ts).toLocaleTimeString(getLang(), { hour: '2-digit', minute: '2-digit' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function calendar() {
  const hist = history.all();
  const st = { offset: 0, day: null };
  const el = h('div'), body = h('div', { class: 'pad cal' });
  el.append(topbar({ title: t('cal.title') }), body);

  function draw() {
    const now = Date.now(), p = period(hist, 'month', st.offset, now), days = byDay(hist);
    const first = new Date(p.start), pad = (first.getDay() + 6) % 7, count = p.bars.length, today = dayKey(now);
    const label = cap(first.toLocaleDateString(getLang(), { month: 'long', year: 'numeric' }).replace(/\s*г\.?$/i, ''));
    const cells = [
      ...Array.from({ length: pad }, () => h('div', { class: 'cal-cell empty' })),
      ...p.bars.map((b) => {
        const d = days.get(b.key);
        return h('button', { class: 'cal-cell' + (d ? ' done' : '') + (b.key === today ? ' today' : '') + (st.day === b.key ? ' sel' : ''), type: 'button',
          'aria-label': `${b.i + 1}${d ? ', ' + t('cal.has') : ''}`, 'aria-pressed': String(st.day === b.key),
          onClick: () => { st.day = st.day === b.key ? null : b.key; draw(); } }, String(b.i + 1));
      }),
    ];
    const dd = Math.round((p.total.sec - p.prev.sec) / 60), dw = p.total.workouts - p.prev.workouts;
    const fmt = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
    const activeDays = p.bars.filter((b) => b.workouts).length;
    const groups = groupByDay(hist).filter((g) => g.ts >= p.start && g.ts < p.end && (!st.day || g.key === st.day));
    body.replaceChildren(...[
      h('div', { class: 'period-nav' },
        h('button', { class: 'icon-btn', 'aria-label': t('progress.prev'), onClick: () => { st.offset -= 1; st.day = null; draw(); } }, icon('chev-l')),
        h('div', { class: 'lbl' }, label),
        h('button', { class: 'icon-btn', 'aria-label': t('progress.next'), disabled: st.offset >= 0, onClick: () => { st.offset += 1; st.day = null; draw(); } }, icon('chev-r'))),
      h('div', { class: 'card cal-card' },
        h('div', { class: 'cal-head' }, ...[0, 1, 2, 3, 4, 5, 6].map((i) => h('span', null, t('day.' + i)))),
        h('div', { class: 'cal-grid' }, ...cells)),
      h('div', { class: 'facts' },
        fact(String(p.total.workouts), t('cal.workouts')), fact(String(activeDays), t('cal.days')), fact(p.total.sec ? spentLabel(p.total.sec) : '0', t('cal.time'))),
      (p.prev.workouts || p.total.workouts) ? h('div', { class: 'card stack', style: { gap: '6px' } },
        h('div', { class: 'eyebrow' }, t('cal.progress')),
        h('div', { class: 'h3' }, t('cal.vsPrev', { w: fmt(dw), m: fmt(dd) })),
        st.offset === 0 ? h('div', { class: 'small muted' }, t('home.streakDays', { n: streak(hist, now) }) + ' · ' + t('progress.streak')) : null) : null,
      h('h2', { class: 'h3', style: { margin: '8px 0 0' } }, st.day ? t('cal.dayList') : t('cal.monthList')),
      groups.length ? h('div', { class: 'stack' }, ...groups.flatMap((g) => [
        h('div', { class: 'day-title' }, new Date(g.ts).toLocaleDateString(getLang(), { weekday: 'long', day: 'numeric', month: 'long' })),
        h('div', { class: 'list' }, ...g.items.map((s) => h('div', { class: 'item' },
          h('div', { class: 'grow' }, h('div', { class: 't' }, s.title || t('progress.customWorkout')), h('div', { class: 's' }, `${timeOf(s.at)} · ${t('n.sets', { n: s.setsDone })}`)),
          h('div', { class: 'end' }, spentLabel(s.durationSec)))))]))
        : h('p', { class: 'muted small' }, st.day ? t('cal.noDay') : t('cal.noMonth'))].filter(Boolean));
  }
  const fact = (v, l) => h('div', { class: 'fact' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
  draw();
  return { el };
}
