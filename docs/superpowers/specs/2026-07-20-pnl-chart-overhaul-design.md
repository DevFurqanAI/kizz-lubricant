# PnL Chart Overhaul — Design

## Context

The team lead was not satisfied with the visual polish of the Profit & Loss page's charts. Today the page (`src/app/dashboard/pnl/page.tsx`) shows two hand-rolled SVG charts from `src/components/charts.tsx`:

- `ProfitBars` — diverging bar chart of monthly profit/loss around a zero baseline.
- `TrendChart` — a single-series area/line chart of sales only.

Both are custom SVG components (no charting library), following the "graphite-ember" design tokens (`ACCENT`, `SUCCESS`, `DANGER`, `GRID`, `AXIS_TEXT`) already defined at the top of `charts.tsx`. The `/pnl` API route already returns everything needed — full monthly history with `sales`, `purchasing`, `expenses`, `salary`, `totalCost`, `profit`, `margin` per month, plus grand totals — so this is a **frontend-only** change. No API or schema changes required.

This is a companion project to a separate, later spec covering Overview stat-card sparklines (Sales/Purchasing/Expenses/Salary mini-charts tied to the period toggle) — intentionally out of scope here.

## Goals

1. Replace the sales-only trend chart with a **Sales vs. Total Costs** comparison so the lead can see money-in vs. money-out at a glance.
2. Visually enrich the existing **Profit/Loss** bars (gradient fill, fuller tooltip, smoother feel) rather than replacing the concept.
3. Add a **Cost composition** chart (purchasing/expenses/salary mix) that didn't exist before.
4. Add a **range filter** (preset chips + custom month/year range) that scopes the charts, the monthly table, and the grand-total banner together.

## Components

All new chart components live in `src/components/charts.tsx`, next to the existing ones, and reuse its established patterns: the `useMeasure` / `useMounted` hooks, the `compact()` / `niceCeil()` axis-formatting helpers, and the existing color tokens. No charting library is introduced — consistent with the existing hand-rolled SVG approach.

### 1. `SalesCostBars` (new — replaces `TrendChart` on this page)

Grouped bar chart, one pair of bars per month: a sales bar and a total-cost bar side by side. `TrendChart` remains in `charts.tsx` for other callers (it's also used on the Overview page's revenue trend) — it is not deleted, just no longer used on the PnL page.

- Sales bar: `ACCENT` fill.
- Total-cost bar: a muted neutral tone (new token, e.g. `COST` = a grey-blue) so it doesn't compete visually with the profit/loss green/red vocabulary used elsewhere.
- Hover tooltip shows both figures plus the delta (profit) for that month, so it doesn't require cross-referencing the profit chart.
- Same reveal/hover interaction pattern as existing charts (clip-path width transition on mount, crosshair on hover).

### 2. `ProfitBars` (existing — enhanced in place)

Keep the diverging-bars-around-zero concept (it works and is well understood). Enhancements:

- Add a subtle vertical gradient inside each bar (full-opacity near the zero baseline fading slightly toward the tip) using the existing `SUCCESS`/`DANGER` tokens — same gradient technique already used for `TrendChart`'s fill (`<linearGradient>` defs).
- Tooltip gains the margin percentage for that month alongside the profit/loss figure (currently shows profit/loss only).
- No change to layout, sizing, or interaction model — purely a visual refinement.

### 3. `CostDonut` (new)

Donut chart showing purchasing/expenses/salary as a share of total cost, computed over whatever range is currently selected by the range filter (see below) — so it updates when the user changes the range, not fixed to all-time.

- Three arcs colored with new distinct-but-muted tokens (avoid clashing with the SUCCESS/DANGER/ACCENT semantic colors, which are reserved for profit/loss and sales elsewhere).
- Center label shows the total cost figure for the selected range.
- A plain-language legend beside the donut (colored dot + label + amount + percentage) — consistent with the "no cryptic kickers, decode color with a legend" pattern already used elsewhere (customer balance legend on the Overview page).
- If total cost is zero for the selected range (no data), render the existing `EmptyState`-style "No data yet" placeholder used by other charts.

## Range Filter

New component, `RangeFilter`, rendered above the chart grid on the PnL page; its selection scopes the charts, the monthly table, and the grand-total banner together — one control, everything in sync.

### UI

- Preset pill row, visually matching the existing period-toggle pills on the Overview page (`bg-accent text-white` active state): `6M` `12M` `YTD` `All`.
- A `Custom` pill that, when active, reveals two inline `<select>` pairs (From month/year, To month/year), populated only from months actually present in `data.rows` (no dates outside the real data range are selectable).
- Default state on page load: `All` (matches today's behavior — no persistence in this iteration).

### State & data flow

```ts
type RangeSelection =
  | { preset: "6m" | "12m" | "ytd" | "all" }
  | { preset: "custom"; from: string; to: string }; // "YYYY-MM"

const [range, setRange] = useState<RangeSelection>({ preset: "all" });
const filteredRows = useMemo(() => filterRows(data?.rows ?? [], range), [data, range]);
const filteredGrand = useMemo(() => recomputeGrand(filteredRows), [filteredRows]);
```

- `filterRows` slices `data.rows` (already sorted by month) according to the preset:
  - `6m` / `12m`: last N months present in the data (not calendar months — if fewer than N months of history exist, show all of them).
  - `ytd`: months in the current calendar year up to the latest month present.
  - `all`: no filtering.
  - `custom`: inclusive slice between `from` and `to`.
- `recomputeGrand` re-sums `filteredRows` the same way the API's `grand` reducer already does (mirrors the logic in `src/app/api/pnl/route.ts`, duplicated client-side since it's a simple reduce over already-fetched data — not worth a round-trip).
- The grand-total banner, all three charts, the monthly table, and the Excel export all read from `filteredRows` / `filteredGrand` instead of `data.rows` / `data.grand` — the export mirrors exactly what's on screen for the active range.

### Edge cases

- Zero months of data: filter row doesn't render (charts already show "No data yet" — same as today).
- Exactly 1 month of data: all presets collapse to that single month; charts render single-bar/single-point states (already handled by existing `n === 0` / `n <= 1` guards in `charts.tsx`).
- Custom range where `from` > `to`: swap them before filtering, don't error.

## Testing / Verification

No existing unit tests cover `charts.tsx` (it's presentational/interactive SVG code) or the PnL page. Verification is manual, via the `run` skill:

- Load the PnL page in the dev server and check each chart renders correctly against the underlying monthly data (spot-check tooltip figures against the table).
- Cycle through all range-filter presets and a custom range; confirm charts, table, and grand-total banner update together and stay consistent with each other.
- Verify donut percentages sum to 100% and the center total matches the sum of the three cost categories for the selected range.
- Check empty states: no data at all, and a custom range that lands on zero months.
- Check responsive behavior at mobile width (the existing grid already collapses to a single column below `xl`).
- Confirm the Excel export reflects the currently active range filter (rows and grand total match what's on screen), including the exported filename or a sheet note indicating the range covered.
