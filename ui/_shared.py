"""各頁共用：資料載入/快取、幣別、匯率、settlement 卡片。"""
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd
import requests
import streamlit as st

from lib import analytics
from lib.api import GasClient

TZ = ZoneInfo("America/Vancouver")  # 「今天」以溫哥華為準，別用主機(UTC)時間
CURRENCIES = {"CAD": "CA$", "USD": "US$", "TWD": "NT$"}

# 視覺 tokens（同 .streamlit/config.toml 的主題；照舊版設計）
INCOME_C, EXPENSE_C, NET_C = "#34A853", "#E5484D", "#3B6FE0"
BAR_C = "#3B6FE0"          # 進度條藍
BUDGET_C = "#34A853"       # 預算進度綠
MONTH_BAR_C = "#E5788C"    # 每月總開銷粉紅
DUO_COLORS = ["#3B6FE0", "#E8823E"]  # 藍(Diana) × 橘(Aras)，依 meta.people 順序

# 分類顯示用 emoji（資料庫存純文字，畫面加圖示）
CAT_EMOJI = {
    "外食": "🍜", "買菜": "🥬", "居住": "🏠", "水電網路": "💡", "日用品": "🧻",
    "家具家電": "🛋️", "交通": "🚗", "娛樂": "🎬", "醫療": "🏥", "寵物": "🐾",
    "訂閱": "📺", "運動": "🏸", "其他": "📦",
    "薪資": "💼", "獎金": "🎁", "投資": "📈",
}
SPLIT_LABEL = {"half": "平分", "own": "自己", "advance": "代墊"}


DEFAULT_FIXED = ["居住", "水電網路", "訂閱"]  # 固定支出分類預設


def fixed_cats(meta: dict) -> list[str]:
    """固定支出分類：meta 有設就用設的（空清單=真的沒有），否則預設 ∩ 現有分類。"""
    saved = meta.get("fixed_categories")
    if saved is not None:
        return list(saved)
    return [c for c in DEFAULT_FIXED if c in meta["categories"]["expense"]]


def cat_label(c: str) -> str:
    emoji = CAT_EMOJI.get(c, "🏷️")
    return f"{emoji} {c}"


def person_colors(meta: dict) -> dict:
    """person_id → 專屬色（依 meta.people 順序配雙人色）。"""
    return {p["id"]: DUO_COLORS[i % len(DUO_COLORS)]
            for i, p in enumerate(meta["people"])}


def chip(pid: str, names: dict, colors: dict) -> str:
    """付款人小徽章（圓形姓氏 + 名字），底色跟著人的專屬色。"""
    name = names.get(pid, pid)
    color = colors.get(pid, "#888")
    return (f'<span class="chip" style="background:{color}1A;color:{color}">'
            f'<span class="chip-dot" style="background:{color}">'
            f'{name[:1]}</span><span class="chip-name">{name}</span></span>')


def bar_row(label_html: str, right_html: str, pct: float,
            color: str = BAR_C) -> str:
    """一行「標籤＋金額＋進度條」（花在哪些地點/分類、預算共用）。"""
    pct = max(0.0, min(100.0, pct))
    return (f'<div class="bar-row"><div class="bar-head">'
            f'<span>{label_html}</span><span class="bar-right">{right_html}</span></div>'
            f'<div class="bar-track"><div class="bar-fill" '
            f'style="width:{pct:.1f}%;background:{color}"></div></div></div>')
FALLBACK_RATES = {"CAD": 1.0, "USD": 1.35, "TWD": 0.044}
S = CURRENCIES["CAD"]          # 統計一律 CAD
MS = S.replace("$", "\\$")     # markdown 語境（成對 $ 會被當 LaTeX）

DEFAULT_META = {
    "people": [
        {"id": "diana", "name": "Diana"},
        {"id": "aras", "name": "Aras"},
    ],
    "categories": {
        "expense": ["外食", "買菜", "居住", "水電網路", "日用品", "家具家電",
                    "交通", "娛樂", "醫療", "寵物", "訂閱", "其他"],
        "income": ["薪資", "獎金", "投資", "其他"],
    },
}


def today():
    return datetime.now(TZ).date()


def sym(currency: str) -> str:
    return CURRENCIES.get(currency, f"{currency} ")


def secret(key: str, default: str = "") -> str:
    try:
        return st.secrets.get(key, default)
    except FileNotFoundError:
        return default


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
def _fetch_all(url: str, token: str) -> dict:
    return GasClient(url, token).get_all()


@st.cache_data(ttl=86400, show_spinner=False)
def fetch_rates() -> dict:
    """各幣別→CAD 匯率，每天抓一次；抓不到用保底值。"""
    try:
        r = requests.get("https://open.er-api.com/v6/latest/CAD", timeout=10).json()
        cad_to = r["rates"]
        return {c: (1.0 if c == "CAD" else 1.0 / float(cad_to[c]))
                for c in CURRENCIES if c in cad_to}
    except Exception:
        return dict(FALLBACK_RATES)


def refresh():
    st.cache_data.clear()
    st.rerun()


def load() -> dict | None:
    """每頁開頭呼叫。回 {client, df, cdf, meta, names} 或 None（連線失敗已顯示錯誤）。"""
    client = get_client()
    if client is None:
        return None
    if flash := st.session_state.pop("flash", None):
        st.toast(flash, icon="✅")
    try:
        data = _fetch_all(client.url, client.token)
    except Exception as e:  # noqa: BLE001 — 連線問題都收在這裡顯示
        st.error(f"連不上 Google Sheet：{e}")
        if st.button("重試"):
            refresh()
        return None
    # 空 list 要保留（例：fixed_categories=[] = 使用者明確說沒有固定支出）
    meta = {**DEFAULT_META,
            **{k: v for k, v in (data.get("meta") or {}).items()
               if v or isinstance(v, list)}}
    df = analytics.to_df(data.get("transactions") or [])
    cdf = analytics.to_cad(df, fetch_rates())  # 統計一律用這個（全 CAD）
    ids = [p["id"] for p in meta["people"]]
    if len(ids) == 2:
        # owner = 這筆帳實際算誰的：代墊(advance)歸對方，其餘歸付款人
        other = {ids[0]: ids[1], ids[1]: ids[0]}
        for d in (df, cdf):
            is_adv = (d["type"] == "expense") & (d["split"] == "advance")
            d["owner"] = d["person"].where(~is_adv, d["person"].map(other))
    names = {p["id"]: p["name"] for p in meta["people"]}
    return {"client": client, "df": df, "cdf": cdf, "meta": meta, "names": names}


def person_view(cdf: pd.DataFrame, meta: dict, key: str) -> pd.DataFrame:
    """視角切換元件（綜合/個人），回過濾後的 df。"""
    names = {p["id"]: p["name"] for p in meta["people"]}
    view = st.segmented_control(
        "視角", ["all"] + [p["id"] for p in meta["people"]],
        format_func=lambda v: "👫 綜合" if v == "all" else names[v],
        default="all", key=key)
    return analytics.filter_person(cdf, None if view in (None, "all") else view)


def empty_hint(sub: pd.DataFrame) -> bool:
    if sub.empty:
        st.info("還沒有任何記錄，先去「記一筆」開張吧！")
        return True
    return False
