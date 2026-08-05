"""📊 總覽 — 當月狀態 + 誰欠誰 + 最近記錄"""
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from lib import analytics
from lib.api import ApiError
from ui._shared import (EXPENSE_C, INCOME_C, MS, NET_C, S, empty_hint,
                        fetch_rates, load, person_colors, person_view, refresh, sym)


def _fmt(v: float) -> str:
    return f"CA&#36;{v:,.2f}"  # HTML 語境用 &#36; 避免 markdown 把 $ 當 LaTeX


def duo_settlement_html(s: dict, people: list, names: dict,
                        colors: dict, subtitle: str) -> str:
    p1, p2 = people[0], people[1]
    sides = []
    for p in (p1, p2):
        sides.append(
            f'<div class="duo-side" style="--pc:{colors[p["id"]]}">'
            f'<div class="duo-name">{names[p["id"]]}</div>'
            f'<div class="duo-paid">{_fmt(s["paid"][p["id"]])}</div>'
            f'<div class="duo-sub">已付</div></div>')
    diff = s["balance"][p1["id"]]
    if abs(diff) < 0.005:
        mid_main = '<div class="duo-even">兩不相欠 🎉</div>'
    else:
        debtor, creditor = (p2, p1) if diff > 0 else (p1, p2)
        mid_main = (f'<div class="duo-verdict">{names[debtor["id"]]} 要給 '
                    f'{names[creditor["id"]]}</div>'
                    f'<div class="duo-amt">{_fmt(abs(diff))}</div>')
    adv = s.get("advance_total", 0.0)
    adv_txt = f'　代墊 {_fmt(adv)}' if adv > 0.005 else ""
    mid = (f'<div class="duo-mid">{mid_main}'
           f'<div class="duo-sub">{subtitle}　共同開銷 {_fmt(s["total"])}{adv_txt}</div></div>')
    return f'<div class="duo-card">{sides[0]}{mid}{sides[1]}</div>'

st.title("📊 總覽")

ctx = load()
if ctx:
    client, df, cdf, meta, names = (ctx["client"], ctx["df"], ctx["cdf"],
                                    ctx["meta"], ctx["names"])
    sub = person_view(cdf, meta, key="ov_view")
    if not empty_hint(sub):
        months = sorted(sub["month"].unique(), reverse=True)
        month = st.selectbox("月份", months, index=0)

        msum = analytics.monthly_summary(sub, last_n=10 ** 6)
        row = msum[msum["month"] == month]
        cur = row.iloc[0] if not row.empty else {"income": 0, "expense": 0, "net": 0}
        idx = msum.index[msum["month"] == month]
        prev = msum.iloc[idx[0] - 1] if len(idx) and idx[0] > 0 else None

        c1, c2, c3 = st.columns(3)
        c1.metric("本月支出", f"{S}{cur['expense']:,.0f}",
                  delta=(f"{cur['expense'] - prev['expense']:+,.0f}" if prev is not None else None),
                  delta_color="inverse")
        c2.metric("本月收入", f"{S}{cur['income']:,.0f}",
                  delta=(f"{cur['income'] - prev['income']:+,.0f}" if prev is not None else None))
        c3.metric("本月淨存", f"{S}{cur['net']:,.0f}")

        col_l, col_r = st.columns([3, 2])
        with col_l:
            st.subheader("📈 月度收支")
            m12 = analytics.monthly_summary(sub, last_n=12)
            fig = go.Figure()
            fig.add_bar(x=m12["month"], y=m12["income"], name="收入",
                        marker_color=INCOME_C, opacity=0.85)
            fig.add_bar(x=m12["month"], y=m12["expense"], name="支出",
                        marker_color=EXPENSE_C, opacity=0.85)
            fig.add_scatter(x=m12["month"], y=m12["net"], name="淨存",
                            mode="lines+markers", line=dict(color=NET_C))
            fig.update_layout(barmode="group", margin=dict(l=20, r=20, t=10, b=20),
                              legend=dict(orientation="h", y=1.1), height=320,
                              xaxis=dict(type="category"))  # 月資料別被當日期軸展開
            st.plotly_chart(fig, width="stretch")
        with col_r:
            st.subheader(f"🧾 {month} 分類")
            bd = analytics.category_breakdown(sub, month=month)
            if bd.empty:
                st.caption("這個月沒有支出記錄")
            else:
                pie = px.pie(bd, names="category", values="amount", hole=0.4)
                pie.update_layout(margin=dict(l=20, r=20, t=10, b=20), height=320)
                st.plotly_chart(pie, width="stretch")

        st.subheader("🤝 誰欠誰（共同開銷對半，CAD 結算）")
        s_month = analytics.settlement(cdf, meta["people"], month=month)
        s_all = analytics.settlement(cdf, meta["people"])
        if len(meta["people"]) >= 2:
            st.markdown(duo_settlement_html(s_month, meta["people"], names,
                                            person_colors(meta), month),
                        unsafe_allow_html=True)
            st.markdown(f'<div class="duo-foot">累計：{s_all["msg"]}　'
                        + "　".join(f'{names[pid]} 已付 {_fmt(amt)}'
                                    for pid, amt in s_all["paid"].items())
                        + "</div>", unsafe_allow_html=True)
        else:
            st.success(f"**{month}**：{s_month['msg']}　（共同開銷 {MS}{s_month['total']:,.2f}）")
        foreign = sorted(set(df["currency"]) - {"CAD"})
        if foreign:
            rates = fetch_rates()
            st.caption("外幣已按匯率換算（每日更新）：" + "　".join(
                f"{c}→CAD {rates.get(c, 1.0):.3f}" for c in foreign))

        st.subheader("🕘 最近記錄")
        recent = df.sort_values(["date", "created_ts"], ascending=False).head(20).copy()
        recent["人"] = recent["person"].map(names).fillna(recent["person"])
        recent["日期"] = recent["date"].dt.strftime("%m/%d")
        recent["金額"] = recent.apply(
            lambda r: f"{'+' if r['type'] == 'income' else '-'}{sym(r['currency'])}{r['amount']:,.2f}",
            axis=1)
        recent["共同"] = recent["split"].map({"half": "👫", "advance": "🤝", "own": ""})
        st.dataframe(recent[["日期", "人", "category", "item", "金額", "共同", "note"]],
                     width="stretch", hide_index=True,
                     column_config={"category": "分類", "item": "品項", "note": "備註"})

        with st.expander("刪除某一筆（記錯用）"):
            labels = {r["id"]: f"{r['日期']} {r['人']} {r['item']} {r['金額']}"
                      for _, r in recent.iterrows()}
            target = st.selectbox("選一筆", list(labels), format_func=labels.get)
            if st.button("🗑️ 確定刪除", type="secondary"):
                try:
                    client.delete_txn(target)
                    st.session_state["flash"] = "刪掉了"
                    refresh()
                except ApiError as e:
                    st.error(f"刪除失敗：{e}")
