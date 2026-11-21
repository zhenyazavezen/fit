import { openTabsEditor } from '../tabs.js';
import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { CONFIG, BUILD } from '../config.js';
import { tg } from '../tg.js';
import { auth } from '../auth.js';
import { settings, history, favorites, resetAll } from '../store.js';
import { getAvatar, openAvatarEditor } from '../avatar.js';
import { streak } from '../stats.js';
import { spentLabel } from '../format.js';
import { toggle, confirmDialog, toast } from '../ui.js';

// Аватар: своё фото (синхронизируется) → фото Telegram (только показ, адрес t.me) → буква. Нажатие открывает смену фото.
function avatarEl(u, name) {
  const letter = (name[0] || 'S').toUpperCase();
  const box = h('div', { class: 'avatar' }, letter);
  const show = (src, extra = {}) => {
    const img = h('img', { src, alt: '', decoding: 'async', ...extra });
    img.addEventListener('load', () => { box.textContent = ''; box.append(img); });
  };
  const mine = getAvatar(), url = u && typeof u.photo_url === 'string' ? u.photo_url : '';
  if (mine) show(mine);
  else if (/^https:\/\/(t\.me|telegram\.org)\//.test(url)) show(url, { referrerpolicy: 'no-referrer' });
  return h('button', { class: 'avatar-btn', type: 'button', 'aria-label': t('avatar.change'), onClick: () => openAvatarEditor(() => router.refresh()) },
    box, h('span', { class: 'avatar-badge' }, icon('edit', 12)));
}

export default function profile() {
  const hist = history.all(), set = settings.get(), u = tg.user;
  const name = u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : t('profile.guest');
  const total = hist.reduce((a, s) => a + (s.durationSec || 0), 0);
  const el = h('div', { class: 'pad' });

  el.append(h('h1', { class: 'h1 page-title' }, t('profile.title')),
    h('div', { class: 'card row-flex' }, avatarEl(u, name),
      h('div', { class: 'grow' }, h('div', { class: 'h3' }, name), h('div', { class: 'small muted' }, u ? t('profile.fromTelegram') + (u.username ? ` · @${u.username}` : '') : t('profile.localOnly')))),
    h('div', { class: 'facts', style: { marginTop: '12px' } },
      fact(String(hist.length), t('profile.total')), fact(total ? spentLabel(total) : '0', t('profile.totalTime')), fact(String(streak(hist)), t('progress.streak'))));

  const sw = (key, ic, label) => h('div', { class: 'item' }, icon(ic), h('div', { class: 'grow t' }, label), toggle(set[key], (v) => settings.set({ [key]: v }), label));
  el.append(h('h2', { class: 'h3 group-title' }, t('plan.title')),
    h('div', { class: 'list' }, row('profile', t('profile.account'), auth.signedIn ? '✓' : t('profile.accountOff'), () => router.go('account')), row('profile', t('plan.title'), '', () => router.go('plan')), row('catalog', t('map.title'), '', () => router.go('bodymap')), row('workouts', t('tabs.title'), '', () => openTabsEditor())));

  el.append(h('h2', { class: 'h3 group-title' }, t('profile.settings')),
    h('div', { class: 'list' }, sw('sound', 'sound', t('profile.sound')), sw('haptics', 'vibrate', t('profile.haptics')), sw('wake', 'screen', t('profile.wake')),
      h('div', { class: 'item' }, icon('globe'), h('div', { class: 'grow t' }, t('profile.language')), h('div', { class: 'value' }, t('profile.languageValue')))));

  el.append(h('h2', { class: 'h3 group-title' }, t('profile.data')),
    h('div', { class: 'list' },
      row('heart', t('profile.favorites'), String(favorites.all().length), () => router.go('catalog', { favs: true })),
      h('button', { class: 'item', style: { color: 'var(--danger)' }, onClick: async () => {
        if (await confirmDialog({ title: t('profile.resetTitle'), text: t('profile.resetText'), confirm: t('common.delete'), danger: true })) { resetAll(); toast(t('profile.resetDone')); router.refresh(); }
      } }, icon('trash'), h('div', { class: 'grow t' }, t('profile.reset')))));

  el.append(h('h2', { class: 'h3 group-title' }, t('profile.about')),
    h('div', { class: 'list' },
      row('help', t('profile.support'), t('profile.supportHint'), () => tg.openLink(CONFIG.supportUrl), 'external'),
      row('info', t('profile.about'), '', () => router.go('about'))));
  el.append(h('p', { class: 'small muted', style: { textAlign: 'center', marginTop: '24px' } }, 'Сборка ' + BUILD));
  return { el };
}

const fact = (v, l) => h('div', { class: 'fact' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
function row(ic, title, value, onClick, end = 'chev-r') {
  return h('button', { class: 'item', onClick }, icon(ic), h('div', { class: 'grow t' }, title), value ? h('div', { class: 'value' }, value) : null, icon(end, 18));
}
