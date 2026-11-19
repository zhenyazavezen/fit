#!/usr/bin/env bash
# Все проверки без внешних зависимостей: данные, модульные тесты клиента и сервера.
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/validate.mjs
node --test tests/*.test.mjs tests/worker/*.test.mjs
echo "Сквозные (нужен Playwright): NODE_PATH=<путь к node_modules> E2E_DIR=standalone node tests/e2e/run.mjs"
