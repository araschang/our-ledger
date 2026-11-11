/** iOS 風格的共用元件：大標題頁面、分組清單、頁面卡片、操作選單、頂部提示、分段控制、分類圖示。 */
import { type CSSProperties, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { monthTitle } from "../lib/format";
import { catStyle, cx } from "../lib/ui";
import { Icon } from "./Icon";

// ---- 大標題頁面：往下捲，標題縮進毛玻璃頂欄 ------------------------------------

export function Screen({ title, trailing, header, children }: {
  title: string;
  trailing?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  return (
    <div className="relative h-full">
      <header className={cx("safe-t absolute inset-x-0 top-0 z-20 transition-[background-color,box-shadow] duration-200",
        scrolled ? "material hairline-b" : "bg-transparent")}>
        <div className="relative flex h-11 items-center justify-end px-2">
          <div className={cx("pointer-events-none absolute inset-x-24 truncate text-center text-[17px] font-semibold transition-opacity duration-200",
            scrolled ? "opacity-100" : "opacity-0")}>{title}</div>
          <div className="flex items-center text-tint">{trailing}</div>
        </div>
      </header>
      <div className="scroll h-full" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 34)}>
        <div className="safe-t" />
        <div className="h-11" />
        <h1 className="px-4 pb-2 text-[34px] leading-[41px] font-bold tracking-[0.01em]">{title}</h1>
        {header}
        <div className="pb-32">{children}</div>
      </div>
    </div>
  );
}

export function NavButton({ icon, label, onClick, badge }: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  onClick: () => void;
  badge?: ReactNode;
}) {
  return (
    <button className="press relative flex h-11 min-w-11 items-center justify-center px-2 text-tint" onClick={onClick} aria-label={label}>
      <Icon name={icon} size={22} />
      {badge}
    </button>
  );
}

// ---- 分組清單（inset grouped）-----------------------------------------------------

export function Group({ header, headerRight, footer, children, className = "", inset = 16, top = 28 }: {
  header?: ReactNode;
  headerRight?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  inset?: number; // 分隔線從哪裡開始畫（有圖示的列要從文字開始）
  top?: number; // 跟上一組的距離（px）
}) {
  return (
    <section className={cx("mx-4", className)} style={{ marginTop: top }}>
      {(header || headerRight) && (
        <div className="flex items-baseline justify-between gap-3 px-4 pb-[7px] text-[13px] leading-[18px] text-label-2">
          <span>{header}</span>
          {headerRight && <span className="tnum">{headerRight}</span>}
        </div>
      )}
      <div className="ios-rows overflow-hidden rounded-[12px] bg-card" style={{ "--sep-inset": `${inset}px` } as CSSProperties}>
        {children}
      </div>
      {footer && <div className="px-4 pt-[7px] text-[13px] leading-[18px] text-label-2">{footer}</div>}
    </section>
  );
}

export function Row({ icon, title, subtitle, value, chevron, onClick, children, tone, className = "" }: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  children?: ReactNode;
  tone?: "tint" | "red";
  className?: string;
}) {
  const body = (
    <>
      {icon}
      <div className="min-w-0 flex-1">
        <div className={cx("truncate text-[17px] leading-[22px]", tone === "tint" && "text-tint", tone === "red" && "text-red")}>{title}</div>
        {subtitle && <div className="truncate text-[15px] leading-[20px] text-label-2">{subtitle}</div>}
      </div>
      {value != null && <div className="tnum shrink-0 text-[17px] text-label-2">{value}</div>}
      {children}
      {chevron && <Icon name="right" size={15} strokeWidth={2.6} className="shrink-0 text-label-3" />}
    </>
  );
  const cls = cx("flex min-h-[44px] w-full items-center gap-3 px-4 py-[11px] text-left", className);
  return onClick ? (
    <button className={cx(cls, "row-press")} onClick={onClick}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ---- 分類圖示（彩色圓角方塊） -------------------------------------------------------

export function CatIcon({ category, size = 30, selected = false }: { category: string; size?: number; selected?: boolean }) {
  const { icon, color } = catStyle(category);
  return (
    <div className="flex shrink-0 items-center justify-center text-white"
      style={{ width: size, height: size, borderRadius: size * 0.235, background: color,
        boxShadow: selected ? `0 0 0 2.5px var(--sheet), 0 0 0 4.5px var(--tint)` : undefined }}>
      <Icon name={icon} size={Math.round(size * 0.58)} strokeWidth={2.2} />
    </div>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}

// ---- 分段控制 -------------------------------------------------------------------------

export function Segmented<T extends string>({ options, value, onChange, className = "", ariaLabel }: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx("flex rounded-[9px] bg-fill-3 p-[2px]", className)}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={cx("flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[7px] px-2 text-[13px] whitespace-nowrap transition-[background-color] duration-150",
            o.value === value ? "bg-[var(--thumb)] font-semibold shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)]" : "font-medium")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- 卡片（sheet）：page = 整頁、後面的畫面縮小；auto = 依內容高度 ----------------

let stacked = 0;
function setStack(delta: number) {
  stacked = Math.max(0, stacked + delta);
  document.documentElement.classList.toggle("sheet-stack", stacked > 0);
}

export function usePageStack(active: boolean) {
  useEffect(() => {
    if (!active) return;
    setStack(1);
    return () => setStack(-1);
  }, [active]);
}

export function Sheet({ open, onClose, title, left, right, children, footer, dismissible = true, page = false }: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean; // false：一定要在裡面選一個
  page?: boolean; // 整頁卡片（後面的 app 縮小）
}) {
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y: number; t: number } | null>(null);
  const openedAt = useRef(0);
  usePageStack(open && page);
  useEffect(() => {
    if (!open) return;
    openedAt.current = Date.now();
    setDy(0);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismissible && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, dismissible]);
  if (!open) return null;
  const end = (y: number) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const v = (y - d.y) / Math.max(1, Date.now() - d.t);
    if (dismissible && (y - d.y > 120 || v > 0.6)) onClose();
    else setDy(0);
  };
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <div className={cx("anim-fade absolute inset-0", page ? "bg-transparent" : "bg-black/40")}
        // 剛打開時不理背景的點擊（打開它的那一下，瀏覽器可能會再補送一個 click 到這裡）
        onClick={() => dismissible && Date.now() - openedAt.current > 400 && onClose()} />
      <div
        className={cx("anim-sheet relative mx-auto flex w-full max-w-xl flex-col bg-sheet shadow-[0_-1px_0_rgba(0,0,0,0.04)]",
          page ? "rounded-t-[12px]" : "max-h-[90dvh] rounded-t-[14px]")}
        style={{ top: undefined, height: page ? "calc(100dvh - env(safe-area-inset-top) - 10px)" : undefined,
          transform: dy ? `translateY(${dy}px)` : undefined, transition: drag.current ? "none" : "transform 0.25s ease" }}>
        <div className="shrink-0 touch-none"
          onPointerDown={(e) => {
            drag.current = { y: e.clientY, t: Date.now() };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => drag.current && setDy(Math.max(0, e.clientY - drag.current.y))}
          onPointerUp={(e) => end(e.clientY)}
          onPointerCancel={() => {
            drag.current = null;
            setDy(0);
          }}>
          <div className="mx-auto mt-[6px] h-[5px] w-9 rounded-full bg-[var(--gray-3)]" />
          {(title || left || right || dismissible) && (
            <div className="relative flex h-11 items-center px-2">
              <div className="z-10 flex min-w-16 items-center">{left}</div>
              <div className="absolute inset-x-20 flex justify-center truncate text-[17px] font-semibold">{title}</div>
              <div className="z-10 ml-auto flex min-w-16 items-center justify-end">
                {right ?? (dismissible && (
                  <button className="press flex h-[30px] w-[30px] items-center justify-center rounded-full bg-fill-3 text-label-2"
                    onClick={onClose} aria-label="關閉">
                    <Icon name="x" size={15} strokeWidth={2.8} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="scroll min-h-0 flex-1 px-4 pb-4">{children}</div>
        {footer && <div className="safe-b shrink-0 px-4 pt-2 pb-3">{footer}</div>}
        {!footer && <div className="safe-b shrink-0" />}
      </div>
    </div>,
    document.body,
  );
}

export function TextButton({ children, onClick, bold = false, disabled = false, tone = "tint" }: {
  children: ReactNode; onClick: () => void; bold?: boolean; disabled?: boolean; tone?: "tint" | "red";
}) {
  return (
    <button disabled={disabled} onClick={onClick}
      className={cx("press h-11 px-2 text-[17px] disabled:opacity-35", bold && "font-semibold", tone === "red" ? "text-red" : "text-tint")}>
      {children}
    </button>
  );
}

export function BigButton({ children, onClick, disabled = false, tone = "tint", className = "" }: {
  children: ReactNode; onClick: () => void; disabled?: boolean; tone?: "tint" | "gray" | "red"; className?: string;
}) {
  return (
    <button disabled={disabled} onClick={onClick}
      className={cx("press flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] text-[17px] font-semibold disabled:opacity-40",
        tone === "tint" && "bg-tint text-white", tone === "gray" && "bg-fill-3 text-tint", tone === "red" && "bg-fill-3 text-red", className)}>
      {children}
    </button>
  );
}

// ---- 操作選單（刪除確認那種）-----------------------------------------------------------

export function ActionSheet({ open, onClose, message, actions }: {
  open: boolean;
  onClose: () => void;
  message?: ReactNode;
  actions: { label: string; onClick: () => void; destructive?: boolean }[];
}) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[55] flex flex-col justify-end" role="dialog" aria-modal="true">
      <div className="anim-fade absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="anim-sheet safe-b relative mx-auto w-full max-w-md px-2 pb-2">
        <div className="material overflow-hidden rounded-[14px]">
          {message && <div className="px-4 py-3.5 text-center text-[13px] leading-[18px] text-label-2">{message}</div>}
          {actions.map((a) => (
            <button key={a.label} onClick={a.onClick}
              className={cx("press h-[57px] w-full text-[20px] hairline-t", a.destructive ? "text-red" : "text-tint")}>
              {a.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="press mt-2 h-[57px] w-full rounded-[14px] bg-sheet text-[20px] font-semibold text-tint">
          取消
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ---- 頂部提示（像 iOS 的系統通知膠囊），可附「復原」 ---------------------------------------

interface HudItem {
  id: number;
  msg: string;
  action?: { label: string; fn: () => void };
  tone?: "ok" | "error";
}

let huds: HudItem[] = [];
const hudListeners = new Set<() => void>();
let hudSeq = 0;

export function toast(msg: string, opts: { action?: HudItem["action"]; tone?: HudItem["tone"]; ms?: number } = {}) {
  const item: HudItem = { id: ++hudSeq, msg, action: opts.action, tone: opts.tone ?? "ok" };
  huds = [item];
  hudListeners.forEach((f) => f());
  setTimeout(() => dismissHud(item.id), opts.ms ?? (opts.action ? 5000 : 2400));
}

function dismissHud(id: number) {
  huds = huds.filter((t) => t.id !== id);
  hudListeners.forEach((f) => f());
}

export function HudHost() {
  const items = useSyncExternalStore(
    (fn) => {
      hudListeners.add(fn);
      return () => {
        hudListeners.delete(fn);
      };
    },
    () => huds,
  );
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center px-4"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }} aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="anim-hud pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full py-2.5 pr-2 pl-3.5 text-[15px]"
          style={{ background: "var(--hud)", boxShadow: "var(--hud-shadow)", WebkitBackdropFilter: "blur(20px)", backdropFilter: "blur(20px)" }}>
          <span className={cx("flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-white", t.tone === "error" ? "bg-red" : "bg-green")}>
            <Icon name={t.tone === "error" ? "x" : "check"} size={13} strokeWidth={3.2} />
          </span>
          <span className="min-w-0 truncate font-medium">{t.msg}</span>
          {t.action ? (
            <button className="press shrink-0 rounded-full bg-fill-3 px-3 py-1 text-[15px] font-semibold text-tint"
              onClick={() => {
                t.action!.fn();
                dismissHud(t.id);
              }}>
              {t.action.label}
            </button>
          ) : <span className="w-1.5" />}
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ---- 月份列：「2026年11月 ⌄」＋左右鍵 ------------------------------------------------------

export function MonthRow({ month, min, max, onChange, className = "" }: {
  month: string;
  min: string;
  max: string;
  onChange: (m: string) => void;
  className?: string;
}) {
  const [picking, setPicking] = useState(false);
  const months: string[] = [];
  for (let m = max; m >= min && months.length < 240; ) {
    months.push(m);
    const [y, mo] = m.split("-").map(Number);
    m = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
  }
  const i = months.indexOf(month);
  return (
    <div className={cx("flex items-center px-4", className)}>
      <button className="press flex items-center gap-1 text-[17px] font-semibold" onClick={() => setPicking(true)}>
        {monthTitle(month)}
        <Icon name="down" size={17} strokeWidth={2.6} className="text-tint" />
      </button>
      <div className="ml-auto flex items-center gap-1 text-tint">
        <button className="press flex h-9 w-9 items-center justify-center disabled:opacity-25" aria-label="上個月"
          disabled={i < 0 || i >= months.length - 1} onClick={() => onChange(months[i + 1])}>
          <Icon name="left" size={22} strokeWidth={2.4} />
        </button>
        <button className="press flex h-9 w-9 items-center justify-center disabled:opacity-25" aria-label="下個月"
          disabled={i <= 0} onClick={() => onChange(months[i - 1])}>
          <Icon name="right" size={22} strokeWidth={2.4} />
        </button>
      </div>
      <Sheet open={picking} onClose={() => setPicking(false)} title="選月份">
        <div className="ios-rows mt-1 overflow-hidden rounded-[12px] bg-card-2">
          {months.map((m) => (
            <button key={m} className="row-press flex h-11 w-full items-center px-4 text-left text-[17px]"
              onClick={() => {
                onChange(m);
                setPicking(false);
              }}>
              <span className="flex-1">{monthTitle(m)}</span>
              {m === month && <Icon name="check" size={18} strokeWidth={2.6} className="text-tint" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

// ---- 搜尋欄 -----------------------------------------------------------------------------

export function SearchField({ value, onChange, onFocus, placeholder = "搜尋", autoFocus = false }: {
  value: string; onChange: (v: string) => void; onFocus?: () => void; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <div className="flex h-9 flex-1 items-center gap-1.5 rounded-[10px] bg-fill-3 px-2 text-label-2">
      <Icon name="search" size={17} strokeWidth={2.4} />
      <input autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} onFocus={onFocus}
        placeholder={placeholder} enterKeyHint="search" aria-label="搜尋"
        className="min-w-0 flex-1 bg-transparent text-[17px] text-label outline-none" />
      {value && (
        <button className="press flex h-5 w-5 items-center justify-center rounded-full bg-[var(--gray-3)] text-card"
          onClick={() => onChange("")} aria-label="清除">
          <Icon name="x" size={11} strokeWidth={3.4} />
        </button>
      )}
    </div>
  );
}

export function Empty({ icon = "list", title, hint, action }: {
  icon?: Parameters<typeof Icon>[0]["name"]; title: string; hint?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center">
      <Icon name={icon} size={44} strokeWidth={1.6} className="mb-3 text-label-3" />
      <div className="text-[20px] font-semibold">{title}</div>
      {hint && <div className="mt-1 text-[15px] text-label-2">{hint}</div>}
      {action && <div className="mt-5">{action}</div>}
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
