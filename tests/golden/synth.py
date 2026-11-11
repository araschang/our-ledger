"""造一份假的帳（固定亂數種子）當 golden 測試的資料：各種分法、幣別、收入、結清、
設定裡沒有的分類、只有收入的月份、只有結清的月份。不含真實資料，可以進 git。"""
import json
import random
import sys

rnd = random.Random(20261111)
people = [{"id": "diana", "name": "Diana"}, {"id": "aras", "name": "Aras"}]
exp_cats = ["外食", "買菜", "居住", "水電網路", "日用品", "交通", "車貸保險", "娛樂", "其他"]
txns = []


def add(date, person, type_, cat, amount, split="own", currency="CAD", item=None):
    i = len(txns)
    txns.append({"id": f"s{i:04d}", "created_at": f"{date}T{8 + i % 12:02d}:{i % 60:02d}:00",
                 "date": date, "person": person, "type": type_, "category": cat,
                 "item": item or f"{cat}{i}", "amount": amount, "note": "", "location": "",
                 "source": "web", "currency": currency, "split": split,
                 "shared": split == "half"})


months = [f"2025-{m:02d}" for m in range(8, 13)] + [f"2026-{m:02d}" for m in range(1, 12)]
for mi, ym in enumerate(months):
    if ym == "2026-03":       # 只有收入的月份
        add(f"{ym}-15", "aras", "income", "薪資", 4200.0)
        continue
    if ym == "2026-04":       # 只有結清的月份
        add(f"{ym}-02", "aras", "settle", "結清", 300.0, item="結清")
        continue
    for k in range(rnd.randint(12, 30)):
        day = rnd.randint(1, 28)
        p = rnd.choice(["diana", "aras"])
        cat = rnd.choice(exp_cats + ["寵物"])          # 寵物 不在設定的分類裡
        split = rnd.choices(["half", "own", "advance"], [5, 3, 1])[0]
        cur = rnd.choices(["CAD", "USD", "TWD"], [20, 2, 1])[0]
        amt = round(rnd.uniform(3, 400 if cat != "居住" else 2400), 2)
        add(f"{ym}-{day:02d}", p, "expense", cat, amt, split, cur)
    for p in ("diana", "aras"):
        if rnd.random() < 0.8:
            add(f"{ym}-{rnd.randint(1, 28):02d}", p, "income", rnd.choice(["薪資", "其他"]),
                round(rnd.uniform(800, 6000), 2))
    if mi % 4 == 3:
        add(f"{ym}-27", rnd.choice(["diana", "aras"]), "settle", "結清",
            round(rnd.uniform(50, 900), 2), item="結清")
add("2026-11-10", "diana", "expense", "外食", 0.0, "half")     # 金額 0 的舊資料
meta = {"people": people,
        "categories": {"expense": exp_cats + ["醫療"], "income": ["薪資", "獎金", "其他"]},
        "budgets": {"外食": 400, "買菜": 300}, "fixed_categories": ["居住", "水電網路", "車貸保險"]}
json.dump({"transactions": txns, "meta": meta, "rates": {"CAD": 1.0, "USD": 1.37, "TWD": 0.043}},
          open(sys.argv[1], "w"), ensure_ascii=False, indent=0)
print(len(txns), "rows")
