"""Postgres 後端：介面跟 GasClient 一樣（get_all/add/update/delete/save_meta），UI 不用改。

自架時取代 Google Sheet。txn 正規化規則對齊 apps_script/Code.gs，
手機捷徑打的 api/server.py 也共用這裡。表不存在會自動建立。
"""
import re
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from lib.api import ApiError

TZ = ZoneInfo("America/Vancouver")  # 「今天」以溫哥華為準，跟 Code.gs 一樣
SPLITS = ("half", "own", "advance")

SCHEMA = """
CREATE TABLE IF NOT EXISTS transactions (
    id         text PRIMARY KEY,
    created_at timestamp NOT NULL,          -- 溫哥華當地時間
    date       date NOT NULL,
    person     text NOT NULL DEFAULT '',
    type       text NOT NULL DEFAULT 'expense',
    category   text NOT NULL DEFAULT 'other',
    item       text NOT NULL DEFAULT '',
    amount     numeric(14, 2) NOT NULL DEFAULT 0,
    note       text NOT NULL DEFAULT '',
    location   text NOT NULL DEFAULT '',
    source     text NOT NULL DEFAULT '',
    currency   text NOT NULL DEFAULT 'CAD',
    split      text NOT NULL DEFAULT 'own' CHECK (split IN ('half', 'own', 'advance'))
);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (date);
CREATE TABLE IF NOT EXISTS meta (
    key   text PRIMARY KEY,
    value jsonb NOT NULL
);
"""
COLS = ("id", "created_at", "date", "person", "type", "category", "item",
        "amount", "note", "location", "source", "currency", "split")

_ready: set[str] = set()  # 這個 process 已經建過表的 DSN


def _bool(v) -> bool:
    # 捷徑可能送字串，也接受捷徑清單直接送的中文選項
    s = str(v).strip().lower()
    return v is True or s in ("true", "共同", "是")


def split_of(t: dict) -> str:
    """分法：優先看明確的 split，否則從 shared 推導（捷徑只送 shared 一個欄位）。"""
    sp = str(t.get("split") or "").strip().lower()
    if sp in SPLITS:
        return sp
    sh = str(t.get("shared", "")).strip().lower()
    if sh in ("advance", "代墊"):
        return "advance"
    return "half" if _bool(t.get("shared")) else "own"


def _amount(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _ts(v) -> datetime | None:
    """created_at → 溫哥華當地 naive datetime。舊資料可能是 JS Date 字串（含 "(Pacific...)" 尾巴）。"""
    if not v:
        return None
    s = re.sub(r"\s*\(.+\)$", "", str(v))
    s = re.sub(r"GMT(?=[+-])", "", s)  # dateutil 把 "GMT-0700" 的正負號當 POSIX 反著解
    ts = pd.to_datetime(s, errors="coerce", format="mixed")
    if pd.isna(ts):
        return None
    if ts.tzinfo is not None:
        ts = ts.tz_convert(TZ).tz_localize(None)
    return ts.to_pydatetime()


def normalize(t: dict, *, new: bool) -> dict:
    """前端/捷徑送來的 txn → 一列。new=True 時補 id/created_at/date（同 Code.gs 的 add）。"""
    created = _ts(t.get("created_at"))
    if new and created is None:
        created = datetime.now(TZ).replace(tzinfo=None, microsecond=0)
    date = str(t.get("date") or "")[:10] or (created.strftime("%Y-%m-%d") if created else "")
    return {
        "id": str(t.get("id") or (uuid.uuid4().hex[:8] if new else "")),
        "created_at": created,
        "date": date,
        "person": str(t.get("person") or ""),
        "type": str(t.get("type") or "expense"),
        "category": str(t.get("category") or "other"),
        "item": str(t.get("item") or ""),
        "amount": _amount(t.get("amount")),
        "note": str(t.get("note") or ""),
        "location": str(t.get("location") or ""),
        "source": str(t.get("source") or ""),
        "currency": str(t.get("currency") or "CAD"),
        "split": split_of(t),
    }


def _out(r: dict) -> dict:
    return {
        **r,
        "created_at": r["created_at"].strftime("%Y-%m-%dT%H:%M:%S"),
        "date": r["date"].isoformat(),
        "amount": float(r["amount"]),
        "shared": r["split"] == "half",  # 舊欄位，前端/統計還會看
    }


class PgClient:
    def __init__(self, dsn: str, token: str = ""):
        # url/token 跟 GasClient 同名：_bundle 拿它們當快取 key
        self.url = dsn.strip()
        self.token = token

    def _conn(self) -> psycopg.Connection:
        conn = psycopg.connect(self.url, row_factory=dict_row, connect_timeout=10)
        if self.url not in _ready:
            conn.execute(SCHEMA)
            conn.commit()
            _ready.add(self.url)
        return conn

    def _run(self, fn) -> dict:
        """在一個交易裡執行 fn(conn)，回最新全量（同 Code.gs 每個 POST 的回應）。"""
        try:
            with self._conn() as conn:
                fn(conn)
                return self._all(conn)
        except psycopg.Error as e:
            raise ApiError(f"資料庫錯誤：{e}") from e

    @staticmethod
    def _all(conn) -> dict:
        rows = conn.execute(
            f"SELECT {', '.join(COLS)} FROM transactions ORDER BY created_at, id").fetchall()
        meta = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM meta")}
        return {"ok": True, "transactions": [_out(r) for r in rows], "meta": meta}

    def get_all(self) -> dict:
        """回 {'transactions': [...], 'meta': {...}}"""
        return self._run(lambda conn: None)

    def add_txn(self, txn: dict) -> dict:
        row = normalize(txn, new=True)
        return self._run(lambda conn: conn.execute(
            f"INSERT INTO transactions ({', '.join(COLS)}) "
            f"VALUES ({', '.join('%(' + c + ')s' for c in COLS)})", row))

    def update_txn(self, txn: dict) -> dict:
        row = normalize(txn, new=False)

        def fn(conn):
            sets = ", ".join(f"{c} = %({c})s" for c in COLS if c not in ("id", "created_at"))
            cur = conn.execute(
                f"UPDATE transactions SET {sets}, "
                "created_at = COALESCE(%(created_at)s, created_at) WHERE id = %(id)s", row)
            if cur.rowcount == 0:
                raise ApiError(f"id not found: {row['id']}")
        return self._run(fn)

    def delete_txn(self, txn_id: str) -> dict:
        return self._run(lambda conn: conn.execute(
            "DELETE FROM transactions WHERE id = %s", (str(txn_id),)))

    def save_meta(self, meta: dict) -> dict:
        def fn(conn):
            conn.execute("DELETE FROM meta")
            for k, v in (meta or {}).items():
                conn.execute("INSERT INTO meta (key, value) VALUES (%s, %s)", (k, Jsonb(v)))
        return self._run(fn)

    def replace_all(self, transactions: list, meta: dict) -> dict:
        """搬家用：整批換掉（保留原本的 id/created_at/source），一個交易內完成。"""
        rows = [normalize(t, new=True) for t in transactions]

        def fn(conn):
            conn.execute("DELETE FROM transactions")
            with conn.cursor() as cur:
                cur.executemany(
                    f"INSERT INTO transactions ({', '.join(COLS)}) "
                    f"VALUES ({', '.join('%(' + c + ')s' for c in COLS)})", rows)
            conn.execute("DELETE FROM meta")
            for k, v in (meta or {}).items():
                conn.execute("INSERT INTO meta (key, value) VALUES (%s, %s)", (k, Jsonb(v)))
        return self._run(fn)
