// @ts-check
// Криптография только на Web Crypto (есть в Workers и в Node 22).
const enc = new TextEncoder();

/** @param {Uint8Array|ArrayBuffer} buf */
export const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
/** @param {Uint8Array|ArrayBuffer} buf */
export const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** @param {string} s */
export function b64urlDecode(s) {
  const p = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(p);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** @param {string|Uint8Array} key @param {string|Uint8Array} msg */
export async function hmacSha256(key, msg) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, typeof msg === 'string' ? enc.encode(msg) : msg));
}
/** @param {string} s */
export async function sha256Hex(s) { return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }

/** Сравнение строк за постоянное время (для подписей и хэшей). */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
export const randomId = (prefix) => prefix + toHex(crypto.getRandomValues(new Uint8Array(12)));
/** Код привязки: 8 символов без похожих (0/O, 1/I). Энтропия ≈ 40 бит, но код живёт 10 минут и ограничен по попыткам. */
export function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(8));
  return [...r].map((x) => alphabet[x % alphabet.length]).join('');
}
