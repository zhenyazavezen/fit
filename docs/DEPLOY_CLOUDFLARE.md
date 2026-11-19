# Развёртывание на Cloudflare (ресурсы уже созданы)

Уже существует: Worker **fit** (`https://fit.zavezenz.workers.dev`, заглушка Hello World), D1 **fit_db** (`f9e95ea9-24d4-473a-a757-92f122d5dc49`), binding `DB`. **Ничего заново не создавайте.** Код сервера — `worker/`.

> Из рабочей среды Claude до Cloudflare нет доступа: ни одно действие ниже не выполнено и не проверено на реальном аккаунте. Локально проверена только логика (`node --test worker/test/*.test.mjs`).

## 1. Таблицы в базе (один раз)
Дашборд → Storage & Databases → D1 → **fit_db** → Console → вставьте содержимое `worker/migrations/0001_init.sql` целиком → Execute. (Либо с компьютера: `cd worker && npx wrangler d1 migrations apply fit_db --remote`.)
Проверка: `SELECT name FROM sqlite_master WHERE type='table';` — 8 таблиц.

## 2. Секреты и переменные Worker
Workers & Pages → **fit** → Settings → Variables and Secrets:
| Имя | Тип | Значение |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | **Secret** | токен @ZAVEZEN_FIT_BOT из BotFather |
| `ALLOWED_ORIGINS` | Text | `https://zhenyazavezen.github.io` (+ через запятую адрес Cloudflare Pages, когда появится) |
| `GOOGLE_CLIENT_ID` | Text | Client ID из `docs/GOOGLE_OAUTH.md` (пока можно пусто — Google-вход выключен) |

Токен бота не вставляйте в чат, репозиторий и файлы.

## 3. Код Worker
Вариант А (без инструментов): fit → Edit code → заменить содержимое файлом `worker/dist/worker.js` → Deploy. Binding `DB` уже есть.
Вариант Б (автоматически из GitHub): fit → Settings → Builds → Connect repository `zhenyazavezen/fit`, Root directory `worker`, Deploy command `npx wrangler deploy`. (Лимиты Workers Builds на Free тарифе проверьте в документации Cloudflare — здесь не проверялись.)
Вариант В (с компьютера): `cd worker && npx wrangler deploy`.
Проверка: открыть `https://fit.zavezenz.workers.dev/health` → `{"ok":true}`.

## 4. Предупреждение о Preview
Preview-развёртывания используют Production-базу (так настроено). Не запускайте на Preview тесты, которые пишут мусор в реальные данные.

## 5. Сайт
Сейчас: GitHub Pages (`https://zhenyazavezen.github.io/fit/`) — оставляем до успешного переключения. Cloudflare Pages (по желанию): Workers & Pages → Create → Pages → Connect to Git → репозиторий `fit`, build command `tools/build.sh _site`, output `_site`. После переключения добавьте новый адрес в `ALLOWED_ORIGINS` и в `siteUrl` (`js/config.js`).

## 6. Бот
См. `docs/TELEGRAM_MINIAPP.md`.
