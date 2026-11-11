"""一次性：把以前留下的非 CAD 帳（捷徑記的美金）用「記帳那天」的匯率鎖成 CAD。

新版開始，網站和捷徑記的非 CAD 帳都在記帳當下換成 CAD（原幣、匯率寫在備註）。
在那之前捷徑記的美金帳存的是美金，報表每次用「今天」的匯率換算，數字會跟著匯率跑。
這支照網站的做法改成：金額 = 當天匯率換成的 CAD、幣別 CAD、備註前面加「原幣 US$… @匯率」。

用法：DATABASE_URL=... python -m tools.lock_fx_history            （只列出會怎麼改）
      DATABASE_URL=... python -m tools.lock_fx_history --apply    （真的改）
"""
import json
import os
import sys
import urllib.request

import psycopg

from lib import fx


def day_rate(cur: str, date: str) -> tuple[float, str]:
    """那一天 cur→CAD 的匯率（歐洲央行，週末用前一個營業日）；查不到用今天的。"""
    url = f"https://api.frankfurter.dev/v1/{date}?base={cur}&symbols=CAD"
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            got = json.load(r)
        return float(got["rates"]["CAD"]), f"{got['date']} 的匯率"
    except Exception:  # noqa: BLE001 — 查不到就退回今天的匯率，並標明
        return float(fx.rates()[cur]), "查不到歷史匯率，用今天的"


def main() -> None:
    apply = "--apply" in sys.argv
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        rows = conn.execute(
            "SELECT id, date, amount, currency, note FROM transactions "
            "WHERE currency <> 'CAD' ORDER BY date").fetchall()
        if not rows:
            print("沒有非 CAD 的帳，不用改")
            return
        for id_, date, amount, cur, note in rows:
            rate, src = day_rate(cur, date.isoformat())
            cad = round(float(amount) * rate, 2)
            orig = f"原幣 {fx.sym(cur)}{float(amount):,.2f} @{rate:.4f}"
            new_note = f"{orig}｜{note}" if note else orig
            print(f"{id_}  {date}  {cur} {float(amount):,.2f} → CAD {cad:,.2f}（{src}）  備註：{new_note}")
            if apply:
                conn.execute("UPDATE transactions SET amount = %s, currency = 'CAD', note = %s "
                             "WHERE id = %s AND currency = %s", (cad, new_note, id_, cur))
        print("已寫入" if apply else "（只是預覽；加 --apply 才會真的改）")


if __name__ == "__main__":
    main()
