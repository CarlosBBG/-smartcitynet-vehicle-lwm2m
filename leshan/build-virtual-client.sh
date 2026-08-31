#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd "$(dirname "$0")" && pwd)
runtime_dir="$project_dir/.runtime"
source_dir="$project_dir/virtual-client/src/main/java"
classes_dir="$project_dir/virtual-client/target/classes"
client_jar="$runtime_dir/leshan-demo-client-2.0.0-M18-jar-with-dependencies.jar"
java_root=${SMARTCITYNET_JAVA_HOME:-/home/lcd/.local/share/smartcitynet/jdk-17}

mkdir -p "$runtime_dir" "$classes_dir"
if [[ ! -f "$client_jar" ]]; then
  curl -L --fail --show-error \
    -o "$client_jar" \
    "https://repo1.maven.org/maven2/org/eclipse/leshan/leshan-demo-client/2.0.0-M18/$(basename "$client_jar")"
fi

"$java_root/bin/javac" \
  -encoding UTF-8 \
  -cp "$client_jar" \
  -d "$classes_dir" \
  "$source_dir/net/smartcitynet/leshan/SmartCityNetVirtualClient.java"

echo "Cliente virtual compilado en $classes_dir"
