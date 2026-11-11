/** 明細的一列：點一下修改、往左滑出「刪除」。 */
import { useEffect, useRef, useState } from "react";
import { money } from "../lib/format";
import type { Meta, Txn } from "../lib/types";
import { cx, nameOf, personColor, SPLIT_LABEL } from "../lib/ui";
import { Icon } from "./Icon";
import { CatBubble, PersonDot } from "./ui";

const REVEAL = 84;
let openRow: string | null = null;
const closers = new Map<string, () => void>();

function closeOthers(id: string) {
  if (openRow && openRow !== id) closers.get(openRow)?.();
  openRow = id;
}

export function TxnRow({ txn, meta, amount, onTap, onDelete, pending = false, flash = false,
  showDate }: {
  txn: Txn;
  meta: Meta;
  amount?: number; // 換算／分攤後要顯示的金額（預設 txn.amount）
  onTap: () => void;
  onDelete?: () => void;
  pending?: boolean;
  flash?: boolean;
  showDate?: string;
}) {
  const [dx, setDx] = useState(0);
  const g = useRef<{ x: number; y: number; dx0: number; w: number; lock: "h" | "v" | null } | null>(null);
  const moved = useRef(false);
  const fired = useRef(false);
  const [rowW, setRowW] = useState(360);
  const full = rowW * 0.45; // 滑過這麼多直接刪（跟 iOS 郵件一樣），有「復原」可以救回
  const doDelete = () => {
    if (fired.current || !onDelete) return;
    fired.current = true;
    setDx(0);
    onDelete();
  };

  useEffect(() => {
    closers.set(txn.id, () => setDx(0));
    return () => {
      closers.delete(txn.id);
    };
  }, [txn.id]);

  const isIncome = txn.type === "income";
  const isSettle = txn.type === "settle";
  const value = amount ?? txn.amount;
  const title = isSettle
    ? `${nameOf(meta, txn.person)} → ${nameOf(meta, meta.people.find((p) => p.id !== txn.person)?.id ?? "")}`
    : txn.item || txn.category;
  const sub = [
    isSettle ? "結清" : txn.item ? txn.category : null,
    isIncome ? "收入" : isSettle ? null : SPLIT_LABEL[txn.split] ?? txn.split,
    showDate,
  ].filter(Boolean).join(" · ");

  return (
    <div className="relative overflow-hidden">
      {onDelete && (
        <button
          className="absolute inset-y-0 right-0 flex items-center justify-center gap-1.5 bg-bad text-[14px] font-semibold text-white"
          style={{ width: Math.max(REVEAL, -dx), visibility: dx < 0 ? "visible" : "hidden" }}
          // 放開手指就刪（不等 click：剛滑完緊接著點，有些瀏覽器會把那一下吃掉）
          onPointerUp={doDelete}
          onClick={doDelete}
          aria-label="刪除這筆"
          tabIndex={dx < 0 ? 0 : -1}
        >
          <Icon name="trash" size={20} />
          {-dx > full && <span>放開就刪</span>}
        </button>
      )}
      <div
        role="button"
        tabIndex={0}
        className={cx("relative flex items-center gap-3 bg-card px-4 py-2.5 select-none", flash && "anim-flash")}
        style={{ transform: `translateX(${dx}px)`, transition: g.current ? "none" : "transform 0.22s ease",
          touchAction: "pan-y" }}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onTap()}
        onPointerDown={(e) => {
          const w = (e.currentTarget as HTMLElement).getBoundingClientRect().width;
          g.current = { x: e.clientX, y: e.clientY, dx0: dx, w, lock: null };
          setRowW(w);
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const s = g.current;
          if (!s || !onDelete) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (!s.lock) {
            if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) {
              s.lock = "h";
              closeOthers(txn.id);
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            } else if (Math.abs(my) > 8) s.lock = "v";
          }
          if (s.lock === "h") {
            moved.current = true;
            setDx(Math.min(0, Math.max(-s.w * 0.8, s.dx0 + mx)));
          }
        }}
        onPointerUp={() => {
          const s = g.current;
          g.current = null;
          if (s?.lock === "h") {
            if (-dx > full) doDelete();
            else setDx((d) => (d < -REVEAL / 2 ? -REVEAL : 0));
            return;
          }
          if (s?.lock === "v") return;
          if (dx !== 0) {
            setDx(0);
            return;
          }
          if (!moved.current) onTap();
        }}
        onPointerCancel={() => {
          g.current = null;
          setDx((d) => (d < -REVEAL / 2 ? -REVEAL : 0));
        }}
      >
        <CatBubble category={isSettle ? "結清" : txn.category} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-medium">{title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
            <PersonDot color={personColor(meta, txn.person)} />
            <span className="truncate">{nameOf(meta, txn.person)}{sub ? ` · ${sub}` : ""}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <div className={cx("tnum text-[16px] font-semibold", isIncome && "text-good", isSettle && "text-muted")}>
            {isIncome ? "+" : ""}{money(value)}
          </div>
          {pending && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
              <Icon name="clock" size={11} />待上傳
            </div>
          )}
          {!pending && amount === undefined && txn.split === "half" && txn.type === "expense" && (
            <div className="tnum mt-0.5 text-[12px] text-muted">各 {money(value / 2)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
