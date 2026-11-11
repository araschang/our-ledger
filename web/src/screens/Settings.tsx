/** 設定（iOS 設定 app 的樣子）：這支手機、名字、分類、固定支出、預算、匯出。改了就存，兩支手機都會更新。 */
import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { ActionSheet, CatIcon, Dot, Group, Row, Screen, toast } from "../components/ui";
import { fixedCats, normalizeMeta } from "../lib/analytics";
import { timeAgo } from "../lib/format";
import { setPrefs, usePrefs } from "../lib/prefs";
import { store, useStore } from "../lib/store";
import type { Meta } from "../lib/types";
import { cx, personColor } from "../lib/ui";

/** iOS 的下拉選單：用原生 select（iPhone 上會跳出系統的選擇器）。 */
function Picker<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <span className="relative flex items-center gap-1 text-[17px] text-label-2">
      {options.find((o) => o.value === value)?.label ?? "—"}
      <Icon name="updown" size={14} strokeWidth={2.4} />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 cursor-pointer opacity-0">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </span>
  );
}

function CategoryList({ title, list, onSave }: { title: string; list: string[]; onSave: (l: string[]) => void }) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [del, setDel] = useState<string | null>(null);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const l = list.slice();
    [l[i], l[j]] = [l[j], l[i]];
    onSave(l);
  };
  const add = () => {
    const v = name.trim();
    setAdding(false);
    setName("");
    if (!v) return;
    if (list.includes(v)) {
      toast(`「${v}」已經有了`, { tone: "error" });
      return;
    }
    onSave([...list, v]);
    toast(`已新增分類　${v}`);
  };
  return (
    <Group header={title} headerRight={
      <button className="press text-[15px] text-tint normal-case" onClick={() => setEditing((e) => !e)}>{editing ? "完成" : "編輯"}</button>
    } inset={editing ? 98 : 58}>
      {list.map((c, i) => (
        <div key={c} className="flex min-h-[48px] items-center gap-3 px-4 py-2">
          {editing && (
            <button className="press flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-red text-white disabled:opacity-30"
              disabled={list.length <= 1} onClick={() => setDel(c)} aria-label={`刪除 ${c}`}>
              <Icon name="minus" size={14} strokeWidth={3.2} />
            </button>
          )}
          <CatIcon category={c} size={30} />
          <span className="flex-1 truncate text-[17px]">{c}</span>
          {editing && (
            <span className="flex text-label-2">
              <button className="press p-1.5 disabled:opacity-25" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${c} 往上`}>
                <Icon name="arrowUp" size={19} />
              </button>
              <button className="press p-1.5 disabled:opacity-25" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`${c} 往下`}>
                <Icon name="arrowDown" size={19} />
              </button>
            </span>
          )}
        </div>
      ))}
      {adding ? (
        <div className="flex items-center gap-3 px-4 py-2">
          <CatIcon category={name.trim() || "新"} size={30} />
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={12} placeholder="分類名稱"
            onBlur={add} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} enterKeyHint="done"
            className="h-8 min-w-0 flex-1 bg-transparent text-[17px] outline-none" />
        </div>
      ) : (
        <button className="row-press flex min-h-[48px] w-full items-center gap-3 px-4 text-left text-[17px] text-tint" onClick={() => setAdding(true)}>
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-green text-white"><Icon name="plus" size={18} strokeWidth={2.8} /></span>
          新增分類…
        </button>
      )}
      <ActionSheet open={!!del} onClose={() => setDel(null)} message={`刪除「${del}」分類？以前記的帳不會動，照樣顯示原本的分類。`}
        actions={[{ label: "刪除分類", destructive: true, onClick: () => {
          onSave(list.filter((x) => x !== del));
          setDel(null);
        } }]} />
    </Group>
  );
}

function exportCsv(meta: Meta) {
  const data = store.getSnapshot().data;
  if (!data) return;
  const names = Object.fromEntries(meta.people.map((p) => [p.id, p.name]));
  const head = ["日期", "付款人", "類型", "分類", "品項", "金額", "幣別", "分法", "備註", "id", "建立時間"];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const type: Record<string, string> = { expense: "支出", income: "收入", settle: "結清" };
  const split: Record<string, string> = { half: "平分", own: "自己", advance: "代墊" };
  const lines = [...data.transactions]
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
    .map((t) => [t.date, names[t.person] ?? t.person, type[t.type] ?? t.type, t.category, t.item,
      t.amount.toFixed(2), t.currency, t.type === "expense" ? split[t.split] ?? t.split : "", t.note, t.id, t.created_at]
      .map(esc).join(","));
  const blob = new Blob([`﻿${[head.join(","), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `our-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function BudgetInput({ value, onCommit, label }: { value: number | undefined; onCommit: (v: number | null) => void; label: string }) {
  const [text, setText] = useState(value ? String(value) : "");
  useEffect(() => setText(value ? String(value) : ""), [value]);
  const commit = () => {
    const v = Number(text);
    const next = text.trim() === "" || !Number.isFinite(v) || v <= 0 ? null : Math.round(v * 100) / 100;
    if ((next ?? 0) !== (value ?? 0)) onCommit(next);
    else setText(value ? String(value) : "");
  };
  return (
    <span className="flex items-center justify-end text-[17px] text-label-2">
      {text && "$"}
      <input inputMode="decimal" value={text} placeholder="未設定" aria-label={`${label} 預算`}
        onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))} onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} enterKeyHint="done"
        style={{ width: text ? `${text.length + 0.4}ch` : "4.2em" }}
        className="rounded-num tnum bg-transparent text-right text-label outline-none placeholder:text-label-3" />
    </span>
  );
}

export function Settings({ trailing }: { trailing: React.ReactNode }) {
  const snap = useStore();
  const prefs = usePrefs();
  const meta = normalizeMeta(snap.data?.meta);
  const fixed = fixedCats(meta);
  const budgets = meta.budgets ?? {};
  const [names, setNames] = useState(meta.people.map((p) => p.name));
  const metaKey = JSON.stringify(snap.data?.meta?.people ?? []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setNames(meta.people.map((p) => p.name)), [metaKey]);

  const commitName = (i: number) => {
    const v = names[i].trim();
    if (!v) {
      setNames(meta.people.map((p) => p.name));
      toast("名字不能空白", { tone: "error" });
      return;
    }
    if (v === meta.people[i].name) return;
    store.saveMeta({ people: meta.people.map((p, j) => (j === i ? { ...p, name: v } : p)) });
    toast("名字已更新");
  };

  const saveBudget = (c: string, v: number | null) => {
    // 只存現在的支出分類（刪掉的分類，預算也一起清掉）
    const next = Object.fromEntries(meta.categories.expense
      .map((x) => [x, x === c ? v : Number(budgets[x] ?? 0)] as const)
      .filter(([, n]) => n != null && n > 0)) as Record<string, number>;
    store.saveMeta({ budgets: next });
  };

  return (
    <Screen title="設定" trailing={trailing}>
      <Group top={12} header="這支手機" footer="只影響這支手機。">
        <Row title="我是" value={null}>
          <Picker label="我是" value={prefs.me ?? ""} onChange={(v) => setPrefs({ me: v })}
            options={meta.people.map((p) => ({ value: p.id, label: p.name }))} />
        </Row>
        <Row title="打開 app 時">
          <Picker label="打開 app 時" value={prefs.launch} onChange={(v) => setPrefs({ launch: v })}
            options={[{ value: "entry", label: "直接記一筆" }, { value: "list", label: "看明細" }]} />
        </Row>
        <Row title="外觀">
          <Picker label="外觀" value={prefs.theme} onChange={(v) => setPrefs({ theme: v })}
            options={[{ value: "system", label: "跟系統" }, { value: "light", label: "淺色" }, { value: "dark", label: "深色" }]} />
        </Row>
      </Group>

      <Group header="名字" footer="兩支手機都會更新。" inset={40}>
        {meta.people.map((p, i) => (
          <label key={p.id} className="flex min-h-[44px] items-center gap-3 px-4">
            <Dot color={personColor(meta, p.id)} size={12} />
            <input value={names[i] ?? ""} maxLength={20} aria-label={`第 ${i + 1} 位的名字`}
              onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))}
              onBlur={() => commitName(i)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              enterKeyHint="done" className="h-11 min-w-0 flex-1 bg-transparent outline-none" />
          </label>
        ))}
      </Group>

      <CategoryList title="支出分類" list={meta.categories.expense}
        onSave={(l) => store.saveMeta({ categories: { expense: l, income: meta.categories.income } })} />
      <div className="px-8 pt-2 text-[13px] text-label-2">記帳畫面照這個順序。刪掉分類不會動到以前的帳。</div>
      <CategoryList title="收入分類" list={meta.categories.income}
        onSave={(l) => store.saveMeta({ categories: { expense: meta.categories.expense, income: l } })} />

      <Group header="固定支出" footer="房租、水電這種每月躲不掉的；損益表會分開算。" inset={58}>
        {meta.categories.expense.map((c) => {
          const on = fixed.includes(c);
          return (
            <button key={c} aria-pressed={on} className="row-press flex min-h-[48px] w-full items-center gap-3 px-4 text-left"
              onClick={() => store.saveMeta({ fixed_categories: on ? fixed.filter((x) => x !== c) : [...fixed, c] })}>
              <CatIcon category={c} size={30} />
              <span className="flex-1 text-[17px]">{c}</span>
              <Icon name="check" size={19} strokeWidth={2.6} className={cx("text-tint", !on && "opacity-0")} />
            </button>
          );
        })}
      </Group>

      <Group header="每月預算" footer="空白就是不設；設了的會出現在總覽。" inset={58}>
        {meta.categories.expense.map((c) => (
          <div key={c} className="flex min-h-[48px] items-center gap-3 px-4">
            <CatIcon category={c} size={30} />
            <span className="flex-1 text-[17px]">{c}</span>
            <BudgetInput label={c} value={budgets[c] ? Number(budgets[c]) : undefined} onCommit={(v) => saveBudget(c, v)} />
          </div>
        ))}
      </Group>

      <Group header="資料" footer={`匯率${snap.data?.rates_source === "live" ? "每天更新" : "暫用保底值"}：1 USD ≈ ${(snap.data?.rates?.USD ?? 0).toFixed(4)} CAD · 我們的記帳本 v2`}>
        <Row title="匯出全部（CSV）" tone="tint" onClick={() => meta && exportCsv(meta)}>
          <Icon name="download" size={19} className="text-tint" />
        </Row>
        <Row title="帳本" value={`${snap.data?.transactions.length ?? 0} 筆`} />
        <Row title="上次同步" value={snap.lastSync ? timeAgo(snap.lastSync) : "—"} />
        {snap.pending > 0 && <Row title="待上傳" value={`${snap.pending} 筆`} />}
      </Group>
    </Screen>
  );
}
