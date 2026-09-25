#!/usr/bin/env bash
set -euo pipefail

backend_dir=$(cd "$(dirname "$0")" && pwd)
repository_dir=$(cd "$backend_dir/.." && pwd)
runtime_dir="$repository_dir/.runtime/postgresql"
postgres_bin="$runtime_dir/root/usr/lib/postgresql/14/bin"
postgres_lib="$runtime_dir/root/usr/lib/x86_64-linux-gnu"
data_dir="$runtime_dir/data"
socket_dir="$runtime_dir/socket"

if [[ ! -x "$postgres_bin/pg_ctl" || ! -f "$data_dir/PG_VERSION" ]]; then
  echo "PostgreSQL local no está preparado. Use Docker Compose o siga backend/README.md." >&2
  exit 1
fi

export LD_LIBRARY_PATH="$postgres_lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
mkdir -p "$socket_dir"

if "$postgres_bin/pg_ctl" -D "$data_dir" status >/dev/null 2>&1; then
  echo "PostgreSQL ya está iniciado en 127.0.0.1:5432"
  exit 0
fi

"$postgres_bin/pg_ctl" \
  -D "$data_dir" \
  -l "$runtime_dir/postgresql.log" \
  -o "-h 127.0.0.1 -p 5432 -k $socket_dir" \
  start
