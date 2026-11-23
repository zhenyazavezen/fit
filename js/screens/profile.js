import { openTabsEditor } from '../tabs.js';
import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { CONFIG } from '../config.js';
import { tg } from '../tg.js';
import { auth } from '../auth.js';
import { settings } from '../store.js';
import { photoOf, avatarNode, openAvatarEditor } from '../avatar.js';
import { toggle } from '../ui.js';

// Аватар: своё фото → фото Telegram → буква. Нажатие открывает смену фото.
function avatarEl(u, name) {
  return h('button', { class: 'avatar-btn', type: 'button', 'aria-label': t('avatar.change'), onClick: () => openAvatarEditor(() => router.refresh()) },
    avatarNode(photoOf(u), name), h('span', { class: 'avatar-badge' }, icon('edit', 12)));
}

export default function profile() {
  const set = settings.get(), u = tg.user;
  const name = u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : t('profile.guest');
  const el = h('div', { class: 'pad' });

  el.append(h('h1', { class: 'h1 page-title' }, t('profile.title')),
    h('div', { class: 'card row-flex' }, avatarEl(u, name),
      h('div', { class: 'grow' }, h('div', { class: 'h3' }, name), h('div', { class: 'small muted' }, u ? t('profile.fromTelegram') + (u.username ? ` · @${u.username}` : '') : t('profile.localOnly')))));
  const sw = (key, ic, label) => h('div', { class: 'item' }, icon(ic), h('div', { class: 'grow t' }, label), toggle(set[key], (v) => settings.set({ [key]: v }), label));
  const group = (title, ...items) => el.append(h('h2', { class: 'h3 group-title' }, title), h('div', { class: 'list' }, ...items));

  group(t('profile.accountGroup'),
    row('profile', t('profile.account'), auth.signedIn ? t('profile.accountOn') : t('profile.accountOff'), () => router.go('account')));

  group(t('profile.settings'),
    sw('sound', 'sound', t('profile.sound')), sw('haptics', 'vibrate', t('profile.haptics')), sw('wake', 'screen', t('profile.wake')),
    row('list', t('tabs.title'), '', () => openTabsEditor()),
  );

  el.append(h('h2', { class: 'h3 group-title' }, t('profile.supportGroup')),
    h('div', { class: 'card stack', style: { gap: '10px' } },
      h('div', { class: 'h3' }, t('profile.supportTitle')), h('p', { class: 'muted small' }, t('profile.supportText')),
      h('button', { class: 'btn secondary', onClick: () => tg.openLink(CONFIG.supportUrl) }, icon('external'), t('profile.supportBtn', { nick: '@' + CONFIG.supportUrl.split('/').pop() }))),
    h('div', { class: 'list', style: { marginTop: '12px' } }, row('info', t('profile.about'), '', () => router.go('about'))));
  return { el };
}

function row(ic, title, value, onClick, end = 'chev-r') {
  return h('button', { class: 'item', onClick }, icon(ic), h('div', { class: 'grow t' }, title), value ? h('div', { class: 'value' }, value) : null, icon(end, 18));
}
