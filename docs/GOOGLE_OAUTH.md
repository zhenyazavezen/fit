# Вход через Google: что нужно сделать вам

Без этого кнопка «Продолжить через Google» остаётся выключенной (так задумано: ложного входа нет). Не проверено на реальных ключах.

1. https://console.cloud.google.com → создайте проект → **APIs & Services → OAuth consent screen**: External, название ZAVEZEN_FIT, почта поддержки, ссылка на сайт. Для запроса только имени/почты (`openid email profile`) проверка Google обычно не нужна; режим «Testing» ограничивает вход списком тестовых пользователей — для публичного запуска переведите в Production.
2. **Credentials → Create credentials → OAuth client ID → Web application.** *Authorized JavaScript origins*: `https://zhenyazavezen.github.io` (и адрес Cloudflare Pages, когда появится). Redirect URI не нужен (используется Google Identity Services с ID-токеном).
3. Скопируйте **Client ID** (не секрет). Вставьте в два места: `js/config.js` → `googleClientId`, и переменную `GOOGLE_CLIENT_ID` у Worker. Client secret не нужен и нигде не используется.
4. Внутри Telegram Google часто блокирует вход во встроенном браузере (`disallowed_useragent`). Поэтому в Mini App показывается «Продолжить через Google в браузере»: открывается обычный браузер, вы входите через Google, затем в разделе «Аккаунт» привязываете вход к Telegram по коду (оба аккаунта подтверждаются). Эту связку нужно проверить на вашем телефоне.
