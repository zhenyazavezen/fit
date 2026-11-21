// Нижняя панель: порядок и видимость вкладок, свои вкладки. Долгое нажатие на вкладку открывает настройку.
import { h, icon, uid } from './util.js';
import { t } from './i18n.js';
import * as router from './router.js';
import { tabsCfg, pages, store } from './store.js';
import { sheet, toggle, confirmDialog, toast } from './ui.js';
import { dragSort } from './dragsort.js';

export const BUILTIN = ['home', 'workouts', 'catalog', 'progress', 'profile'];
export const MAX_VISIBLE = 6, MAX_CUSTOM = 5;

/** Итоговый список вкладок: порядок (с новыми в конце), скрытые, видимые. «Профиль» скрыть нельзя — там настройки. */
export function resolveTabs(cfg = tabsCfg.get()) {
  const all = [...BUILTIN, ...cfg.custom.map((c) => c.id)];
  const order = [...cfg.order.filter((id) => all.includes(id)), ...all.filter((id) => !cfg.order.includes(id))];
  const hidden = new Set(cfg.hidden.filter((id) => all.includes(id) && id !== 'profile'));
  let visible = order.filter((id) => !hidden.has(id)).slice(0, MAX_VISIBLE);
  if (!visible.includes('profile')) visible = [...visible.slice(0, MAX_VISIBLE - 1), 'profile'];
  return { order, hidden, visible, custom: cfg.custom };
}

const nameOf = (id, custom) => (id.startsWith('c_') ? custom.find((c) => c.id === id)?.name || '' : t('tab.' + id));

let bar = null;
export function renderTabbar() {
  if (!bar) return;
  const { visible, custom } = resolveTabs();
  bar.replaceChildren(...visible.map((id) => {
    const c = custom.find((x) => x.id === id);
    const glyph = c ? h('i', { class: 'tab-emoji' }, c.emoji || (c.name[0] || '•').toUpperCase()) : icon(id);
    return h('button', { dataset: { tab: id }, type: 'button' }, glyph, h('span', null, nameOf(id, custom)));
  }));
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

function save(patch) { const c = tabsCfg.get(); tabsCfg.set({ ...c, ...patch }); }

export function openTabsEditor() {
  const list = h('div', { class: 'list' });
  const s = sheet({ title: t('tabs.title'), body: [h('p', { class: 'small muted' }, t('tabs.hint')), list] });
  const foot = h('div', { class: 'stack', style: { gap: '10px' } });
  s.body.append(foot);

  function draw() {
    const cfg = tabsCfg.get(), r = resolveTabs(cfg);
    const vis = r.visible.length;
    list.replaceChildren(...r.order.map((id) => {
      const isCustom = id.startsWith('c_'), on = !r.hidden.has(id) && r.visible.includes(id);
      const tg = toggle(on, (v) => {
        if (v && vis >= MAX_VISIBLE) { toast(t('tabs.max', { n: MAX_VISIBLE })); draw(); return; }
        const hidden = new Set(r.hidden); if (v) hidden.delete(id); else hidden.add(id);
        save({ order: r.order, hidden: [...hidden] }); draw();
      }, nameOf(id, r.custom));
      if (id === 'profile') tg.setAttribute('aria-disabled', 'true');
      return h('div', { class: 'item' },
        h('div', { class: 'grow' }, h('div', { class: 't' }, nameOf(id, r.custom)), isCustom ? h('div', { class: 's' }, t('tabs.mine')) : null),
        isCustom ? h('button', { class: 'icon-btn', 'aria-label': t('tabs.edit'), onClick: () => editCustom(id) }, icon('edit', 18)) : null,
        id === 'profile' ? h('span', { class: 'small muted', style: { minWidth: '52px', textAlign: 'center' } }, t('tabs.always')) : tg);
    }));
    foot.replaceChildren(
      r.custom.length < MAX_CUSTOM ? h('button', { class: 'btn', onClick: () => editCustom(null) }, icon('plus'), t('tabs.add')) : null,
      h('button', { class: 'btn secondary', onClick: () => { tabsCfg.set({ order: [], hidden: [], custom: cfg.custom }); draw(); } }, t('tabs.reset')));
  }

  function editCustom(id) {
    const cfg = tabsCfg.get(), cur = id ? cfg.custom.find((c) => c.id === id) : null;
    const name = h('input', { class: 'input', type: 'text', maxlength: '14', value: cur?.name || '', placeholder: t('tabs.namePh'), 'aria-label': t('tabs.name') });
    const emoji = h('input', { class: 'input', type: 'text', maxlength: '4', value: cur?.emoji || '', placeholder: '🔥', 'aria-label': t('tabs.emoji'), style: { width: '110px' } });
    const f = sheet({
      title: cur ? t('tabs.edit') : t('tabs.add'),
      body: [h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, t('tabs.name')), name),
        h('div', null, h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, t('tabs.emoji')), emoji),
        h('p', { class: 'small muted' }, t('tabs.pageHint'))],
      foot: [
        cur ? h('button', { class: 'btn secondary', onClick: async () => {
          if (!(await confirmDialog({ title: t('tabs.delTitle'), text: t('tabs.delText'), confirm: t('tabs.delete'), danger: true }))) return;
          const c = tabsCfg.get(); tabsCfg.set({ order: c.order.filter((x) => x !== id), hidden: c.hidden.filter((x) => x !== id), custom: c.custom.filter((x) => x.id !== id) });
          pages.remove(id); f.close(); draw();
          if (document.body.dataset.route === 'ctab') router.openTab('home');
        } }, t('tabs.delete')) : null,
        h('button', { class: 'btn', onClick: () => {
          const nm = name.value.trim(); if (!nm) { name.focus(); return; }
          const c = tabsCfg.get();
          if (cur) tabsCfg.set({ ...c, custom: c.custom.map((x) => (x.id === id ? { ...x, name: nm, emoji: emoji.value.trim() } : x)) });
          else {
            const nid = 'c_' + uid(), room = resolveTabs(c).visible.length < MAX_VISIBLE;
            tabsCfg.set({ order: [...resolveTabs(c).order, nid], hidden: room ? c.hidden : [...c.hidden, nid], custom: [...c.custom, { id: nid, name: nm, emoji: emoji.value.trim() }] });
            if (!room) toast(t('tabs.addedHidden'));
          }
          f.close(); draw();
        } }, t('common.done'))],
    });
  }
  draw();
}
