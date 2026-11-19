import { h } from '../util.js';
import { t } from '../i18n.js';
import { topbar } from '../ui.js';

export default function about() {
  const el = h('div');
  el.append(topbar({ title: t('about.title') }),
    h('div', { class: 'pad stack' }, h('div', { class: 'prose' }, h('p', null, t('about.how')))));
  return { el };
}
