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
