"""我們的記帳本 — 入口：登入 + 多頁導覽（版面照 ~/awm 的套路）。"""
import streamlit as st

from ui._shared import secret

st.set_page_config(page_title="我們的記帳本", page_icon="💰", layout="wide")
st.logo("assets/logo.svg", size="large")

# 全站視覺（照舊版設計）：淺灰底、白卡片、藍進度條、人徽章、明細表。
# 卡片 = st.container(border=True) 加 CSS。
st.markdown(
    """
    <style>
    /* 卡片容器 */
    [data-testid="stVerticalBlockBorderWrapper"] {
      background: #FFFFFF;
      border: 1px solid #ECECEA !important;
      border-radius: 14px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      padding: 0.4rem 0.6rem;
    }
    .card-title { font-weight: 700; font-size: 1.0rem; margin: 0.1rem 0 0.5rem; }
    .card-sub   { color: #8A8A88; font-size: 0.8rem; }

    /* 同一排的卡片等高：讓卡片撐滿欄位高度
       （這版 Streamlit 的 border 容器 = stLayoutWrapper > stVerticalBlock） */
    [data-testid="stColumn"] > [data-testid="stVerticalBlock"] { height: 100%; }
    [data-testid="stColumn"] > [data-testid="stVerticalBlock"]
      > [data-testid="stLayoutWrapper"],
    [data-testid="stColumn"] > [data-testid="stVerticalBlock"]
      > [data-testid="stVerticalBlockBorderWrapper"] { flex: 1 1 auto; }
    [data-testid="stColumn"] [data-testid="stLayoutWrapper"]
      > [data-testid="stVerticalBlock"] { height: 100%; }

    .big-num { font-size: 2.1rem; font-weight: 800; letter-spacing: -0.01em;
               font-variant-numeric: tabular-nums; }

    /* 付款人徽章 */
    .chip { display: inline-flex; align-items: center; gap: 6px;
            background: #F0F4FE; color: #2F5FC7; border-radius: 999px;
            padding: 2px 10px 2px 4px; font-size: 0.85rem; font-weight: 600;
            white-space: nowrap; }
    .chip-dot { width: 20px; height: 20px; border-radius: 50%; color: #fff;
                font-size: 0.7rem; font-weight: 700; display: inline-flex;
                align-items: center; justify-content: center; }

    /* 地點小標籤 */
    .loc-pill { display: inline-block; background: #FBE9EC; color: #D6455D;
                border-radius: 999px; padding: 1px 9px; font-size: 0.75rem;
                margin-top: 2px; }

    /* 進度條列（地點/分類/預算） */
    .bar-row  { margin: 0.55rem 0; }
    .bar-head { display: flex; justify-content: space-between;
                font-size: 0.9rem; margin-bottom: 5px; }
    .bar-right{ color: #1C1C1E; font-weight: 700;
                font-variant-numeric: tabular-nums; }
    .bar-right small { color: #9A9A98; font-weight: 500; }
    .bar-track{ height: 8px; background: #EDEDEB; border-radius: 99px; }
    .bar-fill { height: 8px; border-radius: 99px; }

    /* 月份導航標題（別被窄欄擠成直排字） */
    .mn-title { font-size: 1.4rem; font-weight: 800; white-space: nowrap; }

    /* 分帳狀況 綠/紅列 */
    .settle-row { display: flex; justify-content: space-between; align-items: center;
                  flex-wrap: wrap; gap: 0 0.5rem;
                  border-radius: 10px; padding: 0.5rem 0.8rem; color: #fff;
                  font-weight: 700; margin: 0.3rem 0; font-size: 0.95rem;
                  font-variant-numeric: tabular-nums; }
    .settle-row > span { white-space: nowrap; }
    .settle-pos { background: #43A85C; }
    .settle-neg { background: #E5636A; }
    .settle-name { display: inline-flex; align-items: center; gap: 8px; }
    .settle-dot { width: 22px; height: 22px; border-radius: 50%;
                  background: rgba(255,255,255,0.28); display: inline-flex;
                  align-items: center; justify-content: center; font-size: 0.75rem; }

    /* 明細表 */
    table.dt { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    table.dt th { color: #9A9A98; font-weight: 500; text-align: left;
                  padding: 6px 8px; border-bottom: 1px solid #EFEFED; }
    table.dt td { padding: 9px 8px; border-bottom: 1px solid #F4F4F2;
                  vertical-align: top; }
    table.dt td.amt { font-weight: 700; white-space: nowrap;
                      font-variant-numeric: tabular-nums; }
    table.dt td.mut { color: #8A8A88; }

    /* 卡片內的「本月/全部」貼右、禁止折行（新舊版 DOM 都涵蓋；
       margin-left:auto + fit-content 讓「群組滿寬」或「群組縮寬」兩種版本都靠右） */
    [data-testid="stLayoutWrapper"] [data-testid="stButtonGroup"],
    [data-testid="stVerticalBlockBorderWrapper"] [data-testid="stButtonGroup"] {
      display: flex; justify-content: flex-end;
      width: fit-content; margin-left: auto;
      flex-wrap: nowrap !important;
    }
    [data-testid="stLayoutWrapper"] [data-testid="stButtonGroup"] button,
    [data-testid="stVerticalBlockBorderWrapper"] [data-testid="stButtonGroup"] button {
      white-space: nowrap; flex-shrink: 0;
    }
    /* 真正的靠右主力：按鈕群的父容器在 flex column 裡 align-self 到行尾 */
    [data-testid="stLayoutWrapper"] [data-testid="stElementContainer"]:has(
      > [data-testid="stButtonGroup"]),
    [data-testid="stVerticalBlockBorderWrapper"] [data-testid="stElementContainer"]:has(
      > [data-testid="stButtonGroup"]) {
      align-self: flex-end !important;
    }

    /* 損益表 */
    table.pl { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    table.pl td { padding: 7px 8px; }
    table.pl .sec td { font-weight: 700; border-top: 1px solid #EFEFED; }
    table.pl .sub td { color: #8A8A88; font-size: 0.84rem; padding: 4px 8px 4px 26px; }
    table.pl .tot td { font-weight: 800; border-top: 2px solid #1C1C1E;
                       border-bottom: 3px double #1C1C1E; }
    table.pl td.num { text-align: right; font-variant-numeric: tabular-nums;
                      white-space: nowrap; }
    table.dt tr.tot td { font-weight: 800; border-top: 2px solid #1C1C1E; }

    /* 圓餅圖自製圖例 */
    .lg-row { display: flex; justify-content: space-between; font-size: 0.85rem;
              margin: 0.3rem 0; }
    .lg-dot { display: inline-block; width: 10px; height: 10px;
              border-radius: 3px; margin-right: 7px; }
    .lg-pct { color: #9A9A98; }

    @media (max-width: 640px) {
      .block-container { padding: 2.5rem 0.75rem 1rem 0.75rem !important; }
      .mn-title { font-size: 1.1rem; }
      div[data-testid="stHorizontalBlock"] {
        flex-wrap: wrap !important;
        gap: 0.3rem !important;
      }
      /* 預設：欄位整寬直疊（卡片、圖表、表單欄） */
      div[data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
        min-width: 100% !important;
      }
      /* 例外：直接放按鈕/切換鈕的列（月導航、本月/全部、更新/刪除）保持併排 */
      div[data-testid="stHorizontalBlock"]:has(> [data-testid="stColumn"]
          > [data-testid="stVerticalBlock"] > [data-testid="stElementContainer"]
          [data-testid="stButton"]) > [data-testid="stColumn"],
      div[data-testid="stHorizontalBlock"]:has(> [data-testid="stColumn"]
          > [data-testid="stVerticalBlock"] > [data-testid="stElementContainer"]
          [data-testid="stButtonGroup"]) > [data-testid="stColumn"] {
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
        st.Page("ui/pnl.py", title="損益表", icon="📑", url_path="pnl"),
        st.Page("ui/trends.py", title="收支趨勢", icon="📈", url_path="trends"),
        st.Page("ui/settings.py", title="設定", icon="⚙️", url_path="settings"),
    ])
    pg.run()
