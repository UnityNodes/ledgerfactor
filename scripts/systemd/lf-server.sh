#!/usr/bin/env bash
set -euo pipefail
export PATH="/home/ledgerfactor/.daml/bin:/usr/bin:/bin"
export HOME=/home/ledgerfactor
cd /root/ledgerfactor

for _ in $(seq 1 240); do
  curl -sf localhost:7575/readyz >/dev/null 2>&1 && break
  sleep 1
done

DAR=.daml/dist/ledgerfactor-0.1.0.dar
PKG=$(daml damlc inspect-dar "$DAR" --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).main_package_id))")

cd /root/ledgerfactor/server
exec env LF_PACKAGE_ID="$PKG" PORT=8080 ./node_modules/.bin/tsx src/server.ts
