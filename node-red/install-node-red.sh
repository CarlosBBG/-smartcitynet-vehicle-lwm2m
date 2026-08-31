#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$BASE_DIR/.runtime"
NODE_VERSION="24.19.0"
NODE_ARCHIVE="node-v${NODE_VERSION}-linux-x64.tar.xz"
NODE_SHA256="14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647"
NODE_BIN="$RUNTIME_DIR/node/bin"

mkdir -p "$RUNTIME_DIR"

if [[ ! -x "$NODE_BIN/node" ]]; then
    TEMP_DIR="$(mktemp -d)"
    trap 'rm -rf "$TEMP_DIR"' EXIT
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}" \
        -o "$TEMP_DIR/$NODE_ARCHIVE"
    printf '%s  %s\n' "$NODE_SHA256" "$TEMP_DIR/$NODE_ARCHIVE" | sha256sum -c -
    tar -xJf "$TEMP_DIR/$NODE_ARCHIVE" -C "$RUNTIME_DIR"
    mv "$RUNTIME_DIR/node-v${NODE_VERSION}-linux-x64" "$RUNTIME_DIR/node"
fi

export PATH="$NODE_BIN:$PATH"
npm install --prefix "$BASE_DIR"

echo "Node.js: $(node --version)"
echo "Node-RED instalado. Ejecute: $BASE_DIR/run-node-red.sh"
