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
