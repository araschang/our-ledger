/* 我們的記帳本：讓 app 沒網路也打得開。
 * - 頁面（index.html）：先問網路（3 秒內），拿不到才用快取 → 新版一上線，下次打開就是新的
 * - /assets/*（檔名含雜湊、內容不會變）：快取優先
 * - /api/*：不經過這裡（資料由 app 自己存在手機上、自己同步）
 */
const CACHE = "ledger-app-v2";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  const assets = keys.filter((r) => new URL(r.url).pathname.startsWith("/assets/"));
  for (const r of assets.slice(0, Math.max(0, assets.length - 40))) await cache.delete(r);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      // 只把真的 app 頁面（HTML、200）存成離線用的那份；/healthz 之類的不存
      const net = fetch(req).then(async (res) => {
        if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
          await cache.put("/", res.clone());
        }
        return res;
      });
      try {
        const res = await Promise.race([
          net,
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
        ]);
        if (res.ok) return res;
        return (await cache.match("/")) || res; // 伺服器出錯（5xx）：先用手機上的 app
      } catch {
        e.waitUntil(net.catch(() => {})); // 網路慢：先開舊的，晚到的新版照樣存起來，下次就是新的
        return (await cache.match("/")) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      // 只存真的 JS/CSS（找不到時伺服器回 404；萬一回 HTML 也不存，免得 app 變空白）
      if (res.ok && !(res.headers.get("content-type") || "").includes("text/html")) {
        await cache.put(req, res.clone());
        trim(cache);
      }
      return res;
    })());
    return;
  }

  // 圖示、manifest：有快取先用，背景更新
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const net = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  })());
});
