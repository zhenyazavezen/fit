// Название и лицензия: продукт называется ZAVEZEN_FIT, в разделе «О приложении» только утверждённый текст, лицензия собственная.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '../tools/bundle.mjs';

const root = path.join(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ru = JSON.parse(read('locales/ru.json'));

test('Название приложения — ZAVEZEN_FIT в заголовке страницы, конфигурации и автономной сборке', () => {
  assert.match(read('index.html'), /<title>ZAVEZEN_FIT<\/title>/);
  assert.match(read('js/config.js'), /appName: 'ZAVEZEN_FIT'/);
  assert.match(bundle().out, /<title>ZAVEZEN_FIT<\/title>/);
});

test('Раздел «О приложении» содержит только утверждённый текст', () => {
  assert.equal(ru['about.how'], 'ZAVEZEN_FIT помогает заниматься дома самостоятельно: понятная инструкция, время, повторения и структура тренировки. Без видео и голоса тренера.');
  assert.deepEqual(Object.keys(ru).filter((k) => k.startsWith('about.')).sort(), ['about.how', 'about.title']);
  const about = read('js/screens/about.js');
  assert.doesNotMatch(about, /github\.com|CONFIG|BUILD|noteBox/);
});

test('Лицензия собственная («все права защищены»), чужих лицензионных уведомлений и NOTICE.md нет', () => {
  const lic = read('LICENSE');
  assert.match(lic, /All rights reserved/);
  assert.doesNotMatch(lic, /MIT License/i);
  assert.ok(!fs.existsSync(path.join(root, 'NOTICE.md')));
  for (const html of [read('index.html'), bundle().out]) assert.doesNotMatch(html, /MIT License|notice/i);
});
