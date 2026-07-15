// import { getServerSession } from "next-auth";
// import { redirect } from "next/navigation";
// import { authOptions } from "@/lib/auth";
// import { db } from "@/db";
// import { sales, purchasing, expenses, salary, customers, customerEntries } from "@/db/schema";
// import { sql } from "drizzle-orm";
// import { formatMoney, toNum } from "@/lib/utils";
// import Link from "next/link";

// async function getStats() {
//   const [[{ totalSales }], [{ totalPurch }], [{ totalExp }], [{ totalSal }], [{ custCount }]] =
//     await Promise.all([
//       db.select({ totalSales: sql<string>`COALESCE(SUM(amount),0)` }).from(sales),
//       db.select({ totalPurch: sql<string>`COALESCE(SUM(amount),0)` }).from(purchasing),
//       db.select({ totalExp: sql<string>`COALESCE(SUM(amount),0)` }).from(expenses),
//       db.select({ totalSal: sql<string>`COALESCE(SUM(amount),0)` }).from(salary),
//       db.select({ custCount: sql<string>`COUNT(*)` }).from(customers),
//     ]);

//   const latestBal = await db.execute(sql`
//     SELECT COALESCE(SUM(latest_bal), 0) AS total_outstanding
//     FROM (
//       SELECT DISTINCT ON (customer_id) balance AS latest_bal
//       FROM customer_entries
//       ORDER BY customer_id, date DESC, id DESC
//     ) sub
//   `);

//   const outstanding = toNum((latestBal.rows[0] as Record<string, string>).total_outstanding);
//   const s = toNum(totalSales), p = toNum(totalPurch), e = toNum(totalExp), sal = toNum(totalSal);
//   const profit = s - (p + e + sal);
//   const margin = s > 0 ? (profit / s) * 100 : 0;
//   return { totalSales: s, totalPurchasing: p, totalExpenses: e, totalSalary: sal, profit, margin, outstanding, custCount: Number(custCount) };
// }

// async function getTopCustomerBalances() {
//   const rows = await db.execute(sql`
//     SELECT c.id, c.name, c.address, c.phone,
//       (SELECT balance FROM customer_entries ce WHERE ce.customer_id = c.id ORDER BY date DESC, id DESC LIMIT 1) AS balance
//     FROM customers c
//     ORDER BY ABS(COALESCE((SELECT balance FROM customer_entries ce WHERE ce.customer_id = c.id ORDER BY date DESC, id DESC LIMIT 1),0)) DESC NULLS LAST
//     LIMIT 10
//   `);
//   return rows.rows as { id: number; name: string; address: string; phone: string; balance: string }[];
// }

// export default async function DashboardPage() {
//   const session = await getServerSession(authOptions);
//   if (!session) redirect("/");

//   const [stats, customerBalances] = await Promise.all([getStats(), getTopCustomerBalances()]);
//   const isProfit = stats.profit >= 0;

//   const statCards = [
//     { label: "Total Sales", value: formatMoney(stats.totalSales), accent: "border-l-emerald-500", text: "text-emerald-600" },
//     { label: "Total Purchasing", value: formatMoney(stats.totalPurchasing), accent: "border-l-rose-500", text: "text-rose-600" },
//     { label: "Total Expenses", value: formatMoney(stats.totalExpenses), accent: "border-l-amber-500", text: "text-amber-600" },
//     { label: "Salary Paid", value: formatMoney(stats.totalSalary), accent: "border-l-violet-500", text: "text-violet-600" },
//   ];

//   return (
//     <div className="space-y-8">
//       <div>
//         <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-600 font-mono">Overview</p>
//         <h1 className="mt-1 text-2xl font-display font-bold uppercase tracking-wide text-gray-900">Business Dashboard</h1>
//         <p className="mt-1 text-sm text-gray-400">Live numbers across all ledgers — sales, purchasing, expenses and salary.</p>
//       </div>

//       <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
//         {statCards.map((c) => (
//           <div key={c.label} className={`bg-white rounded-2xl border border-gray-100 border-l-4 ${c.accent} shadow-sm p-5`}>
//             <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{c.label}</p>
//             <p className={`mt-2 font-mono text-[17px] font-semibold ${c.text}`}>{c.value}</p>
//           </div>
//         ))}
//       </div>

//       <div className={`rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border ${isProfit ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
//         <div>
//           <p className={`text-[11px] font-semibold uppercase tracking-wider ${isProfit ? "text-emerald-600" : "text-rose-600"}`}>{isProfit ? "Net Profit" : "Net Loss"}</p>
//           <p className={`mt-1 font-mono text-3xl font-bold ${isProfit ? "text-emerald-700" : "text-rose-700"}`}>{formatMoney(Math.abs(stats.profit))}</p>
//           <p className={`mt-1 text-sm ${isProfit ? "text-emerald-600/80" : "text-rose-600/80"}`}>{stats.margin.toFixed(1)}% margin — Sales vs. (Purchasing + Expenses + Salary)</p>
//         </div>
//         <div className="flex gap-8 text-sm">
//           <div>
//             <p className="text-[11px] text-gray-400 uppercase tracking-wider">Customers</p>
//             <p className="font-mono font-semibold text-gray-800 mt-0.5 text-lg">{stats.custCount}</p>
//           </div>
//           <div>
//             <p className="text-[11px] text-gray-400 uppercase tracking-wider">Outstanding</p>
//             <p className={`font-mono font-semibold mt-0.5 text-lg ${stats.outstanding > 0 ? "text-amber-600" : "text-gray-800"}`}>{formatMoney(stats.outstanding)}</p>
//           </div>
//         </div>
//       </div>

//       <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
//         <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
//           <h2 className="font-display font-semibold uppercase text-sm tracking-wide text-gray-700">Customer Balances</h2>
//           <Link href="/dashboard/customers" className="text-xs text-amber-600 hover:text-amber-700 font-semibold uppercase tracking-wider">View all →</Link>
//         </div>
//         <div className="overflow-x-auto">
//           <table className="w-full text-sm">
//             <thead>
//               <tr className="bg-gray-50 border-b border-gray-100">
//                 <th className="text-left px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Customer</th>
//                 <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Address</th>
//                 <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Phone</th>
//                 <th className="text-right px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Balance</th>
//               </tr>
//             </thead>
//             <tbody className="divide-y divide-gray-50">
//               {customerBalances.length === 0 ? (
//                 <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400 text-sm">No customers yet. <Link href="/dashboard/customers" className="text-amber-600 hover:underline">Add one →</Link></td></tr>
//               ) : customerBalances.map((c) => {
//                 const bal = toNum(c.balance);
//                 return (
//                   <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
//                     <td className="px-6 py-3.5">
//                       <Link href={`/dashboard/customers/${c.id}`} className="font-semibold text-gray-800 hover:text-amber-700 transition-colors">{c.name}</Link>
//                     </td>
//                     <td className="px-4 py-3.5 text-gray-400 text-xs">{c.address || "—"}</td>
//                     <td className="px-4 py-3.5 text-gray-400 text-xs">{c.phone || "—"}</td>
//                     <td className={`px-6 py-3.5 text-right font-mono font-semibold text-[13px] ${bal > 0 ? "text-amber-600" : bal < 0 ? "text-emerald-600" : "text-gray-400"}`}>{formatMoney(bal)}</td>
//                   </tr>
//                 );
//               })}
//             </tbody>
//           </table>
//         </div>
//       </div>
//     </div>
//   );
// }


import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { sales, purchasing, expenses, salary, customers, customerEntries } from "@/db/schema";
import { sql } from "drizzle-orm";
import { formatMoney, toNum } from "@/lib/utils";
import Link from "next/link";
import { TrendingUp, TrendingDown, Receipt, Wallet, Users, ArrowUpRight, Gauge } from "lucide-react";

async function getStats() {
  const [[{ totalSales }], [{ totalPurch }], [{ totalExp }], [{ totalSal }], [{ custCount }]] =
    await Promise.all([
      db.select({ totalSales: sql<string>`COALESCE(SUM(amount),0)` }).from(sales),
      db.select({ totalPurch: sql<string>`COALESCE(SUM(amount),0)` }).from(purchasing),
      db.select({ totalExp: sql<string>`COALESCE(SUM(amount),0)` }).from(expenses),
      db.select({ totalSal: sql<string>`COALESCE(SUM(amount),0)` }).from(salary),
      db.select({ custCount: sql<string>`COUNT(*)` }).from(customers),
    ]);

  const latestBal = await db.execute(sql`
    SELECT COALESCE(SUM(latest_bal), 0) AS total_outstanding
    FROM (
      SELECT DISTINCT ON (customer_id) balance AS latest_bal
      FROM customer_entries
      ORDER BY customer_id, date DESC, id DESC
    ) sub
  `);

  const outstanding = toNum((latestBal.rows[0] as Record<string, string>).total_outstanding);
  const s = toNum(totalSales), p = toNum(totalPurch), e = toNum(totalExp), sal = toNum(totalSal);
  const profit = s - (p + e + sal);
  const margin = s > 0 ? (profit / s) * 100 : 0;
  return { totalSales: s, totalPurchasing: p, totalExpenses: e, totalSalary: sal, profit, margin, outstanding, custCount: Number(custCount) };
}

async function getTopCustomerBalances() {
  const rows = await db.execute(sql`
    SELECT c.id, c.name, c.address, c.phone,
      (SELECT balance FROM customer_entries ce WHERE ce.customer_id = c.id ORDER BY date DESC, id DESC LIMIT 1) AS balance
    FROM customers c
    ORDER BY ABS(COALESCE((SELECT balance FROM customer_entries ce WHERE ce.customer_id = c.id ORDER BY date DESC, id DESC LIMIT 1),0)) DESC NULLS LAST
    LIMIT 10
  `);
  return rows.rows as { id: number; name: string; address: string; phone: string; balance: string }[];
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/");

  const [stats, customerBalances] = await Promise.all([getStats(), getTopCustomerBalances()]);
  const isProfit = stats.profit >= 0;

  const statCards = [
    { label: "Total Sales", value: formatMoney(stats.totalSales), icon: TrendingUp, ring: "ring-emerald-500/15", dot: "bg-emerald-500", text: "text-emerald-600" },
    { label: "Total Purchasing", value: formatMoney(stats.totalPurchasing), icon: TrendingDown, ring: "ring-rose-500/15", dot: "bg-rose-500", text: "text-rose-600" },
    { label: "Total Expenses", value: formatMoney(stats.totalExpenses), icon: Receipt, ring: "ring-amber-500/15", dot: "bg-[#D97706]", text: "text-[#D97706]" },
    { label: "Salary Paid", value: formatMoney(stats.totalSalary), icon: Wallet, ring: "ring-violet-500/15", dot: "bg-violet-500", text: "text-violet-600" },
  ];

  // margin gauge geometry (semi-circle, 0–100 clamped for the arc fill)
  const marginClamped = Math.max(0, Math.min(100, stats.margin));
  const CIRC = 251; // circumference of the visible arc path
  const dash = (marginClamped / 100) * CIRC;

  return (
    <div className="space-y-6 sm:space-y-8 pb-10">
      {/* ── Header ─────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#D97706] font-mono">Ledger · 00 / 06</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-display font-bold uppercase tracking-wide text-[#0B0D12]">
          Business Dashboard
        </h1>
        <p className="mt-1 text-sm text-black/40">Live numbers across all ledgers — sales, purchasing, expenses and salary.</p>
      </div>

      {/* ── Stat grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((c) => (
          <div
            key={c.label}
            className="group relative bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4 sm:p-5 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.1)] transition-shadow"
          >
            <div className={`w-9 h-9 rounded-xl bg-black/[0.03] ring-1 ${c.ring} flex items-center justify-center`}>
              <c.icon className={`w-4 h-4 ${c.text}`} strokeWidth={2} />
            </div>
            <p className="mt-3 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-black/35">{c.label}</p>
            <p className={`mt-1.5 font-mono text-base sm:text-[19px] font-bold tabular-nums ${c.text}`}>{c.value}</p>
            <span className={`absolute top-4 sm:top-5 right-4 sm:right-5 w-1.5 h-1.5 rounded-full ${c.dot}`} />
          </div>
        ))}
      </div>

      {/* ── Hero: Net profit / loss ────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0B0D12] p-6 sm:p-8">
        <div className={`absolute -right-16 -top-16 w-56 h-56 rounded-full blur-3xl ${isProfit ? "bg-emerald-500/10" : "bg-rose-500/10"}`} />

        <div className="relative flex flex-col lg:flex-row lg:items-center gap-8">
          {/* Margin gauge */}
          <div className="flex-shrink-0 flex items-center gap-5">
            <div className="relative w-[110px] h-[110px]">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#FFFFFF14" strokeWidth="9" />
                <circle
                  cx="50" cy="50" r="40" fill="none"
                  stroke={isProfit ? "#10B981" : "#F43F5E"}
                  strokeWidth="9" strokeLinecap="round"
                  strokeDasharray={`${dash} ${CIRC}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Gauge className="w-3.5 h-3.5 text-white/25 mb-0.5" strokeWidth={2} />
                <p className="font-mono font-bold text-white text-lg leading-none">{stats.margin.toFixed(1)}%</p>
              </div>
            </div>
            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] font-mono ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                {isProfit ? "Net profit" : "Net loss"}
              </p>
              <p className="mt-1 font-mono text-3xl sm:text-4xl font-bold text-white tabular-nums">
                {formatMoney(Math.abs(stats.profit))}
              </p>
              <p className="mt-1 text-xs text-white/35 max-w-[260px]">Margin against Sales vs. (Purchasing + Expenses + Salary)</p>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px h-16 bg-white/10" />

          {/* Secondary stats */}
          <div className="flex gap-8 sm:gap-10 lg:ml-auto">
            <div>
              <p className="flex items-center gap-1.5 text-[10px] text-white/35 uppercase tracking-wider font-mono">
                <Users className="w-3 h-3" strokeWidth={2} /> Customers
              </p>
              <p className="font-mono font-bold text-white mt-1 text-xl tabular-nums">{stats.custCount}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wider font-mono">Outstanding</p>
              <p className={`font-mono font-bold mt-1 text-xl tabular-nums ${stats.outstanding > 0 ? "text-[#F59E0B]" : "text-white"}`}>
                {formatMoney(stats.outstanding)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Customer balances ──────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-black/[0.06] flex items-center justify-between">
          <h2 className="font-display font-semibold uppercase text-sm tracking-wide text-[#0B0D12]">Customer Balances</h2>
          <Link
            href="/dashboard/customers"
            className="inline-flex items-center gap-1 text-xs text-[#D97706] hover:text-[#B45309] font-semibold uppercase tracking-wider transition-colors"
          >
            View all <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={2.5} />
          </Link>
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black/[0.015] border-b border-black/[0.06]">
                <th className="text-left px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-black/35">Customer</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-black/35">Address</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-black/35">Phone</th>
                <th className="text-right px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-black/35">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {customerBalances.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-black/35 text-sm">
                    No customers yet.{" "}
                    <Link href="/dashboard/customers" className="text-[#D97706] hover:underline font-medium">Add one →</Link>
                  </td>
                </tr>
              ) : customerBalances.map((c) => {
                const bal = toNum(c.balance);
                return (
                  <tr key={c.id} className="hover:bg-black/[0.015] transition-colors">
                    <td className="px-6 py-3.5">
                      <Link href={`/dashboard/customers/${c.id}`} className="font-semibold text-[#0B0D12] hover:text-[#D97706] transition-colors">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-black/35 text-xs">{c.address || "—"}</td>
                    <td className="px-4 py-3.5 text-black/35 text-xs font-mono">{c.phone || "—"}</td>
                    <td className={`px-6 py-3.5 text-right font-mono font-semibold text-[13px] tabular-nums ${bal > 0 ? "text-[#D97706]" : bal < 0 ? "text-emerald-600" : "text-black/35"}`}>
                      {formatMoney(bal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="sm:hidden divide-y divide-black/[0.04]">
          {customerBalances.length === 0 ? (
            <div className="px-6 py-12 text-center text-black/35 text-sm">
              No customers yet.{" "}
              <Link href="/dashboard/customers" className="text-[#D97706] hover:underline font-medium">Add one →</Link>
            </div>
          ) : customerBalances.map((c) => {
            const bal = toNum(c.balance);
            return (
              <Link
                key={c.id}
                href={`/dashboard/customers/${c.id}`}
                className="flex items-center justify-between gap-3 px-5 py-3.5 active:bg-black/[0.02]"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#0B0D12] text-sm truncate">{c.name}</p>
                  <p className="text-black/35 text-[11px] mt-0.5 truncate">{c.phone || c.address || "—"}</p>
                </div>
                <p className={`font-mono font-semibold text-sm tabular-nums flex-shrink-0 ${bal > 0 ? "text-[#D97706]" : bal < 0 ? "text-emerald-600" : "text-black/35"}`}>
                  {formatMoney(bal)}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}