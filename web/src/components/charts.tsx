/**
 * 圖表（手畫 SVG；樣子學 Apple「健康」app）：Y 軸數字在右邊、格線很淡、柱子資料端圓角、
 * 點一根柱子 → 上方出現讀數框和一條細線指到柱子。一個系列不放圖例、兩個以上一定有圖例；
 * 字一律用文字色。每張圖下面都有「看數字」表格。
 */
import { type ReactNode, useState } from "react";
import { compact, money } from "../lib/format";
import { cx } from "../lib/ui";
import { CatIcon, Dot, useWidth } from "./ui";

export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** 一根柱子：資料端圓角 r、基線那端方角。h<0 代表往下長。 */
function barPath(x: number, base: number, w: number, h: number, r = 4): string {
  if (Math.abs(h) < 0.5) return "";
  const rr = Math.min(r, Math.abs(h), w / 2);
  if (h > 0) {
    const top = base - h;
    return `M${x},${base}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + w - rr}Q${x + w},${top} ${x + w},${top + rr}V${base}Z`;
  }
  const bot = base - h;
  return `M${x},${base}V${bot - rr}Q${x},${bot} ${x + rr},${bot}H${x + w - rr}Q${x + w},${bot} ${x + w},${bot - rr}V${base}Z`;
}

const CALLOUT_H = 50;

/** 讀數框（健康 app 那種）：小字標籤＋大數字，放在圖的上方、對準選到的那一根。 */
function Callout({ x, width, label, value }: { x: number; width: number; label: string; value: string }) {
  const w = 132;
  const left = Math.max(0, Math.min(width - w, x - w / 2));
  return (
    <div className="pointer-events-none absolute top-0 flex h-[44px] flex-col justify-center rounded-[8px] bg-fill-4 px-2.5"
      style={{ left, width: w }}>
      <div className="truncate text-[11px] leading-[13px] font-medium text-label-2">{label}</div>
      <div className="rounded-num tnum truncate text-[19px] leading-[24px] font-semibold">{value}</div>
    </div>
  );
}

export interface Col {
  key: string;
  label: string;
  value: number;
  callout?: string; // 讀數框的標籤（預設用 label）
}

/**
 * 單一系列的柱狀圖。emphasis：選中的那根用主色、其他灰。signed：可以有負值（例如儲蓄率），負的紅色往下長。
 */
export function ColumnChart({ data, selected, onSelect, height = 200, format = (v) => money(v, { cents: false }),
  axis = compact, emphasis = false, signed = false }: {
  data: Col[];
  selected?: string | null;
  onSelect?: (key: string) => void;
  height?: number;
  format?: (v: number) => string;
  axis?: (v: number) => string;
  emphasis?: boolean;
  signed?: boolean;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const padR = 42;
  const padT = CALLOUT_H + 6;
  const padB = 22;
  const plotH = height - padT - padB;
  const maxV = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const minV = signed ? -niceMax(Math.max(0, ...data.map((d) => -d.value))) : 0;
  const span = maxV - minV || 1;
  const y = (v: number) => padT + ((maxV - v) / span) * plotH;
  const base = y(0);
  const plotW = Math.max(0, W - padR);
  const band = data.length ? plotW / data.length : 0;
  const bw = Math.max(4, Math.min(24, band * 0.55));
  const labelEvery = band < 30 ? Math.ceil(30 / Math.max(1, band)) : 1;
  const ticks = minV < 0 ? [maxV, 0, minV] : [maxV, maxV / 2, 0];
  const sel = selected ?? data[data.length - 1]?.key;
  const si = data.findIndex((d) => d.key === sel);
  const sx = si >= 0 ? si * band + band / 2 : 0;
  return (
    <div ref={ref} className="relative w-full">
      {W > 0 && si >= 0 && (
        <Callout x={sx} width={plotW} label={data[si].callout ?? data[si].label} value={format(data[si].value)} />
      )}
      {W > 0 && (
        <svg width={W} height={height} role="img" className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--gray-3)" : "var(--sep)"} strokeWidth={t === 0 ? 1 : 0.5} />
              <text x={plotW + 6} y={y(t) + 4} fontSize={11} fill="var(--label-2)" className="tnum">{axis(t)}</text>
            </g>
          ))}
          {si >= 0 && (
            <line x1={sx} x2={sx} y1={44} y2={data[si].value >= 0 ? base - (base - y(data[si].value)) : base}
              stroke="var(--gray-3)" strokeWidth={1} />
          )}
          {data.map((d, i) => {
            const x = i * band + (band - bw) / 2;
            const isSel = i === si;
            const fill = d.value < 0 ? "var(--red)"
              : emphasis ? (isSel ? "var(--tint)" : "var(--gray-4)") : "var(--tint)";
            return (
              <g key={d.key}>
                <path d={barPath(x, base, bw, base - y(d.value))} fill={fill} opacity={!emphasis && !isSel ? 0.45 : 1} />
                {(i % labelEvery === (data.length - 1) % labelEvery || isSel) && (
                  <text x={x + bw / 2} y={height - 5} textAnchor="middle" fontSize={11}
                    fill={isSel ? "var(--label)" : "var(--label-2)"} fontWeight={isSel ? 600 : 400}>
                    {d.label}
                  </text>
                )}
                {onSelect && (
                  <rect x={i * band} y={0} width={band} height={height} fill="transparent" role="button"
                    aria-label={`${d.label} ${format(d.value)}`} tabIndex={0} onClick={() => onSelect(d.key)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(d.key)} />
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export interface StackSeries {
  key: string;
  label: string;
  color: string;
}

/** 疊起來的柱狀圖（逐月分類）：段與段之間 2px 縫、只有最上面那段圓角。 */
export function StackedColumns({ series, cols, selected, onSelect, height = 210 }: {
  series: StackSeries[];
  cols: { key: string; label: string; values: Record<string, number> }[];
  selected: string | null;
  onSelect: (key: string) => void;
  height?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const padR = 42;
  const padT = CALLOUT_H + 6;
  const padB = 22;
  const plotH = height - padT - padB;
  const totals = cols.map((c) => series.reduce((s, x) => s + Math.max(0, c.values[x.key] ?? 0), 0));
  const maxV = niceMax(Math.max(0, ...totals));
  const y = (v: number) => padT + ((maxV - v) / maxV) * plotH;
  const plotW = Math.max(0, W - padR);
  const band = cols.length ? plotW / cols.length : 0;
  const bw = Math.max(6, Math.min(24, band * 0.5));
  const si = cols.findIndex((c) => c.key === selected);
  const sx = si >= 0 ? si * band + band / 2 : 0;
  return (
    <div ref={ref} className="relative w-full">
      {W > 0 && si >= 0 && (
        <Callout x={sx} width={plotW} label={`${cols[si].label} 合計`} value={money(totals[si], { cents: false })} />
      )}
      {W > 0 && (
        <svg width={W} height={height} role="img" className="block">
          {[maxV, maxV / 2, 0].map((t) => (
            <g key={t}>
              <line x1={0} x2={plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--gray-3)" : "var(--sep)"} strokeWidth={t === 0 ? 1 : 0.5} />
              <text x={plotW + 6} y={y(t) + 4} fontSize={11} fill="var(--label-2)" className="tnum">{compact(t)}</text>
            </g>
          ))}
          {si >= 0 && <line x1={sx} x2={sx} y1={44} y2={y(totals[si])} stroke="var(--gray-3)" strokeWidth={1} />}
          {cols.map((c, i) => {
            const x = i * band + (band - bw) / 2;
            let acc = 0;
            const segs = series.map((s) => ({ s, v: Math.max(0, c.values[s.key] ?? 0) })).filter((g) => g.v > 0);
            const isSel = i === si;
            return (
              <g key={c.key} opacity={si >= 0 && !isSel ? 0.45 : 1}>
                {segs.map(({ s, v }, j) => {
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  const top = j === segs.length - 1;
                  const h = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0)); // 2px 縫
                  const yb = j > 0 ? y0 - 2 : y0;
                  return h > 0.5 ? (
                    <path key={s.key} d={top ? barPath(x, yb, bw, h) : `M${x},${yb}h${bw}v${-h}h${-bw}Z`} fill={s.color} />
                  ) : null;
                })}
                <text x={x + bw / 2} y={height - 5} textAnchor="middle" fontSize={11}
                  fill={isSel ? "var(--label)" : "var(--label-2)"} fontWeight={isSel ? 600 : 400}>{c.label}</text>
                <rect x={i * band} y={0} width={band} height={height} fill="transparent" role="button" tabIndex={0}
                  aria-label={`${c.label} 合計 ${money(totals[i], { cents: false })}`} onClick={() => onSelect(c.key)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(c.key)} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** 單一系列的折線＋淡色面積（累積淨存）；點圖上任一處，選最近的月份。 */
export function AreaLine({ points, selected, onSelect, height = 200 }: {
  points: Col[];
  selected: string | null;
  onSelect: (key: string) => void;
  height?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const padR = 46;
  const padL = 8;
  const padT = CALLOUT_H + 8;
  const padB = 22;
  const plotH = height - padT - padB;
  const vals = points.map((p) => p.value);
  const maxV = niceMax(Math.max(0, ...vals));
  const minV = Math.min(0, ...vals) < 0 ? -niceMax(-Math.min(0, ...vals)) : 0;
  const y = (v: number) => padT + ((maxV - v) / (maxV - minV || 1)) * plotH;
  const plotW = Math.max(0, W - padR);
  const step = points.length > 1 ? (plotW - padL * 2) / (points.length - 1) : 0;
  const x = (i: number) => (points.length > 1 ? padL + i * step : plotW / 2);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join("");
  const area = points.length ? `${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";
  const si = Math.max(0, points.findIndex((p) => p.key === selected));
  const labelEvery = step < 34 ? Math.ceil(34 / Math.max(1, step)) : 1;
  const gid = "area-grad";
  return (
    <div ref={ref} className="relative w-full">
      {W > 0 && points.length > 0 && (
        <Callout x={x(si)} width={plotW} label={points[si].callout ?? points[si].label} value={money(points[si].value, { cents: false })} />
      )}
      {W > 0 && points.length > 0 && (
        <svg width={W} height={height} role="img" className="block touch-pan-y"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.round((e.clientX - r.left - padL) / (step || 1));
            const k = points[Math.max(0, Math.min(points.length - 1, i))]?.key;
            if (k) onSelect(k);
          }}>
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--tint)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--tint)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {[maxV, minV < 0 ? 0 : maxV / 2, minV].map((t) => (
            <g key={t}>
              <line x1={0} x2={plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--gray-3)" : "var(--sep)"} strokeWidth={t === 0 ? 1 : 0.5} />
              <text x={plotW + 6} y={y(t) + 4} fontSize={11} fill="var(--label-2)" className="tnum">{compact(t)}</text>
            </g>
          ))}
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke="var(--tint)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          <line x1={x(si)} x2={x(si)} y1={44} y2={y(points[si].value)} stroke="var(--gray-3)" strokeWidth={1} />
          <circle cx={x(si)} cy={y(points[si].value)} r={5} fill="var(--tint)" stroke="var(--card)" strokeWidth={2.5} />
          {points.map((p, i) =>
            i % labelEvery === (points.length - 1) % labelEvery || i === si ? (
              <text key={p.key} x={x(i)} y={height - 5} fontSize={11}
                textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                fill={i === si ? "var(--label)" : "var(--label-2)"} fontWeight={i === si ? 600 : 400}>{p.label}</text>
            ) : null)}
        </svg>
      )}
    </div>
  );
}

/** 分類清單：圖示、名稱、金額、佔比，下面一條細長條（一個顏色）。點一列看明細。 */
export function CategoryBars({ rows, onSelect, total }: {
  rows: { key: string; value: number }[];
  onSelect?: (key: string) => void;
  total?: number;
}) {
  const top = Math.max(0, ...rows.map((r) => r.value)) || 1;
  const sum = total ?? rows.reduce((s, r) => s + r.value, 0);
  return (
    <>
      {rows.map((r) => (
        <button key={r.key} disabled={!onSelect} onClick={() => onSelect?.(r.key)}
          className={cx("flex w-full items-center gap-3 px-4 py-[10px] text-left", onSelect && "row-press")}>
          <CatIcon category={r.key} size={30} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[17px]">{r.key}</span>
              <span className="rounded-num tnum shrink-0 text-[17px]">
                {money(r.value, { cents: false })}
                <span className="ml-1.5 inline-block w-9 text-right text-[13px] text-label-2">
                  {sum > 0 ? `${Math.round((r.value / sum) * 100)}%` : ""}
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-[5px] w-full rounded-full bg-fill-3">
              <div className="h-[5px] rounded-full bg-tint" style={{ width: `${Math.max(1.5, (r.value / top) * 100)}%` }} />
            </div>
          </div>
        </button>
      ))}
    </>
  );
}

/** 每列兩條（兩個人各負擔多少）。 */
export function PairedBars({ rows, series }: {
  rows: { key: string; values: number[] }[];
  series: { label: string; color: string }[];
}) {
  const top = Math.max(0, ...rows.flatMap((r) => r.values)) || 1;
  return (
    <div className="px-4 py-3">
      <Legend items={series} />
      <div className="mt-3 flex flex-col gap-3.5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-3">
            <CatIcon category={r.key} size={26} />
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-[15px]">{r.key}</div>
              {r.values.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-[6px] flex-1 rounded-full bg-fill-3">
                    <div className="h-[6px] rounded-full" style={{ width: `${v > 0 ? Math.max(1.5, (v / top) * 100) : 0}%`, background: series[i].color }} />
                  </div>
                  <span className="rounded-num tnum w-[64px] shrink-0 text-right text-[13px] text-label-2">{money(v, { cents: false })}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5 text-[13px] text-label-2">
          <Dot color={it.color} size={9} />
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/** 「看數字」：每張圖都有的表格版。 */
export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-4 pb-3">
      <button className="press text-[15px] text-tint" onClick={() => setOpen((o) => !o)}>
        {open ? "隱藏數字" : "顯示數字"}
      </button>
      {open && (
        <div className="no-scrollbar mt-2 overflow-x-auto">
          <table className="tnum w-full text-[13px]">
            <thead>
              <tr className="text-label-2">
                {head.map((h, i) => (
                  <th key={h} className={cx("py-1.5 font-normal", i ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t-[0.5px] border-sep">
                  {r.map((c, j) => (
                    <td key={j} className={cx("py-1.5 whitespace-nowrap", j ? "text-right" : "text-left")}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ChartCard({ title, subtitle, children }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="pt-3">
      {(title || subtitle) && (
        <div className="px-4 pb-2">
          {title && <div className="text-[17px] font-semibold">{title}</div>}
          {subtitle && <div className="text-[13px] text-label-2">{subtitle}</div>}
        </div>
      )}
      <div className="px-4 pb-2">{children}</div>
    </div>
  );
}
