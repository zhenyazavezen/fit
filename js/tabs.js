// Нижняя панель: порядок (перетаскиванием), видимость, свои вкладки. Панель прокручивается влево — в конце кнопка «+».
import { h, icon, uid } from './util.js';
import { t } from './i18n.js';
import * as router from './router.js';
import { tabsCfg, pages, store } from './store.js';
import { sheet, toggle, confirmDialog } from './ui.js';
import { dragSort } from './dragsort.js';

export const BUILTIN = ['home', 'workouts', 'progress', 'compete', 'profile'];
export const TAB_ICONS = ['star', 'flame', 'drop', 'leaf', 'book', 'target', 'moon', 'sun', 'list', 'calendar', 'trophy', 'heart', 'bolt', 'clock'];

/** Итоговый список вкладок: порядок (новые в конце) и скрытые. «Профиль» скрыть нельзя — там настройки. */
export function resolveTabs(cfg = tabsCfg.get()) {
  const all = [...BUILTIN, ...cfg.custom.map((c) => c.id)];
  const order = [...cfg.order.filter((id) => all.includes(id)), ...all.filter((id) => !cfg.order.includes(id))];
  const hidden = new Set(cfg.hidden.filter((id) => all.includes(id) && id !== 'profile'));
  return { order, hidden, visible: order.filter((id) => !hidden.has(id)), custom: cfg.custom };
}

const nameOf = (id, custom) => (id.startsWith('c_') ? custom.find((c) => c.id === id)?.name || '' : t('tab.' + id));

let bar = null;
export function renderTabbar() {
  if (!bar) return;
  const { visible, custom } = resolveTabs();
  const items = visible.map((id) => {
    const c = custom.find((x) => x.id === id);
    const glyph = c ? (c.icon && TAB_ICONS.includes(c.icon) ? icon(c.icon) : h('i', { class: 'tab-emoji' }, (c.name[0] || '•').toUpperCase())) : icon(id);
    return h('button', { dataset: { tab: id }, type: 'button' }, glyph, h('span', null, nameOf(id, custom)));
  });
  bar.replaceChildren(...items);
  router.syncTabbar();
}

export function initTabbar(el) {
  bar = el;
  renderTabbar();
  dragSort(el, { itemSel: '[data-tab]', axis: 'x', onDrop: (visibleOrder) => {
    const cfg = tabsCfg.get(), r = resolveTabs(cfg), vis = new Set(r.visible);
    let k = 0;                                           // видимые места заполняем новым порядком, скрытые остаются на своих
    const order = r.order.map((id) => (vis.has(id) ? visibleOrder[k++] : id));
    tabsCfg.set({ ...cfg, order });
  } });
  store.onChange((_e, k) => { if (k === 'tabs') renderTabbar(); });
}

/** Правка и удаление своей вкладки (новые вкладки создать нельзя; те, что уже есть, остаются). */
export function editCustom(id, onDone = () => {}) {
  const cfg = tabsCfg.get(), cur = cfg.custom.find((c) => c.id === id);
  if (!cur) return;
  const name = h('input', { class: 'input', type: 'text', maxlength: '14', value: cur.name || '', placeholder: t('tabs.namePh'), 'aria-label': t('tabs.name') });
  let pick = TAB_ICONS.includes(cur.icon) ? cur.icon : 'star';
  const icons = h('div', { class: 'icon-grid' });
  const drawIcons = () => icons.replaceChildren(...TAB_ICONS.map((n) => h('button', { class: 'icon-pick', type: 'button', 'aria-label': n, 'aria-pressed': String(n === pick), onClick: () => { pick = n; drawIcons(); } }, icon(n, 22))));
  drawIcons();
  const f = sheet({
    title: t('tabs.edit'),
    body: [h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, t('tabs.name')), name),
      h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, t('tabs.icon')), icons)],
    foot: [
      h('button', { class: 'btn secondary', onClick: async () => {
        if (!(await confirmDialog({ title: t('tabs.delTitle'), text: t('tabs.delText'), confirm: t('tabs.delete'), danger: true }))) return;
        const c = tabsCfg.get(); tabsCfg.set({ ...c, order: c.order.filter((x) => x !== id), hidden: c.hidden.filter((x) => x !== id), custom: c.custom.filter((x) => x.id !== id) });
        pages.remove(id); f.close(); onDone();
        if (document.body.dataset.route === 'ctab') router.openTab('home');
      } }, t('tabs.delete')),
      h('button', { class: 'btn', onClick: () => {
        const nm = name.value.trim(); if (!nm) { name.focus(); return; }
        const c = tabsCfg.get();
        tabsCfg.set({ ...c, custom: c.custom.map((x) => (x.id === id ? { id: x.id, name: nm, icon: pick } : x)) });
        f.close(); onDone();
      } }, t('common.done'))],
  });
  setTimeout(() => name.focus(), 50);
}

/** Профиль → «Нижняя панель»: показать/скрыть вкладки, править и удалять свои. Порядок меняется перетаскиванием на самой панели. */
export function openTabsEditor() {
  const list = h('div', { class: 'list' });
  const s = sheet({ title: t('tabs.title'), body: [h('p', { class: 'small muted' }, t('tabs.hint')), list] });
  const foot = h('div', { class: 'stack', style: { gap: '10px' } });
  s.body.append(foot);
  function draw() {
    const cfg = tabsCfg.get(), r = resolveTabs(cfg);
    list.replaceChildren(...r.order.map((id) => {
      const isCustom = id.startsWith('c_'), on = r.visible.includes(id);
      const tg = toggle(on, (v) => {
        const hidden = new Set(r.hidden); if (v) hidden.delete(id); else hidden.add(id);
        tabsCfg.set({ ...cfg, order: r.order, hidden: [...hidden] }); draw();
      }, nameOf(id, r.custom));
      return h('div', { class: 'item' },
        h('div', { class: 'grow' }, h('div', { class: 't' }, nameOf(id, r.custom)), isCustom ? h('div', { class: 's' }, t('tabs.mine')) : null),
        isCustom ? h('button', { class: 'icon-btn', 'aria-label': t('tabs.edit'), onClick: () => editCustom(id, draw) }, icon('edit', 18)) : null,
        id === 'profile' ? h('span', { class: 'small muted', style: { minWidth: '52px', textAlign: 'center' } }, t('tabs.always')) : tg);
    }));
    foot.replaceChildren(h('button', { class: 'btn secondary', onClick: () => { tabsCfg.set({ ...cfg, order: [], hidden: [] }); draw(); } }, t('tabs.reset')));
  }
  draw();
}
