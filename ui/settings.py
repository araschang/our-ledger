"""⚙️ 設定 — 成員名字、分類"""
import streamlit as st

from lib.api import ApiError
from ui._shared import cat_label, fixed_cats, load, refresh

st.title("⚙️ 設定")

ctx = load()
if ctx:
    client, meta = ctx["client"], ctx["meta"]
    st.caption("改完按儲存，兩個人看到的都會更新（存在 Google Sheet 的 Meta 表）。")
    with st.form("settings"):
        st.markdown("**成員名字**")
        new_people = []
        for p in meta["people"]:
            new_people.append({"id": p["id"],
                               "name": st.text_input(p["id"], value=p["name"])})
        st.markdown("**支出分類**（一行一個）")
        exp = st.text_area("expense", value="\n".join(meta["categories"]["expense"]),
                           height=240, label_visibility="collapsed")
        st.markdown("**收入分類**")
        inc = st.text_area("income", value="\n".join(meta["categories"]["income"]),
                           height=120, label_visibility="collapsed")
        st.markdown("**固定支出分類**（損益表用：房租、水電這種每月躲不掉的）")
        # 選項要含「已設定但不在支出清單裡」的（例：分類清單改到一半），
        # 否則存檔時會被悄悄清掉
        saved_fixed = fixed_cats(meta)
        fixed_opts = list(dict.fromkeys(meta["categories"]["expense"] + saved_fixed))
        new_fixed = st.multiselect(
            "fixed", fixed_opts, default=saved_fixed,
            format_func=cat_label, label_visibility="collapsed")
        st.markdown("**每月預算**（0 = 不設；設了的分類會出現在總覽的預算卡）")
        budgets = meta.get("budgets") or {}
        new_budgets = {}
        bcols = st.columns(2)
        for i, c in enumerate(meta["categories"]["expense"]):
            new_budgets[c] = bcols[i % 2].number_input(
                cat_label(c), min_value=0.0, step=50.0,
                value=float(budgets.get(c, 0) or 0), key=f"bud_{c}")
        if st.form_submit_button("💾 儲存設定", type="primary"):
            new_meta = {
                "people": new_people,
                "categories": {
                    "expense": [l.strip() for l in exp.splitlines() if l.strip()],
                    "income": [l.strip() for l in inc.splitlines() if l.strip()],
                },
                "budgets": {c: v for c, v in new_budgets.items() if v > 0},
                "fixed_categories": new_fixed,
            }
            try:
                client.save_meta(new_meta)
                st.session_state["flash"] = "設定存好了"
                refresh()
            except ApiError as e:
                st.error(f"儲存失敗：{e}")
