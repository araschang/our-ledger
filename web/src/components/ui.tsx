/** 共用的小元件：底部抽屜、提示列、分段按鈕、月份切換、分類圖示、金額。 */
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { monthTitle, money } from "../lib/format";
import { catEmoji, cx } from "../lib/ui";
import { Icon } from "./Icon";

// ---- 底部抽屜 -----------------------------------------------------------------

export function Sheet({ open, onClose, title, children, footer, tall = false, dismissible = true }: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tall?: boolean;
  dismissible?: boolean; // false：一定要在裡面選一個（例如第一次選「我是誰」）
}) {
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y: number; t: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    setDy(0);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const end = (y: number) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const v = (y - d.y) / Math.max(1, Date.now() - d.t);
    if (y - d.y > 110 || v > 0.6) onClose();
    else setDy(0);
  };
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <div className="anim-fade absolute inset-0 bg-black/35" onClick={onClose} />
      <div
        className={cx("anim-sheet relative mx-auto flex w-full max-w-xl flex-col rounded-t-[22px] bg-card",
          tall ? "h-[88dvh]" : "max-h-[88dvh]")}
        style={{ transform: dy ? `translateY(${dy}px)` : undefined,
          transition: drag.current ? "none" : "transform 0.2s ease" }}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none flex-col items-center px-4 pt-2 pb-1"
          onPointerDown={(e) => {
            drag.current = { y: e.clientY, t: Date.now() };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => drag.current && setDy(Math.max(0, e.clientY - drag.current.y))}
          onPointerUp={(e) => end(e.clientY)}
          onPointerCancel={() => {
            drag.current = null;
            setDy(0);
          }}
        >
          <div className="h-1.5 w-10 rounded-full bg-card-3" />
          {title && (
            <div className="flex w-full items-center justify-between pt-2 pb-1">
              <div className="min-w-0 truncate text-[17px] font-semibold">{title}</div>
              {dismissible && (
                <button className="press -mr-2 rounded-full p-2 text-muted" onClick={onClose} aria-label="關閉">
                  <Icon name="x" size={20} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="scroll min-h-0 flex-1 px-4 pb-4">{children}</div>
        {footer && <div className="safe-b shrink-0 border-t border-line px-4 pt-3 pb-3">{footer}</div>}
        {!footer && <div className="safe-b shrink-0" />}
      </div>
    </div>,
    document.body,
  );
}

// ---- 提示列（可附「復原」）------------------------------------------------------

interface ToastItem {
  id: number;
  msg: string;
  action?: { label: string; fn: () => void };
  tone?: "default" | "error";
}

let toasts: ToastItem[] = [];
const toastListeners = new Set<() => void>();
let toastSeq = 0;

export function toast(msg: string, opts: { action?: ToastItem["action"]; tone?: ToastItem["tone"];
  ms?: number } = {}) {
  const item: ToastItem = { id: ++toastSeq, msg, action: opts.action, tone: opts.tone };
  toasts = [...toasts.slice(-1), item];
  toastListeners.forEach((f) => f());
  setTimeout(() => dismissToast(item.id), opts.ms ?? (opts.action ? 5000 : 2600));
}

function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  toastListeners.forEach((f) => f());
}

export function ToastHost({ bottom }: { bottom: number }) {
  const items = useSyncExternalStore(
    (fn) => {
      toastListeners.add(fn);
      return () => toastListeners.delete(fn);
    },
    () => toasts,
  );
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ bottom: `calc(${bottom}px + env(safe-area-inset-bottom))` }}
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={cx("anim-toast pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-[15px] shadow-lg",
            t.tone === "error" ? "bg-bad text-white" : "bg-[var(--toast)] text-white")}
        >
          <span className="min-w-0 flex-1">{t.msg}</span>
          {t.action && (
            <button
              className="press shrink-0 rounded-lg px-2 py-1 font-semibold text-[#8fc0ff]"
              onClick={() => {
                t.action!.fn();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ---- 分段按鈕 -----------------------------------------------------------------

export function Segmented<T extends string>({ options, value, onChange, size = "md", className = "",
  ariaLabel }: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel}
      className={cx("flex rounded-xl bg-card-2 p-[3px]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx("flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[9px] whitespace-nowrap transition-colors",
            size === "sm" ? "h-8 px-2 text-[13px]" : "h-9 px-2.5 text-[15px]",
            o.value === value ? "bg-[var(--thumb)] font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
              : "text-ink-2")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- 月份切換 -----------------------------------------------------------------

export function MonthNav({ month, min, max, onChange, right }: {
  month: string;
  min: string;
  max: string;
  onChange: (m: string) => void;
  right?: ReactNode;
}) {
  const [picking, setPicking] = useState(false);
  const months: string[] = [];
  for (let m = max; m >= min; ) {
    months.push(m);
    const [y, mo] = m.split("-").map(Number);
    m = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
    if (months.length > 240) break;
  }
  const i = months.indexOf(month);
  return (
    <div className="flex items-center gap-1">
      <button className="press rounded-full p-2 text-ink-2 disabled:opacity-25" aria-label="上個月"
        disabled={i < 0 || i >= months.length - 1} onClick={() => onChange(months[i + 1])}>
        <Icon name="left" />
      </button>
      <button className="press min-w-0 px-1 text-[19px] font-bold tracking-tight" onClick={() => setPicking(true)}>
        {monthTitle(month)}
      </button>
      <button className="press rounded-full p-2 text-ink-2 disabled:opacity-25" aria-label="下個月"
        disabled={i <= 0} onClick={() => onChange(months[i - 1])}>
        <Icon name="right" />
      </button>
      <div className="ml-auto flex items-center gap-1">{right}</div>
      <Sheet open={picking} onClose={() => setPicking(false)} title="選月份">
        <div className="grid grid-cols-3 gap-2 pb-2">
          {months.map((m) => (
            <button key={m}
              className={cx("press rounded-xl py-3 text-[15px]", m === month ? "bg-primary font-semibold text-on-primary" : "bg-card-2")}
              onClick={() => {
                onChange(m);
                setPicking(false);
              }}>
              {monthTitle(m)}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

// ---- 小東西 -------------------------------------------------------------------

export function CatBubble({ category, size = 40 }: { category: string; size?: number }) {
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full bg-card-2"
      style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden="true">
      {catEmoji(category)}
    </div>
  );
}

export function PersonDot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}

export function Money({ value, cents = true, sign = false, className = "" }: {
  value: number;
  cents?: boolean;
  sign?: boolean;
  className?: string;
}) {
  return <span className={className}>{money(value, { cents, sign })}</span>;
}

export function Card({ children, className = "", title, right }: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className={cx("card p-4", className)}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 text-4xl">🧾</div>
      <div className="text-[17px] font-semibold">{title}</div>
      {hint && <div className="mt-1 text-[14px] text-muted">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** 量容器寬度（圖表用實際像素畫，字才不會跟著縮放）。 */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
