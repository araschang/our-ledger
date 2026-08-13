"""📈 收支趨勢 — 累積淨存、儲蓄率、花錢習慣"""
import plotly.graph_objects as go
import streamlit as st

from lib import analytics
from ui._shared import EXPENSE_C, INCOME_C, NET_C, S, empty_hint, load, person_view

st.title("📈 收支趨勢")

ctx = load()
if ctx:
    cdf, meta = ctx["cdf"], ctx["meta"]
    sub = person_view(cdf, meta, key="tr_view")
    if not empty_hint(sub):
        cn = analytics.cumulative_net(sub)

        latest = cn.iloc[-1]
        c1, c2, c3 = st.columns(3)
        c1.metric("累積淨存", f"{S}{latest['cum_net']:,.0f}")
        c2.metric("本月儲蓄率",
                  "—" if latest["save_rate"] != latest["save_rate"]  # NaN
                  else f"{latest['save_rate']:.0%}")
        days = max(1, len(sub[sub["month"] == latest["month"]]["date"].dt.date.unique()))
        c3.metric("本月日均支出", f"{S}{latest['expense'] / max(1, days):,.0f}",
                  help="以有記帳的天數計")

        with st.container(border=True, key="card_cum"):
            st.markdown('<div class="card-title">🏔️ 累積淨存</div>',
                        unsafe_allow_html=True)
            fig = go.Figure()
            fig.add_scatter(x=cn["month"], y=cn["cum_net"], mode="lines+markers",
                            fill="tozeroy", line=dict(color=NET_C), name="累積淨存",
                            hovertemplate=("月份：%{x}<br>累積淨存："
                                           "CA$%{y:,.2f}<extra></extra>"))
            fig.update_layout(margin=dict(l=20, r=20, t=10, b=20), height=300,
                              yaxis_title=f"{S}",
                              xaxis=dict(type="category"))
            st.plotly_chart(fig, width="stretch")

        col_l, col_r = st.columns(2)
        with col_l, st.container(border=True, key="card_sr"):
            st.markdown('<div class="card-title">💧 儲蓄率（淨存／收入）</div>',
                        unsafe_allow_html=True)
            sr = cn.dropna(subset=["save_rate"])
            if sr.empty:
                st.caption("有收入記錄的月份才算得出儲蓄率")
            else:
                fig = go.Figure()
                fig.add_bar(x=sr["month"], y=sr["save_rate"],
                            marker_color=[INCOME_C if v >= 0 else EXPENSE_C
                                          for v in sr["save_rate"]],
                            hovertemplate=("月份：%{x}<br>儲蓄率："
                                           "%{y:.0%}<extra></extra>"))
                fig.update_layout(margin=dict(l=20, r=20, t=10, b=20), height=300,
                                  yaxis_tickformat=".0%",
                                  xaxis=dict(type="category"))
                st.plotly_chart(fig, width="stretch")
        with col_r, st.container(border=True, key="card_wd"):
            st.markdown('<div class="card-title">📅 星期幾最會花錢</div>',
                        unsafe_allow_html=True)
            wp = analytics.weekday_pattern(sub)
            if wp.empty:
                st.caption("沒有支出記錄")
            else:
                fig = go.Figure()
                fig.add_bar(x=wp["label"], y=wp["amount"], marker_color=EXPENSE_C,
                            opacity=0.85,
                            hovertemplate=("星期%{x}<br>支出："
                                           "CA$%{y:,.2f}<extra></extra>"))
                fig.update_layout(margin=dict(l=20, r=20, t=10, b=20), height=300,
                                  yaxis_title=f"支出（{S}）")
                st.plotly_chart(fig, width="stretch")
