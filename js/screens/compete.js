// Соревнования: общий рейтинг (по желанию) и комнаты с друзьями по коду. Всё добровольно: человек сам выбирает, где участвовать.
import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { CONFIG } from '../config.js';
import { tg } from '../tg.js';
import { topbar, sheet, confirmDialog, segmented, toggle, toast, empty } from '../ui.js';
import { api, apiEnabled } from '../api.js';
import { auth } from '../auth.js';
import { avatarNode, thumbOf } from '../avatar.js';

const call = (path, method = 'GET', body) => api('/comp' + path, { method, body, token: auth.token });
const errText = (e) => { const k = 'comp.err.' + (e?.code || 'x'), v = t(k); return v === k ? t('comp.err.x') : v; };
const share = (code) => tg.openLink('https://t.me/share/url?url=' + encodeURIComponent(CONFIG.siteUrl) + '&text=' + encodeURIComponent(t('comp.shareText', { code })));

/** Окно с одним полем. Возвращает введённую строку или null. */
function ask({ title, text, label, value = '', maxlength, confirm, transform = (v) => v }) {
  return new Promise((resolve) => {
    const input = h('input', { class: 'input', value, maxlength: String(maxlength), 'aria-label': label, autocomplete: 'off' });
    let fin = false; const end = (v) => { if (!fin) { fin = true; resolve(v); } };
    const s = sheet({ title, body: [text ? h('p', { class: 'muted' }, text) : null, input].filter(Boolean), onClose: () => end(null),
      foot: [h('button', { class: 'btn', onClick: () => { const v = transform(input.value.trim()); if (v) { end(v); s.close(); } } }, confirm)] });
  });
}
const askNick = (cur) => ask({ title: t('comp.nickTitle'), text: t('comp.nickText'), label: t('comp.nick'), value: cur || tg.user?.first_name || '', maxlength: 20, confirm: t('common.save') });

export default function compete() {
  const el = h('div'), body = h('div', { class: 'pad stack' });
  el.append(topbar({ title: t('comp.title') }), body);
  const st = { me: null, view: null, period: 'week' };

  if (!apiEnabled() || !auth.signedIn) {
    body.append(empty({ icon: 'trophy', title: t('comp.needLoginTitle'), text: t('comp.needLogin'), action: h('button', { class: 'btn', onClick: () => router.go('account') }, t('profile.account')) }));
    return { el };
  }

  const photo = { v: undefined };
  const guard = async (fn) => { try { await fn(); } catch (e) { toast(errText(e)); } };
  const nickFor = async () => (st.me.nick ? undefined : await askNick());   // undefined — ник уже есть; null — отказ

  async function load() {
    try {
      photo.v = await thumbOf(tg.user);
      st.me = await call('/me');
      if (st.me.nick && (st.me.photo || '') !== photo.v) st.me = await call('/photo', 'POST', { photo: photo.v });   // фото в рейтинге всегда актуально
      draw();
    } catch (e) { body.replaceChildren(h('p', { class: 'muted' }, errText(e)), h('button', { class: 'btn secondary', onClick: load }, t('common.retry'))); }
  }

  function draw() {
    if (st.view) return drawBoard();
    const m = st.me;
    const globalRow = h('div', { class: 'item' }, icon('trophy'), h('div', { class: 'grow' }, h('div', { class: 't' }, t('comp.global')), h('div', { class: 's' }, t('comp.globalHint'))),
      toggle(m.global, (v) => guard(async () => {
        let nick; if (v) { nick = await nickFor(); if (nick === null) { draw(); return; } }
        st.me = await call('/global', 'POST', { on: v, nick, photo: photo.v }); draw();
      }), t('comp.global')));
    const rooms = m.rooms.map((r) => h('button', { class: 'item', onClick: () => { st.view = r.id; draw(); } }, icon('list'),
      h('div', { class: 'grow' }, h('div', { class: 't' }, r.name), h('div', { class: 's' }, t('comp.members', { n: r.members }))), icon('chev-r', 18)));
    body.replaceChildren(
      h('p', { class: 'muted' }, t('comp.intro')),
      h('div', { class: 'list' }, globalRow,
        m.global ? h('button', { class: 'item', onClick: () => { st.view = 'global'; draw(); } }, icon('progress'), h('div', { class: 'grow t' }, t('comp.openGlobal')), icon('chev-r', 18)) : null),
      h('h2', { class: 'h3 group-title' }, t('comp.rooms')),
      rooms.length ? h('div', { class: 'list' }, ...rooms) : h('p', { class: 'muted small' }, t('comp.noRooms')),
      h('button', { class: 'btn', onClick: () => guard(createRoom) }, icon('plus'), t('comp.create')),
      h('button', { class: 'btn secondary', onClick: () => guard(joinRoom) }, t('comp.join')),
      m.nick ? h('button', { class: 'link-btn', onClick: () => guard(async () => { const n = await askNick(m.nick); if (n) { st.me = await call('/nick', 'POST', { nick: n }); draw(); } }) }, t('comp.nickChange', { nick: m.nick })) : null,
      h('p', { class: 'small muted' }, t('comp.privacy')));
  }

  async function createRoom() {
    const nick = await nickFor(); if (nick === null) return;
    const name = await ask({ title: t('comp.create'), label: t('comp.roomName'), maxlength: 30, confirm: t('comp.create') }); if (!name) return;
    const r = await call('/rooms', 'POST', { name, nick, photo: photo.v }); st.me = r.me; st.view = r.id; draw();
  }
  async function joinRoom() {
    const nick = await nickFor(); if (nick === null) return;
    const code = await ask({ title: t('comp.join'), text: t('comp.joinText'), label: t('comp.code'), maxlength: 9, confirm: t('comp.joinDo'), transform: (v) => v.toUpperCase() }); if (!code) return;
    const r = await call('/rooms/join', 'POST', { code, nick, photo: photo.v }); st.me = r.me; st.view = r.id; draw();
  }

  async function drawBoard() {
    const scope = st.view, room = st.me.rooms.find((r) => r.id === scope);
    const list = h('div'), seg = segmented([{ value: 'week', label: t('comp.week') }, { value: 'month', label: t('comp.month') }], st.period, (v) => { st.period = v; fill(); });
    const head = h('div', { class: 'row-flex', style: { justifyContent: 'space-between' } },
      h('button', { class: 'link-btn', onClick: () => { st.view = null; load(); } }, t('comp.back')),
      room ? h('button', { class: 'link-btn', onClick: () => share(room.code) }, icon('external', 16), t('comp.invite')) : null);
    const foot = [];
    if (room) foot.push(h('div', { class: 'card', style: { textAlign: 'center' } }, h('div', { class: 'small muted' }, t('comp.codeLabel')), h('div', { class: 'h2 num', style: { letterSpacing: '0.2em' } }, room.code)),
      h('button', { class: 'btn secondary', onClick: () => guard(async () => {
        if (!await confirmDialog({ title: t('comp.leaveTitle'), text: t('comp.leaveText'), confirm: t('comp.leave'), danger: true })) return;
        st.me = await call('/rooms/leave', 'POST', { id: room.id }); st.view = null; draw();
      }) }, t('comp.leave')));
    body.replaceChildren(head, h('h2', { class: 'h2' }, room ? room.name : t('comp.global')), seg, list, ...foot);
    async function fill() {
      list.replaceChildren(h('p', { class: 'muted small' }, t('common.loading')));
      try {
        const r = await call(`/board?scope=${encodeURIComponent(scope)}&period=${st.period}`);
        list.replaceChildren(r.rows.length ? h('div', { class: 'list' }, ...r.rows.map((x) => h('div', { class: 'item' + (x.me ? ' me' : '') }, h('div', { class: 'lead' }, String(x.rank)), avatarNode(x.photo, x.nick, 'sm'),
          h('div', { class: 'grow' }, h('div', { class: 't' }, x.nick + (x.me ? ' · ' + t('comp.you') : '')), h('div', { class: 's' }, t('comp.workouts', { n: x.workouts }))),
          h('div', { class: 'end num' }, t('comp.minutes', { n: x.minutes }))))) : h('p', { class: 'muted' }, t('comp.emptyBoard')),
          r.me && r.me.rank > r.rows.length ? h('p', { class: 'small muted' }, t('comp.yourPlace', { n: r.me.rank, total: r.total })) : null);
      } catch (e) { list.replaceChildren(h('p', { class: 'muted' }, errText(e))); }
    }
    fill();
  }

  load();
  return { el };
}
