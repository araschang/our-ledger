/** 幾個畫面共用的卡片：分類明細、結清（學 Apple Cash）、同步狀態。 */
import { useState } from "react";
import { Icon } from "../components/Icon";
import { ROW_INSET, TxnRow } from "../components/TxnRow";
import { BigButton, CatIcon, Dot, NavButton, Sheet, toast } from "../components/ui";
import { normalizeMeta, type Settlement } from "../lib/analytics";
import { money, monthTitle, timeAgo, todayLocal } from "../lib/format";
import { store, useStore } from "../lib/store";
import type { Row, Txn } from "../lib/types";
import { nameOf, personColor } from "../lib/ui";

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
    <Sheet open={open} onClose={onClose} title={category ?? ""}>
      {category && (
        <div className="flex flex-col items-center pt-1 pb-4">
          <CatIcon category={category} size={52} />
          <div className="rounded-num mt-2 text-[34px] leading-[40px] font-bold">{money(total)}</div>
          <div className="text-[15px] text-label-2">
            {month ? monthTitle(month) : "全部期間"} · {sub.length} 筆{sub.length > 0 && ` · 平均 ${money(total / sub.length)}`}
          </div>
          {who && <div className="mt-1 text-[13px] text-label-2">只算 {nameOf(meta, who)} 自己負擔的部分</div>}
        </div>
      )}
      <div className="ios-rows overflow-hidden rounded-[12px] bg-card-2" style={{ "--sep-inset": `${ROW_INSET}px` } as React.CSSProperties}>
        {sub.map((r) => (
          <TxnRow key={r.id} txn={r.txn} meta={meta} amount={r.amount}
            showDate={`${Number(r.date.slice(5, 7))}/${Number(r.date.slice(8, 10))}`}
            onTap={() => {
              onClose();
              onEdit(r.txn);
            }} />
        ))}
      </div>
      {sub.length === 0 && <div className="py-8 text-center text-label-2">這個範圍沒有記錄</div>}
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
        <BigButton disabled={!ok} onClick={() => {
          const id = store.add({ date: todayLocal(), person: s.debtor!, type: "settle", category: "結清",
            item: "結清", amount: Math.round(value * 100) / 100, note: note.trim(), currency: "CAD", split: "own" });
          toast(`已記下結清　${money(value)}`, { action: { label: "復原", fn: () => store.remove(id) } });
          setAmt("");
          setNote("");
          onClose();
        }}>
          記下結清
        </BigButton>
      }>
      <div className="flex flex-col items-center pt-2">
        <div className="flex items-center gap-2 text-[15px] text-label-2">
          <Dot color={personColor(meta, s.debtor)} />{nameOf(meta, s.debtor)}
          <Icon name="right" size={16} strokeWidth={2.4} />
          <Dot color={personColor(meta, s.creditor)} />{nameOf(meta, s.creditor)}
        </div>
        <div className="rounded-num mt-2 flex items-baseline font-semibold">
          <span className="mr-1 text-[28px] text-label-3">$</span>
          <input inputMode="decimal" value={amt} placeholder={s.owed.toFixed(2)} aria-label="結清金額"
            onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))}
            style={{ width: `${Math.max(2, (amt || s.owed.toFixed(2)).length) + 0.3}ch` }}
            className="rounded-num tnum bg-transparent text-left text-[48px] leading-[56px] outline-none placeholder:text-label" />
        </div>
        <div className="mt-1 text-center text-[13px] leading-[18px] text-label-2">
          {nameOf(meta, s.debtor)} 轉帳給 {nameOf(meta, s.creditor)} 之後記一筆，分帳就會扣掉。<br />預設全部結清；這筆不算任何人的支出。
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註（例：e-Transfer）" maxLength={900}
          className="mt-4 h-11 w-full rounded-[10px] bg-fill-3 px-3 outline-none" />
      </div>
    </Sheet>
  );
}

/** 頂欄右上角的同步狀態：平常是一個小圖示；有待上傳顯示數字、離線顯示雲。點了看詳情、立刻同步。 */
export function SyncButton() {
  const snap = useStore();
  const [open, setOpen] = useState(false);
  const state = snap.pending > 0 ? "pending" : snap.offline ? "offline" : "ok";
  return (
    <>
      <NavButton label="同步狀態" onClick={() => setOpen(true)}
        icon={state === "offline" ? "cloudOff" : state === "pending" ? "clock" : "refresh"}
        badge={state === "pending" ? (
          <span className="absolute top-1.5 right-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-orange px-1 text-[11px] font-semibold text-white">
            {snap.pending}
          </span>
        ) : undefined} />
      <Sheet open={open} onClose={() => setOpen(false)} title="同步">
        <div className="ios-rows overflow-hidden rounded-[12px] bg-card-2">
          <div className="flex h-11 items-center px-4"><span className="flex-1">上次跟伺服器對過</span><span className="text-label-2">{snap.lastSync ? timeAgo(snap.lastSync) : "還沒有"}</span></div>
          <div className="flex h-11 items-center px-4"><span className="flex-1">待上傳</span><span className="text-label-2">{snap.pending} 筆</span></div>
          <div className="flex h-11 items-center px-4"><span className="flex-1">連線</span><span className="text-label-2">{snap.offline ? "連不上（要開 Tailscale）" : "正常"}</span></div>
        </div>
        <div className="px-4 pt-2 text-[13px] text-label-2">記帳會先存在手機上，連上網自動送出，不會重複。</div>
        <BigButton className="mt-4" onClick={() => {
          void store.flush();
          void store.refresh();
          setOpen(false);
        }}>立刻同步</BigButton>
      </Sheet>
    </>
  );
}
