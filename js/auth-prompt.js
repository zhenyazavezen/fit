// Мягкое предложение войти: показывается после первой тренировки или при создании плана, не чаще раза в 7 дней, никогда не навязывается.
import { h } from './util.js';
import { t } from './i18n.js';
import * as router from './router.js';
import { store } from './store.js';
import { auth } from './auth.js';
import { apiEnabled } from './api.js';

const WEEK = 7 * 24 * 3600 * 1000;
export function shouldPrompt(now = Date.now()) {
  if (!apiEnabled() || auth.signedIn) return false;
  return now - (store.get('authPromptAt', 0) || 0) > WEEK;
}
export function authPromptCard() {
  if (!shouldPrompt()) return null;
  const card = h('div', { class: 'note', style: { flexDirection: 'column', gap: '8px' } },
    h('div', { class: 'h3' }, t('prompt.title')), h('div', null, t('prompt.text')),
    h('div', { class: 'row-flex', style: { gap: '12px' } },
      h('button', { class: 'btn small', onClick: () => router.go('account') }, t('prompt.btn')),
      h('button', { class: 'link-btn', onClick: () => { store.setSilent('authPromptAt', Date.now()); card.remove(); } }, t('prompt.later'))));
  return card;
}
