/** 這支手機自己的設定（存在手機上，不跟對方共用）。 */
import { useSyncExternalStore } from "react";

export interface Prefs {
  me: string | null; // 這支手機是誰的
  launch: "entry" | "list"; // 打開 app 先看到什麼
  theme: "system" | "light" | "dark";
}

const KEY = "ledger.prefs.v2";
const DEFAULT: Prefs = { me: null, launch: "entry", theme: "system" };

function read(): Prefs {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULT };
  }
}

let prefs = read();
const listeners = new Set<() => void>();

// 舊版加到主畫面的網址帶 ?me=diana：照用，然後把參數從網址拿掉
try {
  const url = new URL(window.location.href);
  const me = url.searchParams.get("me");
  if (me) {
    if (!prefs.me) prefs = { ...prefs, me };
    url.searchParams.delete("me");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
} catch {
  /* 不是瀏覽器（測試）就算了 */
}

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* 存不了就只在這次有效 */
  }
  applyTheme();
  listeners.forEach((f) => f());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => prefs,
  );
}

export function getPrefs(): Prefs {
  return prefs;
}

/** 淺色／深色：跟系統時不設 data-theme，交給 CSS 的 prefers-color-scheme。 */
export function applyTheme() {
  const root = document.documentElement;
  if (prefs.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", prefs.theme);
  const dark = prefs.theme === "dark"
    || (prefs.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute("content", dark ? "#16121d" : "#fbf6f0");
  });
}
