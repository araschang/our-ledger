"""新版網站的後端：JSON API ＋ 手機 app（web/dist 的 PWA）。

    GET    /api/data                 全部帳＋設定＋匯率（ETag，沒變回 304）
    POST   /api/transactions         新增一筆（同 id 重送不會重複，離線補送用）
    PUT    /api/transactions/{id}    修改
    DELETE /api/transactions/{id}    刪除
    PUT    /api/meta                 改設定（只改送來的 key）
    GET    /healthz、/_stcore/health 監控用（舊網址留著，uptime-kuma／homepage 不用改）

只在 tailnet 開放、沒有登入（跟舊版 Streamlit 一樣）。會改資料的請求要帶
X-Ledger 標頭：別的網站沒辦法不經瀏覽器預檢就送這個標頭，擋掉跨站偷改。
用法：DATABASE_URL=... uvicorn server.app:app --host 0.0.0.0 --port 8501
"""
import hashlib
import json
import os
from datetime import date as Date
from pathlib import Path
from typing import Literal

from fastapi import Body, FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field, field_validator

from lib import fx
from lib.api import ApiError
from lib.pg import PgClient, normalize

DIST = Path(os.environ.get("WEB_DIST") or Path(__file__).resolve().parent.parent / "web" / "dist")
META_KEYS = {"people", "categories", "budgets", "fixed_categories"}

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(GZipMiddleware, minimum_size=1024)
_db: PgClient | None = None


def db() -> PgClient:
    global _db
    if _db is None:
        _db = PgClient(os.environ["DATABASE_URL"])
    return _db


@app.middleware("http")
async def guard(request: Request, call_next):
    path = request.url.path
    if (path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS")
            and request.headers.get("x-ledger") != "1"):
        return JSONResponse({"error": "missing X-Ledger header"}, status_code=403)
    resp = await call_next(request)
    if path.startswith("/assets/") and resp.status_code == 200:
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return resp


@app.exception_handler(ApiError)
async def api_error(_request: Request, e: ApiError):
    status = 404 if "找不到" in str(e) else 503 if "資料庫" in str(e) else 400
    return JSONResponse({"error": str(e)}, status_code=status)


# ---- 監控 --------------------------------------------------------------------
@app.get("/healthz")
@app.get("/_stcore/health")
def health():
    db()._tx(lambda conn: conn.execute("SELECT 1"))
    return Response("ok", media_type="text/plain")


# ---- 資料 --------------------------------------------------------------------
@app.get("/api/data")
def data(request: Request):
    got = db().get_all()
    body = json.dumps({"transactions": got["transactions"], "meta": got["meta"],
                       "rates": fx.rates(), "rates_source": fx.source()},
                      ensure_ascii=False, separators=(",", ":")).encode()
    etag = '"' + hashlib.md5(body).hexdigest() + '"'
    headers = {"ETag": etag, "Cache-Control": "no-cache"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(body, media_type="application/json", headers=headers)


@app.get("/api/rates")
def rates():
    return {"rates": fx.rates(), "source": fx.source()}


class TxnIn(BaseModel):
    id: str | None = Field(None, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    created_at: str | None = Field(None, max_length=40)
    date: str
    person: str = Field(min_length=1, max_length=40)
    type: Literal["expense", "income", "settle"] = "expense"
    category: str = Field("", max_length=40)
    item: str = Field("", max_length=200)
    amount: float = Field(gt=0, lt=10_000_000)
    note: str = Field("", max_length=1000)
    currency: Literal["CAD", "USD", "TWD"] = "CAD"
    split: Literal["half", "own", "advance"] = "own"
    source: str = Field("app", max_length=20)
    location: str = Field("", max_length=200)

    @field_validator("date")
    @classmethod
    def _iso_date(cls, v: str) -> str:
        return Date.fromisoformat(v[:10]).isoformat()

    @field_validator("category", "item", "note", "person")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


def _row(body: TxnIn, *, new: bool) -> dict:
    t = body.model_dump()
    if t["type"] == "settle":
        t.update(category="結清", item=t["item"] or "結清", split="own")
    elif t["type"] == "income":
        t["split"] = "own"
    if not t["category"]:
        raise ApiError("分類不能空白")
    row = normalize(t, new=new)
    row["amount"] = round(row["amount"], 2)
    try:
        fx.lock_to_cad(row)
    except ValueError as e:
        raise ApiError(str(e)) from e
    return row


@app.post("/api/transactions")
def add(body: TxnIn):
    txn, created = db().insert_row(_row(body, new=True))
    return {"txn": txn, "created": created}


@app.put("/api/transactions/{txn_id}")
def update(txn_id: str, body: TxnIn):
    body.id = txn_id
    return {"txn": db().update_row(_row(body, new=False))}


@app.delete("/api/transactions/{txn_id}")
def delete(txn_id: str):
    return {"ok": True, "deleted": db().delete_row(txn_id)}


@app.put("/api/meta")
def put_meta(meta: dict = Body(...)):
    bad = set(meta) - META_KEYS
    if bad:
        raise ApiError(f"不認得的設定：{', '.join(sorted(bad))}")
    if "people" in meta:
        ppl = meta["people"]
        if (not isinstance(ppl, list) or len(ppl) != 2
                or not all(isinstance(p, dict) and p.get("id") and str(p.get("name", "")).strip()
                           for p in ppl)):
            raise ApiError("成員要剛好兩位，名字不能空白")
    if "categories" in meta:
        cats = meta["categories"]
        if not (isinstance(cats, dict) and isinstance(cats.get("expense"), list)
                and isinstance(cats.get("income"), list) and cats["expense"]):
            raise ApiError("分類格式不對")
    if "budgets" in meta and not all(
            isinstance(v, (int, float)) and v >= 0 for v in meta["budgets"].values()):
        raise ApiError("預算要是 0 以上的數字")
    return {"meta": db().merge_meta(meta)}


# ---- 手機 app（PWA 靜態檔）---------------------------------------------------
@app.get("/api/{rest:path}")
def api_404(rest: str):
    return JSONResponse({"error": f"no such endpoint: /api/{rest}"}, status_code=404)


@app.get("/{path:path}")
def spa(path: str):
    """dist 裡有的檔案直接給；其他網址都回 index.html（app 自己處理畫面）。"""
    root = DIST.resolve()
    target = (root / path).resolve() if path else root / "index.html"
    if path and target.is_file() and root in target.parents:
        cache = ("public, max-age=31536000, immutable" if path.startswith("assets/")
                 else "no-cache")
        return FileResponse(target, headers={"Cache-Control": cache})
    index = root / "index.html"
    if not index.is_file():
        return Response("web/dist 還沒 build（cd web && bun run build）", status_code=503)
    return FileResponse(index, headers={"Cache-Control": "no-cache"})
