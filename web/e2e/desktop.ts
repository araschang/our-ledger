// 電腦版操作測試（只能對「測試用」資料庫的開發伺服器跑，預設 http://127.0.0.1:8510；用法：bun desktop.ts <截圖資料夾>）：N 開記帳 → 鍵盤打金額 → 點分類 → 品項按 Enter 記下 → 滑鼠刪除 → 復原 → 再刪掉。
import { launch } from "./cdp.ts";
const out = process.argv[2];
const BASE = (process.env.BASE ?? "http://127.0.0.1:8510").replace(/\/?$/, "/");
const fails: string[] = [];
const check = (ok: unknown, msg: string) => { console.log(ok ? "PASS" : "FAIL", msg); if (!ok) fails.push(msg); };
const api = async () => (await (await fetch(BASE + "api/data")).json()) as any;
const b = await launch(`${out}/prof-desk-flow`, 1440, 900);
try {
  await b.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await b.send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" });
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.goto(BASE);
  await b.waitFor(`document.readyState === "complete"`, 60000);
  await b.ev(`localStorage.setItem("ledger.prefs.v2", JSON.stringify({ me: "aras", launch: "entry" })); true`);
  await b.goto(BASE);
  await b.waitFor(`!!document.querySelector("#app-shell main > *")`, 60000);
  await b.sleep(800);
  check(!(await b.ev(`!!document.querySelector('[aria-label="分類"]')`)), "desktop does not auto-open the entry dialog");
  const key = async (k: string, code = k) => {
    for (const type of ["keyDown", "keyUp"]) await b.send("Input.dispatchKeyEvent", { type, key: k, code, text: type === "keyDown" && k.length === 1 ? k : undefined });
    await b.sleep(60);
  };
  const click = async (q: string, wait = 400) => {
    let c = await b.center(q);
    for (let i = 0; !c && i < 15; i++) { await b.sleep(200); c = await b.center(q); }
    if (!c) throw new Error(`not found: ${q}`);
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
    for (const type of ["mousePressed", "mouseReleased"]) await b.send("Input.dispatchMouseEvent", { type, x: c.x, y: c.y, button: "left", clickCount: 1 });
    await b.sleep(wait);
  };
  await key("n", "KeyN");
  await b.waitFor(`!!document.querySelector('[aria-label="分類"]')`, 5000);
  check(true, "N opens the entry dialog");
  check(!(await b.ev(`!!document.querySelector('[aria-label="刪掉一位"]')`)), "no on-screen keypad on desktop");
  for (const k of ["2", "3", ".", "5"]) await key(k, k === "." ? "Period" : `Digit${k}`);
  const shown = await b.ev(`document.querySelector('[role=dialog]').innerText`);
  check(String(shown).includes("23.5"), "keyboard digits show in the amount");
  await click("text=外食");
  await click('input[placeholder="品項（可不填）"]');
  await b.type("E2E 桌機");
  await key("Enter", "Enter");
  await b.sleep(1500);
  let d = await api();
  const row = d.transactions.find((t: any) => t.item === "E2E 桌機");
  check(row && row.amount === 23.5 && row.category === "外食" && row.person === "aras", `Enter in item saves (${JSON.stringify(row ?? null)})`);
  await b.shot(`${out}/desk-flow-saved.png`);
  await click(`#row-${row.id} [aria-label="刪除這筆"]`, 1500);
  d = await api();
  check(!d.transactions.find((t: any) => t.id === row.id), "hover trash deletes on server");
  await click("text=復原", 1500);
  d = await api();
  check(d.transactions.find((t: any) => t.id === row.id), "undo restores");
  await click(`#row-${row.id} [aria-label="刪除這筆"]`, 1500);
  d = await api();
  check(!d.transactions.find((t: any) => t.id === row.id), "cleanup delete");
  const errs = b.events.filter((e: any) => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error"));
  check(errs.length === 0, `console errors: ${errs.length}`);
} finally { b.close(); }
console.log("FAILS:", fails.length, fails);
