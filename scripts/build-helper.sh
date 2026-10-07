#!/usr/bin/env bash
# Build the Swift photos helper and place it where Tauri expects sidecars
# (binaries/<name>-<target-triple>).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
package="$root/photos-helper"

swift build -c release --package-path "$package"
bin="$(swift build -c release --package-path "$package" --show-bin-path)"
mkdir -p "$root/binaries"
install -m 755 "$bin/photos-helper" "$root/binaries/photos-helper-aarch64-apple-darwin"
