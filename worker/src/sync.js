// @ts-check
// Синхронизация данных пользователя между устройствами.
//  • Документы (settings, profile, favorites, programs, avatar): побеждает запись с более поздним updatedAt клиента (LWW), решение принимает сама SQL-команда.
//  • История тренировок: запись определяется id клиента — повторная отправка безопасна; удаление — «надгробие», которое не отменяется.
//  • Каждое изменение получает номер ревизии аккаунта; клиент запрашивает изменения «после ревизии N».
import { HttpError } from './http.js';

export const DOC_KEYS = ['settings', 'profile', 'favorites', 'programs', 'avatar', 'myex', 'todos', 'tabs', 'pages'];
const MAX_DOC_BYTES = 64 * 1024;
const MAX_SESSIONS_PER_PUSH = 200;
export const MAX_SESSIONS_PER_ACCOUNT = 5000;
const PULL_LIMIT = 500;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const str = (v, n) => typeof v === 'string' && v.length <= n;

/** Проверка и очистка документа. Возвращает чистое значение или бросает 400. */
export function validateDoc(key, value) {
  const bad = (m) => new HttpError(400, 'bad_doc', `${key}: ${m}`);
  if (JSON.stringify(value).length > MAX_DOC_BYTES) throw new HttpError(413, 'too_large', `${key}: слишком большой документ`);
  if (key === 'favorites') {
    if (!Array.isArray(value) || value.length > 500 || !value.every((x) => str(x, 64) && ID_RE.test(x))) throw bad('ожидается список идентификаторов');
    return [...new Set(value)];
  }
  if (key === 'programs') {
    if (!Array.isArray(value) || value.length > 100) throw bad('ожидается список программ');
    for (const p of value) {
      if (!isObj(p) || !str(p.id, 64) || !ID_RE.test(p.id) || !str(p.name, 100) || !Array.isArray(p.items) || p.items.length > 60) throw bad('некорректная программа');
      for (const it of p.items) if (!isObj(it) || !str(it.ex, 64) || !ID_RE.test(it.ex)) throw bad('некорректное упражнение в программе');
    }
    return value;
  }
  if (key === 'settings') {
    if (!isObj(value) || Object.keys(value).length > 30) throw bad('ожидается объект');
    return Object.fromEntries(Object.entries(value).filter(([k, v]) => str(k, 30) && (typeof v === 'boolean' || v === null || str(v, 30) || finite(v, -1e9, 1e9))));
  }
  if (key === 'profile') {
    if (!isObj(value)) throw bad('ожидается объект');
    return value;      // поля профиля нормализует клиент (profile-data.js); здесь только ограничение размера
  }
  if (key === 'avatar') {
    // фото профиля: пустая строка (убрано) или JPEG-квадрат в виде data-URL, не больше 60 000 символов
    if (!isObj(value) || typeof value.img !== 'string' || value.img.length > 60000 || (value.img !== '' && !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.img))) throw bad('ожидается JPEG-фото');
    return { img: value.img };
  }
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const cleanItems = (a) => {
    if (!Array.isArray(a) || a.length > 60) throw bad('ожидается список дел');
    return a.map((x) => { if (!isObj(x) || !str(x.id, 64) || !ID_RE.test(x.id) || !str(x.t, 160)) throw bad('некорректное дело'); return { id: x.id, t: x.t, d: x.d === true }; });
  };
  if (key === 'myex') {
    if (!Array.isArray(value) || value.length > 200) throw bad('ожидается список упражнений');
    return value.map((e) => {
      if (!isObj(e) || !str(e.id, 64) || !ID_RE.test(e.id) || !str(e.name, 60) || !e.name.trim() || (e.mode !== 'reps' && e.mode !== 'time') || !str(e.cat, 30) || (e.note != null && !str(e.note, 400))) throw bad('некорректное упражнение');
      return { id: e.id, name: e.name, mode: e.mode, cat: e.cat, note: e.note || '' };
    });
  }
  if (key === 'todos') {
    if (!isObj(value) || Object.keys(value).length > 30) throw bad('ожидается объект по дням');
    return Object.fromEntries(Object.entries(value).map(([day, items]) => { if (!DAY_RE.test(day)) throw bad('некорректный день'); return [day, cleanItems(items)]; }));
  }
  if (key === 'tabs') {
    if (!isObj(value)) throw bad('ожидается объект');
    const ids = (a, n) => { if (!Array.isArray(a) || a.length > n || !a.every((x) => str(x, 64) && ID_RE.test(x))) throw bad('некорректный список вкладок'); return a; };
    const custom = Array.isArray(value.custom) ? value.custom : [];
    if (custom.length > 10) throw bad('слишком много вкладок');
    return {
      order: ids(value.order || [], 30), hidden: ids(value.hidden || [], 30),
      custom: custom.map((c) => { if (!isObj(c) || !str(c.id, 64) || !ID_RE.test(c.id) || !str(c.name, 30) || (c.emoji != null && !str(c.emoji, 12)) || (c.icon != null && !(str(c.icon, 20) && /^[a-z-]*$/.test(c.icon)))) throw bad('некорректная вкладка'); return { id: c.id, name: c.name, emoji: c.emoji || '', icon: c.icon || '' }; }),
    };
  }
  if (key === 'pages') {
    if (!isObj(value) || Object.keys(value).length > 12) throw bad('ожидается объект страниц');
    return Object.fromEntries(Object.entries(value).map(([id, p]) => {
      if (!ID_RE.test(id) || !isObj(p) || !str(p.note ?? '', 3000)) throw bad('некорректная страница');
      return [id, { note: p.note || '', items: cleanItems(p.items || []) }];
    }));
  }
  throw new HttpError(400, 'bad_doc', 'Неизвестный документ');
}

/** Очистка записи тренировки: остаются только известные поля. */
export function cleanSession(s) {
  if (!isObj(s) || !str(s.id, 64) || !ID_RE.test(s.id) || !finite(s.at, 1e12, 4.2e12)) throw new HttpError(400, 'bad_session', 'Некорректная запись тренировки');
  const o = { id: s.id, at: Math.round(s.at) };
  if (finite(s.startedAt, 1e12, 4.2e12)) o.startedAt = Math.round(s.startedAt);
  if (finite(s.durationSec, 0, 86400)) o.durationSec = Math.round(s.durationSec);
  if (str(s.programId, 64) || s.programId === null) o.programId = s.programId;
  if (str(s.title, 120)) o.title = s.title;
  if (finite(s.setsDone, 0, 1000)) o.setsDone = Math.round(s.setsDone);
  if (finite(s.exercisesDone, 0, 200)) o.exercisesDone = Math.round(s.exercisesDone);
  if (Array.isArray(s.exerciseIds)) o.exerciseIds = s.exerciseIds.filter((x) => str(x, 64)).slice(0, 100);
  if (typeof s.completed === 'boolean') o.completed = s.completed;
  return o;
}

export async function pull(db, accountId, since) {
  since = Number.isSafeInteger(since) && since >= 0 ? since : 0;
  const acc = await db.prepare('SELECT sync_rev FROM accounts WHERE id = ?1').bind(accountId).first();
  const docs = await db.prepare('SELECT doc_key, value, rev, updated_at FROM user_docs WHERE account_id = ?1 AND rev > ?2').bind(accountId, since).all();
  const ws = await db.prepare('SELECT id, data, deleted, rev FROM workout_sessions WHERE account_id = ?1 AND rev > ?2 ORDER BY rev, id LIMIT ?3').bind(accountId, since, PULL_LIMIT + 1).all();
  const more = ws.results.length > PULL_LIMIT;
  const rows = more ? ws.results.slice(0, PULL_LIMIT) : ws.results;
  // при усечении отдаём ревизию последней записи, остальное клиент заберёт следующим запросом
  const rev = more ? rows[rows.length - 1].rev : acc.sync_rev;
  return {
    rev, more,
    docs: docs.results.filter((d) => !more || d.rev <= rev).map((d) => ({ key: d.doc_key, value: JSON.parse(d.value), rev: d.rev, updatedAt: d.updated_at })),
    sessions: rows.map((r) => ({ id: r.id, deleted: !!r.deleted, data: JSON.parse(r.data), rev: r.rev })),
  };
}

export async function push(db, accountId, payload, now = Date.now()) {
  const docsIn = payload.docs ?? {};
  const sessIn = payload.sessions ?? [];
  const delIn = payload.deleted ?? [];
  if (!isObj(docsIn) || !Array.isArray(sessIn) || !Array.isArray(delIn)) throw new HttpError(400, 'bad_request', 'Некорректный запрос синхронизации');
  if (sessIn.length > MAX_SESSIONS_PER_PUSH || delIn.length > MAX_SESSIONS_PER_PUSH) throw new HttpError(413, 'too_large', 'Слишком много записей за раз');

  const docs = [];
  for (const [key, d] of Object.entries(docsIn)) {
    if (!DOC_KEYS.includes(key)) throw new HttpError(400, 'bad_doc', 'Неизвестный документ: ' + key);
    if (!isObj(d) || !finite(d.updatedAt, 0, 4.2e12)) throw new HttpError(400, 'bad_doc', key + ': нужен updatedAt');
    docs.push({ key, value: validateDoc(key, d.value), updatedAt: Math.min(Math.round(d.updatedAt), now + 5 * 60_000) });
  }
  const sessions = sessIn.map(cleanSession);
  const dels = delIn.map((id) => { if (!str(id, 64) || !ID_RE.test(id)) throw new HttpError(400, 'bad_session', 'Некорректный id'); return id; });

  if (sessions.length) {
    const have = await db.prepare('SELECT COUNT(*) AS n FROM workout_sessions WHERE account_id = ?1').bind(accountId).first();
    if (have.n + sessions.length > MAX_SESSIONS_PER_ACCOUNT) throw new HttpError(413, 'quota', 'Достигнут предел сохранённой истории');
  }
  if (!docs.length && !sessions.length && !dels.length) return { conflicts: [] };

  const REV = '(SELECT sync_rev FROM accounts WHERE id = ?1)';
  const stmts = [db.prepare('UPDATE accounts SET sync_rev = sync_rev + 1, last_seen_at = ?2 WHERE id = ?1').bind(accountId, now)];
  for (const d of docs) {
    stmts.push(db.prepare(
      `INSERT INTO user_docs (account_id, doc_key, value, rev, updated_at) VALUES (?1, ?2, ?3, ${REV}, ?4)
       ON CONFLICT(account_id, doc_key) DO UPDATE SET value = excluded.value, rev = excluded.rev, updated_at = excluded.updated_at
       WHERE excluded.updated_at > user_docs.updated_at`).bind(accountId, d.key, JSON.stringify(d.value), d.updatedAt));
  }
  for (const s of sessions) {
    stmts.push(db.prepare(`INSERT OR IGNORE INTO workout_sessions (account_id, id, data, at, deleted, rev) VALUES (?1, ?2, ?3, ?4, 0, ${REV})`).bind(accountId, s.id, JSON.stringify(s), s.at));
  }
  for (const id of dels) {
    stmts.push(db.prepare(`UPDATE workout_sessions SET deleted = 1, rev = ${REV} WHERE account_id = ?1 AND id = ?2 AND deleted = 0`).bind(accountId, id));
    stmts.push(db.prepare(`INSERT OR IGNORE INTO workout_sessions (account_id, id, data, at, deleted, rev) VALUES (?1, ?2, '{}', 0, 1, ${REV})`).bind(accountId, id));
  }
  await db.batch(stmts);

  // конфликт: на сервере документ новее (или равен по времени, но другой) — клиент получит серверное значение
  const conflicts = [];
  for (const d of docs) {
    const cur = await db.prepare('SELECT value, updated_at FROM user_docs WHERE account_id = ?1 AND doc_key = ?2').bind(accountId, d.key).first();
    if (cur && JSON.stringify(JSON.parse(cur.value)) !== JSON.stringify(d.value)) conflicts.push({ key: d.key, value: JSON.parse(cur.value), updatedAt: cur.updated_at });
  }
  return { conflicts };
}
