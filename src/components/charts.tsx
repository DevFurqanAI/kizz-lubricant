"use client";

import { useRef, useState, useLayoutEffect, useEffect } from "react";
import { formatMoney } from "@/lib/utils";

// ── Design tokens (graphite-ember) ──────────────────────────────────
const ACCENT = "#E2540C";
const SUCCESS = "#15914B";
const DANGER = "#DC2626";
const GRID = "rgba(38,38,47,0.08)";
const AXIS_TEXT = "#9A9AA6";

// Cost-family tokens — kept distinct from ACCENT/SUCCESS/DANGER so a reader
// never confuses "total cost" with the sales or profit/loss vocabulary.
export const COST_NEUTRAL = "#7C8698"; // total-cost bar in SalesCostBars
export const COST_PURCHASING = "#B8790C";
export const COST_EXPENSES = "#2563EB";
export const COST_SALARY = "#0891B2";

export type ChartPoint = { label: string; value: number };

/** Compact money for axis ticks: 1.2M, 240K, etc. Tooltips show the exact figure. */
function compact(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  if (a >= 1e9) return s + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "B";
  if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
  if (a >= 1e3) return s + Math.round(a / 1e3) + "K";
  return s + Math.round(a);
}

/** Round a value up to a "nice" axis maximum (1, 2, 2.5, 5, 10 × 10ⁿ). */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const f = v / base;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * base;
}

/** Measure a container's width so the SVG stays crisp (no viewBox distortion). */
function useMeasure() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Toggle to true after mount so the reveal transition runs. */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setM(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return m;
}

function xLabelStride(n: number) {
  return Math.max(1, Math.ceil(n / 7));
}

// ── Revenue trend — single-series area chart ────────────────────────
export function TrendChart({ data, height = 220 }: { data: ChartPoint[]; height?: number }) {
  const [ref, W] = useMeasure();
  const mounted = useMounted();
  const [hover, setHover] = useState<number | null>(null);

  const padT = 14, padB = 28, padL = 46, padR = 16;
  const innerW = Math.max(0, W - padL - padR);
  const innerH = height - padT - padB;
  const n = data.length;
  const niceMax = niceCeil(Math.max(1, ...data.map((d) => d.value)));

  const x = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + (innerW * i) / (n - 1));
  const y = (v: number) => padT + innerH * (1 - v / niceMax);
  const step = n <= 1 ? 0 : innerW / (n - 1);

  const linePath = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const areaPath = n ? `${linePath} L${x(n - 1).toFixed(1)},${padT + innerH} L${x(0).toFixed(1)},${padT + innerH} Z` : "";
  const ticks = [0, niceMax / 2, niceMax];
  const stride = xLabelStride(n);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current || n === 0) return;
    const mx = e.clientX - ref.current.getBoundingClientRect().left;
    const i = Math.max(0, Math.min(n - 1, Math.round((mx - padL) / (step || 1))));
    setHover(i);
  }

  if (W === 0) return <div ref={ref} style={{ height }} />;
  if (n === 0)
    return (
      <div ref={ref} className="grid place-items-center text-sm text-muted" style={{ height }}>
        No data yet
      </div>
    );

  const hv = hover !== null ? data[hover] : null;

  return (
    <div ref={ref} className="relative select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width={W} height={height} role="img" aria-label="Revenue trend">
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.22" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
          </linearGradient>
          <clipPath id="trendReveal">
            <rect x="0" y="0" width={mounted ? W : 0} height={height} style={{ transition: "width 0.7s cubic-bezier(0.22,1,0.36,1)" }} />
          </clipPath>
        </defs>

        {/* y gridlines + ticks */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize={10} fill={AXIS_TEXT} className="font-mono">
              {compact(t)}
            </text>
          </g>
        ))}

        {/* x labels */}
        {data.map((d, i) =>
          i % stride === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>
              {d.label}
            </text>
          ) : null,
        )}

        <g clipPath="url(#trendReveal)">
          <path d={areaPath} fill="url(#trendFill)" />
          <path d={linePath} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        </g>

        {/* hover crosshair + marker */}
        {hv && (
          <g>
            <line x1={x(hover!)} y1={padT} x2={x(hover!)} y2={padT + innerH} stroke={ACCENT} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
            <circle cx={x(hover!)} cy={y(hv.value)} r={4.5} fill="#fff" stroke={ACCENT} strokeWidth={2} />
          </g>
        )}
      </svg>

      {hv && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 shadow-pop"
          style={{ left: Math.min(Math.max(x(hover!), 60), W - 60), top: y(hv.value) - 12, transform: "translate(-50%,-100%)" }}
        >
          <p className="text-[11px] text-muted">{hv.label}</p>
          <p className="font-mono text-[13px] font-semibold text-ink tabular-nums whitespace-nowrap">{formatMoney(hv.value)}</p>
        </div>
      )}
    </div>
  );
}

// ── Sales vs. costs — grouped bars comparing money in vs. money out ────
export type SalesCostPoint = { label: string; sales: number; cost: number };

export function SalesCostBars({ data, height = 220 }: { data: SalesCostPoint[]; height?: number }) {
  const [ref, W] = useMeasure();
  const mounted = useMounted();
  const [hover, setHover] = useState<number | null>(null);

  const padT = 14, padB = 28, padL = 46, padR = 16;
  const innerW = Math.max(0, W - padL - padR);
  const innerH = height - padT - padB;
  const n = data.length;

  const niceMax = niceCeil(Math.max(1, ...data.map((d) => Math.max(d.sales, d.cost))));
  const y = (v: number) => padT + innerH * (1 - v / niceMax);
  const band = n > 0 ? innerW / n : innerW;
  const groupW = Math.min(64, band * 0.66);
  const barW = groupW / 2 - 2;
  const groupX = (i: number) => padL + band * i + (band - groupW) / 2;
  const stride = xLabelStride(n);
  const ticks = [0, niceMax / 2, niceMax];

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current || n === 0) return;
    const mx = e.clientX - ref.current.getBoundingClientRect().left;
    const i = Math.floor((mx - padL) / (band || 1));
    setHover(i >= 0 && i < n ? i : null);
  }

  if (W === 0) return <div ref={ref} style={{ height }} />;
  if (n === 0)
    return (
      <div ref={ref} className="grid place-items-center text-sm text-muted" style={{ height }}>
        No data yet
      </div>
    );

  const hv = hover !== null ? data[hover] : null;

  return (
    <div ref={ref} className="relative select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width={W} height={height} role="img" aria-label="Sales versus total costs">
        <defs>
          <clipPath id="salesCostReveal">
            <rect x="0" y="0" width={mounted ? W : 0} height={height} style={{ transition: "width 0.7s cubic-bezier(0.22,1,0.36,1)" }} />
          </clipPath>
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize={10} fill={AXIS_TEXT} className="font-mono">
              {compact(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) =>
          i % stride === 0 || i === n - 1 ? (
            <text key={i} x={groupX(i) + groupW / 2} y={height - 8} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>
              {d.label}
            </text>
          ) : null,
        )}

        <g clipPath="url(#salesCostReveal)">
          {data.map((d, i) => {
            const gx = groupX(i);
            const fade = hover === null || hover === i ? 1 : 0.4;
            return (
              <g key={i} style={{ transition: "opacity 0.15s" }} opacity={fade}>
                <rect x={gx} y={y(d.sales)} width={barW} height={Math.max(2, innerH - (y(d.sales) - padT))} rx={3} fill={ACCENT} />
                <rect x={gx + barW + 4} y={y(d.cost)} width={barW} height={Math.max(2, innerH - (y(d.cost) - padT))} rx={3} fill={COST_NEUTRAL} />
              </g>
            );
          })}
        </g>
      </svg>

      {hv && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 shadow-pop"
          style={{ left: Math.min(Math.max(groupX(hover!) + groupW / 2, 70), W - 70), top: Math.min(y(hv.sales), y(hv.cost)) - 10, transform: "translate(-50%,-100%)" }}
        >
          <p className="text-[11px] text-muted">{hv.label}</p>
          <p className="font-mono text-[13px] font-semibold tabular-nums whitespace-nowrap" style={{ color: ACCENT }}>
            Sales {formatMoney(hv.sales)}
          </p>
          <p className="font-mono text-[13px] font-semibold tabular-nums whitespace-nowrap" style={{ color: COST_NEUTRAL }}>
            Costs {formatMoney(hv.cost)}
          </p>
          <p className={`font-mono text-[12px] font-medium tabular-nums whitespace-nowrap ${hv.sales - hv.cost >= 0 ? "text-success" : "text-danger"}`}>
            {hv.sales - hv.cost >= 0 ? "Profit " : "Loss "}
            {formatMoney(Math.abs(hv.sales - hv.cost))}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Monthly profit / loss — diverging bars anchored to a zero baseline ──
export type ProfitPoint = ChartPoint & { margin?: number };

export function ProfitBars({ data, height = 220 }: { data: ProfitPoint[]; height?: number }) {
  const [ref, W] = useMeasure();
  const mounted = useMounted();
  const [hover, setHover] = useState<number | null>(null);

  const padT = 14, padB = 28, padL = 46, padR = 16;
  const innerW = Math.max(0, W - padL - padR);
  const innerH = height - padT - padB;
  const n = data.length;

  const niceMax = niceCeil(Math.max(0, ...data.map((d) => d.value)) || 1);
  const rawMin = Math.min(0, ...data.map((d) => d.value));
  const niceMin = rawMin < 0 ? -niceCeil(Math.abs(rawMin)) : 0;
  const range = niceMax - niceMin || 1;

  const y = (v: number) => padT + innerH * (1 - (v - niceMin) / range);
  const zeroY = y(0);
  const band = n > 0 ? innerW / n : innerW;
  const barW = Math.min(46, band * 0.6);
  const cx = (i: number) => padL + band * i + band / 2;
  const stride = xLabelStride(n);
  const ticks = niceMin < 0 ? [niceMax, 0, niceMin] : [niceMax, niceMax / 2, 0];

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current || n === 0) return;
    const mx = e.clientX - ref.current.getBoundingClientRect().left;
    const i = Math.floor((mx - padL) / (band || 1));
    setHover(i >= 0 && i < n ? i : null);
  }

  if (W === 0) return <div ref={ref} style={{ height }} />;
  if (n === 0)
    return (
      <div ref={ref} className="grid place-items-center text-sm text-muted" style={{ height }}>
        No data yet
      </div>
    );

  const hv = hover !== null ? data[hover] : null;

  return (
    <div ref={ref} className="relative select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width={W} height={height} role="img" aria-label="Monthly profit and loss">
        <defs>
          <clipPath id="barsReveal">
            <rect x="0" y="0" width={mounted ? W : 0} height={height} style={{ transition: "width 0.7s cubic-bezier(0.22,1,0.36,1)" }} />
          </clipPath>
          <linearGradient id="profitGainGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SUCCESS} stopOpacity="0.75" />
            <stop offset="100%" stopColor={SUCCESS} stopOpacity="1" />
          </linearGradient>
          <linearGradient id="profitLossGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={DANGER} stopOpacity="0.75" />
            <stop offset="100%" stopColor={DANGER} stopOpacity="1" />
          </linearGradient>
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke={GRID} strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize={10} fill={AXIS_TEXT} className="font-mono">
              {compact(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) =>
          i % stride === 0 || i === n - 1 ? (
            <text key={i} x={cx(i)} y={height - 8} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>
              {d.label}
            </text>
          ) : null,
        )}

        <g clipPath="url(#barsReveal)">
          {data.map((d, i) => {
            const top = Math.min(y(d.value), zeroY);
            const h = Math.max(2, Math.abs(y(d.value) - zeroY));
            const positive = d.value >= 0;
            return (
              <rect
                key={i}
                x={cx(i) - barW / 2}
                y={top}
                width={barW}
                height={h}
                rx={3}
                fill={positive ? "url(#profitGainGrad)" : "url(#profitLossGrad)"}
                opacity={hover === null || hover === i ? 1 : 0.45}
                style={{ transition: "opacity 0.15s" }}
              />
            );
          })}
        </g>
      </svg>

      {hv && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 shadow-pop"
          style={{ left: Math.min(Math.max(cx(hover!), 66), W - 66), top: Math.min(y(hv.value), zeroY) - 10, transform: "translate(-50%,-100%)" }}
        >
          <p className="text-[11px] text-muted">{hv.label}</p>
          <p className={`font-mono text-[13px] font-semibold tabular-nums whitespace-nowrap ${hv.value >= 0 ? "text-success" : "text-danger"}`}>
            {hv.value >= 0 ? "Profit " : "Loss "}
            {formatMoney(Math.abs(hv.value))}
          </p>
          {hv.margin != null && (
            <p className="mt-0.5 text-[11px] text-muted">{hv.margin.toFixed(1)}% margin</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Cost composition — purchasing / expenses / salary as a share of total cost ──
export type DonutSlice = { label: string; value: number; color: string };

export function CostDonut({ data, height = 220 }: { data: DonutSlice[]; height?: number }) {
  const mounted = useMounted();
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((a, d) => a + d.value, 0);

  if (total <= 0) {
    return (
      <div className="grid place-items-center text-sm text-muted" style={{ height }}>
        No data yet
      </div>
    );
  }

  const size = height;
  const strokeW = 20;
  const R = size / 2 - strokeW / 2 - 2;
  const C = 2 * Math.PI * R;
  const cx = size / 2;
  const cy = size / 2;

  let acc = 0;
  const segments = data.map((d, i) => {
    const frac = d.value / total;
    const dash = mounted ? frac * C : 0;
    const offset = -acc * C;
    acc += frac;
    return { ...d, dash, offset, frac, i };
  });

  const hv = hover !== null ? segments[hover] : null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label="Cost composition">
          <circle cx={cx} cy={cy} r={R} fill="none" stroke={GRID} strokeWidth={strokeW} />
          {segments.map((s) => (
            <circle
              key={s.label}
              cx={cx}
              cy={cy}
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={strokeW}
              strokeDasharray={`${s.dash} ${Math.max(0, C - s.dash)}`}
              strokeDashoffset={s.offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              opacity={hover === null || hover === s.i ? 1 : 0.35}
              style={{ transition: "stroke-dasharray 0.7s cubic-bezier(0.22,1,0.36,1), opacity 0.15s", cursor: "pointer" }}
              onMouseEnter={() => setHover(s.i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="text-center px-2">
            <p className="text-[10px] text-muted uppercase tracking-wider truncate max-w-[8rem]">
              {hv ? hv.label : "Total cost"}
            </p>
            <p className="mt-0.5 font-mono text-lg font-semibold text-ink tabular-nums">
              {formatMoney(hv ? hv.value : total)}
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1 w-full space-y-2.5">
        {data.map((d, i) => (
          <div
            key={d.label}
            className="flex items-center justify-between gap-3 text-[13px] cursor-pointer"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="flex items-center gap-2 text-muted min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="flex items-center gap-2 flex-shrink-0">
              <span className="font-mono font-semibold text-ink tabular-nums">{formatMoney(d.value)}</span>
              <span className="text-muted text-[11px] w-9 text-right">
                {((d.value / total) * 100).toFixed(0)}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
