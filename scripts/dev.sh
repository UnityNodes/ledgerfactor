#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.daml/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[1/5] building DAR ..."
daml build >/dev/null
DAR="$(ls .daml/dist/*.dar | head -1)"
PKG="$(daml damlc inspect-dar "$DAR" --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).main_package_id))")"
echo "      package id: $PKG"

echo "[2/5] starting Canton sandbox on :6865 ..."
rm -f /tmp/lf-sandbox-port
daml sandbox --port 6865 --dar "$DAR" --port-file /tmp/lf-sandbox-port >/tmp/lf-sandbox.log 2>&1 &
until [ -f /tmp/lf-sandbox-port ]; do sleep 1; done
echo "      sandbox ready"

echo "[3/5] starting JSON Ledger API on :7575 ..."
daml json-api --ledger-host localhost --ledger-port 6865 --http-port 7575 --allow-insecure-tokens >/tmp/lf-jsonapi.log 2>&1 &
until curl -sf localhost:7575/readyz >/dev/null 2>&1; do sleep 1; done
echo "      json api ready"

echo "[4/5] starting server + AI scoring on :8080 ..."
( cd server && npm install --silent && LF_PACKAGE_ID="$PKG" npm start >/tmp/lf-server.log 2>&1 & )
until curl -s localhost:8080/api/health 2>/dev/null | grep -q '"seeded":true'; do sleep 1; done
echo "      server seeded the demo scene"

echo "[5/5] starting web UI on :5173 ..."
( cd web && npm install --silent && npm run dev >/tmp/lf-web.log 2>&1 & )
sleep 3

cat <<EOF

  LedgerFactor is up.

  UI            http://localhost:5173
  JSON API      http://localhost:7575
  role views    http://localhost:8080/api/view/{supplier|buyer|financier|auditor}

  logs: /tmp/lf-sandbox.log  /tmp/lf-jsonapi.log  /tmp/lf-server.log  /tmp/lf-web.log
EOF
