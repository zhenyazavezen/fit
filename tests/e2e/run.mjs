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
async function openLevel(page, name) { await tab(page, 'workouts'); await page.locator('.plan-plate', { hasText: 'Мой план' }).click(); await page.waitForSelector('.level-plate'); await page.locator('.level-plate:not(.plan-plate)', { hasText: name }).click(); await page.getByRole('button', { name: /Все программы/ }).click(); }
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${n}.png` }); };
const text = (p, sel) => p.locator(sel).innerText();
const run = (p, ms) => p.clock.runFor(ms);

for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
  await test(`Запуск ${w}×${h}: без ошибок консоли и горизонтальной прокрутки, 5 вкладок`, async () => {
    const { page, errors, failed, ctx } = await fresh({ w, h });
    eq(await page.locator('#tabbar [data-tab]').count(), 6, 'вкладок');
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
  eq(total, 42, 'всего упражнений');
  await page.fill('#cat-q', 'бёрпи'); await run(page, 300);
  eq(await page.locator('.item').count(), 2, 'поиск «бёрпи»: бёрпи и облегчённый вариант');
  await page.fill('#cat-q', 'zzz'); await run(page, 300);
  ok((await text(page, '.empty')).includes('Ничего не найдено'), 'пустое состояние');
  await btn(page, 'Сбросить всё').click();
  eq(await page.locator('.item').count(), 42, 'после сброса');
  await page.getByRole('button', { name: 'Пресс', exact: true }).click();
  const abs = await page.locator('.item').count(); ok(abs > 0 && abs < 42, 'категория «Пресс»');
  await page.getByRole('button', { name: 'Ягодицы', exact: true }).click();
  ok((await page.locator('.item').count()) > abs, 'две категории расширяют выбор');
  await page.getByRole('button', { name: 'Все', exact: true }).click();
  await btn(page, /Фильтры/).click();
  await page.locator('.sheet').getByRole('button', { name: 'Средний', exact: true }).click();
  const showTxt = await text(page, '.sheet .foot .btn:last-child'); ok(/Показать: \d+/.test(showTxt), 'счётчик в шторке: ' + showTxt);
  await page.locator('.sheet .foot .btn:last-child').click();
  const chair = await page.locator('.item').count(); ok(chair > 0 && chair < 42, 'фильтр «Средний»: ' + chair);
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
  ok((await text(page, '.p-finish')).includes('Отлично!') && (await text(page, '.p-finish')).includes('подходов'), 'итог: подходы');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Программа «Экспресс-круг (средний)»: 7:55, стороны боковой планки, прохождение до конца и запись в историю', async () => {
  const { page, errors, ctx } = await fresh();
  await openLevel(page, 'Средний'); await page.locator('.pcard-wide', { hasText: 'Экспресс-круг (средний)' }).click();
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
  const fin = await text(page, '.p-finish');
  ok(fin.includes('Отлично!') && fin.includes('минут') && fin.includes('подходов') && fin.includes('дней подряд'), 'экран итога: ' + fin);
  eq(await page.locator('.p-finish .list .item').count(), 12, 'в «Что изменилось» все 12 упражнений'); ok(fin.includes('Новое'), 'первый раз — «Новое»');
  ok(await btn(page, 'Поделиться результатом').count() === 1, 'есть «Поделиться результатом»');
  const hist = await page.evaluate(() => JSON.parse(localStorage.getItem('seven:history')));
  eq(hist.length, 1, 'запись в истории'); eq(hist[0].durationSec, 475, 'время тренировки 475 с (подготовка не входит)');
  eq(hist[0].completed, true, 'completed');
  eq(await page.evaluate(() => localStorage.getItem('seven:active')), null, 'активная сессия очищена');
  await shot(page, 'player-finish');
  await btn(page, 'Готово').click(); await tab(page, 'progress');
  await page.waitForSelector('.chart');
  const pr = await text(page, '#screen');
  for (const w of ['Рекорды', 'Лучшая неделя', 'Всего тренировок', 'Активное время', 'За месяц', 'В среднем', 'Серия дней', 'Текущая серия', 'Личный рекорд']) ok(pr.includes(w), 'в «Прогрессе» есть «' + w + '»');
  ok((await text(page, '.tiles')).includes('1'), 'прогресс показывает 1 тренировку');
  await shot(page, 'progress-filled');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Пауза не сдвигает таймер; возврат из фона засчитывает фактическое время', async () => {
  const { page, ctx } = await fresh();
  await openLevel(page, 'Средний'); await page.locator('.pcard-wide', { hasText: 'Экспресс-круг' }).click(); await btn(page, 'Начать тренировку').click();
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
  await openLevel(page, 'Начальный'); await page.locator('.pcard-wide', { hasText: 'Всё тело A (начальный)' }).click(); await btn(page, 'Начать тренировку').click();
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
  await tab(page, 'home'); await page.waitForSelector('.todo');
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
  await tab(page, 'workouts'); 
  await btn(page, /Создать свою тренировку/).click();
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
  await tab(page, 'home'); await page.waitForSelector('.todo');
  await tab(page, 'workouts'); 
  await page.locator('.mine-main', { hasText: 'Моя проверка' }).click();
  await btn(page, 'Удалить').click(); await page.locator('.sheet .btn.danger').click();
  await page.waitForSelector('.pad');
  eq(await page.evaluate(() => JSON.parse(localStorage.getItem('seven:programs') || '[]').length), 0, 'программа удалена');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Конструктор: своё упражнение создаётся с нуля, попадает в программу и запускается', async () => {
  const { page, errors, ctx } = await fresh();
  await tab(page, 'workouts'); 
  await btn(page, /Создать свою тренировку/).click(); await page.fill('#prog-name', 'С нуля');
  await btn(page, 'Создать своё упражнение').click();
  await page.locator('.sheet input[type=text]').last().fill('Отжимания на кулаках');
  await btn(page, 'Создать и добавить').tap();
  await page.waitForSelector('.item .lead');
  ok((await text(page, '.list')).includes('Отжимания на кулаках'), 'своё упражнение в программе');
  await page.locator('.btn', { hasText: 'Сохранить программу' }).tap(); await page.waitForSelector('.facts');
  await btn(page, 'Начать тренировку').tap(); await page.waitForSelector('.player');
  await run(page, 5100); ok((await text(page, '.player')).includes('Отжимания на кулаках'), 'тренировка запустилась со своим упражнением: ' + (await text(page, '.player')).slice(0, 80));
  await page.reload(); await page.waitForSelector('#tabbar button');
  eq(await page.evaluate(() => JSON.parse(localStorage.getItem('seven:myex')).length), 1, 'упражнение сохранено');
  ok(!errors.length, 'ошибки: ' + errors.join(' | ')); await ctx.close();
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
  ok(!(await text(page, '#screen')).match(/Сборка|Dev/i), 'внизу профиля нет надписи о сборке');
  ok(!(await text(page, '#screen')).includes('Google'), 'Google в профиле не упоминается');
  await page.getByRole('button', { name: /Аккаунт и данные/ }).click();
  await shot(page, 'data');
  await page.getByRole('button', { name: /Удалить данные на устройстве/ }).click();
  ok((await text(page, '.sheet')).includes('нельзя отменить'), 'подтверждение с предупреждением');
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
  await page.getByRole('button', { name: /Написать @zhenya_zavezen/ }).click();
  ok((await page.evaluate(() => window.__tg)).some((x) => x.includes('t.me/zhenya_zavezen')), 'поддержка открывает t.me/zhenya_zavezen: ' + await page.evaluate(() => window.__tg.join()));
  // удаление фото
  await btn(page, 'Изменить фото профиля').click();
  await page.waitForSelector('.sheet .avatar-big img');
  ok(!/null/.test(await text(page, '.sheet')), 'в карточке фото нет «null»');
  await btn(page, 'Убрать фото').click();
  eq(await page.evaluate(() => JSON.parse(localStorage.getItem('seven:avatar')).img), '', 'фото убрано');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Главная: без блока «Программы» и ссылок; «Дела на сегодня» со шкалой прогресса', async () => {
  const { page, errors, ctx } = await fresh();
  eq(await page.locator('.hscroll, .pcard, .hero').count(), 0, 'блок «Программы» и рекомендация убраны');
  ok((await page.locator('.weekcard, .todo').evaluateAll((n) => n.map((e) => e.className.split(' ').includes('todo')))).join() === 'false,true', 'календарь выше дел');
  eq(await page.locator('.list .item').count(), 0, 'ссылки под программами убраны');
  ok(!(await text(page, '#screen')).includes('Домашние тренировки'), 'заголовок «Домашние тренировки» убран');
  eq(await page.locator('.dot i').allTextContents().then((a) => a.every((x) => /^\d{1,2}$/.test(x)) && a.length === 7), true, 'в кружках числа месяца');
  eq(await page.locator('#tabbar [data-tab]').count(), 6, 'все вкладки на месте');
  await page.locator('.todo input').fill('Выпить воду'); await page.locator('.todo .cl-add').tap();
  await page.locator('.todo input').fill('Растяжка'); await page.locator('.cl-add').first().click();
  eq(await page.locator('.cl-row').count(), 2, 'два дела');
  await page.locator('.cl-main').first().tap();
  eq(await page.locator('.bar i').evaluate((e) => e.style.width), '50%', 'шкала 50%');
  ok((await text(page, '.todo')).includes('1 из 2'), 'счётчик «1 из 2»');
  await page.reload(); await page.waitForSelector('.todo');
  eq(await page.locator('.cl-row').count(), 2, 'дела сохраняются');
  eq(await page.locator('.cl-row.done').count(), 1, 'отметка сохраняется');
  await page.locator('.cl-main').nth(1).tap(); ok((await text(page, '.todo')).includes('Всё выполнено'), 'все выполнены');
  await page.locator('.cl-row .icon-btn').nth(1).tap(); eq(await page.locator('.cl-row').count(), 1, 'дело удалено');
  ok(!errors.length, 'ошибки: ' + errors.join(' | ')); await ctx.close();
});

await test('Нижняя панель: зажать и перетащить вкладку, своя вкладка с делами и заметкой', async () => {
  const { page, errors, ctx } = await fresh();
  const names = () => page.locator('#tabbar button span').allTextContents();
  const tabBox = async (n) => page.locator(`#tabbar [data-tab="${n}"]`).boundingBox();
  const bx = await tabBox('home'), by = await tabBox('progress');
  await page.mouse.move(bx.x + bx.width / 2, bx.y + 20); await page.mouse.down();
  await page.clock.runFor(500);
  await page.mouse.move(by.x + by.width / 2 + 25, by.y + 20, { steps: 12 });
  await page.mouse.up(); await page.clock.runFor(600);
  eq((await names()).slice(0, 5).join(), 'Тренировки,Упражнения,Прогресс,Главная,Рейтинг', 'вкладка «Главная» перетащена');
  ok(await page.locator('.todo').count() === 1, 'клик после перетаскивания не открыл вкладку');
  await page.reload(); await page.waitForSelector('#tabbar button');
  eq((await names()).slice(0, 5).join(), 'Тренировки,Упражнения,Прогресс,Главная,Рейтинг', 'порядок сохранился');
  // быстрое нажатие по-прежнему открывает вкладку
  await tab(page, 'workouts'); await page.waitForSelector('.page-title');
  // своя вкладка: Профиль → Нижняя панель
  await page.locator('#tabbar .tab-add').scrollIntoViewIfNeeded(); await page.locator('#tabbar .tab-add').click();
  await page.locator('.sheet input[type=text]').first().fill('Питание'); await btn(page, 'Готово').tap();
  await page.waitForSelector('.note-area');
  ok((await names()).includes('Питание'), 'своя вкладка появилась: ' + (await names()).join());
  await page.locator('.cl-addrow input').fill('Белок 120 г'); await page.locator('.cl-add').first().click();
  await page.locator('.note-area').fill('План на неделю'); await page.locator('.note-area').blur();
  eq(await page.locator('#tabbar [aria-current="true"]').count(), 1, 'активна одна вкладка');
  await page.reload(); await page.waitForSelector('#tabbar button');
  await page.locator('#tabbar [data-tab^="c_"]').tap(); await page.waitForSelector('.note-area');
  eq(await page.locator('.note-area').inputValue(), 'План на неделю', 'заметка сохранилась');
  eq(await page.locator('.cl-row').count(), 1, 'дело во вкладке сохранилось');
  ok(!errors.length, 'ошибки: ' + errors.join(' | ')); await ctx.close();
});

await test('Личные данные: у разных аккаунтов Telegram на одном телефоне данные не смешиваются', async () => {
  const mock = () => {
    const id = Number(/u=(\d+)/.exec(location.hash)?.[1] || 0), n = () => {};
    window.Telegram = { WebApp: { platform: 'android', initDataUnsafe: { user: { id, first_name: 'U' + id, language_code: 'ru' } }, ready: n, expand: n, setHeaderColor: n, setBackgroundColor: n, setBottomBarColor: n, disableVerticalSwipes: n, onEvent: n,
      viewportStableHeight: 700, viewportHeight: 700, safeAreaInset: { top: 0, bottom: 0 }, contentSafeAreaInset: { top: 0, bottom: 0 }, enableClosingConfirmation: n, disableClosingConfirmation: n, openTelegramLink: n,
      HapticFeedback: { impactOccurred: n, notificationOccurred: n, selectionChanged: n }, BackButton: { show: n, hide: n, onClick: n, offClick: n } } };
  };
  const { page, errors, ctx } = await fresh({ tgMock: mock });
  const openAs = async (id) => { await page.goto('about:blank'); await page.goto(srv.url + '#tgWebAppData=mock&u=' + id); await page.waitForSelector('.todo'); };
  await openAs(1); await page.locator('.todo input').fill('Секрет первого'); await page.locator('.cl-add').first().click();
  eq(await page.locator('.cl-row').count(), 1, 'первый добавил дело');
  await openAs(2);
  eq(await page.locator('.cl-row').count(), 0, 'второй аккаунт не видит чужие дела');
  await page.locator('.todo input').fill('Дело второго'); await page.locator('.cl-add').first().click();
  await openAs(1);
  eq((await text(page, '.cl')).includes('Секрет первого') && !(await text(page, '.cl')).includes('Дело второго'), true, 'у первого только его дело');
  await openAs(2);
  eq((await text(page, '.cl')).includes('Дело второго') && !(await text(page, '.cl')).includes('Секрет'), true, 'у второго только его дело');
  ok(!errors.length, 'ошибки: ' + errors.join(' | ')); await ctx.close();
});

await test('Главная: плашки меняются местами перетаскиванием; календарь по нажатию; панель с «+»', async () => {
  const { page, errors, ctx } = await fresh();
  const keys = () => page.locator('.htile').evaluateAll((n) => n.map((e) => e.dataset.key).join());
  eq(await keys(), 'week,todo', 'порядок по умолчанию: календарь, дела');
  const gaps = await page.locator('.htile').evaluateAll((n) => { const r = n.map((e) => e.getBoundingClientRect()); return Math.round(r[1].top - r[0].bottom); });
  ok(gaps >= 12 && gaps <= 20, 'отступ между плашками: ' + gaps);
  const a = await page.locator('.htile[data-key="week"] .dots').boundingBox(), b = await page.locator('.htile[data-key="todo"] .bar').boundingBox();
  await page.mouse.move(a.x + 20, a.y + 20); await page.mouse.down(); await page.clock.runFor(500);
  await page.mouse.move(b.x + 20, b.y + 60, { steps: 14 }); await page.mouse.up(); await page.clock.runFor(600);
  eq(await keys(), 'todo,week', 'плашки поменялись');
  ok(await page.locator('.cal-card').count() === 0, 'отпускание не открыло календарь');
  await page.reload(); await page.waitForSelector('.htile');
  eq(await keys(), 'todo,week', 'порядок сохранился');
  await page.locator('.htile[data-key="week"]').click(); await page.waitForSelector('.cal-card');
  eq(await page.locator('.cal-cell:not(.empty)').count(), 30, 'ноябрь: 30 дней');
  await page.getByRole('button', { name: 'Назад', exact: true }).first().click().catch(() => {});
  ok(!errors.length, 'ошибки: ' + errors.join(' | ')); await ctx.close();
});

await test('Календарь: месяцы, дни с тренировками, итоги и список', async () => {
  const { page, errors, ctx } = await fresh({ pre: () => {
    const at = (m, d) => new Date(2026, m - 1, d, 10).getTime();
    const mk = (id, ts, title) => ({ id, at: ts, startedAt: ts - 600000, durationSec: 600, title, setsDone: 9, exercisesDone: 5, exerciseIds: ['squat'], completed: true });
    localStorage.setItem('seven:history', JSON.stringify([mk('a', at(11, 10), 'Всё тело A'), mk('b', at(11, 12), 'Кор'), mk('c', at(10, 20), 'Растяжка')]));
  } });
  await page.locator('.htile[data-key="week"]').click(); await page.waitForSelector('.cal-card');
  eq(await page.locator('.cal-cell.done').count(), 2, 'в ноябре два дня с тренировками');
  ok((await text(page, '.cal')).includes('Всё тело A'), 'в списке месяца есть тренировка');
  await page.locator('.cal-cell.done').first().click();
  ok(!(await text(page, '.cal')).includes('Кор'), 'выбран день: чужих тренировок нет');
  await page.getByRole('button', { name: 'Предыдущий период' }).click().catch(async () => { await page.locator('.period-nav .icon-btn').first().click(); });
  eq(await page.locator('.cal-cell.done').count(), 1, 'в октябре один день');
  ok((await text(page, '.cal')).includes('Растяжка'), 'список октября');
  ok(!errors.length, 'ошибки: ' + errors.join(' | ')); await ctx.close();
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
  await tab(page, 'workouts'); await page.locator('.pcard-wide').first().click(); await page.waitForSelector('.facts');
  ok((await page.evaluate(() => window.__tg)).includes('back:show'), 'BackButton показан на вложенном экране');
  await btn(page, 'Начать тренировку').click(); await page.waitForSelector('.player');
  ok((await page.evaluate(() => window.__tg)).includes('confirm:on'), 'подтверждение закрытия включено');
  await run(page, 5100);          // подготовка → первый рабочий шаг (вибрация)
  await btn(page, 'Выйти из тренировки').click(); await btn(page, 'Отменить без сохранения').click();
  await tab(page, 'home'); await page.waitForSelector('.todo');
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

await test('Каталог без оборудования: нет рюкзака/стула/стены; у «Бёрпи» есть вариант без прыжка', async () => {
  const { page, ctx, errors } = await fresh();
  await tab(page, 'catalog'); await page.fill('#cat-q', 'рюкзак'); await run(page, 300);
  eq(await page.locator('.item', { hasText: 'рюкзак' }).count(), 0, 'упражнений с рюкзаком нет');
  await page.fill('#cat-q', 'бёрпи'); await run(page, 300);
  await page.locator('.item', { hasText: 'Бёрпи', hasNotText: 'без прыжка' }).first().click(); await page.waitForSelector('.steps');
  ok(await page.getByText('Бёрпи без прыжка и отжимания').first().count() > 0, 'у «Бёрпи» есть вариант «без прыжка и отжимания»');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});
await test('Тренировки: без плашек уровней; «Мой план» — уровни и карта тела; программа запускается', async () => {
  const { page, ctx, errors } = await fresh();
  await tab(page, 'workouts'); await page.waitForSelector('.plan-plate');
  const txt = await text(page, '#screen');
  for (const w of ['Мой план', 'Растяжка и восстановление', 'Тренировки на сегодня']) ok(txt.includes(w), 'есть «' + w + '»');
  ok(!/Программ: \d/.test(txt) && (await page.locator('.plan-plate').count()) === 1 && !(await page.locator('.level-plate:not(.plan-plate)').count()), 'уровней и карты тела на главной «Тренировок» нет');
  ok(!/рюкзак|гантел|резинк|Premium/i.test(txt), 'нет инвентаря и Premium');
  await page.locator('.plan-plate', { hasText: 'Мой план' }).click(); await page.waitForSelector('.level-plate');
  eq(await page.locator('.level-plate:not(.plan-plate)').count(), 3, 'три плашки уровней в «Моём плане»');
  ok((await text(page, '#screen')).includes('Карта тела'), 'карта тела в «Моём плане»');
  await openLevel(page, 'Средний'); await page.waitForSelector('.pcard-wide');
  await page.locator('.pcard-wide', { hasText: 'Верх тела (средний)' }).click(); await page.waitForSelector('.facts');
  ok(!/рюкзак/i.test(await text(page, '#screen')), 'в программе нет рюкзака');
  await btn(page, /Начать тренировку/).click(); await page.waitForSelector('.player');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Мой план: выбор уровня меняет метку «Ваш уровень»', async () => {
  const { page, ctx, errors } = await fresh();
  await tab(page, 'profile');
  ok(!(await text(page, '#screen')).includes('Мой план'), 'в профиле «Мой план» нет');
  ok((await text(page, '#screen')).includes('Поддержка') && (await text(page, '#screen')).includes('@zhenya_zavezen'), 'поддержка с ником');
  await tab(page, 'workouts'); await page.locator('.plan-plate', { hasText: 'Мой план' }).click(); await page.waitForSelector('.level-plate');
  await page.locator('.level-plate:not(.plan-plate)', { hasText: 'Продвинутый' }).click();
  eq(await page.locator('.level-plate.yours').innerText().then((x) => x.includes('Продвинутый')), true, 'метка у выбранного уровня');
  eq(errors.length, 0, errors.join(' | ')); await ctx.close();
});

await test('Мой день: расписание по дням недели, история, добавление вручную', async () => {
  const { page, errors, ctx } = await fresh({ pre: () => {
    if (localStorage.getItem('seven:todos')) return;
    const y = new Date(Date.now() - 86400000), k = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    localStorage.setItem('seven:todos', JSON.stringify({ [k]: [{ id: 'a', t: 'Выпить воду', d: true }] }));
  } });
  await page.getByRole('button', { name: /Расписание и история/ }).click(); await page.waitForSelector('.days-row');
  ok((await text(page, '#screen')).includes('Выпить воду'), 'вчерашнее дело в истории');
  await page.locator('.days-row .chip').nth(0).click();                                     // Пн
  await page.locator('.cl-addrow input').fill('Зарядка'); await page.locator('.cl-add').first().click();
  await page.locator('.days-row .chip').nth(1).click();                                     // Вт
  eq(await page.locator('.item:has(.s)').count(), 0, 'во вторник «Зарядки» нет');
  await page.locator('.days-row .chip').nth(0).click();
  eq(await page.locator('.item:has(.s)', { hasText: 'Зарядка' }).count(), 1, 'в понедельник есть');
  await page.getByRole('button', { name: 'Добавить на сегодня' }).first().click();
  await page.goBack(); await page.waitForSelector('.todo');
  ok((await page.locator('.cl-row .cl-text').allTextContents()).includes('Выпить воду'), 'из истории добавлено на сегодня');
  const sched = await page.evaluate(() => JSON.parse(localStorage.getItem('seven:todos')).daily);
  eq(JSON.stringify(sched.map((x) => [x.t, x.days])), JSON.stringify([['Зарядка', [1]]]), 'расписание сохранено по дням');
  eq(errors.length, 0, errors.join(' | ')); await ctx.close();
});

await test('Тренировки на сегодня: добавить, отметить, повторять; расписание по дням', async () => {
  const { page, errors, ctx } = await fresh();
  await tab(page, 'workouts');
  ok(/Тренировки на сегодня/.test(await text(page, '.todo')), 'блок «Тренировки на сегодня» есть');
  const inp = page.locator('.todo input');
  await inp.fill('Отжимания 3×15'); await page.locator('.todo .cl-add').click();
  eq(await inp.inputValue(), '', 'поле очищается после «+»');
  await inp.fill('Бицепс'); await inp.press('Enter'); await inp.fill('  Пресс  '); await page.locator('.todo .cl-add').click();
  eq((await page.locator('.todo .cl-text').allTextContents()).join('|'), 'Отжимания 3×15|Бицепс|Пресс', 'записи в порядке ввода');
  await page.locator('.todo .cl-main').first().click();
  await page.locator('.todo .rep').nth(1).click();
  await tab(page, 'home'); await tab(page, 'workouts');
  eq((await page.locator('.todo .cl-text').allTextContents()).join('|'), 'Отжимания 3×15|Бицепс|Пресс', 'после перехода всё на месте');
  eq(await page.locator('.todo .cl-row.done').count(), 1, 'отметка сохранена');
  await page.getByRole('button', { name: /Расписание и история/ }).click(); await page.waitForSelector('.days-row');
  ok((await text(page, '#screen')).includes('Бицепс'), 'постоянная тренировка в расписании дня');
  ok(!errors.length, 'ошибки: ' + errors.join(' | ')); await ctx.close();
});

await test('Конструктор: «Создать своё упражнение» и «Добавить упражнение»; отдых от 1 с, удержание меняет значение', async () => {
  const { page, errors, ctx } = await fresh();
  await tab(page, 'workouts'); await btn(page, /Создать свою тренировку/).click(); await page.waitForSelector('.stepper');
  const names = await page.locator('.pad > .btn').allTextContents();
  eq(names.slice(0, 2).join('|'), 'Создать своё упражнение|Добавить упражнение', 'две плашки по порядку');
  const val = () => page.locator('.stepper .val').first().innerText();
  eq(await val(), '30', 'отдых по умолчанию 30');
  const minus = page.locator('.stepper .icon-btn').first();
  const box = await minus.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.clock.runFor(400 + 85 * 40); await page.mouse.up();
  eq(await val(), '1', 'при удержании доходит до 1 секунды и останавливается');
  ok(await minus.isDisabled(), 'ниже 1 не опускается');
  await page.locator('.stepper .icon-btn').nth(1).click();
  eq(await val(), '2', 'один шаг = одна секунда');
  ok(!errors.length, 'ошибки: ' + errors.join(' | ')); await ctx.close();
});

await test('Избранное поднимается наверх списка упражнений; расписание: окно выбора не схлопывается, свои тренировки доступны', async () => {
  const { page, errors, ctx } = await fresh({ pre: () => {
    if (localStorage.getItem('seven:programs')) return;
    localStorage.setItem('seven:programs', JSON.stringify([{ id: 'u_mine', name: 'Моя зарядка', restBetween: 20, items: [{ ex: 'squat', sets: 2, reps: 10 }], custom: true }]));
  } });
  await tab(page, 'catalog'); await page.waitForSelector('.list .item');
  const names = () => page.locator('.list .item .t').allTextContents();
  const before = await names(); const target = before[5];
  await page.locator('.list .item', { hasText: target }).first().click(); await page.waitForSelector('.fav-btn');
  await page.locator('.fav-btn').click();
  await page.goBack(); await page.waitForSelector('.list .item');
  eq((await names())[0], target, 'добавленное в избранное стало первым');
  ok(!errors.length, 'ошибки: ' + errors.join(' | ')); await ctx.close();
});

await test('Рейтинг: вкладка в нижней панели; без входа — просьба войти, без «null»', async () => {
  const { page, errors, ctx } = await fresh();
  await tab(page, 'compete');
  await page.waitForSelector('.empty');
  ok((await text(page, '#screen')).includes('Нужен вход'), 'просит войти');
  ok(!/null|undefined/.test(await text(page, '#screen')), 'нет «null»');
  await tab(page, 'profile');
  const prof = await text(page, '#screen');
  ok(!/Избранные|Карта тела|Соревнования/.test(prof), 'в профиле нет избранного, карты тела и соревнований');
  ok(prof.includes('Есть вопрос, отзыв или предложение?') && prof.includes('Написать @zhenya_zavezen'), 'блок поддержки');
  await tab(page, 'workouts'); await page.locator('.plan-plate', { hasText: 'Мой план' }).click(); await page.waitForSelector('.level-plate');
  await page.getByRole('button', { name: /Карта тела/ }).click();
  ok((await text(page, '#screen')).length > 20, 'карта тела открывается из «Моего плана»');
  ok(!errors.length, 'ошибки: ' + errors.join(' | ')); await ctx.close();
});

await test('Дела: постоянные (ежедневные) возвращаются в новый день без отметки; удаление убирает навсегда', async () => {
  const { page, errors, ctx } = await fresh({ pre: () => {
    if (localStorage.getItem('seven:todos')) return;
    const y = new Date(Date.now() - 86400000), k = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    localStorage.setItem('seven:todos', JSON.stringify({ daily: [{ id: 'r_1', t: 'Зарядка', d: false }], [k]: [{ id: 'a', t: 'Зарядка', d: true, src: 'r_1' }, { id: 'b', t: 'Разовое', d: false }] }));
  } });
  const rows = await page.locator('.cl-row .cl-text').allTextContents();
  eq(rows.join('|'), 'Зарядка', 'сегодня только постоянное дело, разовое со вчера не переносится');
  eq(await page.locator('.cl-row.done').count(), 0, 'отметка «сделано» не переносится');
  await page.locator('.cl-main').first().tap();
  eq(await page.locator('.cl-row.done').count(), 1, 'можно отметить');
  await page.locator('.todo input').fill('Читать'); await page.locator('.cl-add').first().click();
  await page.locator('.cl-row').nth(1).locator('.rep').tap();
  const daily = await page.evaluate(() => JSON.parse(localStorage.getItem('seven:todos')).daily.map((x) => x.t));
  eq(daily.join('|'), 'Зарядка|Читать', 'новое дело стало постоянным');
  await page.locator('.cl-row').first().locator('.icon-btn').last().tap();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('seven:todos')).daily.map((x) => x.t));
  eq(after.join('|'), 'Читать', 'удалённое дело больше не повторяется');
  ok(!errors.length, 'ошибки: ' + errors.join(' | ')); await ctx.close();
});

await test('Автономный файл открывается напрямую (file://) без сервера', async () => {
  const f = path.join(root, 'standalone/index.html');
  const { page, ctx, errors } = await open(browser, 'file://' + f);
  await page.goto('file://' + f); await page.waitForSelector('#tabbar button', { timeout: 8000 });
  await tab(page, 'catalog'); eq(await page.locator('.item').count(), 42, 'каталог из встроенных данных');
  eq(errors.length, 0, errors.join(' | '));
  await ctx.close();
});

await test('Главная: карточка «Сегодня» предлагает тренировку и запускает её; «Создать свою тренировку» — карточки своих', async () => {
  const { page, errors, ctx } = await fresh();
  ok(/сегодня/i.test(await text(page, '.card.today')), 'карточка «Сегодня»');
  await page.locator('.card.today .btn').click(); await page.waitForSelector('.player');
  await ctx.close();
  const f2 = await fresh(), page2 = f2.page;
  await tab(page2, 'workouts');
  await btn(page2, /Создать свою тренировку/).click(); await page2.waitForSelector('#prog-name');
  await page2.fill('#prog-name', 'Моя тренировка');
  await btn(page2, /^Добавить упражнение/).click(); await page2.waitForSelector('#pick-q');
  await page2.locator('.sheet .item').nth(0).click(); await page2.locator('.sheet .item').nth(1).click();
  await page2.locator('.sheet .btn', { hasText: 'Готово' }).click();
  await btn(page2, 'Сохранить').click(); await page2.waitForSelector('.facts');
  await tab(page2, 'workouts'); await page2.waitForSelector('.mine-card');
  const card = await text(page2, '.mine-card');
  ok(card.includes('Моя тренировка') && card.includes('2 упр') || card.includes('2 упражнения'), 'карточка своей тренировки: ' + card);
  eq(await page2.locator('.mine-card .icon-btn').count(), 2, 'изменить и удалить');
  await page2.locator('.mine-card .icon-btn').nth(1).click(); await btn(page2, 'Удалить').last().click();
  await page2.waitForTimeout(300); eq(await page2.locator('.mine-card').count(), 0, 'удалена');
  ok(!f2.errors.length, 'ошибки: ' + f2.errors.join(' | ')); await f2.ctx.close();
});

await browser.close(); srv.close();
console.log(results.join('\n'));
console.log(`\nИтого: ${pass} пройдено, ${fail} провалено`);
process.exit(fail ? 1 : 0);

