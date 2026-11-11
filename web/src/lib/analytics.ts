/**
 * 統計：lib/analytics.py 的 TypeScript 版，規則一模一樣
 * （tests/golden.test.ts 拿 Python 算的答案逐項對照）。
 *
 * split：half = 兩人對半、own = 付的人自己的、advance = 代墊（付的人幫對方付，統計歸對方）
 * type ：expense / income / settle（結清：person 把欠款付給對方，不算任何人的收支）
 */
import type { Data, Meta, Person, Row, Txn } from "./types";

const SPLITS = new Set(["half", "own", "advance"]);

/**
 * 「不算收支」：押金、幫朋友先墊、朋友還錢這種錢只是進出，不是花掉也不是賺到。
 * 收支、預算、損益、分類統計都不算它；分帳（誰欠誰）照算（看 split）。
 */
export const NON_PL = "不算收支";
export const isPL = (r: { category: string }) => r.category !== NON_PL;
const pl = (rows: Row[]) => rows.filter(isPL);
export const DEFAULT_FIXED = ["居住", "水電網路", "訂閱", "車貸保險"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 後端資料 → 統計用的列（全部換成 CAD；日期不合法的丟掉）。 */
export function toRows(txns: Txn[], rates: Record<string, number>, people: Person[]): Row[] {
  const ids = people.map((p) => p.id);
  const other: Record<string, string> =
    ids.length === 2 ? { [ids[0]]: ids[1], [ids[1]]: ids[0] } : {};
  const out: Row[] = [];
  for (const t of txns) {
    const date = String(t.date ?? "").slice(0, 10);
    if (!validDate(date)) continue;
    const currency = t.currency || "CAD";
    const split = SPLITS.has(String(t.split)) ? String(t.split) : t.shared ? "half" : "own";
    const raw = Number(t.amount);
    const amount = (Number.isFinite(raw) ? raw : 0) * (rates[currency] ?? 1);
    const type = String(t.type ?? "");
    const person = String(t.person ?? "");
    const isAdv = type === "expense" && split === "advance";
    out.push({
      id: t.id,
      date,
      month: date.slice(0, 7),
      created: String(t.created_at ?? ""),
      person,
      owner: isAdv && other[person] ? other[person] : person,
      type,
      category: String(t.category ?? ""),
      item: String(t.item ?? ""),
      amount,
      split,
      note: String(t.note ?? ""),
      currency,
      txn: t,
    });
  }
  return out;
}

export function fixedCats(meta: Meta): string[] {
  if (meta.fixed_categories != null) return [...meta.fixed_categories];
  return DEFAULT_FIXED.filter((c) => meta.categories.expense.includes(c));
}

/** 某人「自己的帳」：金額換成他實際負擔的部分；person=null（綜合）原樣回傳。 */
export function personalView(rows: Row[], person: string | null, ids: string[]): Row[] {
  if (!person || rows.length === 0) return rows;
  const n = Math.max(1, ids.length);
  const out: Row[] = [];
  for (const r of rows) {
    const isExp = r.type === "expense";
    const isHalf = isExp && r.split === "half";
    const isAdv = isExp && r.split === "advance";
    const mine = r.person === person;
    let frac = 0;
    if (r.type === "income" && mine) frac = 1;
    if (isExp && !isHalf && !isAdv && mine) frac = 1;
    if (isHalf) frac = 1 / n;
    if (isAdv && !mine) frac = 1;
    if (frac > 0) out.push(frac === 1 ? r : { ...r, amount: r.amount * frac });
  }
  return out;
}

function sumBy<K extends string>(rows: Row[], key: (r: Row) => K): Map<K, number> {
  const m = new Map<K, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + r.amount);
  return m;
}

function sortedDesc(m: Map<string, number>): [string, number][] {
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const uniqSorted = (xs: string[]) => [...new Set(xs)].sort();

export interface MonthSum {
  month: string;
  income: number;
  expense: number;
  net: number;
}

/** 每月收入/支出/淨存（有任何一列的月份都算，舊到新），取最後 lastN 個月。 */
export function monthlySummary(allRows: Row[], lastN = 12): MonthSum[] {
  const rows = pl(allRows);
  const months = uniqSorted(rows.map((r) => r.month));
  const inc = sumBy(rows.filter((r) => r.type === "income"), (r) => r.month);
  const exp = sumBy(rows.filter((r) => r.type === "expense"), (r) => r.month);
  const all = months.map((month) => {
    const income = inc.get(month) ?? 0;
    const expense = exp.get(month) ?? 0;
    return { month, income, expense, net: income - expense };
  });
  return all.slice(Math.max(0, all.length - lastN));
}

export interface CatAmount {
  category: string;
  amount: number;
}

export function categoryBreakdown(rows: Row[], month: string | null = null,
  type = "expense"): CatAmount[] {
  const sub = pl(rows).filter((r) => r.type === type && (!month || r.month === month));
  return sortedDesc(sumBy(sub, (r) => r.category)).map(([category, amount]) => ({ category, amount }));
}

export interface MonthCat {
  month: string;
  category: string;
  amount: number;
}

/** 逐月×分類（最近 lastN 個「有這種帳」的月份）。 */
export function categoryMonthly(rows: Row[], type = "expense", lastN = 6): MonthCat[] {
  const sub = pl(rows).filter((r) => r.type === type);
  const months = uniqSorted(sub.map((r) => r.month)).slice(-lastN);
  const keep = new Set(months);
  const m = sumBy(sub.filter((r) => keep.has(r.month)), (r) => `${r.month}\u0000${r.category}`);
  return [...m.entries()]
    .map(([k, amount]) => {
      const [month, category] = k.split("\u0000");
      return { month, category, amount };
    })
    .sort((a, b) => a.month.localeCompare(b.month) || b.amount - a.amount);
}

export interface PersonCat {
  category: string;
  person: string;
  amount: number;
}

/** 分類×人：每人算自己實際負擔的部分（平分各一半、代墊歸被墊的人）。 */
export function personCategory(rows: Row[], ids: string[], month: string | null = null): PersonCat[] {
  const sub = pl(rows).filter((r) => r.type === "expense" && (!month || r.month === month));
  const out: PersonCat[] = [];
  for (const pid of ids) {
    const mine = personalView(sub, pid, ids);
    for (const [category, amount] of sortedDesc(sumBy(mine, (r) => r.category))) {
      out.push({ category, person: pid, amount });
    }
  }
  return out;
}

export interface CumRow extends MonthSum {
  cum_net: number;
  save_rate: number | null;
}

export function cumulativeNet(rows: Row[]): CumRow[] {
  let cum = 0;
  return monthlySummary(rows, Number.MAX_SAFE_INTEGER).map((m) => {
    cum += m.net;
    return { ...m, cum_net: cum, save_rate: m.income > 0 ? m.net / m.income : null };
  });
}

export const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

/** 0 = 週一 … 6 = 週日（用 UTC 算，不受手機時區影響）。 */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function weekdayPattern(rows: Row[]): { weekday: number; label: string; amount: number }[] {
  const sub = pl(rows).filter((r) => r.type === "expense");
  if (sub.length === 0) return [];
  const sums = new Array(7).fill(0);
  for (const r of sub) sums[weekdayOf(r.date)] += r.amount;
  return sums.map((amount, weekday) => ({ weekday, label: WEEKDAYS[weekday], amount }));
}

export function topExpenses(rows: Row[], n = 10, month: string | null = null): Row[] {
  return pl(rows)
    .filter((r) => r.type === "expense" && (!month || r.month === month))
    .sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date))
    .slice(0, n);
}

export interface Pnl {
  income: number;
  fixed: number;
  variable: number;
  expense: number;
  disposable: number;
  net: number;
  save_rate: number | null;
  fixed_ratio: number | null;
  income_by: [string, number][];
  fixed_by: [string, number][];
  variable_by: [string, number][];
}

/** 個人損益表：收入 → 固定支出 → 可支配餘裕 → 變動支出 → 淨存。 */
export function pnl(allRows: Row[], fixed: string[], month: string | null = null): Pnl {
  const rows = pl(allRows);
  const sub = month ? rows.filter((r) => r.month === month) : rows;
  const fx = new Set(fixed);
  const inc = sub.filter((r) => r.type === "income");
  const exp = sub.filter((r) => r.type === "expense");
  const fixedRows = exp.filter((r) => fx.has(r.category));
  const varRows = exp.filter((r) => !fx.has(r.category));
  const total = (xs: Row[]) => xs.reduce((s, r) => s + r.amount, 0);
  const income = total(inc);
  const fixedT = total(fixedRows);
  const varT = total(varRows);
  const net = income - fixedT - varT;
  return {
    income,
    fixed: fixedT,
    variable: varT,
    expense: fixedT + varT,
    disposable: income - fixedT,
    net,
    save_rate: income > 0 ? net / income : null,
    fixed_ratio: income > 0 ? fixedT / income : null,
    income_by: sortedDesc(sumBy(inc, (r) => r.category)),
    fixed_by: sortedDesc(sumBy(fixedRows, (r) => r.category)),
    variable_by: sortedDesc(sumBy(varRows, (r) => r.category)),
  };
}

export function pnlYearly(rows: Row[], fixed: string[], year: string) {
  const sub = pl(rows).filter((r) => r.month.startsWith(year));
  return uniqSorted(sub.map((r) => r.month)).map((month) => {
    const p = pnl(sub, fixed, month);
    return { month, income: p.income, fixed: p.fixed, variable: p.variable,
      expense: p.expense, net: p.net, save_rate: p.save_rate };
  });
}

/**
 * Python 的 round(x, 2)：對 x 真正的二進位值四捨五入；只有剛好一半
 * （x = 奇數/8，例如 0.125）時取偶數（0.12）。其餘交給 toFixed（也是對真值捨入）。
 */
export function round2(x: number): number {
  const eighths = x * 8;
  if (Number.isInteger(eighths) && Math.abs(eighths % 2) === 1) {
    const s = x * 100; // 剛好 xx.5，乘 100 不會有誤差
    const f = Math.floor(s);
    return (f % 2 === 0 ? f : f + 1) / 100;
  }
  return Number(x.toFixed(2));
}

const fmt2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface Settlement {
  total: number; // 共同開銷（平分）總額
  advance_total: number; // 代墊總額
  settled_total: number; // 結清總額
  paid: Record<string, number>; // 為對方出的錢（平分＋代墊）
  balance: Record<string, number>; // 該拿回(+) / 該補(−)
  msg: string;
  debtor: string | null;
  creditor: string | null;
  owed: number; // 欠款金額（≥0）
}

/** 結算：平分對半、代墊對方欠全額、自己的不進結算、結清抵掉欠款。 */
export function settlement(rows: Row[], people: Person[], month: string | null = null): Settlement {
  const sub = rows.filter((r) => (r.type === "expense" || r.type === "settle")
    && (!month || r.month === month));
  const ids = people.map((p) => p.id);
  const names = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const exp = sub.filter((r) => r.type === "expense");
  const half = exp.filter((r) => r.split === "half");
  const adv = exp.filter((r) => r.split === "advance");
  const stl = sub.filter((r) => r.type === "settle");
  const by = (xs: Row[], pid: string) => xs.filter((r) => r.person === pid)
    .reduce((s, r) => s + r.amount, 0);
  const halfPaid = Object.fromEntries(ids.map((p) => [p, by(half, p)]));
  const advPaid = Object.fromEntries(ids.map((p) => [p, by(adv, p)]));
  const stlPaid = Object.fromEntries(ids.map((p) => [p, by(stl, p)]));
  const sum = (xs: Row[]) => xs.reduce((s, r) => s + r.amount, 0);
  const total = sum(half);
  const n = ids.length || 1;
  const balance: Record<string, number> = {};
  for (const pid of ids) {
    const othersAdv = ids.filter((q) => q !== pid).reduce((s, q) => s + advPaid[q], 0);
    const othersStl = ids.filter((q) => q !== pid).reduce((s, q) => s + stlPaid[q], 0);
    balance[pid] = round2(halfPaid[pid] - total / n + advPaid[pid]
      - (n > 1 ? othersAdv / (n - 1) : 0) + stlPaid[pid] - (n > 1 ? othersStl / (n - 1) : 0));
  }
  if (ids.length === 2) balance[ids[1]] = -balance[ids[0]];
  const paid = Object.fromEntries(ids.map((p) => [p, halfPaid[p] + advPaid[p]]));
  let msg = "兩不相欠 🎉";
  let debtor: string | null = null;
  let creditor: string | null = null;
  let owed = 0;
  if (ids.length === 2) {
    const [a, b] = ids;
    const diff = balance[a];
    if (Math.abs(diff) >= 0.005) {
      [debtor, creditor] = diff > 0 ? [b, a] : [a, b];
      owed = Math.abs(diff);
      msg = `${names[debtor]} 要給 ${names[creditor]} ${fmt2.format(owed)}`;
    }
  }
  return { total, advance_total: sum(adv), settled_total: sum(stl), paid, balance, msg,
    debtor, creditor, owed };
}

// ---- 日期小工具 ------------------------------------------------------------

export function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export interface PnlCompare {
  cur: Pnl; // 顯示用：這個月全部（含先記好的未來日期）
  curCmp: Pnl; // 比較用：跟 prev 同一段日期
  prev: Pnl | null;
  label: string; // 「比上月同期」或「比上月」
}

/**
 * 損益＋跟上個月比。看的是「這個月」（還沒過完）時，上個月只算到同一天，
 * 不然 10 號的本月跟整個上月比，支出永遠看起來「變少很多」。
 */
export function pnlCompare(rows: Row[], fixed: string[], month: string, today: string): PnlCompare {
  const cur = pnl(rows, fixed, month);
  const pm = prevMonth(month);
  if (!rows.some((r) => r.month === pm && isPL(r))) return { cur, curCmp: cur, prev: null, label: "" };
  if (month === today.slice(0, 7)) {
    const day = Number(today.slice(8, 10));
    const upTo = (m: string) => rows.filter((r) => r.month === m && Number(r.date.slice(8, 10)) <= day);
    return { cur, curCmp: pnl(upTo(month), fixed, month), prev: pnl(upTo(pm), fixed, pm),
      label: `比上月同期（1–${day} 號）` };
  }
  return { cur, curCmp: cur, prev: pnl(rows, fixed, pm), label: "比上月" };
}

export function emptyMeta(): Meta {
  return {
    people: [{ id: "diana", name: "Diana" }, { id: "aras", name: "Aras" }],
    categories: {
      expense: ["外食", "買菜", "居住", "水電網路", "日用品", "家具家電", "交通", "車貸保險",
        "娛樂", "運動", "美容", "衣服", "醫療", "寵物", "訂閱", "其他"],
      income: ["薪資", "獎金", "投資", "其他"],
    },
  };
}

/** 後端 meta 可能缺欄位（舊資料），補成完整的。 */
export function normalizeMeta(meta: Partial<Meta> | undefined): Meta {
  const d = emptyMeta();
  const m = meta ?? {};
  return {
    people: m.people?.length ? m.people : d.people,
    categories: {
      expense: m.categories?.expense?.length ? m.categories.expense : d.categories.expense,
      income: m.categories?.income?.length ? m.categories.income : d.categories.income,
    },
    budgets: m.budgets ?? {},
    fixed_categories: m.fixed_categories,
  };
}

export function rowsOf(data: Data): Row[] {
  return toRows(data.transactions, data.rates, normalizeMeta(data.meta).people);
}
