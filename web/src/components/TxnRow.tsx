/** 明細的一列（iOS 清單樣式）：點一下修改、往左滑出「刪除」、整個滑過去直接刪。 */
import { useEffect, useRef, useState } from "react";
import { money } from "../lib/format";
import type { Meta, Txn } from "../lib/types";
import { cx, nameOf, personColor, SPLIT_LABEL } from "../lib/ui";
import { Icon } from "./Icon";
import { CatIcon, Dot } from "./ui";

const REVEAL = 88;
let openRow: string | null = null;
const closers = new Map<string, () => void>();

/** 吞掉接下來那一下 click：放開手指就刪掉這一列後，瀏覽器補送的 click 會落到下面那一列，把它打開。 */
function swallowNextClick(ms = 500) {
  const kill = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    document.removeEventListener("click", kill, true);
  };
  document.addEventListener("click", kill, true);
  setTimeout(() => document.removeEventListener("click", kill, true), ms);
}

function closeOthers(id: string) {
  if (openRow && openRow !== id) closers.get(openRow)?.();
  openRow = id;
}

export const ROW_INSET = 16 + 36 + 12; // 分隔線從文字開始（圖示 36px）

export function TxnRow({ txn, meta, amount, onTap, onDelete, pending = false, flash = false, showDate }: {
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
  const suppressClick = useRef(false); // 這次是滑動、或是點一下把滑開的列關起來 → 不算「點了要修改」
  const fired = useRef(false);
  const btnDown = useRef<{ x: number; y: number } | null>(null);
  const [rowW, setRowW] = useState(360);
  const full = rowW * 0.5; // 滑過一半直接刪（跟 iOS 郵件一樣），有「復原」可以救回
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
  const other = meta.people.find((p) => p.id !== txn.person)?.id ?? "";
  const title = isSettle ? `${nameOf(meta, txn.person)} 付給 ${nameOf(meta, other)}` : txn.item || txn.category;
  const sub = [
    nameOf(meta, txn.person),
    isSettle ? "結清" : txn.item ? txn.category : null,
    isIncome ? "收入" : isSettle ? null : SPLIT_LABEL[txn.split] ?? txn.split,
    showDate,
  ].filter(Boolean).join(" · ");

  return (
    <div className="relative overflow-hidden">
      {onDelete && (
        <button
          className="absolute inset-y-0 right-0 flex items-center justify-center bg-red text-[17px] text-white"
          style={{ width: Math.max(REVEAL, -dx), visibility: dx < 0 ? "visible" : "hidden" }}
          // 點一下就刪（放開手指時判斷，不等 click：剛滑完緊接著點，有些瀏覽器會把那一下吃掉）；手指有移動就不算
          onPointerDown={(e) => {
            btnDown.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const d = btnDown.current;
            btnDown.current = null;
            if (d && Math.abs(e.clientX - d.x) < 10 && Math.abs(e.clientY - d.y) < 10) {
              swallowNextClick();
              doDelete();
            }
          }}
          onPointerCancel={() => {
            btnDown.current = null;
          }}
          onClick={(e) => e.detail === 0 && doDelete() /* 鍵盤 */}
          aria-label="刪除這筆"
          tabIndex={dx < 0 ? 0 : -1}
        >
          <span className="flex items-center gap-1.5">
            {-dx > full && <Icon name="trash" size={19} />}
            刪除
          </span>
        </button>
      )}
      <div
        role="button"
        tabIndex={0}
        className={cx("relative flex items-center gap-3 bg-card py-[9px] pr-4 pl-4 select-none", flash && "anim-flash")}
        style={{ transform: `translateX(${dx}px)`, transition: g.current ? "none" : "transform 0.25s cubic-bezier(.2,.8,.2,1)",
          touchAction: "pan-y" }}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onTap()}
        // 修改畫面在 click 才打開（不在放開手指時）：不然瀏覽器補送的那一下 click 會落在剛打開的卡片背景上，把它關掉
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          onTap();
        }}
        onPointerDown={(e) => {
          const w = (e.currentTarget as HTMLElement).getBoundingClientRect().width;
          g.current = { x: e.clientX, y: e.clientY, dx0: dx, w, lock: null };
          setRowW(w);
          moved.current = false;
          suppressClick.current = false;
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
            setDx(Math.min(0, Math.max(-s.w * 0.85, s.dx0 + mx)));
          }
        }}
        onPointerUp={() => {
          const s = g.current;
          g.current = null;
          if (s?.lock === "h") {
            suppressClick.current = true;
            if (-dx > full) doDelete();
            else setDx((d) => (d < -REVEAL / 2 ? -REVEAL : 0));
            return;
          }
          if (s?.lock === "v" || moved.current) {
            suppressClick.current = true;
            return;
          }
          if (dx !== 0) {
            suppressClick.current = true;
            setDx(0);
          }
        }}
        onPointerCancel={() => {
          g.current = null;
          setDx((d) => (d < -REVEAL / 2 ? -REVEAL : 0));
        }}
      >
        <CatIcon category={isSettle ? "結清" : txn.category} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] leading-[22px]">{title}</div>
          <div className="mt-px flex items-center gap-1.5 text-[13px] leading-[18px] text-label-2">
            <Dot color={personColor(meta, txn.person)} size={7} />
            <span className="truncate">{sub}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <div className={cx("rounded-num tnum text-[17px] leading-[22px] font-medium", isIncome && "text-money-in", isSettle && "text-label-2")}>
            {isIncome ? "+" : ""}{money(value)}
          </div>
          {pending ? (
            <div className="mt-px flex items-center gap-1 text-[12px] text-orange">
              <Icon name="clock" size={11} strokeWidth={2.4} />待上傳
            </div>
          ) : amount === undefined && txn.split === "half" && txn.type === "expense" ? (
            <div className="rounded-num tnum mt-px text-[12px] text-label-2">各 {money(value / 2)}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
