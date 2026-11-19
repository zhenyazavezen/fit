// Проверка данных каталога: node tools/validate.mjs  (код выхода 1 при ошибках)
// Правила — в docs/DECISIONS.md: D-001 (нет медиа-полей), D-008 и D-020 (без обещаний и непроверенных ограничений), D-022 (стороны).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

export function validate(dir = root) {
  const rd = (p) => JSON.parse(fs.readFileSync(path.join(dir, p), 'utf8'));
  const meta = rd('data/meta.json'), exercises = rd('data/exercises.json'), programs = rd('data/programs.json');
  const langs = fs.readdirSync(path.join(dir, 'data')).filter((f) => /^content\.\w+\.json$/.test(f)).map((f) => f.split('.')[1]);
  const errors = [], warnings = [];
  const err = (m) => errors.push(m), warn = (m) => warnings.push(m);

  const FORBIDDEN_FIELDS = ['demo', 'video', 'videos', 'image', 'images', 'photo', 'gif', 'poster', 'src', 'media', 'frames'];
  const PROMISES = [/(?<!не )гарантир/i, /сжига/i, /калори/i, /похуд/i, /худе/i, /лечит|лечени|излечи/i, /безопасн/i, /полезн/i, /без риска/i, /быстр\S* результат/i, /результат\S* за \d/i, /7 минут/i];
  const ids = new Set();
  const SIDES = ['none', 'sequential', 'alternating'];

  for (const ex of exercises) {
    const at = `упражнение ${ex.id}`;
    if (!/^[a-z0-9_]+$/.test(ex.id)) err(`${at}: некорректный id`);
    if (ids.has(ex.id)) err(`${at}: дубликат id`);
    ids.add(ex.id);
    for (const f of FORBIDDEN_FIELDS) if (f in ex) err(`${at}: запрещённое медиа-поле «${f}» (D-001)`);
    if (!ex.categories?.length) err(`${at}: нет категорий`);
    for (const c of ex.categories || []) if (!meta.categories.includes(c)) err(`${at}: неизвестная категория ${c}`);
    if (!ex.muscles?.primary?.length) err(`${at}: нет целевых мышц`);
    for (const m of [...(ex.muscles?.primary || []), ...(ex.muscles?.secondary || [])]) if (!meta.muscles.includes(m)) err(`${at}: неизвестная мышца ${m}`);
    if (!meta.levels.includes(ex.level)) err(`${at}: неизвестный уровень`);
    if (!['reps', 'time'].includes(ex.mode)) err(`${at}: mode должен быть reps или time`);
    if (!ex.equipment?.length) err(`${at}: нет оборудования (используйте «none»)`);
    for (const e of ex.equipment || []) if (!meta.equipment.includes(e)) err(`${at}: неизвестное оборудование ${e}`);
    if (!SIDES.includes(ex.sides)) err(`${at}: sides должен быть none | sequential | alternating`);
    if (ex.sides === 'sequential' && !(ex.switchSec >= 0)) err(`${at}: для sequential нужен switchSec`);
    const d = ex.defaults || {};
    if (!(d.sets >= 1)) err(`${at}: defaults.sets`);
    if (ex.mode === 'time' ? !(d.seconds > 0) : !(d.reps > 0)) err(`${at}: defaults не соответствуют mode`);
    if (!(d.rest >= 0)) err(`${at}: defaults.rest`);
    for (const k of ['easier', 'harder']) if (ex[k] && !exercises.some((o) => o.id === ex[k])) err(`${at}: ${k} ссылается на несуществующее ${ex[k]}`);
    if (ex.review !== 'draft' && ex.review !== 'reviewed') err(`${at}: нужно поле review`);
    if (ex.access !== 'free' && ex.access !== 'premium') err(`${at}: нужно поле access`);
    for (const st of ex.stress || []) if (!['impact', 'wrist', 'knee', 'shoulder', 'back'].includes(st)) err(`${at}: неизвестная нагрузка ${st}`);
    if (ex.cautions) for (const c of ex.cautions) if (!c.source) err(`${at}: ограничение без источника (D-020)`);
  }

  for (const p of programs) {
    const at = `программа ${p.id}`;
    for (const f of FORBIDDEN_FIELDS) if (f in p) err(`${at}: запрещённое медиа-поле «${f}»`);
    if (!meta.levels.includes(p.level)) err(`${at}: уровень`);
    for (const g of p.goals || []) if (!meta.goals.includes(g)) err(`${at}: неизвестная цель ${g}`);
    if (!p.items?.length) err(`${at}: пусто`);
    for (const it of p.items || []) {
      if (!ids.has(it.ex)) err(`${at}: нет упражнения ${it.ex}`);
      for (const k of ['sets', 'reps', 'seconds', 'rest', 'switchSec']) if (k in it && !(it[k] >= 0)) err(`${at}: ${it.ex}.${k}`);
      if ('reps' in it && 'seconds' in it) err(`${at}: ${it.ex}: нельзя задавать и reps, и seconds`);
    }
  }

  for (const lang of langs) {
    const c = rd(`data/content.${lang}.json`);
    const base = lang === 'ru';
    for (const ex of exercises) {
      const t = c.exercises?.[ex.id];
      if (!t) { (base ? err : warn)(`[${lang}] нет текста упражнения ${ex.id}`); continue; }
      if (!t.name || !t.desc || !t.start) err(`[${lang}] ${ex.id}: нужны name, desc, start`);
      if (!(t.steps?.length >= 2)) err(`[${lang}] ${ex.id}: нужна инструкция из ≥2 шагов`);
      if (!(t.mistakes?.length >= 1)) err(`[${lang}] ${ex.id}: нужны частые ошибки`);
      const text = [t.name, t.desc, t.start, ...(t.steps || []), ...(t.mistakes || []), t.tip || ''].join(' | ');
      for (const re of PROMISES) if (re.test(text)) err(`[${lang}] ${ex.id}: формулировка похожа на обещание/медицинское утверждение (${re}) — D-008/D-020`);
      for (const k of Object.keys(t)) if (!['name', 'aliases', 'desc', 'start', 'steps', 'mistakes', 'tip'].includes(k)) err(`[${lang}] ${ex.id}: неизвестное поле ${k}`);
    }
    for (const p of programs) {
      const t = c.programs?.[p.id];
      if (!t) { (base ? err : warn)(`[${lang}] нет текста программы ${p.id}`); continue; }
      const text = [t.name, t.desc, t.note || ''].join(' | ');
      for (const re of PROMISES) if (re.test(text)) err(`[${lang}] программа ${p.id}: подозрительная формулировка (${re})`);
      if (/\d+\s*мин/i.test(t.desc || '')) err(`[${lang}] программа ${p.id}: длительность в описании запрещена — считается по данным`);
    }
  }
  return { errors, warnings, counts: { exercises: exercises.length, programs: programs.length, langs } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = validate();
  r.warnings.forEach((w) => console.log('предупреждение:', w));
  r.errors.forEach((e) => console.error('ОШИБКА:', e));
  console.log(`Упражнений: ${r.counts.exercises}, программ: ${r.counts.programs}, языков: ${r.counts.langs.join(', ')}. Ошибок: ${r.errors.length}, предупреждений: ${r.warnings.length}.`);
  process.exit(r.errors.length ? 1 : 0);
}
