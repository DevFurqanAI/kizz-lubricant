# PnL Chart Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PnL page's sales-only trend chart with a richer, filterable chart set (Sales vs. Costs, enhanced Profit/Loss, Cost composition donut) plus a range filter that scopes the charts, table, grand-total banner, and Excel export together.

**Architecture:** Pure frontend change. `/api/pnl` already returns full monthly history in one call — no API or schema changes. New chart components are added to the existing hand-rolled SVG chart file (`src/components/charts.tsx`), a new pure-logic module (`src/lib/pnl-range.ts`) handles filtering/summing so it's testable without React, a new `RangeFilter` UI component drives the selection, and `src/app/dashboard/pnl/page.tsx` wires it all together. The existing Excel export builder (`src/lib/reports-xlsx.ts`) gets a small addition so the export can carry a range note.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS ("graphite-ember" design tokens in `tailwind.config.ts`), hand-rolled SVG charts (no charting library), ExcelJS for exports.

## Global Constraints

- No new charting library — every chart is hand-rolled SVG, following the existing patterns in `src/components/charts.tsx` (`useMeasure`, `useMounted`, `niceCeil`, `compact`, clip-path reveal transitions, hover tooltips styled with `border-line`/`bg-surface`/`shadow-pop`).
- No API or schema changes — `/api/pnl` (`src/app/api/pnl/route.ts`) already returns everything needed.
- Reuse existing design tokens: `ACCENT = "#E2540C"`, `SUCCESS = "#15914B"`, `DANGER = "#DC2626"`, `GRID = "rgba(38,38,47,0.08)"`, `AXIS_TEXT = "#9A9AA6"` (all defined at the top of `charts.tsx`). New tokens must sit outside the `ACCENT`/`SUCCESS`/`DANGER` family so they don't get confused with the profit/loss and sales semantics used elsewhere.
- The range filter's pill styling must visually match the existing period-toggle pills used on `src/app/dashboard/page.tsx` (`bg-accent text-white` active state, `border-line-strong` container).
- Filter selection is **not persisted** (no URL/localStorage) — defaults to "All" on every page load.
- The Excel export must mirror whatever range is currently selected on screen (rows, grand total, and a note stating the range) — not always full history.
- No test framework exists in this repo (`package.json` has no `test` script, no jest/vitest). Pure logic (`src/lib/pnl-range.ts`) is verified with disposable `tsx` scripts run from the command line (mirroring how `scripts/seed.ts` is already run via `tsx`) rather than a committed test suite. UI is verified manually via the dev server, per the `run` skill.

---

### Task 1: Add cost-composition tokens and the `SalesCostBars` chart

**Files:**
- Modify: `src/components/charts.tsx:1-11` (tokens), append new component after `TrendChart` (after line 159)

**Interfaces:**
- Produces: `export type SalesCostPoint = { label: string; sales: number; cost: number }`
- Produces: `export function SalesCostBars({ data, height }: { data: SalesCostPoint[]; height?: number })`
- Produces: `export const COST_NEUTRAL = "#7C8698"` (total-cost bar color, reused nowhere else yet)
- Produces: `export const COST_PURCHASING = "#B8790C"`, `export const COST_EXPENSES = "#2563EB"`, `export const COST_SALARY = "#0891B2"` (consumed by Task 3's `CostDonut` and Task 7's wiring)

- [ ] **Step 1: Add the new color tokens**

In `src/components/charts.tsx`, the token block currently reads:

```ts
const ACCENT = "#E2540C";
const SUCCESS = "#15914B";
const DANGER = "#DC2626";
const GRID = "rgba(38,38,47,0.08)";
const AXIS_TEXT = "#9A9AA6";
```

Replace it with:

```ts
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
```

- [ ] **Step 2: Add the `SalesCostBars` component**

Append this after the closing brace of `TrendChart` (i.e. right after line 159, before the `// ── Monthly profit / loss ──` comment that precedes `ProfitBars`):

```tsx
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
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new type errors (the file already imports everything `SalesCostBars` needs: `useState`, `formatMoney`, plus the module-local `useMeasure`/`useMounted`/`niceCeil`/`compact`/`xLabelStride` helpers already defined earlier in the file).

- [ ] **Step 4: Commit**

```bash
git add src/components/charts.tsx
git commit -m "Add SalesCostBars chart and cost-family color tokens"
```

---

### Task 2: Enhance `ProfitBars` with a gradient fill and margin in the tooltip

**Files:**
- Modify: `src/components/charts.tsx:162-264` (the existing `ProfitBars` component)

**Interfaces:**
- Consumes: `SUCCESS`, `DANGER` tokens (already in the file, Task 1 doesn't change them)
- Produces: `export type ProfitPoint = ChartPoint & { margin?: number }` — `ProfitBars` now accepts `ProfitPoint[]` (a superset of `ChartPoint`, so any existing caller passing plain `ChartPoint[]` still type-checks since `margin` is optional)

- [ ] **Step 1: Add the `ProfitPoint` type and update the signature**

Find:

```tsx
// ── Monthly profit / loss — diverging bars anchored to a zero baseline ──
export function ProfitBars({ data, height = 220 }: { data: ChartPoint[]; height?: number }) {
```

Replace with:

```tsx
// ── Monthly profit / loss — diverging bars anchored to a zero baseline ──
export type ProfitPoint = ChartPoint & { margin?: number };

export function ProfitBars({ data, height = 220 }: { data: ProfitPoint[]; height?: number }) {
```

- [ ] **Step 2: Add gradient defs**

Find (inside `ProfitBars`, in the `<defs>` block):

```tsx
        <defs>
          <clipPath id="barsReveal">
            <rect x="0" y="0" width={mounted ? W : 0} height={height} style={{ transition: "width 0.7s cubic-bezier(0.22,1,0.36,1)" }} />
          </clipPath>
        </defs>
```

Replace with:

```tsx
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
```

- [ ] **Step 3: Use the gradient fill instead of a solid color**

Find:

```tsx
              <rect
                key={i}
                x={cx(i) - barW / 2}
                y={top}
                width={barW}
                height={h}
                rx={3}
                fill={positive ? SUCCESS : DANGER}
                opacity={hover === null || hover === i ? 1 : 0.45}
                style={{ transition: "opacity 0.15s" }}
              />
```

Replace with:

```tsx
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
```

- [ ] **Step 4: Show margin in the tooltip**

Find:

```tsx
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
        </div>
      )}
```

Replace with:

```tsx
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
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/charts.tsx
git commit -m "Enhance ProfitBars with gradient fill and margin tooltip"
```

---

### Task 3: Add the `CostDonut` component

**Files:**
- Modify: `src/components/charts.tsx` — append after `ProfitBars` (end of file)

**Interfaces:**
- Consumes: `COST_NEUTRAL`, `COST_PURCHASING`, `COST_EXPENSES`, `COST_SALARY` (Task 1), `formatMoney` (already imported), `useMounted` (already defined in-file)
- Produces: `export type DonutSlice = { label: string; value: number; color: string }`, `export function CostDonut({ data, height }: { data: DonutSlice[]; height?: number })`

- [ ] **Step 1: Append the component**

Add at the end of `src/components/charts.tsx` (after the closing brace of `ProfitBars`):

```tsx

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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/charts.tsx
git commit -m "Add CostDonut chart for cost composition"
```

---

### Task 4: Pure range-filtering logic (`src/lib/pnl-range.ts`)

**Files:**
- Create: `src/lib/pnl-range.ts`

**Interfaces:**
- Produces: `export type PnlMonthRow = { month: string; sales: number; purchasing: number; expenses: number; salary: number; totalCost: number; profit: number; margin: number }` (mirrors the shape returned by `/api/pnl` and already used as `MonthRow` in `pnl/page.tsx` — this becomes the shared name so Task 7 can import it instead of redefining `MonthRow` locally)
- Produces: `export type RangeSelection = { preset: "6m" | "12m" | "ytd" | "all" } | { preset: "custom"; from: string; to: string }`
- Produces: `export function filterPnlRows(rows: PnlMonthRow[], range: RangeSelection): PnlMonthRow[]`
- Produces: `export function recomputePnlGrand(rows: PnlMonthRow[]): Omit<PnlMonthRow, "month">`
- Produces: `export function describeRange(range: RangeSelection): string` (e.g. `"last 6 months"`, `"year to date"`, `"selected range"`, `"all time"`)

- [ ] **Step 1: Write the module**

Create `src/lib/pnl-range.ts`:

```ts
export type PnlMonthRow = {
  month: string; // "YYYY-MM"
  sales: number;
  purchasing: number;
  expenses: number;
  salary: number;
  totalCost: number;
  profit: number;
  margin: number;
};

export type RangeSelection =
  | { preset: "6m" | "12m" | "ytd" | "all" }
  | { preset: "custom"; from: string; to: string };

/** Slice already-sorted (or unsorted) monthly PnL rows down to the selected range. */
export function filterPnlRows(rows: PnlMonthRow[], range: RangeSelection): PnlMonthRow[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));

  switch (range.preset) {
    case "all":
      return sorted;
    case "6m":
      return sorted.slice(-6);
    case "12m":
      return sorted.slice(-12);
    case "ytd": {
      const latestYear = sorted[sorted.length - 1].month.slice(0, 4);
      return sorted.filter((r) => r.month.slice(0, 4) === latestYear);
    }
    case "custom": {
      let { from, to } = range;
      if (from > to) [from, to] = [to, from];
      return sorted.filter((r) => r.month >= from && r.month <= to);
    }
  }
}

/** Re-sum a slice of monthly rows the same way the /api/pnl grand-total reducer does. */
export function recomputePnlGrand(rows: PnlMonthRow[]): Omit<PnlMonthRow, "month"> {
  const grand = rows.reduce(
    (acc, r) => {
      acc.sales += r.sales;
      acc.purchasing += r.purchasing;
      acc.expenses += r.expenses;
      acc.salary += r.salary;
      acc.totalCost += r.totalCost;
      acc.profit += r.profit;
      return acc;
    },
    { sales: 0, purchasing: 0, expenses: 0, salary: 0, totalCost: 0, profit: 0 },
  );
  const margin = grand.sales > 0 ? (grand.profit / grand.sales) * 100 : 0;
  return { ...grand, margin };
}

/** Plain-language description of the active range, for banner copy. */
export function describeRange(range: RangeSelection): string {
  switch (range.preset) {
    case "all": return "all time";
    case "6m": return "last 6 months";
    case "12m": return "last 12 months";
    case "ytd": return "year to date";
    case "custom": return "selected range";
  }
}
```

- [ ] **Step 2: Write a disposable verification script and run it**

Create `C:\Users\arsha\AppData\Local\Temp\claude\C--Users-arsha-Documents-Internship-Projects-kizz-lubricants\a44c0a99-186e-4344-b6eb-25a0e1efe55b\scratchpad\verify-pnl-range.ts`:

```ts
import { filterPnlRows, recomputePnlGrand, describeRange, type PnlMonthRow } from "../../../../../../../../../Documents/Internship Projects/kizz-lubricants/src/lib/pnl-range";

const rows: PnlMonthRow[] = ["2025-01","2025-02","2025-03","2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02"]
  .map((month, i) => ({ month, sales: 1000 + i * 10, purchasing: 200, expenses: 100, salary: 300, totalCost: 600, profit: 400 + i * 10, margin: 0 }));

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`FAIL ${label}: expected ${e}, got ${a}`);
  console.log(`PASS ${label}`);
}

assertEqual(filterPnlRows(rows, { preset: "6m" }).map((r) => r.month), ["2025-09","2025-10","2025-11","2025-12","2026-01","2026-02"], "6m slice");
assertEqual(filterPnlRows(rows, { preset: "12m" }).length, 12, "12m slice length");
assertEqual(filterPnlRows(rows, { preset: "ytd" }).map((r) => r.month), ["2026-01","2026-02"], "ytd uses latest year in data");
assertEqual(filterPnlRows(rows, { preset: "all" }).length, 14, "all returns everything");
assertEqual(filterPnlRows(rows, { preset: "custom", from: "2025-11", to: "2025-09" }).map((r) => r.month), ["2025-09","2025-10","2025-11"], "custom swaps reversed from/to");
assertEqual(filterPnlRows([], { preset: "all" }), [], "empty rows returns empty");

const grand = recomputePnlGrand(filterPnlRows(rows, { preset: "6m" }));
assertEqual(grand.purchasing, 200 * 6, "recomputePnlGrand sums purchasing over the filtered slice");
assertEqual(recomputePnlGrand([]).margin, 0, "recomputePnlGrand on empty rows has zero margin, no divide-by-zero");

assertEqual(describeRange({ preset: "ytd" }), "year to date", "describeRange ytd copy");

console.log("All pnl-range checks passed.");
```

Run: `npx tsx "C:\Users\arsha\AppData\Local\Temp\claude\C--Users-arsha-Documents-Internship-Projects-kizz-lubricants\a44c0a99-186e-4344-b6eb-25a0e1efe55b\scratchpad\verify-pnl-range.ts"`

Expected: every line prints `PASS ...`, ending with `All pnl-range checks passed.` If any line throws `FAIL ...`, fix `src/lib/pnl-range.ts` and re-run before moving on — this is the test-first gate for this task's pure logic.

*(Note: adjust the relative import path in the script if your working directory differs — it must resolve to `src/lib/pnl-range.ts` in the project.)*

- [ ] **Step 3: Delete the scratch script** (it's verification-only, not part of the codebase)

- [ ] **Step 4: Commit**

```bash
git add src/lib/pnl-range.ts
git commit -m "Add pure PnL range-filtering and grand-total logic"
```

---

### Task 5: `RangeFilter` UI component

**Files:**
- Create: `src/components/range-filter.tsx`

**Interfaces:**
- Consumes: `PnlMonthRow`, `RangeSelection` (Task 4), `monthLabel`, `cn` (already in `src/lib/utils.ts`)
- Produces: `export function RangeFilter({ rows, value, onChange }: { rows: PnlMonthRow[]; value: RangeSelection; onChange: (v: RangeSelection) => void })`

- [ ] **Step 1: Write the component**

Create `src/components/range-filter.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { monthLabel, cn } from "@/lib/utils";
import type { PnlMonthRow, RangeSelection } from "@/lib/pnl-range";

const PRESETS: { key: "6m" | "12m" | "ytd" | "all"; label: string }[] = [
  { key: "6m", label: "6M" },
  { key: "12m", label: "12M" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All" },
];

export function RangeFilter({
  rows,
  value,
  onChange,
}: {
  rows: PnlMonthRow[];
  value: RangeSelection;
  onChange: (v: RangeSelection) => void;
}) {
  const months = useMemo(() => [...rows.map((r) => r.month)].sort(), [rows]);
  const [customFrom, setCustomFrom] = useState(months[0] ?? "");
  const [customTo, setCustomTo] = useState(months[months.length - 1] ?? "");

  const isCustom = value.preset === "custom";

  function applyCustom(from: string, to: string) {
    setCustomFrom(from);
    setCustomTo(to);
    onChange({ preset: "custom", from, to });
  }

  if (months.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface p-0.5 shadow-btn">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onChange({ preset: p.key })}
            aria-pressed={value.preset === p.key}
            className={cn(
              "px-3 py-1.5 text-[12.5px] font-medium rounded-md transition-colors",
              value.preset === p.key ? "bg-accent text-white shadow-btn" : "text-muted hover:text-ink",
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => applyCustom(customFrom || months[0], customTo || months[months.length - 1])}
          aria-pressed={isCustom}
          className={cn(
            "px-3 py-1.5 text-[12.5px] font-medium rounded-md transition-colors",
            isCustom ? "bg-accent text-white shadow-btn" : "text-muted hover:text-ink",
          )}
        >
          Custom
        </button>
      </div>
      {isCustom && (
        <div className="flex items-center gap-2">
          <select
            className="select !w-auto !py-1.5 !text-[12.5px]"
            value={customFrom}
            onChange={(e) => applyCustom(e.target.value, customTo)}
          >
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
          <span className="text-faint text-[12px]">to</span>
          <select
            className="select !w-auto !py-1.5 !text-[12.5px]"
            value={customTo}
            onChange={(e) => applyCustom(customFrom, e.target.value)}
          >
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/range-filter.tsx
git commit -m "Add RangeFilter component for the PnL page"
```

---

### Task 6: Let `buildPnlXlsx` carry a range note

**Files:**
- Modify: `src/lib/reports-xlsx.ts:345-373`

**Interfaces:**
- Consumes: existing `buildReportBlob`'s `filterNote` option (already supported by `ReportOptions`, already used by `buildSalesXlsx` etc. — `buildPnlXlsx` is the only report builder that doesn't yet pass it through)
- Produces: `export async function buildPnlXlsx(rows: PnlMonthRow[], grand: PnlGrand, filterNote?: string): Promise<Blob>` (adds an optional 3rd parameter — existing callers passing only 2 args still compile)

- [ ] **Step 1: Add the parameter**

Find:

```ts
export async function buildPnlXlsx(rows: PnlMonthRow[], grand: PnlGrand): Promise<Blob> {
  const profitColor = (p: number) => (p >= 0 ? GREEN : DANGER);
  return buildReportBlob<PnlMonthRow>({
    subtitle: "PROFIT & LOSS REPORT",
    sheetName: "P&L",
    columns: [
```

Replace with:

```ts
export async function buildPnlXlsx(rows: PnlMonthRow[], grand: PnlGrand, filterNote?: string): Promise<Blob> {
  const profitColor = (p: number) => (p >= 0 ? GREEN : DANGER);
  return buildReportBlob<PnlMonthRow>({
    subtitle: "PROFIT & LOSS REPORT",
    sheetName: "P&L",
    filterNote,
    columns: [
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports-xlsx.ts
git commit -m "Let buildPnlXlsx carry an optional range filter note"
```

---

### Task 7: Wire the range filter and new charts into the PnL page

**Files:**
- Modify: `src/app/dashboard/pnl/page.tsx`

**Interfaces:**
- Consumes: `filterPnlRows`, `recomputePnlGrand`, `describeRange`, `PnlMonthRow`, `RangeSelection` (Task 4); `RangeFilter` (Task 5); `SalesCostBars`, `CostDonut`, `ProfitBars` (now taking `ProfitPoint[]`), `COST_PURCHASING`, `COST_EXPENSES`, `COST_SALARY` (Tasks 1–3); `buildPnlXlsx(rows, grand, filterNote?)` (Task 6)

- [ ] **Step 1: Update imports and drop the local `MonthRow`/`PnlData` duplication**

Find:

```tsx
import { EmptyState, ErrorState } from "@/components/states";
import { ProfitBars, TrendChart } from "@/components/charts";
import { useToast } from "@/components/toast";
import { BarChart3, FileSpreadsheet } from "lucide-react";

type MonthRow = {
  month: string;
  sales: number;
  purchasing: number;
  expenses: number;
  salary: number;
  totalCost: number;
  profit: number;
  margin: number;
};

type PnlData = {
  rows: MonthRow[];
  grand: { sales: number; purchasing: number; expenses: number; salary: number; totalCost: number; profit: number; margin: number };
};
```

Replace with:

```tsx
import { EmptyState, ErrorState } from "@/components/states";
import { ProfitBars, SalesCostBars, CostDonut, COST_PURCHASING, COST_EXPENSES, COST_SALARY } from "@/components/charts";
import { RangeFilter } from "@/components/range-filter";
import { filterPnlRows, recomputePnlGrand, describeRange, type PnlMonthRow, type RangeSelection } from "@/lib/pnl-range";
import { useToast } from "@/components/toast";
import { BarChart3, FileSpreadsheet } from "lucide-react";

type MonthRow = PnlMonthRow;

type PnlData = {
  rows: MonthRow[];
  grand: Omit<MonthRow, "month">;
};
```

- [ ] **Step 2: Add range state and derived (filtered) data, right after the existing hooks**

Find:

```tsx
  const [data, setData] = useState<PnlData | null>(cached0 ?? null);
  const [loading, setLoading] = useState(!cached0);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();
```

Replace with:

```tsx
  const [data, setData] = useState<PnlData | null>(cached0 ?? null);
  const [loading, setLoading] = useState(!cached0);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [range, setRange] = useState<RangeSelection>({ preset: "all" });
  const toast = useToast();

  const filteredRows = useMemo(() => filterPnlRows(data?.rows ?? [], range), [data, range]);
  const filteredGrand = useMemo(() => recomputePnlGrand(filteredRows), [filteredRows]);
```

Add `useMemo` to the React import at the top of the file — find:

```tsx
import { useState, useEffect, useCallback } from "react";
```

Replace with:

```tsx
import { useState, useEffect, useCallback, useMemo } from "react";
```

- [ ] **Step 3: Replace the `g`/`isProfit` computation to use the filtered grand total**

Find:

```tsx
  const g = data?.grand;
  const isProfit = (g?.profit ?? 0) >= 0;
```

Replace with:

```tsx
  const g = filteredGrand;
  const isProfit = g.profit >= 0;
```

- [ ] **Step 4: Update `exportXlsx` to export the filtered range with a note**

Find:

```tsx
  const exportXlsx = async () => {
    if (!data || !g) return;
    setExporting(true);
    try {
      const { buildPnlXlsx } = await import("@/lib/reports-xlsx");
      const blob = await buildPnlXlsx(data.rows, g);
      await saveOrShareBlob(blob, `profit_loss_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast.error("Couldn't export profit & loss");
    } finally {
      setExporting(false);
    }
  };
```

Replace with:

```tsx
  const exportXlsx = async () => {
    if (!data || filteredRows.length === 0) return;
    setExporting(true);
    try {
      const { buildPnlXlsx } = await import("@/lib/reports-xlsx");
      const blob = await buildPnlXlsx(filteredRows, g, `Range: ${describeRange(range)}`);
      const rangeSuffix =
        range.preset === "custom" ? `${range.from}_to_${range.to}` : range.preset;
      await saveOrShareBlob(blob, `profit_loss_export_${rangeSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast.error("Couldn't export profit & loss");
    } finally {
      setExporting(false);
    }
  };
```

- [ ] **Step 5: Disable/guard the export button on the filtered count, and add the `RangeFilter` above the grand-total banner**

Find:

```tsx
        {data && data.rows.length > 0 && (
          <button onClick={exportXlsx} disabled={exporting} className="btn-secondary">
            <FileSpreadsheet className="w-4 h-4" strokeWidth={2} />
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
        )}
      </div>

      {/* Grand total banner */}
      {g && (
        <div className="card p-6">
          <div className="flex items-center gap-2">
            <span className={`badge ${isProfit ? "bg-success-tint text-success" : "bg-danger-tint text-danger"}`}>
              {isProfit ? "Overall Net Profit" : "Overall Net Loss"}
            </span>
            <span className="text-xs text-muted">{g.margin.toFixed(1)}% margin — all time</span>
          </div>
```

Replace with:

```tsx
        {data && data.rows.length > 0 && (
          <button onClick={exportXlsx} disabled={exporting || filteredRows.length === 0} className="btn-secondary">
            <FileSpreadsheet className="w-4 h-4" strokeWidth={2} />
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
        )}
      </div>

      {data && data.rows.length > 0 && (
        <RangeFilter rows={data.rows} value={range} onChange={setRange} />
      )}

      {/* Grand total banner — reflects the active range filter */}
      {data && (
        <div className="card p-6">
          <div className="flex items-center gap-2">
            <span className={`badge ${isProfit ? "bg-success-tint text-success" : "bg-danger-tint text-danger"}`}>
              {isProfit ? "Net Profit" : "Net Loss"}
            </span>
            <span className="text-xs text-muted">{g.margin.toFixed(1)}% margin — {describeRange(range)}</span>
          </div>
```

- [ ] **Step 6: Replace the chart grid (Sales trend → Sales vs. Costs, richer Profit/Loss tooltip data, and the new Cost composition donut)**

Find:

```tsx
      {/* Charts — profit/loss per month + sales momentum */}
      {data && data.rows.length > 1 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="card overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-line">
              <h2 className="text-[15px] font-semibold text-ink">Monthly profit / loss</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">
                <span className="text-success font-medium">Green</span> = profit,{" "}
                <span className="text-danger font-medium">red</span> = loss, each month.
              </p>
            </div>
            <div className="p-3 sm:p-4">
              <ProfitBars data={data.rows.map((r) => ({ label: monthLabel(r.month), value: r.profit }))} />
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-line">
              <h2 className="text-[15px] font-semibold text-ink">Sales trend</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">Total sales billed each month.</p>
            </div>
            <div className="p-3 sm:p-4">
              <TrendChart data={data.rows.map((r) => ({ label: monthLabel(r.month), value: r.sales }))} />
            </div>
          </div>
        </div>
      )}
```

Replace with:

```tsx
      {/* Charts — sales vs. costs, profit/loss per month, and the cost mix */}
      {filteredRows.length > 1 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="card overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-line">
              <h2 className="text-[15px] font-semibold text-ink">Sales vs. costs</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">
                <span className="text-accent font-medium">Orange</span> = sales,{" "}
                <span className="font-medium text-muted">grey</span> = total cost, each month.
              </p>
            </div>
            <div className="p-3 sm:p-4">
              <SalesCostBars data={filteredRows.map((r) => ({ label: monthLabel(r.month), sales: r.sales, cost: r.totalCost }))} />
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-line">
              <h2 className="text-[15px] font-semibold text-ink">Monthly profit / loss</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">
                <span className="text-success font-medium">Green</span> = profit,{" "}
                <span className="text-danger font-medium">red</span> = loss, each month.
              </p>
            </div>
            <div className="p-3 sm:p-4">
              <ProfitBars data={filteredRows.map((r) => ({ label: monthLabel(r.month), value: r.profit, margin: r.margin }))} />
            </div>
          </div>
        </div>
      )}

      {filteredRows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-line">
            <h2 className="text-[15px] font-semibold text-ink">Cost composition</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">Where your money went, {describeRange(range)}.</p>
          </div>
          <div className="p-5 sm:p-6">
            <CostDonut
              data={[
                { label: "Purchasing", value: g.purchasing, color: COST_PURCHASING },
                { label: "Expenses", value: g.expenses, color: COST_EXPENSES },
                { label: "Salary", value: g.salary, color: COST_SALARY },
              ]}
            />
          </div>
        </div>
      )}
```

- [ ] **Step 7: Point the monthly table at `filteredRows` instead of `data.rows`, and the footer at `g`**

Find:

```tsx
            <tbody className="divide-y divide-line">
              {!data || data.rows.length === 0 ? (
```

Replace with:

```tsx
            <tbody className="divide-y divide-line">
              {filteredRows.length === 0 ? (
```

Find:

```tsx
              ) : data.rows.map((r) => {
```

Replace with:

```tsx
              ) : filteredRows.map((r) => {
```

Find:

```tsx
            {g && data && data.rows.length > 0 && (
              <tfoot>
```

Replace with:

```tsx
            {data && filteredRows.length > 0 && (
              <tfoot>
```

- [ ] **Step 8: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors. (If `TrendChart` is now unused anywhere else in this file, TypeScript won't error on an unused import here since it was already removed from the import line in Step 1 — confirm no other reference to `TrendChart` remains in `pnl/page.tsx`.)

- [ ] **Step 9: Commit**

```bash
git add src/app/dashboard/pnl/page.tsx
git commit -m "Wire range filter and new chart set into the PnL page"
```

---

### Task 8: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Use the `run` skill (or `npm run dev` directly) to launch the app and open `/dashboard/pnl` in a browser.

- [ ] **Step 2: Verify chart rendering against real data**

Confirm all three charts render (Sales vs. Costs, Profit/Loss, Cost composition) and that hovering each shows a tooltip whose figures match the corresponding row in the table below.

- [ ] **Step 3: Cycle through every range filter preset**

Click `6M`, `12M`, `YTD`, `All`, and `Custom` (picking a couple of different From/To months). Confirm on each: the grand-total banner, all three charts, and the table all change together and stay consistent with each other (e.g. the banner's total cost equals the donut's center total equals the sum of the table's "Total Cost" column for the visible rows).

- [ ] **Step 4: Verify edge cases**

- A custom range that lands on a single month — charts should show single-bar/single-slice states without crashing (`SalesCostBars`/`ProfitBars` already guard `n <= 1`, `CostDonut` doesn't depend on month count).
- If the account currently has fewer months of history than a preset (e.g. only 3 months but `12M` selected) — confirm it shows all available months rather than erroring.

- [ ] **Step 5: Verify the Excel export respects the filter**

With a non-"All" preset active (e.g. `6M`), click "Export Excel". Open the downloaded file and confirm: the row count matches the filtered table, the grand total matches the on-screen banner, and the generated-note row mentions the active range (e.g. "Range: last 6 months"). Confirm the filename includes the range suffix (e.g. `profit_loss_export_6m_2026-07-20.xlsx`).

- [ ] **Step 6: Verify responsive layout**

Resize the browser to mobile width and confirm the chart grid collapses to a single column (existing `xl:grid-cols-2` behavior) and the `CostDonut` legend stacks below the ring (`flex-col sm:flex-row`).

- [ ] **Step 7: Final commit** (only if any fixes were needed during verification)

```bash
git add -A
git commit -m "Fix issues found during PnL chart overhaul verification"
```
