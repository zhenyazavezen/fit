// @ts-check
// Ограничение частоты в D1 (окно фиксированной длины). Только для чувствительных маршрутов: вход и коды привязки.
import { HttpError } from './http.js';

export async function rateLimit(db, key, max, windowSec, now = Date.now()) {
  const win = windowSec * 1000;
  const start = Math.floor(now / win) * win;
  await db.prepare(
    `INSERT INTO rate_limits (k, window_start, n) VALUES (?1, ?2, 1)
     ON CONFLICT(k) DO UPDATE SET n = CASE WHEN window_start = ?2 THEN n + 1 ELSE 1 END, window_start = ?2`).bind(key, start).run();
  const row = await db.prepare('SELECT n FROM rate_limits WHERE k = ?1').bind(key).first();
  if (row && row.n > max) throw new HttpError(429, 'rate_limited', 'Слишком много попыток. Попробуйте позже.');
}
export async function cleanup(db, now = Date.now()) {
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(now),
    db.prepare('DELETE FROM link_codes WHERE expires_at < ?1').bind(now),
    db.prepare('DELETE FROM rate_limits WHERE window_start < ?1').bind(now - 2 * 3600 * 1000),
  ]);
}
