

"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { api, fetchAllRows } from "@/lib/api";
import { formatMoney, fmtDate } from "@/lib/utils";
import { createLocalCache } from "@/lib/localCache"
import { dashboardCache } from "@/lib/dashboard-cache";
import { saveOrShareBlob } from "@/lib/file-download";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { SortHeader, SortToggleButton, type Sort, nextSort } from "@/components/sort-header";
import { SearchInput } from "@/components/search-input";
import { DateRangeFilter } from "@/components/date-range-filter";
import { AmountRangeFilter } from "@/components/amount-range-filter";
import { FilterBar } from "@/components/filter-bar";
import { resolveDateRange, encodeDateRange, decodeDateRange, type DateRangeSelection } from "@/lib/date-range";
import { buildQueryString } from "@/lib/url-filter-sync";
import { useContentFadeKey } from "@/lib/use-fade-key";
import { TrendingDown, FileSpreadsheet, Pencil, Trash2, Check, X } from "lucide-react";
import { validateAmountEntry, hasErrors, firstError, type FieldErrors } from "@/lib/validation";

type Row = { id: number; date: string; detail: string; amount: string };
type PurchasingData = { rows: Row[]; total: number; count: number };

const PAGE_SIZE = 50;
const purchasingCache = createLocalCache<PurchasingData>("purchasing", { ttlMs: 5 * 60_000 });
const keyFor = (q: string, s: Sort, p: number, from: string | null, to: string | null, amountMin: string, amountMax: string) =>
  `${q}|${s.col}|${s.dir}|p${p}|${from ?? ""}|${to ?? ""}|${amountMin}|${amountMax}`;

export default function PurchasingPage() {
  const initSort: Sort = { col: "date", dir: "desc" };
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const cached0 = purchasingCache.get(keyFor("", initSort, 1, null, null, "", ""));
  const [rows, setRows] = useState<Row[]>(cached0?.rows ?? []);
  const [total, setTotal] = useState(cached0?.total ?? 0);
  const [count, setCount] = useState(cached0?.count ?? 0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>(initSort);
  const [loading, setLoading] = useState(!cached0);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeSelection>({ preset: "all" });
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), detail: "", amount: "" });
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ date: "", detail: "", amount: "" });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (q: string, p: number, s: Sort, from: string | null, to: string | null, amountMin: string, amountMax: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) { setLoading(true); setError(false); }
    try {
      const qs = new URLSearchParams({ search: q, page: String(p), limit: String(PAGE_SIZE), sort: s.col, dir: s.dir });
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      if (amountMin) qs.set("amountMin", amountMin);
      if (amountMax) qs.set("amountMax", amountMax);
      const data = await api.get<PurchasingData>(`/purchasing?${qs}`);
      purchasingCache.set(keyFor(q, s, p, from, to, amountMin, amountMax), data);
      setRows(data.rows); setTotal(data.total); setCount(data.count);
    } catch {
      if (!opts?.silent) setError(true);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialSearch = searchParams.get("search")?.trim() ?? "";
    const initialRange = decodeDateRange(searchParams);
    const initialAmountMin = searchParams.get("amountMin") ?? "";
    const initialAmountMax = searchParams.get("amountMax") ?? "";
    setSearch(initialSearch);
    setDateRange(initialRange);
    setAmountMin(initialAmountMin);
    setAmountMax(initialAmountMax);
    const { from, to } = resolveDateRange(initialRange);
    if (initialSearch || initialRange.preset !== "all" || initialAmountMin || initialAmountMax) {
      setPage(1);
      load(initialSearch, 1, initSort, from, to, initialAmountMin, initialAmountMax);
      return;
    }
    const cached = purchasingCache.get(keyFor("", initSort, 1, from, to, "", ""));
    if (cached) {
      setRows(cached.rows); setTotal(cached.total); setCount(cached.count);
      setLoading(false);
      load("", 1, initSort, from, to, "", "", { silent: true });
    } else {
      load("", 1, initSort, from, to, "", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncUrl = (overrides: Partial<{ search: string; dateRange: DateRangeSelection; amountMin: string; amountMax: string; sort: Sort; page: number }> = {}) => {
    const s = overrides.search ?? search;
    const dr = overrides.dateRange ?? dateRange;
    const aMin = overrides.amountMin ?? amountMin;
    const aMax = overrides.amountMax ?? amountMax;
    const srt = overrides.sort ?? sort;
    const p = overrides.page ?? page;
    router.replace(`${pathname}?${buildQueryString({ search: s, ...encodeDateRange(dr), amountMin: aMin, amountMax: aMax, sort: srt.col, dir: srt.dir, page: p })}`, { scroll: false });
  };

  const applyView = (q: string, p: number, s: Sort, from: string | null, to: string | null) => {
    const cached = purchasingCache.get(keyFor(q, s, p, from, to, amountMin, amountMax));
    if (cached) { setRows(cached.rows); setTotal(cached.total); setCount(cached.count); }
    load(q, p, s, from, to, amountMin, amountMax);
  };

  const handleSearch = (v: string) => {
    setSearch(v); setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const { from, to } = resolveDateRange(dateRange);
      applyView(v, 1, sort, from, to);
      syncUrl({ search: v, page: 1 });
    }, 300);
  };
  const onSort = (col: string) => {
    const s = nextSort(sort, col); setSort(s); setPage(1);
    const { from, to } = resolveDateRange(dateRange);
    applyView(search, 1, s, from, to);
    syncUrl({ sort: s, page: 1 });
  };
  const goPage = (p: number) => {
    setPage(p);
    const { from, to } = resolveDateRange(dateRange);
    applyView(search, p, sort, from, to);
    syncUrl({ page: p });
  };

  const handleFilterChange = (next: Partial<{ amountMin: string; amountMax: string }>) => {
    const nextMin = next.amountMin ?? amountMin;
    const nextMax = next.amountMax ?? amountMax;
    setAmountMin(nextMin); setAmountMax(nextMax);
    setPage(1);
    const { from, to } = resolveDateRange(dateRange);
    load(search, 1, sort, from, to, nextMin, nextMax);
    syncUrl({ amountMin: nextMin, amountMax: nextMax, page: 1 });
  };

  const clearFilters = () => {
    setDateRange({ preset: "all" }); setAmountMin(""); setAmountMax(""); setPage(1);
    load(search, 1, sort, null, null, "", "");
    syncUrl({ dateRange: { preset: "all" }, amountMin: "", amountMax: "", page: 1 });
  };

  const handleSave = async () => {
    const errs = validateAmountEntry(form);
    if (hasErrors(errs)) { setFormErrors(errs); toast.error(firstError(errs)!); return; }
    setFormErrors({});
    setSaving(true);
    try {
      await api.post<Row>("/purchasing", { ...form, amount: Number(form.amount) });
      setForm({ date: new Date().toISOString().slice(0,10), detail: "", amount: "" });
      setShowForm(false);
      purchasingCache.clear();
      dashboardCache.clear();
      setPage(1);
      const { from, to } = resolveDateRange(dateRange);
      load(search, 1, sort, from, to, amountMin, amountMax);
      toast.success("Purchase added");
    } catch { toast.error("Couldn't add purchase"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm({ title: "Delete this purchase?", confirmText: "Delete", danger: true }))) return;
    const prevRows = rows, prevTotal = total, prevCount = count;
    const del = rows.find(r => r.id === id);
    setRows(r => r.filter(row => row.id !== id));
    if (del) setTotal(t => t - Number(del.amount));
    setCount(c => Math.max(0, c - 1));
    try {
      await api.del(`/purchasing/${id}`);
      purchasingCache.clear();
      dashboardCache.clear();
      const newCount = Math.max(0, prevCount - 1);
      const maxPage = Math.max(1, Math.ceil(newCount / PAGE_SIZE));
      const nextPage = Math.min(page, maxPage);
      if (nextPage !== page) { setPage(nextPage); syncUrl({ page: nextPage }); }
      const { from, to } = resolveDateRange(dateRange);
      load(search, nextPage, sort, from, to, amountMin, amountMax, { silent: true });
      toast.success("Purchase deleted");
    } catch { setRows(prevRows); setTotal(prevTotal); setCount(prevCount); toast.error("Couldn't delete purchase"); }
  };

  const startEdit = (r: Row) => { setEditId(r.id); setEditForm({ date: r.date.slice(0,10), detail: r.detail, amount: r.amount }); };
  const saveEdit = async (id: number) => {
    const errs = validateAmountEntry(editForm);
    if (hasErrors(errs)) { toast.error(firstError(errs)!); return; }
    const prevRows = rows;
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...editForm } : r));
    setEditId(null);
    try {
      await api.patch(`/purchasing/${id}`, { ...editForm, amount: Number(editForm.amount) });
      purchasingCache.clear();
      dashboardCache.clear();
      const { from, to } = resolveDateRange(dateRange);
      load(search, page, sort, from, to, amountMin, amountMax, { silent: true });
      toast.success("Purchase updated");
    } catch { setRows(prevRows); toast.error("Couldn't update purchase"); }
  };

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const { from, to } = resolveDateRange(dateRange);
      const params: Record<string, string> = { search, sort: sort.col, dir: sort.dir };
      if (from) params.from = from;
      if (to) params.to = to;
      if (amountMin) params.amountMin = amountMin;
      if (amountMax) params.amountMax = amountMax;
      const all = await fetchAllRows<Row>("/purchasing", params);
      const { buildPurchasingXlsx } = await import("@/lib/reports-xlsx");
      const blob = await buildPurchasingXlsx(all, search ? `Filtered: "${search}"` : undefined);
      await saveOrShareBlob(blob, `purchasing_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast.error("Couldn't export purchasing");
    } finally {
      setExporting(false);
    }
  };

  const handleDateRangeChange = (v: DateRangeSelection) => {
    setDateRange(v); setPage(1);
    const { from, to } = resolveDateRange(v);
    const cached = purchasingCache.get(keyFor(search, sort, 1, from, to, amountMin, amountMax));
    if (cached) { setRows(cached.rows); setTotal(cached.total); setCount(cached.count); }
    load(search, 1, sort, from, to, amountMin, amountMax);
    syncUrl({ dateRange: v, page: 1 });
  };

  const rowsFadeKey = useContentFadeKey(rows);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[26px] font-semibold text-ink">Purchasing</h1>
            {count > 0 && <span className="badge-neutral tabular-nums">{count.toLocaleString()}</span>}
          </div>
          <p className="mt-1 text-sm text-muted">Oil, drums, chemicals and other stock you buy — money going out.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportXlsx} disabled={exporting || rows.length === 0} className="btn-secondary">
            <FileSpreadsheet className="w-4 h-4" strokeWidth={2} />
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
          <button onClick={() => setShowForm(s => !s)} className="btn-primary">+ Add Purchasing</button>
        </div>
      </div>

      {showForm && (
        <div className="rise card p-6">
          <h3 className="font-semibold text-ink mb-4">New Entry</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[{ key: "date", label: "Date", type: "date" }, { key: "detail", label: "Detail *", type: "text" }, { key: "amount", label: "Amount (Rs) *", type: "number" }].map(({ key, label, type }) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input type={type} value={(form as Record<string, string>)[key]} onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setFormErrors(er => ({ ...er, [key]: "" })); }} className={`input py-2.5 text-sm${formErrors[key] ? " ring-1 ring-danger" : ""}`} />
                {formErrors[key] && <p className="mt-1 text-xs text-danger">{formErrors[key]}</p>}
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving || !form.detail || !form.amount} className="btn-primary">{saving ? "Saving…" : "Save"}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <SortToggleButton sort={sort} onSort={onSort} />
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] text-muted uppercase tracking-wider">Total</p>
          <p className="font-mono font-semibold text-ink tabular-nums">{formatMoney(total)}</p>
        </div>
      </div>

      {/* Filters live on their own full-width row, never sharing space with the
          Total block above — selecting a filter option only ever reflows this row. */}
      <FilterBar active={!!(search || dateRange.preset !== "all" || amountMin || amountMax)} onClear={clearFilters}>
        <SearchInput value={search} onChange={handleSearch} placeholder="Search purchases…" className="w-full max-w-xs" />
        <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} />
        <AmountRangeFilter min={amountMin} max={amountMax} onChange={(min, max) => handleFilterChange({ amountMin: min, amountMax: max })} />
      </FilterBar>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black/[0.02] border-b border-line">
                <SortHeader col="date" label="Date" sort={sort} onSort={onSort} />
                <th className="th">Detail</th>
                <SortHeader col="amount" label="Amount" sort={sort} onSort={onSort} align="right" />
                <th className="th" />
              </tr>
            </thead>
            <tbody key={rowsFadeKey} className={loading ? "divide-y divide-line" : "divide-y divide-line content-fade"}>
              {loading ? <TableSkeleton rows={6} cols={4} /> :
               error ? <tr><td colSpan={4}><ErrorState onRetry={() => { const { from, to } = resolveDateRange(dateRange); load(search, page, sort, from, to, amountMin, amountMax); }} compact /></td></tr> :
               rows.length === 0 ? <tr><td colSpan={4}><EmptyState icon={TrendingDown} compact title={search ? "No matches" : "No entries yet"} description={search ? `Nothing matches “${search}”.` : "Record your first purchase with the “Add Purchasing” button."} /></td></tr> :
               rows.map(r => editId === r.id ? (
                <tr key={r.id} className="bg-accent-tint/40">
                  <td className="px-4 py-2.5" colSpan={3}>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                      <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} className="input px-2.5 py-1.5 text-xs w-full sm:w-36" />
                      <input value={editForm.detail} onChange={e => setEditForm(f => ({ ...f, detail: e.target.value }))} placeholder="Detail" className="input px-2.5 py-1.5 text-sm w-full sm:flex-1 sm:min-w-[140px]" />
                      <input type="number" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} placeholder="Amount" className="input px-2.5 py-1.5 text-sm w-full sm:w-28 text-right font-mono" />
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button onClick={() => saveEdit(r.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-success hover:bg-success-tint" aria-label="Save">
                        <Check className="w-4 h-4" strokeWidth={2.5} />
                      </button>
                      <button onClick={() => setEditId(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:bg-black/5" aria-label="Cancel">
                        <X className="w-4 h-4" strokeWidth={2.5} />
                      </button>
                    </div>
                  </td>
                </tr>
               ) : (
                <tr key={r.id} className="hover:bg-black/[0.015] transition-colors">
                  <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3 text-ink">{r.detail}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(r.amount)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(r)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/60 hover:text-accent hover:bg-accent-tint transition-colors" aria-label="Edit entry">
                        <Pencil className="w-4 h-4" strokeWidth={2} />
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/60 hover:text-danger hover:bg-danger-tint transition-colors" aria-label="Delete entry">
                        <Trash2 className="w-4 h-4" strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && <tfoot><tr className="border-t border-line bg-black/[0.02]"><td colSpan={2} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{search ? "Total (filtered)" : "Total"}</td><td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(total)}</td><td /></tr></tfoot>}
          </table>
        </div>
        {!loading && !error && <Pagination page={page} total={count} pageSize={PAGE_SIZE} onPage={goPage} />}
      </div>
    </div>
  );
}