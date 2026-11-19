import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { CONFIG, isStandalone } from '../config.js';
import { tg } from '../tg.js';
import { topbar, sheet, confirmDialog, noteBox, toast } from '../ui.js';
import { apiEnabled, ApiError } from '../api.js';
import { auth, loginWithTelegram, logout, refreshAccount, startLink, previewLink, completeLink, unlink, deleteAccount, googleConfigured, googleNeedsExternalBrowser, renderGoogleButton, openGoogleInBrowser } from '../auth.js';
import { syncStatus, onSyncStatus, syncNow } from '../sync.js';

const errText = (e) => { const k = 'auth.err.' + (e?.code || 'x'), v = t(k); return v === k ? t('auth.err.x') : v; };
const provName = (p) => t('auth.provider.' + p);

function gate(done) {
  const box = h('div', { class: 'stack', style: { gap: '12px' } });
  const msg = h('p', { class: 'small', style: { color: 'var(--danger)' }, role: 'alert' });
  const fail = (e) => { msg.textContent = errText(e); };
  if (!apiEnabled()) { box.append(noteBox(t('auth.disabled'))); return box; }

  const robot = isStandalone() ? null : h('img', { class: 'robot-hero', src: 'assets/robot.jpg', alt: '', width: 160, height: 289, loading: 'lazy', onError: (e) => e.target.remove() });
  box.append(h('div', { class: 'gate-hero' }, robot), h('h1', { class: 'h1' }, t('auth.title')), h('p', { class: 'muted' }, t('auth.text')));

  if (tg.available) {
    box.append(h('button', { class: 'btn', onClick: async () => { msg.textContent = ''; try { await loginWithTelegram(); done(); } catch (e) { fail(e); } } }, icon('profile'), t('auth.telegram')));
  }
  if (googleConfigured()) {
    if (googleNeedsExternalBrowser()) {
      box.append(h('button', { class: 'btn ghost', onClick: () => openGoogleInBrowser() }, icon('external'), t('auth.googleBrowser')), h('p', { class: 'small muted' }, t('auth.googleBrowserHint')));
    } else {
      const slot = h('div', { class: 'gsi-slot' });
      box.append(slot);
      renderGoogleButton(slot, { onDone: done, onError: fail }).catch(fail);
    }
  } else {
    box.append(h('button', { class: 'btn ghost', disabled: true }, t('auth.google')), h('p', { class: 'small muted' }, t('auth.googleOff')));
  }
  if (!tg.available) box.append(h('p', { class: 'small muted' }, t('auth.telegramHint')));
  box.append(msg, h('button', { class: 'link-btn', onClick: () => router.back() }, t('auth.skip')), h('p', { class: 'small muted' }, t('auth.noPassword')));
  return box;
}

function showCode() {
  const body = h('div', { class: 'stack', style: { gap: '12px' } }, h('p', { class: 'muted' }, t('link.showText')));
  const s = sheet({ title: t('link.show'), body });
  startLink().then((r) => {
    const mins = Math.round((r.expiresAt - Date.now()) / 60000);
    body.append(h('div', { class: 'card', style: { textAlign: 'center' } }, h('div', { class: 'h1 num', style: { letterSpacing: '0.2em' } }, r.code.slice(0, 4) + ' ' + r.code.slice(4))),
      h('p', { class: 'small muted' }, t('link.valid', { n: mins })));
  }).catch((e) => body.append(h('p', { style: { color: 'var(--danger)' } }, errText(e))));
  return s;
}

function enterCode(refresh) {
  const input = h('input', { class: 'input', placeholder: 'XXXX XXXX', autocapitalize: 'characters', autocomplete: 'off', maxlength: 9, 'aria-label': t('link.enter') });
  const msg = h('p', { class: 'small', style: { color: 'var(--danger)' }, role: 'alert' });
  const s = sheet({
    title: t('link.enter'),
    body: [h('p', { class: 'muted' }, t('link.enterText')), input, msg],
    foot: [h('button', { class: 'btn', onClick: async () => {
      msg.textContent = '';
      try {
        const pv = await previewLink(input.value);
        if (pv.conflict) { msg.textContent = t('auth.err.provider_conflict'); return; }
        const ok = await confirmDialog({ title: t('link.confirmTitle'), text: t('link.confirmText', { a: pv.mine.workouts, b: pv.other.workouts }), confirm: t('link.confirm') });
        if (!ok) return;
        await completeLink(input.value);
        s.close(); toast(t('link.done')); refresh();
      } catch (e) { msg.textContent = errText(e); }
    } }, t('link.confirm'))],
  });
}

function signedIn(refresh) {
  const acc = auth.account, box = h('div', { class: 'stack', style: { gap: '12px' } });
  const stText = (s) => t('sync.' + s.state) + (s.lastAt ? ' · ' + new Date(s.lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
  const st = h('div', { class: 'small muted', 'aria-live': 'polite' }, stText(syncStatus()));
  const off = onSyncStatus((s) => { st.textContent = stText(s); });
  box.append(h('h1', { class: 'h1' }, t('account.title')), h('h2', { class: 'h3' }, t('account.methods')),
    h('div', { class: 'list' }, ...acc.identities.map((i) => h('div', { class: 'item' }, icon('check'), h('div', { class: 'grow' }, h('div', { class: 't' }, provName(i.provider)), h('div', { class: 's' }, [i.displayName, i.username && '@' + i.username].filter(Boolean).join(' · '))),
      acc.identities.length > 1 ? h('button', { class: 'link-btn', onClick: async () => {
        if (!await confirmDialog({ title: t('account.unlinkTitle'), text: t('account.unlinkText'), confirm: t('account.unlink'), danger: true })) return;
        try { await unlink(i.provider); toast(t('account.unlinked')); refresh(); } catch (e) { toast(errText(e), 3500); }
      } }, t('account.unlink')) : null))));
  box.append(h('h2', { class: 'h3 group-title' }, t('link.title')), h('p', { class: 'muted small' }, t('link.text')),
    h('div', { class: 'list' },
      h('button', { class: 'item', onClick: showCode }, icon('external'), h('div', { class: 'grow t' }, t('link.show')), icon('chev-r', 18)),
      h('button', { class: 'item', onClick: () => enterCode(refresh) }, icon('plus'), h('div', { class: 'grow t' }, t('link.enter')), icon('chev-r', 18))),
    h('p', { class: 'small muted' }, t('link.recovery')));
  box.append(h('h2', { class: 'h3 group-title' }, t('sync.title')), st,
    h('div', { class: 'list' }, h('button', { class: 'item', onClick: async () => { await syncNow(); await refreshAccount().catch(() => {}); toast(stText(syncStatus()), 2000); } }, icon('clock'), h('div', { class: 'grow t' }, t('sync.now')))),
    h('p', { class: 'small muted' }, t('sync.note')));
  box.append(h('div', { class: 'list', style: { marginTop: '24px' } },
    h('button', { class: 'item', onClick: async () => { await logout(); toast(t('account.loggedOut')); refresh(); } }, icon('x'), h('div', { class: 'grow t' }, t('account.logout'))),
    h('button', { class: 'item', style: { color: 'var(--danger)' }, onClick: async () => {
      if (!await confirmDialog({ title: t('account.deleteTitle'), text: t('account.deleteText'), confirm: t('common.delete'), danger: true })) return;
      try { await deleteAccount(); toast(t('account.deleted')); refresh(); } catch (e) { toast(errText(e), 3500); }
    } }, icon('trash'), h('div', { class: 'grow t' }, t('account.delete')))));
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
