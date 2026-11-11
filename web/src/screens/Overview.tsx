/** 總覽：這個月共同花了多少、誰欠誰（可結清）、預算、花在哪、每月走勢。 */
import { useMemo, useState } from "react";
import { CategoryBars, ColumnChart, DataTable } from "../components/charts";
import { CatIcon, Dot, Group, MonthRow, Screen } from "../components/ui";
import * as A from "../lib/analytics";
import { daysInMonth } from "../lib/analytics";
import { money, monthShort, monthTitle, todayLocal } from "../lib/format";
import { useStore } from "../lib/store";
import type { Txn } from "../lib/types";
import { cx, nameOf, personColor } from "../lib/ui";
import { CategoryDetailSheet, SettleSheet } from "./Shared";

export function Overview({ month, setMonth, range, onEdit, trailing }: {
  month: string;
  setMonth: (m: string) => void;
  range: [string, string];
  onEdit: (t: Txn) => void;
  trailing: React.ReactNode;
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

  const sAll = A.settlement(rows, meta.people);
  const mRows = rows.filter((r) => r.month === month && A.isPL(r));
  const jointRows = mRows.filter((r) => r.type === "expense" && (r.split === "half" || r.split === "advance"));
  const joint = jointRows.reduce((s, r) => s + r.amount, 0);
  const jointN = jointRows.length;
  const spent = mRows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  const income = mRows.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const breakdown = A.categoryBreakdown(rows, month);
  const monthly = A.monthlySummary(rows.filter((r) => r.month <= range[1]), 12);

  // 預算：依「用掉幾成」排，快超或超支的在最上面；這個月還沒過完時標出「時間進度」
  const spentBy = new Map(breakdown.map((b) => [b.category, b.amount]));
  const brows = Object.entries(meta.budgets ?? {})
    .filter(([c, b]) => Number(b) > 0 && meta.categories.expense.includes(c))
    .map(([c, b]) => ({ c, b: Number(b), sp: spentBy.get(c) ?? 0 }))
    .sort((x, y) => y.sp / y.b - x.sp / x.b);
  const totalB = brows.reduce((s, r) => s + r.b, 0);
  const usedB = brows.reduce((s, r) => s + r.sp, 0);
  const pace = month === today.slice(0, 7) ? Number(today.slice(8, 10)) / daysInMonth(month) : null;
  const paid = meta.people.map((p) => jointRows.filter((r) => r.person === p.id).reduce((s, r) => s + r.amount, 0));
  const paidSum = paid.reduce((a, b) => a + b, 0);

  return (
    <Screen title="總覽" trailing={trailing} header={<MonthRow month={month} min={range[0]} max={range[1]} onChange={setMonth} />}>
      {/* 共同開銷 */}
      <Group top={12}>
        <div className="px-4 pt-3.5 pb-4">
          <div className="text-[15px] text-label-2">{monthShort(month)}共同開銷</div>
          <div className="rounded-num mt-0.5 text-[40px] leading-[48px] font-bold tracking-tight">{money(joint)}</div>
          {paidSum > 0 && (
            <div className="mt-3 flex h-[6px] gap-[2px] overflow-hidden rounded-full">
              {meta.people.map((p, i) => paid[i] > 0 && (
                <div key={p.id} style={{ width: `${(paid[i] / paidSum) * 100}%`, background: personColor(meta, p.id) }} />
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-label-2">
            {meta.people.map((p, i) => (
              <span key={p.id} className="flex items-center gap-1.5">
                <Dot color={personColor(meta, p.id)} />
                {p.name} 付 <span className="rounded-num tnum font-semibold text-label">{money(paid[i], { cents: false })}</span>
              </span>
            ))}
            <span className="ml-auto">{jointN} 筆</span>
          </div>
        </div>
        <div className="grid grid-cols-2">
          <div className="px-4 py-3">
            <div className="text-[13px] text-label-2">全部支出</div>
            <div className="rounded-num tnum text-[20px] font-semibold">{money(spent)}</div>
          </div>
          <div className="relative px-4 py-3 before:absolute before:inset-y-3 before:left-0 before:w-[0.5px] before:bg-sep">
            <div className="text-[13px] text-label-2">收入</div>
            <div className="rounded-num tnum text-[20px] font-semibold text-money-in">{money(income)}</div>
          </div>
        </div>
      </Group>

      {/* 分帳 */}
      <Group header="分帳" footer={`從開始記帳累計到今天，結清過的已經扣掉${sAll.settled_total > 0 ? `（累計結清 ${money(sAll.settled_total, { cents: false })}）` : ""}。`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <CatIcon category="結清" size={36} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] text-label-2">
              {sAll.debtor ? `${nameOf(meta, sAll.debtor)} 要給 ${nameOf(meta, sAll.creditor!)}` : "目前"}
            </div>
            <div className="rounded-num text-[24px] leading-[30px] font-bold">{sAll.debtor ? money(sAll.owed) : "兩不相欠 🎉"}</div>
          </div>
          {sAll.debtor && (
            <button className="press h-[34px] shrink-0 rounded-full bg-tint px-4 text-[15px] font-semibold text-white"
              onClick={() => setSettling(true)}>
              結清
            </button>
          )}
        </div>
      </Group>

      {/* 預算 */}
      {brows.length > 0 && (
        <Group header={`${monthShort(month)}預算`} headerRight={`已用 ${money(usedB, { cents: false })} / ${money(totalB, { cents: false })}`}
          inset={58}
          footer={pace !== null ? `直線是這個月已經過了 ${Math.round(pace * 100)}%。` : undefined}>
          {(allBudgets ? brows : brows.slice(0, 5)).map(({ c, b, sp }) => {
            const r = sp / b;
            const color = r > 1 ? "var(--red)" : r >= 0.8 ? "var(--orange)" : "var(--tint)";
            return (
              <button key={c} className="row-press flex w-full items-center gap-3 px-4 py-[10px] text-left" onClick={() => setDetail(c)}>
                <CatIcon category={c} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[17px]">{c}</span>
                    <span className="rounded-num tnum shrink-0 text-[15px]">
                      <b className="font-semibold">{money(sp, { cents: false })}</b>
                      <span className="text-label-2"> / {money(b, { cents: false })}</span>
                    </span>
                  </div>
                  <div className="relative mt-1.5 h-[5px] rounded-full bg-fill-3">
                    <div className="h-[5px] rounded-full" style={{ width: `${Math.min(100, r * 100)}%`, background: color }} />
                    {pace !== null && <div className="absolute -top-[3px] h-[11px] w-[2px] rounded-full bg-label-3" style={{ left: `${pace * 100}%` }} />}
                  </div>
                  <div className={cx("mt-1 text-[12px]", r > 1 ? "font-semibold text-red" : r >= 0.8 ? "text-orange" : "text-label-2")}>
                    {r > 1 ? `超支 ${money(sp - b, { cents: false })}` : b - sp < 0.5 ? "剛好用完"
                      : r >= 0.8 ? `快用完，剩 ${money(b - sp, { cents: false })}` : `剩 ${money(b - sp, { cents: false })}`}
                  </div>
                </div>
              </button>
            );
          })}
          {brows.length > 5 && (
            <button className="row-press w-full px-4 py-3 text-left text-[17px] text-tint" onClick={() => setAllBudgets((v) => !v)}>
              {allBudgets ? "收起" : `顯示全部 ${brows.length} 項`}
            </button>
          )}
        </Group>
      )}

      {/* 花在哪 */}
      <Group header="支出分類" headerRight={breakdown.length ? "點分類看明細" : undefined} inset={58}>
        {breakdown.length === 0 ? (
          <div className="px-4 py-6 text-center text-[15px] text-label-2">{monthTitle(month)}還沒有支出</div>
        ) : (
          <>
            <CategoryBars total={spent} onSelect={setDetail}
              rows={(allCats ? breakdown : breakdown.slice(0, 6)).map((b) => ({ key: b.category, value: b.amount }))} />
            {breakdown.length > 6 && (
              <button className="row-press w-full px-4 py-3 text-left text-[17px] text-tint" onClick={() => setAllCats((v) => !v)}>
                {allCats ? "收起" : `顯示全部 ${breakdown.length} 類`}
              </button>
            )}
          </>
        )}
      </Group>

      {/* 每月支出 */}
      <Group header="每月支出" headerRight="點柱子換月份">
        <div className="px-4 pt-3 pb-1">
          <ColumnChart emphasis selected={month} onSelect={setMonth}
            data={monthly.map((m) => ({ key: m.month, label: monthShort(m.month), value: m.expense, callout: `${monthTitle(m.month)} 支出` }))} />
        </div>
        <DataTable head={["月份", "支出", "收入", "淨存"]}
          rows={[...monthly].reverse().map((m) => [monthTitle(m.month), money(m.expense), money(m.income), money(m.net)])} />
      </Group>

      <CategoryDetailSheet open={!!detail} onClose={() => setDetail(null)} category={detail} month={month}
        rows={rows} type="expense" onEdit={onEdit} />
      <SettleSheet open={settling} onClose={() => setSettling(false)} s={sAll} />
    </Screen>
  );
}
