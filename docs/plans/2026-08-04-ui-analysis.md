# UI 重構（仿 awm-web）＋分析功能

日期：2026-08-04　預估：90min　參考範例：~/awm（st.navigation 多頁 + plotly + mobile CSS）

## 目標

1. 版面照 awm 套路：st.navigation 側邊欄多頁、layout="wide"、plotly 圖表、手機 CSS
2. 新增分析頁（兩人記帳的實用分析，不做過度工程）：
   - 總覽（原儀表板強化）
   - 分類分析：逐月分類堆疊、分類×人、地點 Top、大額支出 Top
   - 收支趨勢：累積淨存、儲蓄率、12 月收支
3. 資料層（GAS API）完全不動——純前端改造

## 結構

```
streamlit_app.py   # 入口：auth + st.navigation
ui/_shared.py      # 資料載入/快取/幣別/共用元件
ui/record.py       # ✍️ 記一筆
ui/overview.py     # 📊 總覽
ui/categories.py   # 🧾 分類分析
ui/trends.py       # 📈 收支趨勢
ui/settings.py     # ⚙️ 設定
lib/analytics.py   # 加：category_monthly / cumulative_net / weekday_pattern / top_expenses / by_location
```

## 驗收條件

- [ ] 本機 mock（多月 seed 資料）五頁全部渲染無 exception
- [ ] 新分析函式數字用手算 seed 對照
- [ ] 空資料集所有頁不噴錯
- [ ] 記一筆流程回歸（新增後總覽反映）
- [ ] fresh-context agent 驗收 PASS
- [ ] push（Streamlit Cloud 自動部署）

## 迭代日誌
