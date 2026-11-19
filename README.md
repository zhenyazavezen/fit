# ZAVEZEN_FIT888

Домашние тренировки в Telegram Mini App. Премиальный тёмный интерфейс, без фото, видео и анимированных демонстраций.
Лицензия — `LICENSE`.

Текущая версия — **предпросмотр без сборки** (D-025): чистые HTML, CSS и ES-модули, без npm.

## Запуск
```
python3 -m http.server 8000     # в корне репозитория
```
Откройте http://localhost:8000 (лучше в режиме телефона в браузере).

## Тесты
```
node tools/validate.mjs          # проверка данных каталога
node --test tests/*.test.mjs     # модульные тесты (движок, статистика, поиск, данные, локализация)
node tests/e2e/run.mjs           # сквозные, нужен Playwright (360/390/430 px; только для разработки, для публикации не нужен)
```

## Автономная версия (один файл, для обновления с телефона)
`standalone/index.html` — всё приложение в одном файле (HTML, CSS, код, данные). Именно его удобно загружать в репозиторий с Android: достаточно заменить этот файл, больше ничего не нужно.

**Первая публикация (с телефона или компьютера):**
1. github.com → New repository → имя `fit` → Public → Create (без README).
2. Add file → Upload files → выберите `index.html` (из `standalone/`; имя файла должно быть ровно `index.html`) → Commit changes.
3. Settings → Pages → Build and deployment → Source: **Deploy from a branch** → Branch: `main`, папка `/ (root)` → Save.
4. Через 1–2 минуты сайт откроется: `https://ВАШ_ЛОГИН.github.io/fit/`.
Папки `.github`, `js`, `css` и т. п. в этом случае загружать не нужно.

**Обновление:** репозиторий → Add file → Upload files → выберите новый `index.html` → Commit changes (файл с тем же именем заменится). Страница обновится через 1–2 минуты; если видна старая версия — обновите её с очисткой кэша.
Если Android сохранил файл как `index (1).html`, переименуйте его в приложении «Файлы» в `index.html` до загрузки.
Данные пользователя (прогресс, избранное) хранятся в браузере для адреса сайта и не теряются при замене файла, если адрес не меняется.

**Пересборка после правок исходников:** `node tools/bundle.mjs` (нужен только Node.js, без npm). Проверка: `node --test tests/*.test.mjs` и `E2E_DIR=standalone node tests/e2e/run.mjs`.

## Публикация исходной версии через GitHub Actions (пошагово)
Нужны только аккаунт GitHub и установленный Git. npm, сервер и платные сервисы **не нужны**.

1. **Репозиторий.** На github.com → New repository. Имя, например, `fit`. Видимость — Public (на бесплатном тарифе Pages работает для публичных репозиториев). **Не** ставьте галочки «Add README», «.gitignore», «license» — репозиторий должен быть пустым.
2. **Распакуйте проект** (папка `fit`, в ней `index.html`, `.github`, `js`…) и откройте терминал в этой папке.
3. **Загрузите код** (подставьте свой логин вместо `ВАШ_ЛОГИН`):
   ```
   git branch -M main
   git remote add origin https://github.com/ВАШ_ЛОГИН/fit.git
   git push -u origin main
   ```
   Если Git просит войти — используйте GitHub CLI (`gh auth login`) или Personal Access Token вместо пароля. Если `git` ругается на автора, один раз выполните `git config --global user.name "Имя"` и `git config --global user.email "почта"`.
4. **Включите Pages.** Репозиторий → Settings → Pages → Build and deployment → Source: **GitHub Actions**.
5. **Запустите публикацию.** Вкладка Actions → «Публикация на GitHub Pages» → Run workflow (или просто сделайте новый push). Дождитесь зелёной галочки (1–2 минуты).
6. **Адрес сайта:** `https://ВАШ_ЛОГИН.github.io/fit/` (виден также в Settings → Pages). Откройте его в Chrome на Android.
7. **Установка как ярлыка (по желанию).** Chrome → меню ⋮ → «Добавить на главный экран».

Если сайт показывает старую версию — обновите страницу с очисткой кэша; при каждой публикации версия подставляется автоматически.
Если вкладка Actions пуста или workflow красный — откройте лог шага; чаще всего не включён Source: GitHub Actions (шаг 4) или репозиторий приватный на бесплатном тарифе.

Сайт работает и в подпапке (`/fit/`), и в корне домена: все пути относительные.

## Проверка перед публикацией
```
tools/build.sh _site                                    # локальная сборка, как в workflow
E2E_DIR=_site E2E_BASE=/fit/ node tests/e2e/run.mjs   # сквозные тесты на сборке в подпапке
```

## Telegram Mini App
В @BotFather: `/newapp` (или Bot Settings → Menu Button) → укажите адрес Pages (HTTPS), например `https://ВАШ_ЛОГИН.github.io/fit/`. SDK подгружается только внутри Telegram.

## Добавить упражнение или язык
- Упражнение: запись в `data/exercises.json` + тексты в `data/content.ru.json` → `node tools/validate.mjs`.
- Язык: `locales/<код>.json`, `data/content.<код>.json`, затем `CONFIG.enabledLangs` в `js/config.js`. Украинский — только после языковой проверки.

## Структура
`js/engine.js` (таймер, без DOM), `stats.js`, `catalog.js`, `data.js`, `store.js`, `i18n.js` — переносимая логика; `js/screens/*`, `js/ui.js`, `js/router.js` — интерфейс; `css/` — токены и стили; `docs/MIGRATION.md` — план перехода на React + TypeScript.

## Ограничения
Системный шрифт (Manrope не подключён), только русский, нет офлайна, нет сервера и оплаты. Тексты упражнений и программ — черновик без экспертной проверки; результат тренировок не гарантируется.


## Сервер, аккаунты, запуск
Архитектура — `docs/ARCHITECTURE.md`; развёртывание на уже созданных Cloudflare Worker «fit» и D1 «fit_db» — `docs/DEPLOY_CLOUDFLARE.md`; Google — `docs/GOOGLE_OAUTH.md`; Telegram — `docs/TELEGRAM_MINIAPP.md`; FREE/PREMIUM — `docs/FREE_PREMIUM.md`; лимиты и стоимость — `docs/COSTS_LIMITS.md`; тесты — `docs/TESTING.md`. Все проверки: `tools/test-all.sh`.

## Структура проекта
```
index.html            страница (отдельный файл)
css/                  стили (tokens.css, app.css)
js/                   код приложения (js/screens/ — экраны)
data/                 упражнения, программы, мышцы, карточки (JSON)
locales/              переводы интерфейса
worker/               серверный код: src/, migrations/, dist/, wrangler.toml
tests/                тесты (tests/worker/ — серверные, tests/e2e/ — сквозные)
docs/                 документация, решения (DECISIONS), статус, архитектура
assets/ tools/ standalone/   иллюстрации и иконки, скрипты сборки, одиночный HTML
manifest.webmanifest, sw.js  PWA (должны лежать рядом с index.html)
```
Все проверки: `tools/test-all.sh`.
