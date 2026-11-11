#!/usr/bin/env bash
# 帳本 App 有新版時更新：重新 build、重開 ledger-web 和 ledger-api。資料不動，不用 sudo、不會問問題。
#   bash ~/our-ledger/deploy/update.sh
set -euo pipefail
REPO="${REPO:-$HOME/our-ledger}"
HOMELAB="${HOMELAB:-$HOME/homelab}"
WEB_PORT="${WEB_PORT:-8501}"
API_PORT="${API_PORT:-8502}"
cd "$HOMELAB"
echo "== 程式版本：$(git -C "$REPO" log --oneline -1)"
docker compose build ledger-web
docker compose up -d ledger-web ledger-api
for url in "http://127.0.0.1:$WEB_PORT/healthz" "http://127.0.0.1:$API_PORT/healthz"; do
  for _ in $(seq 1 60); do curl -sf "$url" >/dev/null && break; sleep 1; done
  curl -sf "$url" >/dev/null || { echo "!! $url 一分鐘內沒回應"; exit 1; }
done
curl -s "http://127.0.0.1:$WEB_PORT/api/data" | python3 -c \
  'import json,sys; d=json.load(sys.stdin); print("   帳本", len(d["transactions"]), "筆，正常")'
echo "== 好了：手機重新打開 app（或下拉重新整理）就是新版"
