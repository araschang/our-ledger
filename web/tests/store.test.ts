/**
 * 同步模組的情境測試：用一個照真實 API 規則運作的假伺服器（新增同 id 不重複、修改找不到回 404…），
 * 模擬「送到了但回應沒回來」「沒網路」「抓資料時剛好有寫入」「送到一半 app 被關」。
 * 每個情境對應 2026-11-11 code review 找到的問題。
 */
import { beforeEach, expect, test } from "bun:test";

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
const storage = (globalThis as unknown as { localStorage: MemStorage }).localStorage;

const META = { people: [{ id: "diana", name: "Diana" }, { id: "aras", name: "Aras" }],
  categories: { expense: ["外食", "買菜"], income: ["薪資"] } };

class FakeServer {
  rows = new Map<string, Record<string, unknown>>();
  offline = false;
  loseNext = false; // 下一個寫入：伺服器存了，但回應沒回到手機
  failNextBeforeCommit = 0; // 接下來第幾個寫入在送達前失敗（1 = 下一個）
  forceStatus: number | null = null; // 下一個寫入直接回這個狀態碼
  getDelay = 0;
  writes = 0;
  json(obj: unknown, status = 200) {
    return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  }
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const method = init.method ?? "GET";
    if (this.offline) throw new TypeError("Failed to fetch");
    const path = new URL(url, "http://x").pathname;
    if (method === "GET" && path === "/api/data") {
      const body = JSON.stringify({ transactions: [...this.rows.values()], meta: META, rates: { CAD: 1, USD: 1.4 } });
      if (this.getDelay) await Bun.sleep(this.getDelay);
      return new Response(body, { status: 200, headers: { ETag: `"${Bun.hash(body)}"` } });
    }
    this.writes += 1;
    if (this.failNextBeforeCommit > 0 && --this.failNextBeforeCommit === 0) throw new TypeError("Failed to fetch");
    if (this.forceStatus) {
      const st = this.forceStatus;
      this.forceStatus = null;
      return this.json({ error: `forced ${st}` }, st);
    }
    if (!(init.headers as Record<string, string>)?.["X-Ledger"]) return this.json({ error: "missing X-Ledger" }, 403);
    let resp: Response;
    if (method === "POST" && path === "/api/transactions") {
      const b = JSON.parse(String(init.body));
      let created = false;
      if (!this.rows.has(b.id)) {
        this.rows.set(b.id, { ...b, created_at: b.created_at ?? "srv-time" });
        created = true;
      }
      resp = this.json({ txn: this.rows.get(b.id), created });
    } else if (method === "PUT" && path.startsWith("/api/transactions/")) {
      const id = decodeURIComponent(path.split("/").pop()!);
      const old = this.rows.get(id);
      if (!old) return this.json({ error: "找不到" }, 404);
      const b = JSON.parse(String(init.body));
      this.rows.set(id, { ...old, ...b, id, created_at: old.created_at });
      resp = this.json({ txn: this.rows.get(id) });
    } else if (method === "DELETE") {
      const id = decodeURIComponent(path.split("/").pop()!);
      resp = this.json({ ok: true, deleted: this.rows.delete(id) });
    } else {
      return this.json({ error: "no such endpoint" }, 404);
    }
    if (this.loseNext) {
      this.loseNext = false;
      throw new TypeError("network lost after the server committed");
    }
    return resp;
  }
}

let server: FakeServer;
// 每個測試前重新 import，拿到乾淨的 Store 類別實例
const { Store } = await import("../src/lib/store");
type S = InstanceType<typeof Store>;

async function settle(s: S) {
  for (let i = 0; i < 400; i++) {
    await Bun.sleep(5);
    if (!s.busy) {
      await Bun.sleep(5);
      if (!s.busy) return;
    }
  }
  throw new Error("store never settled");
}

const base = { date: "2026-11-10", person: "aras", type: "expense", category: "外食", item: "x",
  note: "", currency: "CAD", split: "half" };
const view = (s: S) => s.getSnapshot().data!.transactions;
const row = (s: S, id: string) => view(s).find((t) => t.id === id);

async function freshStore(): Promise<S> {
  const s = new Store();
  await s.refresh();
  await settle(s);
  return s;
}

beforeEach(() => {
  storage.clear();
  server = new FakeServer();
  globalThis.fetch = ((url: string, init?: RequestInit) => server.fetch(url, init)) as typeof fetch;
});

test("新增送到了但回應沒回來，接著改金額：改動不會不見", async () => {
  const s = await freshStore();
  server.loseNext = true;
  const id = s.add({ ...base, amount: 10 });
  await settle(s);
  expect(server.rows.get(id)?.amount).toBe(10); // 伺服器其實存了
  expect(s.getSnapshot().pending).toBe(1); // 手機不知道，還在排隊
  s.update(id, { ...base, amount: 99 });
  await settle(s);
  expect(server.rows.get(id)?.amount).toBe(99);
  expect(row(s, id)?.amount).toBe(99);
  expect(s.getSnapshot().pending).toBe(0);
});

test("新增送到了但回應沒回來，接著刪掉：不會又跑回來", async () => {
  const s = await freshStore();
  server.loseNext = true;
  const id = s.add({ ...base, amount: 10 });
  await settle(s);
  s.remove(id);
  await settle(s);
  await s.refresh();
  await settle(s);
  expect(server.rows.has(id)).toBe(false);
  expect(row(s, id)).toBeUndefined();
});

test("抓資料的同時新增送到了：那份舊資料不會蓋掉剛記的", async () => {
  const s = await freshStore();
  server.getDelay = 60;
  const r = s.refresh(); // GET 先開始（拿到的是還沒有 X 的版本）
  await Bun.sleep(5);
  const id = s.add({ ...base, amount: 7 });
  await r;
  await settle(s);
  expect(server.rows.has(id)).toBe(true);
  expect(row(s, id)?.amount).toBe(7);
});

test("離線：刪掉、復原、再刪掉 → 最後是刪掉", async () => {
  server.rows.set("x1", { ...base, id: "x1", amount: 5, created_at: "2026-11-10T10:00:00" });
  const s = await freshStore();
  server.offline = true;
  const backup = s.remove("x1")!;
  s.restore(backup);
  expect(row(s, "x1")?.amount).toBe(5);
  s.remove("x1");
  expect(row(s, "x1")).toBeUndefined();
  server.offline = false;
  await s.flush();
  await settle(s);
  expect(server.rows.has("x1")).toBe(false);
  expect(row(s, "x1")).toBeUndefined();
});

test("離線：刪掉後在送出前按復原 → 伺服器上那筆完全不變", async () => {
  server.rows.set("x2", { ...base, id: "x2", amount: 8, created_at: "2026-11-10T10:00:00" });
  const s = await freshStore();
  server.offline = true;
  const backup = s.remove("x2")!;
  s.restore(backup);
  server.offline = false;
  await s.flush();
  await settle(s);
  expect(server.rows.get("x2")).toMatchObject({ amount: 8, created_at: "2026-11-10T10:00:00" });
  expect(row(s, "x2")?.amount).toBe(8);
});

test("送到一半 app 被關掉：重開後已送的和沒送的都在", async () => {
  const s = await freshStore();
  server.offline = true;
  const a = s.add({ ...base, item: "A", amount: 1 });
  const b = s.add({ ...base, item: "B", amount: 2 });
  server.offline = false;
  server.failNextBeforeCommit = 2; // A 成功、B 失敗
  await s.flush();
  await settle(s);
  expect(server.rows.has(a)).toBe(true);
  expect(server.rows.has(b)).toBe(false);
  server.offline = true; // 重開時沒網路
  const s2 = new Store();
  expect(row(s2, a)?.item).toBe("A");
  expect(row(s2, b)?.item).toBe("B");
  server.offline = false;
  await s2.flush();
  await settle(s2);
  expect(server.rows.has(b)).toBe(true);
});

test("還沒送出的新增被修改：保留原本的建立時間", async () => {
  const s = await freshStore();
  server.offline = true;
  const id = s.add({ ...base, amount: 3, created_at: "2026-11-10T08:00:00" });
  s.update(id, { ...base, amount: 4 });
  server.offline = false;
  await s.flush();
  await settle(s);
  expect(server.rows.get(id)).toMatchObject({ amount: 4, created_at: "2026-11-10T08:00:00" });
});

test("伺服器說資料不對（422）才丟掉並提示；405/503 之類的留著重送", async () => {
  const s = await freshStore();
  const notes: string[] = [];
  s.onNotice((m) => notes.push(m));
  server.forceStatus = 422;
  const bad = s.add({ ...base, amount: 1 });
  await settle(s);
  expect(row(s, bad)).toBeUndefined();
  expect(notes.length).toBe(1);
  server.forceStatus = 405; // 例如正在換回舊版
  const keep = s.add({ ...base, amount: 2 });
  await settle(s);
  expect(s.getSnapshot().pending).toBe(1);
  expect(row(s, keep)?.amount).toBe(2);
  await s.flush();
  await settle(s);
  expect(server.rows.get(keep)?.amount).toBe(2);
});

test("修改時對方已經刪掉了（404）：丟掉並提示", async () => {
  server.rows.set("x3", { ...base, id: "x3", amount: 5, created_at: "t" });
  const s = await freshStore();
  const notes: string[] = [];
  s.onNotice((m) => notes.push(m));
  server.rows.delete("x3"); // 對方刪了
  s.update("x3", { ...base, amount: 6 });
  await settle(s);
  expect(notes[0]).toContain("被刪掉");
  expect(s.getSnapshot().pending).toBe(0);
});

test("記美金：畫面先換成 CAD，備註的原幣前綴不會疊兩個", async () => {
  const s = await freshStore();
  server.offline = true;
  const id = s.add({ ...base, amount: 10, currency: "USD", note: "原幣 US$5.00 @1.3000｜tip" });
  expect(row(s, id)).toMatchObject({ amount: 14, currency: "CAD", note: "原幣 US$10.00 @1.4000｜tip" });
});
