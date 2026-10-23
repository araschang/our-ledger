# 💰 我們的記帳本

兩人共同開銷＋收支記帳。**Google Sheet 當資料庫**（單一 Transactions 表，不分月）、**Streamlit 當前端**、**Apple Shortcut 手機快記**。

```
手機捷徑 ──POST──┐
                  ├─→ Apps Script API ─→ Google Sheet（唯一資料來源）
Streamlit 網站 ──┘        (Code.gs)
（記帳＋儀表板）
```

## 功能

- 兩人（Diana/Aras）各自記帳，手機捷徑 10 秒記一筆（支援 Siri）
- 儀表板：月度收支趨勢、分類佔比、視角切換（個人/綜合）、誰欠誰（共同開銷對半結算）
- 分類、成員名稱可在網站「設定」頁改，存回 Sheet 兩人同步
- 幣別 CAD

## 檔案

| 路徑 | 說明 |
|---|---|
| `streamlit_app.py` | 網站本體（記一筆／儀表板／設定） |
| `lib/api.py`・`lib/analytics.py` | Apps Script client／統計計算 |
| `apps_script/Code.gs` | 貼進 Google Sheet 的 API 層 |
| `lib/pg.py` | Postgres 後端（介面同 GasClient） |
| `api/server.py` | 自架時給手機捷徑打的 endpoint |
| `tools/import_sheet.py` | 一次性：Sheet → Postgres 搬家 |
| `tests/mock_gas.py` | 本機假後端（開發用） |
| `docs/setup-guide.md` | 部署步驟（Sheet → Streamlit Cloud → 捷徑） |
| `docs/shortcut-setup.md` | iPhone 捷徑建立教學 |

## 部署

兩種後端擇一（`ui/_shared.py` 的 `get_client()` 依 secrets/環境變數自動選）：

- **Google Sheet + Streamlit Cloud**：照 [docs/setup-guide.md](docs/setup-guide.md) 三步驟。
- **自架 Postgres**（目前使用）：設了 `DATABASE_URL` 就改用 Postgres（`lib/pg.py`，表會自動建立）。
  `Dockerfile` 同一個 image 跑網站和捷徑 API（`python -m api.server`，協定跟 `Code.gs` 一樣，捷徑只換 URL＋token）。
  部署設定在 `~/homelab/ledger/compose.yaml`；從 Sheet 搬資料用 `python -m tools.import_sheet`。
