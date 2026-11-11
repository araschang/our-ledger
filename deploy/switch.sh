#!/usr/bin/env bash
# 把 our-ledger 換成新版（手機 app）。全程不用 sudo、不會問問題。
#   bash ~/our-ledger/deploy/switch.sh             換成新版
#   bash ~/our-ledger/deploy/switch.sh --rollback  換回舊版 Streamlit（資料不動）
# 換之前會先備份資料庫（~/backups/ledger-before-v2-<時間>.dump）和 compose 設定。
set -euo pipefail
REPO="$HOME/our-ledger"
HOMELAB="$HOME/homelab"
COMPOSE="$HOMELAB/ledger/compose.yaml"
TS="$(date +%Y%m%d-%H%M%S)"
cd "$HOMELAB"

wait_ok() {  # 等 $1 回 ok（最多 60 秒）
  for _ in $(seq 1 60); do
    if curl -sf "$1" >/dev/null; then return 0; fi
    sleep 1
  done
  echo "!! $1 一分鐘內沒回應"; return 1
}

if [ "${1:-}" = "--rollback" ]; then
  last="$(ls -1t "$HOMELAB"/ledger/compose.yaml.bak-* 2>/dev/null | head -1 || true)"
  [ -n "$last" ] || { echo "找不到備份的 compose（$HOMELAB/ledger/compose.yaml.bak-*）"; exit 1; }
  echo "== 換回舊版：用 $last"
  cp "$COMPOSE" "$COMPOSE.v2-$TS"
  cp "$last" "$COMPOSE"
  docker compose up -d --build ledger-web ledger-api
  wait_ok http://127.0.0.1:8501/_stcore/health && wait_ok http://127.0.0.1:8502/healthz
  echo "== 好了：舊版回來了（新版的 compose 存在 $COMPOSE.v2-$TS）"
  exit 0
fi

[ -f "$REPO/Dockerfile.app" ] && [ -f "$REPO/deploy/compose.yaml" ] \
  || { echo "$REPO 裡沒有新版（Dockerfile.app / deploy/compose.yaml）"; exit 1; }
echo "== 程式版本：$(git -C "$REPO" log --oneline -1)"

echo "== 1/6 備份資料庫"
docker exec postgres pg_dump -U ledger -d ledger -Fc > "$HOME/backups/ledger-before-v2-$TS.dump"
ls -la "$HOME/backups/ledger-before-v2-$TS.dump"

echo "== 2/6 換 compose 設定（舊的存成 compose.yaml.bak-$TS）"
cp "$COMPOSE" "$COMPOSE.bak-$TS"
cp "$REPO/deploy/compose.yaml" "$COMPOSE"
docker compose config -q

echo "== 3/6 build 新版 image（這時舊版還在跑）"
docker compose build ledger-web

echo "== 4/6 以前捷徑記的美金帳，用記帳那天的匯率鎖成 CAD"
docker compose run --rm --no-deps -T ledger-web python -m tools.lock_fx_history --apply

echo "== 5/6 換上新版"
docker compose up -d ledger-web ledger-api
wait_ok http://127.0.0.1:8501/healthz
wait_ok http://127.0.0.1:8502/healthz

echo "== 6/6 檢查"
curl -s http://127.0.0.1:8501/api/data | python3 -c \
  'import json,sys; d=json.load(sys.stdin); print("   帳本", len(d["transactions"]), "筆；匯率", d["rates_source"])'
curl -sf http://127.0.0.1:8501/_stcore/health >/dev/null && echo "   uptime-kuma 用的舊健康檢查網址也 ok"
docker ps --format '   {{.Names}}  {{.Status}}' | grep ledger
echo "== 好了：手機打開原本的網址（:8011）就是新版。有問題：bash $REPO/deploy/switch.sh --rollback"
