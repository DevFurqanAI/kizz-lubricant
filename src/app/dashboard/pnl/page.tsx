"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { formatMoney, monthLabel } from "@/lib/utils";
import { createLocalCache } from "@/lib/localCache";
import { saveOrShareBlob } from "@/lib/file-download";
import { EmptyState, ErrorState } from "@/components/states";
import { ProfitBars, SalesCostBars, CostDonut, COST_PURCHASING, COST_EXPENSES, COST_SALARY } from "@/components/charts";
import { RangeFilter } from "@/components/range-filter";
import { filterPnlRows, recomputePnlGrand, describeRange, type PnlMonthRow, type RangeSelection } from "@/lib/pnl-range";
import { useToast } from "@/components/toast";
import { BarChart3, FileSpreadsheet } from "lucide-react";

type MonthRow = PnlMonthRow;

type PnlData = {
  rows: MonthRow[];
  grand: Omit<MonthRow, "month">;
};

const pnlCache = createLocalCache<PnlData>("pnl", { ttlMs: 5 * 60_000 });

export default function PnlPage() {
  const cached0 = pnlCache.get("");
  const [data, setData] = useState<PnlData | null>(cached0 ?? null);
  const [loading, setLoading] = useState(!cached0);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [range, setRange] = useState<RangeSelection>({ preset: "all" });
  const toast = useToast();

  const filteredRows = useMemo(() => filterPnlRows(data?.rows ?? [], range), [data, range]);
  const filteredGrand = useMemo(() => recomputePnlGrand(filteredRows), [filteredRows]);

  const load = useCallback(() => {
    setError(false);
    api.get<PnlData>("/pnl")
      .then((d) => { pnlCache.set("", d); setData(d); })
      .catch(() => { if (!pnlCache.get("")) setError(true); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-6 w-48 bg-black/[0.04] rounded animate-pulse" />
      <div className="h-80 bg-black/[0.04] rounded-2xl animate-pulse" />
    </div>
  );

  if (error && !data) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold text-ink">Profit &amp; Loss</h1>
      </div>
      <div className="card"><ErrorState onRetry={() => { setLoading(true); load(); }} /></div>
    </div>
  );

  const g = filteredGrand;
  const isProfit = g.profit >= 0;

  const exportXlsx = async () => {
    if (!data || filteredRows.length === 0) return;
    setExporting(true);
    try {
      const { buildPnlXlsx } = await import("@/lib/reports-xlsx");
      const blob = await buildPnlXlsx(filteredRows, g, `Range: ${describeRange(range)}`);
      const rangeSuffix = (() => {
        if (range.preset !== "custom") return range.preset;
        let { from, to } = range;
        if (from > to) [from, to] = [to, from];
        return `${from}_to_${to}`;
      })();
      await saveOrShareBlob(blob, `profit_loss_export_${rangeSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast.error("Couldn't export profit & loss");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Profit &amp; Loss</h1>
          <p className="mt-1 text-sm text-muted">Month by month: what you sold, minus everything you spent, and what was left.</p>
        </div>
        {data && data.rows.length > 0 && (
          <button onClick={exportXlsx} disabled={exporting || filteredRows.length === 0} className="btn-secondary">
            <FileSpreadsheet className="w-4 h-4" strokeWidth={2} />
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
        )}
      </div>

      {data && data.rows.length > 0 && (
        <RangeFilter rows={data.rows} value={range} onChange={setRange} />
      )}

      {/* Grand total banner — reflects the active range filter */}
      {data && (
        <div className="card p-6">
          <div className="flex items-center gap-2">
            <span className={`badge ${isProfit ? "bg-success-tint text-success" : "bg-danger-tint text-danger"}`}>
              {isProfit ? "Net Profit" : "Net Loss"}
            </span>
            <span className="text-xs text-muted">{g.margin.toFixed(1)}% margin — {describeRange(range)}</span>
          </div>
          <p className={`mt-3 font-mono text-4xl font-semibold tabular-nums ${isProfit ? "text-ink" : "text-danger"}`}>
            {formatMoney(Math.abs(g.profit))}
          </p>
          <p className="mt-2 text-[13px] text-muted">
            Sales <span className="font-medium text-ink">{formatMoney(g.sales)}</span> minus all costs{" "}
            <span className="font-medium text-ink">{formatMoney(g.totalCost)}</span>.{" "}
            {isProfit ? "You kept what's left." : "You spent more than you earned."}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-6 pt-6 border-t border-line">
            <div><p className="text-[11px] text-muted uppercase tracking-wider">Total Sales</p><p className="font-mono font-semibold text-ink mt-0.5 tabular-nums">{formatMoney(g.sales)}</p></div>
            <div><p className="text-[11px] text-muted uppercase tracking-wider">Purchasing</p><p className="font-mono font-semibold text-ink mt-0.5 tabular-nums">{formatMoney(g.purchasing)}</p></div>
            <div><p className="text-[11px] text-muted uppercase tracking-wider">Expenses</p><p className="font-mono font-semibold text-ink mt-0.5 tabular-nums">{formatMoney(g.expenses)}</p></div>
            <div><p className="text-[11px] text-muted uppercase tracking-wider">Salary</p><p className="font-mono font-semibold text-ink mt-0.5 tabular-nums">{formatMoney(g.salary)}</p></div>
          </div>
        </div>
      )}

      {/* Charts — sales vs. costs, profit/loss per month, and the cost mix */}
      {filteredRows.length > 1 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="card overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-line">
              <h2 className="text-[15px] font-semibold text-ink">Sales vs. costs</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">
                <span className="text-accent font-medium">Orange</span> = sales,{" "}
                <span className="font-medium text-muted">grey</span> = total cost, each month.
              </p>
            </div>
            <div className="p-3 sm:p-4">
              <SalesCostBars data={filteredRows.map((r) => ({ label: monthLabel(r.month), sales: r.sales, cost: r.totalCost }))} />
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-line">
              <h2 className="text-[15px] font-semibold text-ink">Monthly profit / loss</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">
                <span className="text-success font-medium">Green</span> = profit,{" "}
                <span className="text-danger font-medium">red</span> = loss, each month.
              </p>
            </div>
            <div className="p-3 sm:p-4">
              <ProfitBars data={filteredRows.map((r) => ({ label: monthLabel(r.month), value: r.profit, margin: r.margin }))} />
            </div>
          </div>
        </div>
      )}

      {filteredRows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-line">
            <h2 className="text-[15px] font-semibold text-ink">Cost composition</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">Where your money went, {describeRange(range)}.</p>
          </div>
          <div className="p-5 sm:p-6">
            <CostDonut
              data={[
                { label: "Purchasing", value: g.purchasing, color: COST_PURCHASING },
                { label: "Expenses", value: g.expenses, color: COST_EXPENSES },
                { label: "Salary", value: g.salary, color: COST_SALARY },
              ]}
            />
          </div>
        </div>
      )}

      {/* Monthly table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="bg-black/[0.02] border-b border-line">
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
                  <th key={label} className={`th ${align}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={BarChart3}
                      compact
                      title="Nothing to analyse yet"
                      description="Add sales, purchases, expenses and salary, and your monthly profit &amp; loss will build here."
                    />
                  </td>
                </tr>
              ) : filteredRows.map((r) => {
                const isP = r.profit >= 0;
                return (
                  <tr key={r.month} className="hover:bg-black/[0.015] transition-colors">
                    <td className="px-4 py-3.5 font-medium text-ink">{monthLabel(r.month)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-ink tabular-nums">{formatMoney(r.sales)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-muted tabular-nums">{formatMoney(r.purchasing)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-muted tabular-nums">{formatMoney(r.expenses)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-muted tabular-nums">{formatMoney(r.salary)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-muted tabular-nums">{formatMoney(r.totalCost)}</td>
                    <td className={`px-4 py-3.5 text-right font-mono font-semibold tabular-nums ${isP ? "text-success" : "text-danger"}`}>
                      {isP ? "" : "−"}{formatMoney(Math.abs(r.profit))}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className={`badge ${isP ? "bg-success-tint text-success" : "bg-danger-tint text-danger"}`}>
                        {r.margin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {data && filteredRows.length > 0 && (
              <tfoot>
                <tr className="border-t border-line bg-black/[0.02] font-semibold">
                  <td className="px-4 py-3.5 text-[12px] uppercase tracking-wider text-muted">Grand Total</td>
                  <td className="px-4 py-3.5 text-right font-mono text-ink tabular-nums">{formatMoney(g.sales)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-muted tabular-nums">{formatMoney(g.purchasing)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-muted tabular-nums">{formatMoney(g.expenses)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-muted tabular-nums">{formatMoney(g.salary)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-muted tabular-nums">{formatMoney(g.totalCost)}</td>
                  <td className={`px-4 py-3.5 text-right font-mono text-[14px] tabular-nums ${isProfit ? "text-success" : "text-danger"}`}>
                    {isProfit ? "" : "−"}{formatMoney(Math.abs(g.profit))}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={`badge ${isProfit ? "bg-success-tint text-success" : "bg-danger-tint text-danger"}`}>
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
