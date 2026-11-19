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
const K = (k) => CONFIG.storePrefix + k;
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
    const prefix = CONFIG.storePrefix;
    if (ls) for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k.startsWith(prefix) && !k.includes(':corrupt:')) out.push(k.slice(prefix.length)); }
    else mem.forEach((_, k) => { if (k.startsWith(prefix) && !k.includes(':corrupt:')) out.push(k.slice(prefix.length)); });
    return out;
  },
};

// ---- Миграции схемы: при росте версии добавляйте шаги сюда, данные пользователя не удаляются.
export function migrate() {
  const v = store.get('schema', 0);
  if (v < 1) store.set('schema', SCHEMA_VERSION);
}

// ---- Настройки
const DEFAULT_SETTINGS = { sound: true, haptics: true, wake: true, lang: null };
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

// ---- Тренировка, которую можно продолжить
export const activeSession = {
  get() { return store.get('active', null); },
  set(snap) { store.set('active', snap); },
  clear() { store.remove('active'); },
};

// Служебные ключи не экспортируются и не синхронизируются (токен входа, состояние синхронизации, активная тренировка).
export const LOCAL_ONLY = ['auth', 'syncmeta', 'active', 'schema', 'authPromptAt'];

export function exportAll() {
  const out = { app: 'ZAVEZEN_FIT', version: CONFIG.version, exportedAt: new Date().toISOString(), data: {} };
  for (const k of store.keys()) if (!LOCAL_ONLY.includes(k)) out.data[k] = store.get(k);
  return out;
}

export function resetAll() { for (const k of store.keys()) store.remove(k); }
