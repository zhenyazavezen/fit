import { h, icon, uid } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { D, exName, resolved } from '../data.js';
import { customPrograms } from '../store.js';
import { doseLabel } from '../format.js';
import { topbar, stepper, confirmDialog, toast } from '../ui.js';
import { editItem, newExercise, pickExercises, itemFromEx } from '../itemedit.js';

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
        h('button', { class: 'grow', style: { textAlign: 'left' }, onClick: () => editItem(st.items[i], st.rest, (next) => { st.items[i] = next; touch(); }) }, h('div', { class: 't' }, exName(it.ex)), h('div', { class: 's' }, doseLabel(r))),
        h('div', { class: 'mini' },
          h('button', { class: 'icon-btn', 'aria-label': t('builder.up'), disabled: i === 0, onClick: () => { swap(i, i - 1); } }, icon('up')),
          h('button', { class: 'icon-btn', 'aria-label': t('builder.down'), disabled: i === st.items.length - 1, onClick: () => { swap(i, i + 1); } }, icon('down')),
          h('button', { class: 'icon-btn', 'aria-label': t('builder.remove'), onClick: () => { st.items.splice(i, 1); touch(); } }, icon('trash'))));
    })));
  }
  const swap = (a, b) => { [st.items[a], st.items[b]] = [st.items[b], st.items[a]]; touch(); };

  const row = (label, control) => h('div', { class: 'row-flex', style: { justifyContent: 'space-between' } }, h('div', { class: 'h3' }, label), control);
  const pick = () => pickExercises({ onAdd: (it) => { st.items.push(it); touch(); }, onRemoved: (id) => { st.items = st.items.filter((i) => i.ex !== id); renderItems(); validate(); } });

  async function save() {
    if (saveBtn.disabled) return;
    const rec = { id: existing?.id || 'u_' + uid(), name: st.name.trim(), restBetween: st.rest, items: st.items, custom: true, at: existing?.at || Date.now() };
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
      h('button', { class: 'btn secondary', onClick: () => newExercise((rec) => { st.items.push(itemFromEx(D.exById.get(rec.id))); touch(); }) }, icon('plus'), t('builder.createEx')),
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
