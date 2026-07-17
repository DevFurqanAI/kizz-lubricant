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

// Shared instance so the login-page prefetch and the dashboard read/write the
// exact same key — the dashboard paints instantly from whatever login primed.
export const dashboardCache = createLocalCache<DashboardData>("dashboard", { ttlMs: 5 * 60_000 });
export const DASH_KEY = "";
