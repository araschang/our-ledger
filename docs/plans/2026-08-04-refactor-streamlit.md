# our-ledger 重構計畫 — Streamlit + Google Sheet

日期：2026-08-04　預估：120min
決策：用 aras 的帳號（GitHub `araschang`、Google、Streamlit Cloud）

## 架構

- **資料庫**：單一 Google Spreadsheet，兩張 tab：`Transactions`（一張到底，不分月）、`Meta`（分類/成員/設定，key-value JSON）
- **API 層**：Google Apps Script Web App（薄層：token 驗證 + CRUD）。Streamlit 和 Apple Shortcut **都走這一個 endpoint**——不用 service account，省掉 Google Cloud console 整套設定。取捨：每次讀寫多 ~1s 延遲，用 60s 快取蓋掉；這個資料量（年幾千筆）完全無感。
- **前端**：Streamlit（記帳表單 + 儀表板），部署 Streamlit Community Cloud，secrets 放 webhook URL/token/app 密碼
- **手機快記**：Apple Shortcut → POST webhook，person 各自寫死

## Schema（Transactions）

`id, created_at, date, person(aya|aras), type(expense|income), category, item, amount, note, location, shared(TRUE|FALSE), source(web|shortcut)`

分帳邏輯：只看 `type=expense AND shared=TRUE`，兩人對半，差額 = 誰欠誰。

## 子任務

1. ✅ 計畫落檔
2. Apps Script 重寫（apps_script/Code.gs）
3. Python 層：lib/api.py（GAS client）、lib/analytics.py（pandas 統計）
4. streamlit_app.py：記一筆 / 儀表板 / 設定
5. tests/mock_gas.py：本機模擬 GAS 的 HTTP server（開發與驗收用）
6. 文件：setup-guide.md（Sheet+Apps Script+Streamlit Cloud 部署）、shortcut-setup.md（兩人的 iPhone 安裝步驟）
7. 驗收：派 fresh-context agent 實跑（mock + streamlit headless + 邊界輸入）
8. 交付：push 到 araschang/our-ledger（新 remote，Diana 的 repo 不動）

## 驗收條件

- [ ] mock server + streamlit 本機跑起來，UI 新增一筆 → mock store 有、最近記錄出現
- [ ] 統計數字對：造 seed 資料，月度收支/分類/settlement 手算 = 程式輸出
- [ ] 空資料集：儀表板不噴錯
- [ ] 錯 token：顯示連線錯誤不 crash
- [ ] Code.gs 語法過（node --check）
- [ ] push 完成，文件齊

## 迭代日誌

（失敗記這裡：第N輪:假設X→結果Y）
