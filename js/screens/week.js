// Расписание тренировок на неделю: для каждого дня — программа или день отдыха. Сегодняшний день показывается на главной.
import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import { allPrograms, getProgram, progText, programEstimate } from '../data.js';
import { weekPlan, weekdayOf } from '../store.js';
import { dayKey } from '../dates.js';
import { durationLabel } from '../format.js';
import { topbar, sheet } from '../ui.js';

export default function week() {
  const todayWd = weekdayOf(dayKey(Date.now()));
  const el = h('div'), body = h('div', { class: 'pad stack' });
  el.append(topbar({ title: t('week.title') }), body);

  const label = (id) => {
    if (id === 'rest') return { name: t('week.rest'), sub: '' };
    const p = id && getProgram(id);
    return p ? { name: progText(p).name, sub: durationLabel(programEstimate(p)) } : { name: t('week.none'), sub: '', empty: true };
  };

  function choose(wd) {
    const mk = (id, title, sub, ic) => h('button', { class: 'item', onClick: () => { weekPlan.set(wd, id); s.close(); draw(); } }, icon(ic || 'workouts'), h('div', { class: 'grow' }, h('div', { class: 't' }, title), sub ? h('div', { class: 's' }, sub) : null), weekPlan.get(wd) === id ? icon('check', 18) : null);
    const progs = allPrograms();
    const group = (title, list) => (list.length ? [h('h3', { class: 'eyebrow', style: { margin: '12px 0 6px' } }, title), h('div', { class: 'list' }, ...list.map((p) => mk(p.id, progText(p).name, durationLabel(programEstimate(p)))))] : []);
    const ready = progs.filter((p) => !p.custom);
    const s = sheet({ title: t('day.' + (wd - 1)) + ' · ' + t('week.choose'), body: [
      h('div', { class: 'list' }, mk('rest', t('week.rest'), t('week.restSub'), 'moon'), weekPlan.get(wd) ? h('button', { class: 'item', onClick: () => { weekPlan.set(wd, null); s.close(); draw(); } }, icon('x'), h('div', { class: 'grow t' }, t('week.clear'))) : null),
      ...group(t('workouts.mineTitle'), progs.filter((p) => p.custom)),
      ...['beginner', 'intermediate', 'advanced'].flatMap((lv) => group(t('level.' + lv), ready.filter((p) => p.level === lv && !p.id.startsWith('r')))),
      ...group(t('workouts.sec.recovery'), ready.filter((p) => p.id.startsWith('r')))] });
  }

  function draw() {
    body.replaceChildren(h('p', { class: 'muted small' }, t('week.intro')),
      h('div', { class: 'list' }, ...[1, 2, 3, 4, 5, 6, 7].map((wd) => {
        const l = label(weekPlan.get(wd));
        return h('button', { class: 'item' + (wd === todayWd ? ' me' : ''), onClick: () => choose(wd) }, h('div', { class: 'lead' }, t('day.' + (wd - 1))),
          h('div', { class: 'grow' }, h('div', { class: 't', style: l.empty ? { color: 'var(--text3)' } : null }, l.name), l.sub ? h('div', { class: 's' }, l.sub) : null),
          wd === todayWd ? h('span', { class: 'badge' }, t('week.today')) : null, icon('chev-r', 18));
      })));
  }
  draw();
  return { el };
}
