#!/usr/bin/env bash
set -euo pipefail

backend_dir=$(cd "$(dirname "$0")" && pwd)
repository_dir=$(cd "$backend_dir/.." && pwd)

local_node="$repository_dir/.runtime/node/bin"
if [[ -x "$local_node/node" ]]; then
  export PATH="$local_node:$PATH"
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Faltan Node.js 24 LTS y npm. Instálelos o prepárelos en .runtime/node; Node-RED no es requerido." >&2
  exit 1
fi

if (( $(node -p 'Number(process.versions.node.split(".")[0])') < 24 )); then
  echo "Se requiere Node.js 24 o posterior para la API." >&2
  exit 1
fi

cd "$backend_dir"
exec npm run start:dev
