# Overview Stat-Card Sparklines — Design

## Context

This is a follow-up to the [PnL chart overhaul](2026-07-20-pnl-chart-overhaul-design.md), split out during that project's brainstorming as an independent piece of work. The team lead's original feedback was about PnL chart polish; separately, the owner wanted the Overview page's four stat cards (Sales, Purchasing, Expenses, Salary paid — `src/app/dashboard/page.tsx`) to show a small trend chart under each headline number, with "some kind of filtering."

Today, `src/app/dashboard/page.tsx` has a period toggle (Today / This month / All time) that rescopes the headline numbers via `stats.sales[period]` etc. (`PeriodTotals = { all, today, month }`, from `src/lib/dashboard-cache.ts`). The API route `src/app/api/dashboard-stats/route.ts` computes these three period sums per table in one SQL pass (`periodSums()`), plus a separate `monthlySales` array (sales only, full monthly history) that feeds the existing "Revenue trend" chart.

## Goals

1. Add a small sparkline under each of the four stat cards (Sales, Purchasing, Expenses, Salary paid), showing that category's trend at a granularity appropriate to the active period.
2. Extend the period toggle with a fourth option, **This year**, plus a year picker.
3. Do this with minimal backend surface — reuse data already fetched wherever the granularity allows it.

## Period → Granularity Mapping

| Period | Sparkline granularity |
|---|---|
| Today | Last 14 days, daily |
| This month | Days elapsed so far this month, daily |
| This year | January through the latest month with data in the selected year, monthly |
| All time | Full monthly history (same span as today's Revenue Trend chart) |

**Today** and **This month** need daily figures that don't exist anywhere yet — these require new SQL. **This year** and **All time** are both monthly — and critically, **This year" is always a subset of the same monthly series that "All time" needs**, so no separate query or endpoint is required for it: it's a client-side year-filter over the all-time monthly data, the same technique `filterPnlRows`'s `ytd` case already uses in the PnL work.

## API Changes — `/api/dashboard-stats`

No new endpoint. The route's response drops the existing `monthlySales` field (sales-only) and replaces it with a `sparklines` object covering all four categories at once:

```ts
type DailySparkPoint = { date: string; total: number };   // date = "YYYY-MM-DD"
type MonthlySparkPoint = { month: string; total: number }; // month = "YYYY-MM", same shape as today's monthlySales entries

type DailyCategorySparklines = {
  sales: DailySparkPoint[];
  purchasing: DailySparkPoint[];
  expenses: DailySparkPoint[];
  salary: DailySparkPoint[];
};

type MonthlyCategorySparklines = {
  sales: MonthlySparkPoint[];
  purchasing: MonthlySparkPoint[];
  expenses: MonthlySparkPoint[];
  salary: MonthlySparkPoint[];
};

type DashboardData = {
  stats: { /* unchanged */ };
  topBalances: [ /* unchanged */ ];
  sparklines: {
    today: DailyCategorySparklines;   // 14 points per category, zero-filled, oldest→newest
    month: DailyCategorySparklines;   // 1..N points (N = days elapsed this month), zero-filled
    all: MonthlyCategorySparklines;   // sparse monthly history, one entry per month that has any data across ANY category (see below)
  };
};
```

- `today` and `month` are **zero-filled**: every day in the window appears exactly once, even with zero activity, so the sparkline always has a continuous, evenly-spaced series to draw. Computed in SQL with `generate_series` joined against each table's per-day sum (`FILTER`/`GROUP BY date`), anchored to `Asia/Karachi` like the existing `periodSums()`.
- `all` stays **sparse** (only months where at least one of the four categories has activity), matching today's `monthlySales` convention — no zero-filling needed since "This year"/"All time" sparklines don't need perfectly even spacing the way daily ones do, and zero-filling years of empty months would bloat the payload for no visual benefit at this scale.
- All four categories share the same `all`-series month keys so the client doesn't need to reconcile independently-shaped arrays: the query unions the distinct months across `sales`/`purchasing`/`expenses`/`salary` and left-joins each table's monthly sum against that unioned month list (defaulting missing categories to 0 for a month another category has data in).
- The existing "Revenue trend" chart on the Overview page switches from reading `data.monthlySales` to `data.sparklines.all.sales`.

## Client-Side Year Handling (no backend involvement)

- **Available years** for the year `<select>`: the distinct `"YYYY"` prefixes across all four `sparklines.all` category arrays, unioned and sorted. Defaults to the latest available year (not necessarily the real-world current year, in case a fresh account has no current-year data yet).
- **"This year" sparkline** for a given category: filter that category's `sparklines.all` array to entries whose month starts with the selected year.
- **"This year" headline numbers** (the four stat cards' big figures, and the hero Net profit): sum the year-filtered `sparklines.all` arrays the same way the sparkline does — no new backend computation. This keeps `PeriodTotals` (`{ all, today, month }`) unchanged; "This year" is handled entirely as a derived client-side view over `sparklines.all`, not a fourth key requested from the server.

## Sparkline Component

New `Sparkline` component in `src/components/charts.tsx`, alongside the existing hand-rolled SVG charts, reusing the file's established conventions (`useMeasure`, `useMounted`, clip-path reveal, tooltip styling with `border-line`/`bg-surface`/`shadow-pop`).

- **Size:** compact — roughly 44px tall, fills the stat card's available width. No axis lines, gridlines, or x-axis labels (this is the key visual difference from `TrendChart`/`ProfitBars`/`SalesCostBars`).
- **Color:** Sales uses `ACCENT` (matching the existing Revenue Trend chart's color). Purchasing, Expenses, and Salary share one neutral grey tone (consistent with the "money out" framing already used in the stat cards' hint text) — distinguishing three cost sparklines by color isn't necessary since each already sits inside its own labeled card.
- **Hover tooltip:** on hover, shows the point's date (daily) or month (monthly) and its exact amount — same tooltip visual treatment as the other charts, just anchored to a much smaller chart area.
- **Zero/empty state:** if every value in the series is zero, or the series is empty (e.g. a category with literally no activity in the selected window), render a flat, low-opacity horizontal baseline instead of a "No data yet" text placeholder — quieter than a text message repeated across up to four cards, while still being honest that nothing happened.

## Overview Page Wiring

- The period toggle (`src/app/dashboard/page.tsx`) gains a fourth pill, **This year**. When active, a year `<select>` appears next to the pills (styled like the `RangeFilter` custom selects from the PnL work: `select !w-auto !py-1.5 !text-[12.5px]`), populated from the available-years list, defaulting to the latest year.
- Each of the four stat cards (`statCards` array) renders its `Sparkline` beneath the existing figure, fed by:
  - `today` → `sparklines.today[category]` mapped to display points (label = short date, e.g. "Jul 5")
  - `month` → `sparklines.month[category]` mapped similarly
  - `year` → `sparklines.all[category]` filtered to the selected year, mapped with month labels (`monthLabel`)
  - `all` → `sparklines.all[category]` in full, mapped with month labels
- The hero Net profit figure and the four stat-card headline numbers switch their source from `stats.<category>[period]` to a small `periodTotal(category, period, year)` helper when `period === "year"`, and continue reading `stats.<category>[period]` unchanged for `today`/`month`/`all` (no change to those three cases).

## Testing / Verification

No test framework exists in this repo (consistent with the PnL work). Verification:
- Pure logic (the year-filter/sum helpers, and the SQL zero-fill query results) checked via a disposable `tsx` script against representative fixture data, the same pattern used for `src/lib/pnl-range.ts`.
- UI verified manually via the dev server: cycle all four period options (including several different years), confirm each stat card's sparkline and headline number update together and match a hand-computed sum from the raw data; confirm the zero-activity flat-line state renders for a category with no data in a given window; confirm hover tooltips show correct dates/months and amounts; check mobile layout.
