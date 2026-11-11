"""新版後端 API 測試：連一個測試用 Postgres（TEST_DATABASE_URL），每個測試前清空。

跑法：TEST_DATABASE_URL=postgresql://ledger:test@127.0.0.1:55432/ledger_t .venv/bin/pytest -q tests/test_app.py
"""
import os

import psycopg
import pytest
from fastapi.testclient import TestClient

DSN = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="TEST_DATABASE_URL not set")
H = {"X-Ledger": "1"}


@pytest.fixture()
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", DSN)
    (tmp_path / "index.html").write_text("<html>app</html>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "a.js").write_text("x")
    monkeypatch.setenv("WEB_DIST", str(tmp_path))
    from lib import fx
    monkeypatch.setattr(fx, "rates", lambda: {"CAD": 1.0, "USD": 1.4, "TWD": 0.05})
    import importlib
    import server.app as app_mod
    importlib.reload(app_mod)
    with psycopg.connect(DSN) as conn:
        app_mod.db().get_all()  # 建表
        conn.execute("DELETE FROM transactions")
        conn.execute("DELETE FROM meta")
    return TestClient(app_mod.app)


def txn(**kw):
    t = {"date": "2026-11-10", "person": "aras", "type": "expense", "category": "買菜",
         "item": "Costco", "amount": 12.5, "split": "half"}
    t.update(kw)
    return t


def test_add_and_list(client):
    r = client.post("/api/transactions", json=txn(), headers=H)
    assert r.status_code == 200, r.text
    got = r.json()["txn"]
    assert got["amount"] == 12.5 and got["split"] == "half" and got["shared"] is True
    assert got["created_at"] and len(got["id"]) >= 8
    data = client.get("/api/data").json()
    assert [t["id"] for t in data["transactions"]] == [got["id"]]
    assert data["rates"]["CAD"] == 1.0


def test_requires_header(client):
    r = client.post("/api/transactions", json=txn())
    assert r.status_code == 403
    assert client.get("/api/data").status_code == 200


def test_same_id_twice_is_one_row(client):
    a = client.post("/api/transactions", json=txn(id="abc123def4567890"), headers=H).json()
    b = client.post("/api/transactions", json=txn(id="abc123def4567890", amount=99),
                    headers=H).json()
    assert a["created"] is True and b["created"] is False
    assert b["txn"]["amount"] == 12.5  # 第二次不覆蓋
    assert len(client.get("/api/data").json()["transactions"]) == 1


def test_usd_locked_to_cad(client):
    got = client.post("/api/transactions", json=txn(currency="USD", amount=10, note="tip"),
                      headers=H).json()["txn"]
    assert got["currency"] == "CAD" and got["amount"] == 14.0
    assert got["note"] == "原幣 US$10.00 @1.4000｜tip"


def test_update_keeps_created_at(client):
    a = client.post("/api/transactions", json=txn(), headers=H).json()["txn"]
    r = client.put(f"/api/transactions/{a['id']}", json=txn(item="T&T", amount=20, split="own"),
                   headers=H)
    b = r.json()["txn"]
    assert b["item"] == "T&T" and b["amount"] == 20 and b["split"] == "own"
    assert b["created_at"] == a["created_at"]


def test_update_missing_is_404(client):
    r = client.put("/api/transactions/nope", json=txn(), headers=H)
    assert r.status_code == 404


def test_delete_idempotent(client):
    a = client.post("/api/transactions", json=txn(), headers=H).json()["txn"]
    assert client.delete(f"/api/transactions/{a['id']}", headers=H).json()["deleted"] is True
    assert client.delete(f"/api/transactions/{a['id']}", headers=H).json()["deleted"] is False


def test_undo_restores_same_row(client):
    a = client.post("/api/transactions", json=txn(), headers=H).json()["txn"]
    client.delete(f"/api/transactions/{a['id']}", headers=H)
    b = client.post("/api/transactions", json={**txn(), "id": a["id"],
                                               "created_at": a["created_at"]},
                    headers=H).json()["txn"]
    assert b["id"] == a["id"] and b["created_at"] == a["created_at"]


def test_income_and_settle_rules(client):
    inc = client.post("/api/transactions",
                      json=txn(type="income", category="薪資", split="half"), headers=H).json()
    assert inc["txn"]["split"] == "own"
    st = client.post("/api/transactions",
                     json=txn(type="settle", category="", item="", split="half"), headers=H).json()
    assert st["txn"]["category"] == "結清" and st["txn"]["item"] == "結清"
    assert st["txn"]["split"] == "own"


def test_validation(client):
    assert client.post("/api/transactions", json=txn(amount=0), headers=H).status_code == 422
    assert client.post("/api/transactions", json=txn(date="11/10"), headers=H).status_code == 422
    assert client.post("/api/transactions", json=txn(category=" "), headers=H).status_code == 400
    assert client.post("/api/transactions", json=txn(split="x"), headers=H).status_code == 422


def test_meta_merge(client):
    r = client.put("/api/meta", json={"budgets": {"買菜": 350}}, headers=H)
    assert r.json()["meta"] == {"budgets": {"買菜": 350}}
    r = client.put("/api/meta", json={"fixed_categories": ["居住"]}, headers=H)
    assert r.json()["meta"] == {"budgets": {"買菜": 350}, "fixed_categories": ["居住"]}
    assert client.put("/api/meta", json={"evil": 1}, headers=H).status_code == 400
    assert client.put("/api/meta", json={"people": [{"id": "a", "name": ""}]},
                      headers=H).status_code == 400


def test_etag_304(client):
    r = client.get("/api/data")
    r2 = client.get("/api/data", headers={"If-None-Match": r.headers["etag"]})
    assert r2.status_code == 304


def test_health_and_static(client):
    assert client.get("/healthz").text == "ok"
    assert client.get("/_stcore/health").status_code == 200
    assert client.get("/").text == "<html>app</html>"
    assert client.get("/overview").text == "<html>app</html>"  # SPA fallback
    r = client.get("/assets/a.js")
    assert r.text == "x" and "immutable" in r.headers["cache-control"]
    assert client.get("/api/nope").status_code == 404
    assert client.get("/../../etc/passwd").text == "<html>app</html>"


def test_legacy_shortcut_add_locks_usd(client):
    from lib.pg import PgClient
    got = PgClient(DSN).add_txn({"person": "diana", "category": "其他", "item": "x",
                                 "amount": "5", "shared": "false", "currency": "USD"})
    row = [t for t in got["transactions"] if t["item"] == "x"][0]
    assert row["currency"] == "CAD" and row["amount"] == 7.0 and row["split"] == "own"


# ---- review 2026-11-11 找到的問題 ---------------------------------------------

def test_legacy_odd_id_can_be_edited_deleted_restored(client):
    from lib.pg import PgClient
    PgClient(DSN).add_txn({"id": "7.3061e+89", "person": "diana", "category": "交通", "item": "加油",
                           "amount": 41.16, "shared": "true", "date": "2026-08-09"})
    from urllib.parse import quote
    url = f"/api/transactions/{quote('7.3061e+89', safe='')}"
    r = client.put(url, json=txn(id="7.3061e+89", item="加油站", amount=41.16, person="diana",
                                 category="交通", date="2026-08-09"), headers=H)
    assert r.status_code == 200, r.text
    old = r.json()["txn"]
    assert old["item"] == "加油站"
    assert client.delete(url, headers=H).json()["deleted"] is True
    r = client.post("/api/transactions", json={**txn(item="加油站", amount=41.16, person="diana",
                                                     category="交通", date="2026-08-09"),
                                               "id": "7.3061e+89", "created_at": old["created_at"]},
                    headers=H)
    assert r.status_code == 200 and r.json()["txn"]["id"] == "7.3061e+89"


def test_update_keeps_fields_not_sent(client):
    from lib.pg import PgClient
    PgClient(DSN).add_txn({"id": "loc1", "person": "aras", "category": "外食", "item": "x",
                           "amount": 5, "location": "Richmond", "date": "2026-11-01"})
    body = txn(item="y", amount=6)
    body.pop("split")
    got = client.put("/api/transactions/loc1", json=body, headers=H).json()["txn"]
    assert got["location"] == "Richmond" and got["item"] == "y" and got["split"] == "own"


def test_bad_text_is_400_not_503(client):
    r = client.post("/api/transactions", json=txn(item="a\x00b"), headers=H)
    assert r.status_code == 200 and r.json()["txn"]["item"] == "ab"  # NUL 直接拿掉
    assert client.put("/api/meta", json={"budgets": [1, 2]}, headers=H).status_code == 400
    assert client.put("/api/meta", json={"budgets": {"x": True}}, headers=H).status_code == 400
    assert client.put("/api/meta", json={"categories": {"expense": [""], "income": []}},
                      headers=H).status_code == 400


def test_missing_asset_is_404(client):
    r = client.get("/assets/old-build-123.js")
    assert r.status_code == 404 and "immutable" not in r.headers.get("cache-control", "")
    assert client.get("/favicon.ico").status_code == 404
    assert client.get("/reports").status_code == 200  # 一般網址還是回 app


def test_foreign_currency_prefix_not_doubled(client):
    a = client.post("/api/transactions", json=txn(currency="USD", amount=10, note="tip"),
                    headers=H).json()["txn"]
    b = client.put(f"/api/transactions/{a['id']}", json=txn(currency="USD", amount=20, note=a["note"]),
                   headers=H).json()["txn"]
    assert b["note"] == "原幣 US$20.00 @1.4000｜tip" and b["amount"] == 28.0


def test_user_note_starting_with_yuanbi_is_kept(client):
    got = client.post("/api/transactions", json=txn(currency="USD", amount=10, note="原幣是台幣，記錯了"),
                      headers=H).json()["txn"]
    assert got["note"] == "原幣 US$10.00 @1.4000｜原幣是台幣，記錯了"
