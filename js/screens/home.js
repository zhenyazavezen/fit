import { h, icon, uid } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { tg } from '../tg.js';
import { history, activeSession, todos, settings } from '../store.js';
import { recommendPrograms } from '../planner.js';
import { userProfile } from '../profile-data.js';
import { dayCard } from '../todocard.js';
import { dragSort } from '../dragsort.js';
import { checklist } from '../checklist.js';
import { recommend, streak } from '../stats.js';
import { dayKey, startOfWeek } from '../dates.js';
import { spentLabel } from '../format.js';
import { D, allPrograms, stepsOfItems, getProgram, progText, programEstimate, planForProgram } from '../data.js';
import { startPlan } from '../start.js';
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

// «Сегодня»: открыл приложение — сразу видно, что делать. Тренировка подбирается по уровню, цели и отдыху мышц.
function todayCard(hist, now) {
  const day = dayKey(now), doneSec = hist.filter((s) => dayKey(s.at) === day).reduce((a, s) => a + (s.durationSec || 0), 0);
  const wk = startOfWeek(now), weekSec = hist.filter((s) => s.at >= wk).reduce((a, s) => a + (s.durationSec || 0), 0), st = streak(hist, now);
  const note = st || weekSec ? h('div', { class: 'small muted' }, [st ? t('today.streak', { days: t('home.streakDays', { n: st }) }) : '', weekSec ? t('today.week', { time: spentLabel(weekSec) }) : ''].filter(Boolean).join(' · ')) : null;
  const up = userProfile.get(), dow = (new Date(now).getDay() + 6) % 7;
  const plan = up.days.includes(dow) ? (up.time ? ' · ' + t('today.planned', { time: up.time }) : '') : up.days.length ? ' · ' + t('today.restDay') : '';
  const head = h('div', { class: 'eyebrow' }, t('today.title') + plan);
  if (doneSec > 0) {
    return h('section', { class: 'card stack today htile', dataset: { key: 'today' }, 'aria-label': t('today.title') }, head,
      h('div', { class: 'row-flex', style: { gap: '8px' } }, icon('check', 22), h('div', { class: 'h2' }, t('today.done'))),
      h('div', { class: 'muted' }, t('today.doneSub', { min: Math.max(1, Math.round(doneSec / 60)) })), note);
  }
  const ctx = { exById: D.exById, history: hist, programs: allPrograms(), now };
  let prog = recommendPrograms(userProfile.get(), ctx, { limit: 1 })[0]?.program;
  if (!prog) prog = recommend(hist, allPrograms(), now)?.program;
  if (!prog) return null;
  return h('section', { class: 'card stack today htile', dataset: { key: 'today' }, 'aria-label': t('today.title') }, head,
    h('div', { class: 'h2' }, progText(prog).name),
    h('div', { class: 'muted' }, t('today.meta', { n: prog.items.length, time: durationLabel({ ...programEstimate(prog), exact: false }) })),
    h('button', { class: 'btn', type: 'button', onClick: () => startPlan(planForProgram(prog)) }, icon('play'), t('today.start')),
    note);
}

const todoCard = () => dayCard({ list: todos, k: 'todo', key: 'todo', route: 'myday' });

const TILES = ['today', 'todo'];
export default function home() {
  const hist = history.all(), now = Date.now();
  const name = tg.user?.first_name;
  const greet = t(greetingKey(new Date().getHours()));
  const el = h('div', { class: 'pad home-col' });

  el.append(h('div', { class: 'greet' }, h('h1', { class: 'h1' }, name ? `${greet}, ${name}` : greet)));
  const resume = resumeCard();
  if (resume) el.append(resume);
  if (hist.length) { const pc = authPromptCard(); if (pc) el.append(pc); }

  // Две плашки («Сегодня» и «Дела»): порядок задаёт пользователь — зажать плашку и перетащить (без кнопок и настроек).
  const saved = String(settings.get().homeOrder || '').split(',').filter((k) => TILES.includes(k));
  const order = [...new Set([...(saved.includes('today') ? [] : ['today']), ...saved, ...TILES])];
  const makers = { today: () => todayCard(hist, now), todo: todoCard };
  const tiles = h('div', { class: 'home-tiles' }, ...order.map((k) => makers[k]()).filter(Boolean));
  el.append(tiles);
  dragSort(tiles, { itemSel: '[data-key]', axis: 'y', scale: 1.02, onDrop: (keys) => settings.set({ homeOrder: keys.join(',') }) });
  return { el };
}
