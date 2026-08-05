"""我們的記帳本 — 入口：登入 + 多頁導覽（版面照 ~/awm 的套路）。"""
import streamlit as st

from ui._shared import secret

st.set_page_config(page_title="我們的記帳本", page_icon="💰", layout="wide")
st.logo("assets/logo.svg", size="large")

# 全站視覺：標題明體（家計簿印刷感）、金額收據等寬體、metric 卡片化、
# 雙人結算卡；手機版縮 padding + 多欄換行（抄 awm 的做法）
st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Mono:wght@500;600&display=swap');

    h1, h2, h3 {
      font-family: 'Fraunces', 'Noto Serif TC', 'PingFang TC', serif !important;
      letter-spacing: 0.01em;
    }
    [data-testid="stMetric"] {
      background: #2B2420;
      border: 1px solid #3D332C;
      border-radius: 0.75rem;
      padding: 0.9rem 1rem 0.8rem;
    }
    [data-testid="stMetricValue"] {
      font-family: 'IBM Plex Mono', monospace;
      font-weight: 600;
      font-size: 1.6rem;
      font-variant-numeric: tabular-nums;
    }
    [data-testid="stMetricLabel"] { color: #A6988A; }

    /* 雙人結算卡 */
    .duo-card {
      display: grid;
      grid-template-columns: 1fr 1.4fr 1fr;
      gap: 0.6rem;
      margin: 0.2rem 0 0.4rem;
    }
    .duo-side, .duo-mid {
      background: #2B2420;
      border: 1px solid #3D332C;
      border-radius: 0.75rem;
      padding: 0.9rem 1rem;
      text-align: center;
    }
    .duo-side { border-top: 3px solid var(--pc); }
    .duo-name { font-family: 'Fraunces', 'Noto Serif TC', serif; font-weight: 700;
                font-size: 1.05rem; color: var(--pc); }
    .duo-paid { font-family: 'IBM Plex Mono', monospace; font-weight: 600;
                font-size: 1.15rem; margin-top: 0.35rem; }
    .duo-sub  { color: #A6988A; font-size: 0.78rem; margin-top: 0.2rem; }
    .duo-verdict { font-size: 0.95rem; }
    .duo-amt  { font-family: 'IBM Plex Mono', monospace; font-weight: 600;
                font-size: 1.7rem; color: #E4B95B; margin-top: 0.15rem; }
    .duo-even { font-size: 1.35rem; margin-top: 0.4rem; }
    .duo-foot { color: #A6988A; font-size: 0.82rem; margin-bottom: 0.6rem; }
    @media (max-width: 640px) {
      .duo-card { grid-template-columns: 1fr; }
    }

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
      /* 圖表欄不要硬擠併排：整寬直疊 */
      div[data-testid="stHorizontalBlock"] > div:has(.js-plotly-plot) {
        min-width: 100% !important;
      }
      div[data-testid="stHorizontalBlock"] > div:has([data-testid="stMetric"]) {
        min-width: 9rem !important;
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
