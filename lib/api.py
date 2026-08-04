"""Apps Script Web App 的 client。所有讀寫都走這裡。"""
import requests

TIMEOUT = 30


class ApiError(Exception):
    pass


class GasClient:
    def __init__(self, url: str, token: str = ""):
        self.url = url.strip()
        self.token = token

    def _check(self, resp: requests.Response) -> dict:
        try:
            data = resp.json()
        except ValueError:
            raise ApiError(f"後端回應不是 JSON（HTTP {resp.status_code}）")
        if not data.get("ok"):
            raise ApiError(data.get("error", "unknown error"))
        return data

    def get_all(self) -> dict:
        """回 {'transactions': [...], 'meta': {...}}"""
        sep = "&" if "?" in self.url else "?"
        resp = requests.get(f"{self.url}{sep}token={self.token}", timeout=TIMEOUT)
        return self._check(resp)

    def _post(self, payload: dict) -> dict:
        payload["token"] = self.token
        # Apps Script 對 POST 會 302 轉址，requests 預設會跟隨，直接用即可
        resp = requests.post(self.url, json=payload, timeout=TIMEOUT)
        return self._check(resp)

    def add_txn(self, txn: dict) -> dict:
        return self._post({"action": "add", "txn": txn})

    def update_txn(self, txn: dict) -> dict:
        return self._post({"action": "update", "txn": txn})

    def delete_txn(self, txn_id: str) -> dict:
        return self._post({"action": "delete", "id": txn_id})

    def save_meta(self, meta: dict) -> dict:
        return self._post({"action": "meta", "meta": meta})
