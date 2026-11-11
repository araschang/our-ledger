/** 報表：損益表、分類、趨勢；看兩人合計或某一個人自己負擔的部分。 */
import { useMemo, useState } from "react";
import { AreaLine, ColumnChart, DataTable, PairedBars, StackedColumns } from "../components/charts";
import { CatIcon, Dot, Group, MonthRow, Screen, Segmented } from "../components/ui";
import * as A from "../lib/analytics";
import { daysInMonth } from "../lib/analytics";
import { MINUS, money, monthShort, monthTitle, pct, todayLocal } from "../lib/format";
import { useStore } from "../lib/store";
import type { Meta, Row, Txn } from "../lib/types";
import { cx, nameOf, personColor } from "../lib/ui";
import { CategoryDetailSheet } from "./Shared";

type Tab = "pnl" | "cats" | "trend";

export function Reports({ month, setMonth, range, onEdit, trailing }: {
  month: string;
  setMonth: (m: string) => void;
  range: [string, string];
  onEdit: (t: Txn) => void;
  trailing: React.ReactNode;
}) {
  const snap = useStore();
  const data = snap.data!;
  const meta = A.normalizeMeta(data.meta);
  const ids = meta.people.map((p) => p.id);
  const all = useMemo(() => A.rowsOf(data), [data]);
  const [tab, setTab] = useState<Tab>("pnl");
  const [view, setView] = useState<string>("all");
  const who = view === "all" ? null : view;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => A.personalView(all, who, ids), [all, who, ids.join()]);
  const [detail, setDetail] = useState<{ c: string; type: "expense" | "income"; month: string | null } | null>(null);
  const fixed = A.fixedCats(meta);

  return (
    <Screen title="報表" trailing={trailing} header={
      <div className="flex flex-col gap-2 px-4 pt-1">
        <Segmented ariaLabel="報表" value={tab} onChange={setTab}
          options={[{ value: "pnl", label: "損益" }, { value: "cats", label: "分類" }, { value: "trend", label: "趨勢" }]} />
        <Segmented ariaLabel="看誰" value={view} onChange={setView}
          options={[{ value: "all", label: "兩人合計" },
            ...meta.people.map((p) => ({ value: p.id, label: <><Dot color={personColor(meta, p.id)} size={7} />{p.name}</> }))]} />
        {who && (
          <div className="px-1 pt-1 text-[13px] leading-[18px] text-label-2">
            只算 {nameOf(meta, who)} 自己負擔的部分：平分的算一半、幫對方墊的不算、對方幫忙墊的算全額。
          </div>
        )}
      </div>
    }>
      {tab === "pnl" && <PnlTab rows={rows} fixed={fixed} month={month} setMonth={setMonth} range={range}
        onCat={(c, type) => setDetail({ c, type, month })} />}
      {tab === "cats" && <CatsTab rows={rows} all={all} meta={meta} month={month} who={who}
        onCat={(c, m) => setDetail({ c, type: "expense", month: m })} onEdit={onEdit} />}
      {tab === "trend" && <TrendTab rows={rows} month={month} />}
      <CategoryDetailSheet open={!!detail} onClose={() => setDetail(null)} category={detail?.c ?? null}
        month={detail?.month ?? null} rows={rows} who={who} type={detail?.type ?? "expense"} onEdit={onEdit} />
    </Screen>
  );
}

function Delta({ cur, prev, goodWhenDown = false }: { cur: number; prev: number | null | undefined; goodWhenDown?: boolean }) {
  if (prev == null) return <div className="mt-0.5 h-[18px]" />;
  const d = cur - prev;
  if (Math.abs(d) < 0.5) return <div className="mt-0.5 text-[13px] text-label-2">持平</div>;
  const good = goodWhenDown ? d < 0 : d > 0;
  return (
    <div className={cx("rounded-num tnum mt-0.5 text-[13px] font-semibold", good ? "text-money-in" : "text-red")}>
      {d > 0 ? "▲" : "▼"} {money(Math.abs(d), { cents: false })}
    </div>
  );
}

function Tile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-[12px] bg-card px-3.5 py-3">
      <div className="text-[13px] text-label-2">{label}</div>
      <div className="rounded-num mt-0.5 text-[26px] leading-[32px] font-bold tracking-tight">{value}</div>
      {children}
    </div>
  );
}

function PnlTab({ rows, fixed, month, setMonth, range, onCat }: {
  rows: Row[]; fixed: string[]; month: string; setMonth: (m: string) => void; range: [string, string];
  onCat: (c: string, type: "expense" | "income") => void;
}) {
  const today = todayLocal();
  const { cur: p, curCmp, prev, label } = A.pnlCompare(rows, fixed, month, today);
  const years = [...new Set(rows.map((r) => r.month.slice(0, 4)))].sort().reverse();
  const [year, setYear] = useState(month.slice(0, 4));
  const yr = years.includes(year) ? year : years[0] ?? month.slice(0, 4);
  const yearly = A.pnlYearly(rows, fixed, yr);
  const sum = yearly.reduce((s, r) => ({ income: s.income + r.income, expense: s.expense + r.expense, net: s.net + r.net }),
    { income: 0, expense: 0, net: 0 });

  const Section = ({ title, total, cats, type, minus = false }: {
    title: string; total: number; cats: [string, number][]; type: "expense" | "income"; minus?: boolean;
  }) => (
    <Group header={title} headerRight={`${minus && total > 0 ? MINUS : ""}${money(total)}`} inset={58}>
      {cats.length === 0 && <div className="px-4 py-3 text-[15px] text-label-2">沒有</div>}
      {cats.map(([c, v]) => (
        <button key={c} className="row-press flex w-full items-center gap-3 px-4 py-[9px] text-left" onClick={() => onCat(c, type)}>
          <CatIcon category={c} size={30} />
          <span className="flex-1 truncate text-[17px]">{c}</span>
          <span className="rounded-num tnum text-[17px] text-label-2">{money(v)}</span>
        </button>
      ))}
    </Group>
  );

  const Total = ({ title, value, hint }: { title: string; value: number; hint?: string }) => (
    <Group top={16}>
      <div className="flex items-center px-4 py-3">
        <span className="flex-1 text-[17px] font-semibold">{title}{hint && <span className="ml-2 text-[13px] font-normal text-label-2">{hint}</span>}</span>
        <span className={cx("rounded-num tnum text-[20px] font-bold", value < 0 && "text-red")}>{money(value)}</span>
      </div>
    </Group>
  );

  return (
    <>
      <MonthRow className="pt-1" month={month} min={range[0]} max={range[1]} onChange={setMonth} />
      <div className="mx-4 mt-3 grid grid-cols-2 gap-3">
        <Tile label="總支出" value={money(p.expense, { cents: false })}>
          <Delta cur={curCmp.expense} prev={prev?.expense} goodWhenDown />
        </Tile>
        <Tile label="淨存" value={money(p.net, { cents: false })}>
          <Delta cur={curCmp.net} prev={prev?.net} />
        </Tile>
        <Tile label="儲蓄率" value={pct(p.save_rate)}>
          <div className="mt-0.5 text-[13px] text-label-2">淨存 ÷ 收入</div>
        </Tile>
        <Tile label="固定支出比率" value={pct(p.fixed_ratio)}>
          <div className="mt-0.5 text-[13px] text-label-2">固定支出 ÷ 收入</div>
        </Tile>
      </div>
      {label && <div className="px-8 pt-2 text-[13px] text-label-2">▲▼ {label}</div>}

      <Section title="收入" total={p.income} cats={p.income_by} type="income" />
      <Section title="固定支出" total={p.fixed} cats={p.fixed_by} type="expense" minus />
      <Total title="可支配餘裕" value={p.disposable} hint="收入 − 固定支出" />
      <Section title="變動支出" total={p.variable} cats={p.variable_by} type="expense" minus />
      <Total title="淨存" value={p.net} hint={p.save_rate != null ? `儲蓄率 ${pct(p.save_rate)}` : undefined} />
      <div className="px-8 pt-2 text-[13px] text-label-2">點分類看明細；哪些算固定支出可以在「設定」改。</div>

      <Group header={`${yr} 年`} headerRight={years.length > 1 ? undefined : "點一列跳到那個月"}>
        {years.length > 1 && (
          <div className="px-4 pt-3">
            <Segmented value={yr} onChange={setYear} options={years.slice(0, 4).map((y) => ({ value: y, label: y }))} />
          </div>
        )}
        <div className="no-scrollbar overflow-x-auto px-2 py-1">
          <table className="rounded-num tnum w-full text-[15px]">
            <thead>
              <tr className="text-[13px] text-label-2">
                <th className="px-2 py-2 text-left font-normal">月</th>
                <th className="px-2 py-2 text-right font-normal">收入</th>
                <th className="px-2 py-2 text-right font-normal">支出</th>
                <th className="px-2 py-2 text-right font-normal">淨存</th>
                <th className="px-2 py-2 text-right font-normal">儲蓄率</th>
              </tr>
            </thead>
            <tbody>
              {yearly.map((r) => (
                <tr key={r.month} onClick={() => setMonth(r.month)}
                  className={cx("cursor-pointer border-t-[0.5px] border-sep", r.month === month && "font-semibold text-tint")}>
                  <td className="px-2 py-2.5">{monthShort(r.month)}</td>
                  <td className="px-2 py-2.5 text-right">{money(r.income, { cents: false })}</td>
                  <td className="px-2 py-2.5 text-right">{money(r.expense, { cents: false })}</td>
                  <td className={cx("px-2 py-2.5 text-right", r.net < 0 && "text-red")}>{money(r.net, { cents: false })}</td>
                  <td className="px-2 py-2.5 text-right text-label-2">{pct(r.save_rate)}</td>
                </tr>
              ))}
              {yearly.length > 0 && (
                <tr className="border-t-[0.5px] border-sep font-semibold">
                  <td className="px-2 py-2.5">合計</td>
                  <td className="px-2 py-2.5 text-right">{money(sum.income, { cents: false })}</td>
                  <td className="px-2 py-2.5 text-right">{money(sum.expense, { cents: false })}</td>
                  <td className="px-2 py-2.5 text-right">{money(sum.net, { cents: false })}</td>
                  <td className="px-2 py-2.5 text-right">{sum.income > 0 ? pct(sum.net / sum.income) : "—"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Group>
    </>
  );
}

// 疊圖的顏色：照 dataviz 驗證過的五色＋灰（固定順序；顏色跟著分類，不跟排名）
const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];

function CatsTab({ rows, all, meta, month, who, onCat, onEdit }: {
  rows: Row[]; all: Row[]; meta: Meta; month: string;
  who: string | null; onCat: (c: string, month: string | null) => void; onEdit: (t: Txn) => void;
}) {
  const ids = meta.people.map((p) => p.id);
  // 前 5 大分類用兩人合計決定（切換看誰時顏色不跳），其他併成「其餘分類」
  const cmAll = A.categoryMonthly(all, "expense", 6);
  const totals = new Map<string, number>();
  for (const x of cmAll) totals.set(x.category, (totals.get(x.category) ?? 0) + x.amount);
  const topCats = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
  const cm = A.categoryMonthly(rows, "expense", 6);
  const months = [...new Set(cmAll.map((x) => x.month))].sort();
  const series = [...topCats.map((c, i) => ({ key: c, label: c, color: SERIES[i] })),
    { key: "__other", label: "其餘分類", color: "var(--s-other)" }];
  const cols = months.map((m) => {
    const values: Record<string, number> = {};
    for (const x of cm.filter((x) => x.month === m)) {
      const k = topCats.includes(x.category) ? x.category : "__other";
      values[k] = (values[k] ?? 0) + x.amount;
    }
    return { key: m, label: monthShort(m), values };
  });
  const [sel, setSel] = useState<string | null>(null);
  const selKey = sel && months.includes(sel) ? sel : months.includes(month) ? month : months[months.length - 1] ?? null;
  const selCol = cols.find((c) => c.key === selKey);
  const [scope, setScope] = useState<"month" | "all">("month");
  const pc = A.personCategory(all, ids, scope === "month" ? month : null);
  const pcRows = [...new Set(pc.map((x) => x.category))]
    .map((c) => ({ key: c, values: ids.map((pid) => pc.find((x) => x.category === c && x.person === pid)?.amount ?? 0) }))
    .sort((a, b) => b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0));
  const [topScope, setTopScope] = useState<"month" | "all">("month");
  const top = A.topExpenses(rows, 10, topScope === "month" ? month : null);

  return (
    <>
      <Group header="最近 6 個月" headerRight="點柱子換月份">
        {cols.length === 0 ? <div className="px-4 py-6 text-center text-label-2">還沒有支出</div> : (
          <>
            <div className="px-4 pt-3 pb-1">
              <StackedColumns series={series} cols={cols} selected={selKey} onSelect={setSel} />
            </div>
            <div className="ios-rows" style={{ "--sep-inset": "40px" } as React.CSSProperties}>
              {series.map((s) => (
                <button key={s.key} disabled={s.key === "__other"} onClick={() => onCat(s.key, selKey)}
                  className="row-press flex w-full items-center gap-3 px-4 py-2.5 text-left disabled:active:bg-transparent">
                  <span className="inline-block h-3 w-3 shrink-0 rounded-[3px]" style={{ background: s.color }} />
                  <span className="flex-1 truncate text-[17px]">{s.label}</span>
                  <span className="rounded-num tnum text-[17px] text-label-2">{money(selCol?.values[s.key] ?? 0, { cents: false })}</span>
                </button>
              ))}
            </div>
            <DataTable head={["月份", ...series.map((s) => s.label)]}
              rows={cols.map((c) => [c.label, ...series.map((s) => money(c.values[s.key] ?? 0, { cents: false }))])} />
          </>
        )}
      </Group>

      {!who && (
        <Group header="兩人各負擔多少" footer="各自實際負擔：平分各算一半、代墊算在被墊的人身上。">
          <div className="px-4 pt-3">
            <Segmented value={scope} onChange={setScope}
              options={[{ value: "month", label: monthTitle(month) }, { value: "all", label: "全部期間" }]} />
          </div>
          {pcRows.length === 0 ? <div className="px-4 py-6 text-center text-label-2">沒有支出</div> : (
            <PairedBars rows={pcRows.slice(0, 10)}
              series={meta.people.map((p) => ({ label: p.name, color: personColor(meta, p.id) }))} />
          )}
        </Group>
      )}

      <Group header="大額支出" inset={58}>
        <div className="px-4 py-3">
          <Segmented value={topScope} onChange={setTopScope}
            options={[{ value: "month", label: monthTitle(month) }, { value: "all", label: "全部期間" }]} />
        </div>
        {top.length === 0 && <div className="px-4 py-6 text-center text-label-2">沒有支出</div>}
        {top.map((r) => (
          <button key={r.id} className="row-press flex w-full items-center gap-3 px-4 py-[9px] text-left" onClick={() => onEdit(r.txn)}>
            <CatIcon category={r.category} size={30} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px]">{r.item || r.category}</div>
              <div className="text-[13px] text-label-2">
                {Number(r.date.slice(5, 7))}/{Number(r.date.slice(8, 10))} · {nameOf(meta, r.person)} · {r.category}
              </div>
            </div>
            <span className="rounded-num tnum text-[17px] font-medium">{money(r.amount)}</span>
          </button>
        ))}
      </Group>
    </>
  );
}

function TrendTab({ rows, month }: { rows: Row[]; month: string }) {
  const today = todayLocal();
  const cn = A.cumulativeNet(rows);
  const [sel, setSel] = useState<string | null>(null);
  const selKey = sel ?? (cn.find((c) => c.month === month) ? month : cn[cn.length - 1]?.month ?? null);
  const sr = cn.filter((c) => c.save_rate != null);
  const wd = A.weekdayPattern(rows);
  const maxWd = wd.reduce((m, w) => (w.amount > m.amount ? w : m), wd[0] ?? { label: "", amount: 0, weekday: 0 });
  const mExp = rows.filter((r) => r.type === "expense" && r.month === month).reduce((s, r) => s + r.amount, 0);
  const days = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : daysInMonth(month);

  if (cn.length === 0) return <div className="py-10 text-center text-label-2">還沒有資料</div>;
  return (
    <>
      <div className="mx-4 mt-3 grid grid-cols-3 gap-2.5">
        <Tile label="累積淨存" value={money(cn[cn.length - 1].cum_net, { cents: false })} />
        <Tile label={`${monthShort(month)}儲蓄率`} value={pct(cn.find((c) => c.month === month)?.save_rate)} />
        <Tile label={`${monthShort(month)}日均`} value={money(mExp / Math.max(1, days), { cents: false })} />
      </div>
      <div className="px-8 pt-2 text-[13px] text-label-2">日均＝這個月支出 ÷ {days} 天</div>

      <Group header="累積淨存">
        <div className="px-4 pt-3 pb-1">
          <AreaLine selected={selKey} onSelect={setSel}
            points={cn.map((c) => ({ key: c.month, label: monthShort(c.month), value: c.cum_net, callout: `${monthTitle(c.month)} 累積` }))} />
        </div>
        <DataTable head={["月份", "淨存", "累積"]}
          rows={[...cn].reverse().map((c) => [monthTitle(c.month), money(c.net, { cents: false }), money(c.cum_net, { cents: false })])} />
      </Group>

      <Group header="儲蓄率" headerRight="淨存 ÷ 收入">
        {sr.length === 0 ? <div className="px-4 py-6 text-center text-label-2">有記收入的月份才算得出來</div> : (
          <>
            <div className="px-4 pt-3 pb-1">
              <ColumnChart signed selected={sr.find((c) => c.month === selKey)?.month ?? sr[sr.length - 1].month}
                onSelect={setSel} format={(v) => pct(v)} axis={(v) => pct(v)}
                data={sr.map((c) => ({ key: c.month, label: monthShort(c.month), value: c.save_rate!, callout: `${monthTitle(c.month)} 儲蓄率` }))} />
            </div>
            <DataTable head={["月份", "儲蓄率"]} rows={[...sr].reverse().map((c) => [monthTitle(c.month), pct(c.save_rate)])} />
          </>
        )}
      </Group>

      <Group header="星期幾最會花錢" footer={wd.length ? `全部期間加總；最多的是週${maxWd.label}。` : undefined}>
        {wd.length === 0 ? <div className="px-4 py-6 text-center text-label-2">沒有支出</div> : (
          <div className="px-4 pt-3 pb-2">
            <ColumnChart selected={String(maxWd.weekday)}
              data={wd.map((w) => ({ key: String(w.weekday), label: `週${w.label}`, value: w.amount, callout: `週${w.label} 支出` }))} />
          </div>
        )}
      </Group>
    </>
  );
}
