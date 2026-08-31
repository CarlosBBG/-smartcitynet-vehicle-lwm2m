#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd "$(dirname "$0")" && pwd)
client_jar="$project_dir/.runtime/leshan-demo-client-2.0.0-M18-jar-with-dependencies.jar"
classes_dir="$project_dir/virtual-client/target/classes"
java_root=${SMARTCITYNET_JAVA_HOME:-/home/lcd/.local/share/smartcitynet/jdk-17}

"$project_dir/build-virtual-client.sh"

export LESHAN_MODELS_DIR=${LESHAN_MODELS_DIR:-$project_dir/models}
exec "$java_root/bin/java" \
  -cp "$classes_dir:$client_jar" \
  net.smartcitynet.leshan.SmartCityNetVirtualClient
