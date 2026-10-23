"""手機捷徑的 HTTP endpoint（取代 Apps Script Web App），自架時跟網站一起跑。

協定跟 apps_script/Code.gs 一模一樣，捷徑只要換 URL：
  GET  ?token=...             → { ok, transactions, meta }
  POST { token, action, ... } → action = add / update / delete / meta
  GET  /healthz               → 監控用（不需 token、不回資料）
環境變數：DATABASE_URL、LEDGER_TOKEN（必填）、PORT（預設 8502）
用法：python -m api.server
"""
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from lib.api import ApiError
from lib.pg import PgClient

TOKEN = os.environ.get("LEDGER_TOKEN", "")
MAX_BODY = 64 * 1024


def token_ok(t) -> bool:
    return hmac.compare_digest(str(t or "").encode(), TOKEN.encode())


class Handler(BaseHTTPRequestHandler):
    client: PgClient  # 啟動時設定

    def _send(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        try:
            if url.path == "/healthz":
                self.client.get_all()
                return self._send({"ok": True})
            if not token_ok(parse_qs(url.query).get("token", [""])[0]):
                return self._send({"ok": False, "error": "bad token"})
            self._send(self.client.get_all())
        except ApiError as e:
            self._send({"ok": False, "error": str(e)}, 503 if url.path == "/healthz" else 200)

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self._send({"ok": False, "error": "body too large"}, 413)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            return self._send({"ok": False, "error": "bad json"})
        if not isinstance(body, dict) or not token_ok(body.get("token")):
            return self._send({"ok": False, "error": "bad token"})

        action = body.get("action")
        try:
            if action == "add":
                data = self.client.add_txn(body.get("txn") or {})
            elif action == "update":
                data = self.client.update_txn(body.get("txn") or {})
            elif action == "delete":
                data = self.client.delete_txn(body.get("id"))
            elif action == "meta":
                data = self.client.save_meta(body.get("meta") or {})
            else:
                return self._send({"ok": False, "error": f"unknown action: {action}"})
        except ApiError as e:
            return self._send({"ok": False, "error": str(e)})
        self._send(data)

    def log_message(self, fmt, *args):
        # 不印 query string（GET 的 token 在裡面）
        print(f"{self.address_string()} {self.command} {urlparse(self.path).path} "
              f"{args[1] if len(args) > 1 else ''}", flush=True)


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("LEDGER_TOKEN 沒設定：拒絕啟動（不然誰都能寫帳本）")
    Handler.client = PgClient(os.environ["DATABASE_URL"])
    port = int(os.environ.get("PORT", "8502"))
    print(f"ledger api on :{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
