#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$BASE_DIR/.runtime/node/bin"

if [[ ! -x "$NODE_BIN/node" ]]; then
    echo "Falta Node.js local. Ejecute ./install-node-red.sh" >&2
    exit 1
fi

if [[ ! -x "$BASE_DIR/node_modules/.bin/node-red" ]]; then
    echo "Faltan las dependencias. Ejecute ./install-node-red.sh" >&2
    exit 1
fi

export PATH="$NODE_BIN:$PATH"
export BRIDGE_URL="${BRIDGE_URL:-http://127.0.0.1:8081}"
export LESHAN_URL="${LESHAN_URL:-http://127.0.0.1:8080}"
export DEVICE_ID="${DEVICE_ID:-heltec-labredes}"
export LESHAN_ENDPOINT="${LESHAN_ENDPOINT:-smartcitynet-heltec-labredes}"
export DASHBOARD_TEMPLATE="${DASHBOARD_TEMPLATE:-$BASE_DIR/dashboard.vue}"

exec "$BASE_DIR/node_modules/.bin/node-red" \
    --userDir "$BASE_DIR" \
    --settings "$BASE_DIR/settings.js"
