#!/usr/bin/env bash
# Renders tools/og-image.html to assets/img/og-image.png at 1200x630.
#
# Needs a Chrome/Chromium on PATH, or set CHROME to one (a flatpak works:
#   CHROME="flatpak run com.google.Chrome" ./tools/render-og.sh
# ). The page is served over HTTP rather than file:// so the webp icon and the
# Google Fonts stylesheet both load.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$root/assets/img/og-image.png"
port="${PORT:-8899}"

chrome="${CHROME:-}"
if [ -z "$chrome" ]; then
  for c in google-chrome-stable google-chrome chromium chromium-browser; do
    if command -v "$c" >/dev/null 2>&1; then chrome="$c"; break; fi
  done
fi
[ -n "$chrome" ] || { echo "No Chrome found. Set CHROME=..." >&2; exit 1; }

python3 -m http.server "$port" --bind 127.0.0.1 --directory "$root" >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
sleep 2

shoot() {
  $chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size=1200,630 \
    --virtual-time-budget=15000 \
    --screenshot="$1" "http://127.0.0.1:$port/tools/og-image.html" >/dev/null 2>&1 || true
}

rm -f "$out"
shoot "$out"

# A sandboxed browser (flatpak, snap) cannot write into the repo, so stage the
# render somewhere it is allowed to and move it into place afterwards.
if [ ! -s "$out" ]; then
  stage="${OG_STAGE:-$HOME/Downloads}/weaosmp-og-$$.png"
  mkdir -p "$(dirname "$stage")"
  shoot "$stage"
  [ -s "$stage" ] || { echo "Render failed; try OG_STAGE=<a dir your browser can write to>" >&2; exit 1; }
  mv "$stage" "$out"
fi

echo "wrote $out ($(wc -c < "$out") bytes)"
