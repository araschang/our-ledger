"""用現行 Python 統計（lib/analytics.py）算標準答案，給新版前端的 TS 統計逐項對照。

用法：python tests/golden/make_golden.py <fixture.json> <golden.json>
fixture = /api/data 的格式：{transactions, meta, rates}
"""
import json
import sys

from lib import analytics

DEFAULT_FIXED = ["居住", "水電網路", "訂閱", "車貸保險"]


def num(x):
    if x is None:
        return None
    x = float(x)
    return None if x != x else round(x, 6)


def records(df, cols):
    return [{c: (num(r[c]) if c not in ("month", "category", "person", "label") else r[c])
             for c in cols} for r in df.to_dict("records")]


def main(src, dst):
    data = json.load(open(src))
    meta = data["meta"]
    people = meta["people"]
    ids = [p["id"] for p in people]
    saved = meta.get("fixed_categories")
    fixed = (list(saved) if saved is not None
             else [c for c in DEFAULT_FIXED if c in meta["categories"]["expense"]])
    df = analytics.to_df(data["transactions"])
    cdf = analytics.to_cad(df, data["rates"])
    if len(ids) == 2:
        other = {ids[0]: ids[1], ids[1]: ids[0]}
        is_adv = (cdf["type"] == "expense") & (cdf["split"] == "advance")
        cdf["owner"] = cdf["person"].where(~is_adv, cdf["person"].map(other))

    out = {"fixed": fixed, "views": {}, "settlement": {}, "person_category": {}}
    for view in [None] + ids:
        sub = analytics.personal_view(cdf, view, ids)
        months = sorted(sub["month"].unique())
        v = {"months": months, "pnl": {}, "breakdown": {}, "top": {}, "count": len(sub)}
        for m in months + [None]:
            key = m or "all"
            p = analytics.pnl(sub, fixed, month=m)
            v["pnl"][key] = {k: (num(p[k]) if not k.endswith("_by")
                                 else {c: num(a) for c, a in p[k].items()}) for k in p}
            bd = analytics.category_breakdown(sub, month=m)
            v["breakdown"][key] = {r["category"]: num(r["amount"]) for r in bd.to_dict("records")}
            v["top"][key] = [num(a) for a in analytics.top_expenses(sub, n=10, month=m)["amount"]]
        v["monthly"] = records(analytics.monthly_summary(sub, last_n=12),
                               ["month", "income", "expense", "net"])
        v["cumulative"] = records(analytics.cumulative_net(sub),
                                  ["month", "income", "expense", "net", "cum_net", "save_rate"])
        v["weekday"] = [num(a) for a in analytics.weekday_pattern(sub)["amount"]]
        v["category_monthly"] = records(analytics.category_monthly(sub, last_n=6),
                                        ["month", "category", "amount"])
        v["yearly"] = {y: records(analytics.pnl_yearly(sub, fixed, y),
                                  ["month", "income", "fixed", "variable", "expense", "net",
                                   "save_rate"])
                       for y in sorted({m[:4] for m in months})}
        out["views"][view or "all"] = v
    for m in sorted(cdf["month"].unique()) + [None]:
        s = analytics.settlement(cdf, people, month=m)
        out["settlement"][m or "all"] = {
            "total": num(s["total"]), "advance_total": num(s["advance_total"]),
            "settled_total": num(s["settled_total"]),
            "paid": {k: num(v) for k, v in s["paid"].items()},
            "balance": {k: num(v) for k, v in s["balance"].items()}, "msg": s["msg"]}
        pc = analytics.person_category(cdf, ids, month=m)
        out["person_category"][m or "all"] = {f'{r["category"]}|{r["person"]}': num(r["amount"])
                                              for r in pc.to_dict("records")}
    json.dump(out, open(dst, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(*sys.argv[1:3])
