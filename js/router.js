// Мини-роутер без изменения URL: хэш занят параметрами запуска Telegram (#tgWebAppData=…),
// поэтому состояние навигации хранится в памяти + history.state (работает системная кнопка «Назад»).
import { tg } from './tg.js';

const routes = new Map();            // name → { factory, tab, tabs }
const backHandlers = [];             // верхний обработчик «Назад» перехватывает навигацию (шторка, подтверждение выхода…)
let stack = [];                      // [{ name, params, scroll }]
let view = null;                     // { el, onShow, onHide, destroy }
let screenEl, tabbarEl;
let navToken = 0;
let navDir = 'fwd';                  // направление перехода для анимации: fwd | back | tab | none
let canPush = true;                 // в ограниченных окружениях (iframe) pushState может быть запрещён — тогда стек ведём сами
const pushState = (n) => { try { history.pushState({ n }, ''); return true; } catch { canPush = false; return false; } };
const replaceState = (n) => { try { history.replaceState({ n }, ''); } catch { /* ignore */ } };

export function register(name, factory, opts = {}) {
  routes.set(name, { factory, tab: opts.tab || null, tabs: opts.tabs !== false });
}

export function start({ screen, tabbar, initial }) {
  screenEl = screen; tabbarEl = tabbar;
  tabbar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b && !tabbar.dataset.hold) openTab(b.dataset.tab);
  });
  window.addEventListener('popstate', onPop);
  let day = new Date().toDateString();                       // приложение открыто с вечера: после полуночи обновить «сегодня»
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const d = new Date().toDateString();
    if (d !== day) { day = d; if (current() && current().name !== 'player') refresh(); }
  });
  replaceState(1);
  stack = []; navDir = 'tab';
  return show({ name: initial, params: {} }, [{ name: initial, params: {}, scroll: 0 }]);
}

const current = () => stack[stack.length - 1] || null;

/** Перейти на экран. replace — заменить текущий вместо добавления в стек. */
export function go(name, params = {}, { replace = false } = {}) {
  const top = current();
  if (!replace && top && top.name === name && JSON.stringify(top.params || {}) === JSON.stringify(params)) return;   // двойной тап: тот же экран уже открыт
  saveScroll(); navDir = 'fwd';
  const entry = { name, params, scroll: 0 };
  const next = replace ? [...stack.slice(0, -1), entry] : [...stack, entry];
  if (!replace) pushState(next.length);
  return show(entry, next);
}

export function openTab(key) {
  const custom = key.startsWith('c_');                       // свои вкладки: один экран «ctab» с параметром id
  const name = custom ? 'ctab' : key, params = custom ? { id: key } : {};
  if (stack.length === 1 && current()?.name === name && current()?.params?.id === params.id) { screenEl.scrollTo?.({ top: 0, behavior: 'smooth' }); return; }
  const entry = { name, params, scroll: 0 };
  replaceState(1); navDir = 'tab';
  return show(entry, [entry]);
}

/** Зарегистрировать обработчик «Назад» (например, закрыть шторку). Возвращает функцию снятия. */
export function onBack(fn) {
  backHandlers.push(fn);
  syncBackButton();
  return () => { const i = backHandlers.lastIndexOf(fn); if (i >= 0) backHandlers.splice(i, 1); syncBackButton(); };
}

export function back() {
  if (backHandlers.length) { backHandlers[backHandlers.length - 1](); return; }
  if (stack.length > 1) {
    if (canPush) { try { history.back(); return; } catch { canPush = false; } }
    const next = stack.slice(0, -1); navDir = 'back';
    show(next[next.length - 1], next, true);
  }
}

function onPop(e) {
  if (backHandlers.length) {                       // перехвачено: вернём запись истории и вызовем обработчик
    pushState(stack.length);
    backHandlers[backHandlers.length - 1]();
    return;
  }
  const n = e.state?.n ?? 1;
  if (n < stack.length) {
    const next = stack.slice(0, n); navDir = 'back';
    show(next[next.length - 1], next, true);
  }
}

function saveScroll() { const c = current(); if (c && screenEl) c.scroll = screenEl.scrollTop; }

async function show(entry, nextStack, restore = false) {
  const token = ++navToken;
  const def = routes.get(entry.name);
  if (!def) throw new Error('Неизвестный экран: ' + entry.name);
  try { view?.onHide?.(); view?.destroy?.(); } catch (e) { console.error(e); }
  stack = nextStack;
  let next;
  try { next = await def.factory(entry.params || {}); } catch (e) { console.error(e); next = errorView(e); }
  if (token !== navToken) { next.destroy?.(); return; }
  view = next;
  screenEl.replaceChildren(next.el);
  screenEl.classList.remove('enter', 'fwd', 'back', 'tab'); void screenEl.offsetWidth;
  if (navDir !== 'none') screenEl.classList.add('enter', navDir);
  navDir = 'fwd';
  screenEl.scrollTop = restore ? entry.scroll || 0 : 0;
  document.body.dataset.route = entry.name;
  tabbarEl.hidden = !def.tabs;
  syncTabbar();
  syncBackButton();
  try { next.onShow?.(); } catch (e) { console.error(e); }
}

/** Подсветить активную вкладку (вызывается и после перерисовки панели). */
export function syncTabbar() {
  const c = current(); if (!c || !tabbarEl) return;
  const tabOf = (e) => { const d = routes.get(e.name); return typeof d?.tab === 'function' ? d.tab(e.params) : d?.tab; };
  const activeTab = tabOf(c) || tabOf(stack[0]);
  tabbarEl.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === activeTab)));
  const cur = tabbarEl.querySelector('[aria-current="true"]');            // панель прокручивается: активная вкладка должна быть видна
  if (cur && tabbarEl.clientWidth) {
    const l = cur.offsetLeft, r = l + cur.offsetWidth;
    if (l < tabbarEl.scrollLeft) tabbarEl.scrollLeft = Math.max(0, l - 8);
    else if (r > tabbarEl.scrollLeft + tabbarEl.clientWidth) tabbarEl.scrollLeft = r - tabbarEl.clientWidth + 8;
  }
}

function errorView(e) {
  const el = document.createElement('div');
  el.className = 'pad';
  el.textContent = 'Не удалось открыть экран: ' + (e?.message || e);
  return { el };
}

function syncBackButton() {
  const need = stack.length > 1 || backHandlers.length > 0;
  tg.setBack(need ? () => back() : null);
}

/** Перерисовать текущий экран (например, после смены языка). */
export function refresh() { const c = current(); if (c) { c.scroll = screenEl?.scrollTop || 0; navDir = 'none'; return show(c, stack, true); } }
