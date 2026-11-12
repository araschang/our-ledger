/** 共用元件（糖果風格）：頁面、卡片、分類圖示、頭像、膠囊分段、卡片／對話框、操作選單、頂部提示、月份列、搜尋欄。 */
import { type CSSProperties, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { monthTitle } from "../lib/format";
import type { Meta } from "../lib/types";
import { catStyle, cx, nameOf, personSoft } from "../lib/ui";
import { Icon } from "./Icon";

// ---- 電腦版？（≥1024px 寬）------------------------------------------------------------

const WIDE_Q = "(min-width: 1024px)";
export function useWide(): boolean {
  return useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia(WIDE_Q);
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    },
    () => window.matchMedia(WIDE_Q).matches,
    () => false,
  );
}

// ---- 頁面：大標題；手機往下捲時標題縮進頂欄 -------------------------------------------

export function Screen({ title, trailing, header, children }: {
  title: string;
  trailing?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  return (
    <div className="relative h-full">
      <header className={cx("safe-t absolute inset-x-0 top-0 z-20 transition-[background-color,box-shadow] duration-200 lg:hidden",
        scrolled ? "material hairline-b" : "bg-transparent")}>
        <div className="relative flex h-12 items-center justify-end px-2">
          <div className={cx("pointer-events-none absolute inset-x-24 truncate text-center text-[17px] font-extrabold transition-opacity duration-200",
            scrolled ? "opacity-100" : "opacity-0")}>{title}</div>
          <div className="flex items-center">{trailing}</div>
        </div>
      </header>
      <div className="scroll h-full" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 34)}>
        <div className="mx-auto w-full lg:max-w-[1240px] lg:px-8">
          <div className="safe-t lg:hidden" />
          <div className="h-12 lg:hidden" />
          <div className="flex items-end justify-between px-5 pb-2 lg:px-0 lg:pt-7 lg:pb-3">
            <h1 className="text-[32px] leading-[40px] font-black tracking-[0.01em] lg:text-[34px]">{title}</h1>
            <div className="hidden items-center lg:flex">{trailing}</div>
          </div>
          {header}
          <div className="tabbar-space">{children}</div>
        </div>
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
    <button className="press relative flex h-10 w-10 items-center justify-center rounded-full bg-card text-label-2 float"
      onClick={onClick} aria-label={label}>
      <Icon name={icon} size={19} strokeWidth={2.2} />
      {badge}
    </button>
  );
}

// ---- 卡片：白色大圓角；標題在卡片裡面 --------------------------------------------------

export function Group({ header, headerRight, footer, children, className = "", inset = 16, top = 16, style }: {
  header?: ReactNode;
  headerRight?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  inset?: number; // 分隔線從哪裡開始畫（有圖示的列要從文字開始）
  top?: number; // 跟上一張卡片的距離（px）
  style?: CSSProperties;
}) {
  return (
    <section className={cx("mx-4 lg:mx-0", className)} style={{ marginTop: top, ...style }}>
      <div className="card overflow-hidden">
        {(header || headerRight) && (
          <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-1.5">
            <h2 className="text-[16px] leading-[22px] font-extrabold">{header}</h2>
            {headerRight && <span className="tnum text-[13px] leading-[18px] text-label-2">{headerRight}</span>}
          </div>
        )}
        <div className="ios-rows" style={{ "--sep-inset": `${inset}px` } as CSSProperties}>
          {children}
        </div>
      </div>
      {footer && <div className="px-4 pt-2 text-[13px] leading-[18px] text-label-2">{footer}</div>}
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
        <div className={cx("truncate text-[16px] leading-[22px]", tone === "tint" && "font-bold text-tint", tone === "red" && "font-bold text-red")}>{title}</div>
        {subtitle && <div className="truncate text-[14px] leading-[20px] text-label-2">{subtitle}</div>}
      </div>
      {value != null && <div className="tnum shrink-0 text-[16px] text-label-2">{value}</div>}
      {children}
      {chevron && <Icon name="right" size={15} strokeWidth={2.6} className="shrink-0 text-label-3" />}
    </>
  );
  const cls = cx("flex min-h-[48px] w-full items-center gap-3 px-4 py-[11px] text-left", className);
  return onClick ? (
    <button className={cx(cls, "row-press")} onClick={onClick}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ---- 分類圖示：粉彩圓形＋墨色線條；選到時整顆變墨色 ----------------------------------------

export function CatIcon({ category, size = 30, selected = false }: { category: string; size?: number; selected?: boolean }) {
  const { icon, bg } = catStyle(category);
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full transition-[background-color,color] duration-150"
      style={{ width: size, height: size, background: selected ? "var(--tint)" : bg, color: selected ? "var(--on-tint)" : "var(--label)" }}>
      <Icon name={icon} size={Math.round(size * 0.5)} strokeWidth={2.1} />
    </div>
  );
}

/** 人的頭像：名字第一個字、淺色底。 */
export function Avatar({ meta, pid, size = 28, ring = false }: { meta: Meta; pid: string; size?: number; ring?: boolean }) {
  const name = nameOf(meta, pid);
  return (
    <span className="rounded-num inline-flex shrink-0 items-center justify-center rounded-full font-black text-label"
      title={name}
      style={{ width: size, height: size, background: personSoft(meta, pid), fontSize: Math.round(size * 0.44),
        boxShadow: ring ? "0 0 0 3px var(--bg)" : undefined }}>
      {[...name][0]?.toUpperCase() ?? "?"}
    </span>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}

/** 小膠囊（篩選、標籤）。 */
export function Chip({ children, onClick, active = false, className = "", ariaLabel }: {
  children: ReactNode; onClick?: () => void; active?: boolean; className?: string; ariaLabel?: string;
}) {
  return (
    <button onClick={onClick} aria-label={ariaLabel} aria-pressed={onClick ? active : undefined}
      className={cx("press flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold",
        active ? "bg-tint text-on-tint" : "bg-card text-label float", className)}>
      {children}
    </button>
  );
}

// ---- 膠囊分段控制 ------------------------------------------------------------------------

export function Segmented<T extends string>({ options, value, onChange, className = "", ariaLabel }: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx("flex rounded-full bg-fill-3 p-[3px]", className)}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={cx("flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 text-[14px] whitespace-nowrap transition-[background-color,box-shadow] duration-150",
            o.value === value ? "bg-[var(--thumb)] font-extrabold text-label shadow-[0_2px_8px_rgba(42,34,56,0.12)]" : "font-semibold text-label-2")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- 卡片（sheet）：手機從下面滑上來；電腦是置中的對話框 ------------------------------------

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

export function Sheet({ open, onClose, title, left, right, children, footer, dismissible = true, page = false, wideWidth = 560 }: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean; // false：一定要在裡面選一個
  page?: boolean; // 手機：整頁卡片（後面的 app 縮小）
  wideWidth?: number; // 電腦版對話框寬度
}) {
  const wide = useWide();
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y: number; t: number } | null>(null);
  const openedAt = useRef(0);
  usePageStack(open && page && !wide);
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
  const head = (title || left || right || dismissible) && (
    <div className="relative flex h-12 items-center px-3">
      <div className="z-10 flex min-w-16 items-center">{left}</div>
      <div className="absolute inset-x-20 flex justify-center truncate text-[17px] font-extrabold">{title}</div>
      <div className="z-10 ml-auto flex min-w-16 items-center justify-end">
        {right ?? (dismissible && (
          <button className="press flex h-8 w-8 items-center justify-center rounded-full bg-fill-3 text-label-2"
            onClick={onClose} aria-label="關閉">
            <Icon name="x" size={15} strokeWidth={2.8} />
          </button>
        ))}
      </div>
    </div>
  );
  return createPortal(
    <div className={cx("fixed inset-0 z-50 flex", wide ? "items-center justify-center p-6" : "flex-col justify-end")}
      role="dialog" aria-modal="true">
      <div className={cx("anim-fade absolute inset-0", page && !wide ? "bg-transparent" : "bg-[rgba(22,18,29,0.42)]")}
        // 剛打開時不理背景的點擊（打開它的那一下，瀏覽器可能會再補送一個 click 到這裡）
        onClick={() => dismissible && Date.now() - openedAt.current > 400 && onClose()} />
      {wide ? (
        <div className="anim-pop float relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[30px] bg-sheet"
          style={{ maxWidth: wideWidth }}>
          <div className="shrink-0 pt-2">{head}</div>
          <div className="scroll min-h-0 flex-1 px-5 pb-5">{children}</div>
          {footer && <div className="shrink-0 px-5 pt-2 pb-5">{footer}</div>}
        </div>
      ) : (
        <div
          className={cx("anim-sheet relative mx-auto flex w-full max-w-xl flex-col bg-sheet",
            page ? "rounded-t-[22px]" : "max-h-[90dvh] rounded-t-[28px]")}
          style={{ height: page ? "calc(100dvh - env(safe-area-inset-top) - 10px)" : undefined,
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
            <div className="mx-auto mt-[7px] h-[5px] w-10 rounded-full bg-[var(--gray-3)]" />
            {head}
          </div>
          <div className="scroll min-h-0 flex-1 px-4 pb-4">{children}</div>
          {footer && <div className="safe-b shrink-0 px-4 pt-2 pb-3">{footer}</div>}
          {!footer && <div className="safe-b shrink-0" />}
        </div>
      )}
    </div>,
    document.body,
  );
}

export function TextButton({ children, onClick, bold = false, disabled = false, tone = "tint" }: {
  children: ReactNode; onClick: () => void; bold?: boolean; disabled?: boolean; tone?: "tint" | "red";
}) {
  return (
    <button disabled={disabled} onClick={onClick}
      className={cx("press h-11 px-2 text-[17px] disabled:opacity-35", bold ? "font-extrabold" : "font-semibold",
        tone === "red" ? "text-red" : "text-tint")}>
      {children}
    </button>
  );
}

export function BigButton({ children, onClick, disabled = false, tone = "tint", className = "" }: {
  children: ReactNode; onClick: () => void; disabled?: boolean; tone?: "tint" | "gray" | "red"; className?: string;
}) {
  return (
    <button disabled={disabled} onClick={onClick}
      className={cx("press flex h-[54px] w-full items-center justify-center gap-2 rounded-full text-[17px] font-extrabold disabled:opacity-40",
        tone === "tint" && "bg-tint text-on-tint", tone === "gray" && "bg-fill-3 text-label", tone === "red" && "bg-fill-3 text-red", className)}>
      {children}
    </button>
  );
}

// ---- 操作選單（刪除確認那種）------------------------------------------------------------

export function ActionSheet({ open, onClose, message, actions }: {
  open: boolean;
  onClose: () => void;
  message?: ReactNode;
  actions: { label: string; onClick: () => void; destructive?: boolean }[];
}) {
  const wide = useWide();
  if (!open) return null;
  return createPortal(
    <div className={cx("fixed inset-0 z-[55] flex", wide ? "items-center justify-center p-6" : "flex-col justify-end")}
      role="dialog" aria-modal="true">
      <div className="anim-fade absolute inset-0 bg-[rgba(22,18,29,0.42)]" onClick={onClose} />
      <div className={cx("relative mx-auto w-full", wide ? "anim-pop max-w-[380px]" : "anim-sheet safe-b max-w-md px-3 pb-3")}>
        <div className="float overflow-hidden rounded-[26px] bg-sheet">
          {message && <div className="px-5 pt-4 pb-3 text-center text-[14px] leading-[20px] text-label-2">{message}</div>}
          {actions.map((a) => (
            <button key={a.label} onClick={a.onClick}
              className={cx("row-press h-[56px] w-full border-t border-sep text-[18px] font-extrabold", a.destructive ? "text-red" : "text-tint")}>
              {a.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="press float mt-2 h-[56px] w-full rounded-[26px] bg-sheet text-[18px] font-bold text-label">
          取消
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ---- 頂部提示膠囊，可附「復原」 ------------------------------------------------------------

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
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }} aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="anim-hud pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full py-2 pr-2 pl-2.5 text-[15px]"
          style={{ background: "var(--hud)", boxShadow: "var(--hud-shadow)" }}>
          <span className={cx("flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-white", t.tone === "error" ? "bg-red" : "bg-green")}>
            <Icon name={t.tone === "error" ? "x" : "check"} size={14} strokeWidth={3.2} />
          </span>
          <span className="min-w-0 truncate font-bold">{t.msg}</span>
          {t.action ? (
            <button className="press shrink-0 rounded-full bg-tint px-3.5 py-1.5 text-[14px] font-extrabold text-on-tint"
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

// ---- 月份列：「2026年11月 ⌄」＋左右鍵 ----------------------------------------------------

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
    <div className={cx("flex items-center gap-2 px-4 lg:px-0", className)}>
      <button className="press flex h-10 items-center gap-1 rounded-full pr-2 pl-1 text-[18px] font-extrabold" onClick={() => setPicking(true)}>
        {monthTitle(month)}
        <Icon name="down" size={17} strokeWidth={2.8} className="text-label-2" />
      </button>
      <div className="ml-auto flex items-center gap-2">
        <button className="press flex h-10 w-10 items-center justify-center rounded-full bg-card float disabled:opacity-30" aria-label="上個月"
          disabled={i < 0 || i >= months.length - 1} onClick={() => onChange(months[i + 1])}>
          <Icon name="left" size={20} strokeWidth={2.6} />
        </button>
        <button className="press flex h-10 w-10 items-center justify-center rounded-full bg-card float disabled:opacity-30" aria-label="下個月"
          disabled={i <= 0} onClick={() => onChange(months[i - 1])}>
          <Icon name="right" size={20} strokeWidth={2.6} />
        </button>
      </div>
      <Sheet open={picking} onClose={() => setPicking(false)} title="選月份" wideWidth={420}>
        <div className="ios-rows mt-1 overflow-hidden rounded-[20px] bg-card-2">
          {months.map((m) => (
            <button key={m} className="row-press flex h-12 w-full items-center px-4 text-left text-[17px]"
              onClick={() => {
                onChange(m);
                setPicking(false);
              }}>
              <span className={cx("flex-1", m === month && "font-extrabold")}>{monthTitle(m)}</span>
              {m === month && <Icon name="check" size={18} strokeWidth={2.8} className="text-tint" />}
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
    <label className="float flex h-11 flex-1 items-center gap-2 rounded-full bg-card px-4 text-label-2">
      <Icon name="search" size={18} strokeWidth={2.4} />
      <input autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} onFocus={onFocus}
        placeholder={placeholder} enterKeyHint="search" aria-label="搜尋"
        className="min-w-0 flex-1 bg-transparent text-[17px] text-label outline-none" />
      {value && (
        <button className="press flex h-6 w-6 items-center justify-center rounded-full bg-fill text-label-2"
          onClick={() => onChange("")} aria-label="清除">
          <Icon name="x" size={12} strokeWidth={3.4} />
        </button>
      )}
    </label>
  );
}

export function Empty({ icon = "list", title, hint, action }: {
  icon?: Parameters<typeof Icon>[0]["name"]; title: string; hint?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <div className="mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-c-lilac text-label">
        <Icon name={icon} size={32} strokeWidth={2} />
      </div>
      <div className="text-[19px] font-extrabold">{title}</div>
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
