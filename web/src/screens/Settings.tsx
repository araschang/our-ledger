/** 設定：這支手機（我是誰、打開先看哪、深淺色）、兩人共用的名字/分類/固定支出/預算、匯出。 */
import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { Card, Segmented, toast } from "../components/ui";
import { fixedCats, normalizeMeta } from "../lib/analytics";
import { timeAgo } from "../lib/format";
import { setPrefs, usePrefs } from "../lib/prefs";
import { store, useStore } from "../lib/store";
import type { Meta } from "../lib/types";
import { catEmoji, cx, personColor } from "../lib/ui";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sameMap = (a: Record<string, number>, b: Record<string, number>) =>
  same(Object.entries(a).sort(), Object.entries(b).sort());

function SaveBar({ dirty, onSave, onReset }: { dirty: boolean; onSave: () => void; onReset: () => void }) {
  if (!dirty) return null;
  return (
    <div className="mt-3 flex gap-2">
      <button className="press h-11 flex-1 rounded-xl bg-card-2 text-[15px]" onClick={onReset}>還原</button>
      <button className="press h-11 flex-[2] rounded-xl bg-primary text-[15px] font-semibold text-on-primary" onClick={onSave}>
        儲存（兩支手機都會更新）
      </button>
    </div>
  );
}

function CategoryEditor({ title, list, onChange }: { title: string; list: string[]; onChange: (l: string[]) => void }) {
  const [add, setAdd] = useState("");
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const l = list.slice();
    [l[i], l[j]] = [l[j], l[i]];
    onChange(l);
  };
  const doAdd = () => {
    const v = add.trim();
    if (!v) return;
    if (list.includes(v)) {
      toast(`「${v}」已經有了`);
      return;
    }
    onChange([...list, v]);
    setAdd("");
  };
  return (
    <div>
      <div className="mb-1 text-[13px] text-muted">{title}</div>
      <div className="divide-y divide-line rounded-xl bg-card-2">
        {list.map((c, i) => (
          <div key={c} className="flex items-center gap-2 py-1.5 pr-1 pl-3">
            <span className="text-[18px]">{catEmoji(c)}</span>
            <span className="min-w-0 flex-1 truncate text-[15px]">{c}</span>
            <button className="press rounded-lg p-1.5 text-ink-2 disabled:opacity-25" disabled={i === 0}
              onClick={() => move(i, -1)} aria-label={`${c} 往上`}><Icon name="arrowUp" size={18} /></button>
            <button className="press rounded-lg p-1.5 text-ink-2 disabled:opacity-25" disabled={i === list.length - 1}
              onClick={() => move(i, 1)} aria-label={`${c} 往下`}><Icon name="arrowDown" size={18} /></button>
            <button className="press rounded-lg p-1.5 text-bad disabled:opacity-25" disabled={list.length <= 1}
              onClick={() => onChange(list.filter((x) => x !== c))} aria-label={`刪除 ${c}`}><Icon name="x" size={18} /></button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="新增分類" maxLength={12}
          onKeyDown={(e) => e.key === "Enter" && doAdd()} enterKeyHint="done"
          className="h-10 min-w-0 flex-1 rounded-xl bg-card-2 px-3 text-[16px] outline-none placeholder:text-muted" />
        <button className="press h-10 rounded-xl bg-card-3 px-4 text-[15px]" onClick={doAdd}>加入</button>
      </div>
    </div>
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

export function Settings({ header }: { header: React.ReactNode }) {
  const snap = useStore();
  const prefs = usePrefs();
  const meta = normalizeMeta(snap.data?.meta);
  const savedFixed = fixedCats(meta);
  const savedBudgets = meta.budgets ?? {};

  const [names, setNames] = useState(meta.people.map((p) => p.name));
  const [exp, setExp] = useState(meta.categories.expense);
  const [inc, setInc] = useState(meta.categories.income);
  const [fixed, setFixed] = useState(savedFixed);
  const [budgets, setBudgets] = useState<Record<string, string>>(
    Object.fromEntries(meta.categories.expense.map((c) => [c, savedBudgets[c] ? String(savedBudgets[c]) : ""])));

  // 對方改了設定、同步進來時，沒在編輯的區塊跟著更新
  const metaKey = JSON.stringify(snap.data?.meta ?? {});
  useEffect(() => {
    setNames(meta.people.map((p) => p.name));
    setExp(meta.categories.expense);
    setInc(meta.categories.income);
    setFixed(fixedCats(meta));
    setBudgets(Object.fromEntries(meta.categories.expense.map((c) => [c, meta.budgets?.[c] ? String(meta.budgets[c]) : ""])));
  }, [metaKey]);

  const budgetNums = Object.fromEntries(Object.entries(budgets)
    .map(([c, v]) => [c, Number(v)] as const).filter(([, v]) => Number.isFinite(v) && v > 0));
  const savedBudgetNums = Object.fromEntries(Object.entries(savedBudgets)
    .map(([c, v]) => [c, Number(v)] as const).filter(([, v]) => v > 0));
  const savedInList = Object.fromEntries(Object.entries(savedBudgetNums)
    .filter(([c]) => meta.categories.expense.includes(c)));

  return (
    <div className="flex h-full flex-col">
      <div className="safe-t shrink-0 px-3 pt-2 pb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-bold tracking-tight">設定</h1>
          <div className="ml-auto flex items-center">{header}</div>
        </div>
      </div>
      <div className="scroll min-h-0 flex-1 px-3 pb-28">
        <div className="flex flex-col gap-3">
          <Card title="這支手機">
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1 text-[13px] text-muted">我是（記帳時預設付款人）</div>
                <Segmented value={prefs.me ?? ""} onChange={(v) => setPrefs({ me: v })}
                  options={meta.people.map((p) => ({ value: p.id, label: (
                    <><span className="h-2 w-2 rounded-full" style={{ background: personColor(meta, p.id) }} />{p.name}</>
                  ) }))} />
              </div>
              <div>
                <div className="mb-1 text-[13px] text-muted">打開 app 時</div>
                <Segmented value={prefs.launch} onChange={(v) => setPrefs({ launch: v })}
                  options={[{ value: "entry", label: "直接記一筆" }, { value: "list", label: "看明細" }]} />
              </div>
              <div>
                <div className="mb-1 text-[13px] text-muted">外觀</div>
                <Segmented value={prefs.theme} onChange={(v) => setPrefs({ theme: v })}
                  options={[{ value: "system", label: "跟系統" }, { value: "light", label: "淺色" }, { value: "dark", label: "深色" }]} />
              </div>
            </div>
          </Card>

          <Card title="名字">
            <div className="flex flex-col gap-2">
              {meta.people.map((p, i) => (
                <label key={p.id} className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: personColor(meta, p.id) }} />
                  <input value={names[i] ?? ""} onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))}
                    className="h-10 min-w-0 flex-1 rounded-xl bg-card-2 px-3 text-[16px] outline-none" maxLength={20} />
                </label>
              ))}
            </div>
            <SaveBar dirty={!same(names, meta.people.map((p) => p.name))}
              onReset={() => setNames(meta.people.map((p) => p.name))}
              onSave={() => {
                if (names.some((n) => !n.trim())) {
                  toast("名字不能空白");
                  return;
                }
                store.saveMeta({ people: meta.people.map((p, i) => ({ ...p, name: names[i].trim() })) });
                toast("名字存好了");
              }} />
          </Card>

          <Card title="分類">
            <div className="flex flex-col gap-4">
              <CategoryEditor title="支出（記帳畫面照這個順序）" list={exp} onChange={setExp} />
              <CategoryEditor title="收入" list={inc} onChange={setInc} />
            </div>
            <div className="mt-2 text-[12px] text-muted">刪掉分類不會動到以前的帳，舊帳照樣顯示原本的分類。</div>
            <SaveBar dirty={!same(exp, meta.categories.expense) || !same(inc, meta.categories.income)}
              onReset={() => {
                setExp(meta.categories.expense);
                setInc(meta.categories.income);
              }}
              onSave={() => {
                store.saveMeta({ categories: { expense: exp, income: inc } });
                toast("分類存好了");
              }} />
          </Card>

          <Card title="固定支出">
            <div className="mb-2 text-[13px] text-muted">房租、水電這種每月躲不掉的；損益表會分開算。</div>
            <div className="flex flex-wrap gap-1.5">
              {meta.categories.expense.map((c) => {
                const on = fixed.includes(c);
                return (
                  <button key={c} aria-pressed={on}
                    onClick={() => setFixed((f) => (on ? f.filter((x) => x !== c) : [...f, c]))}
                    className={cx("press h-9 rounded-full px-3 text-[14px]", on ? "bg-primary font-medium text-on-primary" : "bg-card-2 text-ink-2")}>
                    {catEmoji(c)} {c}
                  </button>
                );
              })}
            </div>
            <SaveBar dirty={!same([...fixed].sort(), [...savedFixed].sort())} onReset={() => setFixed(savedFixed)}
              onSave={() => {
                store.saveMeta({ fixed_categories: fixed });
                toast("固定支出存好了");
              }} />
          </Card>

          <Card title="每月預算">
            <div className="mb-2 text-[13px] text-muted">空白或 0 = 不設；設了的會出現在總覽的預算卡。</div>
            <div className="divide-y divide-line rounded-xl bg-card-2">
              {meta.categories.expense.map((c) => (
                <label key={c} className="flex items-center gap-2 py-1 pr-2 pl-3">
                  <span className="text-[18px]">{catEmoji(c)}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px]">{c}</span>
                  <span className="text-muted">$</span>
                  <input inputMode="decimal" value={budgets[c] ?? ""} placeholder="—"
                    onChange={(e) => setBudgets((b) => ({ ...b, [c]: e.target.value.replace(/[^0-9.]/g, "") }))}
                    className="tnum h-9 w-24 rounded-lg bg-card px-2 text-right text-[16px] outline-none placeholder:text-muted" />
                </label>
              ))}
            </div>
            <SaveBar dirty={!sameMap(budgetNums, savedInList)}
              onReset={() => setBudgets(Object.fromEntries(meta.categories.expense.map((c) => [c, savedBudgets[c] ? String(savedBudgets[c]) : ""])))}
              onSave={() => {
                // 不在支出分類裡、但以前設過的預算保留（分類改名時不會悄悄不見）
                const keep = Object.fromEntries(Object.entries(savedBudgetNums).filter(([c]) => !meta.categories.expense.includes(c)));
                store.saveMeta({ budgets: { ...keep, ...budgetNums } });
                toast("預算存好了");
              }} />
          </Card>

          <Card title="資料">
            <div className="flex flex-col gap-2 text-[14px] text-ink-2">
              <div>共 {snap.data?.transactions.length ?? 0} 筆；上次同步 {snap.lastSync ? timeAgo(snap.lastSync) : "—"}
                {snap.pending > 0 && `；${snap.pending} 筆待上傳`}</div>
              <button className="press flex h-11 items-center justify-center gap-2 rounded-xl bg-card-2 text-[15px] text-ink"
                onClick={() => exportCsv(meta)}>
                <Icon name="download" size={18} />匯出全部（CSV，Excel 可開）
              </button>
              <div className="pt-1 text-[12px] text-muted">
                匯率：{snap.data?.rates_source === "live" ? "每天更新" : "暫用保底值"}
                （1 USD ≈ {(snap.data?.rates?.USD ?? 0).toFixed(4)} CAD）· 我們的記帳本 v2
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
