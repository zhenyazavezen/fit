// src/http.js
var HttpError = class extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
};
var SECURITY_HEADERS = { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const h = { Vary: "Origin" };
  if (origin && allowed.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    h["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS";
    h["Access-Control-Max-Age"] = "600";
  }
  return h;
}
var json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...extra } });
var MAX_BODY = 256 * 1024;
async function readJson(request) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > MAX_BODY) throw new HttpError(413, "too_large", "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u0437\u0430\u043F\u0440\u043E\u0441");
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, "too_large", "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u0437\u0430\u043F\u0440\u043E\u0441");
  try {
    const v = JSON.parse(text || "{}");
    if (v === null || typeof v !== "object" || Array.isArray(v)) throw 0;
    return v;
  } catch {
    throw new HttpError(400, "bad_json", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 JSON");
  }
}

// src/crypto.js
var enc = new TextEncoder();
var toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
var b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function b64urlDecode(s) {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4);
  const bin = atob(p);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function hmacSha256(key, msg) {
  const k = await crypto.subtle.importKey("raw", typeof key === "string" ? enc.encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, typeof msg === "string" ? enc.encode(msg) : msg));
}
async function sha256Hex(s) {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
var randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
var randomId = (prefix) => prefix + toHex(crypto.getRandomValues(new Uint8Array(12)));
function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = crypto.getRandomValues(new Uint8Array(8));
  return [...r].map((x) => alphabet[x % alphabet.length]).join("");
}

// src/telegram.js
var INITDATA_MAX_AGE_SEC = 24 * 3600;
var FUTURE_SKEW_SEC = 60;
async function verifyInitData(initData, botToken, nowMs = Date.now(), maxAgeSec = INITDATA_MAX_AGE_SEC) {
  if (typeof initData !== "string" || !initData || initData.length > 4096) return { ok: false, reason: "format" };
  if (!botToken) return { ok: false, reason: "not_configured" };
  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "format" };
  }
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: "format" };
  params.delete("hash");
  const pairs = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const dcs = pairs.map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = await hmacSha256("WebAppData", botToken);
  const calc = toHex(await hmacSha256(secret, dcs));
  if (!timingSafeEqual(calc, hash)) return { ok: false, reason: "signature" };
  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate) || authDate <= 0) return { ok: false, reason: "format" };
  const age = nowMs / 1e3 - authDate;
  if (age > maxAgeSec) return { ok: false, reason: "expired" };
  if (age < -FUTURE_SKEW_SEC) return { ok: false, reason: "future" };
  let user;
  try {
    user = JSON.parse(params.get("user") || "");
  } catch {
    return { ok: false, reason: "no_user" };
  }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return { ok: false, reason: "no_user" };
  return { ok: true, user, authDate };
}

// src/google.js
var GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
var ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
var CLOCK_SKEW_SEC = 120;
var cache = { keys: (
  /** @type {any[]} */
  []
), until: 0 };
async function defaultFetchJwks() {
  const r = await fetch(GOOGLE_JWKS_URL);
  if (!r.ok) throw new Error("jwks_http_" + r.status);
  const cc = /max-age=(\d+)/.exec(r.headers.get("cache-control") || "");
  return { keys: (await r.json()).keys, ttlSec: cc ? Math.min(Number(cc[1]), 86400) : 3600 };
}
async function verifyGoogleIdToken(idToken, clientId, opts = {}) {
  const now = (opts.nowMs ?? Date.now()) / 1e3;
  const fetchJwks = opts.fetchJwks || defaultFetchJwks;
  if (!clientId) return { ok: false, reason: "not_configured" };
  if (typeof idToken !== "string" || idToken.length > 4096) return { ok: false, reason: "format" };
  const parts = idToken.split(".");
  if (parts.length !== 3) return { ok: false, reason: "format" };
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    return { ok: false, reason: "format" };
  }
  if (header.alg !== "RS256" || !header.kid) return { ok: false, reason: "alg" };
  const find = () => cache.keys.find((k) => k.kid === header.kid);
  if (!find() || cache.until < now) {
    try {
      const { keys, ttlSec } = await fetchJwks();
      cache = { keys, until: now + ttlSec };
    } catch {
      if (!find()) return { ok: false, reason: "jwks_unavailable" };
    }
  }
  const jwk = find();
  if (!jwk) return { ok: false, reason: "unknown_key" };
  let valid = false;
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlDecode(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  } catch {
    return { ok: false, reason: "signature" };
  }
  if (!valid) return { ok: false, reason: "signature" };
  if (!ISSUERS.includes(claims.iss)) return { ok: false, reason: "issuer" };
  if (claims.aud !== clientId) return { ok: false, reason: "audience" };
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SEC < now) return { ok: false, reason: "expired" };
  if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_SEC > now) return { ok: false, reason: "future" };
  if (typeof claims.sub !== "string" || !claims.sub) return { ok: false, reason: "no_sub" };
  if (opts.nonce !== void 0 && claims.nonce !== opts.nonce) return { ok: false, reason: "nonce" };
  return { ok: true, sub: claims.sub, name: claims.name || null, email: claims.email_verified ? claims.email || null : null };
}

// src/ratelimit.js
async function rateLimit(db, key, max, windowSec, now = Date.now()) {
  const win = windowSec * 1e3;
  const start = Math.floor(now / win) * win;
  await db.prepare(
    `INSERT INTO rate_limits (k, window_start, n) VALUES (?1, ?2, 1)
     ON CONFLICT(k) DO UPDATE SET n = CASE WHEN window_start = ?2 THEN n + 1 ELSE 1 END, window_start = ?2`
  ).bind(key, start).run();
  const row = await db.prepare("SELECT n FROM rate_limits WHERE k = ?1").bind(key).first();
  if (row && row.n > max) throw new HttpError(429, "rate_limited", "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u043F\u043E\u043F\u044B\u0442\u043E\u043A. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435.");
}
async function cleanup(db, now = Date.now()) {
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at < ?1").bind(now),
    db.prepare("DELETE FROM link_codes WHERE expires_at < ?1").bind(now),
    db.prepare("DELETE FROM rate_limits WHERE window_start < ?1").bind(now - 2 * 3600 * 1e3)
  ]);
}

// src/accounts.js
var SESSION_TTL_MS = 30 * 24 * 3600 * 1e3;
var LINK_TTL_MS = 10 * 60 * 1e3;
var MAX_LINK_ATTEMPTS = 5;
var audit = (db, accountId, event, detail, now) => db.prepare("INSERT INTO audit_log (at, account_id, event, detail) VALUES (?1, ?2, ?3, ?4)").bind(now, accountId, event, detail ?? null);
var clean = (s, n = 80) => typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, n) : null;
async function loginWithIdentity(db, provider, subject, info, now = Date.now()) {
  const find = () => db.prepare("SELECT account_id FROM identities WHERE provider = ?1 AND subject = ?2").bind(provider, subject).first();
  let row = await find();
  if (row) {
    await db.batch([
      db.prepare("UPDATE identities SET last_login_at = ?3, display_name = COALESCE(?4, display_name), username = COALESCE(?5, username) WHERE provider = ?1 AND subject = ?2").bind(provider, subject, now, clean(info.displayName), clean(info.username, 40)),
      db.prepare("UPDATE accounts SET last_seen_at = ?2 WHERE id = ?1").bind(row.account_id, now)
    ]);
    return { accountId: row.account_id, isNew: false };
  }
  const accountId = randomId("acc_");
  try {
    await db.batch([
      db.prepare("INSERT INTO accounts (id, created_at, last_seen_at) VALUES (?1, ?2, ?2)").bind(accountId, now),
      db.prepare("INSERT INTO identities (provider, subject, account_id, display_name, username, created_at, last_login_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)").bind(provider, subject, accountId, clean(info.displayName), clean(info.username, 40), now),
      audit(db, accountId, "account_created", provider, now)
    ]);
  } catch (e) {
    row = await find();
    if (!row) throw e;
    return { accountId: row.account_id, isNew: false };
  }
  return { accountId, isNew: true };
}
async function createSession(db, accountId, provider, now = Date.now()) {
  const token = randomToken(32);
  await db.prepare("INSERT INTO sessions (token_hash, account_id, provider, created_at, expires_at, last_used_at) VALUES (?1, ?2, ?3, ?4, ?5, ?4)").bind(await sha256Hex(token), accountId, provider, now, now + SESSION_TTL_MS).run();
  return { token, expiresAt: now + SESSION_TTL_MS };
}
async function authenticate(request, db, now = Date.now()) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(request.headers.get("Authorization") || "");
  if (!m) throw new HttpError(401, "unauthorized", "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0432\u0445\u043E\u0434");
  const hash = await sha256Hex(m[1]);
  const s = await db.prepare(
    `SELECT s.token_hash, s.account_id, s.provider, s.expires_at, s.last_used_at FROM sessions s
     JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ?1 AND a.merged_into IS NULL`
  ).bind(hash).first();
  if (!s || s.expires_at < now) throw new HttpError(401, "unauthorized", "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430 \u0438\u043B\u0438 \u0438\u0441\u0442\u0435\u043A\u043B\u0430");
  if (now - s.last_used_at > 36e5) {
    const exp = Math.max(s.expires_at, now + SESSION_TTL_MS);
    await db.prepare("UPDATE sessions SET last_used_at = ?2, expires_at = ?3 WHERE token_hash = ?1").bind(hash, now, exp).run();
  }
  return { accountId: s.account_id, provider: s.provider, tokenHash: hash };
}
async function revokeSession(db, tokenHash) {
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(tokenHash).run();
}
async function getMe(db, accountId, now = Date.now()) {
  const a = await db.prepare("SELECT id, created_at, premium_until, sync_rev FROM accounts WHERE id = ?1").bind(accountId).first();
  if (!a) throw new HttpError(404, "not_found", "\u0410\u043A\u043A\u0430\u0443\u043D\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
  const ids = await db.prepare("SELECT provider, display_name, username, created_at FROM identities WHERE account_id = ?1 ORDER BY created_at").bind(accountId).all();
  return {
    id: a.id,
    createdAt: a.created_at,
    syncRev: a.sync_rev,
    premium: { active: a.premium_until > now, until: a.premium_until || null },
    identities: ids.results.map((i) => ({ provider: i.provider, displayName: i.display_name, username: i.username }))
  };
}
var counts = async (db, accountId) => {
  const w = await db.prepare("SELECT COUNT(*) AS n FROM workout_sessions WHERE account_id = ?1 AND deleted = 0").bind(accountId).first();
  const idn = await db.prepare("SELECT provider FROM identities WHERE account_id = ?1").bind(accountId).all();
  const a = await db.prepare("SELECT created_at FROM accounts WHERE id = ?1").bind(accountId).first();
  return { workouts: w.n, providers: idn.results.map((r) => r.provider), createdAt: a.created_at };
};
async function startLink(db, accountId, now = Date.now()) {
  await rateLimit(db, "linkstart:" + accountId, 10, 600, now);
  const code = randomCode();
  await db.batch([
    db.prepare("DELETE FROM link_codes WHERE account_id = ?1").bind(accountId),
    db.prepare("INSERT INTO link_codes (code_hash, account_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)").bind(await sha256Hex(code), accountId, now, now + LINK_TTL_MS)
  ]);
  return { code, expiresAt: now + LINK_TTL_MS };
}
async function resolveCode(db, completerId, rawCode, now) {
  await rateLimit(db, "linkcheck:" + completerId, 10, 600, now);
  const code = String(rawCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8) throw new HttpError(400, "bad_code", "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043A\u043E\u0434");
  const hash = await sha256Hex(code);
  const row = await db.prepare("SELECT code_hash, account_id, expires_at, attempts FROM link_codes WHERE code_hash = ?1").bind(hash).first();
  if (!row || row.expires_at < now || row.attempts >= MAX_LINK_ATTEMPTS) throw new HttpError(400, "bad_code", "\u041A\u043E\u0434 \u043D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u0438\u0441\u0442\u0451\u043A");
  if (row.account_id === completerId) throw new HttpError(400, "same_account", "\u042D\u0442\u043E\u0442 \u043A\u043E\u0434 \u0441\u043E\u0437\u0434\u0430\u043D \u0432 \u044D\u0442\u043E\u043C \u0436\u0435 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0435. \u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0435\u0433\u043E \u0432 \u0434\u0440\u0443\u0433\u043E\u043C \u0441\u043F\u043E\u0441\u043E\u0431\u0435 \u0432\u0445\u043E\u0434\u0430.");
  const other = await db.prepare("SELECT merged_into FROM accounts WHERE id = ?1").bind(row.account_id).first();
  if (!other || other.merged_into) throw new HttpError(400, "bad_code", "\u041A\u043E\u0434 \u043D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u0438\u0441\u0442\u0451\u043A");
  return { hash, creatorId: row.account_id };
}
async function previewLink(db, completerId, rawCode, now = Date.now()) {
  const { creatorId } = await resolveCode(db, completerId, rawCode, now);
  const a = await counts(db, creatorId), b = await counts(db, completerId);
  const conflict = a.providers.filter((p) => b.providers.includes(p));
  return { conflict: conflict.length ? conflict[0] : null, other: { workouts: a.workouts, providers: a.providers }, mine: { workouts: b.workouts, providers: b.providers } };
}
function mergeDocs(p, s) {
  const out = {};
  const keys = /* @__PURE__ */ new Set([...Object.keys(p), ...Object.keys(s)]);
  for (const k of keys) {
    const a = p[k], b = s[k];
    if (!a) {
      out[k] = b;
      continue;
    }
    if (!b) {
      out[k] = a;
      continue;
    }
    if (k === "favorites") out[k] = { value: [.../* @__PURE__ */ new Set([...a.value || [], ...b.value || []])], updatedAt: Math.max(a.updatedAt, b.updatedAt) };
    else if (k === "programs") {
      const ids = new Set((a.value || []).map((x) => x.id));
      out[k] = { value: [...a.value || [], ...(b.value || []).filter((x) => !ids.has(x.id))], updatedAt: Math.max(a.updatedAt, b.updatedAt) };
    } else out[k] = a.updatedAt >= b.updatedAt ? a : b;
  }
  return out;
}
var loadDocs = async (db, id) => {
  const r = await db.prepare("SELECT doc_key, value, updated_at FROM user_docs WHERE account_id = ?1").bind(id).all();
  return Object.fromEntries(r.results.map((d) => [d.doc_key, { value: JSON.parse(d.value), updatedAt: d.updated_at }]));
};
async function completeLink(db, completerId, completerProvider, rawCode, now = Date.now()) {
  const { hash, creatorId } = await resolveCode(db, completerId, rawCode, now);
  const a = await counts(db, creatorId), b = await counts(db, completerId);
  if (a.providers.some((p) => b.providers.includes(p))) throw new HttpError(409, "provider_conflict", "\u0412 \u043E\u0431\u043E\u0438\u0445 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430\u0445 \u0443\u0436\u0435 \u0435\u0441\u0442\u044C \u0432\u0445\u043E\u0434 \u044D\u0442\u043E\u0433\u043E \u0442\u0438\u043F\u0430. \u041E\u0431\u044A\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435 \u043D\u0435\u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E.");
  const primary = a.workouts !== b.workouts ? a.workouts > b.workouts ? creatorId : completerId : a.createdAt <= b.createdAt ? creatorId : completerId;
  const secondary = primary === creatorId ? completerId : creatorId;
  const docs = mergeDocs(await loadDocs(db, primary), await loadDocs(db, secondary));
  const upserts = Object.entries(docs).map(([k, d]) => db.prepare(
    `INSERT INTO user_docs (account_id, doc_key, value, rev, updated_at) VALUES (?1, ?2, ?3, (SELECT sync_rev FROM accounts WHERE id = ?1), ?4)
     ON CONFLICT(account_id, doc_key) DO UPDATE SET value = excluded.value, rev = excluded.rev, updated_at = excluded.updated_at`
  ).bind(primary, k, JSON.stringify(d.value), d.updatedAt));
  await db.batch([
    db.prepare("UPDATE accounts SET sync_rev = sync_rev + 1 WHERE id = ?1").bind(primary),
    db.prepare("UPDATE identities SET account_id = ?1 WHERE account_id = ?2").bind(primary, secondary),
    db.prepare(`INSERT OR IGNORE INTO workout_sessions (account_id, id, data, at, deleted, rev)
                SELECT ?1, id, data, at, deleted, (SELECT sync_rev FROM accounts WHERE id = ?1) FROM workout_sessions WHERE account_id = ?2`).bind(primary, secondary),
    ...upserts,
    db.prepare("DELETE FROM workout_sessions WHERE account_id = ?1").bind(secondary),
    db.prepare("DELETE FROM user_docs WHERE account_id = ?1").bind(secondary),
    db.prepare("DELETE FROM sessions WHERE account_id = ?1").bind(secondary),
    db.prepare("DELETE FROM link_codes WHERE account_id IN (?1, ?2)").bind(primary, secondary),
    db.prepare("UPDATE accounts SET premium_until = MAX(premium_until, (SELECT premium_until FROM accounts WHERE id = ?2)) WHERE id = ?1").bind(primary, secondary),
    db.prepare("UPDATE accounts SET merged_into = ?1, premium_until = 0 WHERE id = ?2").bind(primary, secondary),
    audit(db, primary, "accounts_merged", `from ${secondary}`, now)
  ]);
  void hash;
  const session = await createSession(db, primary, completerProvider, now);
  return { accountId: primary, session };
}
async function unlinkIdentity(db, accountId, currentProvider, provider, now = Date.now()) {
  if (!["telegram", "google"].includes(provider)) throw new HttpError(400, "bad_provider", "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0441\u043F\u043E\u0441\u043E\u0431 \u0432\u0445\u043E\u0434\u0430");
  if (provider === currentProvider) throw new HttpError(400, "use_other_session", "\u0427\u0442\u043E\u0431\u044B \u043E\u0442\u0432\u044F\u0437\u0430\u0442\u044C \u044D\u0442\u043E\u0442 \u0441\u043F\u043E\u0441\u043E\u0431, \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u0438\u043C \u0441\u043F\u043E\u0441\u043E\u0431\u043E\u043C.");
  const list = await db.prepare("SELECT provider FROM identities WHERE account_id = ?1").bind(accountId).all();
  if (list.results.length < 2 || !list.results.some((r) => r.provider === provider)) throw new HttpError(400, "last_identity", "\u041D\u0435\u043B\u044C\u0437\u044F \u043E\u0442\u0432\u044F\u0437\u0430\u0442\u044C \u0435\u0434\u0438\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u0441\u043F\u043E\u0441\u043E\u0431 \u0432\u0445\u043E\u0434\u0430");
  await db.batch([
    db.prepare("DELETE FROM identities WHERE account_id = ?1 AND provider = ?2").bind(accountId, provider),
    db.prepare("DELETE FROM sessions WHERE account_id = ?1 AND provider = ?2").bind(accountId, provider),
    audit(db, accountId, "identity_unlinked", provider, now)
  ]);
}
async function deleteAccount(db, accountId) {
  await db.batch([
    db.prepare("DELETE FROM audit_log WHERE account_id = ?1").bind(accountId),
    db.prepare("DELETE FROM accounts WHERE id = ?1").bind(accountId)
  ]);
}

// src/sync.js
var DOC_KEYS = ["settings", "profile", "favorites", "programs"];
var MAX_DOC_BYTES = 64 * 1024;
var MAX_SESSIONS_PER_PUSH = 200;
var MAX_SESSIONS_PER_ACCOUNT = 5e3;
var PULL_LIMIT = 500;
var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
var isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var finite = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
var str = (v, n) => typeof v === "string" && v.length <= n;
function validateDoc(key, value) {
  const bad = (m) => new HttpError(400, "bad_doc", `${key}: ${m}`);
  if (JSON.stringify(value).length > MAX_DOC_BYTES) throw new HttpError(413, "too_large", `${key}: \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442`);
  if (key === "favorites") {
    if (!Array.isArray(value) || value.length > 500 || !value.every((x) => str(x, 64) && ID_RE.test(x))) throw bad("\u043E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u0441\u043F\u0438\u0441\u043E\u043A \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440\u043E\u0432");
    return [...new Set(value)];
  }
  if (key === "programs") {
    if (!Array.isArray(value) || value.length > 100) throw bad("\u043E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u0441\u043F\u0438\u0441\u043E\u043A \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C");
    for (const p of value) {
      if (!isObj(p) || !str(p.id, 64) || !ID_RE.test(p.id) || !str(p.name, 100) || !Array.isArray(p.items) || p.items.length > 60) throw bad("\u043D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0430");
      for (const it of p.items) if (!isObj(it) || !str(it.ex, 64) || !ID_RE.test(it.ex)) throw bad("\u043D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0443\u043F\u0440\u0430\u0436\u043D\u0435\u043D\u0438\u0435 \u0432 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0435");
    }
    return value;
  }
  if (key === "settings") {
    if (!isObj(value) || Object.keys(value).length > 30) throw bad("\u043E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u043E\u0431\u044A\u0435\u043A\u0442");
    return Object.fromEntries(Object.entries(value).filter(([k, v]) => str(k, 30) && (typeof v === "boolean" || v === null || str(v, 30) || finite(v, -1e9, 1e9))));
  }
  if (key === "profile") {
    if (!isObj(value)) throw bad("\u043E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u043E\u0431\u044A\u0435\u043A\u0442");
    return value;
  }
  throw new HttpError(400, "bad_doc", "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442");
}
function cleanSession(s) {
  if (!isObj(s) || !str(s.id, 64) || !ID_RE.test(s.id) || !finite(s.at, 1e12, 42e11)) throw new HttpError(400, "bad_session", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C \u0442\u0440\u0435\u043D\u0438\u0440\u043E\u0432\u043A\u0438");
  const o = { id: s.id, at: Math.round(s.at) };
  if (finite(s.startedAt, 1e12, 42e11)) o.startedAt = Math.round(s.startedAt);
  if (finite(s.durationSec, 0, 86400)) o.durationSec = Math.round(s.durationSec);
  if (str(s.programId, 64) || s.programId === null) o.programId = s.programId;
  if (str(s.title, 120)) o.title = s.title;
  if (finite(s.setsDone, 0, 1e3)) o.setsDone = Math.round(s.setsDone);
  if (finite(s.exercisesDone, 0, 200)) o.exercisesDone = Math.round(s.exercisesDone);
  if (Array.isArray(s.exerciseIds)) o.exerciseIds = s.exerciseIds.filter((x) => str(x, 64)).slice(0, 100);
  if (typeof s.completed === "boolean") o.completed = s.completed;
  return o;
}
async function pull(db, accountId, since) {
  since = Number.isSafeInteger(since) && since >= 0 ? since : 0;
  const acc = await db.prepare("SELECT sync_rev FROM accounts WHERE id = ?1").bind(accountId).first();
  const docs = await db.prepare("SELECT doc_key, value, rev, updated_at FROM user_docs WHERE account_id = ?1 AND rev > ?2").bind(accountId, since).all();
  const ws = await db.prepare("SELECT id, data, deleted, rev FROM workout_sessions WHERE account_id = ?1 AND rev > ?2 ORDER BY rev, id LIMIT ?3").bind(accountId, since, PULL_LIMIT + 1).all();
  const more = ws.results.length > PULL_LIMIT;
  const rows = more ? ws.results.slice(0, PULL_LIMIT) : ws.results;
  const rev = more ? rows[rows.length - 1].rev : acc.sync_rev;
  return {
    rev,
    more,
    docs: docs.results.filter((d) => !more || d.rev <= rev).map((d) => ({ key: d.doc_key, value: JSON.parse(d.value), rev: d.rev, updatedAt: d.updated_at })),
    sessions: rows.map((r) => ({ id: r.id, deleted: !!r.deleted, data: JSON.parse(r.data), rev: r.rev }))
  };
}
async function push(db, accountId, payload, now = Date.now()) {
  const docsIn = payload.docs ?? {};
  const sessIn = payload.sessions ?? [];
  const delIn = payload.deleted ?? [];
  if (!isObj(docsIn) || !Array.isArray(sessIn) || !Array.isArray(delIn)) throw new HttpError(400, "bad_request", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0437\u0430\u043F\u0440\u043E\u0441 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438");
  if (sessIn.length > MAX_SESSIONS_PER_PUSH || delIn.length > MAX_SESSIONS_PER_PUSH) throw new HttpError(413, "too_large", "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u0437\u0430 \u0440\u0430\u0437");
  const docs = [];
  for (const [key, d] of Object.entries(docsIn)) {
    if (!DOC_KEYS.includes(key)) throw new HttpError(400, "bad_doc", "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442: " + key);
    if (!isObj(d) || !finite(d.updatedAt, 0, 42e11)) throw new HttpError(400, "bad_doc", key + ": \u043D\u0443\u0436\u0435\u043D updatedAt");
    docs.push({ key, value: validateDoc(key, d.value), updatedAt: Math.min(Math.round(d.updatedAt), now + 5 * 6e4) });
  }
  const sessions = sessIn.map(cleanSession);
  const dels = delIn.map((id) => {
    if (!str(id, 64) || !ID_RE.test(id)) throw new HttpError(400, "bad_session", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 id");
    return id;
  });
  if (sessions.length) {
    const have = await db.prepare("SELECT COUNT(*) AS n FROM workout_sessions WHERE account_id = ?1").bind(accountId).first();
    if (have.n + sessions.length > MAX_SESSIONS_PER_ACCOUNT) throw new HttpError(413, "quota", "\u0414\u043E\u0441\u0442\u0438\u0433\u043D\u0443\u0442 \u043F\u0440\u0435\u0434\u0435\u043B \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u043E\u0439 \u0438\u0441\u0442\u043E\u0440\u0438\u0438");
  }
  if (!docs.length && !sessions.length && !dels.length) return { conflicts: [] };
  const REV = "(SELECT sync_rev FROM accounts WHERE id = ?1)";
  const stmts = [db.prepare("UPDATE accounts SET sync_rev = sync_rev + 1, last_seen_at = ?2 WHERE id = ?1").bind(accountId, now)];
  for (const d of docs) {
    stmts.push(db.prepare(
      `INSERT INTO user_docs (account_id, doc_key, value, rev, updated_at) VALUES (?1, ?2, ?3, ${REV}, ?4)
       ON CONFLICT(account_id, doc_key) DO UPDATE SET value = excluded.value, rev = excluded.rev, updated_at = excluded.updated_at
       WHERE excluded.updated_at > user_docs.updated_at`
    ).bind(accountId, d.key, JSON.stringify(d.value), d.updatedAt));
  }
  for (const s of sessions) {
    stmts.push(db.prepare(`INSERT OR IGNORE INTO workout_sessions (account_id, id, data, at, deleted, rev) VALUES (?1, ?2, ?3, ?4, 0, ${REV})`).bind(accountId, s.id, JSON.stringify(s), s.at));
  }
  for (const id of dels) {
    stmts.push(db.prepare(`UPDATE workout_sessions SET deleted = 1, rev = ${REV} WHERE account_id = ?1 AND id = ?2 AND deleted = 0`).bind(accountId, id));
    stmts.push(db.prepare(`INSERT OR IGNORE INTO workout_sessions (account_id, id, data, at, deleted, rev) VALUES (?1, ?2, '{}', 0, 1, ${REV})`).bind(accountId, id));
  }
  await db.batch(stmts);
  const conflicts = [];
  for (const d of docs) {
    const cur = await db.prepare("SELECT value, updated_at FROM user_docs WHERE account_id = ?1 AND doc_key = ?2").bind(accountId, d.key).first();
    if (cur && JSON.stringify(JSON.parse(cur.value)) !== JSON.stringify(d.value)) conflicts.push({ key: d.key, value: JSON.parse(cur.value), updatedAt: cur.updated_at });
  }
  return { conflicts };
}

// src/index.js
var ipOf = (req) => req.headers.get("CF-Connecting-IP") || "unknown";
async function loginResponse(env, provider, subject, info, now) {
  const { accountId, isNew } = await loginWithIdentity(env.DB, provider, subject, info, now);
  const session = await createSession(env.DB, accountId, provider, now);
  return { token: session.token, expiresAt: session.expiresAt, isNew, account: await getMe(env.DB, accountId, now) };
}
async function handle(request, env, opts = {}) {
  const now = opts.now ?? Date.now();
  const url = new URL(request.url);
  const { pathname: path } = url, method = request.method;
  const db = env.DB;
  if (method === "GET" && path === "/health") return json({ ok: true });
  if (Math.random() < 0.02) {
    try {
      await cleanup(db, now);
    } catch {
    }
  }
  if (method === "POST" && path === "/auth/telegram") {
    await rateLimit(db, "auth:" + ipOf(request), 30, 600, now);
    const body = await readJson(request);
    const r = await verifyInitData(body.initData, env.TELEGRAM_BOT_TOKEN, now);
    if (!r.ok) throw new HttpError(r.reason === "not_configured" ? 503 : 401, "auth_failed", r.reason === "not_configured" ? "\u0412\u0445\u043E\u0434 \u0447\u0435\u0440\u0435\u0437 Telegram \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D" : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0432\u0445\u043E\u0434 \u0447\u0435\u0440\u0435\u0437 Telegram");
    const name = [r.user.first_name, r.user.last_name].filter(Boolean).join(" ");
    return json(await loginResponse(env, "telegram", String(r.user.id), { displayName: name, username: r.user.username }, now));
  }
  if (method === "POST" && path === "/auth/google") {
    await rateLimit(db, "auth:" + ipOf(request), 30, 600, now);
    const body = await readJson(request);
    const r = await verifyGoogleIdToken(body.idToken, env.GOOGLE_CLIENT_ID, { nowMs: now, nonce: typeof body.nonce === "string" ? body.nonce : void 0, ...opts.googleOpts || {} });
    if (!r.ok) throw new HttpError(r.reason === "not_configured" ? 503 : 401, "auth_failed", r.reason === "not_configured" ? "\u0412\u0445\u043E\u0434 \u0447\u0435\u0440\u0435\u0437 Google \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D" : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0432\u0445\u043E\u0434 \u0447\u0435\u0440\u0435\u0437 Google");
    return json(await loginResponse(env, "google", r.sub, { displayName: r.name }, now));
  }
  const auth = await authenticate(request, db, now);
  if (method === "POST" && path === "/auth/logout") {
    await revokeSession(db, auth.tokenHash);
    return json({ ok: true });
  }
  if (method === "GET" && path === "/me") return json(await getMe(db, auth.accountId, now));
  if (method === "DELETE" && path === "/me") {
    const body = await readJson(request);
    if (body.confirm !== "DELETE") throw new HttpError(400, "confirm_required", "\u041D\u0443\u0436\u043D\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u044F");
    await deleteAccount(db, auth.accountId);
    return json({ ok: true });
  }
  if (method === "POST" && path === "/link/start") return json(await startLink(db, auth.accountId, now));
  if (method === "POST" && path === "/link/preview") {
    const b = await readJson(request);
    return json(await previewLink(db, auth.accountId, b.code, now));
  }
  if (method === "POST" && path === "/link/complete") {
    const b = await readJson(request);
    if (b.confirm !== true) throw new HttpError(400, "confirm_required", "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043E\u0431\u044A\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435");
    const r = await completeLink(db, auth.accountId, auth.provider, b.code, now);
    return json({ token: r.session.token, expiresAt: r.session.expiresAt, account: await getMe(db, r.accountId, now) });
  }
  if (method === "POST" && path === "/link/unlink") {
    const b = await readJson(request);
    await unlinkIdentity(db, auth.accountId, auth.provider, b.provider, now);
    return json({ account: await getMe(db, auth.accountId, now) });
  }
  if (method === "GET" && path === "/sync") return json(await pull(db, auth.accountId, Number(url.searchParams.get("since") || 0)));
  if (method === "POST" && path === "/sync") {
    const b = await readJson(request);
    const { conflicts } = await push(db, auth.accountId, b, now);
    return json({ ...await pull(db, auth.accountId, Number.isSafeInteger(b.baseRev) ? b.baseRev : 0), conflicts });
  }
  throw new HttpError(404, "not_found", "\u041C\u0430\u0440\u0448\u0440\u0443\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
}
var index_default = {
  /** @param {Request} request @param {any} env */
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const origin = request.headers.get("Origin");
    if (origin && !cors["Access-Control-Allow-Origin"]) return json({ error: { code: "forbidden_origin", message: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u043D\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D" } }, 403, cors);
    try {
      const res = await handle(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status, cors);
      console.error(
        "internal",
        /** @type {any} */
        e?.message
      );
      return json({ error: { code: "internal", message: "\u0412\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u044F\u044F \u043E\u0448\u0438\u0431\u043A\u0430" } }, 500, cors);
    }
  }
};
export {
  index_default as default,
  handle
};
