"""一次性搬家：把 Google Sheet（經 Apps Script）的全部資料複製進 Postgres。

用法（環境變數）：GAS_URL、GAS_TOKEN、DATABASE_URL
  python -m tools.import_sheet            # Postgres 已經有資料就停下來
  python -m tools.import_sheet --replace  # 清掉 Postgres 現有資料再匯入
Sheet 本身只讀不改。id/created_at/source 原樣保留。
"""
import os
import sys
from collections import Counter

from lib.api import GasClient
from lib.pg import PgClient

src = GasClient(os.environ["GAS_URL"], os.environ["GAS_TOKEN"]).get_all()
dst = PgClient(os.environ["DATABASE_URL"])
txns, meta = src.get("transactions") or [], src.get("meta") or {}

existing = dst.get_all()["transactions"]
if existing and "--replace" not in sys.argv:
    sys.exit(f"Postgres 已經有 {len(existing)} 筆；確定要覆蓋請加 --replace")

dupes = [i for i, n in Counter(t["id"] for t in txns).items() if n > 1]
if dupes:
    sys.exit(f"Sheet 裡有重複的 id，先處理掉再搬：{dupes}")

out = dst.replace_all(txns, meta)["transactions"]
total = lambda rows: round(sum(float(t.get("amount") or 0) for t in rows), 2)
print(f"Sheet：{len(txns)} 筆，金額合計 {total(txns)}；meta 鍵 {sorted(meta)}")
print(f"Postgres：{len(out)} 筆，金額合計 {total(out)}")
if len(out) != len(txns) or total(out) != total(txns):
    sys.exit("⚠️ 筆數或金額對不起來，請檢查")
print("✅ 搬完，筆數和金額都一致")
