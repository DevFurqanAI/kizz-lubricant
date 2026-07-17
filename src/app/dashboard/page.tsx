"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatMoney, toNum, monthLabel, cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Receipt, Wallet, Users, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/states";
import { TrendChart } from "@/components/charts";
import { dashboardCache, DASH_KEY, type DashboardData, type Period } from "@/lib/dashboard-cache";

const PERIODS: { key: Period; label: string; word: string }[] = [
  { key: "today", label: "Today", word: "today" },
  { key: "month", label: "This month", word: "this month" },
  { key: "all", label: "All time", word: "all time" },
];

/** Plain-language meaning of a customer balance (mixed audience: term + explanation). */
function balanceStatus(bal: number) {
  if (bal > 0) return { label: "Owes you", cls: "text-warning", dot: "bg-warning" };
  if (bal < 0) return { label: "Paid ahead", cls: "text-success", dot: "bg-success" };
  return { label: "Settled", cls: "text-muted", dot: "bg-faint" };
}

export default function DashboardPage() {
  // Paint instantly from the last-known snapshot (localStorage), then refresh in
  // the background — the same stale-while-revalidate pattern the ledger pages use.
  const cached0 = dashboardCache.get(DASH_KEY);
  const [data, setData] = useState<DashboardData | null>(cached0 ?? null);
  const [loading, setLoading] = useState(!cached0);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<Period>("month");

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) { setLoading(true); setError(false); }
    try {
      const d = await api.get<DashboardData>("/dashboard-stats");
      dashboardCache.set(DASH_KEY, d);
      setData(d);
    } catch {
      if (!opts?.silent) setError(true);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = dashboardCache.get(DASH_KEY);
    if (cached) { setData(cached); setLoading(false); load({ silent: true }); }
    else load();
  }, [load]);

  if (loading && !data) return <DashboardSkeleton />;
  if (error && !data) return <div className="card"><ErrorState onRetry={() => load()} /></div>;
  if (!data) return null;

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

  return (
    <div className="space-y-5 pb-10">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="rise flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Overview</h1>
          <p className="mt-1 text-sm text-muted">
            A snapshot of your whole business — everything you&apos;ve sold, spent, and are still owed.
          </p>
        </div>
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

      {/* ── Hero: Net profit / loss (violet-tinted focal point) ── */}
      <div className="rise rise-1 relative overflow-hidden rounded-2xl bg-accent-tint border border-accent/15 shadow-card">
        {/* accent spine — the one saturated stroke */}
        <div className="absolute inset-y-0 left-0 w-1 bg-accent" />

        <div className="relative p-6 sm:p-8 pl-7 sm:pl-9">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-eyebrow text-accent-ink/70">
              {isProfit ? "Net profit" : "Net loss"} · {periodWord}
            </span>
            <span
              className={`badge ${isProfit ? "bg-success-tint text-success" : "bg-danger-tint text-danger"}`}
            >
              {isProfit ? "▲" : "▼"} {margin.toFixed(1)}% margin
            </span>
          </div>
          <p
            className={`mt-3 font-mono font-semibold leading-none tabular-nums text-[clamp(2.25rem,7vw,3.5rem)] ${
              isProfit ? "text-ink" : "text-danger"
            }`}
          >
            {formatMoney(Math.abs(profit))}
          </p>
          <p className="mt-2.5 text-[13.5px] font-medium text-ink">
            {salesV === 0 && costTotal === 0
              ? `No money moved ${periodWord} yet.`
              : isProfit
                ? "You're in profit — you've earned more than you've spent."
                : "You're running at a loss — you've spent more than you've earned."}
          </p>

          {/* Plain-language equation: money in − money out = what's left */}
          <div className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]">
            <span className="text-muted">
              Money in <span className="font-mono font-semibold text-ink tabular-nums">{formatMoney(salesV)}</span>
            </span>
            <span className="text-faint">−</span>
            <span className="text-muted">
              Money out <span className="font-mono font-semibold text-ink tabular-nums">{formatMoney(costTotal)}</span>
            </span>
            <span className="text-faint">=</span>
            <span className="text-muted">
              What&apos;s left{" "}
              <span className={`font-mono font-semibold tabular-nums ${isProfit ? "text-success" : "text-danger"}`}>
                {isProfit ? "" : "−"}{formatMoney(Math.abs(profit))}
              </span>
            </span>
          </div>

          {/* Secondary metrics — full-width row, room to breathe */}
          <div className="mt-7 grid grid-cols-2 gap-4 pt-6 border-t border-accent/15">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-accent-ink/70 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" strokeWidth={2} /> Customers
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold text-ink tabular-nums">
                {stats.custCount}
              </p>
              <p className="mt-1 text-[12px] text-muted">on your books</p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-accent-ink/70">
                Outstanding
              </p>
              <p
                className={`mt-2 font-mono text-2xl font-semibold tabular-nums whitespace-nowrap ${
                  stats.outstanding > 0 ? "text-warning" : "text-ink"
                }`}
              >
                {formatMoney(stats.outstanding)}
              </p>
              <p className="mt-1 text-[12px] text-muted">customers still owe you</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stat grid (secondary) ──────────────────────────── */}
      <div className="rise rise-2 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((c) => {
          const isIn = c.flow === "in";
          return (
            <div key={c.label} className="card-interactive p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="grid place-items-center w-7 h-7 rounded-lg bg-accent-tint text-accent-ink flex-shrink-0">
                    <c.icon className="w-3.5 h-3.5" strokeWidth={2.2} />
                  </span>
                  <p className="text-[13px] font-semibold text-ink truncate">{c.label}</p>
                </div>
              </div>
              <p className="mt-3 font-mono text-xl sm:text-[26px] leading-none font-semibold text-ink tabular-nums whitespace-nowrap">
                {c.value}
              </p>
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

      {/* ── Revenue trend ──────────────────────────────────── */}
      {revenueTrend.length > 1 && (
        <div className="rise rise-3 card overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-line">
            <h2 className="text-[15px] font-semibold text-ink">Revenue trend</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">Monthly sales — your money coming in over time.</p>
          </div>
          <div className="p-3 sm:p-4">
            <TrendChart data={revenueTrend} />
          </div>
        </div>
      )}

      {/* ── Customer balances ──────────────────────────────── */}
      <div className="rise rise-3 card overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-line flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Customer balances</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">Who owes you money, and who&apos;s paid ahead.</p>
          </div>
          <Link
            href="/dashboard/customers"
            className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-accent-ink hover:text-accent-hover font-medium transition-colors flex-shrink-0"
          >
            View all <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={2.5} />
          </Link>
        </div>

        {/* Legend — decodes the amber / green colours so nobody has to guess */}
        {topBalances.length > 0 && (
          <div className="px-5 sm:px-6 py-2.5 border-b border-line bg-black/[0.01] flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="w-2 h-2 rounded-full bg-warning" /> <span className="text-warning font-medium">Owes you</span> — unpaid balance
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <span className="w-2 h-2 rounded-full bg-success" /> <span className="text-success font-medium">Paid ahead</span> — credit on account
            </span>
          </div>
        )}

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-black/[0.015] border-b border-line">
                <th className="th">Customer</th>
                <th className="th">Address</th>
                <th className="th">Phone</th>
                <th className="th">Status</th>
                <th className="th text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {topBalances.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={Users}
                      compact
                      title="No customers yet"
                      description="Add your first customer to start tracking balances."
                      action={<Link href="/dashboard/customers" className="btn-primary">+ Add Customer</Link>}
                    />
                  </td>
                </tr>
              ) : (
                topBalances.map((c) => {
                  const bal = toNum(c.balance);
                  const status = balanceStatus(bal);
                  return (
                    <tr key={c.id} className="hover:bg-black/[0.015] transition-colors">
                      <td className="td py-3.5">
                        <Link
                          href={`/dashboard/customers/${c.id}`}
                          className="font-medium text-ink hover:text-accent transition-colors"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="td py-3.5 text-muted text-xs">{c.address || "—"}</td>
                      <td className="td py-3.5 text-muted text-xs font-mono">{c.phone || "—"}</td>
                      <td className="td py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${status.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                          {status.label}
                        </span>
                      </td>
                      <td
                        className={`td py-3.5 text-right font-mono font-semibold text-[13px] tabular-nums ${status.cls}`}
                      >
                        {formatMoney(bal)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="sm:hidden divide-y divide-line">
          {topBalances.length === 0 ? (
            <EmptyState
              icon={Users}
              compact
              title="No customers yet"
              description="Add your first customer to start tracking balances."
              action={<Link href="/dashboard/customers" className="btn-primary">+ Add Customer</Link>}
            />
          ) : (
            topBalances.map((c) => {
              const bal = toNum(c.balance);
              const status = balanceStatus(bal);
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/customers/${c.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 active:bg-black/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink text-sm truncate">{c.name}</p>
                    <p className={`text-[11px] mt-0.5 font-medium ${status.cls}`}>{status.label}</p>
                  </div>
                  <p
                    className={`font-mono font-semibold text-sm tabular-nums flex-shrink-0 ${status.cls}`}
                  >
                    {formatMoney(bal)}
                  </p>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/** First-load skeleton, shaped like the real dashboard so the swap is seamless. */
function DashboardSkeleton() {
  return (
    <div className="space-y-5 pb-10 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-40 bg-black/[0.06] rounded" />
        <div className="h-3 w-80 max-w-full bg-black/[0.04] rounded" />
      </div>
      <div className="rounded-2xl bg-accent-tint/60 border border-accent/10 h-56" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4 sm:p-5 h-28">
            <div className="h-7 w-7 rounded-lg bg-black/[0.05]" />
            <div className="mt-4 h-6 w-24 bg-black/[0.05] rounded" />
          </div>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="h-14 border-b border-line" />
        <div className="divide-y divide-line">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-5 py-4">
              <div className="h-4 bg-black/[0.04] rounded" style={{ width: `${88 - i * 7}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
