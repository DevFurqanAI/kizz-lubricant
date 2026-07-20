# Overview Stat-Card Sparklines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small trend sparkline under each of the four Overview stat cards (Sales, Purchasing, Expenses, Salary paid), and extend the period toggle with a "This year" option (+ year picker), reusing one backend payload for every granularity instead of adding a second endpoint.

**Architecture:** `/api/dashboard-stats` gains zero-filled daily series (last 14 days, month-to-date) and a sparse monthly series (full history) for all four money categories, replacing the existing sales-only `monthlySales` field. "This year" needs no backend support at all — it's a client-side filter over the same monthly series used for "All time", mirroring the year-filter technique already used in `src/lib/pnl-range.ts`. A new compact `Sparkline` chart (no axes/gridlines, small hover tooltip) is added to `src/components/charts.tsx` alongside the existing hand-rolled SVG charts.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS ("graphite-ember" tokens), hand-rolled SVG charts (no charting library), Drizzle ORM raw `sql` queries against Postgres (Neon).

## Global Constraints

- No new API endpoint — everything lives inside the existing `/api/dashboard-stats` route.
- No new charting library — the `Sparkline` component is hand-rolled SVG, reusing `useMeasure`, `useMounted`, `niceCeil`, and the existing tooltip visual treatment (`border-line`/`bg-surface`/`shadow-pop`) already established in `src/components/charts.tsx`.
- Reuse existing color tokens: Sales sparklines use `ACCENT = "#E2540C"`; Purchasing/Expenses/Salary sparklines share `COST_NEUTRAL = "#7C8698"` (already exported from `charts.tsx` from the prior PnL work) — no new colors introduced.
- "Today"/"this month" windows are anchored to `Asia/Karachi`, matching the existing `periodSums()` convention in the route — not the server's UTC day.
- A sparkline whose entire series is zero (or empty) renders a flat, low-opacity baseline — never a "No data yet" text placeholder (that convention is reserved for the larger PnL-style charts).
- Sparklines have a hover tooltip showing the exact date/month and amount (confirmed design decision — not purely decorative).
- No test framework exists in this repo (no jest/vitest, no `test` script). Pure logic (`src/lib/overview-sparklines.ts`) is verified with a disposable `tsx` script (same pattern as `src/lib/pnl-range.ts`'s verification in the prior PnL work) rather than a committed test suite. The new SQL was already hand-verified against the real dev database while writing this plan — confirmed row counts: 14 rows for the "today" window, 20 rows for "month-to-date" (July, day 20), 7 sparse rows for "all monthly" (Dec 2025–Jun 2026) — matching the data used throughout the PnL work.

---

### Task 1: Extend `/api/dashboard-stats` with sparkline series

**Files:**
- Modify: `src/app/api/dashboard-stats/route.ts` (full-file rewrite — the existing file is ~89 lines; the new version below is the complete replacement)

**Interfaces:**
- Produces: the route's JSON response gains a `sparklines: { today, month, all }` field (each `{ sales, purchasing, expenses, salary }`, with `today`/`month` holding `{ date: string; total: number }[]` and `all` holding `{ month: string; total: number }[]`), and drops the previous `monthlySales` field entirely.

- [ ] **Step 1: Replace the entire route file**

Replace the full contents of `src/app/api/dashboard-stats/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { sales, purchasing, expenses, salary, customers } from "@/db/schema";
import { sql, type SQL } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Sum a money table across three time windows in one pass. "Today" and "this
// month" are anchored to Asia/Karachi so they match the owner's local day,
// not the server's UTC day.
function periodSums(table: SQL | object) {
  return db.execute(sql`
    SELECT
      COALESCE(SUM(amount), 0) AS t_all,
      COALESCE(SUM(amount) FILTER (WHERE date = (now() AT TIME ZONE 'Asia/Karachi')::date), 0) AS t_today,
      COALESCE(SUM(amount) FILTER (WHERE date >= date_trunc('month', (now() AT TIME ZONE 'Asia/Karachi'))::date), 0) AS t_month
    FROM ${table}
  `);
}

const toPeriod = (res: { rows: Record<string, unknown>[] }) => {
  const r = res.rows[0];
  return { all: Number(r.t_all), today: Number(r.t_today), month: Number(r.t_month) };
};

type WideRow = { key: string; sales: string; purchasing: string; expenses: string; salary: string };

/** Reshape a {key, sales, purchasing, expenses, salary} row set into one daily array per category. */
function toDailyCategorySeries(rows: WideRow[]) {
  return {
    sales: rows.map((r) => ({ date: r.key, total: Number(r.sales) })),
    purchasing: rows.map((r) => ({ date: r.key, total: Number(r.purchasing) })),
    expenses: rows.map((r) => ({ date: r.key, total: Number(r.expenses) })),
    salary: rows.map((r) => ({ date: r.key, total: Number(r.salary) })),
  };
}

/** Reshape a {key, sales, purchasing, expenses, salary} row set into one monthly array per category. */
function toMonthlyCategorySeries(rows: WideRow[]) {
  return {
    sales: rows.map((r) => ({ month: r.key, total: Number(r.sales) })),
    purchasing: rows.map((r) => ({ month: r.key, total: Number(r.purchasing) })),
    expenses: rows.map((r) => ({ month: r.key, total: Number(r.expenses) })),
    salary: rows.map((r) => ({ month: r.key, total: Number(r.salary) })),
  };
}

/** Zero-filled daily totals for all four categories between two dates (inclusive). */
function dailySeries(fromSql: SQL, toSql: SQL) {
  return db.execute(sql`
    WITH days AS (
      SELECT generate_series(${fromSql}, ${toSql}, interval '1 day')::date AS day
    ),
    s AS (SELECT date, SUM(amount) AS total FROM sales GROUP BY date),
    p AS (SELECT date, SUM(amount) AS total FROM purchasing GROUP BY date),
    e AS (SELECT date, SUM(amount) AS total FROM expenses GROUP BY date),
    sa AS (SELECT date, SUM(amount) AS total FROM salary GROUP BY date)
    SELECT
      TO_CHAR(days.day, 'YYYY-MM-DD') AS key,
      COALESCE(s.total, 0) AS sales,
      COALESCE(p.total, 0) AS purchasing,
      COALESCE(e.total, 0) AS expenses,
      COALESCE(sa.total, 0) AS salary
    FROM days
    LEFT JOIN s ON s.date = days.day
    LEFT JOIN p ON p.date = days.day
    LEFT JOIN e ON e.date = days.day
    LEFT JOIN sa ON sa.date = days.day
    ORDER BY days.day
  `);
}

/** Sparse monthly totals for all four categories — one row per month any category has data in. */
function monthlySeries() {
  return db.execute(sql`
    WITH s AS (SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(amount) AS total FROM sales GROUP BY 1),
    p AS (SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(amount) AS total FROM purchasing GROUP BY 1),
    e AS (SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(amount) AS total FROM expenses GROUP BY 1),
    sa AS (SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(amount) AS total FROM salary GROUP BY 1),
    months AS (
      SELECT month FROM s
      UNION SELECT month FROM p
      UNION SELECT month FROM e
      UNION SELECT month FROM sa
    )
    SELECT
      months.month AS key,
      COALESCE(s.total, 0) AS sales,
      COALESCE(p.total, 0) AS purchasing,
      COALESCE(e.total, 0) AS expenses,
      COALESCE(sa.total, 0) AS salary
    FROM months
    LEFT JOIN s ON s.month = months.month
    LEFT JOIN p ON p.month = months.month
    LEFT JOIN e ON e.month = months.month
    LEFT JOIN sa ON sa.month = months.month
    ORDER BY months.month
  `);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const todayExpr = sql`(now() AT TIME ZONE 'Asia/Karachi')::date`;
    const monthStartExpr = sql`date_trunc('month', (now() AT TIME ZONE 'Asia/Karachi'))::date`;

    const [
      salesRes,
      purchRes,
      expRes,
      salRes,
      [{ customerCount }],
      outstandingRes,
      balancesRes,
      todayDailyRes,
      monthDailyRes,
      allMonthlyRes,
    ] = await Promise.all([
      periodSums(sales),
      periodSums(purchasing),
      periodSums(expenses),
      periodSums(salary),
      db.select({ customerCount: sql<string>`COUNT(*)` }).from(customers),
      db.execute(sql`
        SELECT COALESCE(SUM(latest_bal), 0) AS total_outstanding
        FROM (
          SELECT DISTINCT ON (customer_id) balance AS latest_bal
          FROM customer_entries
          ORDER BY customer_id, date DESC, id DESC
        ) sub
      `),
      db.execute(sql`
        SELECT c.id, c.name, c.address, c.phone,
          (SELECT balance FROM customer_entries ce WHERE ce.customer_id = c.id ORDER BY date DESC, id DESC LIMIT 1) AS balance
        FROM customers c
        ORDER BY ABS(COALESCE((SELECT balance FROM customer_entries ce WHERE ce.customer_id = c.id ORDER BY date DESC, id DESC LIMIT 1),0)) DESC NULLS LAST
        LIMIT 10
      `),
      dailySeries(sql`${todayExpr} - interval '13 days'`, todayExpr),
      dailySeries(monthStartExpr, todayExpr),
      monthlySeries(),
    ]);

    const outstanding = Number((outstandingRes.rows[0] as Record<string, string>).total_outstanding ?? 0);

    return NextResponse.json({
      stats: {
        sales: toPeriod(salesRes),
        purchasing: toPeriod(purchRes),
        expenses: toPeriod(expRes),
        salary: toPeriod(salRes),
        outstanding,
        custCount: Number(customerCount),
      },
      topBalances: balancesRes.rows,
      sparklines: {
        today: toDailyCategorySeries(todayDailyRes.rows as WideRow[]),
        month: toDailyCategorySeries(monthDailyRes.rows as WideRow[]),
        all: toMonthlyCategorySeries(allMonthlyRes.rows as WideRow[]),
      },
    });
  } catch (err) {
    console.error("GET /dashboard-stats failed:", err);
    return NextResponse.json({ error: "Failed to load dashboard stats." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Manually verify the route against the real dev database**

Since this route requires an authenticated session, direct `curl` won't easily work. Instead, verify the underlying SQL directly: write a disposable script (e.g. `verify-route-sql.ts` in the repo root — **delete it before committing**, it must not be part of the commit) that connects via `neon`/`drizzle-orm/neon-http` the same way `scripts/seed.ts` does, and runs the three new query functions (`dailySeries` for both windows, `monthlySeries`) against the real `DATABASE_URL` from `.env`. Confirm:
- The "today" window returns exactly 14 rows, oldest date first.
- The "month-to-date" window returns a number of rows equal to today's day-of-month (e.g. 20 rows on the 20th).
- The "all monthly" query returns one sparse row per month with any activity, each with all four category totals present (defaulting to `0` for a category with no activity that month).

Run: `npx tsx verify-route-sql.ts` (from the repo root, so `dotenv/config` resolves the `.env` there)
Expected: row counts match the above; then delete the script.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/dashboard-stats/route.ts
git commit -m "Add zero-filled daily and sparse monthly sparkline series to dashboard-stats"
```

---

### Task 2: Update the `DashboardData` type

**Files:**
- Modify: `src/lib/dashboard-cache.ts`

**Interfaces:**
- Produces: `export type DailySparkPoint = { date: string; total: number }`
- Produces: `export type MonthlySparkPoint = { month: string; total: number }`
- Produces: `export type DailyCategorySparklines = { sales: DailySparkPoint[]; purchasing: DailySparkPoint[]; expenses: DailySparkPoint[]; salary: DailySparkPoint[] }`
- Produces: `export type MonthlyCategorySparklines = { sales: MonthlySparkPoint[]; purchasing: MonthlySparkPoint[]; expenses: MonthlySparkPoint[]; salary: MonthlySparkPoint[] }`
- Produces: `DashboardData` gains `sparklines: { today: DailyCategorySparklines; month: DailyCategorySparklines; all: MonthlyCategorySparklines }` and drops `monthlySales`.

- [ ] **Step 1: Replace the file's type definitions**

Find:

```ts
import { createLocalCache } from "./localCache";

/** Totals for a money flow across three time windows. */
export type PeriodTotals = { all: number; today: number; month: number };
export type Period = keyof PeriodTotals;

/** Shape returned by GET /api/dashboard-stats and cached on the client. */
export type DashboardData = {
  stats: {
    sales: PeriodTotals;
    purchasing: PeriodTotals;
    expenses: PeriodTotals;
    salary: PeriodTotals;
    outstanding: number;
    custCount: number;
  };
  topBalances: {
    id: number;
    name: string;
    address: string | null;
    phone: string | null;
    balance: string | null;
  }[];
  monthlySales: { month: string; total: string }[];
};
```

Replace with:

```ts
import { createLocalCache } from "./localCache";

/** Totals for a money flow across three time windows. */
export type PeriodTotals = { all: number; today: number; month: number };
export type Period = keyof PeriodTotals;

export type DailySparkPoint = { date: string; total: number };
export type MonthlySparkPoint = { month: string; total: number };

export type DailyCategorySparklines = {
  sales: DailySparkPoint[];
  purchasing: DailySparkPoint[];
  expenses: DailySparkPoint[];
  salary: DailySparkPoint[];
};

export type MonthlyCategorySparklines = {
  sales: MonthlySparkPoint[];
  purchasing: MonthlySparkPoint[];
  expenses: MonthlySparkPoint[];
  salary: MonthlySparkPoint[];
};

/** Shape returned by GET /api/dashboard-stats and cached on the client. */
export type DashboardData = {
  stats: {
    sales: PeriodTotals;
    purchasing: PeriodTotals;
    expenses: PeriodTotals;
    salary: PeriodTotals;
    outstanding: number;
    custCount: number;
  };
  topBalances: {
    id: number;
    name: string;
    address: string | null;
    phone: string | null;
    balance: string | null;
  }[];
  sparklines: {
    today: DailyCategorySparklines;
    month: DailyCategorySparklines;
    all: MonthlyCategorySparklines;
  };
};
```

The rest of the file (the `dashboardCache`/`DASH_KEY` exports below) is unchanged.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: **new** type errors are expected at this point — `src/app/dashboard/page.tsx` still references the old `data.monthlySales` field and will fail to compile until Task 5 rewires it. Confirm the *only* errors are in `src/app/dashboard/page.tsx` referencing `monthlySales`; there should be no errors in any other file. This is the expected, temporary state between tasks — do not attempt to fix `page.tsx` in this task.

- [ ] **Step 3: Commit**

```bash
git add src/lib/dashboard-cache.ts
git commit -m "Replace monthlySales with a four-category sparklines shape in DashboardData"
```

---

### Task 3: Pure year-filtering helpers (`src/lib/overview-sparklines.ts`)

**Files:**
- Create: `src/lib/overview-sparklines.ts`

**Interfaces:**
- Consumes: `MonthlyCategorySparklines`, `MonthlySparkPoint` (Task 2, from `src/lib/dashboard-cache.ts`)
- Produces: `export function availableYears(all: MonthlyCategorySparklines): string[]`
- Produces: `export function yearSlice(points: MonthlySparkPoint[], year: string): MonthlySparkPoint[]`
- Produces: `export function sumSpark(points: { total: number }[]): number`

- [ ] **Step 1: Write the module**

Create `src/lib/overview-sparklines.ts`:

```ts
import type { MonthlyCategorySparklines, MonthlySparkPoint } from "./dashboard-cache";

/** Distinct years ("YYYY") present across all four monthly category series, sorted ascending. */
export function availableYears(all: MonthlyCategorySparklines): string[] {
  const years = new Set<string>();
  for (const series of [all.sales, all.purchasing, all.expenses, all.salary]) {
    for (const p of series) years.add(p.month.slice(0, 4));
  }
  return Array.from(years).sort();
}

/** Slice a monthly series down to one calendar year (month keys are "YYYY-MM"). */
export function yearSlice(points: MonthlySparkPoint[], year: string): MonthlySparkPoint[] {
  return points.filter((p) => p.month.startsWith(year));
}

/** Sum a series' totals — used for both a sparkline's own data and year-scoped headline figures. */
export function sumSpark(points: { total: number }[]): number {
  return points.reduce((acc, p) => acc + p.total, 0);
}
```

- [ ] **Step 2: Write a disposable verification script and run it**

Create `.superpowers/sdd/verify-overview-sparklines.ts` (relative to the repo root; this directory is already gitignored) — adjust the import's relative path to correctly resolve to `src/lib/overview-sparklines.ts` and `src/lib/dashboard-cache.ts` from wherever the script actually sits:

```ts
import { availableYears, yearSlice, sumSpark } from "../../src/lib/overview-sparklines";
import type { MonthlyCategorySparklines } from "../../src/lib/dashboard-cache";

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`FAIL ${label}: expected ${e}, got ${a}`);
  console.log(`PASS ${label}`);
}

const all: MonthlyCategorySparklines = {
  sales: [
    { month: "2025-12", total: 0 },
    { month: "2026-01", total: 2802400 },
    { month: "2026-02", total: 1403601 },
  ],
  purchasing: [
    { month: "2025-12", total: 1073423 },
    { month: "2026-01", total: 1170862 },
  ],
  expenses: [
    { month: "2025-12", total: 80000 },
  ],
  salary: [
    { month: "2026-01", total: 39000 },
    { month: "2026-02", total: 67000 },
  ],
};

assertEqual(availableYears(all), ["2025", "2026"], "availableYears finds both years across all four series");
assertEqual(yearSlice(all.sales, "2026").map((p) => p.month), ["2026-01", "2026-02"], "yearSlice filters sales to 2026");
assertEqual(yearSlice(all.expenses, "2026"), [], "yearSlice on a year with no matching months returns empty array");
assertEqual(sumSpark(all.sales), 2802400 + 1403601, "sumSpark sums all sales totals");
assertEqual(sumSpark(yearSlice(all.sales, "2025")), 0, "sumSpark of a year-slice with only a zero-value month is 0");
assertEqual(sumSpark([]), 0, "sumSpark of an empty array is 0, no crash");

console.log("All overview-sparklines checks passed.");
```

Run: `npx tsx .superpowers/sdd/verify-overview-sparklines.ts`

Expected: every line prints `PASS ...`, ending with `All overview-sparklines checks passed.` If any line throws `FAIL ...`, fix `src/lib/overview-sparklines.ts` and re-run before proceeding — this is the test-first gate for this task's pure logic.

- [ ] **Step 3: Delete the scratch script** (verification-only, not part of the codebase)

- [ ] **Step 4: Verify the whole project still compiles**

Run: `npx tsc --noEmit`
Expected: same state as the end of Task 2 (errors only in `src/app/dashboard/page.tsx`, still referencing the old `monthlySales` field — unchanged by this task, still expected until Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/overview-sparklines.ts
git commit -m "Add pure year-filtering and summing helpers for overview sparklines"
```

---

### Task 4: `Sparkline` chart component

**Files:**
- Modify: `src/components/charts.tsx` — append after `CostDonut` (end of file)

**Interfaces:**
- Consumes: `ChartPoint`, `ACCENT`, `COST_NEUTRAL`, `formatMoney`, `useMeasure`, `useMounted`, `niceCeil` (all already defined/imported in this file)
- Produces: `export function Sparkline({ data, variant, height }: { data: ChartPoint[]; variant?: "accent" | "neutral"; height?: number })`

- [ ] **Step 1: Append the component**

Add at the end of `src/components/charts.tsx` (after the closing brace of `CostDonut`):

```tsx

// ── Sparkline — compact trend line for stat cards, no axes/gridlines ───
export function Sparkline({
  data,
  variant = "accent",
  height = 44,
}: {
  data: ChartPoint[];
  variant?: "accent" | "neutral";
  height?: number;
}) {
  const [ref, W] = useMeasure();
  const mounted = useMounted();
  const [hover, setHover] = useState<number | null>(null);
  const color = variant === "accent" ? ACCENT : COST_NEUTRAL;

  const padX = 2, padY = 5;
  const innerW = Math.max(0, W - padX * 2);
  const innerH = height - padY * 2;
  const n = data.length;
  const allZero = n === 0 || data.every((d) => d.value === 0);
  const niceMax = niceCeil(Math.max(1, ...data.map((d) => d.value)));

  const x = (i: number) => (n <= 1 ? padX + innerW / 2 : padX + (innerW * i) / (n - 1));
  const y = (v: number) => padY + innerH * (1 - v / niceMax);
  const step = n <= 1 ? 0 : innerW / (n - 1);

  const linePath = n
    ? data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ")
    : "";

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current || n === 0 || allZero) return;
    const mx = e.clientX - ref.current.getBoundingClientRect().left;
    const i = Math.max(0, Math.min(n - 1, Math.round((mx - padX) / (step || 1))));
    setHover(i);
  }

  if (W === 0) return <div ref={ref} style={{ height }} />;

  const hv = hover !== null && !allZero ? data[hover] : null;

  return (
    <div
      ref={ref}
      className="relative select-none"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg width={W} height={height} role="img" aria-label="Trend">
        <defs>
          <clipPath id="sparkReveal">
            <rect x="0" y="0" width={mounted ? W : 0} height={height} style={{ transition: "width 0.7s cubic-bezier(0.22,1,0.36,1)" }} />
          </clipPath>
        </defs>
        <g clipPath="url(#sparkReveal)">
          {allZero ? (
            <line x1={padX} y1={height / 2} x2={W - padX} y2={height / 2} stroke={color} strokeWidth={2} opacity={0.25} />
          ) : (
            <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )}
        </g>
        {hv && <circle cx={x(hover!)} cy={y(hv.value)} r={3} fill="#fff" stroke={color} strokeWidth={2} />}
      </svg>

      {hv && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-pop"
          style={{ left: Math.min(Math.max(x(hover!), 50), W - 50), top: y(hv.value) - 10, transform: "translate(-50%,-100%)" }}
        >
          <p className="text-[10px] text-muted">{hv.label}</p>
          <p className="font-mono text-[12px] font-semibold text-ink tabular-nums whitespace-nowrap">
            {formatMoney(hv.value)}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: same expected-pending state as before (errors only in `page.tsx`'s `monthlySales` references) — no new errors from `charts.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add src/components/charts.tsx
git commit -m "Add compact Sparkline chart for stat cards"
```

---

### Task 5: Wire sparklines and the "This year" toggle into the Overview page

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `Sparkline` (Task 4, from `@/components/charts`); `availableYears`, `yearSlice`, `sumSpark` (Task 3, from `@/lib/overview-sparklines`); the updated `DashboardData`/`Period` shapes (Task 2, from `@/lib/dashboard-cache`)

- [ ] **Step 1: Update imports**

Find:

```tsx
import { EmptyState, ErrorState } from "@/components/states";
import { TrendChart } from "@/components/charts";
import { dashboardCache, DASH_KEY, type DashboardData, type Period } from "@/lib/dashboard-cache";
```

Replace with:

```tsx
import { EmptyState, ErrorState } from "@/components/states";
import { TrendChart, Sparkline } from "@/components/charts";
import { dashboardCache, DASH_KEY, type DashboardData, type Period } from "@/lib/dashboard-cache";
import { availableYears, yearSlice, sumSpark } from "@/lib/overview-sparklines";
```

- [ ] **Step 2: Add the `ToggleKey` type and a day-label helper, near the top of the file**

Find:

```tsx
const PERIODS: { key: Period; label: string; word: string }[] = [
  { key: "today", label: "Today", word: "today" },
  { key: "month", label: "This month", word: "this month" },
  { key: "all", label: "All time", word: "all time" },
];
```

Replace with:

```tsx
const PERIODS: { key: Period; label: string; word: string }[] = [
  { key: "today", label: "Today", word: "today" },
  { key: "month", label: "This month", word: "this month" },
  { key: "all", label: "All time", word: "all time" },
];

/** The period toggle's full set of states — "year" isn't a PeriodTotals key (it has no
 * server-precomputed sum), it's derived client-side from sparklines.all instead. */
type ToggleKey = Period | "year";

/** "2026-07-05" → "05 Jul" — compact day label for daily sparkline tooltips. */
function dayLabel(isoDate: string): string {
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-PK", { day: "2-digit", month: "short" });
}
```

- [ ] **Step 3: Replace the `period` state with `periodKey`/`year`, and add the year-default effect**

Find:

```tsx
  const [data, setData] = useState<DashboardData | null>(cached0 ?? null);
  const [loading, setLoading] = useState(!cached0);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
```

Replace with:

```tsx
  const [data, setData] = useState<DashboardData | null>(cached0 ?? null);
  const [loading, setLoading] = useState(!cached0);
  const [error, setError] = useState(false);
  const [periodKey, setPeriodKey] = useState<ToggleKey>("month");
  const [year, setYear] = useState<string>("");
```

Find:

```tsx
  useEffect(() => {
    const cached = dashboardCache.get(DASH_KEY);
    if (cached) { setData(cached); setLoading(false); load({ silent: true }); }
    else load();
  }, [load]);
```

Replace with:

```tsx
  useEffect(() => {
    const cached = dashboardCache.get(DASH_KEY);
    if (cached) { setData(cached); setLoading(false); load({ silent: true }); }
    else load();
  }, [load]);

  // Default the year picker to the latest year with data, once it's known —
  // never overwrite a year the user has already picked.
  useEffect(() => {
    if (!data || year) return;
    const years = availableYears(data.sparklines.all);
    if (years.length > 0) setYear(years[years.length - 1]);
  }, [data, year]);
```

- [ ] **Step 4: Replace the period-derived figures and revenue trend source**

Find:

```tsx
  const { stats, topBalances } = data;
  const revenueTrend = (data.monthlySales ?? []).map((m) => ({ label: monthLabel(m.month), value: toNum(m.total) }));

  // Scope the money flows to the selected period; balances (outstanding/customers) stay current.
  const periodWord = PERIODS.find((p) => p.key === period)!.word;
  const salesV = stats.sales[period];
  const purchV = stats.purchasing[period];
  const expV = stats.expenses[period];
  const salV = stats.salary[period];
  const costTotal = purchV + expV + salV;
  const profit = salesV - costTotal;
  const margin = salesV > 0 ? (profit / salesV) * 100 : 0;
  const isProfit = profit >= 0;

  // "Money in" vs "money out" — the mental model that works for accountants and non-accountants alike.
  const statCards = [
    { label: "Sales", value: formatMoney(salesV), icon: TrendingUp, flow: "in" as const, hint: "Money in" },
    { label: "Purchasing", value: formatMoney(purchV), icon: TrendingDown, flow: "out" as const, hint: "Money out" },
    { label: "Expenses", value: formatMoney(expV), icon: Receipt, flow: "out" as const, hint: "Money out" },
    { label: "Salary paid", value: formatMoney(salV), icon: Wallet, flow: "out" as const, hint: "Money out" },
  ];
```

Replace with:

```tsx
  const { stats, topBalances } = data;
  const revenueTrend = data.sparklines.all.sales.map((m) => ({ label: monthLabel(m.month), value: m.total }));
  const years = availableYears(data.sparklines.all);

  type Category = "sales" | "purchasing" | "expenses" | "salary";

  // "This year" has no server-precomputed sum — derive it from the same monthly
  // series the "All time" sparkline uses, the same year-filter technique as
  // src/lib/pnl-range.ts's ytd case.
  const periodTotal = (cat: Category): number =>
    periodKey === "year"
      ? (year ? sumSpark(yearSlice(data.sparklines.all[cat], year)) : 0)
      : stats[cat][periodKey];

  // Points for a category's sparkline at the currently active period/year.
  const sparkPoints = (cat: Category) => {
    if (periodKey === "today") return data.sparklines.today[cat].map((d) => ({ label: dayLabel(d.date), value: d.total }));
    if (periodKey === "month") return data.sparklines.month[cat].map((d) => ({ label: dayLabel(d.date), value: d.total }));
    if (periodKey === "year") return yearSlice(data.sparklines.all[cat], year).map((d) => ({ label: monthLabel(d.month), value: d.total }));
    return data.sparklines.all[cat].map((d) => ({ label: monthLabel(d.month), value: d.total }));
  };

  // Scope the money flows to the selected period; balances (outstanding/customers) stay current.
  const periodWord = periodKey === "year" ? (year ? `in ${year}` : "this year") : PERIODS.find((p) => p.key === periodKey)!.word;
  const salesV = periodTotal("sales");
  const purchV = periodTotal("purchasing");
  const expV = periodTotal("expenses");
  const salV = periodTotal("salary");
  const costTotal = purchV + expV + salV;
  const profit = salesV - costTotal;
  const margin = salesV > 0 ? (profit / salesV) * 100 : 0;
  const isProfit = profit >= 0;

  // "Money in" vs "money out" — the mental model that works for accountants and non-accountants alike.
  const statCards = [
    { cat: "sales" as const, label: "Sales", value: formatMoney(salesV), icon: TrendingUp, flow: "in" as const, hint: "Money in" },
    { cat: "purchasing" as const, label: "Purchasing", value: formatMoney(purchV), icon: TrendingDown, flow: "out" as const, hint: "Money out" },
    { cat: "expenses" as const, label: "Expenses", value: formatMoney(expV), icon: Receipt, flow: "out" as const, hint: "Money out" },
    { cat: "salary" as const, label: "Salary paid", value: formatMoney(salV), icon: Wallet, flow: "out" as const, hint: "Money out" },
  ];
```

- [ ] **Step 5: Extend the period toggle UI with "This year" + the year select**

Find:

```tsx
        {/* Period toggle — rescopes the sales/cost/profit figures below */}
        <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface p-0.5 shadow-btn">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              aria-pressed={period === p.key}
              className={cn(
                "px-3 py-1.5 text-[12.5px] font-medium rounded-md transition-colors",
                period === p.key ? "bg-accent text-white shadow-btn" : "text-muted hover:text-ink",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
```

Replace with:

```tsx
        {/* Period toggle — rescopes the sales/cost/profit figures and sparklines below */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface p-0.5 shadow-btn">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriodKey(p.key)}
                aria-pressed={periodKey === p.key}
                className={cn(
                  "px-3 py-1.5 text-[12.5px] font-medium rounded-md transition-colors",
                  periodKey === p.key ? "bg-accent text-white shadow-btn" : "text-muted hover:text-ink",
                )}
              >
                {p.label}
              </button>
            ))}
            {years.length > 0 && (
              <button
                onClick={() => setPeriodKey("year")}
                aria-pressed={periodKey === "year"}
                className={cn(
                  "px-3 py-1.5 text-[12.5px] font-medium rounded-md transition-colors",
                  periodKey === "year" ? "bg-accent text-white shadow-btn" : "text-muted hover:text-ink",
                )}
              >
                This year
              </button>
            )}
          </div>
          {periodKey === "year" && years.length > 0 && (
            <select
              className="select !w-auto !py-1.5 !text-[12.5px]"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}
        </div>
      </div>
```

- [ ] **Step 6: Render each stat card's sparkline**

Find:

```tsx
              <p
                className={`mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium ${
                  isIn ? "text-success" : "text-muted"
                }`}
              >
                {isIn ? (
                  <ArrowUpRight className="w-3 h-3" strokeWidth={2.5} />
                ) : (
                  <ArrowDownRight className="w-3 h-3" strokeWidth={2.5} />
                )}
                {c.hint}
              </p>
            </div>
          );
        })}
      </div>
```

Replace with:

```tsx
              <p
                className={`mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium ${
                  isIn ? "text-success" : "text-muted"
                }`}
              >
                {isIn ? (
                  <ArrowUpRight className="w-3 h-3" strokeWidth={2.5} />
                ) : (
                  <ArrowDownRight className="w-3 h-3" strokeWidth={2.5} />
                )}
                {c.hint}
              </p>
              <div className="mt-3">
                <Sparkline data={sparkPoints(c.cat)} variant={isIn ? "accent" : "neutral"} />
              </div>
            </div>
          );
        })}
      </div>
```

- [ ] **Step 7: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: zero errors — this closes out the expected-pending errors noted at the end of Tasks 2–4.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Wire sparklines and This-year toggle into the Overview page"
```

---

### Task 6: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Use the `run` skill (or `npm run dev` directly) to launch the app and open `/dashboard` in a browser.

- [ ] **Step 2: Verify sparklines render for all four stat cards**

Confirm each of Sales/Purchasing/Expenses/Salary paid shows a small trend line beneath its figure, Sales colored orange (`ACCENT`), the other three grey (`COST_NEUTRAL`).

- [ ] **Step 3: Cycle through every period option**

Click Today, This month, All time, and This year (with at least two different years, if more than one is available). Confirm on each: the four stat-card figures, the hero Net profit figure, and each sparkline's shape all change together and stay internally consistent (e.g. the Sales card's figure equals the sum of its own sparkline's points for that period).

- [ ] **Step 4: Verify hover tooltips**

Hover a point on a sparkline (in at least the daily and monthly granularities) and confirm the tooltip shows the correct date/month and amount.

- [ ] **Step 5: Verify the zero-activity flat-line state**

Find or contrive a period/category combination with zero activity (e.g. Expenses on "Today" if none were logged today) and confirm it renders a flat, low-opacity line rather than a text placeholder.

- [ ] **Step 6: Verify the Revenue Trend chart still works**

Confirm the existing "Revenue trend" chart (now sourced from `sparklines.all.sales` instead of the old `monthlySales`) still renders correctly and matches the same monthly figures shown elsewhere (e.g. the PnL page's Sales column for the same months).

- [ ] **Step 7: Verify responsive layout**

Resize to mobile width and confirm the stat-card grid and sparklines still render sensibly (no overflow, sparkline still fills its card's width).

- [ ] **Step 8: Final commit** (only if any fixes were needed during verification)

```bash
git add -A
git commit -m "Fix issues found during Overview sparklines verification"
```
