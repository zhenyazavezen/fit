import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { D, exText, exName, planForExercise } from '../data.js';
import { favorites } from '../store.js';
import { resolveItem } from '../engine.js';
import { doseLabel } from '../format.js';
import { topbar, badge, noteBox, toast } from '../ui.js';
import { startPlan } from '../start.js';
import { haptic } from '../feedback.js';

export default function exercise({ id }) {
  const ex = D.exById.get(id);
  if (!ex) return { el: h('div', null, topbar(), h('div', { class: 'pad' }, h('p', { class: 'muted' }, t('exercise.notFound')))) };
  const c = exText(id), el = h('div');

  const fav = h('button', { class: 'icon-btn fav-btn', 'aria-pressed': String(favorites.has(id)), 'aria-label': favorites.has(id) ? t('exercise.favRemove') : t('exercise.favAdd') }, icon('heart'));
  fav.addEventListener('click', () => {
    const on = favorites.toggle(id); haptic('light');
    fav.setAttribute('aria-pressed', String(on)); fav.setAttribute('aria-label', on ? t('exercise.favRemove') : t('exercise.favAdd'));
    toast(on ? t('exercise.favAdded') : t('exercise.favRemoved'), 1400);
  });
  el.append(topbar({ actions: [fav] }));

  const r = resolveItem({}, ex), body = h('div', { class: 'pad' });
  body.append(h('h1', { class: 'h1' }, c.name));
  body.append(h('div', { class: 'badges', style: { marginTop: '12px' } }, badge(t('level.' + ex.level)), badge(t('mode.' + ex.mode)),
    ...ex.equipment.filter((e) => e !== 'none').map((e) => badge(t('equip.' + e))), ...ex.categories.map((cat) => badge(t('cat.' + cat)))));
  if (D.cards[id]) body.append(h('img', { class: 'exercise-card', src: D.cards[id], alt: t('exercise.cardAlt', { name: c.name }), loading: 'lazy', onError: (e) => e.target.remove() }));
  body.append(h('p', { class: 'muted', style: { marginTop: '16px' } }, c.desc));

  body.append(h('div', { class: 'block' }, h('div', { class: 'eyebrow' }, t('exercise.recommended')),
    h('div', { class: 'card dose-card' }, h('div', { class: 'big' }, doseLabel(r, { withSides: false })), h('div', { class: 'small muted' }, doseLabel(r).split(' · ').slice(1).join(' · ')))));

  body.append(h('div', { class: 'block' }, h('h2', { class: 'h3' }, t('exercise.muscles')),
    h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, t('exercise.primary')), h('div', { class: 'chipset' }, ...ex.muscles.primary.map((m) => h('span', { class: 'mchip primary' }, t('muscle.' + m))))),
    ex.muscles.secondary.length ? h('div', null, h('div', { class: 'eyebrow', style: { margin: '4px 0 8px' } }, t('exercise.secondary')), h('div', { class: 'chipset' }, ...ex.muscles.secondary.map((m) => h('span', { class: 'mchip' }, t('muscle.' + m))))) : null));

  body.append(h('div', { class: 'block' }, h('h2', { class: 'h3' }, t('exercise.start')), h('p', { class: 'muted' }, c.start)));
  body.append(h('div', { class: 'block' }, h('h2', { class: 'h3' }, t('exercise.technique')), h('ol', { class: 'steps' }, ...c.steps.map((s) => h('li', null, h('span', null, s))))));
  body.append(h('div', { class: 'block' }, h('h2', { class: 'h3' }, t('exercise.mistakes')), h('ul', { class: 'bullets' }, ...c.mistakes.map((s) => h('li', null, s)))));
  if (c.tip) body.append(h('div', { class: 'block' }, noteBox(c.tip, 'info')));

  const variants = [['easier', ex.easier], ['harder', ex.harder]].filter(([, v]) => v);
  if (variants.length) body.append(h('div', { class: 'block' }, h('h2', { class: 'h3' }, t('exercise.variants')),
    h('div', { class: 'list' }, ...variants.map(([k, vid]) => h('button', { class: 'item', onClick: () => router.go('exercise', { id: vid }) },
      h('div', { class: 'grow' }, h('div', { class: 's' }, t('exercise.' + k)), h('div', { class: 't' }, exName(vid))), icon('chev-r', 18))))));

  body.append(h('div', { class: 'block' }, h('p', { class: 'small', style: { color: 'var(--text3)' } }, t('exercise.disclaimer'))));
  body.append(h('div', { class: 'sticky-cta' }, h('button', { class: 'btn', onClick: () => startPlan(planForExercise(id)) }, icon('play'), t('exercise.try'))));
  el.append(body);
  return { el };
}
