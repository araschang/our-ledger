// 手機尺寸（390×844、觸控）的整套操作測試：記一筆、修改、左滑刪除/復原、結清/復原、報表、深色、離線補送。
// 只能對「測試用」資料庫的開發伺服器跑（預設 http://127.0.0.1:8510）。用法：PROFILE=$(mktemp -d) bun flow.ts <截圖資料夾>
import { launch } from "./cdp";
const OUT = process.argv[2];
const BASE = process.env.BASE ?? "http://127.0.0.1:8510";
if (/:(8501|8011)\b/.test(BASE)) throw new Error("不要對正式的記帳本跑 E2E（會新增/刪除資料）");
const b = await launch(process.env.PROFILE!);
const api = async () => (await fetch(`${BASE}/api/data`)).json();
const fails: string[] = [];
const check = (ok: unknown, msg: string) => { console.log(ok ? "PASS" : "FAIL", msg); if (!ok) fails.push(msg); };
const step = async (name: string, fn: () => Promise<void>) => {
  try { await fn(); } catch (e) { console.log("ERROR in", name, String(e)); fails.push(`${name}: ${e}`); await b.shot(`${OUT}/err-${name}.png`); }
};
const errs: string[] = [];
const t0 = Date.now();
await b.goto(`${BASE}/`);

await step("firstrun", async () => {
  await b.waitFor(`document.body.innerText.includes("這支手機是誰的")`, 60000);
  console.log("first paint after", Date.now() - t0, "ms (includes headless-chrome start delay)");
  await b.shot(`${OUT}/01-firstrun.png`);
  await b.tap("text=Aras", 700);
});

let added: any;
await step("add", async () => {
  await b.waitFor(`!!document.querySelector('[aria-label="分類"]')`);
  await b.shot(`${OUT}/02-entry.png`);
  for (const k of ["1", "2", ".", "5"]) await b.tap(`aria=${k}`, 60);
  await b.tap("text=外食", 300);
  await b.shot(`${OUT}/03-entry-filled.png`);
  await b.tap('input[placeholder^="品項"]', 200);
  await b.type("E2E 測試午餐");
  await b.ev(`document.activeElement.blur()`);
  await b.sleep(300);
  await b.shot(`${OUT}/04-entry-item.png`);
  await b.tap("text=記下來", 900);
  await b.shot(`${OUT}/05-list-after-save.png`);
  await b.sleep(1500);
  const d = await api();
  added = d.transactions.find((t: any) => t.item === "E2E 測試午餐");
  check(added && added.amount === 12.5 && added.person === "aras" && added.category === "外食" && added.source === "app",
    `added row on server ${JSON.stringify(added)}`);
});

await step("edit", async () => {
  await b.tap(`#row-${added.id} [role=button]`, 700);
  await b.shot(`${OUT}/06-edit.png`);
  for (let i = 0; i < 5; i++) await b.tap("aria=刪掉一位", 50);
  for (const k of ["3", "0"]) await b.tap(`aria=${k}`, 60);
  await b.tap("text=儲存", 900);
  await b.sleep(1500);
  const d = await api();
  const t = d.transactions.find((x: any) => x.id === added.id);
  check(t?.amount === 30 && t.created_at === added.created_at, `edited amount 30, same created_at (${t?.amount})`);
});

await step("swipe-delete-undo", async () => {
  // 1) 滑出刪除鍵、點它（真人：滑完停一下再點）
  let c = await b.center(`#row-${added.id} [role=button]`);
  await b.swipe(c.x + 60, c.y, c.x - 60, c.y, 12);
  await b.shot(`${OUT}/07-swipe.png`);
  await b.sleep(400);
  await b.tap(`#row-${added.id} button[aria-label="刪除這筆"]`, 600);
  await b.shot(`${OUT}/08-deleted-toast.png`);
  await b.sleep(1500);
  let d = await api();
  check(!d.transactions.find((x: any) => x.id === added.id), "reveal+tap: row deleted on server");
  await b.tap("text=復原", 600);
  await b.sleep(1800);
  d = await api();
  let r = d.transactions.find((x: any) => x.id === added.id);
  check(r && r.amount === 30 && r.created_at === added.created_at, "undo restored same id/created_at");
  // 2) 整個滑過去直接刪
  await b.sleep(500);
  c = await b.center(`#row-${added.id} [role=button]`);
  await b.swipe(c.x + 150, c.y, c.x - 140, c.y, 14);
  await b.sleep(1500);
  d = await api();
  check(!d.transactions.find((x: any) => x.id === added.id), "full swipe: row deleted on server");
  await b.tap("text=復原", 600);
  await b.sleep(1800);
  d = await api();
  r = d.transactions.find((x: any) => x.id === added.id);
  check(r && r.amount === 30, "undo after full swipe");
});

await step("legacy-id", async () => {
  // 舊 Sheet 搬來的 id（7.3061e+89）也要能改
  const id = "7.3061e+89";
  const before = (await api()).transactions.find((t: any) => t.id === id);
  if (!before) { console.log("skip legacy-id (no such row in this DB)"); return; }
  await b.tap("aria=搜尋", 400);
  await b.type("加油");
  await b.sleep(500);
  await b.tap(`[id="row-${id}"] [role=button]`, 700);
  for (let i = 0; i < 6; i++) await b.tap("aria=刪掉一位", 40);
  for (const k of ["4", "1", ".", "1", "7"]) await b.tap(`aria=${k}`, 50);
  await b.tap("text=儲存", 900);
  await b.sleep(1500);
  const after = (await api()).transactions.find((t: any) => t.id === id);
  check(after?.amount === 41.17 && after.created_at === before.created_at, `legacy id edited (${after?.amount})`);
  await fetch(`${BASE}/api/transactions/${encodeURIComponent(id)}`, { method: "PUT",
    headers: { "X-Ledger": "1", "Content-Type": "application/json" }, body: JSON.stringify({ ...before, amount: before.amount }) });
  await b.tap("text=取消", 400);
});

await step("overview+settle", async () => {
  await b.tap("text=總覽", 700);
  await b.shot(`${OUT}/09-overview.png`);
  await b.shot(`${OUT}/09b-overview-full.png`, true);
  await b.tap("text=結清", 600);
  await b.shot(`${OUT}/10-settle.png`);
  await b.tap("text=記下：", 900);
  await b.sleep(1500);
  const d = await api();
  const st = d.transactions.find((t: any) => t.type === "settle");
  check(st && st.category === "結清" && st.split === "own", `settle row ${JSON.stringify(st)}`);
  await b.shot(`${OUT}/11-overview-settled.png`);
  const txt = await b.ev("document.body.innerText");
  check(txt.includes("兩不相欠"), "balance shows 兩不相欠 after full settle");
  await b.tap("text=復原", 600);
  await b.sleep(1800);
  const d2 = await api();
  check(!d2.transactions.find((t: any) => t.type === "settle"), "settle undone");
});

await step("reports", async () => {
  await b.tap("text=報表", 700);
  await b.shot(`${OUT}/12-reports-pnl.png`, true);
  await b.tap("text=分類", 600);
  await b.shot(`${OUT}/13-reports-cats.png`, true);
  await b.tap("text=趨勢", 600);
  await b.shot(`${OUT}/14-reports-trend.png`, true);
  await b.tap("text=Diana自己", 600);
  await b.shot(`${OUT}/15-reports-trend-diana.png`, true);
  await b.tap("text=損益", 600);
  await b.shot(`${OUT}/15b-reports-pnl-diana.png`, true);
});

await step("settings", async () => {
  await b.tap("text=設定", 700);
  await b.shot(`${OUT}/16-settings.png`, true);
});

await step("list+search", async () => {
  await b.tap("text=明細", 700);
  await b.shot(`${OUT}/17-list.png`);
  await b.tap("aria=搜尋", 400);
  await b.type("Costco");
  await b.sleep(400);
  await b.shot(`${OUT}/18-search.png`);
  await b.tap("text=取消", 400);
});

await step("dark", async () => {
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await b.sleep(300);
  await b.shot(`${OUT}/19-list-dark.png`);
  await b.tap("text=總覽", 600);
  await b.shot(`${OUT}/20-overview-dark.png`);
  await b.tap("text=報表", 600);
  await b.tap("text=分類", 600);
  await b.shot(`${OUT}/21-cats-dark.png`, true);
  await b.tap("aria=記一筆", 700);
  await b.shot(`${OUT}/22-entry-dark.png`);
});

await step("offline", async () => {
  await b.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await b.sleep(300);
  for (const k of ["7"]) await b.tap(`aria=${k}`, 60);
  await b.tap("text=買菜", 300);
  await b.tap('input[placeholder^="品項"]', 200);
  await b.type("E2E 離線");
  await b.ev(`document.activeElement.blur()`);
  await b.sleep(200);
  await b.tap("text=記下來", 900);
  await b.sleep(800);
  await b.shot(`${OUT}/23-offline-pending.png`);
  let d = await api();
  check(!d.transactions.find((t: any) => t.item === "E2E 離線"), "offline entry not on server yet");
  const pend = await b.ev(`document.body.innerText.includes("待上傳")`);
  check(pend, "pending marker shown while offline");
  await b.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await b.waitFor(`!document.body.innerText.includes("待上傳")`, 30000);
  d = await api();
  check(d.transactions.find((t: any) => t.item === "E2E 離線"), "offline entry reached server after reconnect");
  await b.shot(`${OUT}/24-online-synced.png`);
});

// 清掉測試資料
const d = await api();
for (const t of d.transactions.filter((t: any) => String(t.item).startsWith("E2E"))) {
  await fetch(`${BASE}/api/transactions/${t.id}`, { method: "DELETE", headers: { "X-Ledger": "1" } });
}
const cons = b.events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error"));
console.log("console errors:", cons.length, cons.slice(0, 5).map((e) => JSON.stringify(e.params).slice(0, 300)));
console.log("FAILS:", fails.length, fails);
b.close();
process.exit(0);
