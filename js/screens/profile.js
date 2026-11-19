import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { CONFIG } from '../config.js';
import { tg } from '../tg.js';
import { auth } from '../auth.js';
import { settings, history, favorites, exportAll, resetAll } from '../store.js';
import { streak } from '../stats.js';
import { spentLabel } from '../format.js';
import { toggle, sheet, confirmDialog, toast } from '../ui.js';

function exportData() {
  const text = JSON.stringify(exportAll(), null, 2);
  const s = sheet({
    title: t('profile.export'),
    body: [h('p', { class: 'muted small' }, 'JSON')],
    foot: [
      h('button', { class: 'btn ghost', onClick: async () => { try { await navigator.clipboard.writeText(text); toast(t('profile.exportCopied')); s.close(); } catch { toast(t('profile.exportFailed')); } } }, t('profile.copy')),
      h('button', { class: 'btn', onClick: () => {
        try {
          const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: `zavezen-fit-${new Date().toISOString().slice(0, 10)}.json` });
          document.body.append(a); a.click(); a.remove(); toast(t('profile.exported')); s.close();
        } catch { toast(t('profile.exportFailed')); }
      } }, icon('download', 18), t('profile.export')),
    ],
  });
}

export default function profile() {
  const hist = history.all(), set = settings.get(), u = tg.user;
  const name = u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : t('profile.guest');
  const total = hist.reduce((a, s) => a + (s.durationSec || 0), 0);
  const el = h('div', { class: 'pad' });

  el.append(h('h1', { class: 'h1 page-title' }, t('profile.title')),
    h('div', { class: 'card row-flex' }, h('div', { class: 'avatar' }, (name[0] || 'S').toUpperCase()),
      h('div', { class: 'grow' }, h('div', { class: 'h3' }, name), h('div', { class: 'small muted' }, u ? t('profile.fromTelegram') + (u.username ? ` · @${u.username}` : '') : t('profile.localOnly')))),
    h('div', { class: 'facts', style: { marginTop: '12px' } },
      fact(String(hist.length), t('profile.total')), fact(total ? spentLabel(total) : '0', t('profile.totalTime')), fact(String(streak(hist)), t('progress.streak'))));

  const sw = (key, ic, label) => h('div', { class: 'item' }, icon(ic), h('div', { class: 'grow t' }, label), toggle(set[key], (v) => settings.set({ [key]: v }), label));
  el.append(h('h2', { class: 'h3 group-title' }, t('plan.title')),
    h('div', { class: 'list' }, row('profile', t('profile.account'), auth.signedIn ? '✓' : t('profile.accountOff'), () => router.go('account')), row('profile', t('plan.title'), '', () => router.go('plan')), row('catalog', t('map.title'), '', () => router.go('bodymap'))));

  el.append(h('h2', { class: 'h3 group-title' }, t('profile.settings')),
    h('div', { class: 'list' }, sw('sound', 'sound', t('profile.sound')), sw('haptics', 'vibrate', t('profile.haptics')), sw('wake', 'screen', t('profile.wake')),
      h('div', { class: 'item' }, icon('globe'), h('div', { class: 'grow t' }, t('profile.language')), h('div', { class: 'value' }, t('profile.languageValue')))));

  el.append(h('h2', { class: 'h3 group-title' }, t('profile.data')),
    h('div', { class: 'list' },
      row('heart', t('profile.favorites'), String(favorites.all().length), () => router.go('catalog', { favs: true })),
      row('download', t('profile.export'), '', exportData),
      h('button', { class: 'item', style: { color: 'var(--danger)' }, onClick: async () => {
        if (await confirmDialog({ title: t('profile.resetTitle'), text: t('profile.resetText'), confirm: t('common.delete'), danger: true })) { resetAll(); toast(t('profile.resetDone')); router.refresh(); }
      } }, icon('trash'), h('div', { class: 'grow t' }, t('profile.reset')))));

  el.append(h('h2', { class: 'h3 group-title' }, t('profile.about')),
    h('div', { class: 'list' },
      row('help', t('profile.support'), t('profile.supportHint'), () => tg.openLink(CONFIG.supportUrl), 'external'),
      row('info', t('profile.about'), '', () => router.go('about'))));
  return { el };
}

const fact = (v, l) => h('div', { class: 'fact' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
function row(ic, title, value, onClick, end = 'chev-r') {
  return h('button', { class: 'item', onClick }, icon(ic), h('div', { class: 'grow t' }, title), value ? h('div', { class: 'value' }, value) : null, icon(end, 18));
}
