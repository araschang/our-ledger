# 部署指南（一次做完，之後就不用碰）

架構：**Google Sheet = 資料庫**，上面掛一支 Apps Script 當 API；**Streamlit = 網站**（記帳＋看報表）；**Apple Shortcut = 手機快記**。三步驟：A 拿到 API 網址 → B 部署網站 → C 裝捷徑。

---

## A. Google Sheet + Apps Script（資料庫與 API）

1. 用**你的 Google 帳號**開一個新試算表（名字隨意，例如「我們的記帳本」）
   - 網址長這樣：`https://docs.google.com/spreadsheets/d/【這段就是ID】/edit`，把 ID 記下來
2. 試算表上方選單 **擴充功能 → Apps Script**
3. 刪掉預設內容，貼上本 repo 的 [`apps_script/Code.gs`](../apps_script/Code.gs) 全文
4. 改最上面兩行：
   ```js
   const SHEET_ID = '你的試算表ID';
   const TOKEN = '自己取一組密碼';   // 例：一串亂碼，之後要填兩個地方
   ```
5. 💾 存檔 → 右上 **部署 → 新增部署**
   - 類型（⚙️）：**網頁應用程式**
   - Execute as：**Me** ／ Who has access：**Anyone**
   - 第一次會要授權：選你的帳號 → 進階 → 前往（不安全）→ 允許（自己寫的腳本，正常流程）
6. 複製 **Web app URL**（結尾 `/exec`）——下面 B、C 都要用

> 之後若改了 Code.gs：部署 → 管理部署 → ✏️ → 版本選 **New version** → 部署（網址不變）。
> Transactions / Meta 兩張 tab 會在第一次寫入時自動建立，不用手動開。

## B. Streamlit Cloud（網站）

1. 到 <https://share.streamlit.io> 用 **GitHub（araschang）** 登入
2. **Create app → Deploy a public app from GitHub**
   - Repository：`araschang/our-ledger`　Branch：`main`　Main file：`streamlit_app.py`
   - App URL 取個好記的子網域
3. **Advanced settings → Secrets** 貼：
   ```toml
   GAS_URL = "步驟A拿到的 /exec 網址"
   GAS_TOKEN = "跟 Code.gs 一樣的密碼"
   APP_PASSWORD = "網站登入密碼（兩人共用；不想設就留空字串）"
   ```
4. **Deploy**，等一分鐘就有網址了。手機瀏覽器打開 → 分享 → **加入主畫面**，用起來像 app

> 注意：Community Cloud 上的 app 是公開網址，靠 `APP_PASSWORD` 擋人，建議要設。

## C. iPhone 捷徑

見 [`shortcut-setup.md`](shortcut-setup.md)，兩人各裝一份（只差 person 那一格）。

---

## 本機開發（可選）

```bash
cd ~/our-ledger
uv venv && uv pip install -r requirements.txt
python tests/mock_gas.py &                 # 假後端，port 8765、token "test"
.venv/bin/streamlit run streamlit_app.py   # 畫面上填 http://127.0.0.1:8765 + test
```
