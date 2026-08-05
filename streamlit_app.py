"""我們的記帳本 — 入口：登入 + 多頁導覽（版面照 ~/awm 的套路）。"""
import streamlit as st

from ui._shared import secret

st.set_page_config(page_title="我們的記帳本", page_icon="💰", layout="wide")

# 手機版：縮 padding、讓多欄列可以換行（抄 awm 的做法）
st.markdown(
    """
    <style>
    @media (max-width: 640px) {
      .block-container { padding: 2.5rem 0.75rem 1rem 0.75rem !important; }
      div[data-testid="stHorizontalBlock"] {
        flex-wrap: wrap !important;
        gap: 0.3rem !important;
      }
      div[data-testid="stHorizontalBlock"] > div {
        min-width: 3.8rem !important;
        flex: 1 1 3.8rem !important;
      }
    }
    </style>
    """,
    unsafe_allow_html=True,
)


def password_gate() -> bool:
    pw = secret("APP_PASSWORD")
    if not pw or st.session_state.get("authed"):
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


if password_gate():
    pg = st.navigation([
        st.Page("ui/record.py", title="記一筆", icon="✍️", default=True),
        st.Page("ui/overview.py", title="總覽", icon="📊", url_path="overview"),
        st.Page("ui/categories.py", title="分類分析", icon="🧾", url_path="categories"),
        st.Page("ui/trends.py", title="收支趨勢", icon="📈", url_path="trends"),
        st.Page("ui/settings.py", title="設定", icon="⚙️", url_path="settings"),
    ])
    pg.run()
