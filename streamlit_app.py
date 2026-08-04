"""我們的記帳本 — Streamlit 前端（記帳表單 + 儀表板）。"""
import altair as alt
import pandas as pd
import streamlit as st

from lib import analytics
from lib.api import ApiError, GasClient

st.set_page_config(page_title="我們的記帳本", page_icon="💰", layout="centered")

SYMBOL = "CA$"
MD_SYMBOL = "CA\\$"  # markdown 語境用（st.success/caption 會把成對 $ 當 LaTeX）
DEFAULT_META = {
    "people": [
        {"id": "aya", "name": "李綾芸"},
        {"id": "aras", "name": "張景皓"},
    ],
    "categories": {
        "expense": ["🍜 外食・餐廳", "🥬 買菜・食材", "🏠 房租・居住", "💡 水電網路",
                    "🧻 日用品・雜貨", "🛋️ 家具・家電", "🚗 交通", "🎬 娛樂・約會",
                    "🏥 醫療・健康", "🐾 寵物", "📦 其他"],
        "income": ["💼 薪資", "🎁 獎金", "📈 投資", "📦 其他"],
    },
}


# ---------------------------------------------------------------- secrets / 連線
def secret(key: str, default: str = "") -> str:
    try:
        return st.secrets.get(key, default)
    except FileNotFoundError:
        return default


def password_gate() -> bool:
    pw = secret("APP_PASSWORD")
    if not pw:
        return True
    if st.session_state.get("authed"):
        return True
    st.title("💰 我們的記帳本")
    entered = st.text_input("密碼", type="password")
    if entered:
        if entered == pw:
            st.session_state["authed"] = True
            st.rerun()
        else:
            st.error("密碼不對")
    return False


def get_client() -> GasClient | None:
    url = secret("GAS_URL") or st.session_state.get("gas_url", "")
    token = secret("GAS_TOKEN") or st.session_state.get("gas_token", "")
    if not url:
        st.warning("還沒設定 Google Sheet 連線。部署時把 GAS_URL / GAS_TOKEN 放進 "
                   "secrets；或在下面暫時填入（只存在這個分頁）。")
        with st.form("conn"):
            u = st.text_input("Apps Script Web app URL（結尾 /exec）")
            t = st.text_input("Token", type="password")
            if st.form_submit_button("連線") and u:
                st.session_state["gas_url"] = u
                st.session_state["gas_token"] = t
                st.rerun()
        return None
    return GasClient(url, token)


@st.cache_data(ttl=60, show_spinner="讀取帳本中…")
def fetch_all(url: str, token: str) -> dict:
    return GasClient(url, token).get_all()


def refresh():
    st.cache_data.clear()
    st.rerun()


# ---------------------------------------------------------------- 畫面組件
def render_add_form(client: GasClient, meta: dict):
    people = meta["people"]
    cats = meta["categories"]
    names = {p["id"]: p["name"] for p in people}

    c1, c2 = st.columns(2)
    person = c1.radio("誰記的（付錢的人）", [p["id"] for p in people],
                      format_func=lambda i: names[i], horizontal=True)
    ttype = c2.radio("類型", ["expense", "income"],
                     format_func=lambda t: "💸 支出" if t == "expense" else "💵 收入",
                     horizontal=True)

    with st.form("add", clear_on_submit=True):
        category = st.selectbox("分類", cats["expense" if ttype == "expense" else "income"])
        item = st.text_input("品項", placeholder="例：Costco 採買")
        amount = st.number_input(f"金額（{SYMBOL}）", min_value=0.0, step=1.0, format="%.2f")
        date = st.date_input("日期", value="today")
        shared = True
        if ttype == "expense":
            shared = st.checkbox("共同開銷（兩人分攤）", value=True)
        with st.expander("地點／備註（選填）"):
            location = st.text_input("地點")
            note = st.text_input("備註")
        if st.form_submit_button("✍️ 記下來", width="stretch", type="primary"):
            if amount <= 0:
                st.error("金額要大於 0")
            elif not item.strip():
                st.error("品項不能空白")
            else:
                try:
                    client.add_txn({
                        "date": str(date), "person": person, "type": ttype,
                        "category": category, "item": item.strip(),
                        "amount": round(float(amount), 2), "note": note.strip(),
                        "location": location.strip(),
                        "shared": bool(shared) if ttype == "expense" else False,
                        "source": "web",
                    })
                    st.session_state["flash"] = f"記好了：{item.strip()} {SYMBOL}{amount:,.2f}"
                    refresh()
                except ApiError as e:
                    st.error(f"存檔失敗：{e}")


def trend_chart(summary: pd.DataFrame):
    long = summary.melt(id_vars="month", value_vars=["income", "expense"],
                        var_name="kind", value_name="amount")
    long["kind"] = long["kind"].map({"income": "收入", "expense": "支出"})
    bars = alt.Chart(long).mark_bar(opacity=0.85).encode(
        x=alt.X("month:N", title=None, axis=alt.Axis(labelAngle=-45)),
        xOffset="kind:N",
        y=alt.Y("amount:Q", title=None),
        color=alt.Color("kind:N", title=None,
                        scale=alt.Scale(domain=["收入", "支出"],
                                        range=["#1baf7a", "#e34948"]),
                        legend=alt.Legend(orient="top")),
        tooltip=["month", "kind", alt.Tooltip("amount:Q", format=",.2f")],
    )
    line = alt.Chart(summary).mark_line(point=True, color="#2a78d6").encode(
        x="month:N", y="net:Q",
        tooltip=["month", alt.Tooltip("net:Q", format=",.2f", title="淨存")],
    )
    st.altair_chart(bars + line, width="stretch")


def donut_chart(breakdown: pd.DataFrame):
    chart = alt.Chart(breakdown).mark_arc(innerRadius=55).encode(
        theta="amount:Q",
        color=alt.Color("category:N", title=None,
                        sort=alt.EncodingSortField("amount", order="descending")),
        tooltip=["category", alt.Tooltip("amount:Q", format=",.2f")],
    )
    st.altair_chart(chart, width="stretch")


def render_dashboard(client: GasClient, df: pd.DataFrame, meta: dict):
    people = meta["people"]
    names = {p["id"]: p["name"] for p in people}

    view = st.segmented_control(
        "視角", ["all"] + [p["id"] for p in people],
        format_func=lambda v: "👫 綜合" if v == "all" else names[v],
        default="all")
    sub = analytics.filter_person(df, None if view in (None, "all") else view)

    months = sorted(sub["month"].unique(), reverse=True) if not sub.empty else []
    if not months:
        st.info("還沒有任何記錄，先去「記一筆」開張吧！")
        return
    month = st.selectbox("月份", months, index=0)

    msum = analytics.monthly_summary(sub, last_n=999)
    row = msum[msum["month"] == month]
    cur = row.iloc[0] if not row.empty else {"income": 0, "expense": 0, "net": 0}
    prev_idx = msum.index[msum["month"] == month]
    prev = (msum.iloc[prev_idx[0] - 1]
            if len(prev_idx) and prev_idx[0] > 0 else None)

    c1, c2, c3 = st.columns(3)
    c1.metric("本月支出", f"{SYMBOL}{cur['expense']:,.0f}",
              delta=(f"{cur['expense'] - prev['expense']:+,.0f}" if prev is not None else None),
              delta_color="inverse")
    c2.metric("本月收入", f"{SYMBOL}{cur['income']:,.0f}",
              delta=(f"{cur['income'] - prev['income']:+,.0f}" if prev is not None else None))
    c3.metric("本月淨存", f"{SYMBOL}{cur['net']:,.0f}")

    st.subheader("📈 月度收支趨勢")
    trend_chart(analytics.monthly_summary(sub, last_n=12))

    st.subheader(f"🧾 {month} 支出分類")
    bd = analytics.category_breakdown(sub, month=month, txn_type="expense")
    if bd.empty:
        st.caption("這個月沒有支出記錄")
    else:
        donut_chart(bd)

    st.subheader("🤝 誰欠誰（共同開銷對半）")
    s_month = analytics.settlement(df, people, month=month)
    s_all = analytics.settlement(df, people)
    st.success(f"**{month}**：{s_month['msg']}　（共同開銷 {MD_SYMBOL}{s_month['total']:,.2f}）")
    st.caption(f"累計：{s_all['msg']}　"
               + "　".join(f"{names[pid]} 已付 {MD_SYMBOL}{amt:,.2f}"
                           for pid, amt in s_all["paid"].items()))

    st.subheader("🕘 最近記錄")
    recent = df.sort_values(["date", "created_at"], ascending=False).head(20).copy()
    recent["人"] = recent["person"].map(names).fillna(recent["person"])
    recent["日期"] = recent["date"].dt.strftime("%m/%d")
    recent["金額"] = recent.apply(
        lambda r: f"{'+' if r['type'] == 'income' else '-'}{r['amount']:,.2f}", axis=1)
    recent["共同"] = recent["shared"].map({True: "👫", False: ""})
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


def render_settings(client: GasClient, meta: dict):
    st.caption("改完按儲存，兩個人看到的都會更新（存在 Google Sheet 的 Meta 表）。")
    with st.form("settings"):
        st.markdown("**成員名字**")
        new_people = []
        for p in meta["people"]:
            new_people.append({"id": p["id"],
                               "name": st.text_input(p["id"], value=p["name"])})
        st.markdown("**支出分類**（一行一個，可加 emoji）")
        exp = st.text_area("expense", value="\n".join(meta["categories"]["expense"]),
                           height=220, label_visibility="collapsed")
        st.markdown("**收入分類**")
        inc = st.text_area("income", value="\n".join(meta["categories"]["income"]),
                           height=120, label_visibility="collapsed")
        if st.form_submit_button("💾 儲存設定", type="primary"):
            new_meta = {
                "people": new_people,
                "categories": {
                    "expense": [l.strip() for l in exp.splitlines() if l.strip()],
                    "income": [l.strip() for l in inc.splitlines() if l.strip()],
                },
            }
            try:
                client.save_meta(new_meta)
                st.session_state["flash"] = "設定存好了"
                refresh()
            except ApiError as e:
                st.error(f"儲存失敗：{e}")


# ---------------------------------------------------------------- main
def main():
    if not password_gate():
        return
    client = get_client()
    if client is None:
        return

    if flash := st.session_state.pop("flash", None):
        st.toast(flash, icon="✅")

    st.title("💰 我們的記帳本")
    try:
        data = fetch_all(client.url, client.token)
    except (ApiError, Exception) as e:  # noqa: BLE001 — 連線問題都收在這裡顯示
        st.error(f"連不上 Google Sheet：{e}")
        if st.button("重試"):
            refresh()
        return

    meta = {**DEFAULT_META, **{k: v for k, v in (data.get("meta") or {}).items() if v}}
    df = analytics.to_df(data.get("transactions") or [])

    tab_add, tab_dash, tab_set = st.tabs(["✍️ 記一筆", "📊 儀表板", "⚙️ 設定"])
    with tab_add:
        render_add_form(client, meta)
    with tab_dash:
        render_dashboard(client, df, meta)
    with tab_set:
        render_settings(client, meta)


main()
