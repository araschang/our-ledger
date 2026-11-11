/** 明細：按日期分組，點一下修改、左滑刪除；可以只看某人、某分類，或搜尋全部月份。 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { TxnRow } from "../components/TxnRow";
import { CatBubble, Empty, MonthNav, Sheet, toast } from "../components/ui";
import { normalizeMeta } from "../lib/analytics";
import { dayHeading, money, monthTitle, todayLocal } from "../lib/format";
import { store, useStore } from "../lib/store";
import type { Txn } from "../lib/types";
import { catEmoji, cx, personColor } from "../lib/ui";

export function ListScreen({ month, setMonth, range, onEdit, flashId, header }: {
  month: string;
  setMonth: (m: string) => void;
  range: [string, string];
  onEdit: (t: Txn) => void;
  flashId: string | null;
  header: React.ReactNode;
}) {
  const snap = useStore();
  const data = snap.data!;
  const meta = normalizeMeta(data.meta);
  const rates = data.rates ?? { CAD: 1 };
  const today = todayLocal();
  const [who, setWho] = useState<string>("all");
  const [cat, setCat] = useState<string | null>(null);
  const [pickCat, setPickCat] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const cad = (t: Txn) => t.amount * (rates[t.currency] ?? 1);
  const match = (t: Txn) => (who === "all" || t.person === who) && (!cat || t.category === cat);

  const rows = useMemo(() => {
    const q = query?.trim().toLowerCase();
    return data.transactions
      .filter((t) => (q ? `${t.item} ${t.note} ${t.category}`.toLowerCase().includes(q)
        : t.date.startsWith(month)) && match(t))
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  }, [data.transactions, month, who, cat, query]);

  const groups = useMemo(() => {
    const out: { key: string; title: string; total: number; items: Txn[] }[] = [];
    for (const t of query ? rows.slice(0, 300) : rows) {
      const key = query ? t.date.slice(0, 7) : t.date;
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, title: query ? monthTitle(key) : dayHeading(key, today), total: 0, items: [] };
        out.push(g);
      }
      g.items.push(t);
      if (t.type === "expense") g.total += cad(t);
    }
    return out;
  }, [rows, query, today]);

  const expense = rows.filter((t) => t.type === "expense").reduce((s, t) => s + cad(t), 0);
  const income = rows.filter((t) => t.type === "income").reduce((s, t) => s + cad(t), 0);

  useEffect(() => {
    if (!flashId) return;
    const el = document.getElementById(`row-${flashId}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [flashId, month]);

  const del = (t: Txn) => {
    const backup = store.remove(t.id);
    toast(`刪掉了：${t.item || t.category}`, {
      action: backup ? { label: "復原", fn: () => store.restore(backup) } : undefined,
    });
  };

  const cats = [...new Set([...meta.categories.expense, ...meta.categories.income,
    ...data.transactions.map((t) => t.category)])].filter(Boolean);

  return (
    <div className="flex h-full flex-col">
      <div className="safe-t shrink-0 bg-page px-2">
        {query === null ? (
          <div className="pt-1.5">
            <MonthNav month={month} min={range[0]} max={range[1]} onChange={setMonth} right={
              <>
                {header}
                <button className="press rounded-full p-2.5 text-ink-2" aria-label="搜尋" onClick={() => setQuery("")}>
                  <Icon name="search" />
                </button>
              </>
            } />
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2 pt-2.5 pb-1">
            <div className="flex h-10 flex-1 items-center gap-2 rounded-xl bg-card-2 px-3">
              <Icon name="search" size={18} className="text-muted" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋品項、備註、分類（全部月份）"
                className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted" enterKeyHint="search" />
            </div>
            <button className="press px-1 text-[16px] text-link" onClick={() => setQuery(null)}>取消</button>
          </div>
        )}
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-2 pt-1 pb-2">
          {[{ id: "all", name: "全部" }, ...meta.people].map((p) => (
            <button key={p.id} onClick={() => setWho(p.id)}
              className={cx("press flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[14px]",
                who === p.id ? "bg-primary font-semibold text-on-primary" : "bg-card text-ink-2 shadow-[var(--shadow)]")}>
              {p.id !== "all" && <span className="h-2 w-2 rounded-full" style={{ background: personColor(meta, p.id) }} />}
              {p.name}
            </button>
          ))}
          <button onClick={() => setPickCat(true)}
            className={cx("press flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[14px]",
              cat ? "bg-primary font-semibold text-on-primary" : "bg-card text-ink-2 shadow-[var(--shadow)]")}>
            {cat ? `${catEmoji(cat)} ${cat}` : "分類"}
            <Icon name="down" size={15} />
          </button>
          {cat && (
            <button className="press shrink-0 px-1 text-[14px] text-link" onClick={() => setCat(null)}>清除</button>
          )}
        </div>
      </div>

      <div ref={listRef} className="scroll min-h-0 flex-1 pb-28">
        <div className="tnum flex items-baseline gap-3 px-4 pt-1 pb-2 text-[14px] text-ink-2">
          <span>支出 <b className="font-semibold text-ink">{money(expense)}</b></span>
          {income > 0 && <span>收入 <b className="font-semibold text-good">{money(income)}</b></span>}
          <span className="ml-auto text-muted">{rows.length} 筆</span>
        </div>
        {groups.length === 0 && (
          <Empty title={query ? "找不到" : "這個月還沒有記錄"}
            hint={query ? "換個關鍵字試試" : cat || who !== "all" ? "或把篩選清掉看看" : "按下面的 ＋ 記第一筆"} />
        )}
        <div className="flex flex-col gap-3 px-3">
          {groups.map((g) => (
            <section key={g.key} className="card overflow-hidden">
              <div className="flex items-baseline justify-between px-4 pt-2.5 pb-1 text-[13px]">
                <span className="font-semibold text-ink-2">{g.title}</span>
                {g.total > 0 && <span className="tnum text-muted">支出 {money(g.total)}</span>}
              </div>
              <div className="divide-y divide-line">
                {g.items.map((t) => (
                  <div key={t.id} id={`row-${t.id}`}>
                    <TxnRow txn={t} meta={meta} onTap={() => onEdit(t)} onDelete={() => del(t)}
                      amount={t.currency !== "CAD" ? cad(t) : undefined}
                      pending={snap.pendingIds.has(t.id)} flash={t.id === flashId}
                      showDate={query ? `${Number(t.date.slice(5, 7))}/${Number(t.date.slice(8, 10))}` : undefined} />
                  </div>
                ))}
              </div>
            </section>
          ))}
          {query && rows.length > 300 && (
            <div className="py-2 text-center text-[13px] text-muted">只顯示最近 300 筆，關鍵字打詳細一點</div>
          )}
        </div>
      </div>

      <Sheet open={pickCat} onClose={() => setPickCat(false)} title="只看這個分類">
        <div className="grid grid-cols-4 gap-2 pb-2">
          {cats.map((c) => (
            <button key={c} onClick={() => {
              setCat(c);
              setPickCat(false);
            }}
              className={cx("press flex flex-col items-center gap-1 rounded-xl py-2.5", c === cat ? "bg-primary text-on-primary" : "bg-card-2")}>
              <CatBubble category={c} size={34} />
              <span className="text-[12px]">{c}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

