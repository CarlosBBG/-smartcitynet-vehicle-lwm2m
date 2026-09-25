#!/usr/bin/env bash
set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_NODE="$FRONTEND_DIR/../.runtime/node/bin"

if [[ -x "$LOCAL_NODE/node" ]]; then
  export PATH="$LOCAL_NODE:$PATH"
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Falta Node.js 24 LTS y npm. Instálelos o prepárelos en .runtime/node; Node-RED no es requerido." >&2
  exit 1
fi

if (( $(node -p 'Number(process.versions.node.split(".")[0])') < 24 )); then
  echo "Se requiere Node.js 24 o posterior para el dashboard." >&2
  exit 1
fi

cd "$FRONTEND_DIR"

if [[ ! -d node_modules ]]; then
  npm install
fi

exec npm run dev
