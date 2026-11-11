/**
 * 新版 TS 統計 vs 現行 Python 統計（tests/golden/make_golden.py 算的答案）逐項對照。
 * fixtures/synth.* 是假資料（進 git）；設了 REAL_GOLDEN_DIR 會再對一次真實資料的複本。
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import * as A from "../src/lib/analytics";
import type { Data } from "../src/lib/types";

const TOL = 1e-6;

function close(a: number | null | undefined, b: number | null | undefined, path: string) {
  if (a == null || b == null) {
    expect({ path, v: a ?? null }).toEqual({ path, v: b ?? null });
    return;
  }
  if (Math.abs(a - b) > TOL * Math.max(1, Math.abs(b))) {
    throw new Error(`${path}: ts ${a} != py ${b}`);
  }
}

function closeMap(ts: Record<string, number>, py: Record<string, number>, path: string) {
  expect(Object.keys(ts).sort()).toEqual(Object.keys(py).sort());
  for (const k of Object.keys(py)) close(ts[k], py[k], `${path}.${k}`);
}

const pairs = (xs: [string, number][]) => Object.fromEntries(xs);

function check(name: string, dataPath: string, goldenPath: string) {
  const data: Data = JSON.parse(readFileSync(dataPath, "utf8"));
  const g = JSON.parse(readFileSync(goldenPath, "utf8"));
  const meta = A.normalizeMeta(data.meta);
  const ids = meta.people.map((p) => p.id);
  const rows = A.rowsOf(data);
  const fixed = A.fixedCats(meta);

  describe(name, () => {
    test("fixed categories", () => expect(fixed).toEqual(g.fixed));

    for (const view of ["all", ...ids]) {
      test(`view ${view}`, () => {
        const gv = g.views[view];
        const sub = A.personalView(rows, view === "all" ? null : view, ids);
        expect(sub.length).toBe(gv.count);
        const months = [...new Set(sub.map((r) => r.month))].sort();
        expect(months).toEqual(gv.months);
        for (const m of [...months, null]) {
          const key = m ?? "all";
          const p = A.pnl(sub, fixed, m);
          const gp = gv.pnl[key];
          for (const k of ["income", "fixed", "variable", "expense", "disposable", "net",
            "save_rate", "fixed_ratio"] as const) close(p[k], gp[k], `${view}.${key}.pnl.${k}`);
          closeMap(pairs(p.income_by), gp.income_by, `${view}.${key}.income_by`);
          closeMap(pairs(p.fixed_by), gp.fixed_by, `${view}.${key}.fixed_by`);
          closeMap(pairs(p.variable_by), gp.variable_by, `${view}.${key}.variable_by`);
          closeMap(Object.fromEntries(A.categoryBreakdown(sub, m).map((c) => [c.category, c.amount])),
            gv.breakdown[key], `${view}.${key}.breakdown`);
          const top = A.topExpenses(sub, 10, m).map((r) => r.amount);
          expect(top.length).toBe(gv.top[key].length);
          top.forEach((a, i) => close(a, gv.top[key][i], `${view}.${key}.top[${i}]`));
        }
        const ms = A.monthlySummary(sub, 12);
        expect(ms.map((x) => x.month)).toEqual(gv.monthly.map((x: { month: string }) => x.month));
        ms.forEach((x, i) => {
          close(x.income, gv.monthly[i].income, `${view}.monthly.income`);
          close(x.expense, gv.monthly[i].expense, `${view}.monthly.expense`);
          close(x.net, gv.monthly[i].net, `${view}.monthly.net`);
        });
        const cn = A.cumulativeNet(sub);
        expect(cn.length).toBe(gv.cumulative.length);
        cn.forEach((x, i) => {
          close(x.cum_net, gv.cumulative[i].cum_net, `${view}.cum.${x.month}`);
          close(x.save_rate, gv.cumulative[i].save_rate, `${view}.save_rate.${x.month}`);
        });
        const wd = A.weekdayPattern(sub).map((w) => w.amount);
        expect(wd.length).toBe(gv.weekday.length);
        wd.forEach((a, i) => close(a, gv.weekday[i], `${view}.weekday[${i}]`));
        const cm = Object.fromEntries(A.categoryMonthly(sub, "expense", 6)
          .map((x) => [`${x.month}|${x.category}`, x.amount]));
        closeMap(cm, Object.fromEntries(gv.category_monthly
          .map((x: { month: string; category: string; amount: number }) =>
            [`${x.month}|${x.category}`, x.amount])), `${view}.category_monthly`);
        for (const [year, gy] of Object.entries(gv.yearly) as [string, Record<string, number>[]][]) {
          const ty = A.pnlYearly(sub, fixed, year);
          expect(ty.map((x) => x.month)).toEqual(gy.map((x) => x.month as unknown as string));
          ty.forEach((x, i) => {
            for (const k of ["income", "fixed", "variable", "expense", "net", "save_rate"] as const) {
              close(x[k], gy[i][k], `${view}.yearly.${year}.${x.month}.${k}`);
            }
          });
        }
      });
    }

    test("settlement + person×category", () => {
      const months = [...new Set(rows.map((r) => r.month))].sort();
      for (const m of [...months, null]) {
        const key = m ?? "all";
        const s = A.settlement(rows, meta.people, m);
        const gs = g.settlement[key];
        close(s.total, gs.total, `settle.${key}.total`);
        close(s.advance_total, gs.advance_total, `settle.${key}.advance_total`);
        close(s.settled_total, gs.settled_total, `settle.${key}.settled_total`);
        closeMap(s.paid, gs.paid, `settle.${key}.paid`);
        closeMap(s.balance, gs.balance, `settle.${key}.balance`);
        expect(s.msg).toBe(gs.msg);
        const pc = Object.fromEntries(A.personCategory(rows, ids, m)
          .map((x) => [`${x.category}|${x.person}`, x.amount]));
        closeMap(pc, g.person_category[key], `pc.${key}`);
      }
    });
  });
}

check("synthetic", `${import.meta.dir}/fixtures/synth.json`, `${import.meta.dir}/fixtures/synth.golden.json`);
const real = process.env.REAL_GOLDEN_DIR;
if (real && existsSync(`${real}/real.json`)) {
  check("real data copy", `${real}/real.json`, `${real}/real.golden.json`);
}

test("round2 = Python round(x, 2)", () => {
  const cases: [number, number][] = JSON.parse(
    readFileSync(`${import.meta.dir}/fixtures/round2.json`, "utf8"));
  const bad = cases.filter(([x, py]) => A.round2(x) !== py && !(A.round2(x) === 0 && py === 0));
  expect(bad).toEqual([]);
});

test("MTD comparison uses the same days of last month", () => {
  const data: Data = {
    meta: A.emptyMeta(), rates: { CAD: 1 },
    transactions: [
      { id: "a", created_at: "", date: "2026-10-05", person: "aras", type: "expense", category: "外食",
        item: "", amount: 10, note: "", source: "", currency: "CAD", split: "own" },
      { id: "b", created_at: "", date: "2026-10-25", person: "aras", type: "expense", category: "外食",
        item: "", amount: 100, note: "", source: "", currency: "CAD", split: "own" },
      { id: "c", created_at: "", date: "2026-11-03", person: "aras", type: "expense", category: "外食",
        item: "", amount: 20, note: "", source: "", currency: "CAD", split: "own" },
    ],
  };
  const rows = A.rowsOf(data);
  const c = A.pnlCompare(rows, [], "2026-11", "2026-11-10");
  expect(c.prev?.expense).toBe(10);
  expect(c.label).toContain("同期");
  const full = A.pnlCompare(rows, [], "2026-11", "2026-12-02");
  expect(full.prev?.expense).toBe(110);
});
