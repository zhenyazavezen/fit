// Автономная версия: один файл, содержимое совпадает с исходниками, ничего внешнего.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '../tools/bundle.mjs';

const root = path.join(import.meta.dirname, '..');
const { out, modules } = bundle();
const embedded = JSON.parse(out.match(/<script type="application\/json" id="app-bundle">([\s\S]*?)<\/script>/)[1]);
const script = out.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];

test('Встроенные JSON побайтно совпадают с исходниками', () => {
  for (const [f, text] of Object.entries(embedded.files)) assert.equal(text, fs.readFileSync(path.join(root, f), 'utf8'), f);
  assert.equal(Object.keys(embedded.files).length, 6, 'все JSON включены: meta, exercises, programs, cards, content.ru, ru');
});

test('Все модули включены, их экспорты совпадают с исходниками, ES-модулей и blob-URL нет', () => {
  const jsCount = fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).length + fs.readdirSync(path.join(root, 'js/screens')).length;
  assert.equal(modules.length, jsCount);
  for (const m of modules) {
    const src = fs.readFileSync(path.join(root, m.path), 'utf8');
    const names = [...src.matchAll(/^export\s+(?:default\s+(?:async\s+)?function\s+[\w$]+|(?:async\s+)?function\*?\s+([\w$]+)|class\s+([\w$]+)|(?:const|let|var)\s+([\w$]+))/gm)].map((x) => (x[0].includes('default') ? 'default' : x[1] || x[2] || x[3]));
    assert.deepEqual([...m.exports].sort(), names.sort(), m.path);
  }
  assert.ok(!/^\s*(import\s[^(]|export\s)/m.test(script), 'в скрипте не осталось import/export');
  assert.ok(!/type="module"/.test(out) && !/blob-request|urls\[/.test(out), "загрузчик без ES-модулей и blob-адресов (blob в экспорте профиля — отдельная функция)");
});

test('Нет внешних файлов: ни link/stylesheet, ни script src, ни ссылок на css/ js/ data/', () => {
  assert.equal((out.match(/<script[^>]*\ssrc=/g) || []).length, 0);
  assert.equal((out.match(/<link[^>]*rel="stylesheet"/g) || []).length, 0);
  assert.equal((out.match(/(?:href|src)="(?!data:|#)[^"]*"/g) || []).length, 0);
  assert.ok(!/@import|url\(\s*['"]?(?!data:)/.test(out.match(/<style>([\s\S]*?)<\/style>/)[1]), 'в CSS нет внешних url()');
});

test('Внешние адреса в коде: SDK Telegram (только внутри Telegram), скрипт Google (только по кнопке входа), наш Worker и сайт', () => {
  const urls = new Set(out.replace(/<!--[\s\S]*?-->/g, '').match(/https?:\/\/[^\s"'`<)\\]+/g) || []);
  const unexpected = [...urls].filter((u) => !/^https?:\/\/(telegram\.org\/js\/telegram-web-app\.js|accounts\.google\.com\/gsi\/client|fit\.zavezenz\.workers\.dev|zhenyazavezen\.github\.io\/fit\/|t\.me\/|(?:www\.)?w3\.org\/)/.test(u));
  assert.deepEqual(unexpected, []);
});

test('Закоммиченный standalone/index.html актуален (после правок исходников запустите node tools/bundle.mjs)', () => {
  assert.equal(fs.readFileSync(path.join(root, 'standalone/index.html'), 'utf8'), out);
});

test('Сборка воспроизводима: два запуска дают одинаковый файл', () => assert.equal(bundle().out, out));
