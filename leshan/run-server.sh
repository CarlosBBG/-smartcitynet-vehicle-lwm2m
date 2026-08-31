#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd "$(dirname "$0")" && pwd)
runtime_dir="$project_dir/.runtime"
server_jar="$runtime_dir/leshan-demo-server-2.0.0-M18-jar-with-dependencies.jar"
java_root=${SMARTCITYNET_JAVA_HOME:-/home/lcd/.local/share/smartcitynet/jdk-17}

if [[ ! -f "$server_jar" ]]; then
  mkdir -p "$runtime_dir"
  curl -L --fail --show-error \
    -o "$server_jar" \
    "https://repo1.maven.org/maven2/org/eclipse/leshan/leshan-demo-server/2.0.0-M18/$(basename "$server_jar")"
fi

exec "$java_root/bin/java" -jar "$server_jar" \
  --models-folder "$project_dir/models" \
  --web-host 127.0.0.1 \
  --web-port 8080 \
  --coap-host 127.0.0.1 \
  --coap-port 5683
