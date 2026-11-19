import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { getProgram, progText, programEstimate, planForProgram, resolved, exName } from '../data.js';
import { customPrograms } from '../store.js';
import { durationLabel, doseLabel } from '../format.js';
import { topbar, badge, noteBox, confirmDialog, toast } from '../ui.js';
import { startPlan } from '../start.js';

export default function program({ id }) {
  const p = getProgram(id);
  if (!p) { return { el: h('div', null, topbar(), h('div', { class: 'pad' }, h('p', { class: 'muted' }, t('program.notFound')))) }; }
  const text = progText(p), est = programEstimate(p);
  const el = h('div');
  const body = h('div', { class: 'pad stack' });
  el.append(topbar(), body);

  body.append(h('h1', { class: 'h1' }, text.name));
  if (!p.custom) body.append(h('div', { class: 'badges' }, p.access === 'premium' ? badge('Premium') : null, ...p.goals.map((g) => badge(t('goal.' + g)))));
  if (text.desc) body.append(h('p', { class: 'muted' }, text.desc));
  if (p.goals?.includes('weight')) body.append(noteBox(t('goal.weightNote')));
  body.append(h('div', { class: 'facts' },
    fact(durationLabel(est), t('program.duration')),
    fact(String(p.items.length), t('program.exercises')),
    fact(p.custom ? t('workouts.custom') : t('level.' + p.level), t('program.level'))));
  if (p.restBetween != null) body.append(h('p', { class: 'small muted' }, t('program.rest', { sec: p.restBetween })));

  body.append(h('h2', { class: 'h3', style: { marginTop: '12px' } }, t('program.order')));
  body.append(h('div', { class: 'list' }, ...p.items.map((it, i) => {
    const r = resolved(it, p.restBetween);
    return h('button', { class: 'item', onClick: () => router.go('exercise', { id: it.ex }) },
      h('div', { class: 'lead' }, String(i + 1)),
      h('div', { class: 'grow' }, h('div', { class: 't' }, exName(it.ex)), h('div', { class: 's' }, doseLabel(r))),
      icon('chev-r', 18));
  })));
  if (text.note) body.append(h('div', { class: 'block' }, h('h2', { class: 'h3' }, t('program.note')), h('p', { class: 'small muted' }, text.note)));

  if (p.custom) {
    body.append(h('div', { class: 'row-flex' },
      h('button', { class: 'btn ghost small', style: { flex: 1 }, onClick: () => router.go('builder', { id: p.id }) }, icon('edit', 18), t('common.edit')),
      h('button', { class: 'btn danger small', style: { flex: 1 }, onClick: async () => {
        if (await confirmDialog({ title: t('program.deleteTitle'), text: t('program.deleteText', { name: p.name }), confirm: t('common.delete'), danger: true })) {
          customPrograms.remove(p.id); toast(t('program.deleted')); router.back();
        }
      } }, icon('trash', 18), t('common.delete'))));
  }
  body.append(h('div', { class: 'sticky-cta' }, h('button', { class: 'btn', onClick: () => startPlan(planForProgram(p)) }, icon('play'), t('program.start'))));
  return { el };
}

const fact = (v, l) => h('div', { class: 'fact' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
