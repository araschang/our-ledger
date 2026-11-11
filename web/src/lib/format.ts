import { WEEKDAYS, weekdayOf } from "./analytics";

const n2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const MINUS = "−";

export const CURRENCY_SYMBOL: Record<string, string> = { CAD: "$", USD: "US$", TWD: "NT$" };

/** $1,234.56；負數用真正的減號。cents=false 時四捨五入到元。 */
export function money(x: number, opts: { cents?: boolean; sign?: boolean; currency?: string } = {}): string {
  const { cents = true, sign = false, currency = "CAD" } = opts;
  const v = Math.abs(x) < 0.005 ? 0 : x;
  const body = (cents ? n2 : n0).format(Math.abs(v));
  const sym = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const pre = v < 0 ? MINUS : sign && v > 0 ? "+" : "";
  return `${pre}${sym}${body}`;
}

/** 軸上的短數字：$950、$1.2K、$12K。 */
export function compact(x: number): string {
  const a = Math.abs(x);
  const s = x < 0 ? MINUS : "";
  if (a >= 10_000) return `${s}$${Math.round(a / 1000)}K`;
  if (a >= 1000) return `${s}$${(a / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${s}$${Math.round(a)}`;
}

export function pct(x: number | null | undefined, digits = 0): string {
  if (x == null || !Number.isFinite(x)) return "—";
  const s = Math.abs(x * 100).toFixed(digits);
  return `${x < 0 && Number(s) !== 0 ? MINUS : ""}${s}%`;
}

export function monthTitle(month: string): string {
  return `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`;
}

export function monthShort(month: string): string {
  return `${Number(month.slice(5, 7))}月`;
}

/** 11/10（二） */
export function dayShort(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${WEEKDAYS[weekdayOf(date)]}）`;
}

/** 列表的日期標題：今天 / 昨天 / 11月8日 週六 */
export function dayHeading(date: string, today: string): string {
  if (date === today) return "今天";
  if (date === addDays(today, -1)) return "昨天";
  if (date === addDays(today, 1)) return "明天";
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日 週${WEEKDAYS[weekdayOf(date)]}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** 手機上的今天（裝置時區；兩支手機都在溫哥華）。 */
export function todayLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function nowLocalIso(now = new Date()): string {
  const t = (n: number) => String(n).padStart(2, "0");
  return `${todayLocal(now)}T${t(now.getHours())}:${t(now.getMinutes())}:${t(now.getSeconds())}`;
}

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "剛剛";
  if (s < 3600) return `${Math.round(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小時前`;
  return `${Math.round(s / 86400)} 天前`;
}
