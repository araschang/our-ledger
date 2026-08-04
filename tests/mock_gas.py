"""模擬 Google Apps Script Web App 的本機 server，開發/驗收用。

用法：python tests/mock_gas.py [port]（預設 8765，token 固定 "test"）
行為對齊 apps_script/Code.gs：GET 回全量、POST 支援 add/update/delete/meta。
資料存記憶體，關掉就沒了。
"""
import json
import sys
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

TOKEN = "test"
STORE = {"transactions": [], "meta": {}}


def ok():
    return {"ok": True, "transactions": STORE["transactions"], "meta": STORE["meta"]}


class Handler(BaseHTTPRequestHandler):
    def _send(self, obj):
        body = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        if TOKEN and qs.get("token", [""])[0] != TOKEN:
            return self._send({"ok": False, "error": "bad token"})
        self._send(ok())

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return self._send({"ok": False, "error": "bad json"})
        if TOKEN and body.get("token") != TOKEN:
            return self._send({"ok": False, "error": "bad token"})

        action = body.get("action")
        txns = STORE["transactions"]
        if action == "add":
            t = body.get("txn") or {}
            t.setdefault("id", uuid.uuid4().hex[:8])
            t.setdefault("created_at", datetime.now().strftime("%Y-%m-%dT%H:%M:%S"))
            t.setdefault("date", t["created_at"][:10])
            txns.append(t)
        elif action == "update":
            t = body.get("txn") or {}
            idx = next((i for i, x in enumerate(txns) if x["id"] == t.get("id")), -1)
            if idx < 0:
                return self._send({"ok": False, "error": f"id not found: {t.get('id')}"})
            txns[idx] = t
        elif action == "delete":
            STORE["transactions"] = [x for x in txns if x["id"] != body.get("id")]
        elif action == "meta":
            STORE["meta"] = body.get("meta") or {}
        else:
            return self._send({"ok": False, "error": f"unknown action: {action}"})
        self._send(ok())

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"mock GAS on http://127.0.0.1:{port}  (token: {TOKEN})")
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
