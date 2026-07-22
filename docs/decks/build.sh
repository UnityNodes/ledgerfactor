#!/usr/bin/env bash
# Rebuild the submission PDFs (pitch deck + 4 one-pagers) from the HTML sources.
# Fonts are pulled from the built web app (web/dist/assets); run `npm --prefix web run build` first if missing.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
cd "$here"

mkdir -p fonts
cp "$repo"/web/dist/assets/gloock-latin-400-normal-*.woff2            fonts/gloock.woff2
cp "$repo"/web/dist/assets/hanken-grotesk-latin-wght-normal-*.woff2   fonts/hanken.woff2
cp "$repo"/web/dist/assets/ibm-plex-mono-latin-400-normal-*.woff2     fonts/plex400.woff2
cp "$repo"/web/dist/assets/ibm-plex-mono-latin-500-normal-*.woff2     fonts/plex500.woff2

chrome="${CHROME:-$(command -v google-chrome || command -v chromium-browser || command -v chromium)}"
print() { "$chrome" --headless --disable-gpu --no-sandbox --no-pdf-header-footer \
  --virtual-time-budget=10000 --run-all-compositor-stages-before-draw \
  --print-to-pdf="$2" "file://$here/$1"; }

print deck.html    out-pitch.pdf
print value.html   out-value.pdf
print gtm.html     out-gtm.pdf
print icp.html     out-icp.pdf
print metrics.html out-metrics.pdf

# publish: docs/ (submission bundle) + web/public/ (served on the live site)
cp out-pitch.pdf   "$repo"/docs/ledgerfactor-pitch.pdf
cp out-value.pdf   "$repo"/docs/ledgerfactor-value-statement.pdf
cp out-gtm.pdf     "$repo"/docs/ledgerfactor-gtm.pdf
cp out-icp.pdf     "$repo"/docs/ledgerfactor-icp.pdf
cp out-metrics.pdf "$repo"/docs/ledgerfactor-metrics.pdf
cp out-pitch.pdf   "$repo"/web/public/pitch.pdf
cp out-value.pdf   "$repo"/web/public/value.pdf
cp out-gtm.pdf     "$repo"/web/public/gtm.pdf
cp out-icp.pdf     "$repo"/web/public/icp.pdf
cp out-metrics.pdf "$repo"/web/public/metrics.pdf
rm -f out-*.pdf
echo "done. rebuild the web app and redeploy to publish: npm --prefix web run build && rsync -a --delete web/dist/ /var/www/ledgerfactor/"
