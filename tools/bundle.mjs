// Сборка автономной версии: всё приложение (HTML, CSS, JS-модули, JSON-данные) в одном файле.
//   node tools/bundle.mjs [выходной_файл]     по умолчанию standalone/index.html
// Только встроенные модули Node.js, без npm. Исходники (index.html, css/, js/, data/, locales/) не меняются.
// Модули превращаются в функции одного обычного <script> (import → деструктуризация, export → возвращаемый объект); без blob-URL и без ES-модулей, поэтому работает в любом встроенном просмотрщике.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);

export function bundle() {
  const jsFiles = walk('js').filter((f) => f.endsWith('.js')).sort();
  const jsonFiles = [...walk('data'), ...walk('locales')].filter((f) => f.endsWith('.json')).sort();
  const css = [rd('css/tokens.css'), rd('css/app.css')].join('\n');

  // Порядок модулей: сначала зависимости (циклов нет — проверяется ниже).
  const src = Object.fromEntries(jsFiles.map((f) => [f, rd(f)]));
  const deps = (f) => [...src[f].matchAll(/(?:from\s*|import\(\s*)'(\.{1,2}\/[^']+\.js)'/g)].map((m) => path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
  const order = [], state = {};
  const visit = (f, chain = []) => {
    if (state[f] === 2) return;
    if (state[f] === 1) throw new Error('Цикл импортов: ' + [...chain, f].join(' → '));
    if (!src[f]) throw new Error('Нет модуля: ' + f + ' (из ' + chain.at(-1) + ')');
    state[f] = 1; deps(f).forEach((d) => visit(d, [...chain, f])); state[f] = 2; order.push(f);
  };
  jsFiles.forEach((f) => visit(f));

  const files = Object.fromEntries(jsonFiles.map((f) => [f, rd(f)]));
  const idx = Object.fromEntries(order.map((f, i) => [f, i]));
  const target = (from, rel) => idx[path.posix.normalize(path.posix.join(path.posix.dirname(from), rel))];
  // Каждый модуль превращается в функцию со своей областью видимости; import → деструктуризация из объекта экспорта зависимости.
  const exportsOf = {};
  const transformed = order.map((f) => {
    const names = [];
    let code = src[f];
    code = code.replace(/^import\s+\*\s+as\s+([\w$]+)\s+from\s+'(\.{1,2}\/[^']+\.js)';?[ \t]*$/gm, (_, ns, rel) => `const ${ns} = __m[${target(f, rel)}];`);
    code = code.replace(/^import\s+\{([^}]*)\}\s+from\s+'(\.{1,2}\/[^']+\.js)';?[ \t]*$/gm, (_, list, rel) =>
      `const { ${list.split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\s+as\s+/, ': ')).join(', ')} } = __m[${target(f, rel)}];`);
    code = code.replace(/^export\s+default\s+(async\s+)?function\s+([\w$]+)/gm, (_, a, n) => { names.push(['default', n]); return `${a || ''}function ${n}`; });
    code = code.replace(/^export\s+((?:async\s+)?function\*?|class|const|let|var)\s+([\w$]+)/gm, (_, kw, n) => { names.push([n, n]); return `${kw} ${n}`; });
    code = code.replace(/import\(\s*'(\.{1,2}\/[^']+\.js)'\s*\)/g, (_, rel) => `Promise.resolve(__m[${target(f, rel)}])`);
    if (/^\s*(import\s[^(]|export\s)/m.test(code)) throw new Error('Не удалось преобразовать модуль: ' + f);
    if (/\bimport\.meta\b/.test(code) || /<\/script/i.test(code)) throw new Error('Неподдерживаемая конструкция в ' + f);
    exportsOf[f] = names.map(([e]) => e);
    const ret = names.map(([e, n]) => (e === n ? n : `${e}: ${n}`)).join(', ');
    return `// ── ${f}\n__m[${idx[f]}] = (function () {\n${code}\n;return { ${ret} };\n})();`;
  });
  const modules = order.map((f) => ({ path: f, exports: exportsOf[f] }));
  const id = crypto.createHash('sha1').update(JSON.stringify([transformed, files, css])).digest('hex').slice(0, 8);

  // Разметка берётся из исходного index.html: всё, что между <body> и тегом <script type="module">.
  const html = rd('index.html');
  const head = html.match(/<title>[^<]*<\/title>/)[0];
  const icon = html.match(/<link rel="icon"[^>]*>/)[0];
  const theme = html.match(/<meta name="theme-color"[^>]*>/)[0];
  const scheme = html.match(/<meta name="color-scheme"[^>]*>/)[0];
  const lang = html.match(/<html lang="([^"]+)"/)[1];
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"')).trim();

  const json = JSON.stringify({ files }).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\u0021--');
  const loader = `
(function () {
  'use strict';
  var fail = function (e) { console.error(e); var s = document.getElementById('screen') || document.body; s.textContent = 'Не удалось запустить приложение: ' + (e && e.message || e); };
  try {
    var B = JSON.parse(document.getElementById('app-bundle').textContent);
    // Данные приложения отдаются из файла; любые другие запросы идут как обычно.
    var nativeFetch = window.fetch;
    window.fetch = function (u, o) {
      var k = String(u).split('?')[0];
      if (Object.prototype.hasOwnProperty.call(B.files, k)) return Promise.resolve(new Response(B.files[k], { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return nativeFetch.apply(this, arguments);
    };
    var __m = [];
${transformed.join('\n')}
  } catch (e) { fail(e); }
})();`;

  const out = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${theme}
${scheme}
<meta name="build" content="${id}">
${head}
${icon}
<style>
${css}
</style>
</head>
<body>
${body}
<script type="application/json" id="app-bundle">${json}</script>
<script>${loader}</script>
</body>
</html>
`;
  return { out, id, modules, files: jsonFiles.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = path.resolve(process.argv[2] || path.join(root, 'standalone/index.html'));
  const r = bundle();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, r.out);
  console.log(`Готово: ${target}\n  размер ${(Buffer.byteLength(r.out) / 1024).toFixed(0)} КБ, модулей ${r.modules.length}, JSON-файлов ${r.files}, версия ${r.id}`);
}
