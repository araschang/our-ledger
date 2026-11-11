# 💰 我們的記帳本

Diana 和 Aras 的共同開銷＋收支記帳（CAD）。自架在 mbp，只有 tailnet 連得到。

```
iPhone（加到主畫面的 app）──┐                       ┌─ Postgres `ledger`
                             ├─→ ledger-web（FastAPI）┤   （transactions、meta）
iPhone 捷徑（Siri 記帳）────→ ledger-api ─────────────┘
```

## 新版（2026-11）

- **手機 app**：`web/` 是 React + Vite + Tailwind 的 PWA，介面照 Apple 的 iOS 設計規範（大標題、分組清單、頁面卡片、SF 圓體數字、系統色，深色模式是 Apple 那組）。打開就是數字鍵盤：打金額 → 點分類
  → 記下來（品項可不填，選了分類會列出常記的品項）。平分/自己/代墊記住「這個人上次在這個分類怎麼選」。
  明細點一下修改、左滑刪除（整個滑過去直接刪），刪錯、記錯都有「復原」。
- **離線也能記**：先存在手機上（標「待上傳」），連上網自動送出；新增的 id 由手機產生，
  重送不會重複。資料也存在手機上，打開不用等網路。
- **總覽**：本月共同開銷、誰欠誰＋**結清**（記一筆「誰付給誰」，抵掉累計欠款）、預算（快超、超支排前面，
  有「這個月過了幾成」的刻度）、花在哪、每月支出。
- **報表**：損益表（這個月還沒過完時跟上月**同期**比）、分類（最近 6 個月、兩人各負擔多少、大額支出）、
  趨勢（累積淨存、儲蓄率、星期幾）；可以看兩人合計或某一個人自己負擔的部分。
- **設定**：這支手機是誰、打開先看哪、深淺色；兩人共用的名字、分類（排順序）、固定支出、預算；匯出 CSV。
- 記美金/台幣：網站和捷徑都在**記帳當下**換成 CAD（原幣和匯率寫在備註），報表不會跟著匯率跑。

## 檔案

| 路徑 | 說明 |
|---|---|
| `web/` | 手機 app（`src/screens/` 各畫面、`src/lib/analytics.ts` 統計、`src/lib/store.ts` 同步/離線） |
| `server/app.py` | 新版後端：JSON API（`/api/data`、`/api/transactions`、`/api/meta`）＋提供 PWA |
| `api/server.py` | 手機捷徑的 endpoint（協定同 `apps_script/Code.gs`，捷徑不用改） |
| `lib/pg.py`・`lib/fx.py` | Postgres 存取、匯率 |
| `lib/analytics.py` | Python 版統計（舊版網站用；也是新版 TS 統計的標準答案） |
| `streamlit_app.py`・`ui/` | 舊版 Streamlit 網站（備用，`ledger-old`） |
| `tools/lock_fx_history.py` | 一次性：舊的美金帳用當天匯率鎖成 CAD |
| `deploy/` | `compose.yaml`（放到 `~/homelab/ledger/`）、`switch.sh`（換新版／`--rollback` 換回） |
| `tests/` | 後端 API 測試、golden（Python 算答案給 TS 對） |

## 開發

```bash
# 後端（接一個測試用的資料庫）
DATABASE_URL=postgresql://... WEB_DIST=web/dist .venv/bin/uvicorn server.app:app --port 8510
# 前端（/api 轉到 8510）
cd web && bun install && bun run dev
# 測試
cd web && bun test && bun run typecheck          # TS 統計 vs Python 答案、型別
TEST_DATABASE_URL=postgresql://.../ledger_t PYTHONPATH=. .venv/bin/pytest -q tests/test_app.py
python tests/golden/synth.py web/tests/fixtures/synth.json   # 改了統計規則時重算答案：
PYTHONPATH=. python tests/golden/make_golden.py web/tests/fixtures/synth.json web/tests/fixtures/synth.golden.json
# 手機尺寸的整套操作測試（headless Chrome；只能對測試資料庫跑，會新增/刪除 E2E 開頭的帳）
cd web/e2e && PROFILE=$(mktemp -d) bun flow.ts /tmp/shots
```

## 部署

`~/homelab/ledger/compose.yaml`（內容同 `deploy/compose.yaml`）：`ledger-web`（新版網站，127.0.0.1:8501 →
tailnet :8011）、`ledger-api`（捷徑，8502 → :8012），同一個 image（`Dockerfile.app`）。
換版：`bash deploy/switch.sh`（先備份資料庫和 compose）；換回舊版：`bash deploy/switch.sh --rollback`。
舊的 Google Sheet＋Streamlit Cloud 做法見 [docs/setup-guide.md](docs/setup-guide.md)（已不用）。
