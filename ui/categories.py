"""🧾 分類分析 — 逐月分類、兩人比較、大額支出"""
import plotly.express as px
import streamlit as st

from lib import analytics
from ui._shared import (S, cat_detail, empty_hint, load, person_colors,
                        person_view, sym)

st.title("🧾 分類分析")

ctx = load()
if ctx:
    df, cdf, meta, names = ctx["df"], ctx["cdf"], ctx["meta"], ctx["names"]
    colors = person_colors(meta)
    sub = person_view(cdf, meta, key="cat_view")
    if not empty_hint(sub):
        with st.container(border=True, key="card_catm"):
            st.markdown('<div class="card-title">📚 逐月分類（最近 6 個月）</div>',
                        unsafe_allow_html=True)
            cm = analytics.category_monthly(sub, last_n=6)
            if cm.empty:
                st.caption("沒有支出記錄")
            else:
                # 每個月各分類佔該月支出的比例：標在長條上、hover 也看得到
                cm = cm.copy()
                cm["share"] = cm["amount"] / cm.groupby("month")["amount"].transform("sum")
                # 太細的段落標了會疊在一起，佔比 <10% 就留白（hover 還是看得到）
                cm["label"] = [f"{s:.0%}" if s >= 0.10 else ""
                               for s in cm["share"]]
                fig = px.bar(cm, x="month", y="amount", color="category",
                             barmode="stack", text="label",
                             custom_data=["category", "share"])
                fig.update_traces(
                    textposition="inside", insidetextanchor="middle",
                    textfont_size=11,
                    hovertemplate=("月份：%{x}<br>分類：%{customdata[0]}"
                                   "<br>金額：CA$%{y:,.2f}"
                                   "<br>佔比：%{customdata[1]:.1%}<extra></extra>"))
                fig.update_layout(margin=dict(l=20, r=20, t=10, b=20), height=360,
                                  xaxis_title="", yaxis_title=f"支出（{S}）",
                                  legend=dict(orientation="h", y=-0.15),
                                  legend_title_text="",
                                  uniformtext=dict(mode="hide", minsize=10),
                                  xaxis=dict(type="category"))
                st.plotly_chart(fig, width="stretch")

        with st.container(border=True, key="card_pc"):
            st.markdown('<div class="card-title">👫 兩人各花在哪些分類</div>',
                        unsafe_allow_html=True)
            pc = analytics.person_category(cdf)
            if pc.empty:
                st.caption("沒有支出記錄")
            else:
                pc = pc.assign(人=pc["person"].map(names).fillna(pc["person"]))
                pcolors = person_colors(meta)
                fig = px.bar(pc, x="amount", y="category", color="人",
                             barmode="group", orientation="h",
                             custom_data=["人"],
                             color_discrete_map={names.get(pid, pid): c
                                                 for pid, c in pcolors.items()})
                fig.update_traces(
                    hovertemplate=("分類：%{y}<br>人：%{customdata[0]}"
                                   "<br>金額：CA$%{x:,.2f}<extra></extra>"))
                fig.update_layout(margin=dict(l=20, r=20, t=10, b=20), height=400,
                                  xaxis_title=f"支出（{S}）", yaxis_title="",
                                  yaxis=dict(autorange="reversed"),
                                  legend_title_text="")
                st.plotly_chart(fig, width="stretch")

        # ---- 挑一個分類看明細 ------------------------------------------------
        with st.container(border=True, key="card_pick"):
            st.markdown('<div class="card-title">🔍 看某一類的明細</div>',
                        unsafe_allow_html=True)
            exp = sub[sub["type"] == "expense"]
            cats = (exp.groupby("category")["amount"].sum()
                    .sort_values(ascending=False).index.tolist())
            if not cats:
                st.caption("沒有支出記錄")
            else:
                months = ["全部"] + sorted(exp["month"].unique(), reverse=True)
                p1, p2 = st.columns([2, 1])
                pick = p1.selectbox("分類", cats, label_visibility="collapsed")
                pmonth = p2.selectbox("月份", months, label_visibility="collapsed")
                if st.button("看明細", type="primary", width="stretch"):
                    cat_detail(sub, pick, names, colors,
                               month=None if pmonth == "全部" else pmonth)

        with st.container(border=True, key="card_top"):
            st.markdown('<div class="card-title">💥 大額支出 Top 10</div>',
                        unsafe_allow_html=True)
            top = analytics.top_expenses(sub, n=10).copy()
            if top.empty:
                st.caption("沒有支出記錄")
            else:
                orig = df.set_index("id")
                top["人"] = top["person"].map(names).fillna(top["person"])
                top["日期"] = top["date"].dt.strftime("%Y/%m/%d")
                top["金額"] = top.apply(
                    lambda r: f"{sym(orig.loc[r['id'], 'currency'])}"
                              f"{orig.loc[r['id'], 'amount']:,.2f}"
                    if r["id"] in orig.index else f"{S}{r['amount']:,.2f}", axis=1)
                st.dataframe(top[["日期", "人", "category", "item", "金額", "note"]],
                             width="stretch", hide_index=True,
                             column_config={"category": "分類", "item": "品項",
                                            "note": "備註"})
