// Интеграция с Telegram Mini App. Вне Telegram (обычный браузер) всё безопасно превращается в «ничего».
// ВАЖНО: initDataUnsafe используется только для показа имени. Доверять данным пользователя нельзя —
// проверка initData по подписи будет на backend (см. README, этап backend).
const WA = () => window.Telegram?.WebApp || null;
let backHandler = null;

export const tg = {
  get available() { const w = WA(); return !!w && w.platform !== 'unknown'; },
  get user() { return WA()?.initDataUnsafe?.user || null; },
  /** Сырая строка initData для проверки подписи на сервере. */
  get initData() { return WA()?.initData || ''; },
  /** Параметр ссылки t.me/бот/app?startapp=… (только из белого списка в main.js). */
  get startParam() { return String(WA()?.initDataUnsafe?.start_param || ''); },
  get platform() { return WA()?.platform || 'web'; },

  init() {
    const w = WA();
    if (!w) return;
    try { w.ready(); } catch { /* ignore */ }
    try { w.expand(); } catch { /* ignore */ }
    try { w.setHeaderColor?.('#0A0A0B'); w.setBackgroundColor?.('#0A0A0B'); w.setBottomBarColor?.('#121214'); } catch { /* старые клиенты */ }
    try { w.disableVerticalSwipes?.(); } catch { /* ignore */ }
    const apply = () => this.applyViewport();
    apply();
    for (const ev of ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged']) {
      try { w.onEvent?.(ev, apply); } catch { /* ignore */ }
    }
  },

  applyViewport() {
    const w = WA();
    const root = document.documentElement.style;
    if (!w) return;
    const hgt = w.viewportStableHeight || w.viewportHeight;
    if (hgt) root.setProperty('--app-h', hgt + 'px');
    const s = w.safeAreaInset || {}, c = w.contentSafeAreaInset || {};
    root.setProperty('--tg-top', (s.top || 0) + (c.top || 0) + 'px');
    root.setProperty('--tg-bottom', (s.bottom || 0) + (c.bottom || 0) + 'px');
  },

  haptic(kind = 'light') {
    const hf = WA()?.HapticFeedback;
    try {
      if (!hf) return false;
      if (kind === 'success' || kind === 'warning' || kind === 'error') hf.notificationOccurred(kind);
      else if (kind === 'select') hf.selectionChanged();
      else hf.impactOccurred(kind);
      return true;
    } catch { return false; }
  },

  /** Кнопка «Назад» Telegram. handler вызывается по нажатию; null — скрыть. */
  setBack(handler) {
    const b = WA()?.BackButton;
    if (!b) return;
    try {
      if (backHandler) b.offClick(backHandler);
      backHandler = handler;
      if (handler) { b.onClick(handler); b.show(); } else b.hide();
    } catch { /* ignore */ }
  },

  /** Подтверждение закрытия во время тренировки. */
  confirmClose(on) {
    const w = WA();
    try { on ? w?.enableClosingConfirmation?.() : w?.disableClosingConfirmation?.(); } catch { /* ignore */ }
  },

  openLink(url) {
    const w = WA();
    try {
      if (w && /^https:\/\/t\.me\//i.test(url) && w.openTelegramLink) return w.openTelegramLink(url);
      if (w?.openLink) return w.openLink(url);
    } catch { /* падаем в window.open */ }
    window.open(url, '_blank', 'noopener');
  },
};
