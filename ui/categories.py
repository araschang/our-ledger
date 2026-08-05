"""🧾 分類分析 — 逐月分類、分類×人、地點、大額支出"""
import plotly.express as px
import streamlit as st

from lib import analytics
from ui._shared import S, empty_hint, load, person_colors, person_view, sym

st.title("🧾 分類分析")

ctx = load()
if ctx:
    df, cdf, meta, names = ctx["df"], ctx["cdf"], ctx["meta"], ctx["names"]
    sub = person_view(cdf, meta, key="cat_view")
    if not empty_hint(sub):
        with st.container(border=True, key="card_catm"):
            st.markdown('<div class="card-title">📚 逐月分類（最近 6 個月）</div>',
                        unsafe_allow_html=True)
            cm = analytics.category_monthly(sub, last_n=6)
            if cm.empty:
                st.caption("沒有支出記錄")
            else:
                fig = px.bar(cm, x="month", y="amount", color="category",
                             barmode="stack")
                fig.update_layout(margin=dict(l=20, r=20, t=10, b=20), height=360,
                                  xaxis_title="", yaxis_title=f"支出（{S}）",
                                  legend=dict(orientation="h", y=-0.15),
                                  legend_title_text="",
                                  xaxis=dict(type="category"))
                st.plotly_chart(fig, width="stretch")

        col_l, col_r = st.columns(2)
        with col_l, st.container(border=True, key="card_pc"):
            st.markdown('<div class="card-title">👫 分類 × 人</div>',
                        unsafe_allow_html=True)
            pc = analytics.person_category(cdf)
            if pc.empty:
                st.caption("沒有支出記錄")
            else:
                pc = pc.assign(人=pc["person"].map(names).fillna(pc["person"]))
                pcolors = person_colors(ctx["meta"])
                fig = px.bar(pc, x="amount", y="category", color="人",
                             barmode="group", orientation="h",
                             color_discrete_map={names.get(pid, pid): c
                                                 for pid, c in pcolors.items()})
                fig.update_layout(margin=dict(l=20, r=20, t=10, b=20), height=400,
                                  xaxis_title=f"支出（{S}）", yaxis_title="",
                                  yaxis=dict(autorange="reversed"),
                                  legend_title_text="")
                st.plotly_chart(fig, width="stretch")
        with col_r, st.container(border=True, key="card_loc2"):
            st.markdown('<div class="card-title">📍 地點 Top 10</div>',
                        unsafe_allow_html=True)
            loc = analytics.by_location(sub)
            if loc.empty:
                st.caption("記帳時填「地點」就會有這張圖")
            else:
                fig = px.bar(loc, x="amount", y="location", orientation="h",
                             text="count")
                fig.update_traces(texttemplate="%{text} 筆", textposition="auto")
                fig.update_layout(margin=dict(l=20, r=20, t=10, b=20), height=400,
                                  xaxis_title=f"支出（{S}）", yaxis_title="",
                                  yaxis=dict(autorange="reversed"))
                st.plotly_chart(fig, width="stretch")

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
