// Аккаунт: вход через Telegram, состояние синхронизации, выход и удаление аккаунта на сервере.
import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { isStandalone } from '../config.js';
import { tg } from '../tg.js';
import { topbar, confirmDialog, noteBox, toast } from '../ui.js';
import { apiEnabled } from '../api.js';
import { auth, loginWithTelegram, logout, refreshAccount, deleteAccount } from '../auth.js';
import { syncStatus, onSyncStatus, syncNow } from '../sync.js';

const errText = (e) => { const k = 'auth.err.' + (e?.code || 'x'), v = t(k); return v === k ? t('auth.err.x') : v; };

function gate(done) {
  const box = h('div', { class: 'stack', style: { gap: '12px' } });
  const msg = h('p', { class: 'small', style: { color: 'var(--danger)' }, role: 'alert' });
  if (!apiEnabled()) { box.append(noteBox(t('auth.disabled'))); return box; }
  const robot = isStandalone() ? null : h('img', { class: 'robot-hero', src: 'assets/robot.jpg', alt: '', width: 160, height: 289, loading: 'lazy', onError: (e) => e.target.remove() });
  box.append(h('div', { class: 'gate-hero' }, robot), h('h1', { class: 'h1' }, t('auth.title')), h('p', { class: 'muted' }, t('auth.text')));
  if (tg.available) box.append(h('button', { class: 'btn', onClick: async () => { msg.textContent = ''; try { await loginWithTelegram(); done(); } catch (e) { msg.textContent = errText(e); } } }, icon('profile'), t('auth.telegram')));
  else box.append(noteBox(t('auth.telegramHint')));
  box.append(msg, h('button', { class: 'link-btn', onClick: () => router.back() }, t('auth.skip')));
  return box;
}

function signedIn(refresh) {
  const acc = auth.account, box = h('div', { class: 'stack', style: { gap: '12px' } });
  const stText = (s) => t('sync.' + s.state) + (s.lastAt ? ' · ' + new Date(s.lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
  const st = h('div', { class: 's', 'aria-live': 'polite' }, stText(syncStatus()));
  const off = onSyncStatus((s) => { st.textContent = stText(s); });
  const tgId = (acc.identities || []).find((i) => i.provider === 'telegram') || (acc.identities || [])[0];
  const who = tgId ? [tgId.displayName, tgId.username && '@' + tgId.username].filter(Boolean).join(' · ') : '';

  box.append(h('h2', { class: 'h3 group-title' }, t('account.signedAs')),
    h('div', { class: 'list' },
      h('div', { class: 'item' }, icon('check'), h('div', { class: 'grow' }, h('div', { class: 't' }, t('auth.provider.telegram')), who ? h('div', { class: 's' }, who) : null)),
      h('button', { class: 'item', onClick: async () => { await syncNow(); await refreshAccount().catch(() => {}); toast(stText(syncStatus()), 2000); } }, icon('clock'), h('div', { class: 'grow' }, h('div', { class: 't' }, t('sync.now')), st))),
    h('p', { class: 'small muted' }, t('sync.note')));

  box.append(h('h2', { class: 'h3 group-title' }, t('account.session')),
    h('div', { class: 'list' }, h('button', { class: 'item', onClick: async () => { await logout(); toast(t('account.loggedOut')); refresh(); } }, icon('x'),
      h('div', { class: 'grow' }, h('div', { class: 't' }, t('account.logout')), h('div', { class: 's' }, t('account.logoutHint'))))));

  box.append(h('h2', { class: 'h3 group-title danger-title' }, t('account.danger')),
    h('div', { class: 'list' }, h('button', { class: 'item', style: { color: 'var(--danger)' }, onClick: async () => {
      if (!await confirmDialog({ title: t('account.deleteTitle'), text: t('account.deleteText'), confirm: t('account.deleteConfirm'), danger: true })) return;
      try { await deleteAccount(); toast(t('account.deleted')); refresh(); } catch (e) { toast(errText(e), 3500); }
    } }, icon('trash'), h('div', { class: 'grow' }, h('div', { class: 't' }, t('account.delete')), h('div', { class: 's' }, t('account.deleteHint'))))));
  return { box, off };
}

export default function account() {
  const el = h('div'), pad = h('div', { class: 'pad' });
  let off = null;
  const render = () => {
    off?.(); off = null; pad.replaceChildren();
    if (auth.signedIn) { const r = signedIn(render); off = r.off; pad.append(r.box); } else pad.append(gate(() => { toast(t('auth.welcome')); render(); }));
  };
  el.append(topbar({ title: t('account.nav') }), pad);
  render();
  refreshAccount().then(() => { if (auth.signedIn && !pad.querySelector('.gate-hero')) render(); }).catch(() => {});
  return { el, destroy: () => off?.() };
}
