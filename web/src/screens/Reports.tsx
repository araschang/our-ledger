/** 報表：損益表、分類、趨勢；可以看兩人合計或某一個人自己負擔的部分。 */
import { useMemo, useState } from "react";
import { AreaLine, ColumnChart, DataTable, PairedBars, StackedColumns } from "../components/charts";
import { Card, MonthNav, Segmented } from "../components/ui";
import * as A from "../lib/analytics";
import { daysInMonth } from "../lib/analytics";
import { MINUS, money, monthShort, monthTitle, pct, todayLocal } from "../lib/format";
import { useStore } from "../lib/store";
import type { Meta, Row, Txn } from "../lib/types";
import { catEmoji, cx, nameOf, personColor } from "../lib/ui";
import { CategoryDetailSheet } from "./Shared";

type Tab = "pnl" | "cats" | "trend";

export function Reports({ month, setMonth, range, onEdit, header }: {
  month: string;
  setMonth: (m: string) => void;
  range: [string, string];
  onEdit: (t: Txn) => void;
  header: React.ReactNode;
}) {
  const snap = useStore();
  const data = snap.data!;
  const meta = A.normalizeMeta(data.meta);
  const ids = meta.people.map((p) => p.id);
  const all = useMemo(() => A.rowsOf(data), [data]);
  const [tab, setTab] = useState<Tab>("pnl");
  const [view, setView] = useState<string>("all");
  const who = view === "all" ? null : view;
  const rows = useMemo(() => A.personalView(all, who, ids), [all, who, ids.join()]);
  const [detail, setDetail] = useState<{ c: string; type: "expense" | "income"; month: string | null } | null>(null);
  const fixed = A.fixedCats(meta);

  return (
    <div className="flex h-full flex-col">
      <div className="safe-t shrink-0 px-3 pt-2 pb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-bold tracking-tight">報表</h1>
          <div className="ml-auto flex items-center">{header}</div>
        </div>
        <Segmented className="mt-2" ariaLabel="報表" value={tab} onChange={setTab}
          options={[{ value: "pnl", label: "損益" }, { value: "cats", label: "分類" }, { value: "trend", label: "趨勢" }]} />
        <Segmented size="sm" className="mt-2" ariaLabel="視角" value={view} onChange={setView}
          options={[{ value: "all", label: "👫 兩人合計" },
            ...meta.people.map((p) => ({ value: p.id, label: (
              <><span className="h-2 w-2 rounded-full" style={{ background: personColor(meta, p.id) }} />{p.name}自己</>
            ) }))]} />
      </div>
      <div className="scroll min-h-0 flex-1 px-3 pb-28">
        {who && (
          <div className="mb-3 rounded-xl bg-card-2 px-3 py-2 text-[13px] text-ink-2">
            {nameOf(meta, who)} 自己負擔的部分：平分的算一半、幫對方墊的不算、對方幫忙墊的算全額。
          </div>
        )}
        {tab === "pnl" && (
          <PnlTab rows={rows} fixed={fixed} month={month} setMonth={setMonth} range={range}
            onCat={(c, type) => setDetail({ c, type, month })} />
        )}
        {tab === "cats" && (
          <CatsTab rows={rows} all={all} meta={meta} month={month} who={who}
            onCat={(c, m) => setDetail({ c, type: "expense", month: m })} onEdit={onEdit} />
        )}
        {tab === "trend" && <TrendTab rows={rows} month={month} />}
      </div>
      <CategoryDetailSheet open={!!detail} onClose={() => setDetail(null)} category={detail?.c ?? null}
        month={detail?.month ?? null} rows={rows} who={who} type={detail?.type ?? "expense"} onEdit={onEdit} />
    </div>
  );
}

function Delta({ cur, prev, goodWhenDown = false, label }: {
  cur: number; prev: number | null | undefined; goodWhenDown?: boolean; label: string;
}) {
  if (prev == null) return null;
  const d = cur - prev;
  if (Math.abs(d) < 0.5) return <div className="mt-1 text-[12px] text-muted">跟{label.replace("比", "")}差不多</div>;
  const good = goodWhenDown ? d < 0 : d > 0;
  return (
    <div className={cx("tnum mt-1 text-[12px] font-medium", good ? "text-good" : "text-bad")}>
      {d > 0 ? "▲" : "▼"} {money(Math.abs(d), { cents: false })} <span className="font-normal text-muted">{label}</span>
    </div>
  );
}

function Tile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="card p-3.5">
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="mt-0.5 text-[24px] leading-tight font-semibold tracking-tight">{value}</div>
      {children}
    </div>
  );
}

function PnlTab({ rows, fixed, month, setMonth, range, onCat }: {
  rows: Row[]; fixed: string[]; month: string; setMonth: (m: string) => void; range: [string, string];
  onCat: (c: string, type: "expense" | "income") => void;
}) {
  const today = todayLocal();
  const { cur: p, prev, label } = A.pnlCompare(rows, fixed, month, today);
  const years = [...new Set(rows.map((r) => r.month.slice(0, 4)))].sort().reverse();
  const [year, setYear] = useState(month.slice(0, 4));
  const yr = years.includes(year) ? year : years[0] ?? month.slice(0, 4);
  const yearly = A.pnlYearly(rows, fixed, yr);
  const short = (label || "").replace(/（.*）/, "");

  const Line = ({ name, value, kind, minus = false, cats, type }: {
    name: string; value: number; kind: "sec" | "tot"; minus?: boolean; cats?: [string, number][];
    type?: "expense" | "income";
  }) => (
    <>
      <div className={cx("tnum flex items-baseline justify-between px-1 py-2",
        kind === "sec" ? "border-t border-line text-[15px] font-semibold" : "my-1 border-y-2 border-ink text-[16px] font-bold")}>
        <span>{name}</span>
        <span>{minus && value > 0 ? MINUS : ""}{money(Math.abs(value))}</span>
      </div>
      {cats?.map(([c, v]) => (
        <button key={c} className="press tnum flex w-full items-baseline justify-between rounded-lg py-1.5 pr-1 pl-6 text-left text-[14px] text-ink-2 active:bg-card-2"
          onClick={() => onCat(c, type!)}>
          <span>{catEmoji(c)} {c}</span>
          <span>{money(v)}</span>
        </button>
      ))}
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <MonthNav month={month} min={range[0]} max={range[1]} onChange={setMonth} />
      <div className="grid grid-cols-2 gap-3">
        <Tile label="總支出" value={money(p.expense, { cents: false })}>
          <Delta cur={p.expense} prev={prev?.expense} goodWhenDown label={short} />
        </Tile>
        <Tile label="淨存" value={money(p.net, { cents: false })}>
          <Delta cur={p.net} prev={prev?.net} label={short} />
        </Tile>
        <Tile label="儲蓄率" value={pct(p.save_rate)}>
          <div className="mt-1 text-[12px] text-muted">淨存 ÷ 收入</div>
        </Tile>
        <Tile label="固定支出比率" value={pct(p.fixed_ratio)}>
          <div className="mt-1 text-[12px] text-muted">固定支出 ÷ 收入</div>
        </Tile>
      </div>
      {label && <div className="-mt-1 px-1 text-[12px] text-muted">▲▼ 是{label}</div>}

      <Card title={`${monthTitle(month)}損益表`}>
        <Line name="收入" value={p.income} kind="sec" cats={p.income_by} type="income" />
        <Line name="固定支出" value={p.fixed} kind="sec" minus cats={p.fixed_by} type="expense" />
        <Line name="可支配餘裕" value={p.disposable} kind="tot" />
        <Line name="變動支出" value={p.variable} kind="sec" minus cats={p.variable_by} type="expense" />
        <Line name="淨存" value={p.net} kind="tot" />
        <div className="mt-2 text-[12px] text-muted">點分類看明細；哪些算固定支出可以在「設定」改。</div>
      </Card>

      <Card title={`${yr} 年`} right={years.length > 1 ? (
        <Segmented size="sm" value={yr} onChange={setYear} options={years.slice(0, 3).map((y) => ({ value: y, label: y }))} />
      ) : undefined}>
        <div className="no-scrollbar -mx-1 overflow-x-auto">
          <table className="tnum w-full text-[13.5px]">
            <thead>
              <tr className="text-muted">
                <th className="px-1 py-1.5 text-left font-normal">月</th>
                <th className="px-1 py-1.5 text-right font-normal">收入</th>
                <th className="px-1 py-1.5 text-right font-normal">支出</th>
                <th className="px-1 py-1.5 text-right font-normal">淨存</th>
                <th className="px-1 py-1.5 text-right font-normal">儲蓄率</th>
              </tr>
            </thead>
            <tbody>
              {yearly.map((r) => (
                <tr key={r.month} onClick={() => setMonth(r.month)}
                  className={cx("cursor-pointer border-t border-line", r.month === month && "bg-card-2 font-semibold")}>
                  <td className="px-1 py-2">{monthShort(r.month)}</td>
                  <td className="px-1 py-2 text-right">{money(r.income, { cents: false })}</td>
                  <td className="px-1 py-2 text-right">{money(r.expense, { cents: false })}</td>
                  <td className={cx("px-1 py-2 text-right", r.net < 0 && "text-bad")}>{money(r.net, { cents: false })}</td>
                  <td className="px-1 py-2 text-right text-ink-2">{pct(r.save_rate)}</td>
                </tr>
              ))}
              {yearly.length > 0 && (() => {
                const t = yearly.reduce((s, r) => ({ income: s.income + r.income, expense: s.expense + r.expense,
                  net: s.net + r.net }), { income: 0, expense: 0, net: 0 });
                return (
                  <tr className="border-t-2 border-ink font-bold">
                    <td className="px-1 py-2">合計</td>
                    <td className="px-1 py-2 text-right">{money(t.income, { cents: false })}</td>
                    <td className="px-1 py-2 text-right">{money(t.expense, { cents: false })}</td>
                    <td className="px-1 py-2 text-right">{money(t.net, { cents: false })}</td>
                    <td className="px-1 py-2 text-right">{t.income > 0 ? pct(t.net / t.income) : "—"}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[12px] text-muted">點一列跳到那個月</div>
      </Card>
    </div>
  );
}

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

function CatsTab({ rows, all, meta, month, who, onCat, onEdit }: {
  rows: Row[]; all: Row[]; meta: Meta; month: string;
  who: string | null; onCat: (c: string, month: string | null) => void; onEdit: (t: Txn) => void;
}) {
  const ids = meta.people.map((p) => p.id);
  // 疊圖用最近 6 個月；前 5 大分類（用兩人合計決定，切換視角時顏色不跳）＋其他
  const cmAll = A.categoryMonthly(all, "expense", 6);
  const totals = new Map<string, number>();
  for (const x of cmAll) totals.set(x.category, (totals.get(x.category) ?? 0) + x.amount);
  const topCats = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
  const cm = A.categoryMonthly(rows, "expense", 6);
  const months = [...new Set(cmAll.map((x) => x.month))].sort();
  const series = [...topCats.map((c, i) => ({ key: c, label: c, color: SERIES[i] })),
    { key: "__other", label: "其餘分類", color: "var(--series-other)" }];
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
  const pcCats = [...new Set(pc.map((x) => x.category))];
  const pcRows = pcCats
    .map((c) => ({ key: c, label: `${catEmoji(c)} ${c}`,
      values: ids.map((pid) => pc.find((x) => x.category === c && x.person === pid)?.amount ?? 0) }))
    .sort((a, b) => b.values[0] + b.values[1] - (a.values[0] + a.values[1]));
  const [topScope, setTopScope] = useState<"month" | "all">("month");
  const top = A.topExpenses(rows, 10, topScope === "month" ? month : null);

  return (
    <div className="flex flex-col gap-3">
      <Card title="最近 6 個月花在哪">
        {cols.length === 0 ? <div className="py-4 text-center text-muted">還沒有支出</div> : (
          <>
            <div className="mb-2 flex items-baseline justify-between text-[14px]">
              <span className="font-semibold">{selKey ? monthTitle(selKey) : ""}</span>
              <span className="tnum font-semibold">
                {money(series.reduce((s, x) => s + (selCol?.values[x.key] ?? 0), 0), { cents: false })}
              </span>
            </div>
            <StackedColumns series={series} cols={cols} selected={selKey} onSelect={setSel} />
            <div className="-mx-2 mt-3 grid grid-cols-2 gap-x-2">
              {series.map((s) => (
                <button key={s.key} disabled={s.key === "__other"} onClick={() => onCat(s.key, selKey)}
                  className="press flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[14px] active:bg-card-2 disabled:active:bg-transparent">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
                  <span className="min-w-0 flex-1 truncate text-ink-2">{s.label}</span>
                  <span className="tnum shrink-0 font-semibold">{money(selCol?.values[s.key] ?? 0, { cents: false })}</span>
                </button>
              ))}
            </div>
            <div className="mt-1 text-[12px] text-muted">點柱子換月份、點分類看那個月的明細</div>
            <DataTable head={["月份", ...series.map((s) => s.label)]}
              rows={cols.map((c) => [c.label, ...series.map((s) => money(c.values[s.key] ?? 0, { cents: false }))])} />
          </>
        )}
      </Card>

      {!who && (
        <Card title="兩人各負擔多少" right={
          <Segmented size="sm" value={scope} onChange={setScope}
            options={[{ value: "month", label: monthShort(month) }, { value: "all", label: "全部" }]} />
        }>
          {pcRows.length === 0 ? <div className="py-4 text-center text-muted">沒有支出</div> : (
            <PairedBars rows={pcRows.slice(0, 10)}
              series={meta.people.map((p) => ({ label: p.name, color: personColor(meta, p.id) }))} />
          )}
          <div className="mt-2 text-[12px] text-muted">各自實際負擔：平分各算一半、代墊算在被墊的人身上</div>
        </Card>
      )}

      <Card title="大額支出" right={
        <Segmented size="sm" value={topScope} onChange={setTopScope}
          options={[{ value: "month", label: monthShort(month) }, { value: "all", label: "全部" }]} />
      }>
        {top.length === 0 ? <div className="py-4 text-center text-muted">沒有支出</div> : (
          <div className="-mx-2 flex flex-col">
            {top.map((r, i) => (
              <button key={r.id} className="press flex items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-card-2"
                onClick={() => onEdit(r.txn)}>
                <span className="tnum w-5 shrink-0 text-right text-[13px] text-muted">{i + 1}</span>
                <span className="text-[20px]">{catEmoji(r.category)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px]">{r.item || r.category}</div>
                  <div className="text-[12px] text-muted">
                    {Number(r.date.slice(5, 7))}/{Number(r.date.slice(8, 10))} · {nameOf(meta, r.person)} · {r.category}
                  </div>
                </div>
                <span className="tnum shrink-0 text-[15px] font-semibold">{money(r.amount)}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

    </div>
  );
}

function TrendTab({ rows, month }: { rows: Row[]; month: string }) {
  const today = todayLocal();
  const cn = A.cumulativeNet(rows);
  const [sel, setSel] = useState<string | null>(null);
  const selKey = sel ?? (cn.find((c) => c.month === month) ? month : cn[cn.length - 1]?.month ?? null);
  const latest = cn.find((c) => c.month === selKey) ?? cn[cn.length - 1];
  const sr = cn.filter((c) => c.save_rate != null);
  const wd = A.weekdayPattern(rows);
  const maxWd = wd.reduce((m, w) => (w.amount > m.amount ? w : m), wd[0] ?? { label: "", amount: 0, weekday: 0 });
  const mExp = rows.filter((r) => r.type === "expense" && r.month === month).reduce((s, r) => s + r.amount, 0);
  const days = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : daysInMonth(month);

  if (cn.length === 0) return <div className="py-10 text-center text-muted">還沒有資料</div>;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="累積淨存" value={money(cn[cn.length - 1].cum_net, { cents: false })} />
        <Tile label={`${monthShort(month)}儲蓄率`} value={pct(cn.find((c) => c.month === month)?.save_rate)} />
        <Tile label={`${monthShort(month)}日均支出`} value={money(mExp / Math.max(1, days), { cents: false })} />
      </div>
      <div className="-mt-1 px-1 text-[12px] text-muted">日均支出 = 這個月支出 ÷ {days} 天</div>

      <Card title="累積淨存">
        <AreaLine selected={selKey} onSelect={setSel}
          points={cn.map((c) => ({ key: c.month, label: monthShort(c.month), value: c.cum_net }))} />
        {latest && (
          <div className="tnum mt-2 text-[13px] text-ink-2">
            {monthTitle(latest.month)}：收入 {money(latest.income, { cents: false })}、支出 {money(latest.expense, { cents: false })}、
            淨存 {money(latest.net, { cents: false })}
          </div>
        )}
        <DataTable head={["月份", "淨存", "累積"]}
          rows={[...cn].reverse().map((c) => [monthTitle(c.month), money(c.net, { cents: false }), money(c.cum_net, { cents: false })])} />
      </Card>

      <Card title="儲蓄率（淨存 ÷ 收入）">
        {sr.length === 0 ? <div className="py-4 text-center text-muted">有記收入的月份才算得出來</div> : (
          <>
            <ColumnChart signed selected={sr.find((c) => c.month === selKey)?.month ?? sr[sr.length - 1].month}
              onSelect={setSel} format={(v) => pct(v)} axis={(v) => pct(v)}
              data={sr.map((c) => ({ key: c.month, label: monthShort(c.month), value: c.save_rate! }))} />
            <DataTable head={["月份", "儲蓄率"]} rows={[...sr].reverse().map((c) => [monthTitle(c.month), pct(c.save_rate)])} />
          </>
        )}
      </Card>

      <Card title="星期幾最會花錢">
        {wd.length === 0 ? <div className="py-4 text-center text-muted">沒有支出</div> : (
          <>
            <ColumnChart selected={String(maxWd.weekday)}
              data={wd.map((w) => ({ key: String(w.weekday), label: `週${w.label}`, value: w.amount }))} />
            <div className="mt-1 text-[12px] text-muted">全部期間加總；最多的是週{maxWd.label}</div>
          </>
        )}
      </Card>
    </div>
  );
}
