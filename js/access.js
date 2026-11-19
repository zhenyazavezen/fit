// Доступ к программам: FREE / PREMIUM. Упражнения всегда бесплатны. Оплаты в приложении пока нет:
// при premiumEnforced = false ничего не блокируется (см. config.js и docs/FREE_PREMIUM.md).
// Важно: это клиентская проверка удобства, а не защита контента — каталог лежит в публичном коде. Защищать стоит только серверные данные.
import { CONFIG } from './config.js';
import { auth } from './auth.js';

export const isPremiumProgram = (p) => !!p && !p.custom && p.access === 'premium';
export const hasPremium = (account, now = Date.now()) => !!account?.premium?.active && (account.premium.until ?? 0) > now;

/** Можно ли запустить программу. Свои программы и бесплатные — всегда. */
export function canStartProgram(p, { account = auth.account, enforced = CONFIG.premiumEnforced, now = Date.now() } = {}) {
  if (!isPremiumProgram(p) || !enforced) return true;
  return hasPremium(account, now);
}
