"""📊 總覽 — 照舊版設計：月導航 + 共同開銷/分帳卡 + 預算 + 分析卡 + 明細"""
from datetime import datetime

import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from lib import analytics
from lib.api import ApiError
from ui._shared import (BUDGET_C, MONTH_BAR_C, TZ, bar_row, cat_label, chip,
                        empty_hint, load, person_colors, refresh, sym,
                        CAT_EMOJI, SPLIT_LABEL)

PIE_COLORS = ["#3B6FE0", "#E8823E", "#34A853", "#E5484D", "#8E67D6",
              "#E5A63B", "#5B8DBE", "#C98CA7", "#7FA6A0", "#A98467"]


def _fmt(v: float) -> str:
    return f"CA&#36;{v:,.2f}"  # HTML 語境用 &#36; 避免 markdown 把 $ 當 LaTeX


def month_nav(months: list[str]) -> str:
    """‹ 2026年8月 › ＋ 本月。回傳選中的 YYYY-MM。"""
    now_m = datetime.now(TZ).strftime("%Y-%m")
    if "ov_month" not in st.session_state or st.session_state["ov_month"] not in months:
        st.session_state["ov_month"] = months[0]
    idx = months.index(st.session_state["ov_month"])  # months 是新→舊
    c1, c2, c3, c4, _ = st.columns([0.6, 2.2, 0.6, 1.0, 6],
                                   vertical_alignment="center")
    if c1.button("‹", disabled=idx >= len(months) - 1):
        st.session_state["ov_month"] = months[idx + 1]
        st.rerun()
    m = st.session_state["ov_month"]
    c2.markdown(f'<div class="mn-title">{int(m[:4])}年{int(m[5:7])}月</div>',
                unsafe_allow_html=True)
    if c3.button("›", disabled=idx <= 0):
        st.session_state["ov_month"] = months[idx - 1]
        st.rerun()
    if c4.button("本月", disabled=(m == now_m or now_m not in months)):
        st.session_state["ov_month"] = now_m
        st.rerun()
    return st.session_state["ov_month"]


def toggle(key: str) -> bool:
    """「本月/全部」切換，回傳 True=本月。"""
    v = st.segmented_control(" ", ["本月", "全部"], default="本月",
                             key=key, label_visibility="collapsed")
    return (v or "本月") == "本月"


def card_head(title: str, key: str) -> bool:
    """卡片標題列：標題靠左、本月/全部貼右上角。回傳 True=本月。"""
    t1, t2 = st.columns([3, 1.6], vertical_alignment="center")
    t1.markdown(f'<div class="card-title" style="margin:0">{title}</div>',
                unsafe_allow_html=True)
    with t2:
        return toggle(key)


ctx = load()
if ctx:
    client, df, cdf, meta, names = (ctx["client"], ctx["df"], ctx["cdf"],
                                    ctx["meta"], ctx["names"])
    colors = person_colors(meta)
    people = meta["people"]

    if empty_hint(cdf):
        st.stop()
    months = sorted(cdf["month"].unique(), reverse=True)
    month = month_nav(months)
    mdf = cdf[cdf["month"] == month]

    # ---- 第一排：共同開銷 ＋ 目前分帳狀況 -------------------------------
    s_month = analytics.settlement(cdf, people, month=month)
    s_all = analytics.settlement(cdf, people)
    joint_total = s_month["total"] + s_month["advance_total"]
    joint_n = int(((mdf["type"] == "expense")
                   & mdf["split"].isin(["half", "advance"])).sum())

    r1a, r1b = st.columns(2)
    with r1a, st.container(border=True):
        st.markdown(f'<div class="card-sub">{int(month[5:7])}月共同開銷</div>'
                    f'<div class="big-num">{_fmt(joint_total)}</div>'
                    f'<div class="card-sub">共 {joint_n} 筆　·　'
                    + "　/　".join(f'{names[p["id"]]} {_fmt(s_month["paid"][p["id"]])}'
                                   for p in people)
                    + "</div>", unsafe_allow_html=True)
    with r1b, st.container(border=True):
        st.markdown(f'<div class="card-title" style="display:flex;justify-content:space-between">'
                    f'<span>目前分帳狀況</span>'
                    f'<span class="card-sub">{s_all["msg"]}</span></div>',
                    unsafe_allow_html=True)
        rows = ""
        for p in sorted(people, key=lambda p: -s_all["balance"][p["id"]]):
            bal = s_all["balance"][p["id"]]
            cls = "settle-pos" if bal >= 0 else "settle-neg"
            amt = f'{"+" if bal >= 0 else "−"}{_fmt(abs(bal))}'
            rows += (f'<div class="settle-row {cls}">'
                     f'<span class="settle-name"><span class="settle-dot">'
                     f'{names[p["id"]][:1]}</span>{names[p["id"]]}</span>'
                     f'<span>{amt}</span></div>')
        st.markdown(rows, unsafe_allow_html=True)

    # ---- 預算卡 ---------------------------------------------------------
    budgets = {k: float(v) for k, v in (meta.get("budgets") or {}).items()
               if float(v or 0) > 0}
    with st.container(border=True):
        st.markdown(f'<div class="card-title">{int(month[5:7])}月預算</div>',
                    unsafe_allow_html=True)
        if not budgets:
            st.caption("還沒設定預算——到「⚙️ 設定」幫各分類設每月預算，這裡就會出現進度。")
        else:
            spent_all = (mdf[mdf["type"] == "expense"]
                         .groupby("category")["amount"].sum())
            total_b = sum(budgets.values())
            used = float(sum(spent_all.get(c, 0.0) for c in budgets))
            st.markdown(
                f'<div class="bar-head"><span class="card-sub">總預算 '
                f'<b style="color:#1C1C1E">{_fmt(total_b)}</b></span>'
                f'<span class="card-sub">已用 <b style="color:#1C1C1E">{_fmt(used)}</b>'
                f' · {used / total_b:.0%}</span></div><hr style="margin:0.4rem 0">',
                unsafe_allow_html=True)
            rows = ""
            for c, b in budgets.items():
                sp = float(spent_all.get(c, 0.0))
                left = b - sp
                color = BUDGET_C if sp <= b else "#E5484D"
                right = (f'{_fmt(sp)} / {_fmt(b)} · '
                         + (f'<small>剩 {_fmt(left)}</small>' if left >= 0
                            else f'<small style="color:#E5484D">超 {_fmt(-left)}</small>'))
                rows += bar_row(cat_label(c), right, sp / b * 100, color)
            st.markdown(rows, unsafe_allow_html=True)

    # ---- 三張分析卡：地點 / 分類長條 / 分類圓餅 --------------------------
    def scope_df(this_month: bool):
        base = mdf if this_month else cdf
        return base[base["type"] == "expense"]

    c1, c2, c3 = st.columns(3)
    with c1, st.container(border=True):
        sub = scope_df(card_head("花在哪些地點", "tg_loc"))
        loc = analytics.by_location(sub, n=6)
        if loc.empty:
            st.caption("記帳時填「地點」就會有這張圖")
        else:
            total = loc["amount"].sum()
            st.markdown("".join(
                bar_row(f'📍 {r.location}',
                        f'{_fmt(r.amount)} <small>{r.amount / total:.0%}</small>',
                        r.amount / loc["amount"].max() * 100)
                for r in loc.itertuples()), unsafe_allow_html=True)
    with c2, st.container(border=True):
        sub = scope_df(card_head("花在哪些分類", "tg_cat"))
        bd = analytics.category_breakdown(sub, month=None)
        if bd.empty:
            st.caption("沒有支出記錄")
        else:
            total = bd["amount"].sum()
            st.markdown("".join(
                bar_row(cat_label(r.category),
                        f'{_fmt(r.amount)} <small>{r.amount / total:.0%}</small>',
                        r.amount / bd["amount"].max() * 100)
                for r in bd.head(6).itertuples()), unsafe_allow_html=True)
    with c3, st.container(border=True):
        sub = scope_df(card_head("分類圓餅圖", "tg_pie"))
        bd = analytics.category_breakdown(sub, month=None)
        if bd.empty:
            st.caption("沒有支出記錄")
        else:
            total = bd["amount"].sum()
            pie = px.pie(bd, names="category", values="amount", hole=0.62,
                         color_discrete_sequence=PIE_COLORS)
            pie.update_traces(textinfo="none", sort=False)
            pie.update_layout(showlegend=False, height=190,
                              margin=dict(l=10, r=10, t=6, b=6),
                              annotations=[dict(text=f"CA${total:,.2f}<br>"
                                                     f"<span style='font-size:11px;color:#9A9A98'>總支出</span>",
                                                showarrow=False, font_size=15)])
            st.plotly_chart(pie, width="stretch", config={"displayModeBar": False})
            st.markdown("".join(
                f'<div class="lg-row"><span><span class="lg-dot" '
                f'style="background:{PIE_COLORS[i % len(PIE_COLORS)]}"></span>'
                f'{cat_label(r.category)}</span>'
                f'<span class="lg-pct">{r.amount / total:.0%}</span></div>'
                for i, r in enumerate(bd.head(6).itertuples())),
                unsafe_allow_html=True)

    # ---- 每月總開銷 ------------------------------------------------------
    with st.container(border=True):
        st.markdown('<div class="card-title">每月總開銷</div>', unsafe_allow_html=True)
        m12 = analytics.monthly_summary(cdf, last_n=12)
        fig = go.Figure(go.Bar(
            x=[f"{int(m[5:7])}月" for m in m12["month"]],
            y=m12["expense"], marker_color=MONTH_BAR_C, width=0.35,
            text=[f"CA${v:,.2f}" for v in m12["expense"]],
            textposition="outside", cliponaxis=False))
        fig.update_layout(height=240, margin=dict(l=20, r=20, t=24, b=10),
                          xaxis=dict(type="category"),
                          yaxis=dict(visible=False))
        st.plotly_chart(fig, width="stretch", config={"displayModeBar": False})

    # ---- 明細 ------------------------------------------------------------
    with st.container(border=True):
        this_month = card_head("明細", "tg_detail")
        f1, f2, _ = st.columns([1.4, 1.4, 3])
        base = df[df["month"] == month] if this_month else df
        cats = ["全部分類"] + sorted(base["category"].unique())
        cat_f = f1.selectbox("分類", cats, label_visibility="collapsed")
        payers = ["全部付款人"] + [p["id"] for p in people]
        payer_f = f2.selectbox("付款人", payers, label_visibility="collapsed",
                               format_func=lambda v: names.get(v, v))
        rows = base.copy()
        if cat_f != "全部分類":
            rows = rows[rows["category"] == cat_f]
        if payer_f != "全部付款人":
            rows = rows[rows["person"] == payer_f]
        rows = rows.sort_values(["date", "created_ts"], ascending=False).head(200)

        if rows.empty:
            st.caption("沒有符合條件的記錄")
        else:
            body = ""
            for r in rows.itertuples():
                loc = (f'<br><span class="loc-pill">📍 {r.location}</span>'
                       if r.location else "")
                sign = "+" if r.type == "income" else ""
                amt_style = ' style="color:#34A853"' if r.type == "income" else ""
                split_txt = ("收入" if r.type == "income"
                             else SPLIT_LABEL.get(r.split, r.split))
                body += (f'<tr><td class="mut">{r.date.strftime("%m/%d")}</td>'
                         f'<td>{r.item}{loc}</td>'
                         f'<td>{cat_label(r.category)}</td>'
                         f'<td>{chip(r.person, names, colors)}</td>'
                         f'<td class="amt"{amt_style}>{sign}'
                         f'{sym(r.currency)}{r.amount:,.2f}</td>'
                         f'<td class="mut">{split_txt}</td></tr>')
            st.markdown('<table class="dt"><thead><tr>'
                        '<th>日期</th><th>品項</th><th>分類</th><th>付款人</th>'
                        '<th>金額</th><th>分攤</th></tr></thead>'
                        f'<tbody>{body}</tbody></table>', unsafe_allow_html=True)

        with st.expander("✏️ 編輯／刪除某一筆"):
            if rows.empty:
                st.caption("上面先篩出要改的記錄")
            else:
                labels = {r.id: f'{r.date.strftime("%m/%d")} {names.get(r.person, r.person)}'
                                f' {r.item} {sym(r.currency)}{r.amount:,.2f}'
                          for r in rows.itertuples()}
                rid = st.selectbox("選一筆", list(labels), format_func=labels.get)
                row = df[df["id"] == rid].iloc[0]
                with st.form(f"edit_{rid}"):
                    e1, e2 = st.columns(2)
                    person = e1.radio("付款人", [p["id"] for p in people],
                                      index=[p["id"] for p in people].index(row["person"])
                                      if row["person"] in [p["id"] for p in people] else 0,
                                      format_func=lambda i: names[i], horizontal=True)
                    ttype = e2.radio("類型", ["expense", "income"],
                                     index=0 if row["type"] == "expense" else 1,
                                     format_func=lambda t: "支出" if t == "expense" else "收入",
                                     horizontal=True)
                    all_cats = (meta["categories"]["expense"]
                                + meta["categories"]["income"])
                    if row["category"] not in all_cats:
                        all_cats = [row["category"]] + all_cats
                    category = st.selectbox("分類", all_cats,
                                            index=all_cats.index(row["category"]))
                    item = st.text_input("品項", value=row["item"])
                    amount = st.number_input(f"金額（{row['currency']}）", min_value=0.0,
                                             value=float(row["amount"]),
                                             step=1.0, format="%.2f")
                    date = st.date_input("日期", value=row["date"].date())
                    split = st.radio("分攤", ["half", "own", "advance"],
                                     index=["half", "own", "advance"].index(row["split"]),
                                     format_func=SPLIT_LABEL.get, horizontal=True)
                    location = st.text_input("地點", value=row["location"])
                    note = st.text_input("備註", value=row["note"])
                    b1, b2 = st.columns(2)
                    if b1.form_submit_button("💾 更新", type="primary",
                                             width="stretch"):
                        try:
                            client.update_txn({
                                "id": rid, "created_at": row["created_at"],
                                "date": str(date), "person": person,
                                "type": ttype, "category": category,
                                "item": item.strip(), "amount": round(float(amount), 2),
                                "note": note.strip(), "location": location.strip(),
                                "split": split if ttype == "expense" else "own",
                                "source": row["source"], "currency": row["currency"],
                            })
                            st.session_state["flash"] = "更新好了"
                            refresh()
                        except ApiError as e:
                            st.error(f"更新失敗：{e}")
                    if b2.form_submit_button("🗑️ 刪除", width="stretch"):
                        try:
                            client.delete_txn(rid)
                            st.session_state["flash"] = "刪掉了"
                            refresh()
                        except ApiError as e:
                            st.error(f"刪除失敗：{e}")
