"""我們的記帳本 — 入口：登入 + 多頁導覽（版面照 ~/awm 的套路）。"""
import importlib
import pathlib
import sys

import streamlit as st


@st.cache_resource
def _module_mtimes() -> dict:
    """記住各模組檔案的修改時間（跨 session 共用，行程活著就一直在）。"""
    return {}


def _app_modules():
    """目前載進來的自家模組（ui/、lib/）。"""
    for name, mod in list(sys.modules.items()):
        if name.startswith(("ui.", "lib.")) and getattr(mod, "__file__", None):
            yield name, mod


def _file_mtime(mod):
    try:
        return pathlib.Path(mod.__file__).stat().st_mtime
    except OSError:
        return None


def _reload_changed_modules() -> None:
    """程式碼換版後自動重新載入 ui/ 和 lib/ 的模組。

    Streamlit Cloud 部署新版時不會重啟行程：頁面檔（ui/xxx.py）每次都重讀，
    但 import 進來的模組留在 sys.modules 還是舊的 → 新頁面配舊模組，
    會炸 ImportError，得手動 Reboot。這裡用檔案 mtime 偵測，換版就自己重載。
    """
    mtimes = _module_mtimes()
    changed = False
    for name, mod in _app_modules():
        mt = _file_mtime(mod)
        # 沒記錄過的先跳過（冷啟動時本來就是新的），交給 _record_mtimes 記
        if mt is not None and name in mtimes and mtimes[name] != mt:
            try:
                importlib.reload(mod)
                changed = True
            except Exception:  # noqa: BLE001 — 重載失敗就維持舊的，別讓整個 app 掛掉
                pass
            mtimes[name] = mt
    if changed:
        st.cache_data.clear()  # 新程式碼配新資料，別吃到舊結構的快取


def _record_mtimes() -> None:
    """把這輪跑完後載到的模組時間記下來——要在頁面執行完才做，
    因為冷啟動時這些模組是在下面的 import／pg.run() 才進 sys.modules 的。"""
    mtimes = _module_mtimes()
    for name, mod in _app_modules():
        mt = _file_mtime(mod)
        if mt is not None:
            mtimes.setdefault(name, mt)


_reload_changed_modules()

from ui._shared import secret  # noqa: E402 — 要在上面重載完才 import

st.set_page_config(page_title="我們的記帳本", page_icon="💕", layout="wide")
st.logo("assets/logo.svg", size="large")

# 全站視覺（照舊版設計）：淺灰底、白卡片、藍進度條、人徽章、明細表。
# 卡片 = st.container(border=True) 加 CSS。
st.markdown(
    """
    <style>
    /* 鎖整頁水平溢出（Streamlit 右上工具列會突出畫面，iOS 會因此左右晃） */
    html, body,
    [data-testid="stAppViewContainer"],
    [data-testid="stMain"] {
      overflow-x: hidden !important;
      max-width: 100vw;
    }

    /* 藏 Streamlit 的 Fork/GitHub 工具列（突出畫面的元凶，app 也用不到） */
    [data-testid="stToolbarActions"] { display: none !important; }

    /* 卡片容器：白底浮起（key 以 card_ 開頭的 container） */
    [class*="st-key-card_"] {
      background: #FFFFFF !important;
      border: 1px solid #E9E9E6 !important;
      border-radius: 14px !important;
      box-shadow: 0 1px 2px rgba(20,20,20,0.05), 0 6px 18px rgba(20,20,20,0.05);
      /* 下內距略大：標題自帶上邊距，視覺才會上下對稱 */
      padding: 1.05rem 1.15rem 1.4rem !important;
    }
    .card-title { font-weight: 700; font-size: 1.0rem; margin: 0.1rem 0 0.5rem; }
    .card-sub   { color: #8A8A88; font-size: 0.8rem; }

    /* 指標數字（損益表/趨勢頁的三格）也卡片化 */
    [data-testid="stMetric"] {
      background: #FFFFFF;
      border: 1px solid #E9E9E6;
      border-radius: 14px;
      box-shadow: 0 1px 2px rgba(20,20,20,0.05), 0 6px 18px rgba(20,20,20,0.05);
      padding: 0.95rem 1.1rem 0.85rem;
    }
    [data-testid="stMetricLabel"] { color: #8A8A88; }
    [data-testid="stMetricValue"] { font-variant-numeric: tabular-nums;
                                    font-weight: 700; }

    /* 表單（記一筆/設定）同卡片外觀 */
    [data-testid="stForm"] {
      background: #FFFFFF;
      border: 1px solid #E9E9E6 !important;
      border-radius: 14px;
      box-shadow: 0 1px 2px rgba(20,20,20,0.05), 0 6px 18px rgba(20,20,20,0.05);
      padding: 1.05rem 1.15rem;
    }

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

    /* 進度條列（分類/預算） */
    .bar-row  { margin: 0.55rem 0; }
    .bar-head { display: flex; justify-content: space-between;
                font-size: 0.9rem; margin-bottom: 5px; }
    .bar-right{ color: #1C1C1E; font-weight: 700;
                font-variant-numeric: tabular-nums; }
    .bar-right small { color: #9A9A98; font-weight: 500; }
    .bar-track{ height: 8px; background: #EDEDEB; border-radius: 99px; }
    .bar-fill { height: 8px; border-radius: 99px; }

    /* 月份導航：內容多寬就多寬、單行、置中對齊（桌機手機同一套） */
    .mn-title { font-size: 1.4rem; font-weight: 800; white-space: nowrap; }
    #root .st-key-mnav [data-testid="stHorizontalBlock"] {
      flex-wrap: nowrap !important; gap: 0.5rem !important;
      align-items: center;
    }
    #root .st-key-mnav [data-testid="stColumn"] {
      min-width: 0 !important; width: auto !important; flex: 0 0 auto !important;
    }
    #root .st-key-mnav [data-testid="stColumn"] > [data-testid="stVerticalBlock"] {
      width: auto !important;
    }

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
    table.dt td.amt { font-weight: 700; white-space: nowrap; text-align: right;
                      font-variant-numeric: tabular-nums; }
    table.dt th:last-child { text-align: right; }
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

    /* 明細清單（原生列版）：斑馬紋 + 直線分隔，一多也對得準。
       「一列」= .st-key-dtl 第一層的 stHorizontalBlock；Streamlit 各版本
       中間可能包一層 stLayoutWrapper / stVerticalBlock，三種都寫。 */
    /* 一列 = .st-key-dtl 的直接子元素（Streamlit 會幫每列各包一層 wrapper，
       所以用 > * 抓，版本換了也不會失效）。第 1 個是表頭。 */
    .st-key-dtl { gap: 0 !important; }
    .st-key-dtl > * {
      border-bottom: 1px solid #EDEDEA;
      padding: 0.45rem 0.4rem; border-radius: 6px;
    }
    .st-key-dtl > *:nth-child(even) { background: #FAFAF8; }  /* 隔行淺灰 */
    .st-key-dtl > *:hover { background: #EEF3FD; }  /* 滑到哪列哪列亮 */
    .st-key-dtl > *:first-child {                   /* 表頭：不吃斑馬紋 */
      border-bottom: 1.5px solid #DFDFDC; background: none !important;
      padding-bottom: 0.5rem; margin-bottom: 0.15rem;
      border-radius: 0;
    }
    .dtl-th { line-height: 1.3; }
    /* 欄與欄之間的直線：只畫整列的直接子欄（✏️/🗑 那組巢狀的不畫）。
       手機太窄就不畫，見下方 media query。 */
    .st-key-dtl > * > [data-testid="stHorizontalBlock"]
      > [data-testid="stColumn"] + [data-testid="stColumn"],
    .st-key-dtl > [data-testid="stHorizontalBlock"]
      > [data-testid="stColumn"] + [data-testid="stColumn"] {
      border-left: 1px solid #EDEDEA;
    }
    .st-key-dtl [data-testid="stHorizontalBlock"]
      > [data-testid="stColumn"] { padding-left: 0.4rem; }
    /* 欄位對齊：第 5 欄金額靠右（小數點才對得齊）、第 6 欄分攤置中。
       表頭跟資料列同一套規則，所以標題永遠對在資料正上方。 */
    /* 要連 markdown 容器一起指定（Streamlit 內層自己有 text-align，繼承壓不過） */
    .st-key-dtl [data-testid="stHorizontalBlock"]
      > [data-testid="stColumn"]:nth-child(5),
    .st-key-dtl [data-testid="stHorizontalBlock"]
      > [data-testid="stColumn"]:nth-child(5) * { text-align: right !important; }
    .st-key-dtl [data-testid="stHorizontalBlock"]
      > [data-testid="stColumn"]:nth-child(6),
    .st-key-dtl [data-testid="stHorizontalBlock"]
      > [data-testid="stColumn"]:nth-child(6) * { text-align: center !important; }

    /* 可點的分類名稱（總覽分類卡）：長得像文字，點了看明細 */
    [class*="st-key-catlnk_"] button {
      padding: 0 !important; min-height: 0 !important; border: none !important;
      background: none !important; color: #1C1C1E !important;
      justify-content: flex-start !important; text-align: left;
    }
    [class*="st-key-catlnk_"] button:hover { color: #3B6FE0 !important;
      text-decoration: underline; }
    [class*="st-key-catlnk_"] button p { font-size: 0.9rem !important;
      margin: 0 !important; }
    .st-key-card_cat [data-testid="stHorizontalBlock"] { gap: 0.3rem !important; }
    .st-key-card_cat .bar-track { margin-bottom: 0.5rem; }
    /* 圓餅圖的圖例列（分類名是按鈕）：跟原本的 .lg-row 一樣緊湊 */
    .st-key-card_pie [data-testid="stHorizontalBlock"] {
      gap: 0.2rem !important; align-items: center !important;
    }
    .st-key-card_pie [data-testid="stVerticalBlock"] { gap: 0.1rem; }
    .st-key-card_pie [data-testid="stElementContainer"] { margin: 0 !important; }
    .st-key-card_pie .lg-dot { margin-right: 0; }
    .st-key-card_pie .lg-pct { line-height: 1.2; margin: 0; }

    /* 損益表裡可點的分類（小字、縮排，跟 table.pl .sub 一致） */
    [class*="st-key-plcat_"] button {
      padding: 0 0 0 26px !important; min-height: 0 !important;
      border: none !important; background: none !important;
      color: #8A8A88 !important; justify-content: flex-start !important;
    }
    [class*="st-key-plcat_"] button:hover { color: #3B6FE0 !important;
      text-decoration: underline; }
    [class*="st-key-plcat_"] button p { font-size: 0.84rem !important;
      margin: 0 !important; }
    .st-key-card_pl [data-testid="stHorizontalBlock"] { gap: 0 !important; }
    .pl-num { text-align: right; font-variant-numeric: tabular-nums;
              font-size: 0.84rem; color: #8A8A88; white-space: nowrap;
              padding-right: 8px; }
    /* 損益表的小計/合計列（分類列是按鈕，所以整張表改用 div 排） */
    .pl-sec, .pl-tot { display: flex; justify-content: space-between;
                       align-items: baseline; gap: 0.5rem; padding: 7px 8px;
                       font-size: 0.92rem; }
    .pl-sec { font-weight: 700; border-top: 1px solid #EFEFED; }
    .pl-tot { font-weight: 800; border-top: 2px solid #1C1C1E;
              border-bottom: 3px double #1C1C1E; margin: 0.35rem 0 0.5rem; }
    .pl-amt { font-variant-numeric: tabular-nums; white-space: nowrap; }

    /* 明細彈窗的摘要列 */
    .dlg-sum { display: flex; gap: 1.2rem; flex-wrap: wrap; font-size: 0.9rem;
               color: #8A8A88; margin-bottom: 0.6rem; }
    .dlg-sum b { color: #1C1C1E; font-variant-numeric: tabular-nums; }
    .dtl-th  { color: #9A9A98; font-size: 0.85rem; }
    .dtl-mut { color: #8A8A88; font-size: 0.88rem; }
    .dtl-amt { font-weight: 700; font-variant-numeric: tabular-nums;
               white-space: nowrap; }
    .st-key-dtl [data-testid="stBaseButton-tertiary"] {
      padding: 0 4px; min-height: 1.7rem; font-size: 0.95rem;
    }

    /* 表格橫向捲動容器：窄螢幕表格自己滑，不撐爆卡片 */
    .tbl-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch;
                  max-width: 100%; }
    .tbl-scroll table { min-width: 420px; }

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
      [class*="st-key-card_"] { padding: 0.75rem 0.7rem 1.05rem !important; }
      table.pl, table.dt { font-size: 0.85rem; }
      .st-key-dtl [data-testid="stBaseButton-tertiary"] {
        min-height: 1.35rem; font-size: 0.85rem;
      }
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
      /* 明細列手機版：藏「分類、分攤」欄、強制單行、緊湊；直線省掉太擠 */
      .st-key-dtl [data-testid="stHorizontalBlock"] {
        flex-wrap: nowrap !important; gap: 0.2rem !important;
      }
      .st-key-dtl [data-testid="stHorizontalBlock"]
        > [data-testid="stColumn"] + [data-testid="stColumn"] {
        border-left: none !important;
      }
      .st-key-dtl [data-testid="stHorizontalBlock"]
        > [data-testid="stColumn"] { padding-left: 0.15rem; }
      .st-key-dtl [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
        min-width: 0 !important; flex: 1 1 auto !important;
      }
      .st-key-dtl [data-testid="stHorizontalBlock"]
        > [data-testid="stColumn"]:nth-child(3),
      .st-key-dtl [data-testid="stHorizontalBlock"]
        > [data-testid="stColumn"]:nth-child(6) {
        display: none !important;
      }
      /* 巢狀的 ✏️/🗑 欄不吃 3.8rem 底限，手機直疊省寬度 */
      .st-key-dtl [data-testid="stColumn"] [data-testid="stColumn"] {
        min-width: 100% !important; flex: 0 0 auto !important;
      }
      .st-key-dtl [data-testid="stColumn"] [data-testid="stHorizontalBlock"] {
        flex-wrap: wrap !important; gap: 0 !important;
      }
      .st-key-dtl [data-testid="stHorizontalBlock"]
        > [data-testid="stColumn"]:nth-child(7) {
        flex: 0 0 2.2rem !important;
      }
      .st-key-dtl .chip { padding: 2px; }
      .st-key-dtl .chip-name { display: none; }  /* 手機只留圓點 */
      .st-key-dtl .cur { display: none; }        /* 手機藏 CA$ 前綴省寬 */
      .st-key-dtl .dtl-amt { font-size: 0.85rem; }
      .st-key-dtl [data-testid="stBaseButton-tertiary"] { padding: 0 2px; }
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
    with st.sidebar:
        # 資料整包快取 5 分鐘（切頁面才會快）；對方剛用捷徑記的想馬上看到就按這個
        if st.button("🔄 重新整理資料", width="stretch"):
            st.cache_data.clear()
            st.rerun()
        st.caption("資料每 5 分鐘自動更新")
    pg.run()
    _record_mtimes()
