import { h, icon, debounce } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { D, exText } from '../data.js';
import { favorites } from '../store.js';
import { emptyFilter, filterExercises, sortByName, activeCount, isEmpty } from '../catalog.js';
import { resolveItem } from '../engine.js';
import { doseLabel } from '../format.js';
import { chip, sheet, empty } from '../ui.js';

const F = emptyFilter();             // фильтры сохраняются, пока открыто приложение

const exerciseRow = (ex, { showFav = true } = {}) => {
  const c = exText(ex.id);
  const muscles = ex.muscles.primary.slice(0, 2).map((m) => t('muscle.' + m)).join(', ');
  return h('button', { class: 'item', onClick: () => router.go('exercise', { id: ex.id }) },
    h('div', { class: 'grow' }, h('div', { class: 't' }, c.name), h('div', { class: 's' }, `${muscles} · ${t('level.' + ex.level)}`)),
    h('div', { class: 'end' }, showFav && favorites.has(ex.id) ? icon('heart', 16, true) : null, doseLabel(resolveItem({}, ex), { withSides: false })),
    icon('chev-r', 18));
};

export default function catalog(params = {}) {
  if (params.favs) { F.favsOnly = true; }
  const el = h('div', { class: 'pad' });
  const input = h('input', { class: 'input', id: 'cat-q', type: 'search', autocomplete: 'off', enterkeyhint: 'search', placeholder: t('catalog.search'), 'aria-label': t('catalog.search'), value: F.q });
  const clear = h('button', { class: 'icon-btn clear', 'aria-label': t('catalog.clearSearch'), type: 'button', hidden: !F.q, onClick: () => { F.q = ''; input.value = ''; clear.hidden = true; draw(); input.focus(); } }, icon('x', 18));
  const chipsBox = h('div', { class: 'chips' });
  const count = h('div', { class: 'count', 'aria-live': 'polite' });
  const list = h('div');

  const filtered = () => filterExercises(D.exercises, D.content.exercises, F, new Set(favorites.all()));

  function drawChips() {
    const n = activeCount(F) - (F.favsOnly ? 1 : 0);
    chipsBox.replaceChildren(
      chip({ label: t('catalog.filters') + (n ? ` · ${n}` : ''), pressed: n > 0, iconName: 'filter', onClick: openFilters }),
      chip({ label: t('catalog.favorites'), pressed: F.favsOnly, iconName: 'heart', onClick: () => { F.favsOnly = !F.favsOnly; drawChips(); draw(); } }),
      chip({ label: t('common.all'), pressed: !F.cats.size, onClick: () => { F.cats.clear(); drawChips(); draw(); } }),
      ...D.meta.categories.map((c) => chip({ label: t('cat.' + c), pressed: F.cats.has(c), onClick: () => { F.cats.has(c) ? F.cats.delete(c) : F.cats.add(c); drawChips(); draw(); } })));
  }

  function draw() {
    const res = sortByName(filtered(), D.content.exercises);
    count.textContent = t('catalog.found', { n: res.length });
    if (!res.length) {
      list.replaceChildren(empty({ icon: 'search', title: t('catalog.emptyTitle'), text: F.favsOnly && !favorites.all().length ? t('catalog.emptyFavs') : t('catalog.emptyText'),
        action: isEmpty(F) ? null : h('button', { class: 'btn ghost small', onClick: () => { Object.assign(F, emptyFilter()); input.value = ''; clear.hidden = true; drawChips(); draw(); } }, t('catalog.resetAll')) }));
      return;
    }
    list.replaceChildren(h('div', { class: 'list' }, ...res.map((ex) => exerciseRow(ex))));
  }

  function openFilters() {
    const draft = { levels: new Set(F.levels), equip: new Set(F.equip), modes: new Set(F.modes), muscles: new Set(F.muscles) };
    const showBtn = h('button', { class: 'btn' });
    const preview = () => filterExercises(D.exercises, D.content.exercises, { ...F, ...draft }, new Set(favorites.all())).length;
    const upd = () => { showBtn.textContent = t('catalog.show', { n: preview() }); };
    const group = (title, key, values, labelOf) => h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '10px' } }, title),
      h('div', { class: 'chips wrap' }, ...values.map((v) => chip({ label: labelOf(v), pressed: draft[key].has(v), onClick: (b) => { draft[key].has(v) ? draft[key].delete(v) : draft[key].add(v); b.setAttribute('aria-pressed', String(draft[key].has(v))); upd(); } }))));
    const s = sheet({
      title: t('catalog.filters'),
      body: [group(t('catalog.level'), 'levels', D.meta.levels, (v) => t('level.' + v)),
        group(t('catalog.type'), 'modes', ['reps', 'time'], (v) => t('mode.' + v)),
        group(t('catalog.muscles'), 'muscles', D.meta.muscles, (v) => t('muscle.' + v))],
      foot: [h('button', { class: 'btn ghost', onClick: () => { for (const k of Object.keys(draft)) draft[k].clear(); s.root.querySelectorAll('[aria-pressed="true"]').forEach((b) => b.setAttribute('aria-pressed', 'false')); upd(); } }, t('common.reset')), showBtn],
    });
    showBtn.addEventListener('click', () => { Object.assign(F, draft); s.close(); drawChips(); draw(); });
    upd();
  }

  input.addEventListener('input', debounce(() => { F.q = input.value; clear.hidden = !F.q; draw(); }, 120));
  input.addEventListener('input', () => { clear.hidden = !input.value; });
  el.append(h('div', { class: 'catalog-head' }, h('h1', { class: 'h1 page-title' }, t('catalog.title')),
    h('div', { class: 'search' }, icon('search'), input, clear), h('div', { style: { height: '12px' } }), chipsBox), count, list);
  drawChips(); draw();
  return { el };
}
