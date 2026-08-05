"""⚙️ 設定 — 成員名字、分類"""
import streamlit as st

from lib.api import ApiError
from ui._shared import load, refresh

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
