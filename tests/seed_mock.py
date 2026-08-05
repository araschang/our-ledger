"""往本機 mock 塞 4 個月的擬真測試資料。用法：先跑 mock，再 python tests/seed_mock.py"""
import json
import random
import urllib.request

URL, TOKEN = "http://127.0.0.1:8765", "test"
random.seed(42)

CATS = ["外食", "買菜", "居住", "水電網路", "日用品", "交通", "娛樂", "訂閱"]
LOCS = ["Costco", "T&T", "Superstore", "Downtown", "Richmond", ""]

def post(txn):
    body = json.dumps({"token": TOKEN, "action": "add", "txn": txn}).encode()
    urllib.request.urlopen(urllib.request.Request(URL, body, method="POST"))

n = 0
for m in (5, 6, 7, 8):
    for p in ("diana", "aras"):
        post({"date": f"2026-0{m}-01", "person": p, "type": "income",
              "category": "薪資", "item": "薪水", "amount": 4000 + (500 if p == "aras" else 0),
              "shared": False, "currency": "CAD", "source": "web"}); n += 1
    post({"date": f"2026-0{m}-01", "person": "aras", "type": "expense", "category": "居住",
          "item": "房租", "amount": 2200, "shared": True, "currency": "CAD", "source": "web"}); n += 1
    for _ in range(22):
        d = random.randint(2, 28)
        cat = random.choice(CATS)
        post({"date": f"2026-0{m}-{d:02d}", "person": random.choice(["diana", "aras"]),
              "type": "expense", "category": cat,
              "item": f"{cat}消費", "amount": round(random.uniform(8, 180), 2),
              "shared": random.random() < 0.8, "location": random.choice(LOCS),
              "currency": "CAD", "source": random.choice(["web", "shortcut"])}); n += 1
print(f"seeded {n} txns")
