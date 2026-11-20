#!/usr/bin/env bash
# Builds the store upload: dist/live-transcript-for-microsoft-teams-<version>.zip,
# containing the extension/ folder's contents (manifest.json at the zip's root).
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./extension/manifest.json').version")
OUT="dist/live-transcript-for-microsoft-teams-$VERSION.zip"
mkdir -p dist && rm -f "$OUT"
(cd extension && zip -qrX "../$OUT" . -x '.*' -x '*/.*')
unzip -l "$OUT"
