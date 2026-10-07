#!/usr/bin/env bash
# Download pinned static FFmpeg/ffprobe builds (with libzimg) into binaries/
# using Tauri's sidecar naming (<name>-<target-triple>).
set -euo pipefail

VERSION="9.0.2"
BASE="https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_${VERSION}"
TRIPLE="aarch64-apple-darwin"

# Pinned here rather than trusting the server's .sha256 at download time.
# (case instead of an associative array: macOS ships bash 3.2.)
sha256_of() {
  case "$1" in
    ffmpeg) echo "c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924" ;;
    ffprobe) echo "fcbe839537485eaee7a7a8bc5cbc0f90d53617e80943e8a5b2e31cb851197ea6" ;;
  esac
}

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/binaries"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$out"

for name in ffmpeg ffprobe; do
  echo "Fetching $name $VERSION"
  curl -sSfL -o "$tmp/$name.zip" "$BASE/$name.zip"
  echo "$(sha256_of "$name")  $tmp/$name.zip" | shasum -a 256 -c --quiet
  unzip -oq "$tmp/$name.zip" -d "$tmp"
  install -m 755 "$tmp/$name" "$out/$name-$TRIPLE"
done

"$out/ffmpeg-$TRIPLE" -hide_banner -filters | grep -q ' zscale ' \
  || { echo "zscale filter missing" >&2; exit 1; }
echo "Installed to $out"
