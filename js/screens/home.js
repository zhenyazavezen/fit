import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { tg } from '../tg.js';
import { history, activeSession } from '../store.js';
import { recommend, weekDots, summary, streak } from '../stats.js';
import { startOfWeek } from '../dates.js';
import { allPrograms, progText, programEstimate, planForProgram, stepsOfItems } from '../data.js';
import { withPrep } from '../engine.js';
import { durationLabel, greetingKey } from '../format.js';
import { startPlan } from '../start.js';
import { confirmDialog, toast } from '../ui.js';
import { canStartProgram } from '../access.js';
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

export default function home() {
  const hist = history.all(), now = Date.now();
  const name = tg.user?.first_name;
  const greet = t(greetingKey(new Date().getHours()));
  const rec = recommend(hist, allPrograms().filter((p) => canStartProgram(p)), now);
  const el = h('div', { class: 'pad' });

  el.append(h('div', { class: 'greet' }, h('div', { class: 'eyebrow' }, t('app.tagline')), h('h1', { class: 'h1' }, name ? `${greet}, ${name}` : greet)));
  const resume = resumeCard();
  if (resume) el.append(resume);

  if (rec) {
    const p = rec.program, est = programEstimate(p);
    el.append(h('section', { class: 'hero', 'aria-label': t('home.recommend') },
      h('div', { class: 'eyebrow' }, t('home.recommend')),
      h('div', { class: 'name' }, progText(p).name),
      h('div', { class: 'time' }, durationLabel(est)),
      h('div', { class: 'meta' }, h('span', null, t('n.exercises', { n: p.items.length })), h('span', null, t('level.' + p.level))),
      h('p', { class: 'small muted' }, t('home.reason.' + rec.reason)),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onClick: () => startPlan(planForProgram(p)) }, icon('play'), t('common.start')),
        h('button', { class: 'btn ghost', onClick: () => router.go('program', { id: p.id }) }, t('common.details')))));
  }

  if (hist.length) { const pc = authPromptCard(); if (pc) el.append(pc); }

  const dots = weekDots(hist, now), ws = summary(hist, startOfWeek(now), Infinity), st = streak(hist, now);
  el.append(h('div', { class: 'section' }, h('h2', { class: 'h3' }, t('home.week'))));
  el.append(h('div', { class: 'card weekcard' },
    h('div', { class: 'dots' }, ...dots.map((d) => h('div', { class: 'dot' + (d.done ? ' done' : '') + (d.today ? ' today' : '') },
      h('i', null, d.done ? icon('check') : null), h('span', null, t('day.' + d.i))))),
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(st)), h('div', { class: 'l' }, t('home.streak'))),
      h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(ws.workouts)), h('div', { class: 'l' }, t('home.weekWorkouts'))),
      h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(Math.round(ws.sec / 60))), h('div', { class: 'l' }, t('home.weekMinutes'))))));

  const progs = allPrograms().filter((p) => !p.custom).slice(0, 6);
  el.append(h('div', { class: 'section' }, h('h2', { class: 'h3' }, t('home.programs')), h('button', { class: 'link-btn', onClick: () => router.openTab('workouts') }, t('home.allPrograms'), icon('chev-r', 16))));
  el.append(h('div', { class: 'hscroll' }, ...progs.map((p) => h('button', { class: 'pcard', onClick: () => router.go('program', { id: p.id }) },
    h('div', { class: 't' }, progText(p).name),
    h('div', { class: 'm' }, `${durationLabel(programEstimate(p))} · ${t('level.' + p.level)}`)))));

  el.append(h('div', { class: 'list', style: { marginTop: '28px' } },
    link('profile', t('map.title'), t('home.mapHint'), () => router.go('bodymap')),
    link('catalog', t('home.catalogLink'), t('home.catalogHint'), () => router.openTab('catalog')),
    link('progress', t('home.progressLink'), t('home.progressHint'), () => router.openTab('progress'))));
  return { el };
}

function link(ic, title, sub, onClick) {
  return h('button', { class: 'item', onClick }, icon(ic), h('div', { class: 'grow' }, h('div', { class: 't' }, title), h('div', { class: 's' }, sub)), icon('chev-r', 18));
}
