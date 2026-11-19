// Проверка локализации: все ключи t('…') из кода есть в locales/ru.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const ru = JSON.parse(fs.readFileSync(path.join(root, 'locales/ru.json'), 'utf8'));
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); f.isDirectory() ? walk(p) : p.endsWith('.js') && files.push(p); } })(path.join(root, 'js'));

test('Все литеральные ключи t(\'…\') есть в ru.json', () => {
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)'\s*[,)]/g)) if (!(m[1] in ru)) missing.push(`${path.relative(root, f)}: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});

test('Динамические префиксы покрывают все значения из meta.json', () => {
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'data/meta.json'), 'utf8'));
  const need = [['cat.', meta.categories], ['muscle.', meta.muscles], ['level.', meta.levels], ['equip.', meta.equipment], ['goal.', meta.goals]];
  const missing = [];
  for (const [p, list] of need) for (const v of list) if (!((p + v) in ru)) missing.push(p + v);
  assert.deepEqual(missing, []);
});

test('Множественные числа заданы объектами с формой other', () => {
  for (const [k, v] of Object.entries(ru)) if (v && typeof v === 'object') assert.ok('other' in v, k);
});
