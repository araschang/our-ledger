"""統計計算層：輸入 transactions list，輸出 pandas 結構，給儀表板畫圖。"""
import pandas as pd

COLUMNS = ["id", "created_at", "date", "person", "type", "category",
           "item", "amount", "note", "location", "shared", "source", "currency",
           "split"]

# split：這筆帳怎麼算
#   half    = 兩人對半（舊資料 shared=TRUE）
#   own     = 付的人自己的（舊資料 shared=FALSE）
#   advance = 代墊——付的人幫對方付，對方欠全額，統計歸對方


def to_df(transactions: list) -> pd.DataFrame:
    """轉 DataFrame；空資料也保證欄位齊全、dtype 正確。"""
    df = pd.DataFrame(transactions, columns=COLUMNS)
    for col in ("item", "note", "location", "category", "person", "type", "source"):
        df[col] = df[col].fillna("")
    df["currency"] = df["currency"].fillna("").replace("", "CAD")  # 舊資料沒這欄=CAD
    # split 沒填（舊資料）→ 從 shared 推導
    df["split"] = df["split"].where(df["split"].isin(["half", "own", "advance"]),
                                    df["shared"].map({True: "half", False: "own"}))
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
    """person=None 代表綜合視角。有 owner 欄（代墊歸屬修正後）優先用它。"""
    if person is None:
        return df
    col = "owner" if "owner" in df.columns else "person"
    return df[df[col] == person]


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
    """分類×人 支出（long form: category, person, amount）。代墊歸實際主人。"""
    sub = df[df["type"] == "expense"]
    if month:
        sub = sub[sub["month"] == month]
    if sub.empty:
        return pd.DataFrame(columns=["category", "person", "amount"])
    col = "owner" if "owner" in sub.columns else "person"
    out = sub.groupby(["category", col])["amount"].sum().reset_index()
    return out.rename(columns={col: "person"})


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
    """結算：half 對半、advance 對方欠全額、own 不進結算。一律 CAD。

    rates: 各幣別→CAD 的匯率；缺的幣別當 1.0。
    回傳 {'total': 共同開銷(half)總額, 'advance_total': 代墊總額,
          'paid': {pid: 為對方出的錢(half+advance)},
          'balance': {pid: 該拿回(+)/該補(-)}, 'msg': 誰欠誰一句話}
    """
    sub = df[df["type"] == "expense"].copy()
    if month:
        sub = sub[sub["month"] == month]
    rates = rates or {}
    sub["cad"] = sub["amount"] * sub["currency"].map(lambda c: float(rates.get(c, 1.0)))
    ids = [p["id"] for p in people]
    names = {p["id"]: p["name"] for p in people}
    half = sub[sub["split"] == "half"]
    adv = sub[sub["split"] == "advance"]

    half_paid = {pid: float(half[half["person"] == pid]["cad"].sum()) for pid in ids}
    adv_paid = {pid: float(adv[adv["person"] == pid]["cad"].sum()) for pid in ids}
    total = float(half["cad"].sum())
    adv_total = float(adv["cad"].sum())
    n = len(ids) or 1
    # half：付的人 + 全額 − 自己那份；advance：付的人 + 全額，其他人分攤欠款
    balance = {}
    for pid in ids:
        others_adv = sum(adv_paid[q] for q in ids if q != pid)
        balance[pid] = (half_paid[pid] - total / n
                        + adv_paid[pid]
                        - (others_adv / (n - 1) if n > 1 else 0.0))
    balance = {pid: round(v, 2) for pid, v in balance.items()}
    if len(ids) == 2:  # 兩人時強制正負對稱，避免浮點分半差一分錢
        balance[ids[1]] = -balance[ids[0]]
    paid = {pid: half_paid[pid] + adv_paid[pid] for pid in ids}

    msg = "兩不相欠 🎉"
    if len(ids) == 2:
        a, b = ids
        diff = balance[a]
        if abs(diff) >= 0.005:
            debtor, creditor = (b, a) if diff > 0 else (a, b)
            msg = f"{names[debtor]} 要給 {names[creditor]} {abs(diff):,.2f}"
    return {"total": total, "advance_total": adv_total,
            "paid": paid, "balance": balance, "msg": msg}
