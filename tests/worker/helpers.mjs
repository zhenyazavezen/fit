// Тестовое окружение: D1 поверх node:sqlite (те же SQL и транзакции batch), подписанные initData и Google JWT.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hmacSha256, toHex, b64url } from '../../worker/src/crypto.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...p) { const s = new Stmt(this.db, this.sql); s.params = p.map((x) => (x === undefined ? null : x)); return s; }
  _run() { return this.db.prepare(this.sql); }
  async run() { const r = this._run().run(...this.params); return { success: true, meta: { changes: r.changes } }; }
  async first() { return this._run().get(...this.params) ?? null; }
  async all() { return { results: this._run().all(...this.params) }; }
}
export function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(dir, '../../worker/migrations/0001_init.sql'), 'utf8'));
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

export const BOT = '123456:TEST-TOKEN';
export const CLIENT_ID = 'test-client.apps.googleusercontent.com';

export async function makeInitData(user, { botToken = BOT, authDate = Math.floor(Date.now() / 1000), extra = {} } = {}) {
  const p = { auth_date: String(authDate), query_id: 'AAH', user: JSON.stringify(user), ...extra };
  const dcs = Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join('\n');
  const secret = await hmacSha256('WebAppData', botToken);
  const hash = toHex(await hmacSha256(secret, dcs));
  return new URLSearchParams({ ...p, hash }).toString();
}

export async function makeGoogle() {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  async function sign(claims, { header = {}, key = pair.privateKey } = {}) {
    const h = enc({ alg: 'RS256', kid: 'k1', typ: 'JWT', ...header }), c = enc(claims);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(h + '.' + c));
    return h + '.' + c + '.' + b64url(sig);
  }
  const now = Math.floor(Date.now() / 1000);
  const claims = (o = {}) => ({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'g-111', exp: now + 3600, iat: now, email: 'a@example.com', email_verified: true, name: 'G User', ...o });
  return { pair, jwk, sign, claims, fetchJwks: async () => ({ keys: [jwk], ttlSec: 60 }) };
}

export const req = (method, path, { body, token, origin, headers = {} } = {}) => new Request('https://fit.test' + path, {
  method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), 'CF-Connecting-IP': '1.2.3.4', ...headers },
  body: body ? JSON.stringify(body) : undefined,
});
