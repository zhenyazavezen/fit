import { h, icon } from '../util.js';
import { t, getLang } from '../i18n.js';
import * as router from '../router.js';
import { allPrograms, getProgram, progText, programEstimate, exName, resolved } from '../data.js';
import { doseLabel } from '../format.js';
import { durationLabel } from '../format.js';
import { empty, confirmDialog, toast } from '../ui.js';
import { customPrograms } from '../store.js';
import { userProfile } from '../profile-data.js';

// Простая система: программы по уровням + растяжка. Только вес тела, без оборудования.
export function programCard(p) {
  const text = progText(p), est = programEstimate(p);
  return h('button', { class: 'pcard-wide', onClick: () => router.go('program', { id: p.id }) },
    h('div', { class: 'top' }, h('div', { class: 't' }, text.name)),
    h('div', { class: 'row-flex small muted', style: { fontWeight: 600, gap: '16px' } },
      h('span', { class: 'row-flex', style: { gap: '6px' } }, icon('clock', 16), durationLabel({ ...est, exact: false })),
      h('span', null, t('n.exercises', { n: p.items.length }))));
}

// Своя тренировка: название, дата • число упражнений, первые три упражнения, справа — изменить и удалить.
function mineCard(p) {
  const rows = p.items.slice(0, 3).map((it, i, a) => `${exName(it.ex)} – ${doseLabel(resolved(it, p.restBetween))}` + (i === a.length - 1 && p.items.length > 3 ? '…' : ''));
  const date = p.at ? (() => { const d = new Date(p.at), l = getLang(); return `${d.getDate()} ${d.toLocaleDateString(l, { month: 'short' })} ${d.getFullYear()}`; })() : '';
  const meta = date ? t('workouts.mineDate', { date, n: p.items.length }) : t('n.exercises', { n: p.items.length });
  return h('div', { class: 'mine-card' },
    h('button', { class: 'mine-main', type: 'button', onClick: () => router.go('program', { id: p.id }) },
      h('div', { class: 'h3' }, p.name), h('div', { class: 'small muted' }, meta), h('div', { class: 'mine-rows small muted' }, ...rows.map((x) => h('div', null, x)))),
    h('div', { class: 'mine-act' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.edit'), onClick: () => router.go('builder', { id: p.id }) }, icon('edit', 20)),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.delete'), onClick: async () => {
        if (await confirmDialog({ title: t('program.deleteTitle'), text: t('program.deleteText', { name: p.name }), confirm: t('common.delete'), danger: true })) { customPrograms.remove(p.id); toast(t('program.deleted')); router.refresh(); }
      } }, icon('trash', 20))));
}

export default function workouts() {
  const el = h('div', { class: 'pad stack' });
  const all = allPrograms(), mine = all.filter((p) => p.custom), ready = all.filter((p) => !p.custom);
  const recovery = ready.filter((p) => p.id.startsWith('r'));
  const prof = userProfile.get();
  const section = (title, list) => (list.length ? h('section', { class: 'stack', style: { gap: 'var(--sp-3)' } }, h('h2', { class: 'h3' }, title), ...list.map(programCard)) : null);
  el.append(h('div', null, h('h1', { class: 'h1 page-title', style: { paddingBottom: '4px' } }, t('workouts.title')), h('p', { class: 'small muted' }, t('workouts.sub'))),
    h('div', { class: 'card stack', style: { gap: '0', padding: '4px 6px' } },
      h('button', { class: 'level-plate plan-plate', type: 'button', onClick: () => router.go('plan') }, icon('profile'),
        h('div', { class: 'grow stack', style: { gap: '2px', textAlign: 'left' } }, h('div', { class: 'h3' }, t('plan.title')),
          h('div', { class: 'small muted' }, t('workouts.planHint', { level: t('level.' + prof.level) }))), icon('chev-r', 18)),
      h('div', { style: { height: '1px', background: 'var(--line, rgba(255,255,255,.08))', margin: '0 14px' } }),
      h('button', { class: 'link-btn row-flex', style: { gap: '8px', padding: '4px 14px' }, type: 'button', onClick: () => router.go('builder', {}) }, icon('plus', 16), t('workouts.create'))),
    ...(mine.length ? [h('h2', { class: 'h3 group-title', style: { margin: '8px 0 0' } }, t('workouts.mineTitle')), ...mine.map(mineCard)] : []),
    section(t('workouts.sec.recovery'), recovery));
  if (!all.length) el.append(empty({ title: t('workouts.empty') }));
  return { el };
}
