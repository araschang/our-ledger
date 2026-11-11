/** 總覽：這個月共同花了多少、誰欠誰（可結清）、預算、花在哪、每月走勢。 */
import { useMemo, useState } from "react";
import { BarList, ColumnChart, DataTable } from "../components/charts";
import { Card, MonthNav } from "../components/ui";
import * as A from "../lib/analytics";
import { daysInMonth } from "../lib/analytics";
import { money, monthShort, monthTitle, todayLocal } from "../lib/format";
import { useStore } from "../lib/store";
import type { Txn } from "../lib/types";
import { catEmoji, cx, nameOf, personColor } from "../lib/ui";
import { CategoryDetailSheet, SettleSheet } from "./Shared";

export function Overview({ month, setMonth, range, onEdit, header }: {
  month: string;
  setMonth: (m: string) => void;
  range: [string, string];
  onEdit: (t: Txn) => void;
  header: React.ReactNode;
}) {
  const snap = useStore();
  const data = snap.data!;
  const meta = A.normalizeMeta(data.meta);
  const rows = useMemo(() => A.rowsOf(data), [data]);
  const today = todayLocal();
  const [detail, setDetail] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const [allBudgets, setAllBudgets] = useState(false);
  const [allCats, setAllCats] = useState(false);

  const sMonth = A.settlement(rows, meta.people, month);
  const sAll = A.settlement(rows, meta.people);
  const mRows = rows.filter((r) => r.month === month);
  const joint = sMonth.total + sMonth.advance_total;
  const jointN = mRows.filter((r) => r.type === "expense" && (r.split === "half" || r.split === "advance")).length;
  const spent = mRows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  const income = mRows.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const breakdown = A.categoryBreakdown(rows, month);
  const monthly = A.monthlySummary(rows.filter((r) => r.month <= range[1]), 12);

  // 預算：依「用掉幾成」排，快超或超支的在最上面；這個月還沒過完時畫一條「時間進度」
  const budgets = Object.entries(meta.budgets ?? {})
    .filter(([c, b]) => Number(b) > 0 && meta.categories.expense.includes(c));
  const spentBy = new Map(breakdown.map((b) => [b.category, b.amount]));
  const brows = budgets
    .map(([c, b]) => ({ c, b: Number(b), sp: spentBy.get(c) ?? 0 }))
    .sort((x, y) => y.sp / y.b - x.sp / x.b);
  const totalB = brows.reduce((s, r) => s + r.b, 0);
  const usedB = brows.reduce((s, r) => s + r.sp, 0);
  const isCurrent = month === today.slice(0, 7);
  const pace = isCurrent ? Number(today.slice(8, 10)) / daysInMonth(month) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="safe-t shrink-0 px-2 pt-1.5 pb-1">
        <MonthNav month={month} min={range[0]} max={range[1]} onChange={setMonth} right={header} />
      </div>
      <div className="scroll min-h-0 flex-1 px-3 pb-28">
        <div className="flex flex-col gap-3">
          {/* 共同開銷 */}
          <section className="card p-4">
            <div className="text-[14px] text-ink-2">{monthShort(month)}共同開銷</div>
            <div className="mt-1 text-[44px] leading-tight font-semibold tracking-tight">{money(joint)}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink-2">
              {meta.people.map((p) => (
                <span key={p.id} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: personColor(meta, p.id) }} />
                  {p.name} 付 <span className="tnum font-medium text-ink">{money(sMonth.paid[p.id] ?? 0, { cents: false })}</span>
                </span>
              ))}
              <span className="text-muted">{jointN} 筆</span>
            </div>
            <div className="mt-3 flex gap-2 border-t border-line pt-3 text-[14px]">
              <div className="flex-1">
                <div className="text-muted">全部支出</div>
                <div className="tnum font-semibold">{money(spent)}</div>
              </div>
              <div className="flex-1">
                <div className="text-muted">收入</div>
                <div className="tnum font-semibold text-good">{money(income)}</div>
              </div>
            </div>
          </section>

          {/* 分帳 */}
          <section className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[14px] text-ink-2">
                  {sAll.debtor ? `${nameOf(meta, sAll.debtor)} 要給 ${nameOf(meta, sAll.creditor!)}` : "分帳"}
                </div>
                <div className="mt-0.5 text-[28px] leading-tight font-semibold tracking-tight">
                  {sAll.debtor ? money(sAll.owed) : "兩不相欠 🎉"}
                </div>
              </div>
              {sAll.debtor && (
                <button className="press shrink-0 rounded-xl bg-primary px-4 py-2.5 text-[15px] font-semibold text-on-primary"
                  onClick={() => setSettling(true)}>
                  結清
                </button>
              )}
            </div>
            <div className="mt-2 text-[12px] text-muted">
              從開始記帳累計到今天，結清過的已經扣掉{sAll.settled_total > 0 ? `（累計結清 ${money(sAll.settled_total, { cents: false })}）` : ""}。
            </div>
          </section>

          {/* 預算 */}
          {brows.length > 0 && (
            <Card title={`${monthShort(month)}預算`}
              right={<span className="tnum text-[13px] text-ink-2">已用 {money(usedB, { cents: false })} / {money(totalB, { cents: false })}</span>}>
              <div className="flex flex-col gap-3">
                {(allBudgets ? brows : brows.slice(0, 5)).map(({ c, b, sp }) => {
                  const r = sp / b;
                  const color = r > 1 ? "var(--bad)" : r >= 0.8 ? "var(--warn)" : "var(--series-1)";
                  return (
                    <button key={c} className="press text-left" onClick={() => setDetail(c)}>
                      <div className="flex items-baseline justify-between gap-2 text-[15px]">
                        <span className="truncate">{catEmoji(c)} {c}</span>
                        <span className="tnum shrink-0">
                          <b className="font-semibold">{money(sp, { cents: false })}</b>
                          <span className="text-muted"> / {money(b, { cents: false })}</span>
                        </span>
                      </div>
                      <div className="relative mt-1.5 h-2 rounded-full" style={{ background: `color-mix(in oklab, ${color} 16%, var(--card))` }}>
                        <div className="h-2 rounded-full" style={{ width: `${Math.min(100, r * 100)}%`, background: color }} />
                        {pace !== null && (
                          <div className="absolute -top-1 h-4 w-[2px] rounded-full bg-ink-2/60" style={{ left: `${pace * 100}%` }} />
                        )}
                      </div>
                      <div className={cx("mt-1 text-[12px]", r > 1 ? "font-medium text-bad" : "text-muted")}>
                        {r > 1 ? `⚠ 超支 ${money(sp - b, { cents: false })}`
                          : b - sp < 0.5 ? "剛好用完"
                            : r >= 0.8 ? `快用完：剩 ${money(b - sp, { cents: false })}`
                              : `剩 ${money(b - sp, { cents: false })}`}
                      </div>
                    </button>
                  );
                })}
              </div>
              {brows.length > 5 && (
                <button className="press mt-3 text-[14px] text-link" onClick={() => setAllBudgets((v) => !v)}>
                  {allBudgets ? "收起" : `顯示全部 ${brows.length} 項`}
                </button>
              )}
              {pace !== null && (
                <div className="mt-2 text-[12px] text-muted">直線＝這個月已經過了 {Math.round(pace * 100)}%</div>
              )}
            </Card>
          )}

          {/* 花在哪 */}
          <Card title="花在哪些分類" right={<span className="text-[13px] text-muted">點分類看明細</span>}>
            {breakdown.length === 0 ? (
              <div className="py-4 text-center text-[14px] text-muted">{monthTitle(month)}還沒有支出</div>
            ) : (
              <>
                <BarList total={spent}
                  rows={(allCats ? breakdown : breakdown.slice(0, 6)).map((b) => ({
                    key: b.category, label: `${catEmoji(b.category)} ${b.category}`, value: b.amount }))}
                  onSelect={setDetail} />
                {breakdown.length > 6 && (
                  <button className="press mt-1 text-[14px] text-link" onClick={() => setAllCats((v) => !v)}>
                    {allCats ? "收起" : `顯示全部 ${breakdown.length} 類`}
                  </button>
                )}
              </>
            )}
          </Card>

          {/* 每月支出 */}
          <Card title="每月支出" right={<span className="text-[13px] text-muted">點柱子換月份</span>}>
            <ColumnChart emphasis selected={month} onSelect={setMonth}
              data={monthly.map((m) => ({ key: m.month, label: monthShort(m.month), value: m.expense }))} />
            <DataTable head={["月份", "支出", "收入", "淨存"]}
              rows={[...monthly].reverse().map((m) => [monthTitle(m.month), money(m.expense), money(m.income), money(m.net)])} />
          </Card>
        </div>
      </div>

      <CategoryDetailSheet open={!!detail} onClose={() => setDetail(null)} category={detail} month={month}
        rows={rows} type="expense" onEdit={onEdit} />
      <SettleSheet open={settling} onClose={() => setSettling(false)} s={sAll} />
    </div>
  );
}
