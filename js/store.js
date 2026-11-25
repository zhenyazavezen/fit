// Хранилище на устройстве. Правила, чтобы не терять данные:
//  • повреждённое значение не затирается молча — копия сохраняется под ключом ...:corrupt:<время>;
//  • история не обрезается; ошибка записи (переполнение) возвращает false и показывается пользователю;
//  • каждая запись проходит через setWriteHook — сюда позже подключится синхронизация с backend.
import { CONFIG } from './config.js';
import { uid } from './util.js';

const SCHEMA_VERSION = 1;
const mem = new Map();
let ls = null;
try { ls = window.localStorage; ls.setItem('__t', '1'); ls.removeItem('__t'); } catch { ls = null; }

const listeners = new Set();
let writeHook = null;
// Личное пространство: на одном телефоне в Telegram может быть несколько аккаунтов, а localStorage у них общий.
// Поэтому ключи делятся по id пользователя Telegram («seven:u123:…»): данные одного аккаунта не видны другому.
let prefix = CONFIG.storePrefix;
const OTHER_USER = /^u\d+:/;
export function useNamespace(userId) {
  const id = String(userId ?? '').replace(/\D/g, '');
  prefix = CONFIG.storePrefix + (id ? 'u' + id + ':' : '');
}
const K = (k) => prefix + k;
const rawGet = (key) => (ls ? ls.getItem(key) : (mem.get(key) ?? null));
const rawSet = (key, val) => { if (ls) ls.setItem(key, val); else mem.set(key, val); };

export const store = {
  get(k, fallback = null) {
    const key = K(k);
    let raw = null;
    try { raw = rawGet(key); } catch { return fallback; }
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch {
      try { rawSet(`${key}:corrupt:${Date.now()}`, raw); } catch { /* нечего делать */ }
      return fallback;
    }
  },
  set(k, v) {
    try { rawSet(K(k), JSON.stringify(v)); } catch (e) { listeners.forEach((f) => f('error', k, e)); return false; }
    writeHook?.(k, v);
    listeners.forEach((f) => f('set', k, v));
    return true;
  },
  /** Запись данных, пришедших с сервера: не вызывает writeHook (иначе синхронизация зациклится). */
  setSilent(k, v) {
    try { rawSet(K(k), JSON.stringify(v)); } catch (e) { listeners.forEach((f) => f('error', k, e)); return false; }
    listeners.forEach((f) => f('set', k, v));
    return true;
  },
  remove(k) {
    try { ls ? ls.removeItem(K(k)) : mem.delete(K(k)); } catch { /* ignore */ }
    listeners.forEach((f) => f('remove', k));
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  setWriteHook(fn) { writeHook = fn; },
  keys() {
    const out = [];
    const mine = (k) => k.startsWith(prefix) && !k.includes(':corrupt:') && (prefix !== CONFIG.storePrefix || !OTHER_USER.test(k.slice(prefix.length)));
    if (ls) for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (mine(k)) out.push(k.slice(prefix.length)); }
    else mem.forEach((_, k) => { if (mine(k)) out.push(k.slice(prefix.length)); });
    return out;
  },
};

// ---- Миграции схемы: при росте версии добавляйте шаги сюда, данные пользователя не удаляются.
export function migrate() {
  const v = store.get('schema', 0);
  if (v < 1) store.set('schema', SCHEMA_VERSION);
}

// ---- Настройки
const DEFAULT_SETTINGS = { sound: true, haptics: true, wake: true, lang: null, homeOrder: null };
export const settings = {
  get() { return { ...DEFAULT_SETTINGS, ...(store.get('settings', {}) || {}) }; },
  set(patch) { return store.set('settings', { ...this.get(), ...patch }); },
};

// ---- История тренировок: [{id, at, startedAt, durationSec, programId, title?, setsDone, exercisesDone, exerciseIds}]
export const history = {
  all() { const a = store.get('history', []); return Array.isArray(a) ? a : []; },
  add(session) {
    const rec = { id: uid(), ...session };
    const ok = store.set('history', [...this.all(), rec]);
    return ok ? rec : null;
  },
  remove(id) { store.set('history', this.all().filter((s) => s.id !== id)); },
};

// ---- Избранные упражнения
export const favorites = {
  all() { const a = store.get('favorites', []); return Array.isArray(a) ? a : []; },
  has(id) { return this.all().includes(id); },
  toggle(id) {
    const a = this.all();
    const next = a.includes(id) ? a.filter((x) => x !== id) : [...a, id];
    store.set('favorites', next);
    return next.includes(id);
  },
};

// ---- Собственные программы пользователя: {id:'u_…', name, items:[{ex, sets?, reps?, seconds?, rest?}], restBetween}
export const customPrograms = {
  all() { const a = store.get('programs', []); return Array.isArray(a) ? a : []; },
  get(id) { return this.all().find((p) => p.id === id) || null; },
  save(p) {
    const list = this.all();
    const i = list.findIndex((x) => x.id === p.id);
    if (i >= 0) list[i] = p; else list.push(p);
    return store.set('programs', list);
  },
  remove(id) { store.set('programs', this.all().filter((p) => p.id !== id)); },
};

// ---- Свои упражнения: [{id:'x_…', name, mode:'reps'|'time', cat, note}]
export const customEx = {
  all() { const a = store.get('myex', []); return Array.isArray(a) ? a : []; },
  save(e) {
    const list = this.all(), i = list.findIndex((x) => x.id === e.id);
    if (i >= 0) list[i] = e; else list.push(e);
    return store.set('myex', list);
  },
  remove(id) { store.set('myex', this.all().filter((x) => x.id !== id)); },
};

/** День недели по ключу ГГГГ-ММ-ДД: 1 = понедельник … 7 = воскресенье. */
export function weekdayOf(day) { const [y, m, d] = day.split('-').map(Number); return ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1; }

// ---- Дела на сегодня (todos) и тренировки на сегодня (wtodos), одинаково: { 'ГГГГ-ММ-ДД': [{id, t, d}] }; хранятся последние 14 дней
const dayLists = (key) => ({
  all() { const o = store.get(key, {}); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; },
  get(day) { const a = this.all()[day]; return Array.isArray(a) ? a : []; },
  /** Постоянные дела (расписание): [{id, t, days:[1..7]}], 1 = понедельник. Без days — каждый день. */
  daily() {
    const a = this.all().daily;
    return (Array.isArray(a) ? a : []).map((r) => ({ id: r.id, t: r.t, d: false, days: Array.isArray(r.days) && r.days.length ? r.days : [1, 2, 3, 4, 5, 6, 7] }));
  },
  setDaily(items) { return store.set(key, { ...this.all(), daily: items }); },
  /** Список дня: свои дела + дела расписания на этот день недели (без отметок с прошлых дней). */
  forDay(day) {
    const list = this.get(day).map((x) => ({ ...x })), have = new Set(list.map((x) => x.src).filter(Boolean)), wd = weekdayOf(day);
    for (const r of this.daily()) if (r.days.includes(wd) && !have.has(r.id)) list.push({ id: day + '_' + r.id, t: r.t, d: false, src: r.id });
    return list;
  },
  /** История: уникальные дела из сохранённых дней, свежие сверху. */
  history(limit = 40) {
    const all = this.all(), seen = new Set(), out = [];
    for (const day of Object.keys(all).filter((k) => k !== 'daily').sort().reverse()) {
      for (const x of Array.isArray(all[day]) ? all[day] : []) {
        const k = String(x.t).trim().toLowerCase();
        if (!k || seen.has(k)) continue;
        seen.add(k); out.push({ t: x.t, day, d: !!x.d });
      }
    }
    return out.slice(0, limit);
  },
  set(day, items) {
    const all = { ...this.all(), [day]: items };
    for (const k of Object.keys(all).filter((x) => x !== 'daily').sort().slice(0, -14)) delete all[k];
    return store.set(key, all);
  },
});
export const todos = dayLists('todos');
export const workoutsToday = dayLists('wtodos');

// ---- Нижняя панель: { order:[id…], hidden:[id…], custom:[{id,name,icon}] }; страницы своих вкладок: { id: {note, items:[{id,t,d}]} }
export const tabsCfg = {
  get() { const v = store.get('tabs', null); return v && typeof v === 'object' && !Array.isArray(v) ? { order: v.order || [], hidden: v.hidden || [], custom: v.custom || [], hideAdd: v.hideAdd === true } : { order: [], hidden: [], custom: [], hideAdd: false }; },
  set(c) { return store.set('tabs', c); },
};
export const pages = {
  all() { const o = store.get('pages', {}); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; },
  get(id) { const p = this.all()[id]; return { note: p?.note || '', items: Array.isArray(p?.items) ? p.items : [] }; },
  set(id, p) { return store.set('pages', { ...this.all(), [id]: p }); },
  remove(id) { const o = { ...this.all() }; delete o[id]; store.set('pages', o); },
};

// ---- Тренировка, которую можно продолжить
export const activeSession = {
  get() { return store.get('active', null); },
  set(snap) { store.set('active', snap); },
  clear() { store.remove('active'); },
};

// Служебные ключи не синхронизируются (токен входа, состояние синхронизации, активная тренировка).
export const LOCAL_ONLY = ['auth', 'syncmeta', 'active', 'schema', 'authPromptAt'];

export function resetAll() { for (const k of store.keys()) store.remove(k); }
