#!/usr/bin/env bash
set -euo pipefail
export HOME="${HOME:-/home/$(id -un)}"
export PATH="$HOME/.daml/bin:/usr/bin:/bin:${PATH:-}"
cd "$(cd "$(dirname "$0")/../.." && pwd)"

DAR=.daml/dist/ledgerfactor-0.1.0.dar
[ -f "$DAR" ] || daml build

rm -f /tmp/lf-sandbox-port
exec daml sandbox --port 6865 --dar "$DAR" --port-file /tmp/lf-sandbox-port
