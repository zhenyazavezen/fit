// @ts-check
// Проверка initData Telegram Mini App на сервере (алгоритм из официальной документации Telegram):
//  1) разобрать строку как query-параметры, убрать hash;
//  2) отсортировать оставшиеся пары по ключу, собрать "key=value" через \n;
//  3) secret = HMAC_SHA256(key="WebAppData", msg=<токен бота>);
//  4) hash должен равняться hex(HMAC_SHA256(key=secret, msg=строка из шага 2));
//  5) auth_date не старше допустимого возраста (защита от повторного использования старых данных).
import { hmacSha256, toHex, timingSafeEqual } from './crypto.js';

export const INITDATA_MAX_AGE_SEC = 24 * 3600;
const FUTURE_SKEW_SEC = 60;

/**
 * @param {string} initData
 * @param {string} botToken
 * @param {number} [nowMs]
 * @param {number} [maxAgeSec]
 * @returns {Promise<{ok:true, user:{id:number, first_name?:string, last_name?:string, username?:string, language_code?:string}, authDate:number}|{ok:false, reason:string}>}
 */
export async function verifyInitData(initData, botToken, nowMs = Date.now(), maxAgeSec = INITDATA_MAX_AGE_SEC) {
  if (typeof initData !== 'string' || !initData || initData.length > 4096) return { ok: false, reason: 'format' };
  if (!botToken) return { ok: false, reason: 'not_configured' };
  let params;
  try { params = new URLSearchParams(initData); } catch { return { ok: false, reason: 'format' }; }
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: 'format' };
  params.delete('hash');
  const pairs = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dcs = pairs.map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmacSha256('WebAppData', botToken);
  const calc = toHex(await hmacSha256(secret, dcs));
  if (!timingSafeEqual(calc, hash)) return { ok: false, reason: 'signature' };
  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate <= 0) return { ok: false, reason: 'format' };
  const age = nowMs / 1000 - authDate;
  if (age > maxAgeSec) return { ok: false, reason: 'expired' };
  if (age < -FUTURE_SKEW_SEC) return { ok: false, reason: 'future' };
  let user;
  try { user = JSON.parse(params.get('user') || ''); } catch { return { ok: false, reason: 'no_user' }; }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return { ok: false, reason: 'no_user' };
  return { ok: true, user, authDate };
}
