/** 幾個畫面共用的卡片：分類明細、結清、同步狀態。 */
import { useState } from "react";
import { Icon } from "../components/Icon";
import { ROW_INSET, TxnRow } from "../components/TxnRow";
import { Avatar, BigButton, CatIcon, NavButton, Sheet, toast, useWide } from "../components/ui";
import { normalizeMeta, type Settlement } from "../lib/analytics";
import { money, monthTitle, timeAgo, todayLocal } from "../lib/format";
import { store, useStore } from "../lib/store";
import type { Row, Txn } from "../lib/types";
import { catStyle, cx, nameOf } from "../lib/ui";

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
  const wide = useWide();
  const meta = normalizeMeta(snap.data?.meta);
  const sub = rows
    .filter((r) => r.category === category && r.type === type && (!month || r.month === month))
    .sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  const total = sub.reduce((s, r) => s + r.amount, 0);
  return (
    <Sheet open={open} onClose={onClose} title={category ?? ""} wideWidth={720}>
      {category && (
        <div className="mb-4 flex flex-col items-center rounded-[26px] px-4 pt-5 pb-5" style={{ background: catStyle(category).bg }}>
          <CatIcon category={category} size={52} />
          <div className="rounded-num mt-2 text-[36px] leading-[42px] font-black">{money(total)}</div>
          <div className="text-[15px] text-label-2">
            {month ? monthTitle(month) : "全部期間"} · {sub.length} 筆{sub.length > 0 && ` · 平均 ${money(total / sub.length)}`}
          </div>
          {who && <div className="mt-1 text-[13px] text-label-2">只算 {nameOf(meta, who)} 自己負擔的部分</div>}
        </div>
      )}
      <div className="ios-rows overflow-hidden rounded-[22px] bg-card-2" style={{ "--sep-inset": `${ROW_INSET}px` } as React.CSSProperties}>
        {sub.map((r) => (
          <TxnRow key={r.id} txn={r.txn} meta={meta} amount={r.amount} tone="inset" wide={wide}
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
    <Sheet open={open} onClose={onClose} title="記一筆結清" wideWidth={460}
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
        <div className="flex items-center gap-2 text-[15px] font-bold text-label-2">
          <Avatar meta={meta} pid={s.debtor} size={26} />{nameOf(meta, s.debtor)}
          <Icon name="right" size={16} strokeWidth={2.6} />
          <Avatar meta={meta} pid={s.creditor} size={26} />{nameOf(meta, s.creditor)}
        </div>
        <div className="rounded-num mt-2 flex items-baseline font-black">
          <span className="mr-1 text-[28px] text-label-3">$</span>
          <input inputMode="decimal" value={amt} placeholder={s.owed.toFixed(2)} aria-label="結清金額"
            onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))}
            style={{ width: `${Math.max(2, (amt || s.owed.toFixed(2)).length) + 0.3}ch` }}
            className="rounded-num tnum bg-transparent text-left text-[48px] leading-[56px] font-black outline-none placeholder:text-label" />
        </div>
        <div className="mt-1 text-center text-[13px] leading-[18px] text-label-2">
          轉帳之後記一筆，分帳就會扣掉。預設全部結清；這筆不算任何人的支出。
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註（例：e-Transfer）" maxLength={900}
          className="mt-4 h-12 w-full rounded-[16px] bg-fill-3 px-4 outline-none" />
      </div>
    </Sheet>
  );
}

/** 同步狀態。手機：頂欄右上角的小圖示；電腦：側欄最下面一列。點了看詳情、立刻同步。 */
export function SyncButton({ variant = "icon" }: { variant?: "icon" | "row" }) {
  const snap = useStore();
  const [open, setOpen] = useState(false);
  const state = snap.pending > 0 ? "pending" : snap.offline ? "offline" : "ok";
  return (
    <>
      {variant === "row" ? (
        <button onClick={() => setOpen(true)}
          className="press flex h-11 items-center gap-2.5 rounded-full px-3 text-left text-[14px] font-semibold text-label-2 hover:bg-fill-4">
          <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", state === "ok" ? "bg-green" : state === "pending" ? "bg-orange" : "bg-red")} />
          {state === "ok" ? `已同步・${snap.lastSync ? timeAgo(snap.lastSync) : "剛剛"}`
            : state === "pending" ? `${snap.pending} 筆待上傳` : "連不上伺服器"}
        </button>
      ) : (
        <NavButton label="同步狀態" onClick={() => setOpen(true)}
          icon={state === "offline" ? "cloudOff" : state === "pending" ? "clock" : "refresh"}
          badge={state === "pending" ? (
            <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-orange px-1 text-[11px] font-black text-white">
              {snap.pending}
            </span>
          ) : undefined} />
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="同步" wideWidth={440}>
        <div className="ios-rows overflow-hidden rounded-[20px] bg-card-2">
          <div className="flex h-12 items-center px-4"><span className="flex-1">上次跟伺服器對過</span><span className="text-label-2">{snap.lastSync ? timeAgo(snap.lastSync) : "還沒有"}</span></div>
          <div className="flex h-12 items-center px-4"><span className="flex-1">待上傳</span><span className="text-label-2">{snap.pending} 筆</span></div>
          <div className="flex h-12 items-center px-4"><span className="flex-1">連線</span><span className="text-label-2">{snap.offline ? "連不上（要開 Tailscale）" : "正常"}</span></div>
        </div>
        <div className="px-2 pt-2 text-[13px] text-label-2">記帳會先存在手機上，連上網自動送出，不會重複。</div>
        <BigButton className="mt-4" onClick={() => {
          void store.flush();
          void store.refresh();
          setOpen(false);
        }}>立刻同步</BigButton>
      </Sheet>
    </>
  );
}
