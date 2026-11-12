/**
 * 記一筆／修改（iOS 頁面卡片，金額區學 Apple Cash）：
 * 打開就是數字鍵盤 → 點分類 →（品項可不填）→ 記下來。
 * 付款人預設這支手機的主人；平分/自己/代墊記住「這個人上次在這個分類怎麼選」；
 * 選了分類會列出最近常記的品項，點一下就填好。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { ActionSheet, Avatar, BigButton, CatIcon, Segmented, Sheet, TextButton, toast, useWide } from "../components/ui";
import { normalizeMeta } from "../lib/analytics";
import { addDays, CURRENCY_SYMBOL, dayShort, money, todayLocal } from "../lib/format";
import { getPrefs } from "../lib/prefs";
import { store, type TxnInput, useStore } from "../lib/store";
import type { Txn } from "../lib/types";
import { cx, nameOf, otherOf } from "../lib/ui";

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
  const wide = useWide();
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
  const ready = amount > 0 && (isSettle || !!category);

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

  const nudge = (what: "amt" | "cat", msg: string) => {
    setShake(what);
    setTimeout(() => setShake(null), 400);
    toast(msg, { tone: "error" });
  };

  const save = () => {
    if (!(amount > 0)) return nudge("amt", "先輸入金額");
    if (!isSettle && !category) return nudge("cat", "選一個分類");
    const payload: TxnInput = {
      date, person, type, category: isSettle ? "結清" : category!, item: item.trim(),
      amount: Math.round(amount * 100) / 100, note: note.trim(), currency,
      split: type === "expense" ? split : "own", source: editing?.source ?? "app",
      location: editing?.location ?? "",
    };
    const label = `${isSettle ? "結清" : item.trim() || category} ${money(amount * rate)}`;
    if (editing) {
      const before: TxnInput = { date: editing.date, person: editing.person, type: editing.type,
        category: editing.category, item: editing.item, amount: editing.amount, note: editing.note,
        currency: editing.currency, split: editing.split, source: editing.source,
        location: editing.location ?? "" };
      store.update(editing.id, payload);
      toast(`已更新　${label}`, { action: { label: "復原", fn: () => store.update(editing.id, before) } });
      onSaved(editing.id);
    } else {
      const id = store.add(payload);
      toast(`已記下　${label}`, { action: { label: "復原", fn: () => store.remove(id) } });
      onSaved(id);
    }
  };

  // 桌機：直接打字也能記
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === ".") press(".");
      else if (e.key === "Backspace") press("⌫");
      else if (e.key === "Enter") save();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const dateLabel = date === today ? "今天" : date === addDays(today, -1) ? "昨天" : dayShort(date);
  const focusProps = {
    onFocus: () => setTyping(true),
    onBlur: () => setTimeout(() => setTyping(false), 80),
  };

  return (
    <Sheet open page onClose={onClose} wideWidth={560}
      left={<TextButton onClick={onClose}>取消</TextButton>}
      title={isSettle ? "修改結清" : (
        <Segmented className="w-[164px]" ariaLabel="類型" value={type}
          onChange={(v) => {
            setType(v);
            if (!editing || v !== editing.type) setCategory(null);
          }}
          options={[{ value: "expense", label: "支出" }, { value: "income", label: "收入" }]} />
      )}
      right={
        <label className="press relative flex h-9 items-center gap-1.5 rounded-full bg-fill-3 px-3.5 text-[15px] font-bold">
          <Icon name="calendar" size={15} strokeWidth={2.2} />
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
      }
      footer={(wide || !typing) && (
        <div>
          {!wide && (
            <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
              {KEYS.map((k) => (
                <button key={k} onClick={() => press(k)} aria-label={k === "⌫" ? "刪掉一位" : k}
                  className="key rounded-num flex h-[46px] items-center justify-center rounded-[16px] bg-card-2 text-[27px] font-extrabold">
                  {k === "⌫" ? <Icon name="backspace" size={25} strokeWidth={2} /> : k}
                </button>
              ))}
            </div>
          )}
          <BigButton className={cx(!wide && "mt-2", !ready && "opacity-40")} onClick={save}>
            {editing ? "儲存" : "記下來"}
            {wide && <kbd className="rounded-md bg-[color-mix(in_oklab,var(--on-tint)_18%,transparent)] px-1.5 text-[12px] font-bold">Enter</kbd>}
          </BigButton>
        </div>
      )}
    >
      {/* 金額 */}
      <div className={cx("flex flex-col items-center pt-1", shake === "amt" && "anim-shake")}>
        <div className="rounded-num flex max-w-full items-baseline font-black">
          <span className="mr-1 text-[30px] text-label-3">{CURRENCY_SYMBOL[currency] ?? currency}</span>
          <span className={cx("truncate text-[58px] leading-[64px] tracking-[-0.02em]", !amt && "text-label-3")}>{amountText(amt)}</span>
        </div>
        {wide && !amt && <div className="-mt-1 text-[13px] font-semibold text-label-2">直接用鍵盤打數字，Enter 記下來</div>}
        <div className="mt-1.5 flex items-center gap-2">
          <button className="press flex h-9 items-center gap-1.5 rounded-full bg-fill-3 pr-3 pl-1.5 text-[15px] font-bold"
            onClick={() => setPerson(other)} aria-label="換付款人">
            <Avatar meta={meta} pid={person} size={26} />
            {isSettle ? `${nameOf(meta, person)} 付給 ${nameOf(meta, other)}` : `${nameOf(meta, person)} 付`}
            <Icon name="swap" size={14} strokeWidth={2.4} className="text-label-2" />
          </button>
          <button className="press flex h-9 items-center gap-1 rounded-full bg-fill-3 px-3.5 text-[15px] font-bold"
            onClick={() => setCurrency(CURRENCIES[(CURRENCIES.indexOf(currency) + 1) % CURRENCIES.length])}
            aria-label="切換幣別">
            {currency}
            <Icon name="updown" size={13} strokeWidth={2.6} className="text-label-2" />
          </button>
        </div>
        {currency !== "CAD" && (
          <div className="rounded-num tnum mt-1 text-[13px] text-label-2">≈ {money(amount * rate)} CAD（記下時換算）</div>
        )}
      </div>

      {/* 分類 */}
      {!isSettle && (
        <div className={cx("mt-4 grid grid-cols-6 gap-y-2.5", shake === "cat" && "anim-shake")} role="radiogroup" aria-label="分類">
          {cats.map((c) => (
            <button key={c} role="radio" aria-checked={c === category}
              onClick={() => {
                setCategory(c);
                if (!editing) setItem("");
              }}
              className="flex flex-col items-center gap-1 active:opacity-60">
              <CatIcon category={c} size={44} selected={c === category} />
              <span className={cx("w-full truncate px-0.5 text-center text-[11px] leading-[13px]",
                c === category ? "font-black text-label" : "font-semibold text-label-2")}>{c}</span>
            </button>
          ))}
        </div>
      )}

      {/* 品項＋常用 */}
      <div className="mt-4 flex items-center gap-2">
        <input ref={itemRef} value={item} onChange={(e) => setItem(e.target.value)} {...focusProps}
          placeholder={isSettle ? "說明（可不填）" : "品項（可不填）"} enterKeyHint="done" maxLength={200}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if (wide) save();
            else (e.target as HTMLInputElement).blur();
          }}
          className="h-12 min-w-0 flex-1 rounded-[16px] bg-fill-3 px-4 outline-none" />
        <button className={cx("press flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px]",
          showNote || note ? "bg-tint text-on-tint" : "bg-fill-3 text-label")}
          onClick={() => setShowNote((s) => !s)} aria-expanded={showNote} aria-label="備註">
          <Icon name="note" size={18} />
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
              className={cx("press h-8 shrink-0 rounded-full px-3.5 text-[15px] font-semibold",
                s === item ? "bg-tint text-on-tint" : "bg-fill-3")}>
              {s}
            </button>
          ))}
        </div>
      )}
      {showNote && (
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註" maxLength={900} {...focusProps}
          enterKeyHint="done" onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="mt-2 h-12 w-full rounded-[16px] bg-fill-3 px-4 outline-none" />
      )}

      {/* 分法 */}
      {type === "expense" && (
        <div className="mt-4">
          <Segmented ariaLabel="這筆怎麼算" value={split}
            onChange={(v) => {
              setSplit(v);
              setSplitTouched(true);
            }}
            options={[
              { value: "half", label: "平分" },
              { value: "own", label: `${nameOf(meta, person)}自己` },
              { value: "advance", label: `幫${nameOf(meta, other)}墊` },
            ]} />
          <div className="mt-1.5 px-1 text-center text-[13px] text-label-2">
            {split === "half" ? `兩人各一半，${nameOf(meta, other)} 要還 ${money((amount * rate) / 2)}`
              : split === "own" ? `只算 ${nameOf(meta, person)} 的，不進分帳`
                : `幫 ${nameOf(meta, other)} 付的，${nameOf(meta, other)} 要還 ${money(amount * rate)}`}
          </div>
        </div>
      )}

      {editing && (
        <div className="mt-5 flex justify-center">
          <TextButton tone="red" onClick={() => setConfirmDel(true)}>刪除這筆</TextButton>
        </div>
      )}

      <ActionSheet open={confirmDel} onClose={() => setConfirmDel(false)}
        message={editing && `${dayShort(editing.date)}　${editing.item || editing.category}　${money(editing.amount)}`}
        actions={[{
          label: "刪除這筆", destructive: true, onClick: () => {
            if (!editing) return;
            const backup = store.remove(editing.id);
            setConfirmDel(false);
            toast("已刪除", { action: backup ? { label: "復原", fn: () => store.restore(backup) } : undefined });
            onClose();
          },
        }]} />
    </Sheet>
  );
}
