/** 明細（iOS 清單）：按日期分組，點一下修改、左滑刪除；只看某人、某分類，或搜尋全部月份。 */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { ROW_INSET, TxnRow } from "../components/TxnRow";
import { CatIcon, Empty, Group, MonthRow, Screen, SearchField, Segmented, Sheet, toast } from "../components/ui";
import { normalizeMeta } from "../lib/analytics";
import { dayHeading, money, monthTitle, todayLocal } from "../lib/format";
import { store, useStore } from "../lib/store";
import type { Txn } from "../lib/types";
import { cx } from "../lib/ui";

export function ListScreen({ month, setMonth, range, onEdit, flashId, trailing }: {
  month: string;
  setMonth: (m: string) => void;
  range: [string, string];
  onEdit: (t: Txn) => void;
  flashId: string | null;
  trailing: React.ReactNode;
}) {
  const snap = useStore();
  const data = snap.data!;
  const meta = normalizeMeta(data.meta);
  const rates = data.rates ?? { CAD: 1 };
  const today = todayLocal();
  const [who, setWho] = useState<string>("all");
  const [cat, setCat] = useState<string | null>(null);
  const [pickCat, setPickCat] = useState(false);
  const [query, setQuery] = useState("");

  const cad = (t: Txn) => t.amount * (rates[t.currency] ?? 1);
  const q = query.trim().toLowerCase();

  const rows = useMemo(() => data.transactions
    .filter((t) => (q ? `${t.item} ${t.note} ${t.category}`.toLowerCase().includes(q) : t.date.startsWith(month))
      && (who === "all" || t.person === who) && (!cat || t.category === cat))
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)),
  [data.transactions, month, who, cat, q]);

  const groups = useMemo(() => {
    const out: { key: string; title: string; total: number; items: Txn[] }[] = [];
    for (const t of q ? rows.slice(0, 300) : rows) {
      const key = q ? t.date.slice(0, 7) : t.date;
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, title: q ? monthTitle(key) : dayHeading(key, today), total: 0, items: [] };
        out.push(g);
      }
      g.items.push(t);
      if (t.type === "expense") g.total += cad(t);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, today]);

  const expense = rows.filter((t) => t.type === "expense").reduce((s, t) => s + cad(t), 0);
  const income = rows.filter((t) => t.type === "income").reduce((s, t) => s + cad(t), 0);

  useEffect(() => {
    if (!flashId) return;
    document.getElementById(`row-${flashId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [flashId, month]);

  const del = (t: Txn) => {
    const backup = store.remove(t.id);
    toast(`已刪除　${t.item || t.category}`, {
      action: backup ? { label: "復原", fn: () => store.restore(backup) } : undefined,
    });
  };

  const cats = [...new Set([...meta.categories.expense, ...meta.categories.income,
    ...data.transactions.map((t) => t.category)])].filter(Boolean);

  return (
    <Screen title="明細" trailing={trailing} header={
      <>
        {!q && <MonthRow month={month} min={range[0]} max={range[1]} onChange={setMonth} />}
        <div className="flex items-center gap-2 px-4 pt-2">
          <SearchField value={query} onChange={setQuery} placeholder="搜尋品項、備註、分類" />
          {query && <button className="press text-[17px] text-tint" onClick={() => setQuery("")}>取消</button>}
        </div>
        <div className="flex items-center gap-2 px-4 pt-3">
          <Segmented className="flex-1" ariaLabel="付款人" value={who} onChange={setWho}
            options={[{ value: "all", label: "全部" }, ...meta.people.map((p) => ({ value: p.id, label: p.name }))]} />
          <button onClick={() => setPickCat(true)} aria-label="只看某個分類"
            className={cx("press flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold",
              cat ? "bg-tint text-white" : "bg-fill-3 text-tint")}>
            {cat ?? "分類"}
            <Icon name="down" size={13} strokeWidth={2.8} />
          </button>
        </div>
        <div className="rounded-num tnum flex items-baseline gap-3 px-4 pt-4 text-[15px] text-label-2">
          <span>支出 <b className="font-semibold text-label">{money(expense)}</b></span>
          {income > 0 && <span>收入 <b className="font-semibold text-money-in">{money(income)}</b></span>}
          <span className="ml-auto">{q ? "全部月份 · " : ""}{rows.length} 筆</span>
        </div>
      </>
    }>
      {groups.length === 0 && (
        <Empty icon={q ? "search" : "list"} title={q ? "沒有結果" : "這個月還沒有記錄"}
          hint={q ? "換個關鍵字試試" : cat || who !== "all" ? "或把篩選清掉看看" : "按下面的 ＋ 記第一筆"} />
      )}
      {groups.map((g) => (
        <Group key={g.key} header={g.title} headerRight={g.total > 0 ? `支出 ${money(g.total)}` : undefined}
          inset={ROW_INSET} top={20}>
          {g.items.map((t) => (
            <div key={t.id} id={`row-${t.id}`}>
              <TxnRow txn={t} meta={meta} onTap={() => onEdit(t)} onDelete={() => del(t)}
                amount={t.currency !== "CAD" ? cad(t) : undefined}
                pending={snap.pendingIds.has(t.id)} flash={t.id === flashId}
                showDate={q ? `${Number(t.date.slice(5, 7))}/${Number(t.date.slice(8, 10))}` : undefined} />
            </div>
          ))}
        </Group>
      ))}
      {q && rows.length > 300 && (
        <div className="py-3 text-center text-[13px] text-label-2">只顯示最近 300 筆，關鍵字打詳細一點</div>
      )}

      <Sheet open={pickCat} onClose={() => setPickCat(false)} title="只看這個分類">
        <div className="ios-rows overflow-hidden rounded-[12px] bg-card-2" style={{ "--sep-inset": "58px" } as React.CSSProperties}>
          <button className="row-press flex h-12 w-full items-center gap-3 px-4 text-left"
            onClick={() => {
              setCat(null);
              setPickCat(false);
            }}>
            <span className="w-[30px]" />
            <span className="flex-1 text-[17px]">全部分類</span>
            {!cat && <Icon name="check" size={18} strokeWidth={2.6} className="text-tint" />}
          </button>
          {cats.map((c) => (
            <button key={c} className="row-press flex h-12 w-full items-center gap-3 px-4 text-left"
              onClick={() => {
                setCat(c);
                setPickCat(false);
              }}>
              <CatIcon category={c} size={30} />
              <span className="flex-1 text-[17px]">{c}</span>
              {c === cat && <Icon name="check" size={18} strokeWidth={2.6} className="text-tint" />}
            </button>
          ))}
        </div>
      </Sheet>
    </Screen>
  );
}
