// Программы одного уровня: Начальный / Средний / Продвинутый.
import { h } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { allPrograms } from '../data.js';
import { topbar, empty } from '../ui.js';
import { userProfile } from '../profile-data.js';
import { programCard } from './workouts.js';

export default function level({ level: lv = 'beginner' } = {}) {
  const list = allPrograms().filter((p) => !p.custom && p.level === lv && !p.id.startsWith('r'));
  const el = h('div'), body = h('div', { class: 'pad stack' });
  body.append(h('p', { class: 'muted' }, t('level.desc.' + lv)),
    ...(list.length ? list.map(programCard) : [empty({ title: t('workouts.empty') })]),
    userProfile.get().level === lv ? h('div', { class: 'badge', style: { alignSelf: 'flex-start' } }, t('workouts.yourLevel'))
      : h('button', { class: 'btn secondary', onClick: (e) => { userProfile.set({ level: lv }); e.currentTarget.replaceWith(h('div', { class: 'badge', style: { alignSelf: 'flex-start' } }, t('workouts.yourLevel'))); } }, t('level.makeMine')),
    h('button', { class: 'link-btn', onClick: () => router.go('plan') }, t('workouts.fillPlan')));
  el.append(topbar({ title: t('level.' + lv) }), body);
  return { el };
}
