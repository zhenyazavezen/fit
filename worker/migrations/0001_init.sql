-- ZAVEZEN_FIT · Cloudflare D1 · миграция 0001
-- Время — миллисекунды Unix (UTC). Секретов в базе нет: токен бота и ключи лежат только в secrets Worker.
-- Токены сессий и коды привязки хранятся только в виде SHA-256 (утечка базы не раскрывает рабочие токены).

CREATE TABLE accounts (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  premium_until INTEGER NOT NULL DEFAULT 0,          -- 0 = нет Premium; платежей пока нет, поле готово для подключения
  sync_rev      INTEGER NOT NULL DEFAULT 0,          -- счётчик изменений аккаунта (для синхронизации «с ревизии N»)
  merged_into   TEXT REFERENCES accounts(id)         -- аккаунт объединён в другой (после привязки способов входа)
) STRICT;

-- Способ входа. Один и тот же (provider, subject) не может принадлежать двум аккаунтам,
-- а один аккаунт не может иметь двух входов одного провайдера: так исключаются дубли.
CREATE TABLE identities (
  provider      TEXT NOT NULL CHECK (provider IN ('telegram', 'google')),
  subject       TEXT NOT NULL,                       -- Telegram user id / Google sub
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  display_name  TEXT,
  username      TEXT,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  PRIMARY KEY (provider, subject),
  UNIQUE (account_id, provider)
) STRICT, WITHOUT ROWID;

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX idx_sessions_account ON sessions(account_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Одноразовый код привязки второго способа входа (живёт 10 минут).
CREATE TABLE link_codes (
  code_hash  TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0
) STRICT, WITHOUT ROWID;
CREATE INDEX idx_link_codes_account ON link_codes(account_id);

-- Документы пользователя: settings, profile, favorites, programs. Последняя запись по времени клиента побеждает.
CREATE TABLE user_docs (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  doc_key    TEXT NOT NULL,
  value      TEXT NOT NULL CHECK (json_valid(value)),
  rev        INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, doc_key)
) STRICT, WITHOUT ROWID;

-- История тренировок: запись идентифицируется id, созданным на клиенте, поэтому повторная отправка безопасна.
CREATE TABLE workout_sessions (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,
  data       TEXT NOT NULL CHECK (json_valid(data)),
  at         INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  rev        INTEGER NOT NULL,
  PRIMARY KEY (account_id, id)
) STRICT, WITHOUT ROWID;
CREATE INDEX idx_workouts_rev ON workout_sessions(account_id, rev);

CREATE TABLE rate_limits (
  k            TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  n            INTEGER NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY,
  at         INTEGER NOT NULL,
  account_id TEXT,
  event      TEXT NOT NULL,
  detail     TEXT
) STRICT;
CREATE INDEX idx_audit_account ON audit_log(account_id, at DESC);
