#!/usr/bin/env bash
set -euo pipefail
export HOME="${HOME:-/home/$(id -un)}"
export PATH="$HOME/.daml/bin:/usr/bin:/bin:${PATH:-}"

for _ in $(seq 1 180); do
  [ -f /tmp/lf-sandbox-port ] && break
  sleep 1
done

exec daml json-api \
  --ledger-host localhost --ledger-port 6865 \
  --http-port 7575 --allow-insecure-tokens
