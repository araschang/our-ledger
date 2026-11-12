/**
 * 報表：損益、分類、趨勢；看兩人合計或某一個人自己負擔的部分。
 * 上面一排：分頁（墨色膠囊）＋看誰（分段）＋月份。手機一欄往下排；電腦 12 欄格線、左右對齊。
 */
import { type ReactNode, useMemo, useState } from "react";
import { AreaLine, ColumnChart, DataTable, PairedBars, StackedColumns } from "../components/charts";
import { CatIcon, Dot, MonthRow, Screen, Segmented } from "../components/ui";
import * as A from "../lib/analytics";
import { daysInMonth } from "../lib/analytics";
import { MINUS, money, monthShort, monthTitle, pct, todayLocal } from "../lib/format";
import { useStore } from "../lib/store";
import type { Meta, Row, Txn } from "../lib/types";
import { cx, nameOf, personColor } from "../lib/ui";
import { CategoryDetailSheet } from "./Shared";

type Tab = "pnl" | "cats" | "trend";
const TABS: { id: Tab; label: string }[] = [{ id: "pnl", label: "損益" }, { id: "cats", label: "分類" }, { id: "trend", label: "趨勢" }];

export function Reports({ month, setMonth, range, onEdit, trailing }: {
  month: string;
  setMonth: (m: string) => void;
  range: [string, string];
  onEdit: (t: Txn) => void;
  trailing: ReactNode;
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
      <div className="lg:flex lg:items-center lg:gap-4">
        <div className="flex flex-col gap-2.5 px-4 pt-1 lg:flex-row lg:items-center lg:gap-4 lg:px-0 lg:pt-0">
          <div role="tablist" aria-label="報表" className="grid grid-cols-3 gap-2 lg:flex">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={cx("press h-10 rounded-full px-5 text-[15px] font-extrabold",
                  tab === t.id ? "bg-tint text-on-tint" : "float bg-card text-label-2")}>
                {t.label}
              </button>
            ))}
          </div>
          <Segmented className="lg:w-[330px]" ariaLabel="看誰" value={view} onChange={setView}
            options={[{ value: "all", label: "兩人合計" },
              ...meta.people.map((p) => ({ value: p.id, label: <><Dot color={personColor(meta, p.id)} size={7} />{p.name}</> }))]} />
        </div>
        <MonthRow className="pt-3 lg:ml-auto lg:w-[330px] lg:pt-0" month={month} min={range[0]} max={range[1]} onChange={setMonth} />
      </div>
    }>
      {who && (
        <div className="mx-4 mt-3 rounded-[18px] bg-card-2 px-4 py-2.5 text-[13px] leading-[19px] text-label-2 lg:mx-0">
          只算 <b className="text-label">{nameOf(meta, who)}</b> 自己負擔的部分：平分的算一半、幫對方墊的不算、對方幫忙墊的算全額。
        </div>
      )}
      {tab === "pnl" && <PnlTab rows={rows} fixed={fixed} month={month} setMonth={setMonth}
        onCat={(c, type) => setDetail({ c, type, month })} />}
      {tab === "cats" && <CatsTab rows={rows} all={all} meta={meta} month={month} who={who}
        onCat={(c, m) => setDetail({ c, type: "expense", month: m })} onEdit={onEdit} />}
      {tab === "trend" && <TrendTab rows={rows} month={month} setMonth={setMonth} />}
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
    <div className={cx("rounded-num tnum mt-0.5 text-[13px] font-extrabold", good ? "text-money-in" : "text-red")}>
      {d > 0 ? "▲" : "▼"} {money(Math.abs(d), { cents: false })}
    </div>
  );
}

function Tile({ label, value, children, tone }: { label: string; value: string; children?: ReactNode; tone: string }) {
  return (
    <div className="h-full rounded-[24px] px-4 py-3.5 lg:px-5 lg:py-4" style={{ background: `var(--c-${tone})` }}>
      <div className="text-[13px] font-bold text-label-2">{label}</div>
      <div className="rounded-num mt-0.5 text-[26px] leading-[32px] font-black tracking-[-0.02em] lg:text-[30px] lg:leading-[38px]">{value}</div>
      {children}
    </div>
  );
}

/** 卡片：白底大圓角，標題在裡面（右邊可放小字或控制項）。 */
function Card({ title, right, children, className = "" }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("card mx-4 overflow-hidden lg:mx-0", className)}>
      <div className="flex min-h-[52px] items-center justify-between gap-3 px-4 pt-3 pb-1">
        <h2 className="text-[16px] font-extrabold">{title}</h2>
        {right && <div className="text-[12px] text-label-2">{right}</div>}
      </div>
      {children}
    </section>
  );
}

// ---- 損益 ----------------------------------------------------------------------------------

function PnlTab({ rows, fixed, month, setMonth, onCat }: {
  rows: Row[]; fixed: string[]; month: string; setMonth: (m: string) => void;
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

  const section = (title: string, total: number, cats: [string, number][], type: "expense" | "income", minus = false) => (
    <div className="px-4 pt-3">
      <div className="flex items-baseline justify-between border-b border-sep pb-1.5">
        <span className="text-[14px] font-extrabold text-label-2">{title}</span>
        <span className="rounded-num tnum text-[16px] font-black">{minus && total > 0 ? MINUS : ""}{money(total)}</span>
      </div>
      {cats.length === 0 && <div className="py-2.5 text-[14px] text-label-2">沒有</div>}
      {cats.map(([c, v]) => (
        <button key={c} onClick={() => onCat(c, type)}
          className="row-press -mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-[14px] px-2 py-1.5 text-left">
          <CatIcon category={c} size={30} />
          <span className="flex-1 truncate text-[15px] font-semibold">{c}</span>
          <span className="rounded-num tnum text-[15px] font-bold text-label-2">{money(v)}</span>
        </button>
      ))}
    </div>
  );
  const subtotal = (title: string, hint: string | undefined, value: number, tone: string, big = false) => (
    <div className="mx-2.5 mt-3 flex items-center gap-2 rounded-[18px] px-3.5 py-3" style={{ background: `var(--c-${tone})` }}>
      <span className="flex-1 text-[16px] font-extrabold">
        {title}{hint && <span className="ml-2 text-[12px] font-semibold text-label-2">{hint}</span>}
      </span>
      <span className={cx("rounded-num tnum font-black", big ? "text-[22px]" : "text-[18px]", value < 0 && "text-red")}>{money(value)}</span>
    </div>
  );

  return (
    <div className="mt-3 flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start">
      <div className="lg:col-span-12">
        <div className="mx-4 grid grid-cols-2 gap-3 lg:mx-0 lg:grid-cols-4 lg:gap-4">
          <Tile label="總支出" value={money(p.expense, { cents: false })} tone="peach">
            <Delta cur={curCmp.expense} prev={prev?.expense} goodWhenDown />
          </Tile>
          <Tile label="淨存" value={money(p.net, { cents: false })} tone="butter">
            <Delta cur={curCmp.net} prev={prev?.net} />
          </Tile>
          <Tile label="儲蓄率" value={pct(p.save_rate)} tone="mint">
            <div className="mt-0.5 text-[13px] text-label-2">淨存 ÷ 收入</div>
          </Tile>
          <Tile label="固定支出比率" value={pct(p.fixed_ratio)} tone="lilac">
            <div className="mt-0.5 text-[13px] text-label-2">固定支出 ÷ 收入</div>
          </Tile>
        </div>
        {label && <div className="px-6 pt-2 text-[13px] text-label-2 lg:px-1">▲▼ {label}</div>}
      </div>

      <Card className="lg:col-span-7" title={`${monthTitle(month)} 損益表`} right="點分類看明細">
        {section("收入", p.income, p.income_by, "income")}
        {section("固定支出", p.fixed, p.fixed_by, "expense", true)}
        {subtotal("可支配餘裕", "收入 − 固定支出", p.disposable, "lilac")}
        {section("變動支出", p.variable, p.variable_by, "expense", true)}
        {subtotal("淨存", p.save_rate != null ? `儲蓄率 ${pct(p.save_rate)}` : undefined, p.net, "butter", true)}
        <div className="px-4 pt-2.5 pb-4 text-[12px] text-label-2">哪些算固定支出可以在「設定」改。</div>
      </Card>

      <Card className="lg:sticky lg:top-4 lg:col-span-5" title={`${yr} 年`} right={years.length > 1 ? (
        <Segmented className="w-[200px]" value={yr} onChange={setYear} options={years.slice(0, 3).map((y) => ({ value: y, label: y }))} />
      ) : "點柱子或一列跳到那個月"}>
        {yearly.length > 0 && (
          <div className="px-4 pt-1">
            <ColumnChart signed selected={yearly.some((r) => r.month === month) ? month : null} onSelect={setMonth} height={180}
              data={yearly.map((r) => ({ key: r.month, label: monthShort(r.month), value: r.net, callout: `${monthTitle(r.month)} 淨存` }))} />
          </div>
        )}
        <div className="no-scrollbar overflow-x-auto px-2 pb-2">
          <table className="rounded-num tnum w-full text-[14px]">
            <thead>
              <tr className="text-[12px] text-label-2">
                <th className="px-2 py-2 text-left font-bold">月</th>
                <th className="px-2 py-2 text-right font-bold">收入</th>
                <th className="px-2 py-2 text-right font-bold">支出</th>
                <th className="px-2 py-2 text-right font-bold">淨存</th>
                <th className="px-2 py-2 text-right font-bold">儲蓄率</th>
              </tr>
            </thead>
            <tbody>
              {yearly.map((r) => (
                <tr key={r.month} onClick={() => setMonth(r.month)}
                  className={cx("cursor-pointer border-t border-sep hover:bg-fill-4", r.month === month && "bg-c-lilac font-black")}>
                  <td className="px-2 py-2.5">{monthShort(r.month)}</td>
                  <td className="px-2 py-2.5 text-right">{money(r.income, { cents: false })}</td>
                  <td className="px-2 py-2.5 text-right">{money(r.expense, { cents: false })}</td>
                  <td className={cx("px-2 py-2.5 text-right", r.net < 0 && "text-red")}>{money(r.net, { cents: false })}</td>
                  <td className="px-2 py-2.5 text-right text-label-2">{pct(r.save_rate)}</td>
                </tr>
              ))}
              {yearly.length > 0 && (
                <tr className="border-t-2 border-sep font-black">
                  <td className="px-2 py-2.5">合計</td>
                  <td className="px-2 py-2.5 text-right">{money(sum.income, { cents: false })}</td>
                  <td className="px-2 py-2.5 text-right">{money(sum.expense, { cents: false })}</td>
                  <td className={cx("px-2 py-2.5 text-right", sum.net < 0 && "text-red")}>{money(sum.net, { cents: false })}</td>
                  <td className="px-2 py-2.5 text-right">{sum.income > 0 ? pct(sum.net / sum.income) : "—"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ---- 分類 ----------------------------------------------------------------------------------

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
    <div className="mt-3 flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start">
      <Card className="lg:col-span-7" title="最近 6 個月，錢花在哪" right="點柱子換月份">
        {cols.length === 0 ? <div className="px-4 py-6 text-center text-label-2">還沒有支出</div> : (
          <>
            <div className="px-4 pt-1 pb-1">
              <StackedColumns series={series} cols={cols} selected={selKey} onSelect={setSel} />
            </div>
            <div className="px-2">
              {series.map((s) => (
                <button key={s.key} disabled={s.key === "__other"} onClick={() => onCat(s.key, selKey)}
                  className="row-press flex w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left disabled:active:bg-transparent">
                  <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-[4px]" style={{ background: s.color }} />
                  <span className="flex-1 truncate text-[15px] font-semibold">{s.label}</span>
                  <span className="rounded-num tnum text-[15px] font-bold text-label-2">{money(selCol?.values[s.key] ?? 0, { cents: false })}</span>
                </button>
              ))}
            </div>
            <DataTable head={["月份", ...series.map((s) => s.label)]}
              rows={cols.map((c) => [c.label, ...series.map((s) => money(c.values[s.key] ?? 0, { cents: false }))])} />
          </>
        )}
      </Card>

      {!who && (
        <Card className="lg:col-span-5" title="兩人各負擔多少"
          right={<Segmented className="w-[200px]" value={scope} onChange={setScope}
            options={[{ value: "month", label: monthShort(month) }, { value: "all", label: "全部期間" }]} />}>
          {pcRows.length === 0 ? <div className="px-4 py-6 text-center text-label-2">沒有支出</div> : (
            <PairedBars rows={pcRows.slice(0, 8)}
              series={meta.people.map((p) => ({ label: p.name, color: personColor(meta, p.id) }))} />
          )}
          <div className="px-4 pb-4 text-[12px] text-label-2">各自實際負擔：平分各算一半、代墊算在被墊的人身上。</div>
        </Card>
      )}

      <Card className={who ? "lg:col-span-5" : "lg:col-span-12"} title="大額支出"
        right={<Segmented className="w-[200px]" value={topScope} onChange={setTopScope}
          options={[{ value: "month", label: monthShort(month) }, { value: "all", label: "全部期間" }]} />}>
        {top.length === 0 && <div className="px-4 py-6 text-center text-label-2">沒有支出</div>}
        <div className={cx("px-2 pb-2", !who && "lg:grid lg:grid-cols-2 lg:gap-x-4")}>
          {top.map((r, i) => (
            <button key={r.id} onClick={() => onEdit(r.txn)}
              className="row-press flex w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left">
              <span className="rounded-num w-5 shrink-0 text-center text-[13px] font-black text-label-3">{i + 1}</span>
              <CatIcon category={r.category} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold">{r.item || r.category}</div>
                <div className="truncate text-[13px] text-label-2">
                  {Number(r.date.slice(5, 7))}/{Number(r.date.slice(8, 10))} · {nameOf(meta, r.person)} · {r.category}
                </div>
              </div>
              <span className="rounded-num tnum text-[16px] font-extrabold">{money(r.amount)}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---- 趨勢 ----------------------------------------------------------------------------------

function TrendTab({ rows, month, setMonth }: { rows: Row[]; month: string; setMonth: (m: string) => void }) {
  const today = todayLocal();
  const cn = A.cumulativeNet(rows);
  const selKey = cn.find((c) => c.month === month) ? month : cn[cn.length - 1]?.month ?? null;
  const sr = cn.filter((c) => c.save_rate != null);
  const wd = A.weekdayPattern(rows);
  const maxWd = wd.reduce((m, w) => (w.amount > m.amount ? w : m), wd[0] ?? { label: "", amount: 0, weekday: 0 });
  const mExp = rows.filter((r) => r.type === "expense" && r.month === month).reduce((s, r) => s + r.amount, 0);
  const days = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : daysInMonth(month);

  if (cn.length === 0) return <div className="py-10 text-center text-label-2">還沒有資料</div>;
  return (
    <div className="mt-3 flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start">
      <div className="lg:col-span-12">
        <div className="mx-4 grid grid-cols-3 gap-2.5 lg:mx-0 lg:gap-4">
          <Tile label="累積淨存" value={money(cn[cn.length - 1].cum_net, { cents: false })} tone="butter" />
          <Tile label={`${monthShort(month)}儲蓄率`} value={pct(cn.find((c) => c.month === month)?.save_rate)} tone="mint" />
          <Tile label={`${monthShort(month)}日均`} value={money(mExp / Math.max(1, days), { cents: false })} tone="peach" />
        </div>
        <div className="px-6 pt-2 text-[13px] text-label-2 lg:px-1">日均＝這個月支出 ÷ {days} 天</div>
      </div>

      <Card className="lg:col-span-12" title="累積淨存" right="點圖換月份">
        <div className="px-4 pt-1 pb-1">
          <AreaLine selected={selKey} onSelect={setMonth}
            points={cn.map((c) => ({ key: c.month, label: monthShort(c.month), value: c.cum_net, callout: `${monthTitle(c.month)} 累積` }))} />
        </div>
        <DataTable head={["月份", "淨存", "累積"]}
          rows={[...cn].reverse().map((c) => [monthTitle(c.month), money(c.net, { cents: false }), money(c.cum_net, { cents: false })])} />
      </Card>

      <Card className="lg:col-span-6" title="儲蓄率" right="淨存 ÷ 收入">
        {sr.length === 0 ? <div className="px-4 py-6 text-center text-label-2">有記收入的月份才算得出來</div> : (
          <>
            <div className="px-4 pt-1 pb-1">
              <ColumnChart signed selected={sr.find((c) => c.month === selKey)?.month ?? sr[sr.length - 1].month}
                onSelect={setMonth} format={(v) => pct(v)} axis={(v) => pct(v)}
                data={sr.map((c) => ({ key: c.month, label: monthShort(c.month), value: c.save_rate!, callout: `${monthTitle(c.month)} 儲蓄率` }))} />
            </div>
            <DataTable head={["月份", "儲蓄率"]} rows={[...sr].reverse().map((c) => [monthTitle(c.month), pct(c.save_rate)])} />
          </>
        )}
      </Card>

      <Card className="lg:col-span-6" title="星期幾最會花錢" right={wd.length ? `最多的是週${maxWd.label}` : undefined}>
        {wd.length === 0 ? <div className="px-4 py-6 text-center text-label-2">沒有支出</div> : (
          <div className="px-4 pt-1 pb-3">
            <ColumnChart selected={String(maxWd.weekday)}
              data={wd.map((w) => ({ key: String(w.weekday), label: `週${w.label}`, value: w.amount, callout: `週${w.label} 支出` }))} />
            <div className="pt-1 text-[12px] text-label-2">全部期間加總。</div>
          </div>
        )}
      </Card>
    </div>
  );
}
