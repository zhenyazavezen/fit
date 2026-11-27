// Синхронизация локальных данных с сервером. Локальное хранилище остаётся основным (работает офлайн),
// сервер — копия для других устройств. Изменения копятся в очереди и отправляются, когда есть связь.
// Правила: документы — «побеждает более поздняя запись»; история — по id (без дублей), удаление — надгробие.
import { store, history } from './store.js';
import { api, ApiError } from './api.js';

export const DOCS = ['settings', 'favorites', 'programs', 'profile', 'avatar', 'myex', 'todos', 'wtodos', 'tabs', 'pages', 'week'];
const PUSH_LIMIT = 200;
const listeners = new Set();
let applying = false, timer = null, running = false, token = null, status = { state: 'off', lastAt: 0, error: null };

const fresh = (user) => ({ user, rev: 0, docs: {}, dirty: [], sent: [], del: [] });
const meta = () => store.get('syncmeta', null) || fresh(null);
const saveMeta = (m) => store.setSilent('syncmeta', m);
const emit = (patch) => { status = { ...status, ...patch }; listeners.forEach((f) => f(status)); };
const localIds = () => history.all().map((s) => s.id);

export const syncStatus = () => status;
export const onSyncStatus = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Включить синхронизацию для вошедшего аккаунта. Первый вход на устройстве объединяет данные, а не затирает. */
export async function enableSync(accountId, sessionToken) {
  token = sessionToken;
  let m = meta();
  if (m.user !== accountId) {
    m = fresh(accountId);
    saveMeta(m);
    emit({ state: 'syncing', error: null });
    await firstMerge(m);
  }
  emit({ state: 'idle' });
  return syncNow();
}
export function disableSync() { token = null; clearTimeout(timer); emit({ state: 'off', error: null }); }
export const setSyncToken = (t) => { token = t; };

/** Первый вход: забрать серверные данные, объединить с локальными, затем отправить всё локальное. */
async function firstMerge(m) {
  try {
    const remote = await api('/sync?since=0', { token });
    applyRemote(m, remote, { union: true });
    for (const k of DOCS) if (store.get(k, null) != null) { m.docs[k] = Date.now(); m.dirty.push(k); }
    m.dirty = [...new Set(m.dirty)];
    m.rev = remote.more ? 0 : remote.rev;
    saveMeta(m);
  } catch (e) { emit({ state: e instanceof ApiError && e.status === 0 ? 'offline' : 'error', error: e.code }); }
}

function applyRemote(m, remote, { union = false } = {}) {
  applying = true;
  try {
    for (const d of remote.docs || []) {
      const localTs = m.docs[d.key] || 0, localVal = store.get(d.key, null);
      if (union && (d.key === 'favorites' || d.key === 'programs') && Array.isArray(localVal)) {
        const merged = d.key === 'favorites' ? [...new Set([...d.value, ...localVal])] : [...d.value, ...localVal.filter((p) => !d.value.some((x) => x.id === p.id))];
        store.setSilent(d.key, merged); m.docs[d.key] = Date.now(); if (!m.dirty.includes(d.key)) m.dirty.push(d.key);
      } else if (union && localVal != null && (d.key === 'settings' || d.key === 'profile')) {
        // на этом устройстве уже есть данные: оставляем более новые по времени сервера (для нового входа — серверные)
        store.setSilent(d.key, d.value); m.docs[d.key] = d.updatedAt;
      } else if (d.updatedAt > localTs || localVal == null) { store.setSilent(d.key, d.value); m.docs[d.key] = d.updatedAt; m.dirty = m.dirty.filter((k) => k !== d.key); }
    }
    let hist = history.all(), changed = false;
    const have = new Set(hist.map((s) => s.id)), sent = new Set(m.sent);
    for (const s of remote.sessions || []) {
      if (s.deleted) { if (have.has(s.id)) { hist = hist.filter((x) => x.id !== s.id); have.delete(s.id); changed = true; } sent.add(s.id); continue; }
      if (!have.has(s.id)) { hist.push(s.data); have.add(s.id); changed = true; }
      sent.add(s.id);
    }
    if (changed) store.setSilent('history', hist.sort((a, b) => a.at - b.at));
    m.sent = [...sent];
  } finally { applying = false; }
}

export async function syncNow() {
  if (!token || running) return;
  running = true; emit({ state: 'syncing', error: null });
  try {
    for (let i = 0; i < 20; i++) {
      const m = meta();
      const docs = {}, stamp = {};
      for (const k of m.dirty) { const v = store.get(k, null); if (v != null) { docs[k] = { value: v, updatedAt: m.docs[k] || Date.now() }; stamp[k] = m.docs[k]; } }
      const sent = new Set(m.sent);
      const sessions = history.all().filter((s) => !sent.has(s.id)).slice(0, PUSH_LIMIT);
      const deleted = m.del.slice(0, PUSH_LIMIT);
      const res = await api('/sync', { method: 'POST', token, body: { baseRev: m.rev, docs, sessions, deleted } });
      const m2 = meta();                                        // запись могла произойти, пока шёл запрос
      for (const k of Object.keys(docs)) if (m2.docs[k] === stamp[k]) m2.dirty = m2.dirty.filter((x) => x !== k);
      const nowIds = new Set(history.all().map((x) => x.id));
      for (const s of sessions) {
        if (nowIds.has(s.id)) { if (!m2.sent.includes(s.id)) m2.sent.push(s.id); }
        else if (!m2.del.includes(s.id)) m2.del.push(s.id);           // удалили, пока шёл запрос: на сервере тоже убрать
      }
      m2.del = m2.del.filter((id) => !deleted.includes(id));
      for (const c of res.conflicts || []) { store.setSilent(c.key, c.value); m2.docs[c.key] = c.updatedAt; m2.dirty = m2.dirty.filter((k) => k !== c.key); }
      applyRemote(m2, { docs: (res.docs || []).filter((d) => !(res.conflicts || []).some((c) => c.key === d.key)), sessions: res.sessions });
      m2.rev = res.rev;
      saveMeta(m2);
      const pending = history.all().some((s) => !m2.sent.includes(s.id)) || m2.del.length > 0;
      if (!res.more && !pending) break;
    }
    emit({ state: 'idle', lastAt: Date.now(), error: null });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { emit({ state: 'error', error: 'unauthorized' }); }
    else emit({ state: e instanceof ApiError && e.status === 0 ? 'offline' : 'error', error: e.code || 'error' });
  } finally { running = false; }
}

const schedule = (ms = 2500) => { if (!token) return; clearTimeout(timer); timer = setTimeout(syncNow, ms); };

/** Подключается к store.setWriteHook: учитывает каждое локальное изменение. */
export function onLocalWrite(key, value) {
  if (applying) return;
  const m = meta();
  if (m.user == null) return;                         // не вошли — очередь не копим (при входе всё отправится целиком)
  if (DOCS.includes(key)) { m.docs[key] = Date.now(); if (!m.dirty.includes(key)) m.dirty.push(key); saveMeta(m); schedule(); }
  else if (key === 'history') {
    const now = new Set((Array.isArray(value) ? value : []).map((s) => s.id));
    for (const id of m.sent) if (!now.has(id) && !m.del.includes(id)) m.del.push(id);
    m.sent = m.sent.filter((id) => now.has(id));
    saveMeta(m); schedule();
  }
}

export function startSyncTriggers() {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => schedule(500));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') syncNow(); else schedule(1000); });
}
void localIds;
