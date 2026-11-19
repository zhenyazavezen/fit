import { h, icon, uid } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { D, exName, exText, resolved } from '../data.js';
import { customPrograms } from '../store.js';
import { doseLabel } from '../format.js';
import { topbar, sheet, stepper, segmented, confirmDialog, toast } from '../ui.js';
import { sortByName, filterExercises, emptyFilter } from '../catalog.js';

export default function builder({ id } = {}) {
  const existing = id ? customPrograms.get(id) : null;
  const st = { name: existing?.name || '', rest: existing?.restBetween ?? 30, items: existing ? existing.items.map((i) => ({ ...i })) : [] };
  let dirty = false, off = null;
  const touch = () => { dirty = true; renderItems(); validate(); };

  const nameInput = h('input', { class: 'input', id: 'prog-name', type: 'text', maxlength: '40', value: st.name, placeholder: t('builder.namePlaceholder'), 'aria-label': t('builder.name') });
  nameInput.addEventListener('input', () => { st.name = nameInput.value; dirty = true; validate(); });
  const itemsBox = h('div'), hint = h('p', { class: 'small muted' }, t('builder.hint'));
  const saveBtn = h('button', { class: 'btn', type: 'button', onClick: save }, t('builder.save'));

  function validate() { const ok = st.name.trim().length > 0 && st.items.length > 0; saveBtn.disabled = !ok; hint.hidden = ok; }

  function renderItems() {
    itemsBox.replaceChildren();
    if (!st.items.length) { itemsBox.append(h('p', { class: 'muted small' }, t('builder.itemsEmpty'))); return; }
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
        : row(t('builder.seconds'), stepper({ value: secs, min: 5, max: 600, step: 5, onChange: (v) => { secs = v; }, label: t('builder.seconds') })));
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

  function pick() {
    let q = '', added = 0;
    const input = h('input', { class: 'input', id: 'pick-q', type: 'search', placeholder: t('catalog.search'), 'aria-label': t('catalog.search') });
    const list = h('div', { class: 'list' }), counter = h('div', { class: 'small muted' });
    const draw = () => {
      const f = { ...emptyFilter(), q };
      const items = sortByName(filterExercises(D.exercises, D.content.exercises, f), D.content.exercises);
      list.replaceChildren(...items.map((ex) => h('button', { class: 'item', onClick: () => {
        const d = ex.defaults; st.items.push(d.seconds && ex.mode === 'time' ? { ex: ex.id, sets: d.sets, seconds: d.seconds } : { ex: ex.id, sets: d.sets, reps: d.reps });
        added++; counter.textContent = t('builder.picked', { n: added }); touch();
      } }, h('div', { class: 'grow' }, h('div', { class: 't' }, exText(ex.id).name), h('div', { class: 's' }, t('level.' + ex.level))), icon('plus', 20))));
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
      row(t('builder.rest'), stepper({ value: st.rest, min: 0, max: 180, step: 5, onChange: (v) => { st.rest = v; dirty = true; renderItems(); }, label: t('builder.rest') })),
      h('h2', { class: 'h3' }, t('builder.items')), itemsBox,
      h('button', { class: 'btn secondary', onClick: pick }, icon('plus'), t('builder.add')),
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
