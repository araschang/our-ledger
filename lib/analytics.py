"""統計計算層：輸入 transactions list，輸出 pandas 結構，給儀表板畫圖。"""
import pandas as pd

COLUMNS = ["id", "created_at", "date", "person", "type", "category",
           "item", "amount", "note", "location", "shared", "source"]


def to_df(transactions: list) -> pd.DataFrame:
    """轉 DataFrame；空資料也保證欄位齊全、dtype 正確。"""
    df = pd.DataFrame(transactions, columns=COLUMNS)
    for col in ("item", "note", "location", "category", "person", "type", "source"):
        df[col] = df[col].fillna("")
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    df["shared"] = df["shared"].astype(bool)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    df["month"] = df["date"].dt.strftime("%Y-%m")
    return df


def filter_person(df: pd.DataFrame, person: str | None) -> pd.DataFrame:
    """person=None 代表綜合視角。"""
    if person is None:
        return df
    return df[df["person"] == person]


def monthly_summary(df: pd.DataFrame, last_n: int = 12) -> pd.DataFrame:
    """每月收入/支出/淨存。回傳 columns: month, income, expense, net。"""
    if df.empty:
        return pd.DataFrame(columns=["month", "income", "expense", "net"])
    g = df.groupby(["month", "type"])["amount"].sum().unstack(fill_value=0.0)
    for col in ("income", "expense"):
        if col not in g.columns:
            g[col] = 0.0
    g = g[["income", "expense"]].reset_index().sort_values("month")
    g["net"] = g["income"] - g["expense"]
    return g.tail(last_n).reset_index(drop=True)


def category_breakdown(df: pd.DataFrame, month: str | None = None,
                       txn_type: str = "expense") -> pd.DataFrame:
    """某月（或全部）依分類加總。回傳 columns: category, amount，由大到小。"""
    sub = df[df["type"] == txn_type]
    if month:
        sub = sub[sub["month"] == month]
    if sub.empty:
        return pd.DataFrame(columns=["category", "amount"])
    out = (sub.groupby("category")["amount"].sum()
           .sort_values(ascending=False).reset_index())
    return out


def settlement(df: pd.DataFrame, people: list[dict],
               month: str | None = None) -> dict:
    """共同開銷結算：shared=TRUE 的支出兩人對半。

    回傳 {'total': 共同開銷總額, 'paid': {person_id: 已付},
          'balance': {person_id: 已付-應付}, 'msg': 誰欠誰一句話}
    balance > 0 = 多付了該拿回；< 0 = 該補給對方。
    """
    sub = df[(df["type"] == "expense") & df["shared"]]
    if month:
        sub = sub[sub["month"] == month]
    ids = [p["id"] for p in people]
    names = {p["id"]: p["name"] for p in people}
    paid = {pid: float(sub[sub["person"] == pid]["amount"].sum()) for pid in ids}
    total = float(sub["amount"].sum())
    share = total / len(ids) if ids else 0.0
    balance = {pid: paid[pid] - share for pid in ids}

    msg = "兩不相欠 🎉"
    if len(ids) == 2:
        a, b = ids
        diff = balance[a]  # a 多付的量
        if abs(diff) >= 0.005:
            debtor, creditor = (b, a) if diff > 0 else (a, b)
            msg = f"{names[debtor]} 要給 {names[creditor]} {abs(diff):,.2f}"
    return {"total": total, "paid": paid, "balance": balance, "msg": msg}
