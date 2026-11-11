"""Postgres 後端：網站（server/app.py）、手機捷徑（api/server.py）、舊版 Streamlit 共用。

txn 正規化規則對齊 apps_script/Code.gs。表不存在會自動建立。
不依賴 pandas（新版網站的 image 不裝 pandas）。
"""
import re
import uuid
from datetime import date as Date, datetime
from zoneinfo import ZoneInfo

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from lib import fx
from lib.api import ApiError

TZ = ZoneInfo("America/Vancouver")  # 「今天」以溫哥華為準，跟 Code.gs 一樣
SPLITS = ("half", "own", "advance")
TYPES = ("expense", "income", "settle")  # settle = 結清：person 把欠款付給對方

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


_JS_DATE = "%a %b %d %Y %H:%M:%S GMT%z"  # 舊 Sheet 的 JS Date 字串


def _ts(v) -> datetime | None:
    """created_at → 溫哥華當地 naive datetime。

    接受 ISO（有沒有時區都行）和舊資料的 JS Date 字串
    （"Thu Aug 07 2026 18:23:37 GMT-0700 (Pacific Daylight Time)"）。
    """
    if not v:
        return None
    if isinstance(v, datetime):
        ts = v
    else:
        s = re.sub(r"\s*\(.+\)$", "", str(v)).strip()
        ts = None
        try:
            ts = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            for fmt in (_JS_DATE, "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M", "%Y-%m-%d %H:%M"):
                try:
                    ts = datetime.strptime(s, fmt)
                    break
                except ValueError:
                    continue
        if ts is None:
            return None
    if ts.tzinfo is not None:
        ts = ts.astimezone(TZ).replace(tzinfo=None)
    return ts


def _date(v, fallback: datetime | None) -> str:
    s = str(v or "")[:10]
    if s:
        try:
            return Date.fromisoformat(s).isoformat()
        except ValueError:
            pass
    return fallback.strftime("%Y-%m-%d") if fallback else ""


def now_local() -> datetime:
    return datetime.now(TZ).replace(tzinfo=None, microsecond=0)


def _text(v) -> str:
    return str(v or "").replace("\x00", "")  # Postgres 的 text 不能有 NUL


def normalize(t: dict, *, new: bool) -> dict:
    """前端/捷徑送來的 txn → 一列。new=True 時補 id/created_at/date（同 Code.gs 的 add）。"""
    created = _ts(t.get("created_at"))
    if new and created is None:
        created = now_local()
    return {
        "id": str(t.get("id") or (uuid.uuid4().hex[:8] if new else "")),
        "created_at": created,
        "date": _date(t.get("date"), created),
        "person": _text(t.get("person")),
        "type": str(t.get("type") or "expense"),
        "category": _text(t.get("category")) or "other",
        "item": _text(t.get("item")),
        "amount": _amount(t.get("amount")),
        "note": _text(t.get("note")),
        "location": _text(t.get("location")),
        "source": _text(t.get("source")),
        "currency": str(t.get("currency") or "CAD").upper(),
        "split": split_of(t),
    }


def _out(r: dict) -> dict:
    return {
        **r,
        "created_at": r["created_at"].strftime("%Y-%m-%dT%H:%M:%S"),
        "date": r["date"].isoformat() if hasattr(r["date"], "isoformat") else str(r["date"]),
        "amount": float(r["amount"]),
        "shared": r["split"] == "half",  # 舊欄位，舊版前端/統計還會看
    }


_INSERT = (f"INSERT INTO transactions ({', '.join(COLS)}) "
           f"VALUES ({', '.join('%(' + c + ')s' for c in COLS)})")
_SELECT = f"SELECT {', '.join(COLS)} FROM transactions"


class PgClient:
    def __init__(self, dsn: str, token: str = ""):
        # url/token 跟 GasClient 同名：舊版 Streamlit 拿它們當快取 key
        self.url = dsn.strip()
        self.token = token

    def _conn(self) -> psycopg.Connection:
        conn = psycopg.connect(self.url, row_factory=dict_row, connect_timeout=10)
        if self.url not in _ready:
            conn.execute(SCHEMA)
            conn.commit()
            _ready.add(self.url)
        return conn

    def _tx(self, fn):
        """在一個交易裡執行 fn(conn) 並回傳它的結果；資料庫錯誤轉成 ApiError。

        資料本身有問題（格式、違反限制）→ 400（重送也沒用）；連線之類的 → 503（等一下再試）。
        """
        try:
            with self._conn() as conn:
                return fn(conn)
        except (psycopg.DataError, psycopg.IntegrityError) as e:
            raise ApiError(f"資料格式不對：{e}", status=400) from e
        except psycopg.Error as e:
            raise ApiError(f"資料庫錯誤：{e}", status=503) from e

    def _run(self, fn) -> dict:
        """舊協定：執行 fn(conn) 後回最新全量（同 Code.gs 每個 POST 的回應）。"""
        def both(conn):
            fn(conn)
            return self._all(conn)
        return self._tx(both)

    @staticmethod
    def _all(conn) -> dict:
        rows = conn.execute(f"{_SELECT} ORDER BY created_at, id").fetchall()
        meta = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM meta")}
        return {"ok": True, "transactions": [_out(r) for r in rows], "meta": meta}

    # ---- 舊協定（捷徑 api/server.py、舊版 Streamlit 用）----------------------
    def get_all(self) -> dict:
        """回 {'transactions': [...], 'meta': {...}}"""
        return self._tx(self._all)

    def add_txn(self, txn: dict) -> dict:
        row = normalize(txn, new=True)
        try:
            fx.lock_to_cad(row)  # 捷徑記的美金/台幣也在記帳當下鎖匯率
        except ValueError as e:
            raise ApiError(str(e)) from e
        return self._run(lambda conn: conn.execute(_INSERT, row))

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
                cur.executemany(_INSERT, rows)
            conn.execute("DELETE FROM meta")
            for k, v in (meta or {}).items():
                conn.execute("INSERT INTO meta (key, value) VALUES (%s, %s)", (k, Jsonb(v)))
        return self._run(fn)

    # ---- 新版網站（server/app.py）：一次只回一列 ------------------------------
    def insert_row(self, row: dict) -> tuple[dict, bool]:
        """新增一列（row 已正規化）。同一個 id 已存在就不動、回原本那列（離線重送不會重複）。

        回 (那一列, 這次是不是真的新增)。
        """
        def fn(conn):
            got = conn.execute(_INSERT + " ON CONFLICT (id) DO NOTHING RETURNING *",
                               row).fetchone()
            if got:
                return _out(got), True
            old = conn.execute(f"{_SELECT} WHERE id = %s", (row["id"],)).fetchone()
            return _out(old), False
        return self._tx(fn)

    def update_row(self, row: dict) -> dict:
        def fn(conn):
            sets = ", ".join(f"{c} = %({c})s" for c in COLS if c not in ("id", "created_at"))
            got = conn.execute(
                f"UPDATE transactions SET {sets}, "
                "created_at = COALESCE(%(created_at)s, created_at) WHERE id = %(id)s "
                "RETURNING *", row).fetchone()
            if not got:
                raise ApiError(f"找不到這筆（id {row['id']}），可能已經被刪掉了", status=404)
            return _out(got)
        return self._tx(fn)

    def get_row(self, txn_id: str) -> dict | None:
        got = self._tx(lambda conn: conn.execute(
            f"{_SELECT} WHERE id = %s", (str(txn_id),)).fetchone())
        return _out(got) if got else None

    def delete_row(self, txn_id: str) -> bool:
        return self._tx(lambda conn: conn.execute(
            "DELETE FROM transactions WHERE id = %s", (str(txn_id),)).rowcount > 0)

    def merge_meta(self, partial: dict) -> dict:
        """只改送來的 key（其他設定不動），回完整 meta。"""
        def fn(conn):
            for k, v in (partial or {}).items():
                conn.execute(
                    "INSERT INTO meta (key, value) VALUES (%s, %s) "
                    "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (k, Jsonb(v)))
            return {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM meta")}
        return self._tx(fn)
