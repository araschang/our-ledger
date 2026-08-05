"""✍️ 記一筆"""
import streamlit as st

from ui._shared import (CURRENCIES, FALLBACK_RATES, cat_label, fetch_rates,
                        load, refresh, sym, today)
from lib.api import ApiError

st.title("✍️ 記一筆")

ctx = load()
if ctx:
    client, meta = ctx["client"], ctx["meta"]
    names = ctx["names"]
    cats = meta["categories"]

    c1, c2 = st.columns(2)
    person = c1.radio("誰記的（付錢的人）", [p["id"] for p in meta["people"]],
                      format_func=lambda i: names[i], horizontal=True)
    ttype = c2.radio("類型", ["expense", "income"],
                     format_func=lambda t: "💸 支出" if t == "expense" else "💵 收入",
                     horizontal=True)

    with st.form("add", clear_on_submit=True):
        category = st.selectbox("分類", cats["expense" if ttype == "expense" else "income"],
                                format_func=cat_label)
        item = st.text_input("品項", placeholder="例：Costco 採買")
        a1, a2 = st.columns([3, 1])
        amount = a1.number_input("金額", min_value=0.0, step=1.0,
                                 format="%.2f", value=None, placeholder="多少錢")
        currency = a2.selectbox("幣別", list(CURRENCIES), index=0,
                                help="選 USD/TWD 會以當下匯率換成 CAD 入帳，原幣金額記在備註")
        date = st.date_input("日期", value=today())
        split = "own"
        if ttype == "expense":
            others = [p["id"] for p in meta["people"] if p["id"] != person]
            other_name = names[others[0]] if others else "對方"
            split = st.radio(
                "這筆怎麼算", ["half", "own", "advance"],
                format_func=lambda v: {
                    "half": "👫 兩人分攤",
                    "own": f"🙋 {names[person]} 自己的",
                    "advance": f"🤝 幫 {other_name} 付的（代墊，{other_name} 欠全額）",
                }[v], horizontal=True)
        with st.expander("地點／備註（選填）"):
            location = st.text_input("地點")
            note = st.text_input("備註")
        if st.form_submit_button("✍️ 記下來", width="stretch", type="primary"):
            if not amount or amount <= 0:
                st.error("金額要大於 0")
            elif not item.strip():
                st.error("品項不能空白")
            else:
                save_amount = round(float(amount), 2)
                save_note = note.strip()
                flash = f"記好了：{item.strip()} {sym(currency)}{save_amount:,.2f}"
                if currency != "CAD":
                    # 記帳當下鎖匯率換成 CAD，原幣與匯率留在備註可追溯
                    rate = fetch_rates().get(currency, FALLBACK_RATES.get(currency, 1.0))
                    cad_amt = round(save_amount * rate, 2)
                    orig = f"原幣 {sym(currency)}{save_amount:,.2f} @{rate:.4f}"
                    save_note = f"{orig}｜{save_note}" if save_note else orig
                    save_amount = cad_amt
                    flash += f" → CA${cad_amt:,.2f}"
                try:
                    client.add_txn({
                        "date": str(date), "person": person, "type": ttype,
                        "category": category, "item": item.strip(),
                        "amount": save_amount, "note": save_note,
                        "location": location.strip(),
                        "shared": split == "half",
                        "split": split if ttype == "expense" else "own",
                        "source": "web", "currency": "CAD",
                    })
                    st.session_state["flash"] = flash
                    refresh()
                except ApiError as e:
                    st.error(f"存檔失敗：{e}")
