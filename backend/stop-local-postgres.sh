#!/usr/bin/env bash
set -euo pipefail

backend_dir=$(cd "$(dirname "$0")" && pwd)
repository_dir=$(cd "$backend_dir/.." && pwd)
runtime_dir="$repository_dir/.runtime/postgresql"
postgres_bin="$runtime_dir/root/usr/lib/postgresql/14/bin"
postgres_lib="$runtime_dir/root/usr/lib/x86_64-linux-gnu"
data_dir="$runtime_dir/data"

export LD_LIBRARY_PATH="$postgres_lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
"$postgres_bin/pg_ctl" -D "$data_dir" stop -m fast
