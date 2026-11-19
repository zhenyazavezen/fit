#!/usr/bin/env bash
# Локальная сборка для публикации (то же, что делает workflow): tools/build.sh [каталог] [версия]
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:-_site}"; v="${2:-$(git rev-parse --short=8 HEAD 2>/dev/null || echo local)}"
rm -rf "$out"; mkdir "$out"
cp -r index.html css js data locales assets manifest.webmanifest sw.js "$out"/
[ -d fonts ] && cp -r fonts "$out"/ || true
touch "$out/.nojekyll"
tools/stamp.sh "$out" "$v"
echo "Собрано: $out (версия $v)"
