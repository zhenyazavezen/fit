import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { allPrograms, getProgram, progText, programEstimate } from '../data.js';
import { workoutsToday } from '../store.js';
import { dayCard } from '../todocard.js';
import { durationLabel } from '../format.js';
import { empty } from '../ui.js';
import { userProfile } from '../profile-data.js';

// Простая система: программы по уровням + растяжка. Только вес тела, без оборудования.
export function programCard(p) {
  const text = progText(p), est = programEstimate(p);
  return h('button', { class: 'pcard-wide', onClick: () => router.go('program', { id: p.id }) },
    h('div', { class: 'top' }, h('div', { class: 't' }, text.name)),
    h('div', { class: 'row-flex small muted', style: { fontWeight: 600, gap: '16px' } },
      h('span', { class: 'row-flex', style: { gap: '6px' } }, icon('clock', 16), durationLabel(est)),
      h('span', null, t('n.exercises', { n: p.items.length }))));
}

export default function workouts() {
  const el = h('div', { class: 'pad stack' });
  const all = allPrograms(), mine = all.filter((p) => p.custom), ready = all.filter((p) => !p.custom);
  const recovery = ready.filter((p) => p.id.startsWith('r'));
  const prof = userProfile.get();
  const section = (title, list) => (list.length ? h('section', { class: 'stack', style: { gap: 'var(--sp-3)' } }, h('h2', { class: 'h3' }, title), ...list.map(programCard)) : null);
  el.append(h('div', null, h('h1', { class: 'h1 page-title', style: { paddingBottom: '4px' } }, t('workouts.title')), h('p', { class: 'small muted' }, t('workouts.sub'))),
    dayCard({ list: workoutsToday, k: 'wtoday', key: 'wtoday', route: 'mywk' }),
    h('button', { class: 'link-btn row-flex', style: { gap: '4px', alignSelf: 'flex-start' }, type: 'button', onClick: () => router.go('builder', {}) }, icon('plus', 16), t('workouts.builder')),
    h('button', { class: 'card level-plate plan-plate', type: 'button', onClick: () => router.go('plan') }, icon('profile'),
      h('div', { class: 'grow stack', style: { gap: '2px', textAlign: 'left' } }, h('div', { class: 'h3' }, t('plan.title')),
        h('div', { class: 'small muted' }, t('workouts.planHint', { level: t('level.' + prof.level) }))), icon('chev-r', 18)),
    mine.length ? section(t('workouts.mineTitle'), mine) : h('p', { class: 'small muted' }, t('workouts.mineHint')),
    section(t('workouts.sec.recovery'), recovery));
  if (!all.length) el.append(empty({ title: t('workouts.empty') }));
  return { el };
}
