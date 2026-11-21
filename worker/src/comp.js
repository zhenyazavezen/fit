// @ts-check
// Соревнования: общий рейтинг (по желанию) и комнаты с друзьями по коду приглашения.
// Принципы: участие только по явному согласию; другим виден лишь выбранный ник и итоги недели/месяца;
// итоги считает сервер по сохранённой истории тренировок (клиент не присылает «очки»).
import { HttpError } from './http.js';
import { randomId } from './crypto.js';
import { rateLimit } from './ratelimit.js';

export const MAX_ROOM_MEMBERS = 30, MAX_ROOMS_JOINED = 10, MAX_ROOMS_OWNED = 5, BOARD_LIMIT = 50;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DAY = 86400000;

const done = new WeakSet();
/** Таблицы создаются при первом обращении: вручную ничего применять не нужно. */
export async function ensureSchema(db) {
  if (done.has(db)) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS comp_profile (account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, nick TEXT NOT NULL, global INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL) STRICT`),
    db.prepare(`CREATE TABLE IF NOT EXISTS comp_rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, created_at INTEGER NOT NULL) STRICT`),
    db.prepare(`CREATE TABLE IF NOT EXISTS comp_members (room_id TEXT NOT NULL REFERENCES comp_rooms(id) ON DELETE CASCADE, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, joined_at INTEGER NOT NULL, PRIMARY KEY (room_id, account_id)) STRICT, WITHOUT ROWID`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_comp_members_acc ON comp_members(account_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_workouts_at ON workout_sessions(at)'),
  ]);
  done.add(db);
}

export function cleanNick(v) {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim() : '';
  if (s.length < 2 || s.length > 20) throw new HttpError(400, 'bad_nick', 'Ник — от 2 до 20 символов');
  return s;
}
const cleanName = (v) => {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim() : '';
  if (s.length < 2 || s.length > 30) throw new HttpError(400, 'bad_name', 'Название — от 2 до 30 символов');
  return s;
};

/** Границы периода (UTC): неделя с понедельника, календарный месяц. */
export function periodRange(period, now) {
  const d = new Date(now);
  if (period === 'month') return { from: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), to: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) };
  const day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const from = day0 - ((d.getUTCDay() + 6) % 7) * DAY;
  return { from, to: from + 7 * DAY };
}

async function upsertNick(db, accountId, nick, now, global = null) {
  await db.prepare(`INSERT INTO comp_profile (account_id, nick, global, updated_at) VALUES (?1, ?2, COALESCE(?3, 0), ?4)
    ON CONFLICT(account_id) DO UPDATE SET nick = excluded.nick, global = COALESCE(?3, comp_profile.global), updated_at = excluded.updated_at`).bind(accountId, nick, global, now).run();
}
async function needNick(db, accountId, nick, now) {
  const p = await db.prepare('SELECT nick FROM comp_profile WHERE account_id = ?1').bind(accountId).first();
  if (nick != null) { const n = cleanNick(nick); await upsertNick(db, accountId, n, now); return n; }
  if (!p) throw new HttpError(400, 'bad_nick', 'Выберите ник');
  return p.nick;
}

export async function me(db, accountId) {
  const p = await db.prepare('SELECT nick, global FROM comp_profile WHERE account_id = ?1').bind(accountId).first();
  const rooms = await db.prepare(`SELECT r.id, r.name, r.code, (r.owner_id = ?1) AS mine,
      (SELECT COUNT(*) FROM comp_members x WHERE x.room_id = r.id) AS members
    FROM comp_members m JOIN comp_rooms r ON r.id = m.room_id WHERE m.account_id = ?1 ORDER BY m.joined_at`).bind(accountId).all();
  return { nick: p ? p.nick : null, global: !!(p && p.global), rooms: rooms.results.map((r) => ({ id: r.id, name: r.name, code: r.code, mine: !!r.mine, members: r.members })) };
}

export async function setGlobal(db, accountId, on, nick, now) {
  if (on) { const n = await needNick(db, accountId, nick, now); await upsertNick(db, accountId, n, now, 1); }
  else await db.prepare('UPDATE comp_profile SET global = 0, updated_at = ?2 WHERE account_id = ?1').bind(accountId, now).run();
}
export async function setNick(db, accountId, nick, now) { await upsertNick(db, accountId, cleanNick(nick), now); }

async function memberCount(db, roomId) { return (await db.prepare('SELECT COUNT(*) AS n FROM comp_members WHERE room_id = ?1').bind(roomId).first()).n; }
async function joinedCount(db, accountId) { return (await db.prepare('SELECT COUNT(*) AS n FROM comp_members WHERE account_id = ?1').bind(accountId).first()).n; }

export async function createRoom(db, accountId, name, nick, now) {
  const nm = cleanName(name);
  await needNick(db, accountId, nick, now);
  const owned = (await db.prepare('SELECT COUNT(*) AS n FROM comp_rooms WHERE owner_id = ?1').bind(accountId).first()).n;
  if (owned >= MAX_ROOMS_OWNED || await joinedCount(db, accountId) >= MAX_ROOMS_JOINED) throw new HttpError(409, 'too_many_rooms', 'Слишком много комнат');
  const id = randomId('rm_');
  for (let i = 0; i < 5; i++) {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
    try {
      await db.batch([
        db.prepare('INSERT INTO comp_rooms (id, name, code, owner_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(id, nm, code, accountId, now),
        db.prepare('INSERT INTO comp_members (room_id, account_id, joined_at) VALUES (?1, ?2, ?3)').bind(id, accountId, now),
      ]);
      return { id, name: nm, code };
    } catch (e) { if (i === 4) throw e; }
  }
}

export async function joinRoom(db, accountId, code, nick, now) {
  await rateLimit(db, 'comp:join:' + accountId, 20, 600, now);
  const c = typeof code === 'string' ? code.replace(/[\s-]/g, '').toUpperCase() : '';
  const room = /^[A-Z0-9]{6}$/.test(c) ? await db.prepare('SELECT id, name FROM comp_rooms WHERE code = ?1').bind(c).first() : null;
  if (!room) throw new HttpError(404, 'room_not_found', 'Комната с таким кодом не найдена');
  await needNick(db, accountId, nick, now);
  const already = await db.prepare('SELECT 1 AS x FROM comp_members WHERE room_id = ?1 AND account_id = ?2').bind(room.id, accountId).first();
  if (!already) {
    if (await memberCount(db, room.id) >= MAX_ROOM_MEMBERS) throw new HttpError(409, 'room_full', 'В комнате нет мест');
    if (await joinedCount(db, accountId) >= MAX_ROOMS_JOINED) throw new HttpError(409, 'too_many_rooms', 'Слишком много комнат');
    await db.prepare('INSERT INTO comp_members (room_id, account_id, joined_at) VALUES (?1, ?2, ?3)').bind(room.id, accountId, now).run();
  }
  return { id: room.id, name: room.name };
}

export async function leaveRoom(db, accountId, roomId) {
  await db.prepare('DELETE FROM comp_members WHERE room_id = ?1 AND account_id = ?2').bind(roomId, accountId).run();
  const room = await db.prepare('SELECT owner_id FROM comp_rooms WHERE id = ?1').bind(roomId).first();
  if (!room) return;
  const next = await db.prepare('SELECT account_id FROM comp_members WHERE room_id = ?1 ORDER BY joined_at LIMIT 1').bind(roomId).first();
  if (!next) await db.prepare('DELETE FROM comp_rooms WHERE id = ?1').bind(roomId).run();
  else if (room.owner_id === accountId) await db.prepare('UPDATE comp_rooms SET owner_id = ?2 WHERE id = ?1').bind(roomId, next.account_id).run();
}

/** Таблица лидеров. scope: 'global' или id комнаты (только для её участников). */
export async function board(db, accountId, scope, period, now) {
  const per = period === 'month' ? 'month' : 'week', { from, to } = periodRange(per, now);
  const sums = `SELECT w.account_id AS a, COUNT(*) AS n, COALESCE(SUM(json_extract(w.data, '$.durationSec')), 0) AS sec
    FROM workout_sessions w WHERE w.deleted = 0 AND w.at >= ?1 AND w.at < ?2 AND COALESCE(json_extract(w.data, '$.completed'), 1) != 0 GROUP BY w.account_id`;
  let rows, title = null;
  if (scope === 'global') {
    const mine = await db.prepare('SELECT global FROM comp_profile WHERE account_id = ?1').bind(accountId).first();
    if (!mine || !mine.global) throw new HttpError(403, 'not_member', 'Вы не участвуете в общем рейтинге');
    rows = (await db.prepare(`SELECT p.account_id AS a, p.nick, COALESCE(s.n, 0) AS n, COALESCE(s.sec, 0) AS sec FROM comp_profile p LEFT JOIN (${sums}) s ON s.a = p.account_id
      WHERE p.global = 1 ORDER BY sec DESC, n DESC, p.nick LIMIT 1000`).bind(from, to).all()).results;
  } else {
    const room = await db.prepare('SELECT r.name FROM comp_rooms r JOIN comp_members m ON m.room_id = r.id WHERE r.id = ?1 AND m.account_id = ?2').bind(scope, accountId).first();
    if (!room) throw new HttpError(403, 'not_member', 'Вы не участвуете в этой комнате');
    title = room.name;
    rows = (await db.prepare(`SELECT p.account_id AS a, p.nick, COALESCE(s.n, 0) AS n, COALESCE(s.sec, 0) AS sec FROM comp_members m JOIN comp_profile p ON p.account_id = m.account_id
      LEFT JOIN (${sums}) s ON s.a = m.account_id WHERE m.room_id = ?3 ORDER BY sec DESC, n DESC, p.nick LIMIT 1000`).bind(from, to, scope).all()).results;
  }
  const ranked = rows.map((r, i) => ({ rank: i + 1, nick: r.nick, workouts: r.n, minutes: Math.round(r.sec / 60), me: r.a === accountId }));
  const top = ranked.slice(0, BOARD_LIMIT), mine = ranked.find((r) => r.me) || null;
  return { scope, title, period: per, from, to, total: ranked.length, rows: top, me: mine };
}
