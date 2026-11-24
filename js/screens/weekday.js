// Один день расписания: весь список упражнений, правка прямо здесь, всё сохраняется сразу.
import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import { weekPlan } from '../store.js';
import { D, weekItems, exName, resolved, allPrograms, progText, getProgram, planForProgram, programEstimate } from '../data.js';
import { doseLabel, durationLabel } from '../format.js';
import { history } from '../store.js';
import { topbar, sheet, confirmDialog } from '../ui.js';
import { editItem, pickExercises } from '../itemedit.js';
import { startPlan } from '../start.js';

export default function weekday({ wd }) {
  wd = +wd || 1;
  let items = weekItems(wd);
  const rest = () => weekPlan.get(wd) === 'rest';
  const content = h('div', { class: 'stack' }), cta = h('div', { class: 'sticky-cta' }), body = h('div', { class: 'pad stack' }, content, cta);
  const save = (next) => { items = next; weekPlan.saveItems(wd, items); draw(); };
  const swap = (a, b) => { const n = [...items]; [n[a], n[b]] = [n[b], n[a]]; save(n); };

  function fromProgram() {
    const mk = (p) => h('button', { class: 'item', onClick: () => { s.close(); save([...items, ...p.items.filter((i) => D.exById.has(i.ex)).map((i) => ({ ...i }))]); } },
      h('div', { class: 'grow' }, h('div', { class: 't' }, progText(p).name), h('div', { class: 's' }, durationLabel(programEstimate(p)))));
    const progs = allPrograms();
    const s = sheet({ title: t('week.pickProg'), body: [h('div', { class: 'list' }, ...progs.filter((p) => p.custom).map(mk), ...progs.filter((p) => !p.custom).map(mk))] });
  }

  // что делал в прошлый раз (из истории тренировок)
  const lastOf = (ex) => {
    const hist = history.all();
    for (let i = hist.length - 1; i >= 0; i--) { const l = hist[i].log?.find((x) => x.ex === ex); if (l) return h('div', { class: 's' }, t('dose.last', { dose: doseLabel({ kind: l.seconds != null ? 'timed' : 'reps', ...l }) })); }
    return null;
  };

  function draw() {
    const r = rest();
    content.replaceChildren(
      r ? h('p', { class: 'muted' }, t('week.restText')) : null,
      items.length ? h('div', { class: 'list' }, ...items.map((it, i) => h('div', { class: 'item' },
        h('div', { class: 'lead' }, String(i + 1)),
        h('button', { class: 'grow', style: { textAlign: 'left' }, onClick: () => editItem(it, 30, (next) => { const n = [...items]; n[i] = next; save(n); }) },
          h('div', { class: 't' }, exName(it.ex)), h('div', { class: 's' }, doseLabel(resolved(it, 30)) + (it.rest ? ' · ' + t('dose.restOf', { sec: it.rest }) : '')), lastOf(it.ex)),
        h('div', { class: 'mini' },
          h('button', { class: 'icon-btn', 'aria-label': t('builder.up'), disabled: i === 0, onClick: () => swap(i, i - 1) }, icon('up')),
          h('button', { class: 'icon-btn', 'aria-label': t('builder.down'), disabled: i === items.length - 1, onClick: () => swap(i, i + 1) }, icon('down')),
          h('button', { class: 'icon-btn', 'aria-label': t('builder.remove'), onClick: () => save(items.filter((_, k) => k !== i)) }, icon('trash')))))) : null,
      h('button', { class: 'btn secondary', onClick: () => pickExercises({ onAdd: (it) => { items = [...items, it]; weekPlan.saveItems(wd, items); draw(); }, onRemoved: (id) => save(items.filter((i) => i.ex !== id)) }) }, icon('plus'), t('week.addEx')),
      h('button', { class: 'btn secondary', onClick: fromProgram }, icon('workouts'), t('week.fromProg')),
      r ? null : h('button', { class: 'link-btn', onClick: async () => {
        if (items.length && !(await confirmDialog({ title: t('week.restTitle'), text: t('week.restConfirm'), confirm: t('week.makeRest'), danger: true }))) return;
        weekPlan.setRest(wd); items = []; draw();
      } }, t('week.makeRest')));
    cta.replaceChildren(items.length ? h('button', { class: 'btn', onClick: () => startPlan(planForProgram(getProgram('wk' + wd))) }, icon('play'), t('week.startDay')) : null);
    cta.hidden = !items.length;
  }
  draw();
  return { el: h('div', null, topbar({ title: t('dayfull.' + (wd - 1)) }), body, cta) };
}
