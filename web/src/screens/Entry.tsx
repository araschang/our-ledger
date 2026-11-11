/**
 * 記一筆／修改：打開就是數字鍵盤，點分類 → （品項可不填）→ 記下來。
 * 付款人預設這支手機的主人；平分/自己/代墊記住「這個人上次在這個分類怎麼選」；
 * 選了分類會列出最近常記的品項，點一下就填好。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { Segmented, Sheet, toast } from "../components/ui";
import { normalizeMeta } from "../lib/analytics";
import { addDays, CURRENCY_SYMBOL, dayShort, money, todayLocal } from "../lib/format";
import { getPrefs } from "../lib/prefs";
import { store, type TxnInput, useStore } from "../lib/store";
import type { Txn } from "../lib/types";
import { catEmoji, cx, nameOf, otherOf, personColor } from "../lib/ui";

const CURRENCIES = ["CAD", "USD", "TWD"];
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

export type EntryTarget = { mode: "new"; type?: "expense" | "income" } | { mode: "edit"; txn: Txn };

function amountText(s: string): string {
  if (!s) return "0";
  const [i, d] = s.split(".");
  const int = Number(i || "0").toLocaleString("en-US");
  return d === undefined ? int : `${int}.${d}`;
}

function strOf(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

export function Entry({ target, onClose, onSaved }: {
  target: EntryTarget;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const snap = useStore();
  const data = snap.data!;
  const meta = normalizeMeta(data.meta);
  const ids = meta.people.map((p) => p.id);
  const editing = target.mode === "edit" ? target.txn : null;
  const today = todayLocal();
  const me = getPrefs().me && ids.includes(getPrefs().me!) ? getPrefs().me! : ids[0];

  const [type, setType] = useState<string>(editing?.type ?? (target.mode === "new" ? target.type ?? "expense" : "expense"));
  const [person, setPerson] = useState(editing?.person ?? me);
  const [amt, setAmt] = useState(editing ? strOf(editing.amount) : "");
  const [currency, setCurrency] = useState(editing?.currency ?? "CAD");
  const [category, setCategory] = useState<string | null>(editing?.category ?? null);
  const [item, setItem] = useState(editing?.item ?? "");
  const [split, setSplit] = useState(editing?.split ?? "half");
  const [splitTouched, setSplitTouched] = useState(!!editing);
  const [date, setDate] = useState(editing?.date ?? today);
  const [note, setNote] = useState(editing?.note ?? "");
  const [showNote, setShowNote] = useState(!!editing?.note);
  const [typing, setTyping] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [shake, setShake] = useState<"amt" | "cat" | null>(null);
  const itemRef = useRef<HTMLInputElement>(null);

  const isSettle = type === "settle";
  const cats = useMemo(() => {
    const base = type === "income" ? meta.categories.income : meta.categories.expense;
    return category && !base.includes(category) && !isSettle ? [...base, category] : base;
  }, [type, meta, category, isSettle]);

  // 這個人上次在每個分類用的分法；每個分類最近常記的品項
  const history = useMemo(() => {
    const lastSplit = new Map<string, string>();
    const items = new Map<string, Map<string, { n: number; last: string }>>();
    const since = addDays(today, -180);
    const sorted = [...data.transactions].sort((a, b) => a.date.localeCompare(b.date)
      || a.created_at.localeCompare(b.created_at));
    for (const t of sorted) {
      if (t.type === "expense" && t.person === person) lastSplit.set(t.category, t.split);
      const it = t.item.trim();
      if (!it || t.date < since || t.type === "settle") continue;
      const key = `${t.type}|${t.category}`;
      if (!items.has(key)) items.set(key, new Map());
      const m = items.get(key)!;
      const cur = m.get(it) ?? { n: 0, last: "" };
      m.set(it, { n: cur.n + 1, last: t.date > cur.last ? t.date : cur.last });
    }
    return { lastSplit, items };
  }, [data.transactions, person, today]);

  const suggestions = useMemo(() => {
    if (!category) return [];
    const m = history.items.get(`${type}|${category}`);
    if (!m) return [];
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last.localeCompare(a[1].last))
      .slice(0, 8).map(([k]) => k);
  }, [history, type, category]);

  useEffect(() => {
    if (type === "expense" && category && !splitTouched) {
      setSplit(history.lastSplit.get(category) ?? "half");
    }
  }, [category, person, type, splitTouched, history]);

  const amount = Number(amt || "0");
  const rate = data.rates?.[currency] ?? 1;
  const other = otherOf(meta, person);

  const press = (k: string) => {
    setAmt((s) => {
      if (k === "⌫") return s.slice(0, -1);
      if (k === ".") return s.includes(".") ? s : s === "" ? "0." : `${s}.`;
      if (s === "0") return k;
      const [i, d] = s.split(".");
      if (d !== undefined && d.length >= 2) return s;
      if (d === undefined && i.length >= 7) return s;
      return s + k;
    });
  };

  const save = () => {
    if (!(amount > 0)) {
      setShake("amt");
      setTimeout(() => setShake(null), 400);
      toast("先輸入金額");
      return;
    }
    if (!isSettle && !category) {
      setShake("cat");
      setTimeout(() => setShake(null), 400);
      toast("選一個分類");
      return;
    }
    const payload: TxnInput = {
      date, person, type, category: isSettle ? "結清" : category!, item: item.trim(),
      amount: Math.round(amount * 100) / 100, note: note.trim(), currency,
      split: type === "expense" ? split : "own", source: editing?.source ?? "app",
    };
    const label = `${isSettle ? "結清" : item.trim() || category} ${money(amount * rate)}`;
    if (editing) {
      const before: TxnInput = { date: editing.date, person: editing.person, type: editing.type,
        category: editing.category, item: editing.item, amount: editing.amount, note: editing.note,
        currency: editing.currency, split: editing.split, source: editing.source };
      store.update(editing.id, payload);
      toast(`改好了：${label}`, { action: { label: "復原", fn: () => store.update(editing.id, before) } });
      onSaved(editing.id);
    } else {
      const id = store.add(payload);
      toast(`記好了：${label}`, { action: { label: "復原", fn: () => store.remove(id) } });
      onSaved(id);
    }
  };

  // 桌機：直接打字也能記
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === ".") press(".");
      else if (e.key === "Backspace") press("⌫");
      else if (e.key === "Enter") save();
      else if (e.key === "Escape") onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const dateLabel = date === today ? "今天" : date === addDays(today, -1) ? "昨天" : dayShort(date);

  return (
    <div className="anim-sheet fixed inset-0 z-40 flex flex-col bg-page">
      <div className="mx-auto flex h-full w-full max-w-xl flex-col">
        {/* 標題列 */}
        <div className="safe-t shrink-0">
          <div className="flex h-12 items-center gap-1 px-2">
            <button className="press rounded-full p-2.5 text-ink-2" onClick={onClose} aria-label="關閉">
              <Icon name="x" />
            </button>
            <div className="text-[17px] font-semibold">
              {editing ? (isSettle ? "修改結清" : "修改這筆") : "記一筆"}
            </div>
            <div className="ml-auto flex items-center gap-1">
              <label className="press relative flex h-9 items-center gap-1.5 rounded-full bg-card px-3 text-[14px] font-medium shadow-[var(--shadow)]">
                <Icon name="calendar" size={16} className="text-ink-2" />
                {dateLabel}
                <input type="date" value={date} max="2099-12-31" aria-label="日期"
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  onClick={(e) => {
                    try {
                      (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
                    } catch {
                      /* iOS 點了本來就會跳出選日期 */
                    }
                  }}
                  className="absolute inset-0 opacity-0" />
              </label>
              {editing && (
                <button className="press rounded-full p-2.5 text-bad" onClick={() => setConfirmDel(true)} aria-label="刪除">
                  <Icon name="trash" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 上半：可捲動 */}
        <div className="scroll min-h-0 flex-1 px-4 pb-3">
          <div className="flex items-center gap-2 pt-1">
            {!isSettle ? (
              <Segmented size="sm" className="w-[132px] shrink-0" ariaLabel="類型" value={type}
                onChange={(v) => {
                  setType(v);
                  if (!editing || v !== editing.type) setCategory(null);
                }}
                options={[{ value: "expense", label: "支出" }, { value: "income", label: "收入" }]} />
            ) : (
              <div className="rounded-lg bg-card-2 px-3 py-1.5 text-[13px] text-ink-2">🤝 結清</div>
            )}
            <Segmented size="sm" className="ml-auto min-w-0 flex-1" ariaLabel={isSettle ? "誰付給對方" : "誰付的"}
              value={person} onChange={setPerson}
              options={meta.people.map((p) => ({ value: p.id, label: (
                <><span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: personColor(meta, p.id) }} />{p.name}</>
              ) }))} />
          </div>

          {/* 金額 */}
          <div className={cx("mt-3 flex items-end gap-2 rounded-2xl bg-card px-4 py-3 shadow-[var(--shadow)]",
            shake === "amt" && "animate-[shake_0.35s]")}>
            <button className="press mb-1 shrink-0 rounded-lg bg-card-2 px-2 py-1 text-[13px] font-semibold text-ink-2"
              onClick={() => setCurrency(CURRENCIES[(CURRENCIES.indexOf(currency) + 1) % CURRENCIES.length])}
              aria-label="切換幣別">
              {currency}
            </button>
            <div className="min-w-0 flex-1 text-right">
              <div className={cx("truncate text-[40px] leading-none font-semibold tracking-tight", !amt && "text-muted")}>
                <span className="mr-1 text-[24px] font-medium text-muted">{CURRENCY_SYMBOL[currency] ?? currency}</span>
                {amountText(amt)}
              </div>
              {currency !== "CAD" && (
                <div className="tnum mt-1 text-[13px] text-muted">≈ {money(amount * rate)} CAD（記下時換算）</div>
              )}
            </div>
          </div>

          {/* 分類 */}
          {!isSettle && (
            <div className={cx("mt-3 grid grid-cols-6 gap-1.5", shake === "cat" && "animate-[shake_0.35s]")}
              role="radiogroup" aria-label="分類">
              {cats.map((c) => (
                <button key={c} role="radio" aria-checked={c === category}
                  onClick={() => {
                    setCategory(c);
                    if (!editing) setItem("");
                  }}
                  className={cx("press flex h-[58px] flex-col items-center justify-center gap-0.5 rounded-xl px-0.5",
                    c === category ? "bg-primary text-on-primary" : "bg-card text-ink shadow-[var(--shadow)]")}>
                  <span className="text-[21px] leading-none">{catEmoji(c)}</span>
                  <span className={cx("w-full truncate text-center leading-tight", c.length > 3 ? "text-[10.5px]" : "text-[12px]")}>{c}</span>
                </button>
              ))}
            </div>
          )}

          {/* 品項＋常用 */}
          <div className="mt-3 flex items-center gap-2">
            <input ref={itemRef} value={item} onChange={(e) => setItem(e.target.value)}
              onFocus={() => setTyping(true)} onBlur={() => setTimeout(() => setTyping(false), 80)}
              placeholder={isSettle ? "說明（可不填）" : "品項（可不填）"} enterKeyHint="done"
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="h-11 min-w-0 flex-1 rounded-xl bg-card px-3.5 text-[16px] shadow-[var(--shadow)] outline-none placeholder:text-muted focus:ring-2 focus:ring-[var(--link)]" />
            <button className={cx("press flex h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-[14px]",
              showNote || note ? "bg-card-3 text-ink" : "bg-card text-ink-2 shadow-[var(--shadow)]")}
              onClick={() => setShowNote((s) => !s)} aria-expanded={showNote}>
              <Icon name="note" size={16} />備註
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
              {suggestions.map((s) => (
                <button key={s} onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setItem(s);
                    itemRef.current?.blur();
                  }}
                  className={cx("press h-8 shrink-0 rounded-full px-3 text-[14px]",
                    s === item ? "bg-primary text-on-primary" : "bg-card-2 text-ink")}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {showNote && (
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註"
              onFocus={() => setTyping(true)} onBlur={() => setTimeout(() => setTyping(false), 80)}
              enterKeyHint="done" onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="mt-2 h-11 w-full rounded-xl bg-card px-3.5 text-[16px] shadow-[var(--shadow)] outline-none placeholder:text-muted focus:ring-2 focus:ring-[var(--link)]" />
          )}

          {/* 分法 */}
          {type === "expense" && (
            <div className="mt-3">
              <Segmented ariaLabel="這筆怎麼算" value={split}
                onChange={(v) => {
                  setSplit(v);
                  setSplitTouched(true);
                }}
                options={[
                  { value: "half", label: "👫 平分" },
                  { value: "own", label: `🙋 ${nameOf(meta, person)}自己` },
                  { value: "advance", label: `🤝 幫${nameOf(meta, other)}墊` },
                ]} />
              <div className="mt-1.5 px-1 text-[12px] text-muted">
                {split === "half" ? `兩人各出一半：${nameOf(meta, other)} 要還 ${money((amount * rate) / 2)}`
                  : split === "own" ? `只算 ${nameOf(meta, person)} 的，不進分帳`
                    : `幫 ${nameOf(meta, other)} 付的，${nameOf(meta, other)} 要還全額 ${money(amount * rate)}`}
              </div>
            </div>
          )}
        </div>

        {/* 數字鍵盤 */}
        {!typing && (
          <div className="safe-b shrink-0 border-t border-line bg-card-2 px-2 pt-2">
            <div className="grid grid-cols-[1fr_1fr_1fr_1.15fr] gap-1.5 pb-2">
              <div className="col-span-3 grid grid-cols-3 gap-1.5">
                {KEYS.map((k) => (
                  <button key={k} onClick={() => press(k)} aria-label={k === "⌫" ? "刪掉一位" : k}
                    className="press flex h-[50px] items-center justify-center rounded-xl bg-card text-[23px] font-medium shadow-[0_1px_0_rgba(0,0,0,0.08)] active:bg-card-3">
                    {k === "⌫" ? <Icon name="backspace" size={24} /> : k}
                  </button>
                ))}
              </div>
              <button onClick={save}
                className={cx("press flex flex-col items-center justify-center gap-1 rounded-xl text-[17px] font-semibold",
                  amount > 0 && (category || isSettle) ? "bg-primary text-on-primary" : "bg-card-3 text-muted")}>
                <Icon name="check" size={26} strokeWidth={2.4} />
                {editing ? "儲存" : "記下來"}
              </button>
            </div>
          </div>
        )}
      </div>

      <Sheet open={confirmDel} onClose={() => setConfirmDel(false)} title="刪除這筆？">
        <div className="pb-2 text-[15px] text-ink-2">
          {editing && `${dayShort(editing.date)}　${editing.item || editing.category}　${money(editing.amount)}`}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button className="press h-12 rounded-xl bg-card-2 font-medium" onClick={() => setConfirmDel(false)}>取消</button>
          <button className="press h-12 rounded-xl bg-bad font-semibold text-white"
            onClick={() => {
              if (!editing) return;
              const backup = store.remove(editing.id);
              setConfirmDel(false);
              toast("刪掉了", { action: backup ? { label: "復原", fn: () => store.restore(backup) } : undefined });
              onClose();
            }}>
            刪除
          </button>
        </div>
      </Sheet>
    </div>
  );
}

