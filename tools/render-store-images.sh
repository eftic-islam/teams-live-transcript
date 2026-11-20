#!/usr/bin/env bash
# Renders the store images in store/ from the HTML sources in store/src/,
# using a headless Microsoft Edge (or Chrome) with a throwaway profile.
set -euo pipefail
cd "$(dirname "$0")/.."
BROWSER="${BROWSER:-/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge}"
[ -x "$BROWSER" ] || BROWSER="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT

shot() { # shot <html relative to store/src> <width> <height> <output png>
  "$BROWSER" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check \
    --window-size="$2,$3" --virtual-time-budget=1500 \
    --screenshot="$PWD/store/$4" "file://$PWD/store/src/$1" >/dev/null 2>&1
  sips -g pixelWidth -g pixelHeight "store/$4" | tail -2 | awk '{printf "%s ", $2}'; echo "store/$4"
}

sips -Z 300 store/logo-512.png --out store/logo-300.png >/dev/null && echo "300 300 store/logo-300.png"
shot "promo.html?small" 440 280 promo-small-440x280.png
shot "promo.html?large" 1400 560 promo-large-1400x560.png
shot screenshot-recording.html 1280 800 screenshot-1-recording.png
shot screenshot-saved-file.html 1280 800 screenshot-2-saved-file.png
