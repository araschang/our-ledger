"""統計計算層：輸入 transactions list，輸出 pandas 結構，給儀表板畫圖。"""
import pandas as pd

COLUMNS = ["id", "created_at", "date", "person", "type", "category",
           "item", "amount", "note", "location", "shared", "source", "currency"]


def to_df(transactions: list) -> pd.DataFrame:
    """轉 DataFrame；空資料也保證欄位齊全、dtype 正確。"""
    df = pd.DataFrame(transactions, columns=COLUMNS)
    for col in ("item", "note", "location", "category", "person", "type", "source"):
        df[col] = df[col].fillna("")
    df["currency"] = df["currency"].fillna("").replace("", "CAD")  # 舊資料沒這欄=CAD
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    df["shared"] = df["shared"].astype(bool)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    df["month"] = df["date"].dt.strftime("%Y-%m")
    # created_at 可能是 ISO 或 JS Date 字串（含 "(Pacific...)" 尾巴），容錯解析供排序用
    df["created_ts"] = pd.to_datetime(
        df["created_at"].astype(str).str.replace(r"\s*\(.+\)$", "", regex=True),
        errors="coerce", format="mixed", utc=True)
    return df


def to_cad(df: pd.DataFrame, rates: dict) -> pd.DataFrame:
    """把 amount 全部換算成 CAD（rates: 幣別→CAD，缺的當 1.0）。"""
    out = df.copy()
    out["amount"] = out["amount"] * out["currency"].map(
        lambda c: float(rates.get(c, 1.0)))
    return out


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


def category_monthly(df: pd.DataFrame, txn_type: str = "expense",
                     last_n: int = 6) -> pd.DataFrame:
    """逐月×分類金額（long form: month, category, amount），取最近 last_n 個月。"""
    sub = df[df["type"] == txn_type]
    if sub.empty:
        return pd.DataFrame(columns=["month", "category", "amount"])
    months = sorted(sub["month"].unique())[-last_n:]
    out = (sub[sub["month"].isin(months)]
           .groupby(["month", "category"])["amount"].sum().reset_index())
    return out.sort_values(["month", "amount"], ascending=[True, False])


def person_category(df: pd.DataFrame, month: str | None = None) -> pd.DataFrame:
    """分類×人 支出（long form: category, person, amount）。"""
    sub = df[df["type"] == "expense"]
    if month:
        sub = sub[sub["month"] == month]
    if sub.empty:
        return pd.DataFrame(columns=["category", "person", "amount"])
    return sub.groupby(["category", "person"])["amount"].sum().reset_index()


def cumulative_net(df: pd.DataFrame) -> pd.DataFrame:
    """月度收支＋累積淨存＋儲蓄率。columns: month, income, expense, net, cum_net, save_rate"""
    m = monthly_summary(df, last_n=10 ** 6)
    if m.empty:
        return pd.DataFrame(columns=["month", "income", "expense", "net",
                                     "cum_net", "save_rate"])
    m = m.copy()
    m["cum_net"] = m["net"].cumsum()
    m["save_rate"] = (m["net"] / m["income"]).where(m["income"] > 0)
    return m


def weekday_pattern(df: pd.DataFrame) -> pd.DataFrame:
    """星期幾花錢（支出總額）。columns: weekday(0=一), label, amount"""
    sub = df[df["type"] == "expense"]
    if sub.empty:
        return pd.DataFrame(columns=["weekday", "label", "amount"])
    labels = ["一", "二", "三", "四", "五", "六", "日"]
    out = (sub.assign(weekday=sub["date"].dt.dayofweek)
           .groupby("weekday")["amount"].sum().reindex(range(7), fill_value=0.0)
           .reset_index())
    out["label"] = out["weekday"].map(lambda i: labels[i])
    return out


def top_expenses(df: pd.DataFrame, n: int = 10,
                 month: str | None = None) -> pd.DataFrame:
    """大額支出 Top N。"""
    sub = df[df["type"] == "expense"]
    if month:
        sub = sub[sub["month"] == month]
    return sub.sort_values("amount", ascending=False).head(n)


def by_location(df: pd.DataFrame, n: int = 10) -> pd.DataFrame:
    """地點支出 Top N（略過沒填地點的）。columns: location, amount, count"""
    sub = df[(df["type"] == "expense") & (df["location"].str.strip() != "")]
    if sub.empty:
        return pd.DataFrame(columns=["location", "amount", "count"])
    out = (sub.groupby("location")
           .agg(amount=("amount", "sum"), count=("id", "count"))
           .sort_values("amount", ascending=False).head(n).reset_index())
    return out


def settlement(df: pd.DataFrame, people: list[dict],
               month: str | None = None,
               rates: dict | None = None) -> dict:
    """共同開銷結算：shared=TRUE 的支出兩人對半，一律換算成 CAD。

    rates: 各幣別→CAD 的匯率（例 {"USD": 1.35}）；缺的幣別當 1.0。
    回傳 {'total': 共同開銷總額(CAD), 'paid': {person_id: 已付},
          'balance': {person_id: 已付-應付}, 'msg': 誰欠誰一句話}
    balance > 0 = 多付了該拿回；< 0 = 該補給對方。
    """
    sub = df[(df["type"] == "expense") & df["shared"]]
    if month:
        sub = sub[sub["month"] == month]
    rates = rates or {}
    cad = sub["amount"] * sub["currency"].map(lambda c: float(rates.get(c, 1.0)))
    ids = [p["id"] for p in people]
    names = {p["id"]: p["name"] for p in people}
    paid = {pid: float(cad[sub["person"] == pid].sum()) for pid in ids}
    total = float(cad.sum())
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
