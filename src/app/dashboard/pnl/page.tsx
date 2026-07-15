"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { formatMoney, monthLabel } from "@/lib/utils";

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

export default function PnlPage() {
  const [data, setData] = useState<PnlData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<PnlData>("/pnl").then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-6 w-48 bg-gray-100 rounded animate-pulse" />
      <div className="h-80 bg-gray-100 rounded-2xl animate-pulse" />
    </div>
  );

  const g = data?.grand;
  const isProfit = (g?.profit ?? 0) >= 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600 font-mono">Analysis</p>
        <h1 className="mt-1 text-2xl font-display font-bold uppercase tracking-wide text-gray-900">Profit & Loss</h1>
        <p className="mt-1 text-sm text-gray-400">Monthly breakdown of sales against all costs — purchasing, expenses and salary.</p>
      </div>

      {/* Grand total banner */}
      {g && (
        <div className={`rounded-2xl p-6 border ${isProfit ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${isProfit ? "text-emerald-600" : "text-rose-600"}`}>
            {isProfit ? "Overall Net Profit" : "Overall Net Loss"}
          </p>
          <p className={`mt-1 font-mono text-4xl font-bold ${isProfit ? "text-emerald-700" : "text-rose-700"}`}>
            {formatMoney(Math.abs(g.profit))}
          </p>
          <p className={`mt-1.5 text-sm ${isProfit ? "text-emerald-600/80" : "text-rose-600/80"}`}>
            {g.margin.toFixed(1)}% profit margin — All time
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-6 pt-6 border-t border-current/10">
            <div><p className="text-[11px] text-gray-500 uppercase tracking-wider">Total Sales</p><p className="font-mono font-bold text-gray-900 mt-0.5">{formatMoney(g.sales)}</p></div>
            <div><p className="text-[11px] text-gray-500 uppercase tracking-wider">Purchasing</p><p className="font-mono font-bold text-gray-900 mt-0.5">{formatMoney(g.purchasing)}</p></div>
            <div><p className="text-[11px] text-gray-500 uppercase tracking-wider">Expenses</p><p className="font-mono font-bold text-gray-900 mt-0.5">{formatMoney(g.expenses)}</p></div>
            <div><p className="text-[11px] text-gray-500 uppercase tracking-wider">Salary</p><p className="font-mono font-bold text-gray-900 mt-0.5">{formatMoney(g.salary)}</p></div>
          </div>
        </div>
      )}

      {/* Monthly table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="bg-[#111318] text-white">
                {[
                  { label: "Month", align: "text-left" },
                  { label: "Sales", align: "text-right" },
                  { label: "Purchasing", align: "text-right" },
                  { label: "Expenses", align: "text-right" },
                  { label: "Salary", align: "text-right" },
                  { label: "Total Cost", align: "text-right" },
                  { label: "Profit / Loss", align: "text-right" },
                  { label: "Margin", align: "text-right" },
                ].map(({ label, align }) => (
                  <th key={label} className={`py-3 px-4 text-[11px] font-semibold uppercase tracking-wider ${align}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!data || data.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-gray-400 text-sm">
                    No data yet. Add sales, purchases, expenses and salary to see P&L.
                  </td>
                </tr>
              ) : data.rows.map((r) => {
                const isP = r.profit >= 0;
                return (
                  <tr key={r.month} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3.5 font-semibold text-gray-800">{monthLabel(r.month)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-emerald-600 font-semibold">{formatMoney(r.sales)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-gray-500">{formatMoney(r.purchasing)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-gray-500">{formatMoney(r.expenses)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-gray-500">{formatMoney(r.salary)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-rose-600">{formatMoney(r.totalCost)}</td>
                    <td className={`px-4 py-3.5 text-right font-mono font-bold ${isP ? "text-emerald-600" : "text-rose-600"}`}>
                      {isP ? "" : "−"}{formatMoney(Math.abs(r.profit))}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full ${isP ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                        {r.margin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {g && data && data.rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                  <td className="px-4 py-3.5 text-[12px] uppercase tracking-wider text-gray-600">Grand Total</td>
                  <td className="px-4 py-3.5 text-right font-mono text-emerald-700">{formatMoney(g.sales)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-gray-600">{formatMoney(g.purchasing)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-gray-600">{formatMoney(g.expenses)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-gray-600">{formatMoney(g.salary)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-rose-700">{formatMoney(g.totalCost)}</td>
                  <td className={`px-4 py-3.5 text-right font-mono text-[14px] ${isProfit ? "text-emerald-700" : "text-rose-700"}`}>
                    {isProfit ? "" : "−"}{formatMoney(Math.abs(g.profit))}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full ${isProfit ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      {g.margin.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
