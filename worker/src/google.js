// @ts-check
// Проверка Google ID token (JWT, RS256) на сервере по правилам Google:
// подпись по открытым ключам Google (JWKS), iss, aud == наш Client ID, exp, (по возможности) nonce.
import { b64urlDecode } from './crypto.js';

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const CLOCK_SKEW_SEC = 120;
let cache = { keys: /** @type {any[]} */ ([]), until: 0 };

async function defaultFetchJwks() {
  const r = await fetch(GOOGLE_JWKS_URL);
  if (!r.ok) throw new Error('jwks_http_' + r.status);
  const cc = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  return { keys: (await r.json()).keys, ttlSec: cc ? Math.min(Number(cc[1]), 86400) : 3600 };
}

/** @param {{fetchJwks?: () => Promise<{keys:any[], ttlSec:number}>, nowMs?: number, nonce?: string}} [opts] */
export async function verifyGoogleIdToken(idToken, clientId, opts = {}) {
  const now = (opts.nowMs ?? Date.now()) / 1000;
  const fetchJwks = opts.fetchJwks || defaultFetchJwks;
  if (!clientId) return { ok: false, reason: 'not_configured' };
  if (typeof idToken !== 'string' || idToken.length > 4096) return { ok: false, reason: 'format' };
  const parts = idToken.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'format' };
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch { return { ok: false, reason: 'format' }; }
  if (!header || typeof header !== 'object' || !claims || typeof claims !== 'object') return { ok: false, reason: 'format' };
  if (header.alg !== 'RS256' || !header.kid) return { ok: false, reason: 'alg' };

  const find = () => cache.keys.find((k) => k.kid === header.kid);
  if (!find() || cache.until < now) {
    try { const { keys, ttlSec } = await fetchJwks(); cache = { keys, until: now + ttlSec }; } catch { if (!find()) return { ok: false, reason: 'jwks_unavailable' }; }
  }
  const jwk = find();
  if (!jwk) return { ok: false, reason: 'unknown_key' };
  let valid = false;
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  } catch { return { ok: false, reason: 'signature' }; }
  if (!valid) return { ok: false, reason: 'signature' };

  if (!ISSUERS.includes(claims.iss)) return { ok: false, reason: 'issuer' };
  if (claims.aud !== clientId) return { ok: false, reason: 'audience' };
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SEC < now) return { ok: false, reason: 'expired' };
  if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW_SEC > now) return { ok: false, reason: 'future' };
  if (typeof claims.sub !== 'string' || !claims.sub) return { ok: false, reason: 'no_sub' };
  if (opts.nonce !== undefined && claims.nonce !== opts.nonce) return { ok: false, reason: 'nonce' };
  return { ok: true, sub: claims.sub, name: claims.name || null, email: claims.email_verified ? claims.email || null : null };
}
/** Для тестов: сбросить кэш ключей. */
export const _resetJwksCache = () => { cache = { keys: [], until: 0 }; };
