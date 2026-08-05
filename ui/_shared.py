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

# 視覺 tokens（同 .streamlit/config.toml 的主題）
INCOME_C, EXPENSE_C, NET_C = "#6FAF7C", "#D96A55", "#E4B95B"   # 苔綠/赤/金
DUO_COLORS = ["#E8834E", "#5B8DBE"]  # 柿橙(Diana) × 靛藍(Aras)，依 meta.people 順序


def person_colors(meta: dict) -> dict:
    """person_id → 專屬色（依 meta.people 順序配雙人色）。"""
    return {p["id"]: DUO_COLORS[i % len(DUO_COLORS)]
            for i, p in enumerate(meta["people"])}
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
    meta = {**DEFAULT_META,
            **{k: v for k, v in (data.get("meta") or {}).items() if v}}
    df = analytics.to_df(data.get("transactions") or [])
    cdf = analytics.to_cad(df, fetch_rates())  # 統計一律用這個（全 CAD）
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
