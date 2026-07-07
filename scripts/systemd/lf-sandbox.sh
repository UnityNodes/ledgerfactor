#!/usr/bin/env bash
set -euo pipefail
export PATH="/home/ledgerfactor/.daml/bin:/usr/bin:/bin"
export HOME=/home/ledgerfactor
cd /root/ledgerfactor

DAR=.daml/dist/ledgerfactor-0.1.0.dar
[ -f "$DAR" ] || daml build

rm -f /tmp/lf-sandbox-port
exec daml sandbox --port 6865 --dar "$DAR" --port-file /tmp/lf-sandbox-port
