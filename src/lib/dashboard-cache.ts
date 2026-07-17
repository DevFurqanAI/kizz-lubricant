import { createLocalCache } from "./localCache";

/** Shape returned by GET /api/dashboard-stats and cached on the client. */
export type DashboardData = {
  stats: {
    totalSales: number;
    totalPurchasing: number;
    totalExpenses: number;
    totalSalary: number;
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
};

// Shared instance so the login-page prefetch and the dashboard read/write the
// exact same key — the dashboard paints instantly from whatever login primed.
export const dashboardCache = createLocalCache<DashboardData>("dashboard", { ttlMs: 5 * 60_000 });
export const DASH_KEY = "";
