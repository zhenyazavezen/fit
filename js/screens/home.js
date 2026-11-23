import { h, icon, uid } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { tg } from '../tg.js';
import { history, activeSession, todos, settings, weekPlan, weekdayOf } from '../store.js';
import { dragSort } from '../dragsort.js';
import { checklist } from '../checklist.js';
import { weekDots, summary, streak } from '../stats.js';
import { startOfWeek, dayKey } from '../dates.js';
import { stepsOfItems, getProgram, progText, programEstimate } from '../data.js';
import { durationLabel } from '../format.js';
import { withPrep } from '../engine.js';
import { greetingKey } from '../format.js';
import { confirmDialog, toast } from '../ui.js';
import { authPromptCard } from '../auth-prompt.js';

function resumeCard() {
  const act = activeSession.get();
  if (!act?.plan?.items) return null;
  let label;
  try {
    const steps = withPrep(stepsOfItems(act.plan.items, act.plan.restBetween));
    const total = steps.filter((s) => s.type === 'work').length;
    const idx = Math.min(act.snap?.i ?? 0, steps.length - 1);
    label = t('home.continueStep', { i: Math.max(1, steps.slice(0, idx + 1).filter((s) => s.type === 'work').length), n: total });
  } catch { activeSession.clear(); return null; }
  return h('div', { class: 'resume' },
    h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, t('home.continue')), h('div', { class: 'h3' }, act.plan.title), h('div', { class: 'small muted' }, label)),
    h('div', { class: 'stack', style: { gap: '6px' } },
      h('button', { class: 'btn', onClick: () => router.go('player', { resume: true }) }, t('home.continueBtn')),
      h('button', { class: 'link-btn', onClick: async () => {
        if (await confirmDialog({ title: t('home.discardTitle'), text: t('home.discardText'), confirm: t('home.continueDiscard'), danger: true })) { activeSession.clear(); toast(t('player.sessionCleared')); router.refresh(); }
      } }, t('home.continueDiscard'))));
}

function todoCard() {
  const day = dayKey(Date.now());
  const bar = h('i'), count = h('span', { class: 'small muted row-flex', style: { gap: '4px', whiteSpace: 'nowrap' } });
  const upd = (list) => {
    const n = list.length, d = list.filter((x) => x.d).length;
    bar.style.width = (n ? (d / n) * 100 : 0) + '%';
    if (n && d === n) count.replaceChildren(icon('check', 16), t('todo.allDone'));
    else count.textContent = !n ? t('todo.none') : t('todo.progress', { d, n });
  };
  // «Повторять каждый день»: дело запоминается в постоянном списке и появляется в каждом новом дне, пока его не удалят.
  const repeat = { toggle: (x) => {
    const daily = todos.daily();
    if (x.src) { todos.setDaily(daily.filter((r) => r.id !== x.src)); delete x.src; }
    else { const id = 'r_' + uid(); todos.setDaily([...daily, { id, t: x.t, days: [1, 2, 3, 4, 5, 6, 7] }]); x.src = id; }
  } };
  const onRemove = (x) => { if (x.src) todos.setDaily(todos.daily().filter((r) => r.id !== x.src)); };
  const cl = checklist({ items: todos.forDay(day), save: (l) => todos.set(day, l), placeholder: t('todo.add'), onUpdate: upd, repeat, onRemove });
  return h('section', { class: 'card todo htile', dataset: { key: 'todo' }, 'aria-label': t('todo.title') },
    h('div', { class: 'row-flex', style: { justifyContent: 'space-between' } }, h('h2', { class: 'h3' }, t('todo.title')), count),
    h('div', { class: 'bar', role: 'progressbar', 'aria-label': t('todo.title') }, bar), cl.el,
    h('button', { class: 'link-btn row-flex', style: { gap: '4px', alignSelf: 'flex-start' }, type: 'button', onClick: () => router.go('myday') }, t('myday.open'), icon('chev-r', 16)));
}

function weekTile(hist, now) {
  const dots = weekDots(hist, now), ws = summary(hist, startOfWeek(now), Infinity), st = streak(hist, now);
  const open = () => router.go('calendar');
  return h('section', { class: 'card weekcard htile', dataset: { key: 'week' }, role: 'button', tabindex: '0', 'aria-label': t('cal.open'), onClick: open, onKeydown: (e) => { if (e.key === 'Enter') open(); } },
    h('div', { class: 'row-flex', style: { justifyContent: 'space-between' } }, h('h2', { class: 'h3' }, t('cal.title')), h('span', { class: 'small muted row-flex', style: { gap: '2px' } }, t('cal.month'), icon('chev-r', 16))),
    h('div', { class: 'dots' }, ...dots.map((d) => h('div', { class: 'dot' + (d.done ? ' done' : '') + (d.today ? ' today' : '') + (d.future ? ' future' : '') },
      h('i', null, String(new Date(d.ts).getDate())), h('span', null, t('day.' + d.i))))),
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(st)), h('div', { class: 'l' }, t('home.streak'))),
      h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(ws.workouts)), h('div', { class: 'l' }, t('home.weekWorkouts'))),
      h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(Math.round(ws.sec / 60))), h('div', { class: 'l' }, t('home.weekMinutes')))));
}

// Тренировка по расписанию на сегодня: показывается, когда расписание составлено.
function planTile(hist, now) {
  if (!weekPlan.any()) return null;
  const day = dayKey(now), id = weekPlan.get(weekdayOf(day)), prog = id && id !== 'rest' ? getProgram(id) : null;
  const head = h('div', { class: 'eyebrow' }, t('week.todayPlan'));
  const open = () => router.go('week');
  if (!prog) return h('section', { class: 'card htile plan-today', dataset: { key: 'plan' }, role: 'button', tabindex: '0', onClick: open, onKeydown: (e) => { if (e.key === 'Enter') open(); } }, head,
    h('div', { class: 'h3' }, id === 'rest' ? t('week.restToday') : t('week.noneToday')), h('div', { class: 'small muted row-flex', style: { gap: '2px' } }, t('week.open'), icon('chev-r', 16)));
  const done = hist.some((s) => dayKey(s.at) === day && s.programId === id);
  return h('section', { class: 'card htile plan-today', dataset: { key: 'plan' }, 'aria-label': t('week.todayPlan') }, head,
    h('div', { class: 'h3' }, progText(prog).name), h('div', { class: 'small muted' }, durationLabel(programEstimate(prog))),
    done ? h('div', { class: 'row-flex small', style: { gap: '6px' } }, icon('check', 16), t('week.done'))
      : h('button', { class: 'btn', type: 'button', onClick: () => router.go('program', { id }) }, icon('play'), t('week.start')));
}

const TILES = ['plan', 'week', 'todo'];
export default function home() {
  const hist = history.all(), now = Date.now();
  const name = tg.user?.first_name;
  const greet = t(greetingKey(new Date().getHours()));
  const el = h('div', { class: 'pad home-col' });

  el.append(h('div', { class: 'greet' }, h('h1', { class: 'h1' }, name ? `${greet}, ${name}` : greet)));
  const resume = resumeCard();
  if (resume) el.append(resume);
  if (hist.length) { const pc = authPromptCard(); if (pc) el.append(pc); }

  // Две плашки: порядок задаёт пользователь — зажать плашку и перетащить (без кнопок и настроек).
  const saved = String(settings.get().homeOrder || '').split(',').filter((k) => TILES.includes(k));
  const order = [...new Set([...saved, ...TILES])];
  if (!saved.includes('plan')) order.splice(order.indexOf('plan'), 1), order.unshift('plan');
  const makers = { plan: () => planTile(hist, now), week: () => weekTile(hist, now), todo: todoCard };
  const tiles = h('div', { class: 'home-tiles' }, ...order.map((k) => makers[k]()).filter(Boolean));
  el.append(tiles);
  dragSort(tiles, { itemSel: '[data-key]', axis: 'y', scale: 1.02, onDrop: (keys) => settings.set({ homeOrder: keys.join(',') }) });
  return { el };
}
