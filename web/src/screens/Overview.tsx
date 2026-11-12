/**
 * 總覽：這個月花了多少（對預算）、收入和存下來、分帳（誰欠誰、下一筆誰付）、各類預算、花在哪、每月走勢。
 * 手機一欄往下排；電腦是儀表板（12 欄格線）。
 */
import { type ReactNode, useMemo, useState } from "react";
import { CategoryBars, ColumnChart, DataTable } from "../components/charts";
import { Icon } from "../components/Icon";
import { TxnRow } from "../components/TxnRow";
import { Avatar, Group, MonthRow, Screen, useWide } from "../components/ui";
import * as A from "../lib/analytics";
import { daysInMonth } from "../lib/analytics";
import { money, monthShort, monthTitle, todayLocal } from "../lib/format";
import { useStore } from "../lib/store";
import type { Txn } from "../lib/types";
import { catStyle, cx, nameOf, personColor } from "../lib/ui";
import { CategoryDetailSheet, SettleSheet } from "./Shared";

/** 錢的大數字：小數點後面縮小一點。 */
function BigMoney({ v, className = "" }: { v: number; className?: string }) {
  const s = money(v);
  const i = s.lastIndexOf(".");
  return (
    <span className={cx("rounded-num font-black tracking-[-0.02em]", className)}>
      {i > 0 ? <>{s.slice(0, i)}<span className="text-[0.55em]">{s.slice(i)}</span></> : s}
    </span>
  );
}

/** 進度條：墨色（超過變紅）；這個月還沒過完時，白色小直線標出「今天」。 */
function Progress({ ratio, pace, height = 12, label = false }: { ratio: number; pace: number | null; height?: number; label?: boolean }) {
  return (
    <div className={cx("relative", label && pace !== null && "pt-4")}>
      {label && pace !== null && (
        <span className="absolute top-0 -translate-x-1/2 text-[11px] font-bold text-label-2" style={{ left: `${pace * 100}%` }}>今天</span>
      )}
      <div className="relative rounded-full bg-fill" style={{ height }}>
        <div className="rounded-full" style={{ height, width: `${Math.max(ratio > 0 ? 3 : 0, Math.min(100, ratio * 100))}%`,
          background: ratio > 1 ? "var(--red)" : "var(--tint)" }} />
        {pace !== null && (
          <div className="absolute rounded-full bg-[var(--today-mark)] shadow-[0_0_0_1px_rgba(42,34,56,0.08)]"
            style={{ left: `calc(${pace * 100}% - 1.5px)`, top: -3, width: 3, height: height + 6 }} />
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, className = "", style }: {
  label: string; value: ReactNode; sub?: ReactNode; className?: string; style?: React.CSSProperties;
}) {
  return (
    <section className={cx("flex h-full flex-col justify-between rounded-[26px] px-4 py-3.5 lg:px-5 lg:py-5", className)} style={style}>
      <div className="text-[13px] font-bold text-label-2 lg:text-[14px]">{label}</div>
      <div className="rounded-num mt-0.5 text-[24px] leading-[30px] font-black lg:text-[34px] lg:leading-[42px]">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-label-2 lg:text-[13px]">{sub}</div>}
    </section>
  );
}

export function Overview({ month, setMonth, range, onEdit, trailing, onAdd }: {
  month: string;
  setMonth: (m: string) => void;
  range: [string, string];
  onEdit: (t: Txn) => void;
  trailing: ReactNode;
  onAdd: () => void;
}) {
  const snap = useStore();
  const wide = useWide();
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
  const spent = mRows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  const income = mRows.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const net = income - spent;
  const breakdown = A.categoryBreakdown(rows, month);
  const monthly = A.monthlySummary(rows.filter((r) => r.month <= range[1]), 12);

  // 預算：依「用掉幾成」排，快超或超支的在前面
  const spentBy = new Map(breakdown.map((b) => [b.category, b.amount]));
  const brows = Object.entries(meta.budgets ?? {})
    .filter(([c, b]) => Number(b) > 0 && meta.categories.expense.includes(c))
    .map(([c, b]) => ({ c, b: Number(b), sp: spentBy.get(c) ?? 0 }))
    .sort((x, y) => y.sp / y.b - x.sp / x.b);
  const fixed = A.fixedCats(meta);
  const totalB = brows.reduce((s, r) => s + r.b, 0);
  const usedB = brows.reduce((s, r) => s + r.sp, 0);
  const unbudgeted = Math.max(0, spent - usedB);
  const isCur = month === today.slice(0, 7);
  const pace = isCur ? Number(today.slice(8, 10)) / daysInMonth(month) : null;
  const daysLeft = isCur ? daysInMonth(month) - Number(today.slice(8, 10)) : 0;
  const paid = meta.people.map((p) => jointRows.filter((r) => r.person === p.id).reduce((s, r) => s + r.amount, 0));
  const paidSum = paid.reduce((a, b) => a + b, 0);
  const recent = useMemo(() => [...data.transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)).slice(0, 6), [data.transactions]);

  const hero = (
    <section className="flex flex-col gap-3 rounded-[30px] bg-hero p-5 lg:p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-extrabold">{monthShort(month)}花了</span>
        {totalB > 0 && (
          <span className="rounded-full bg-[color-mix(in_oklab,var(--card)_60%,transparent)] px-3 py-1 text-[12px] font-extrabold">
            預算 {money(totalB, { cents: false })}
          </span>
        )}
      </div>
      <BigMoney v={spent} className="text-[46px] leading-[50px] lg:text-[58px] lg:leading-[62px]" />
      {totalB > 0 && (
        <>
          <Progress ratio={usedB / totalB} pace={pace} label />
          <div className="flex items-baseline justify-between gap-3 text-[14px]">
            {usedB > totalB ? (
              <span className="font-extrabold text-red">預算超支 <span className="rounded-num">{money(usedB - totalB, { cents: false })}</span></span>
            ) : (
              <span>預算還能花 <span className="rounded-num text-[17px] font-black">{money(totalB - usedB, { cents: false })}</span></span>
            )}
            <span className="text-label-2">{isCur ? `剩 ${daysLeft} 天` : `用了 ${Math.round((usedB / totalB) * 100)}%`}</span>
          </div>
          {unbudgeted >= 1 && (
            <div className="-mt-1 text-[12px] text-label-2">另有 {money(unbudgeted, { cents: false })} 是沒設預算的分類（旅行、醫療之類）</div>
          )}
        </>
      )}
    </section>
  );

  const incomeTile = (
    <Tile label="收入" value={money(income, { cents: false })} className="bg-c-mint"
      sub={wide ? `${mRows.filter((r) => r.type === "income").length} 筆` : undefined} />
  );
  const savedTile = (
    <Tile label={net >= 0 ? "存下來" : "比收入多花"} value={money(Math.abs(net), { cents: false })} className="bg-c-butter"
      sub={wide ? (income > 0 ? `收入的 ${Math.round((net / income) * 100)}%` : "這個月還沒有收入") : undefined} />
  );

  const split = (
    <section className="flex h-full flex-col gap-2.5 rounded-[26px] bg-c-lilac p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[16px] font-extrabold">分帳</h2>
        <span className="text-[12px] text-label-2">從開始記帳累計到今天</span>
      </div>
      {sAll.debtor && sAll.creditor ? (
        <>
          <div className="flex items-center gap-2.5">
            <Avatar meta={meta} pid={sAll.debtor} size={36} />
            <Icon name="right" size={20} strokeWidth={2.6} className="text-label-2" />
            <Avatar meta={meta} pid={sAll.creditor} size={36} />
            <BigMoney v={sAll.owed} className="ml-auto text-[28px] leading-[34px]" />
          </div>
          <div className="text-[15px] font-bold">
            {nameOf(meta, sAll.debtor)} 欠 {nameOf(meta, sAll.creditor)}，下一筆共同開銷 {nameOf(meta, sAll.debtor)} 付
          </div>
        </>
      ) : (
        <div className="rounded-num text-[24px] font-black">兩不相欠</div>
      )}
      {paidSum > 0 && (
        <div className="mt-1">
          <div className="flex h-2 gap-[2px] overflow-hidden rounded-full">
            {meta.people.map((p, i) => paid[i] > 0 && (
              <div key={p.id} style={{ width: `${(paid[i] / paidSum) * 100}%`, background: personColor(meta, p.id) }} />
            ))}
          </div>
          <div className="mt-1.5 text-[13px] text-label-2">
            {monthShort(month)}共同開銷 <span className="rounded-num font-extrabold text-label">{money(joint, { cents: false })}</span>：
            {meta.people.map((p, i) => `${p.name} 付 ${money(paid[i], { cents: false })}`).join("、")}
          </div>
        </div>
      )}
      {sAll.debtor && (
        <button className="press mt-auto self-start rounded-full px-1 py-1 text-[13px] font-bold text-label-2 underline underline-offset-2"
          onClick={() => setSettling(true)}>
          有轉帳結清？記一筆
        </button>
      )}
    </section>
  );

  const shownBudgets = wide || allBudgets ? brows : brows.slice(0, 4);
  const budgets = brows.length > 0 && (
    <section className="card p-3 lg:p-4">
      <div className="flex items-baseline justify-between gap-3 px-1 pt-1 pb-3">
        <h2 className="text-[16px] font-extrabold">{monthShort(month)}預算</h2>
        <span className="rounded-num text-[13px] text-label-2">
          已用 <b className="font-extrabold text-label">{money(usedB, { cents: false })}</b> / {money(totalB, { cents: false })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 xl:grid-cols-6">
        {shownBudgets.map(({ c, b, sp }) => {
          const r = sp / b;
          return (
            <button key={c} onClick={() => setDetail(c)}
              className="press flex flex-col gap-1.5 rounded-[22px] p-3 text-left" style={{ background: catStyle(c).bg }}>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card">
                  <Icon name={catStyle(c).icon} size={16} strokeWidth={2.2} />
                </span>
                <span className="truncate text-[14px] font-extrabold">{c}</span>
              </div>
              <div className="rounded-num flex items-baseline gap-1">
                <span className="text-[19px] font-black">{money(sp, { cents: false })}</span>
                <span className="text-[12px] font-bold text-label-2">/ {money(b, { cents: false })}</span>
              </div>
              <Progress ratio={r} pace={pace} height={6} />
              <div className={cx("text-[12px] font-bold", r > 1 ? "text-red" : r >= 0.8 && !fixed.includes(c) ? "text-orange" : "text-label-2")}>
                {r > 1 ? `超支 ${money(sp - b, { cents: false })}` : fixed.includes(c) ? (sp > 0 ? "固定支出，已付" : "固定支出，還沒付")
                  : b - sp < 0.5 ? "剛好用完" : r >= 0.8 ? `快用完，剩 ${money(b - sp, { cents: false })}` : `剩 ${money(b - sp, { cents: false })}`}
              </div>
            </button>
          );
        })}
      </div>
      {!wide && brows.length > 4 && (
        <button className="press mt-2 w-full rounded-full py-2.5 text-[15px] font-extrabold text-tint" onClick={() => setAllBudgets((v) => !v)}>
          {allBudgets ? "收起" : `顯示全部 ${brows.length} 項`}
        </button>
      )}
      {pace !== null && <div className="px-1 pt-2 text-[12px] text-label-2">白色小直線是今天（這個月過了 {Math.round(pace * 100)}%）。</div>}
    </section>
  );

  const cats = (
    <Group header="花在哪" headerRight={breakdown.length ? "點分類看明細" : undefined} inset={58} top={wide ? 0 : 16} className="h-full [&>div]:h-full">
      {breakdown.length === 0 ? (
        <div className="px-4 py-6 text-center text-[15px] text-label-2">{monthTitle(month)}還沒有支出</div>
      ) : (
        <>
          <CategoryBars total={spent} onSelect={setDetail}
            rows={(allCats ? breakdown : breakdown.slice(0, 6)).map((b) => ({ key: b.category, value: b.amount }))} />
          {breakdown.length > 6 && (
            <button className="row-press w-full px-4 py-3 text-left text-[16px] font-extrabold text-tint" onClick={() => setAllCats((v) => !v)}>
              {allCats ? "收起" : `顯示全部 ${breakdown.length} 類`}
            </button>
          )}
        </>
      )}
    </Group>
  );

  const chart = (
    <Group header="每月支出" headerRight="點柱子換月份" top={wide ? 0 : 16} className="h-full [&>div]:h-full">
      <div className="px-4 pt-3 pb-1">
        <ColumnChart emphasis selected={month} onSelect={setMonth} height={wide ? 230 : 200}
          data={monthly.map((m) => ({ key: m.month, label: monthShort(m.month), value: m.expense, callout: `${monthTitle(m.month)} 支出` }))} />
      </div>
      <DataTable head={["月份", "支出", "收入", "淨存"]}
        rows={[...monthly].reverse().map((m) => [monthTitle(m.month), money(m.expense), money(m.income), money(m.net)])} />
    </Group>
  );

  const recentCard = (
    <Group header="最近記的" headerRight={<button className="press font-bold text-tint" onClick={onAdd}>＋ 記一筆</button>}
      inset={68} top={0} className="h-full [&>div]:h-full">
      {recent.map((t) => (
        <TxnRow key={t.id} txn={t} meta={meta} onTap={() => onEdit(t)}
          showDate={`${Number(t.date.slice(5, 7))}/${Number(t.date.slice(8, 10))}`} />
      ))}
    </Group>
  );

  return (
    <Screen title="總覽" trailing={trailing} header={<MonthRow className="pb-1" month={month} min={range[0]} max={range[1]} onChange={setMonth} />}>
      {wide ? (
        <div className="mt-3 grid grid-cols-12 gap-4">
          <div className="col-span-6">{hero}</div>
          <div className="col-span-3">{incomeTile}</div>
          <div className="col-span-3">{savedTile}</div>
          <div className="col-span-8">{chart}</div>
          <div className="col-span-4">{split}</div>
          <div className="col-span-12">{budgets}</div>
          <div className="col-span-6">{cats}</div>
          <div className="col-span-6">{recentCard}</div>
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="mx-4 mt-2">{hero}</div>
          <div className="mx-4 mt-3 grid grid-cols-2 gap-3">{incomeTile}{savedTile}</div>
          <div className="mx-4 mt-3">{split}</div>
          {budgets && <div className="mx-4 mt-3">{budgets}</div>}
          {cats}
          {chart}
        </div>
      )}

      <CategoryDetailSheet open={!!detail} onClose={() => setDetail(null)} category={detail} month={month}
        rows={rows} type="expense" onEdit={onEdit} />
      <SettleSheet open={settling} onClose={() => setSettling(false)} s={sAll} />
    </Screen>
  );
}
