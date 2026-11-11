// 小型 CDP 驅動：開 headless Chrome（iPhone 尺寸＋觸控）、點、滑、截圖、執行 JS。
export async function launch(profile: string, w = 390, h = 844) {
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = Bun.spawn(["google-chrome", "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stderr: "ignore", stdout: "ignore" });
  let tabs: any[] = [];
  for (let i = 0; i < 80; i++) {
    try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.length) break; } catch {}
    await Bun.sleep(200);
  }
  const page = tabs.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map<number, (v: any) => void>();
  const events: any[] = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data as string);
    if (d.id && pending.has(d.id)) { pending.get(d.id)!(d.error ? { __error: d.error } : d.result); pending.delete(d.id); }
    else if (d.method) events.push(d);
  };
  const send = (method: string, params: any = {}) => new Promise<any>((r) => {
    const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  const ev = async (expr: string) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r?.exceptionDetails) throw new Error(`JS error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r?.result?.value;
  };
  const sleep = (ms: number) => Bun.sleep(ms);
  // 找元素中心：selector，或 text: 開頭 = 按鈕/可點元素的文字完全相同（或包含）
  const center = async (q: string) => ev(`(() => {
    const q = ${JSON.stringify(q)};
    // 跟真人一樣：只算畫面上點得到的（最上層對話框優先、被蓋住的不算）
    const dialogs = [...document.querySelectorAll('[role=dialog]')];
    const scope = dialogs.length ? dialogs[dialogs.length - 1] : document;
    const hittable = (el) => {
      // 捲到中間（捲到邊邊會被底部的分頁列或頂欄蓋住，真人也點不到）
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
    };
    let cands = [];
    if (q.startsWith("text=")) {
      const t = q.slice(5);
      const all = [...scope.querySelectorAll('button,[role=button],[role=radio],label,a')];
      cands = [...all.filter(e => (e.innerText ?? e.textContent ?? "").trim() === t), ...all.filter(e => (e.innerText ?? e.textContent ?? "").trim() !== t && (e.innerText ?? e.textContent ?? "").trim().includes(t))];
    } else if (q.startsWith("aria=")) {
      cands = [...scope.querySelectorAll('[aria-label="' + q.slice(5) + '"]')];
    } else cands = [...scope.querySelectorAll(q)];
    const el = cands.find(hittable);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`);
  const tap = async (q: string, wait = 250) => {
    let c = await center(q);
    for (let i = 0; !c && i < 15; i++) { await sleep(200); c = await center(q); } // 動畫中、還沒畫好
    if (!c) throw new Error(`not found: ${q}`);
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y }] });
    await sleep(40);
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(wait);
    return c;
  };
  const swipe = async (x0: number, y0: number, x1: number, y1: number, steps = 8) => {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= steps; i++) {
      await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }] });
      await sleep(16);
    }
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(300);
  };
  const type = async (text: string) => { await send("Input.insertText", { text }); await sleep(100); };
  const shot = async (path: string, full = false) => {
    let clip;
    if (full) {
      const hgt = await ev(`Math.max(...[...document.querySelectorAll('.scroll')].map(e => e.scrollHeight), innerHeight)`);
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: Math.min(hgt + 80, 4000), deviceScaleFactor: 2, mobile: true });
      await sleep(400);
    }
    const r = await send("Page.captureScreenshot", { format: "png", clip });
    await Bun.write(path, Buffer.from(r.data, "base64"));
    if (full) { await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true }); await sleep(300); }
  };
  const goto = async (url: string) => { await send("Page.navigate", { url }); };
  const waitFor = async (expr: string, ms = 40000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return Date.now() - t0; await sleep(100); }
    throw new Error(`timeout waiting for ${expr}`);
  };
  const close = () => { ws.close(); chrome.kill(); };
  return { send, ev, tap, swipe, type, shot, goto, waitFor, sleep, center, close, events };
}
