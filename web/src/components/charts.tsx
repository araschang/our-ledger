/**
 * 圖表（手畫 SVG，照 dataviz 規格）：柱寬 ≤24px、資料端 4px 圓角、基線方角；
 * 格線是實線細線；一個系列不放圖例、兩個以上一定有圖例；字一律用文字色，不用資料色。
 * 手機沒有滑鼠移過去，所以「點一下」選那根柱子，數字顯示在圖上方的讀數列；
 * 每張圖下面都有「看數字」表格。
 */
import { type ReactNode, useState } from "react";
import { compact, money } from "../lib/format";
import { cx } from "../lib/ui";
import { useWidth } from "./ui";

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

export interface Col {
  key: string;
  label: string;
  value: number;
}

/**
 * 單一系列的柱狀圖。emphasis：選中的那根用主色、其他灰（「這個月」對照其他月）。
 * 可以有負值（例如儲蓄率），負的用紅色往下長。
 */
export function ColumnChart({ data, selected, onSelect, height = 170, format = (v) => money(v, { cents: false }),
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
  const padL = 40;
  const padT = 20;
  const padB = 24;
  const plotH = height - padT - padB;
  const maxV = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const minV = signed ? -niceMax(Math.max(0, ...data.map((d) => -d.value))) : 0;
  const span = maxV - (minV < 0 ? minV : 0) || 1;
  const y = (v: number) => padT + ((maxV - v) / span) * plotH;
  const base = y(0);
  const band = data.length ? (W - padL) / data.length : 0;
  const bw = Math.max(4, Math.min(24, band * 0.62));
  const labelEvery = band < 30 ? Math.ceil(30 / Math.max(1, band)) : 1;
  const ticks = minV < 0 ? [maxV, 0, minV] : [maxV, maxV / 2, 0];
  const sel = selected ?? data[data.length - 1]?.key;
  return (
    <div ref={ref} className="w-full">
      {W > 0 && (
        <svg width={W} height={height} role="img" className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="tnum">
                {axis(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = padL + i * band + (band - bw) / 2;
            const isSel = d.key === sel;
            const fill = d.value < 0 ? "var(--bad)"
              : emphasis ? (isSel ? "var(--series-1)" : "var(--series-other)") : "var(--series-1)";
            const h = base - y(d.value);
            return (
              <g key={d.key}>
                <path d={barPath(x, base, bw, h)} fill={fill} opacity={!emphasis && sel && !isSel ? 0.55 : 1} />
                {isSel && (
                  <text x={x + bw / 2} y={d.value >= 0 ? base - h - 6 : base - h + 14} textAnchor="middle"
                    fontSize={11.5} fontWeight={600} fill="var(--ink)" className="tnum">
                    {format(d.value)}
                  </text>
                )}
                {(i % labelEvery === (data.length - 1) % labelEvery || isSel) && (
                  <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize={11}
                    fill={isSel ? "var(--ink)" : "var(--muted)"} fontWeight={isSel ? 600 : 400}>
                    {d.label}
                  </text>
                )}
                {onSelect && (
                  <rect x={padL + i * band} y={0} width={band} height={height} fill="transparent"
                    role="button" aria-label={`${d.label} ${format(d.value)}`} tabIndex={0}
                    onClick={() => onSelect(d.key)}
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
export function StackedColumns({ series, cols, selected, onSelect, height = 200 }: {
  series: StackSeries[];
  cols: { key: string; label: string; values: Record<string, number> }[];
  selected: string | null;
  onSelect: (key: string) => void;
  height?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const padL = 40;
  const padT = 8;
  const padB = 24;
  const plotH = height - padT - padB;
  const totals = cols.map((c) => series.reduce((s, x) => s + Math.max(0, c.values[x.key] ?? 0), 0));
  const maxV = niceMax(Math.max(0, ...totals));
  const y = (v: number) => padT + ((maxV - v) / maxV) * plotH;
  const band = cols.length ? (W - padL) / cols.length : 0;
  const bw = Math.max(6, Math.min(24, band * 0.5));
  return (
    <div ref={ref} className="w-full">
      {W > 0 && (
        <svg width={W} height={height} role="img" className="block">
          {[maxV, maxV / 2, 0].map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="tnum">
                {compact(t)}
              </text>
            </g>
          ))}
          {cols.map((c, i) => {
            const x = padL + i * band + (band - bw) / 2;
            let acc = 0;
            const segs = series.map((s) => ({ s, v: Math.max(0, c.values[s.key] ?? 0) })).filter((g) => g.v > 0);
            const isSel = c.key === selected;
            return (
              <g key={c.key} opacity={selected && !isSel ? 0.5 : 1}>
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
                <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize={11}
                  fill={isSel ? "var(--ink)" : "var(--muted)"} fontWeight={isSel ? 600 : 400}>
                  {c.label}
                </text>
                <rect x={padL + i * band} y={0} width={band} height={height} fill="transparent" role="button"
                  tabIndex={0} aria-label={`${c.label} 合計 ${money(totals[i], { cents: false })}`}
                  onClick={() => onSelect(c.key)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(c.key)} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** 單一系列的折線＋淡色面積（累積淨存）；點圖上任一處，讀數跳到最近的月份。 */
export function AreaLine({ points, selected, onSelect, height = 180 }: {
  points: Col[];
  selected: string | null;
  onSelect: (key: string) => void;
  height?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const padL = 44;
  const padR = 14;
  const padT = 22;
  const padB = 24;
  const plotH = height - padT - padB;
  const vals = points.map((p) => p.value);
  const maxV = niceMax(Math.max(0, ...vals));
  const minV = Math.min(0, ...vals) < 0 ? -niceMax(-Math.min(0, ...vals)) : 0;
  const y = (v: number) => padT + ((maxV - v) / (maxV - minV || 1)) * plotH;
  const step = points.length > 1 ? (W - padL - padR) / (points.length - 1) : 0;
  const x = (i: number) => (points.length > 1 ? padL + i * step : padL + (W - padL - padR) / 2);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join("");
  const area = points.length ? `${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";
  const si = Math.max(0, points.findIndex((p) => p.key === selected));
  const labelEvery = step < 34 ? Math.ceil(34 / Math.max(1, step)) : 1;
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const i = Math.round((clientX - r.left - padL) / (step || 1));
    const k = points[Math.max(0, Math.min(points.length - 1, i))]?.key;
    if (k) onSelect(k);
  };
  return (
    <div ref={ref} className="w-full">
      {W > 0 && points.length > 0 && (
        <svg width={W} height={height} role="img" className="block touch-pan-y"
          onClick={(e) => pick(e.clientX, e.currentTarget)}>
          {[maxV, minV < 0 ? 0 : maxV / 2, minV].map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="tnum">
                {compact(t)}
              </text>
            </g>
          ))}
          <path d={area} fill="var(--series-1)" opacity={0.1} />
          <path d={line} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <line x1={x(si)} x2={x(si)} y1={padT - 6} y2={y(minV)} stroke="var(--axis)" strokeWidth={1} />
          <circle cx={x(si)} cy={y(points[si].value)} r={5} fill="var(--series-1)" stroke="var(--card)" strokeWidth={2} />
          <text x={Math.min(W - padR, Math.max(padL, x(si)))} y={padT - 10}
            textAnchor={si === 0 ? "start" : si === points.length - 1 ? "end" : "middle"}
            fontSize={11.5} fontWeight={600} fill="var(--ink)" className="tnum">
            {money(points[si].value, { cents: false })}
          </text>
          {points.map((p, i) =>
            i % labelEvery === (points.length - 1) % labelEvery || i === si ? (
              <text key={p.key} x={x(i)} y={height - 6} fontSize={11}
                textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                fill={i === si ? "var(--ink)" : "var(--muted)"} fontWeight={i === si ? 600 : 400}>
                {p.label}
              </text>
            ) : null)}
        </svg>
      )}
    </div>
  );
}

/** 排序後的橫條（一個顏色）：名稱、金額、佔比，點一列看明細。 */
export function BarList({ rows, onSelect, total }: {
  rows: { key: string; label: ReactNode; value: number; sub?: string }[];
  onSelect?: (key: string) => void;
  total?: number;
}) {
  const top = Math.max(0, ...rows.map((r) => r.value)) || 1;
  const sum = total ?? rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="-mx-2 flex flex-col">
      {rows.map((r) => (
        <button key={r.key} disabled={!onSelect} onClick={() => onSelect?.(r.key)}
          className={cx("flex flex-col gap-1.5 rounded-xl px-2 py-2 text-left", onSelect && "press active:bg-card-2")}>
          <div className="flex w-full items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[15px]">{r.label}</span>
            <span className="tnum shrink-0 text-[15px] font-semibold">
              {money(r.value, { cents: false })}
              <span className="ml-1.5 text-[12px] font-normal text-muted">
                {r.sub ?? (sum > 0 ? `${Math.round((r.value / sum) * 100)}%` : "")}
              </span>
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-card-2">
            <div className="h-2 rounded-full bg-[var(--series-1)]" style={{ width: `${Math.max(1.5, (r.value / top) * 100)}%` }} />
          </div>
        </button>
      ))}
    </div>
  );
}

/** 每列兩條（兩個人各負擔多少）。 */
export function PairedBars({ rows, series }: {
  rows: { key: string; label: ReactNode; values: number[] }[];
  series: { label: string; color: string }[];
}) {
  const top = Math.max(0, ...rows.flatMap((r) => r.values)) || 1;
  return (
    <div>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
      <div className="mt-2 flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="mb-1 text-[14px]">{r.label}</div>
            {r.values.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-2 flex-1 rounded-full bg-card-2">
                  <div className="h-2 rounded-full" style={{ width: `${v > 0 ? Math.max(1.5, (v / top) * 100) : 0}%`, background: series[i].color }} />
                </div>
                <span className="tnum w-[76px] shrink-0 text-right text-[13px] text-ink-2">{money(v, { cents: false })}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5 text-[13px] text-ink-2">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: it.color }} />
          <span>{it.label}</span>
          {it.value && <span className="tnum font-semibold text-ink">{it.value}</span>}
        </div>
      ))}
    </div>
  );
}

/** 「看數字」：每張圖都有的表格版。 */
export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button className="press text-[13px] text-link" onClick={() => setOpen((o) => !o)}>
        {open ? "收起數字" : "看數字"}
      </button>
      {open && (
        <div className="no-scrollbar mt-2 overflow-x-auto">
          <table className="tnum w-full text-[13px]">
            <thead>
              <tr className="text-muted">
                {head.map((h, i) => (
                  <th key={h} className={cx("py-1.5 font-normal", i ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
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
