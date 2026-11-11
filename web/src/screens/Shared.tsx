/** 幾個畫面共用的抽屜：分類明細、結清、同步狀態。 */
import { useState } from "react";
import { Icon } from "../components/Icon";
import { TxnRow } from "../components/TxnRow";
import { Sheet, toast } from "../components/ui";
import { normalizeMeta, type Settlement } from "../lib/analytics";
import { money, monthTitle, timeAgo, todayLocal } from "../lib/format";
import { store, useStore } from "../lib/store";
import type { Row, Txn } from "../lib/types";
import { catEmoji, cx, nameOf } from "../lib/ui";

export function CategoryDetailSheet({ open, onClose, category, month, rows, who, type, onEdit }: {
  open: boolean;
  onClose: () => void;
  category: string | null;
  month: string | null;
  rows: Row[]; // 已經是要顯示的視角（個人視角時金額是自己負擔的部分）
  who?: string | null;
  type: "expense" | "income";
  onEdit: (t: Txn) => void;
}) {
  const snap = useStore();
  const meta = normalizeMeta(snap.data?.meta);
  const sub = rows
    .filter((r) => r.category === category && r.type === type && (!month || r.month === month))
    .sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  const total = sub.reduce((s, r) => s + r.amount, 0);
  return (
    <Sheet open={open} onClose={onClose} tall={sub.length > 6}
      title={category ? `${catEmoji(category)} ${category}　${month ? monthTitle(month) : "全部期間"}` : ""}>
      <div className="tnum mb-2 flex gap-4 text-[14px] text-ink-2">
        <span>{sub.length} 筆</span>
        <span>合計 <b className="text-ink">{money(total)}</b></span>
        {sub.length > 0 && <span>平均 {money(total / sub.length)}</span>}
      </div>
      {who && (
        <div className="mb-2 rounded-xl bg-card-2 px-3 py-2 text-[13px] text-ink-2">
          只算 {nameOf(meta, who)} 自己負擔的部分（平分的算一半、別人幫忙墊的算全額）
        </div>
      )}
      <div className="-mx-4 divide-y divide-line">
        {sub.map((r) => (
          <TxnRow key={r.id} txn={r.txn} meta={meta} amount={r.amount} showDate={`${Number(r.date.slice(5, 7))}/${Number(r.date.slice(8, 10))}`}
            onTap={() => {
              onClose();
              onEdit(r.txn);
            }} />
        ))}
      </div>
      {sub.length === 0 && <div className="py-8 text-center text-muted">這個範圍沒有記錄</div>}
    </Sheet>
  );
}

export function SettleSheet({ open, onClose, s }: { open: boolean; onClose: () => void; s: Settlement }) {
  const snap = useStore();
  const meta = normalizeMeta(snap.data?.meta);
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  if (!s.debtor || !s.creditor) return null;
  const value = amt === "" ? s.owed : Number(amt);
  const ok = Number.isFinite(value) && value > 0;
  return (
    <Sheet open={open} onClose={onClose} title="結清"
      footer={
        <button disabled={!ok}
          className="press h-12 w-full rounded-xl bg-primary text-[16px] font-semibold text-on-primary disabled:opacity-40"
          onClick={() => {
            const id = store.add({ date: todayLocal(), person: s.debtor!, type: "settle", category: "結清",
              item: "結清", amount: Math.round(value * 100) / 100, note: note.trim(), currency: "CAD", split: "own" });
            toast(`記下結清 ${money(value)}`, { action: { label: "復原", fn: () => store.remove(id) } });
            setAmt("");
            setNote("");
            onClose();
          }}>
          記下：{nameOf(meta, s.debtor)} 付給 {nameOf(meta, s.creditor)} {ok ? money(value) : ""}
        </button>
      }>
      <div className="text-[15px] leading-relaxed text-ink-2">
        {nameOf(meta, s.debtor)} 把錢轉給 {nameOf(meta, s.creditor)} 之後，在這裡記一筆，
        分帳就會歸零（或扣掉轉的金額）。這筆不算任何人的支出。
      </div>
      <label className="mt-4 block text-[13px] text-muted">金額（預設全部結清）</label>
      <div className="mt-1 flex h-12 items-center gap-1 rounded-xl bg-card-2 px-3">
        <span className="text-muted">$</span>
        <input inputMode="decimal" value={amt} placeholder={s.owed.toFixed(2)}
          onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))}
          className="tnum min-w-0 flex-1 bg-transparent text-[18px] font-semibold outline-none placeholder:text-ink" />
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註（例：e-Transfer）"
        className="mt-2 h-11 w-full rounded-xl bg-card-2 px-3 text-[16px] outline-none placeholder:text-muted" />
    </Sheet>
  );
}

/** 標題列右上角的小狀態：待上傳幾筆、離線、同步中。點了立刻同步。 */
export function SyncBadge() {
  const snap = useStore();
  const [open, setOpen] = useState(false);
  const state = snap.pending > 0 ? "pending" : snap.offline ? "offline" : "ok";
  return (
    <>
      <button aria-label="同步狀態" onClick={() => setOpen(true)}
        className={cx("press flex h-8 items-center gap-1 rounded-full px-2 text-[12px]",
          state === "pending" ? "bg-[color-mix(in_oklab,var(--warn)_25%,var(--card))] text-ink"
            : state === "offline" ? "bg-card-2 text-ink-2" : "text-muted")}>
        {state === "pending" && <><Icon name="clock" size={14} />{snap.pending}</>}
        {state === "offline" && <><Icon name="cloudOff" size={14} />離線</>}
        {state === "ok" && <Icon name="refresh" size={17} className={snap.syncing ? "animate-spin" : ""} />}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="同步">
        <div className="flex flex-col gap-2 pb-2 text-[15px] text-ink-2">
          <div>上次跟伺服器對過：{snap.lastSync ? timeAgo(snap.lastSync) : "還沒有"}</div>
          <div>待上傳：{snap.pending} 筆{snap.pending > 0 && "（連上網會自動送出）"}</div>
          {snap.offline && <div>現在連不上記帳本：手機要開著 Tailscale。</div>}
          <button className="press mt-2 h-11 rounded-xl bg-primary font-semibold text-on-primary"
            onClick={() => {
              void store.flush();
              void store.refresh();
              setOpen(false);
            }}>
            立刻同步
          </button>
        </div>
      </Sheet>
    </>
  );
}
