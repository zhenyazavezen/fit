// @ts-check
// Аккаунты, способы входа, сессии, привязка второго способа входа, объединение данных.
// Принципы: никакого автоматического объединения по имени/почте; привязка — только по одноразовому коду,
// который доказывает владение обоими входами; история не теряется; один и тот же вход не может быть у двух аккаунтов.
import { HttpError } from './http.js';
import { randomId, randomToken, randomCode, sha256Hex } from './crypto.js';
import { rateLimit } from './ratelimit.js';

export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
export const LINK_TTL_MS = 10 * 60 * 1000;
const MAX_LINK_ATTEMPTS = 5;

const audit = (db, accountId, event, detail, now) =>
  db.prepare('INSERT INTO audit_log (at, account_id, event, detail) VALUES (?1, ?2, ?3, ?4)').bind(now, accountId, event, detail ?? null);

const clean = (s, n = 80) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, n) : null);

/** Найти или создать аккаунт по подтверждённому входу. Возвращает {accountId, isNew}. */
export async function loginWithIdentity(db, provider, subject, info, now = Date.now()) {
  const find = () => db.prepare('SELECT account_id FROM identities WHERE provider = ?1 AND subject = ?2').bind(provider, subject).first();
  let row = await find();
  if (row) {
    await db.batch([
      db.prepare('UPDATE identities SET last_login_at = ?3, display_name = COALESCE(?4, display_name), username = COALESCE(?5, username) WHERE provider = ?1 AND subject = ?2').bind(provider, subject, now, clean(info.displayName), clean(info.username, 40)),
      db.prepare('UPDATE accounts SET last_seen_at = ?2 WHERE id = ?1').bind(row.account_id, now),
    ]);
    return { accountId: row.account_id, isNew: false };
  }
  const accountId = randomId('acc_');
  try {
    await db.batch([
      db.prepare('INSERT INTO accounts (id, created_at, last_seen_at) VALUES (?1, ?2, ?2)').bind(accountId, now),
      db.prepare('INSERT INTO identities (provider, subject, account_id, display_name, username, created_at, last_login_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)')
        .bind(provider, subject, accountId, clean(info.displayName), clean(info.username, 40), now),
      audit(db, accountId, 'account_created', provider, now),
    ]);
  } catch (e) {            // гонка двух одновременных первых входов: побеждает уже созданный аккаунт
    row = await find();
    if (!row) throw e;
    return { accountId: row.account_id, isNew: false };
  }
  return { accountId, isNew: true };
}

export async function createSession(db, accountId, provider, now = Date.now()) {
  const token = randomToken(32);
  await db.prepare('INSERT INTO sessions (token_hash, account_id, provider, created_at, expires_at, last_used_at) VALUES (?1, ?2, ?3, ?4, ?5, ?4)')
    .bind(await sha256Hex(token), accountId, provider, now, now + SESSION_TTL_MS).run();
  return { token, expiresAt: now + SESSION_TTL_MS };
}

/** Проверка заголовка Authorization: Bearer. Бросает 401. */
export async function authenticate(request, db, now = Date.now()) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(request.headers.get('Authorization') || '');
  if (!m) throw new HttpError(401, 'unauthorized', 'Требуется вход');
  const hash = await sha256Hex(m[1]);
  const s = await db.prepare(
    `SELECT s.token_hash, s.account_id, s.provider, s.expires_at, s.last_used_at FROM sessions s
     JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ?1 AND a.merged_into IS NULL`).bind(hash).first();
  if (!s || s.expires_at < now) throw new HttpError(401, 'unauthorized', 'Сессия недействительна или истекла');
  if (now - s.last_used_at > 3600_000) {
    const exp = Math.max(s.expires_at, now + SESSION_TTL_MS);
    await db.prepare('UPDATE sessions SET last_used_at = ?2, expires_at = ?3 WHERE token_hash = ?1').bind(hash, now, exp).run();
  }
  return { accountId: s.account_id, provider: s.provider, tokenHash: hash };
}

export async function revokeSession(db, tokenHash) { await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(tokenHash).run(); }

export async function getMe(db, accountId, now = Date.now()) {
  const a = await db.prepare('SELECT id, created_at, premium_until, sync_rev FROM accounts WHERE id = ?1').bind(accountId).first();
  if (!a) throw new HttpError(404, 'not_found', 'Аккаунт не найден');
  const ids = await db.prepare('SELECT provider, display_name, username, created_at FROM identities WHERE account_id = ?1 ORDER BY created_at').bind(accountId).all();
  return {
    id: a.id, createdAt: a.created_at, syncRev: a.sync_rev,
    premium: { active: a.premium_until > now, until: a.premium_until || null },
    identities: ids.results.map((i) => ({ provider: i.provider, displayName: i.display_name, username: i.username })),
  };
}

const counts = async (db, accountId) => {
  const w = await db.prepare('SELECT COUNT(*) AS n FROM workout_sessions WHERE account_id = ?1 AND deleted = 0').bind(accountId).first();
  const idn = await db.prepare('SELECT provider FROM identities WHERE account_id = ?1').bind(accountId).all();
  const a = await db.prepare('SELECT created_at FROM accounts WHERE id = ?1').bind(accountId).first();
  return { workouts: w.n, providers: idn.results.map((r) => r.provider), createdAt: a.created_at };
};

/** Шаг 1: вошедший пользователь создаёт одноразовый код (10 минут). */
export async function startLink(db, accountId, now = Date.now()) {
  await rateLimit(db, 'linkstart:' + accountId, 10, 600, now);
  const code = randomCode();
  await db.batch([
    db.prepare('DELETE FROM link_codes WHERE account_id = ?1').bind(accountId),
    db.prepare('INSERT INTO link_codes (code_hash, account_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)').bind(await sha256Hex(code), accountId, now, now + LINK_TTL_MS),
  ]);
  return { code, expiresAt: now + LINK_TTL_MS };
}

async function resolveCode(db, completerId, rawCode, now) {
  await rateLimit(db, 'linkcheck:' + completerId, 10, 600, now);
  const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 8) throw new HttpError(400, 'bad_code', 'Неверный код');
  const hash = await sha256Hex(code);
  const row = await db.prepare('SELECT code_hash, account_id, expires_at, attempts FROM link_codes WHERE code_hash = ?1').bind(hash).first();
  if (!row || row.expires_at < now || row.attempts >= MAX_LINK_ATTEMPTS) throw new HttpError(400, 'bad_code', 'Код неверный или истёк');
  if (row.account_id === completerId) throw new HttpError(400, 'same_account', 'Этот код создан в этом же аккаунте. Введите его в другом способе входа.');
  const other = await db.prepare('SELECT merged_into FROM accounts WHERE id = ?1').bind(row.account_id).first();
  if (!other || other.merged_into) throw new HttpError(400, 'bad_code', 'Код неверный или истёк');
  return { hash, creatorId: row.account_id };
}

/** Что произойдёт при объединении — пользователь подтверждает это до выполнения. */
export async function previewLink(db, completerId, rawCode, now = Date.now()) {
  const { creatorId } = await resolveCode(db, completerId, rawCode, now);
  const a = await counts(db, creatorId), b = await counts(db, completerId);
  const conflict = a.providers.filter((p) => b.providers.includes(p));
  return { conflict: conflict.length ? conflict[0] : null, other: { workouts: a.workouts, providers: a.providers }, mine: { workouts: b.workouts, providers: b.providers } };
}

function mergeDocs(p, s) {
  /** @type {Record<string, {value:any, updatedAt:number}>} */
  const out = {};
  const keys = new Set([...Object.keys(p), ...Object.keys(s)]);
  for (const k of keys) {
    const a = p[k], b = s[k];
    if (!a) { out[k] = b; continue; }
    if (!b) { out[k] = a; continue; }
    if (k === 'favorites') out[k] = { value: [...new Set([...(a.value || []), ...(b.value || [])])], updatedAt: Math.max(a.updatedAt, b.updatedAt) };
    else if (k === 'programs') {
      const ids = new Set((a.value || []).map((x) => x.id));
      out[k] = { value: [...(a.value || []), ...(b.value || []).filter((x) => !ids.has(x.id))], updatedAt: Math.max(a.updatedAt, b.updatedAt) };
    } else out[k] = a.updatedAt >= b.updatedAt ? a : b;
  }
  return out;
}
const loadDocs = async (db, id) => {
  const r = await db.prepare('SELECT doc_key, value, updated_at FROM user_docs WHERE account_id = ?1').bind(id).all();
  return Object.fromEntries(r.results.map((d) => [d.doc_key, { value: JSON.parse(d.value), updatedAt: d.updated_at }]));
};

/** Шаг 2: подтверждённое объединение. Остаётся аккаунт с большей историей (при равенстве — более старый). */
export async function completeLink(db, completerId, completerProvider, rawCode, now = Date.now()) {
  const { hash, creatorId } = await resolveCode(db, completerId, rawCode, now);
  const a = await counts(db, creatorId), b = await counts(db, completerId);
  if (a.providers.some((p) => b.providers.includes(p))) throw new HttpError(409, 'provider_conflict', 'В обоих аккаунтах уже есть вход этого типа. Объединение невозможно.');
  const primary = a.workouts !== b.workouts ? (a.workouts > b.workouts ? creatorId : completerId) : (a.createdAt <= b.createdAt ? creatorId : completerId);
  const secondary = primary === creatorId ? completerId : creatorId;

  const docs = mergeDocs(await loadDocs(db, primary), await loadDocs(db, secondary));
  const upserts = Object.entries(docs).map(([k, d]) => db.prepare(
    `INSERT INTO user_docs (account_id, doc_key, value, rev, updated_at) VALUES (?1, ?2, ?3, (SELECT sync_rev FROM accounts WHERE id = ?1), ?4)
     ON CONFLICT(account_id, doc_key) DO UPDATE SET value = excluded.value, rev = excluded.rev, updated_at = excluded.updated_at`).bind(primary, k, JSON.stringify(d.value), d.updatedAt));
  await db.batch([
    db.prepare('UPDATE accounts SET sync_rev = sync_rev + 1 WHERE id = ?1').bind(primary),
    db.prepare('UPDATE identities SET account_id = ?1 WHERE account_id = ?2').bind(primary, secondary),
    db.prepare(`INSERT OR IGNORE INTO workout_sessions (account_id, id, data, at, deleted, rev)
                SELECT ?1, id, data, at, deleted, (SELECT sync_rev FROM accounts WHERE id = ?1) FROM workout_sessions WHERE account_id = ?2`).bind(primary, secondary),
    ...upserts,
    db.prepare('DELETE FROM workout_sessions WHERE account_id = ?1').bind(secondary),
    db.prepare('DELETE FROM user_docs WHERE account_id = ?1').bind(secondary),
    db.prepare('DELETE FROM sessions WHERE account_id = ?1').bind(secondary),
    db.prepare('DELETE FROM link_codes WHERE account_id IN (?1, ?2)').bind(primary, secondary),
    db.prepare('UPDATE accounts SET premium_until = MAX(premium_until, (SELECT premium_until FROM accounts WHERE id = ?2)) WHERE id = ?1').bind(primary, secondary),
    db.prepare('UPDATE accounts SET merged_into = ?1, premium_until = 0 WHERE id = ?2').bind(primary, secondary),
    audit(db, primary, 'accounts_merged', `from ${secondary}`, now),
  ]);
  void hash;
  const session = await createSession(db, primary, completerProvider, now);
  return { accountId: primary, session };
}

/** Отвязать способ входа. Нельзя отвязать последний и тот, которым вошли сейчас. */
export async function unlinkIdentity(db, accountId, currentProvider, provider, now = Date.now()) {
  if (!['telegram', 'google'].includes(provider)) throw new HttpError(400, 'bad_provider', 'Неизвестный способ входа');
  if (provider === currentProvider) throw new HttpError(400, 'use_other_session', 'Чтобы отвязать этот способ, войдите другим способом.');
  const list = await db.prepare('SELECT provider FROM identities WHERE account_id = ?1').bind(accountId).all();
  if (list.results.length < 2 || !list.results.some((r) => r.provider === provider)) throw new HttpError(400, 'last_identity', 'Нельзя отвязать единственный способ входа');
  await db.batch([
    db.prepare('DELETE FROM identities WHERE account_id = ?1 AND provider = ?2').bind(accountId, provider),
    db.prepare('DELETE FROM sessions WHERE account_id = ?1 AND provider = ?2').bind(accountId, provider),
    audit(db, accountId, 'identity_unlinked', provider, now),
  ]);
}

/** Удаление аккаунта и всех его данных (право пользователя). Записи объединения о нём остаются без персональных данных. */
export async function deleteAccount(db, accountId) {
  await db.batch([
    db.prepare('DELETE FROM audit_log WHERE account_id = ?1').bind(accountId),
    db.prepare('DELETE FROM accounts WHERE id = ?1').bind(accountId),
  ]);
}
