#!/usr/bin/env bash
# Добавляет ?v=<версия> к локальным импортам, CSS и fetch, чтобы после публикации телефон не показывал старый кэш.
# Использование: tools/stamp.sh <каталог-сборки> <версия>
set -euo pipefail
dir="$1"; v="$2"
find "$dir/js" -name '*.js' -print0 | xargs -0 sed -i -E "s#(from|import\()\s*(['\"])(\.{1,2}/[^'\"?]+\.js)\2#\1 \2\3?v=${v}\2#g"
sed -i -E "s#(href|src)=\"((css|js)/[^\"?]+)\"#\1=\"\2?v=${v}\"#g; s#(name=\"build\" content=\")[^\"]*#\1${v}#" "$dir/index.html"
grep -rlE "fetch\(" "$dir/js" | xargs -r sed -i -E "s#(fetch\(\s*['\"\`][^'\"\`?]+\.json)(['\"\`])#\1?v=${v}\2#g"
