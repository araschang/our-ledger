"""✍️ 記一筆 — 手機優先：常用欄位都在第一個畫面，選項一點就好、不跳鍵盤"""
import streamlit as st

from lib.api import ApiError
from ui._shared import (CURRENCIES, FALLBACK_RATES, cat_label, cat_options,
                        fetch_rates, load, refresh, sym, today)

st.title("✍️ 記一筆")


def _sticky(key: str) -> None:
    """分段按鈕再點一次已選的那格會變成「沒選」；這裡把它擋回上一個值。"""
    last = f"{key}__last"
    if st.session_state[key] is None:
        st.session_state[key] = st.session_state.get(last)
    st.session_state[last] = st.session_state[key]


ctx = load()
if ctx:
    client, meta = ctx["client"], ctx["meta"]
    names, df = ctx["names"], ctx["df"]
    ids = [p["id"] for p in meta["people"]]

    # 「我是誰」：網址 ?me= 優先（加到主畫面就固定是自己），其次這次開著時上次選的
    if st.session_state.get("rec_person") not in ids:
        me = st.query_params.get("me")
        st.session_state["rec_person"] = me if me in ids else ids[0]
    st.session_state.setdefault("rec_type", "expense")

    with st.container(key="rec"):
        c1, c2 = st.columns(2)
        person = c1.segmented_control(
            "誰付的", ids, format_func=lambda i: names[i], key="rec_person",
            on_change=_sticky, args=("rec_person",), width="stretch")
        ttype = c2.segmented_control(
            "類型", ["expense", "income"], key="rec_type",
            format_func=lambda t: "💸 支出" if t == "expense" else "💵 收入",
            on_change=_sticky, args=("rec_type",), width="stretch")
        st.query_params["me"] = person   # 網址帶著自己，加到主畫面下次就不用切

        # 存檔成功才換一組新欄位（不用 clear_on_submit：它連驗證失敗都會清空）
        n = st.session_state.setdefault("rec_n", 0)
        with st.form(f"add_{n}"):
            with st.container(key="amtrow"):
                a1, a2 = st.columns([3, 1], vertical_alignment="bottom")
            amount = a1.number_input("金額", min_value=0.0, step=1.0, format="%.2f",
                                     value=None, placeholder="0.00", key=f"amt_{n}")
            currency = a2.selectbox("幣別", list(CURRENCIES), key=f"cur_{n}")
            category = st.pills("分類", cat_options(meta, df, ttype),
                                format_func=cat_label, key=f"cat_{ttype}_{n}")
            item = st.text_input("品項", placeholder="例：Costco 採買", key=f"item_{n}")
            split = "own"
            if ttype == "expense":
                other = next((names[i] for i in ids if i != person), "對方")
                split = st.segmented_control(
                    "這筆怎麼算", ["half", "own", "advance"], default="half",
                    format_func=lambda v: {"half": "👫 平分",
                                           "own": f"🙋 {names[person]}自己",
                                           "advance": f"🤝 幫{other}墊"}[v],
                    help=f"平分＝各出一半；自己＝只算{names[person]}的；"
                         f"代墊＝幫{other}付的，{other}要還全額",
                    key=f"split_{person}_{n}", width="stretch")
            with st.expander(f"📅 日期、備註（日期預設今天 {today():%m/%d}）"):
                date = st.date_input("日期", value=today(), key=f"date_{n}")
                note = st.text_input("備註", key=f"note_{n}")
            submitted = st.form_submit_button("✍️ 記下來", width="stretch", type="primary")

        if submitted:
            if not amount or amount <= 0:
                st.error("金額要大於 0")
            elif not category:
                st.error("選一個分類")
            elif not item.strip():
                st.error("品項不能空白")
            elif split is None:
                st.error("選這筆怎麼算（平分／自己／代墊）")
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
                        "shared": split == "half",
                        "split": split if ttype == "expense" else "own",
                        "source": "web", "currency": "CAD",
                    })
                    st.session_state["rec_n"] = n + 1
                    st.session_state["flash"] = flash
                    refresh()
                except ApiError as e:
                    st.error(f"存檔失敗：{e}")
