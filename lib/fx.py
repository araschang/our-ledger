"""匯率：各幣別 → CAD。每 12 小時抓一次，抓不到用保底值。

網站和捷徑記非 CAD 的帳時，都在記帳當下用這裡的匯率換成 CAD 存起來
（原幣和匯率寫進備註），之後報表不會跟著每天的匯率變動。
"""
import json
import threading
import time
import urllib.request

CURRENCIES = {"CAD": "CA$", "USD": "US$", "TWD": "NT$"}
FALLBACK_RATES = {"CAD": 1.0, "USD": 1.35, "TWD": 0.044}
URL = "https://open.er-api.com/v6/latest/CAD"
TTL = 12 * 3600

_lock = threading.Lock()
_cache: dict = {"at": 0.0, "rates": None, "source": "fallback"}


def _fetch() -> dict:
    with urllib.request.urlopen(URL, timeout=5) as r:
        cad_to = json.load(r)["rates"]
    return {c: (1.0 if c == "CAD" else round(1.0 / float(cad_to[c]), 6))
            for c in CURRENCIES if c in cad_to}


def rates() -> dict:
    """{'CAD': 1.0, 'USD': 1.38, 'TWD': 0.043}；外網掛了就回保底值（不丟錯）。"""
    with _lock:
        if _cache["rates"] and time.time() - _cache["at"] < TTL:
            return dict(_cache["rates"])
        try:
            got = _fetch()
            _cache.update(at=time.time(), rates={**FALLBACK_RATES, **got}, source="live")
        except Exception:  # noqa: BLE001 — 匯率抓不到不能讓記帳失敗
            if not _cache["rates"]:
                _cache.update(at=time.time() - TTL + 600, rates=dict(FALLBACK_RATES),
                              source="fallback")  # 10 分鐘後再試
        return dict(_cache["rates"])


def source() -> str:
    return _cache["source"]


def sym(currency: str) -> str:
    return CURRENCIES.get(currency, f"{currency} ")


def lock_to_cad(row: dict, rate_table: dict | None = None) -> dict:
    """非 CAD 的新帳：金額換成 CAD、幣別改 CAD，原幣與匯率記在備註最前面。"""
    cur = (row.get("currency") or "CAD").upper()
    if cur == "CAD":
        row["currency"] = "CAD"
        return row
    table = rate_table or rates()
    rate = float(table.get(cur) or FALLBACK_RATES.get(cur) or 0)
    if rate <= 0:
        raise ValueError(f"不支援的幣別：{cur}")
    orig = f"原幣 {sym(cur)}{float(row['amount']):,.2f} @{rate:.4f}"
    note = (row.get("note") or "").strip()
    row["note"] = f"{orig}｜{note}" if note else orig
    row["amount"] = round(float(row["amount"]) * rate, 2)
    row["currency"] = "CAD"
    return row
