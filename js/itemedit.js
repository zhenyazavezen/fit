// Общие окна для списков упражнений: правка подходов/повторений/времени, выбор упражнения, своё упражнение.
// Используются конструктором тренировки и расписанием по дням.
import { h, icon, uid } from './util.js';
import { t } from './i18n.js';
import { D, exName, exText, resolved, applyCustomEx } from './data.js';
import { customPrograms, customEx } from './store.js';
import { sheet, stepper, segmented, confirmDialog, toast, chip } from './ui.js';
import { sortByName, filterExercises, emptyFilter } from './catalog.js';

const row = (label, control) => h('div', { class: 'row-flex', style: { justifyContent: 'space-between' } }, h('div', { class: 'h3' }, label), control);

export function itemFromEx(ex) {
  const d = ex.defaults;
  return d.seconds && ex.mode === 'time' ? { ex: ex.id, sets: d.sets, seconds: d.seconds } : { ex: ex.id, sets: d.sets, reps: d.reps };
}

/** Окно правки одного упражнения. onSave(новыйЭлемент). */
export function editItem(it, rest, onSave) {
  const ex = D.exById.get(it.ex), r = resolved(it, rest);
  let kind = r.kind, sets = r.sets, reps = r.reps ?? ex.defaults.reps ?? 10, secs = r.seconds ?? ex.defaults.seconds ?? 30;
  const valBox = h('div');
  const drawVal = () => {
    valBox.replaceChildren(kind === 'reps'
      ? row(t('builder.reps'), stepper({ value: reps, min: 1, max: 100, onChange: (v) => { reps = v; }, label: t('builder.reps') }))
      : row(t('builder.seconds'), stepper({ value: secs, min: 1, max: 600, step: 1, onChange: (v) => { secs = v; }, label: t('builder.seconds') })));
  };
  drawVal();
  const s = sheet({
    title: exName(it.ex),
    body: [
      row(t('builder.sets'), stepper({ value: sets, min: 1, max: 10, onChange: (v) => { sets = v; }, label: t('builder.sets') })),
      h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, t('builder.type')),
        segmented([{ value: 'reps', label: t('builder.reps') }, { value: 'timed', label: t('builder.seconds') }], kind, (v) => { kind = v; drawVal(); })),
      valBox],
    foot: [h('button', { class: 'btn', onClick: () => {
      const next = { ex: it.ex, sets }; if (kind === 'reps') next.reps = reps; else next.seconds = secs;
      s.close(); onSave(next);
    } }, t('common.done'))],
  });
}

/** Окно «Создать своё упражнение». done(запись). */
export function newExercise(done) {
  let mode = 'reps', cat = 'fullbody';
  const name = h('input', { class: 'input', type: 'text', maxlength: '40', placeholder: t('myex.namePh'), 'aria-label': t('myex.name') });
  const note = h('textarea', { class: 'input note-area', maxlength: '300', rows: '3', placeholder: t('myex.notePh'), 'aria-label': t('myex.note') });
  const cats = h('div', { class: 'chips wrap' });
  const drawCats = () => cats.replaceChildren(...D.meta.categories.map((c) => chip({ label: t('cat.' + c), pressed: cat === c, onClick: () => { cat = c; drawCats(); } })));
  drawCats();
  const s = sheet({
    title: t('myex.new'),
    body: [h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, t('myex.name')), name),
      h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, t('builder.type')), segmented([{ value: 'reps', label: t('builder.reps') }, { value: 'time', label: t('builder.seconds') }], mode, (v) => { mode = v; })),
      h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, t('myex.group')), cats),
      h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, t('myex.note')), note)],
    foot: [h('button', { class: 'btn', onClick: () => {
      const nm = name.value.trim(); if (!nm) { name.focus(); return; }
      const rec = { id: 'x_' + uid(), name: nm, mode, cat, note: note.value.trim() };
      if (!customEx.save(rec)) { toast(t('builder.saveFailed')); return; }
      applyCustomEx(); s.close(); toast(t('myex.saved')); done(rec);
    } }, t('myex.save'))],
  });
}

/** Окно выбора упражнений (можно добавить несколько). onAdd(элемент); onRemoved(id) — когда удалено своё упражнение. */
export function pickExercises({ onAdd, onRemoved }) {
  let q = '', added = 0;
  const input = h('input', { class: 'input', id: 'pick-q', type: 'search', placeholder: t('catalog.search'), 'aria-label': t('catalog.search') });
  const list = h('div', { class: 'list' }), counter = h('div', { class: 'small muted' });
  const addEx = (ex) => { added++; counter.textContent = t('builder.picked', { n: added }); onAdd(itemFromEx(ex)); };
  const draw = () => {
    const f = { ...emptyFilter(), q };
    const pool = [...[...D.exById.values()].filter((e) => e.custom), ...D.exercises];
    const items = sortByName(filterExercises(pool, D.content.exercises, f), D.content.exercises);
    list.replaceChildren(...items.map((ex) => {
      const body = h('div', { class: 'grow' }, h('div', { class: 't' }, exText(ex.id).name), h('div', { class: 's' }, ex.custom ? t('myex.mine') : t('level.' + ex.level)));
      if (!ex.custom) return h('button', { class: 'item', onClick: () => addEx(ex) }, body, icon('plus', 20));
      return h('div', { class: 'item' }, h('button', { class: 'row-flex grow', style: { textAlign: 'left', gap: '12px' }, onClick: () => addEx(ex) }, body, icon('plus', 20)),
        h('button', { class: 'icon-btn', 'aria-label': t('myex.delete'), onClick: async () => {
          if (!(await confirmDialog({ title: t('myex.delTitle'), text: t('myex.delText'), confirm: t('myex.delete'), danger: true }))) return;
          customEx.remove(ex.id);
          for (const p of customPrograms.all()) if (p.items.some((i) => i.ex === ex.id)) customPrograms.save({ ...p, items: p.items.filter((i) => i.ex !== ex.id) });
          applyCustomEx(); onRemoved?.(ex.id); draw();
        } }, icon('trash', 18)));
    }));
  };
  input.addEventListener('input', () => { q = input.value; draw(); });
  draw();
  const s = sheet({ title: t('builder.pick'), body: [input, counter, list], foot: [h('button', { class: 'btn', onClick: () => s.close() }, t('common.done'))] });
}
