import { h, icon, uid } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { D, exName, exText, resolved, applyCustomEx } from '../data.js';
import { customPrograms, customEx } from '../store.js';
import { doseLabel } from '../format.js';
import { topbar, sheet, stepper, segmented, confirmDialog, toast, chip, badge } from '../ui.js';
import { sortByName, filterExercises, emptyFilter } from '../catalog.js';

export default function builder({ id } = {}) {
  const existing = id ? customPrograms.get(id) : null;
  const st = { name: existing?.name || '', rest: Math.max(1, existing?.restBetween ?? 30), items: existing ? existing.items.filter((i) => D.exById.has(i.ex)).map((i) => ({ ...i })) : [] };
  let dirty = false, off = null;
  const touch = () => { dirty = true; renderItems(); validate(); };

  const nameInput = h('input', { class: 'input', id: 'prog-name', type: 'text', maxlength: '40', value: st.name, placeholder: t('builder.namePlaceholder'), 'aria-label': t('builder.name') });
  nameInput.addEventListener('input', () => { st.name = nameInput.value; dirty = true; validate(); });
  const itemsBox = h('div'), hint = h('p', { class: 'small muted' }, t('builder.hint'));
  const saveBtn = h('button', { class: 'btn', type: 'button', onClick: save }, t('builder.save'));

  function validate() { const ok = st.name.trim().length >= 2 && st.items.length > 0; saveBtn.disabled = !ok; hint.hidden = ok; }

  function renderItems() {
    itemsBox.replaceChildren();
    if (!st.items.length) return;
    itemsBox.append(h('div', { class: 'list' }, ...st.items.map((it, i) => {
      const r = resolved(it, st.rest);
      return h('div', { class: 'item' },
        h('div', { class: 'lead' }, String(i + 1)),
        h('button', { class: 'grow', style: { textAlign: 'left' }, onClick: () => editItem(i) }, h('div', { class: 't' }, exName(it.ex)), h('div', { class: 's' }, doseLabel(r))),
        h('div', { class: 'mini' },
          h('button', { class: 'icon-btn', 'aria-label': t('builder.up'), disabled: i === 0, onClick: () => { swap(i, i - 1); } }, icon('up')),
          h('button', { class: 'icon-btn', 'aria-label': t('builder.down'), disabled: i === st.items.length - 1, onClick: () => { swap(i, i + 1); } }, icon('down')),
          h('button', { class: 'icon-btn', 'aria-label': t('builder.remove'), onClick: () => { st.items.splice(i, 1); touch(); } }, icon('trash'))));
    })));
  }
  const swap = (a, b) => { [st.items[a], st.items[b]] = [st.items[b], st.items[a]]; touch(); };

  function editItem(i) {
    const it = st.items[i], ex = D.exById.get(it.ex), r = resolved(it, st.rest);
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
        st.items[i] = next; s.close(); touch();
      } }, t('common.done'))],
    });
  }
  const row = (label, control) => h('div', { class: 'row-flex', style: { justifyContent: 'space-between' } }, h('div', { class: 'h3' }, label), control);

  function newExercise(done) {
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

  const addById = (ex) => {
    const d = ex.defaults; st.items.push(d.seconds && ex.mode === 'time' ? { ex: ex.id, sets: d.sets, seconds: d.seconds } : { ex: ex.id, sets: d.sets, reps: d.reps });
    touch();
  };

  function pick() {
    let q = '', added = 0;
    const input = h('input', { class: 'input', id: 'pick-q', type: 'search', placeholder: t('catalog.search'), 'aria-label': t('catalog.search') });
    const list = h('div', { class: 'list' }), counter = h('div', { class: 'small muted' });
    const addEx = (ex) => {
      const d = ex.defaults; st.items.push(d.seconds && ex.mode === 'time' ? { ex: ex.id, sets: d.sets, seconds: d.seconds } : { ex: ex.id, sets: d.sets, reps: d.reps });
      added++; counter.textContent = t('builder.picked', { n: added }); touch();
    };
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
            st.items = st.items.filter((i) => i.ex !== ex.id); applyCustomEx(); renderItems(); validate(); draw();
          } }, icon('trash', 18)));
      }));
    };
    input.addEventListener('input', () => { q = input.value; draw(); });
    draw();
    const s = sheet({ title: t('builder.pick'), body: [input, counter, list], foot: [h('button', { class: 'btn', onClick: () => s.close() }, t('common.done'))] });
  }

  async function save() {
    if (saveBtn.disabled) return;
    const rec = { id: existing?.id || 'u_' + uid(), name: st.name.trim(), restBetween: st.rest, items: st.items, custom: true };
    if (!customPrograms.save(rec)) { toast(t('builder.saveFailed')); return; }
    dirty = false; toast(t('builder.saved'));
    if (existing) router.back(); else router.go('program', { id: rec.id }, { replace: true });
  }

  const el = h('div');
  el.append(topbar({ title: existing ? t('builder.edit') : t('builder.new') }),
    h('div', { class: 'pad stack' },
      h('div', null, h('label', { class: 'eyebrow', for: 'prog-name', style: { display: 'block', marginBottom: '8px' } }, t('builder.name')), nameInput),
      row(t('builder.rest'), stepper({ value: st.rest, min: 1, max: 180, step: 1, onChange: (v) => { st.rest = v; dirty = true; renderItems(); }, label: t('builder.rest') })),
      h('h2', { class: 'h3' }, t('builder.items')),
      h('button', { class: 'btn secondary', onClick: () => newExercise((rec) => addById(D.exById.get(rec.id))) }, icon('plus'), t('builder.createEx')),
      h('button', { class: 'btn secondary', onClick: pick }, icon('plus'), t('builder.add')),
      itemsBox,
      hint, saveBtn));
  renderItems(); validate();

  return {
    el,
    onShow() {
      off = router.onBack(async () => {
        if (!dirty) { off?.(); off = null; router.back(); return; }
        const leave = await confirmDialog({ title: t('builder.leaveTitle'), text: t('builder.leaveText'), confirm: t('builder.leave'), cancel: t('builder.stay'), danger: true });
        if (leave) { off?.(); off = null; router.back(); }
      });
    },
    destroy() { off?.(); off = null; },
  };
}
