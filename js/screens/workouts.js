import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { D, progText, programEstimate } from '../data.js';
import { customPrograms } from '../store.js';
import { durationLabel } from '../format.js';
import { chip, segmented, badge, empty, noteBox } from '../ui.js';

const state = { tab: 'programs', goal: null };

function programCard(p) {
  const text = progText(p), est = programEstimate(p);
  return h('button', { class: 'pcard-wide', onClick: () => router.go('program', { id: p.id }) },
    h('div', { class: 'top' }, h('div', { class: 't' }, text.name), p.custom ? badge(t('workouts.custom')) : h('div', { class: 'row-flex', style: { gap: '6px' } }, p.access === 'premium' ? badge('Premium') : null, badge(t('level.' + p.level)))),
    text.desc ? h('div', { class: 'd' }, text.desc) : null,
    h('div', { class: 'row-flex small muted', style: { fontWeight: 600, gap: '16px' } },
      h('span', { class: 'row-flex', style: { gap: '6px' } }, icon('clock', 16), durationLabel(est)),
      h('span', null, t('n.exercises', { n: p.items.length }))));
}

export default function workouts() {
  const el = h('div', { class: 'pad' });
  const body = h('div', { class: 'stack' });
  const render = () => {
    body.replaceChildren();
    if (state.tab === 'programs') {
      const goals = h('div', { class: 'chips' });
      const mk = () => {
        goals.replaceChildren(chip({ label: t('common.all'), pressed: !state.goal, onClick: () => { state.goal = null; render(); } }),
          ...D.meta.goals.map((g) => chip({ label: t('goal.' + g), pressed: state.goal === g, onClick: () => { state.goal = state.goal === g ? null : g; render(); } })));
      };
      mk();
      const list = D.programs.filter((p) => !state.goal || p.goals.includes(state.goal));
      body.append(goals);
      if (state.goal === 'weight') body.append(noteBox(t('goal.weightNote')));
      if (!list.length) body.append(empty({ title: t('workouts.empty') }));
      else body.append(...list.map(programCard));
    } else {
      const mine = customPrograms.all().map((p) => ({ ...p, custom: true, goals: [], level: null }));
      body.append(h('button', { class: 'btn', onClick: () => router.go('builder', {}) }, icon('plus'), t('workouts.create')));
      if (!mine.length) body.append(empty({ icon: 'workouts', title: t('workouts.mineEmptyTitle'), text: t('workouts.mineEmptyText') }));
      else body.append(...mine.map(programCard));
    }
  };
  el.append(h('h1', { class: 'h1 page-title' }, t('workouts.title')),
    segmented([{ value: 'programs', label: t('workouts.programs') }, { value: 'mine', label: t('workouts.mine') }], state.tab, (v) => { state.tab = v; render(); }),
    h('div', { style: { height: '16px' } }), body);
  render();
  return { el };
}
