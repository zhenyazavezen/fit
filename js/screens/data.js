// Данные на этом устройстве: что хранится и как удалить всё. Не зависит от входа в аккаунт.
import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { history, favorites, customEx, resetAll } from '../store.js';
import { auth } from '../auth.js';
import { topbar, confirmDialog, toast } from '../ui.js';

export default function data() {
  const el = h('div'), pad = h('div', { class: 'pad stack' });
  const fact = (v, l) => h('div', { class: 'fact' }, h('div', { class: 'v' }, String(v)), h('div', { class: 'l' }, l));
  pad.append(h('p', { class: 'muted' }, t('data.intro')),
    h('div', { class: 'facts' }, fact(history.all().length, t('data.workouts')), fact(favorites.all().length, t('data.favs')), fact(customEx.all().length, t('data.custom'))),
    h('h2', { class: 'h3 group-title danger-title' }, t('account.danger')),
    h('div', { class: 'list' }, h('button', { class: 'item', style: { color: 'var(--danger)' }, onClick: async () => {
      if (!await confirmDialog({ title: t('data.clearTitle'), text: t('data.clearText') + ' ' + (auth.signedIn ? t('data.clearSigned') : t('data.clearLocal')), confirm: t('data.clearConfirm'), danger: true })) return;
      resetAll(); toast(t('data.cleared')); router.back();
    } }, icon('trash'), h('div', { class: 'grow' }, h('div', { class: 't' }, t('data.clear')), h('div', { class: 's' }, t('data.clearHint'))))));
  el.append(topbar({ title: t('data.title') }), pad);
  return { el };
}
