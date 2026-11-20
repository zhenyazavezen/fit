// Сквозные проверки в Chromium: node tests/e2e/run.mjs   (скриншоты: SHOTS=папка)
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open, root } from './lib.mjs';

const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); pass++; results.push(`✓ ${name}`); } catch (e) { fail++; results.push(`✗ ${name}\n    ${String(e.message || e).split('\n')[0]}\n    ${(String(e.stack || '').split('\n').find((l) => l.includes('run.mjs')) || '').trim()}`); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: ожидалось «${b}», получено «${a}»`); };

const srv = await serve();
const browser = await launch();
const T0 = new Date('2026-11-13T10:00:00');

async function fresh({ w = 390, h = 844, clock = true, tgMock = false, pre } = {}) {
  const o = await open(browser, srv.url, { w, h, tgMock });
  if (clock) await o.page.clock.install({ time: T0 });
  if (pre) await o.page.addInitScript(pre);
  await o.page.goto(srv.url + (tgMock ? '#tgWebAppData=mock' : ''));
  await o.page.waitForSelector('#tabbar button', { timeout: 8000 });
  return o;
}
const tab = (p, name) => p.locator(`#tabbar [data-tab="${name}"]`).click();
const btn = (p, name, opts = {}) => p.getByRole('button', { name, ...opts });
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${n}.png` }); };
const text = (p, sel) => p.locator(sel).innerText();
const run = (p, ms) => p.clock.runFor(ms);

for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
  await test(`Запуск ${w}×${h}: без ошибок консоли и горизонтальной прокрутки, 5 вкладок`, async () => {
    const { page, errors, failed, ctx } = await fresh({ w, h });
    eq(await page.locator('#tabbar button').count(), 5, 'вкладок');
    for (const name of ['workouts', 'catalog', 'progress', 'profile', 'home']) {
      await tab(page, name); await page.waitForTimeout(80);
      ok(!/SEVEN/i.test(await page.locator('body').innerText()), `в интерфейсе вкладки «${name}» нет старого названия`);
      ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.getElementById('screen').scrollWidth > document.getElementById('screen').clientWidth)), `горизонтальная прокрутка на ${name}`);
      await shot(page, `${name}-${w}`);
    }
    eq(errors.length, 0, 'ошибки консоли: ' + errors.join(' | '));
    eq(failed.length, 0, 'неудачные запросы: ' + failed.join(' | '));
    await ctx.close();
  });
}

await test('Нет запросов к видео, картинкам и сторонним хостам', async () => {
  const { page, ctx } = await fresh();
  const reqs = [];
  page.on('request', (r) => reqs.push(r.url()));
  await tab(page, 'catalog'); await page.locator('.item').first().click(); await page.waitForTimeout(200);
  ok(reqs.every((u) => u.startsWith(srv.url) || u.startsWith('data:')), 'внешние запросы: ' + reqs.filter((u) => !u.startsWith(srv.url)).join(', '));
  ok(!reqs.some((u) => /\.(mp4|webm|gif|jpe?g|png|webp|m4a|mp3)(\?|$)/i.test(u)), 'медиа-запрос');
  ok(!srv.reqs.some((u) => /\.(mp4|webm|gif|jpe?g|webp|m4a|mp3)$/i.test(u)), 'сервер отдавал медиа');
  eq(await page.locator('video, audio, img, iframe').count(), 0, 'медиа-элементы');
  await ctx.close();
});

await test('Каталог: поиск (ё/е, синонимы), категории, фильтры, избранное, карточка упражнения', async () => {
  const { page, errors, ctx } = await fresh();
  await tab(page, 'catalog');
  const total = await page.locator('.item').count();
  eq(total, 61, 'всего упражнений');
  await page.fill('#cat-q', 'бёрпи'); await run(page, 300);
  eq(await page.locator('.item').count(), 2, 'поиск «бёрпи»: бёрпи и облегчённый вариант');
  await page.fill('#cat-q', 'zzz'); await run(page, 300);
  ok((await text(page, '.empty')).includes('Ничего не найдено'), 'пустое состояние');
  await btn(page, 'Сбросить всё').click();
  eq(await page.locator('.item').count(), 61, 'после сброса');
  await page.getByRole('button', { name: 'Пресс', exact: true }).click();
  const abs = await page.locator('.item').count(); ok(abs > 0 && abs < 61, 'категория «Пресс»');
  await page.getByRole('button', { name: 'Ягодицы', exact: true }).click();
  ok((await page.locator('.item').count()) > abs, 'две категории расширяют выбор');
  await page.getByRole('button', { name: 'Все', exact: true }).click();
  await btn(page, /Фильтры/).click();
  await page.getByRole('button', { name: 'Стул', exact: true }).click();
  const showTxt = await text(page, '.sheet .foot .btn:last-child'); ok(/Показать: \d+/.test(showTxt), 'счётчик в шторке: ' + showTxt);
  await page.locator('.sheet .foot .btn:last-child').click();
  const chair = await page.locator('.item').count(); ok(chair > 0 && chair < 61, 'фильтр «Стул»: ' + chair);
  await shot(page, 'catalog-filtered');
  await page.locator('.item').first().click();
  await page.waitForSelector('.steps');
  ok((await page.locator('.steps li').count()) >= 3, 'шаги техники');
  ok((await page.locator('.mchip.primary').count()) >= 1, 'целевые мышцы');
  await shot(page, 'exercise-card');
  await page.locator('.fav-btn').click();
  eq(await page.locator('.fav-btn').getAttribute('aria-pressed'), 'true', 'избранное включено');
  await page.goBack(); await page.waitForSelector('.catalog-head');
  await btn(page, 'Избранное').click();
  eq(await page.locator('.item').count(), 1, 'избранное в каталоге');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Карточка: «Попробовать» запускает тренировку из одного упражнения (повторения → отдых → завершение)', async () => {
  const { page, errors, ctx } = await fresh();
  await tab(page, 'catalog'); await page.fill('#cat-q', 'приседания'); await run(page, 300);
  await page.locator('.item', { hasText: 'Приседания' }).first().click();
  await btn(page, 'Попробовать упражнение').click();
  await page.waitForSelector('.player');
  eq(await text(page, '.p-phase'), 'ПРИГОТОВЬТЕСЬ', 'фаза подготовки');
  await run(page, 5100);
  eq(await text(page, '.p-phase'), 'РАБОТА', 'фаза работы');
  eq(await text(page, '.p-big'), '15', 'цель повторений');
  ok((await text(page, '.p-meta')).includes('Подход 1 из 3'), 'индикатор подхода');
  for (let i = 0; i < 3; i++) {
    await btn(page, 'Готово').click();
    if (i < 2) { eq(await text(page, '.p-phase'), 'ОТДЫХ', 'отдых после подхода'); await run(page, 45_100); }
  }
  await page.waitForSelector('.p-finish');
  ok((await text(page, '.p-finish')).includes('3/3'), 'итог: подходы');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Программа «Экспресс-круг (средний)»: 7:55, стороны боковой планки, прохождение до конца и запись в историю', async () => {
  const { page, errors, ctx } = await fresh();
  await tab(page, 'workouts');
  await page.locator('.pcard-wide', { hasText: 'Экспресс-круг (средний)' }).click();
  await page.waitForSelector('.facts');
  ok((await text(page, '.facts')).includes('7:55'), 'длительность 7:55 на карточке: ' + await text(page, '.facts'));
  ok(!(await text(page, 'body')).includes('7 минут'), 'нет названия «7 минут»');
  ok((await text(page, '.list')).includes('по 15') || (await text(page, '.list')).includes('15 с'), 'доза боковой планки');
  await shot(page, 'program-circuit');
  await btn(page, 'Начать тренировку').click();
  await page.waitForSelector('.player');
  await run(page, 5000);
  eq(await text(page, '.p-name'), 'Прыжки «звёздочка»', 'первое упражнение');
  eq(await text(page, '.p-big'), '0:30', 'таймер 0:30');
  await run(page, 10_000);
  eq(await text(page, '.p-big'), '0:20', 'таймер идёт');
  await shot(page, 'player-work');
  await run(page, 20_000);
  eq(await text(page, '.p-phase'), 'ОТДЫХ', 'отдых после упражнения');
  eq(await text(page, '.p-big'), '0:10', 'отдых 10 с');
  await shot(page, 'player-rest');
  // до боковой планки: 475 − 30 = 445 с остаётся; боковая планка начинается за 35 с до конца
  await run(page, 410_000);          // боковая планка начинается на 440-й секунде программы (475 − 15 − 5 − 15)
  const phase = await text(page, '.p-phase'); const name = await text(page, '.p-name');
  ok(name.includes('Боковая планка'), 'дошли до боковой планки: ' + name + ' / ' + phase);
  ok((await text(page, '.p-meta')).includes('Правая сторона'), 'сначала правая сторона');
  await run(page, 15_000);
  eq(await text(page, '.p-phase'), 'СМЕНА СТОРОНЫ', 'пауза смены стороны');
  eq(await text(page, '.p-big'), '0:05', '5 секунд на смену');
  await run(page, 5_000);
  ok((await text(page, '.p-meta')).includes('Левая сторона'), 'затем левая сторона');
  await run(page, 15_000);
  await page.waitForSelector('.p-finish');
  ok((await text(page, '.p-finish')).includes('12/12'), 'все 12 упражнений: ' + await text(page, '.p-finish'));
  const hist = await page.evaluate(() => JSON.parse(localStorage.getItem('seven:history')));
  eq(hist.length, 1, 'запись в истории'); eq(hist[0].durationSec, 475, 'время тренировки 475 с (подготовка не входит)');
  eq(hist[0].completed, true, 'completed');
  eq(await page.evaluate(() => localStorage.getItem('seven:active')), null, 'активная сессия очищена');
  await shot(page, 'player-finish');
  await btn(page, 'Смотреть прогресс').click();
  await page.waitForSelector('.chart');
  ok((await text(page, '.tiles')).includes('1'), 'прогресс показывает 1 тренировку');
  await shot(page, 'progress-filled');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Пауза не сдвигает таймер; возврат из фона засчитывает фактическое время', async () => {
  const { page, ctx } = await fresh();
  await tab(page, 'workouts'); await page.locator('.pcard-wide', { hasText: 'Экспресс-круг' }).click(); await btn(page, 'Начать тренировку').click();
  await run(page, 5000 + 10_000);
  await btn(page, 'Пауза').click();
  eq(await text(page, '.p-phase'), 'ПАУЗА', 'пауза включена');
  const before = await text(page, '.p-big');
  await run(page, 60_000);
  eq(await text(page, '.p-big'), before, 'на паузе время стоит');
  await btn(page, 'Продолжить').click();
  await run(page, 2000);
  ok((await text(page, '.p-big')) !== before, 'после паузы идёт');
  // «фон»: 100 секунд проходят одним скачком
  await page.clock.fastForward(100_000); await run(page, 250);
  const name = await text(page, '.p-name');
  ok(!name.includes('Прыжки'), 'шаги прошли по фактическому времени: ' + name);
  await ctx.close();
});

await test('Выход: «продолжу позже» → карточка на главной → продолжение; отмена очищает', async () => {
  const { page, ctx } = await fresh();
  await tab(page, 'workouts'); await page.locator('.pcard-wide', { hasText: 'Всё тело A (начальный)' }).click(); await btn(page, 'Начать тренировку').click();
  await run(page, 5000 + 3000);
  await btn(page, 'Выйти из тренировки').click();
  await btn(page, 'Выйти, продолжу позже').click();
  await tab(page, 'home');
  await page.waitForSelector('.resume');
  ok((await text(page, '.resume')).includes('Всё тело A (начальный)'), 'карточка продолжения');
  await shot(page, 'home-resume');
  await btn(page, 'Продолжить', { exact: true }).first().click();
  await page.waitForSelector('.player');
  eq(await text(page, '.p-phase'), 'ПАУЗА', 'восстановлено на паузе');
  await btn(page, 'Продолжить').click();
  await btn(page, 'Выйти из тренировки').click();
  await btn(page, 'Отменить без сохранения').click();
  await tab(page, 'home'); await page.waitForSelector('.hero');
  eq(await page.locator('.resume').count(), 0, 'карточка продолжения исчезла');
  eq(await page.evaluate(() => localStorage.getItem('seven:active')), null, 'сессия очищена');
  await ctx.close();
});

await test('Системная «Назад»: в тренировке открывает выход, а не закрывает экран', async () => {
  const { page, ctx } = await fresh();
  await tab(page, 'workouts'); await page.locator('.pcard-wide').first().click(); await btn(page, 'Начать тренировку').click();
  await page.waitForSelector('.player');
  await page.goBack(); await page.waitForSelector('.sheet');
  ok((await text(page, '.sheet')).includes('Выйти из тренировки'), 'шторка выхода');
  await page.goBack(); await page.waitForTimeout(150);
  eq(await page.locator('.sheet').count(), 0, 'шторка закрыта');
  await page.waitForSelector('.player');
  await ctx.close();
});

await test('Конструктор: своя программа создаётся, редактируется, запускается и удаляется', async () => {
  const { page, errors, ctx } = await fresh();
  await tab(page, 'workouts'); await page.getByRole('button', { name: 'Мои', exact: true }).click();
  ok((await text(page, '.empty')).includes('Своих программ пока нет'), 'пусто');
  await btn(page, 'Создать программу').click();
  ok(await page.locator('.btn', { hasText: 'Сохранить программу' }).isDisabled(), 'сохранение заблокировано');
  await page.fill('#prog-name', 'Моя проверка');
  await btn(page, 'Добавить упражнение').click();
  await page.fill('#pick-q', 'планка'); 
  await page.locator('.sheet .item', { hasText: /^Планка/ }).first().click();
  await page.locator('.sheet .item', { hasText: 'Скручивания' }).first().click().catch(() => {});
  await btn(page, 'Готово').click();
  ok(await page.locator('.list .item').count() >= 1, 'упражнение добавлено');
  await page.locator('.list .item .grow').first().click();   // параметры
  await page.locator('.sheet .stepper .icon-btn').nth(1).click();   // подходов +1
  await btn(page, 'Готово').click();
  await page.locator('.btn', { hasText: 'Сохранить программу' }).click();
  await page.waitForSelector('.facts');
  ok((await text(page, 'h1')).includes('Моя проверка'), 'открылась карточка программы');
  await btn(page, 'Начать тренировку').click(); await page.waitForSelector('.player');
  await btn(page, 'Выйти из тренировки').click(); await btn(page, 'Отменить без сохранения').click();
  await tab(page, 'home'); await page.waitForSelector('.hero');
  await tab(page, 'workouts'); await page.getByRole('button', { name: 'Мои', exact: true }).click();
  await page.locator('.pcard-wide', { hasText: 'Моя проверка' }).click();
  await btn(page, 'Удалить').click(); await page.locator('.sheet .btn.danger').click();
  await page.waitForSelector('.pad');
  eq(await page.evaluate(() => JSON.parse(localStorage.getItem('seven:programs') || '[]').length), 0, 'программа удалена');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Профиль: настройки сохраняются, нет экспорта, «О приложении», сброс данных с подтверждением', async () => {
  const { page, errors, ctx } = await fresh();
  await tab(page, 'profile');
  const sw = page.getByRole('switch', { name: 'Звуковые сигналы' });
  eq(await sw.getAttribute('aria-checked'), 'true', 'звук включён по умолчанию');
  await sw.click();
  eq(await page.evaluate(() => JSON.parse(localStorage.getItem('seven:settings')).sound), false, 'настройка сохранена');
  await page.reload(); await page.waitForSelector('#tabbar button'); await tab(page, 'profile');
  eq(await page.getByRole('switch', { name: 'Звуковые сигналы' }).getAttribute('aria-checked'), 'false', 'после перезагрузки');
  ok(!/Экспорт/.test(await page.locator('body').innerText()), 'экспорта данных в профиле нет');
  await page.getByRole('button', { name: /О приложении/ }).click();
  const about = await text(page, '.pad');
  const approved = 'ZAVEZEN_FIT помогает заниматься дома самостоятельно: понятная инструкция, время, повторения и структура тренировки. Без видео и голоса тренера.';
  ok(about.includes(approved), 'утверждённый текст на месте');
  eq(about.replace(/\s+/g, ' ').replace('О приложении', '').trim(), approved, 'в разделе «О приложении» нет ничего, кроме утверждённого текста');
  ok(!/SEVEN|MIT|на основе|Исходный проект|Версия|черновик|врач/i.test(about), 'устаревших пояснений в разделе нет');
  eq(await page.title(), 'ZAVEZEN_FIT', 'заголовок страницы');
  await shot(page, 'about');
  await page.goBack(); await page.waitForSelector('.avatar');
  await btn(page, 'Удалить все данные').click();
  ok((await text(page, '.sheet')).includes('Отменить это нельзя'), 'подтверждение');
  await page.locator('.sheet .btn.danger').click();
  eq(await page.evaluate(() => localStorage.getItem('seven:settings')), null, 'данные удалены');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Фото профиля: выбор из галереи, обрезка, сохранение, перезагрузка, удаление; поддержка ведёт к @zhenya_zavezen', async () => {
  const mock = () => { window.__tg = []; window.Telegram = { WebApp: { platform: 'android', initDataUnsafe: { user: { first_name: 'Женя' } }, ready() {}, expand() {}, setHeaderColor() {}, setBackgroundColor() {}, setBottomBarColor() {}, disableVerticalSwipes() {}, onEvent() {},
    viewportStableHeight: 700, viewportHeight: 700, safeAreaInset: { top: 0, bottom: 0 }, contentSafeAreaInset: { top: 0, bottom: 0 }, enableClosingConfirmation() {}, disableClosingConfirmation() {},
    openTelegramLink(u) { window.__tg.push('open:' + u); }, openLink(u) { window.__tg.push('link:' + u); }, HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} }, BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} } } }; };
  const { page, errors, ctx } = await fresh({ tgMock: mock });
  await tab(page, 'profile');
  // тестовое фото 1200×800 (не квадрат), нарисованное в браузере
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 800; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 1200, 800); gr.addColorStop(0, '#c33'); gr.addColorStop(1, '#36c'); g.fillStyle = gr; g.fillRect(0, 0, 1200, 800);
    g.fillStyle = '#fff'; g.fillRect(500, 300, 200, 200);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (const b of buf) s += String.fromCharCode(b); return btoa(s);
  });
  await page.locator('.avatar-btn').tap(); await page.waitForSelector('.sheet input[type=file]', { state: 'attached' });
  await page.locator('.sheet input[type=file]').setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  await page.waitForSelector('.crop-canvas');
  const box = await page.locator('.crop-canvas').boundingBox();
  await page.mouse.move(box.x + 140, box.y + 140); await page.mouse.down(); await page.mouse.move(box.x + 100, box.y + 150, { steps: 5 }); await page.mouse.up();
  await page.locator('.crop-zoom').fill('2');
  // щипок двумя пальцами увеличивает масштаб; перетаскивание работает по обеим осям
  const pz = await page.evaluate(() => {
    const c = document.querySelector('.crop-canvas'), r = c.getBoundingClientRect(), sl = document.querySelector('.crop-zoom');
    const ev = (type, id, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerType: 'touch' }));
    const z0 = Number(sl.value);
    ev('pointerdown', 11, 120, 140); ev('pointerdown', 12, 160, 140);
    ev('pointermove', 12, 200, 140); ev('pointermove', 12, 220, 140);
    ev('pointerup', 11, 120, 140); ev('pointerup', 12, 220, 140);
    return [z0, Number(sl.value)];
  });
  if (!(pz[1] > pz[0])) throw new Error('щипок не увеличил масштаб: ' + pz);
  const before = await page.locator('.crop-canvas').screenshot();
  await page.evaluate(() => {
    const c = document.querySelector('.crop-canvas'), r = c.getBoundingClientRect();
    const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: 21, clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerType: 'touch' }));
    ev('pointerdown', 140, 140); ev('pointermove', 150, 100); ev('pointerup', 150, 100);
  });
  if (before.equals(await page.locator('.crop-canvas').screenshot())) throw new Error('перетаскивание по вертикали не двигает фото');
  await shot(page, 'avatar-crop');
  await btn(page, 'Сохранить').click();
  await page.waitForSelector('.avatar img');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('seven:avatar')).img);
  ok(/^data:image\/jpeg;base64,/.test(saved) && saved.length < 60000, 'фото сохранено как маленький JPEG, размер ' + saved.length);
  eq(await page.evaluate(() => { const i = document.querySelector('.avatar img'); return i.naturalWidth + 'x' + i.naturalHeight; }), '256x256', 'квадрат 256×256');
  await shot(page, 'avatar-profile');
  await page.reload(); await page.waitForSelector('#tabbar button'); await tab(page, 'profile'); await page.waitForSelector('.avatar img');
  // поддержка
  await page.getByRole('button', { name: /Поддержка/ }).click();
  ok((await page.evaluate(() => window.__tg)).some((x) => x.includes('t.me/zhenya_zavezen')), 'поддержка открывает t.me/zhenya_zavezen: ' + await page.evaluate(() => window.__tg.join()));
  // удаление фото
  await btn(page, 'Изменить фото профиля').click(); await btn(page, 'Убрать фото').click();
  eq(await page.evaluate(() => JSON.parse(localStorage.getItem('seven:avatar')).img), '', 'фото убрано');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Повреждённое хранилище не ломает приложение; копия сохраняется', async () => {
  const { page, errors, ctx } = await fresh({ pre: () => { try { if (!localStorage.getItem('seven:x')) { localStorage.setItem('seven:history', '{битый json'); localStorage.setItem('seven:x', '1'); } } catch { /* */ } } });
  await tab(page, 'progress');
  ok((await text(page, '.empty')).includes('Здесь появится ваш прогресс'), 'пустой прогресс');
  ok(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('seven:history:corrupt:'))), 'копия повреждённых данных');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Telegram Mini App (эмуляция): ready/expand, цвета, BackButton, подтверждение закрытия, имя', async () => {
  const mock = () => {
    const log = []; window.__tg = log;
    const btn = { show() { log.push('back:show'); }, hide() { log.push('back:hide'); }, onClick(f) { this._f = f; }, offClick() { this._f = null; } };
    window.Telegram = { WebApp: { platform: 'android', initDataUnsafe: { user: { first_name: 'Женя', language_code: 'ru' } }, ready() { log.push('ready'); }, expand() { log.push('expand'); },
      setHeaderColor(c) { log.push('header:' + c); }, setBackgroundColor() {}, setBottomBarColor() {}, disableVerticalSwipes() { log.push('noswipe'); }, onEvent() {},
      viewportStableHeight: 700, viewportHeight: 700, safeAreaInset: { top: 0, bottom: 10 }, contentSafeAreaInset: { top: 24, bottom: 0 },
      enableClosingConfirmation() { log.push('confirm:on'); }, disableClosingConfirmation() { log.push('confirm:off'); }, openTelegramLink(u) { log.push('open:' + u); },
      HapticFeedback: { impactOccurred(k) { log.push('haptic:' + k); }, notificationOccurred(k) { log.push('haptic:' + k); }, selectionChanged() { log.push('haptic:select'); } }, BackButton: btn } };
  };
  const { page, errors, ctx } = await fresh({ tgMock: mock });
  ok((await text(page, 'h1')).includes('Женя'), 'приветствие с именем: ' + await text(page, 'h1'));
  const log0 = await page.evaluate(() => window.__tg);
  ok(log0.includes('ready') && log0.includes('expand') && log0.includes('noswipe'), 'ready/expand/noswipe: ' + log0.join());
  eq(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-h').trim()), '700px', '--app-h');
  eq(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tg-top').trim()), '24px', '--tg-top');
  await page.locator('.pcard').first().click(); await page.waitForSelector('.facts');
  ok((await page.evaluate(() => window.__tg)).includes('back:show'), 'BackButton показан на вложенном экране');
  await btn(page, 'Начать тренировку').click(); await page.waitForSelector('.player');
  ok((await page.evaluate(() => window.__tg)).includes('confirm:on'), 'подтверждение закрытия включено');
  await run(page, 5100);          // подготовка → первый рабочий шаг (вибрация)
  await btn(page, 'Выйти из тренировки').click(); await btn(page, 'Отменить без сохранения').click();
  await tab(page, 'home'); await page.waitForSelector('.hero');
  const log = await page.evaluate(() => window.__tg);
  ok(log.includes('confirm:off'), 'подтверждение закрытия выключено'); ok(log.lastIndexOf('back:hide') > log.lastIndexOf('back:show'), 'BackButton скрыт на главной');
  ok(log.some((x) => x.startsWith('haptic')), 'вибрация вызывалась');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Главная после тренировки: серия и неделя обновляются', async () => {
  const { page, ctx } = await fresh({ pre: () => { try { if (!localStorage.getItem('seven:seeded')) { localStorage.setItem('seven:seeded', '1'); const d = Date.now(); localStorage.setItem('seven:history', JSON.stringify([{ id: 'a', at: d - 86400000, startedAt: d - 86400000 - 600000, durationSec: 600, title: 'Тест', programId: 'b1_full_a', setsDone: 8, exercisesDone: 4, exerciseIds: ['squat'], completed: true }, { id: 'b', at: d - 1000, startedAt: d - 601000, durationSec: 900, title: 'Тест 2', programId: 'i5_intervals', setsDone: 9, exercisesDone: 5, exerciseIds: ['plank'], completed: true }])); } } catch { /* */ } } });
  const kpis = await text(page, '.kpis');
  ok(kpis.replace(/\s+/g, ' ').startsWith('2 Серия'), 'серия 2 дня: ' + kpis);
  ok(await page.locator('.dot.done').count() >= 1, 'отмечены дни недели');
  await tab(page, 'progress'); await page.locator('.item', { hasText: 'Тест 2' }).click();
  ok((await text(page, '.sheet')).includes('Тест 2'), 'карточка записи истории');
  await page.locator('.sheet .btn.danger').click(); await page.locator('.sheet .btn.danger').last().click();
  eq(await page.evaluate(() => JSON.parse(localStorage.getItem('seven:history')).length), 1, 'запись удалена');
  await ctx.close();
});

await test('Данные сохраняются: перезагрузка и повторное открытие (история, избранное)', async () => {
  const { page, ctx, errors } = await fresh();
  // тренировка из одного упражнения → запись в историю
  await tab(page, 'catalog'); await page.fill('#cat-q', 'приседания'); await run(page, 300);
  await page.locator('.item', { hasText: 'Приседания' }).first().click();
  await page.locator('.fav-btn').click();
  await btn(page, 'Попробовать упражнение').click(); await page.waitForSelector('.player'); await run(page, 5100);
  for (let i = 0; i < 3; i++) { await btn(page, 'Готово').click(); if (i < 2) await run(page, 45_100); }
  await page.waitForSelector('.p-finish');
  await btn(page, /Готово|Закрыть|Завершить/).first().click().catch(() => {});
  const snap = () => page.evaluate(() => ({ h: JSON.parse(localStorage.getItem('seven:history') || '[]').length, f: localStorage.getItem('seven:favorites'), keys: Object.keys(localStorage).filter((k) => k.startsWith('seven:')).sort() }));
  const before = await snap();
  ok(before.h === 1 && before.f && before.f.includes('squat'), 'после тренировки: история и избранное записаны ' + JSON.stringify(before));
  await page.reload(); await page.waitForSelector('#tabbar button');
  const after = await snap();
  eq(after.h, 1, 'история после перезагрузки'); eq(after.f, before.f, 'избранное после перезагрузки');
  await tab(page, 'progress'); ok((await text(page, '#screen')).includes('Приседания'), 'история видна на экране «Прогресс»');
  // повторное открытие: новая вкладка того же профиля браузера
  const page2 = await ctx.newPage(); await page2.goto(srv.url); await page2.waitForSelector('#tabbar button');
  await page2.locator('#tabbar [data-tab="progress"]').click();
  ok((await page2.locator('#screen').innerText()).includes('Приседания'), 'история видна после повторного открытия');
  await page2.locator('#tabbar [data-tab="catalog"]').click(); await page2.getByRole('button', { name: 'Избранное' }).click();
  eq(await page2.locator('.item').count(), 1, 'избранное после повторного открытия');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Новые упражнения: «Тяга рюкзака» с бейджем «Рюкзак», варианты «Проще» ведут на облегчённые упражнения', async () => {
  const { page, ctx, errors } = await fresh();
  await tab(page, 'catalog'); await page.fill('#cat-q', 'тяга'); await run(page, 300);
  await page.locator('.item', { hasText: 'Тяга рюкзака' }).first().click(); await page.waitForSelector('.steps');
  ok((await text(page, '#screen')).includes('Рюкзак'), 'бейдж инвентаря «Рюкзак»');
  await page.goBack(); await page.waitForSelector('.catalog-head');
  await page.fill('#cat-q', 'бёрпи'); await run(page, 300);
  await page.locator('.item', { hasText: 'Бёрпи', hasNotText: 'без прыжка' }).first().click(); await page.waitForSelector('.steps');
  const easier = page.getByText('Бёрпи без прыжка и отжимания').first();
  ok(await easier.count() > 0, 'у «Бёрпи» есть вариант «без прыжка и отжимания»');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Программа «Верх тела»: запускается, первым идёт жим, тяга рюкзака входит в упражнения', async () => {
  const { page, ctx, errors } = await fresh();
  await tab(page, 'workouts'); await page.locator('.pcard-wide', { hasText: 'Верх тела (средний)' }).click(); await page.waitForSelector('.facts');
  ok((await text(page, '#screen')).includes('Тяга рюкзака в наклоне'), 'тяга в списке упражнений');
  ok(!(await text(page, '#screen')).includes('Обратные отжимания'), 'обратных отжиманий нет');
  ok((await text(page, '#screen')).includes('Ориентир на 4 недели'), 'прогрессия на 4 недели в примечании');
  await btn(page, /Начать тренировку/).click(); await page.waitForSelector('.player');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Автономный файл открывается напрямую (file://) без сервера', async () => {
  const f = path.join(root, 'standalone/index.html');
  const { page, ctx, errors } = await open(browser, 'file://' + f);
  await page.goto('file://' + f); await page.waitForSelector('#tabbar button', { timeout: 8000 });
  await tab(page, 'catalog'); eq(await page.locator('.item').count(), 61, 'каталог из встроенных данных');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await browser.close(); srv.close();
console.log(results.join('\n'));
console.log(`\nИтого: ${pass} пройдено, ${fail} провалено`);
process.exit(fail ? 1 : 0);
