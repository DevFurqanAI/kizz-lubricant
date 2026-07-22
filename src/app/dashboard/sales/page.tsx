"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { api, fetchAllRows } from "@/lib/api";
import { formatMoney, toNum, fmtDate } from "@/lib/utils";
import { createLocalCache } from "@/lib/localCache";
import { customerDetailCache, customerListCache } from "@/lib/customercache";
import { saveOrShareBlob } from "@/lib/file-download";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { SortHeader, type Sort, nextSort } from "@/components/sort-header";
import { SearchInput } from "@/components/search-input";
import { DateRangeFilter } from "@/components/date-range-filter";
import { AmountRangeFilter } from "@/components/amount-range-filter";
import { FilterBar } from "@/components/filter-bar";
import { resolveDateRange, encodeDateRange, decodeDateRange, type DateRangeSelection } from "@/lib/date-range";
import { buildQueryString } from "@/lib/url-filter-sync";
import { useContentFadeKey } from "@/lib/use-fade-key";
import { TrendingUp, FileSpreadsheet, Pencil, Trash2, Check, X } from "lucide-react";
import { validateSale, hasErrors, firstError, type FieldErrors } from "@/lib/validation";

type SaleRow = {
  id: number;
  date: string;
  detail: string;
  packing: string | null;
  unit: string | null;
  qty: string | null;
  rate: string | null;
  amount: string;
  saleKg: string | null;
  saleKgUnit: string | null;
  customerId: number | null;
  customerName: string | null;
};
type SalesData = { rows: SaleRow[]; total: number; totalKg: number; totalL: number; count: number };
type MonthRow = { month: string; count: number; total: number; totalKg: number; totalL: number };
type CustomerOption = { id: number; name: string };

const PAGE_SIZE = 50;
const salesCache = createLocalCache<SalesData>("sales", { ttlMs: 5 * 60_000 });
const keyFor = (q: string, s: Sort, p: number, from: string | null, to: string | null, amountMin: string, amountMax: string, customerId: string) =>
  `${q}|${s.col}|${s.dir}|p${p}|${from ?? ""}|${to ?? ""}|${amountMin}|${amountMax}|${customerId}`;

export default function SalesPage() {
  const initSort: Sort = { col: "date", dir: "desc" };
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const cached0 = salesCache.get(keyFor("", initSort, 1, null, null, "", "", ""));
  const [rows, setRows] = useState<SaleRow[]>(cached0?.rows ?? []);
  const [total, setTotal] = useState(cached0?.total ?? 0);
  const [totalKg, setTotalKg] = useState(cached0?.totalKg ?? 0);
  const [totalL, setTotalL] = useState(cached0?.totalL ?? 0);
  const [count, setCount] = useState(cached0?.count ?? 0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>(initSort);
  const [loading, setLoading] = useState(!cached0);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeSelection>({ preset: "all" });
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), detail: "", packing: "", unit: "", qty: "", rate: "", amount: "", saleKg: "", saleKgUnit: "Kg", customerId: "", paidNow: "", paidMethod: "", paidNote: "" });
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ date: "", detail: "", packing: "", unit: "", qty: "", rate: "", amount: "", saleKg: "", saleKgUnit: "Kg" });
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  // "list" = paginated entries · "month" = per-month roll-up (like the sheet's blocks).
  const [view, setView] = useState<"list" | "month">("list");
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [monthsLoading, setMonthsLoading] = useState(false);
  // Track the last auto-computed amount so Qty×Rate fills the field as a
  // convenience but never overwrites a figure the user typed by hand.
  const autoAmt = useRef("");
  const editAutoAmt = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (q: string, p: number, s: Sort, from: string | null, to: string | null, amountMin: string, amountMax: string, customerId: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) { setLoading(true); setError(false); }
    try {
      const qs = new URLSearchParams({ search: q, page: String(p), limit: String(PAGE_SIZE), sort: s.col, dir: s.dir });
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      if (amountMin) qs.set("amountMin", amountMin);
      if (amountMax) qs.set("amountMax", amountMax);
      if (customerId) qs.set("customerId", customerId);
      const data = await api.get<SalesData>(`/sales?${qs}`);
      salesCache.set(keyFor(q, s, p, from, to, amountMin, amountMax, customerId), data);
      setRows(data.rows); setTotal(data.total); setTotalKg(data.totalKg ?? 0); setTotalL(data.totalL ?? 0); setCount(data.count);
    } catch {
      if (!opts?.silent) setError(true);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  const loadMonths = useCallback(async () => {
    setMonthsLoading(true);
    try {
      const data = await api.get<{ rows: MonthRow[] }>("/sales/monthly");
      setMonths(data.rows);
    } catch {
      /* the list view still works; a failed roll-up just shows empty */
    } finally {
      setMonthsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialSearch = searchParams.get("search")?.trim() ?? "";
    const initialRange = decodeDateRange(searchParams);
    const initialAmountMin = searchParams.get("amountMin") ?? "";
    const initialAmountMax = searchParams.get("amountMax") ?? "";
    const initialCustomerId = searchParams.get("customerId") ?? "";
    setSearch(initialSearch);
    setDateRange(initialRange);
    setAmountMin(initialAmountMin);
    setAmountMax(initialAmountMax);
    setCustomerId(initialCustomerId);
    const { from, to } = resolveDateRange(initialRange);
    if (initialSearch || initialRange.preset !== "all" || initialAmountMin || initialAmountMax || initialCustomerId) {
      setPage(1);
      load(initialSearch, 1, initSort, from, to, initialAmountMin, initialAmountMax, initialCustomerId);
      return;
    }
    const cached = salesCache.get(keyFor("", initSort, 1, from, to, "", "", ""));
    if (cached) {
      setRows(cached.rows); setTotal(cached.total); setCount(cached.count);
      setLoading(false);
      load("", 1, initSort, from, to, "", "", "", { silent: true });
    } else {
      load("", 1, initSort, from, to, "", "", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Customer options for the "sell to" picker.
  useEffect(() => {
    api.get<CustomerOption[]>("/customers/options").then(setCustomers).catch(() => {});
  }, []);

  const syncUrl = (overrides: Partial<{ search: string; dateRange: DateRangeSelection; amountMin: string; amountMax: string; customerId: string; sort: Sort; page: number }> = {}) => {
    const s = overrides.search ?? search;
    const dr = overrides.dateRange ?? dateRange;
    const aMin = overrides.amountMin ?? amountMin;
    const aMax = overrides.amountMax ?? amountMax;
    const cust = overrides.customerId ?? customerId;
    const srt = overrides.sort ?? sort;
    const p = overrides.page ?? page;
    router.replace(`${pathname}?${buildQueryString({ search: s, ...encodeDateRange(dr), amountMin: aMin, amountMax: aMax, customerId: cust, sort: srt.col, dir: srt.dir, page: p })}`, { scroll: false });
  };

  const applyView = (q: string, p: number, s: Sort) => {
    const { from, to } = resolveDateRange(dateRange);
    const cached = salesCache.get(keyFor(q, s, p, from, to, amountMin, amountMax, customerId));
    if (cached) { setRows(cached.rows); setTotal(cached.total); setTotalKg(cached.totalKg ?? 0); setTotalL(cached.totalL ?? 0); setCount(cached.count); }
    load(q, p, s, from, to, amountMin, amountMax, customerId);
  };

  // Fetch the monthly roll-up the first time the user switches to that view.
  const switchView = (v: "list" | "month") => {
    setView(v);
    if (v === "month" && months.length === 0) loadMonths();
  };

  const handleSearch = (v: string) => {
    setSearch(v); setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { applyView(v, 1, sort); syncUrl({ search: v, page: 1 }); }, 300);
  };
  const onSort = (col: string) => { const s = nextSort(sort, col); setSort(s); setPage(1); applyView(search, 1, s); syncUrl({ sort: s, page: 1 }); };
  const goPage = (p: number) => { setPage(p); applyView(search, p, sort); syncUrl({ page: p }); };

  const handleDateRangeChange = (v: DateRangeSelection) => {
    setDateRange(v); setPage(1);
    const { from, to } = resolveDateRange(v);
    const cached = salesCache.get(keyFor(search, sort, 1, from, to, amountMin, amountMax, customerId));
    if (cached) { setRows(cached.rows); setTotal(cached.total); setTotalKg(cached.totalKg ?? 0); setTotalL(cached.totalL ?? 0); setCount(cached.count); }
    load(search, 1, sort, from, to, amountMin, amountMax, customerId);
    syncUrl({ dateRange: v, page: 1 });
  };

  const handleFilterChange = (next: Partial<{ amountMin: string; amountMax: string; customerId: string }>) => {
    const nextMin = next.amountMin ?? amountMin;
    const nextMax = next.amountMax ?? amountMax;
    const nextCust = next.customerId ?? customerId;
    setAmountMin(nextMin); setAmountMax(nextMax); setCustomerId(nextCust);
    setPage(1);
    const { from, to } = resolveDateRange(dateRange);
    load(search, 1, sort, from, to, nextMin, nextMax, nextCust);
    syncUrl({ amountMin: nextMin, amountMax: nextMax, customerId: nextCust, page: 1 });
  };

  const clearFilters = () => {
    setDateRange({ preset: "all" }); setAmountMin(""); setAmountMax(""); setCustomerId(""); setPage(1);
    load(search, 1, sort, null, null, "", "", "");
    syncUrl({ dateRange: { preset: "all" }, amountMin: "", amountMax: "", customerId: "", page: 1 });
  };

  const handleAutoAmount = () => {
    const q = Number(form.qty), r = Number(form.rate);
    if (!(q > 0 && r > 0)) return;
    const computed = String(q * r);
    setForm(f => {
      // Only fill if the field is empty or still holds our last suggestion —
      // never stomp on an amount the user overrode by hand.
      if (f.amount !== "" && f.amount !== autoAmt.current) return f;
      autoAmt.current = computed;
      return { ...f, amount: computed };
    });
  };

  const handleSave = async () => {
    const errs = validateSale(form);
    if (hasErrors(errs)) { setFormErrors(errs); toast.error(firstError(errs)!); return; }
    setFormErrors({});
    setSaving(true);
    try {
      const paidNow = form.customerId && form.paidNow ? Number(form.paidNow) : 0;
      await api.post<SaleRow>("/sales", {
        date: form.date,
        detail: form.detail,
        packing: form.packing || null,
        unit: form.unit || null,
        qty: form.qty ? Number(form.qty) : null,
        rate: form.rate ? Number(form.rate) : null,
        amount: Number(form.amount),
        saleKg: form.saleKg ? Number(form.saleKg) : null,
        saleKgUnit: form.saleKg ? form.saleKgUnit : null,
        customerId: form.customerId ? Number(form.customerId) : null,
        paidNow: paidNow || null,
        paidMethod: form.paidMethod || null,
        paidNote: form.paidNote || null,
      });
      // The linked customer's ledger just changed — drop its cached detail
      // and the list page's cached balance.
      if (form.customerId) { customerDetailCache.delete(form.customerId); customerListCache.clear(); }
      setForm({ date: new Date().toISOString().slice(0, 10), detail: "", packing: "", unit: "", qty: "", rate: "", amount: "", saleKg: "", saleKgUnit: "Kg", customerId: "", paidNow: "", paidMethod: "", paidNote: "" });
      autoAmt.current = "";
      setShowForm(false);
      salesCache.clear();
      if (months.length) loadMonths();
      setPage(1);
      const { from, to } = resolveDateRange(dateRange);
      load(search, 1, sort, from, to, amountMin, amountMax, customerId);
      toast.success(
        !form.customerId ? "Sale added"
          : paidNow > 0 ? "Sale added & payment posted to ledger"
          : "Sale added & posted to ledger"
      );
    } catch { toast.error("Couldn't add sale"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    const del = rows.find(r => r.id === id);
    const linked = del?.customerId ? " Its ledger entry will be removed too." : "";
    if (!(await confirm({ title: "Delete this sale?", message: `This can't be undone.${linked}`, confirmText: "Delete", danger: true }))) return;
    const prevRows = rows, prevTotal = total, prevCount = count;
    setRows(r => r.filter(row => row.id !== id));
    if (del) setTotal(t => t - toNum(del.amount));
    setCount(c => Math.max(0, c - 1));
    try {
      await api.del(`/sales/${id}`);
      if (del?.customerId) { customerDetailCache.delete(String(del.customerId)); customerListCache.clear(); }
      salesCache.clear();
      const newCount = Math.max(0, prevCount - 1);
      const maxPage = Math.max(1, Math.ceil(newCount / PAGE_SIZE));
      const nextPage = Math.min(page, maxPage);
      if (nextPage !== page) { setPage(nextPage); syncUrl({ page: nextPage }); }
      const { from, to } = resolveDateRange(dateRange);
      load(search, nextPage, sort, from, to, amountMin, amountMax, customerId, { silent: true });
      toast.success("Sale deleted");
    } catch { setRows(prevRows); setTotal(prevTotal); setCount(prevCount); toast.error("Couldn't delete sale"); }
  };

  const startEdit = (r: SaleRow) => {
    setEditId(r.id);
    setEditForm({ date: r.date.slice(0, 10), detail: r.detail, packing: r.packing ?? "", unit: r.unit ?? "", qty: r.qty ? String(r.qty) : "", rate: r.rate ? String(r.rate) : "", amount: r.amount, saleKg: r.saleKg ? String(r.saleKg) : "", saleKgUnit: r.saleKgUnit ?? "Kg" });
    // Treat the amount as "auto" only if it still equals Qty×Rate, so editing
    // Qty/Rate keeps refreshing a computed amount but leaves an override alone.
    const q = Number(r.qty), rt = Number(r.rate);
    editAutoAmt.current = q > 0 && rt > 0 && String(q * rt) === String(Number(r.amount)) ? String(q * rt) : "";
  };

  const handleEditAutoAmount = () => {
    const q = Number(editForm.qty), r = Number(editForm.rate);
    if (!(q > 0 && r > 0)) return;
    const computed = String(q * r);
    setEditForm(f => {
      if (f.amount !== "" && f.amount !== editAutoAmt.current) return f;
      editAutoAmt.current = computed;
      return { ...f, amount: computed };
    });
  };

  const saveEdit = async (id: number) => {
    const errs = validateSale(editForm);
    if (hasErrors(errs)) { toast.error(firstError(errs)!); return; }
    const prevRows = rows;
    const edited = rows.find(r => r.id === id);
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...editForm } as SaleRow : r));
    setEditId(null);
    try {
      await api.patch(`/sales/${id}`, { ...editForm, packing: editForm.packing || null, unit: editForm.unit || null, qty: editForm.qty ? Number(editForm.qty) : null, rate: editForm.rate ? Number(editForm.rate) : null, amount: Number(editForm.amount), saleKg: editForm.saleKg ? Number(editForm.saleKg) : null, saleKgUnit: editForm.saleKg ? editForm.saleKgUnit : null });
      if (edited?.customerId) { customerDetailCache.delete(String(edited.customerId)); customerListCache.clear(); }
      salesCache.clear();
      if (months.length) loadMonths();
      const { from, to } = resolveDateRange(dateRange);
      load(search, page, sort, from, to, amountMin, amountMax, customerId, { silent: true });
      toast.success("Sale updated");
    } catch { setRows(prevRows); toast.error("Couldn't update sale"); }
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
      if (customerId) params.customerId = customerId;
      const all = await fetchAllRows<SaleRow>("/sales", params);
      const { buildSalesXlsx } = await import("@/lib/reports-xlsx");
      const blob = await buildSalesXlsx(all, search ? `Filtered: "${search}"` : undefined);
      await saveOrShareBlob(blob, `sales_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast.error("Couldn't export sales");
    } finally {
      setExporting(false);
    }
  };

  const rowsFadeKey = useContentFadeKey(rows);
  const monthsFadeKey = useContentFadeKey(months);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[26px] font-semibold text-ink">Sales</h1>
            {count > 0 && <span className="badge-neutral tabular-nums">{count.toLocaleString()}</span>}
          </div>
          <p className="mt-1 text-sm text-muted">Every sale made from the factory — your money coming in.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportXlsx} disabled={exporting || rows.length === 0} className="btn-secondary">
            <FileSpreadsheet className="w-4 h-4" strokeWidth={2} />
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
          <button onClick={() => setShowForm(s => !s)} className="btn-primary">+ Add Sale</button>
        </div>
      </div>

      {showForm && (
        <div className="rise card p-6">
          <h3 className="font-semibold text-ink mb-4">New Sale</h3>

          {/* Customer link — the automation: pick one and it posts to their ledger too */}
          <div className="mb-4">
            <label className="label">Customer</label>
            <select
              value={form.customerId}
              onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))}
              className="select py-2.5 text-sm max-w-xs"
            >
              <option value="">— Walk-in / cash sale —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1.5">
              Pick a customer and this sale is auto-posted to their ledger as a debit — no double entry.
            </p>
          </div>

          {/* On-spot payment — only when a customer is linked. Posts a credit to
              their ledger for whatever they paid at the time of sale. */}
          {form.customerId && (
            <div className="mb-4 rounded-lg border border-success/25 bg-success-tint/30 p-4">
              <p className="text-[13px] font-medium text-ink mb-3">Paid at time of sale <span className="text-muted font-normal">— optional</span></p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="label">Amount paid now (Rs)</label>
                  <input type="number" value={form.paidNow}
                    onChange={e => setForm(f => ({ ...f, paidNow: e.target.value }))}
                    className="input py-2.5 text-sm" placeholder="0" />
                </div>
                <div>
                  <label className="label">Method</label>
                  <input type="text" value={form.paidMethod}
                    onChange={e => setForm(f => ({ ...f, paidMethod: e.target.value }))}
                    className="input py-2.5 text-sm" placeholder="Cash, Bank…" />
                </div>
                <div className="lg:col-span-2">
                  <label className="label">Reference / Note</label>
                  <input type="text" value={form.paidNote}
                    onChange={e => setForm(f => ({ ...f, paidNote: e.target.value }))}
                    className="input py-2.5 text-sm" placeholder="Cheque #, txn id…" />
                </div>
              </div>
              <p className="text-xs text-muted mt-2">Leave blank if nothing was paid yet. This posts as a separate credit — it stays even if the sale is later edited or removed.</p>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: "date", label: "Date", type: "date" },
              { key: "detail", label: "Detail *", type: "text" },
              { key: "packing", label: "Packing", type: "text" },
              { key: "unit", label: "Unit", type: "text" },
              { key: "qty", label: "Qty", type: "number" },
              { key: "rate", label: "Rate (Rs)", type: "number" },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input type={type} value={(form as Record<string, string>)[key]}
                  onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setFormErrors(er => ({ ...er, [key]: "" })); }}
                  onBlur={key === "rate" || key === "qty" ? handleAutoAmount : undefined}
                  className={`input py-2.5 text-sm${formErrors[key] ? " ring-1 ring-danger" : ""}`} />
                {formErrors[key] && <p className="mt-1 text-xs text-danger">{formErrors[key]}</p>}
              </div>
            ))}
            <div>
              <label className="label">Amount (Rs) *</label>
              <input type="number" value={form.amount}
                onChange={e => { setForm(f => ({ ...f, amount: e.target.value })); setFormErrors(er => ({ ...er, amount: "" })); }}
                className={`input py-2.5 text-sm font-mono tabular-nums${formErrors.amount ? " ring-1 ring-danger" : ""}`}
                placeholder="0" title="Auto-fills from Qty × Rate — you can override it" />
              {formErrors.amount && <p className="mt-1 text-xs text-danger">{formErrors.amount}</p>}
            </div>
            <div>
              <label className="label">Sale Kg / L</label>
              <div className="flex gap-2">
                <input type="number" value={form.saleKg}
                  onChange={e => { setForm(f => ({ ...f, saleKg: e.target.value })); setFormErrors(er => ({ ...er, saleKg: "" })); }}
                  className={`input py-2.5 text-sm font-mono flex-1 min-w-0${formErrors.saleKg ? " ring-1 ring-danger" : ""}`} placeholder="0" />
                <select value={form.saleKgUnit}
                  onChange={e => setForm(f => ({ ...f, saleKgUnit: e.target.value }))}
                  className="select py-2.5 text-sm w-[62px] flex-shrink-0">
                  <option value="Kg">Kg</option>
                  <option value="L">L</option>
                </select>
              </div>
              {formErrors.saleKg && <p className="mt-1 text-xs text-danger">{formErrors.saleKg}</p>}
            </div>
          </div>
          <p className="text-xs text-muted mt-2">Amount auto-fills from Qty × Rate — override it for a lump-sum or discounted total. Sale Kg / L is the weight or volume actually sold.</p>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving || !form.detail || !form.amount} className="btn-primary">{saving ? "Saving…" : "Save Sale"}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* View toggle: paginated entries vs per-month roll-up (the sheet's blocks) */}
        <div className="inline-flex rounded-lg border border-line-strong overflow-hidden text-[13px]">
          <button onClick={() => switchView("list")} className={`px-3 py-1.5 font-medium transition-colors ${view === "list" ? "bg-surface text-ink" : "text-muted hover:text-ink"}`}>Entries</button>
          <button onClick={() => switchView("month")} className={`px-3 py-1.5 font-medium transition-colors border-l border-line-strong ${view === "month" ? "bg-surface text-ink" : "text-muted hover:text-ink"}`}>By month</button>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] text-muted uppercase tracking-wider">Total</p>
          <p className="font-mono font-semibold text-ink tabular-nums">{formatMoney(total)}</p>
          {(totalKg > 0 || totalL > 0) && (
            <p className="text-[11px] text-muted font-mono tabular-nums mt-0.5">
              {totalKg > 0 && `${totalKg.toLocaleString()} Kg`}{totalKg > 0 && totalL > 0 && " · "}{totalL > 0 && `${totalL.toLocaleString()} L`}
            </p>
          )}
        </div>
      </div>

      {/* Filters live on their own full-width row, never sharing space with the
          Total block above — selecting a filter option only ever reflows this row. */}
      {view === "list" && (
        <FilterBar active={!!(search || dateRange.preset !== "all" || amountMin || amountMax || customerId)} onClear={clearFilters}>
          <SearchInput value={search} onChange={handleSearch} placeholder="Search sales…" className="w-full max-w-xs" />
          <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} />
          <AmountRangeFilter min={amountMin} max={amountMax} onChange={(min, max) => handleFilterChange({ amountMin: min, amountMax: max })} />
          <select
            value={customerId}
            onChange={(e) => handleFilterChange({ customerId: e.target.value })}
            className="select py-1.5 text-[12.5px] max-w-[160px]"
          >
            <option value="">All customers</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </FilterBar>
      )}

      {view === "list" && (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-black/[0.02] border-b border-line">
                <SortHeader col="date" label="Date" sort={sort} onSort={onSort} />
                <th className="th">Detail</th>
                <th className="th">Customer</th>
                <th className="th">Packing</th>
                <th className="th">Unit</th>
                <th className="th">Qty</th>
                <th className="th text-right">Rate</th>
                <SortHeader col="amount" label="Amount" sort={sort} onSort={onSort} align="right" />
                <th className="th text-right">Sale Kg</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody key={rowsFadeKey} className={loading ? "divide-y divide-line" : "divide-y divide-line content-fade"}>
              {loading ? (
                <TableSkeleton rows={6} cols={10} />
              ) : error ? (
                <tr><td colSpan={10}><ErrorState onRetry={() => { const { from, to } = resolveDateRange(dateRange); load(search, page, sort, from, to, amountMin, amountMax, customerId); }} compact /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10}><EmptyState icon={TrendingUp} compact title={search ? "No matches" : "No sales yet"} description={search ? `Nothing matches “${search}”.` : "Record your first sale with the “Add Sale” button."} /></td></tr>
              ) : rows.map(r => editId === r.id ? (
                <tr key={r.id} className="bg-accent-tint/40">
                  <td className="px-4 py-2.5" colSpan={9}>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                      <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} className="input px-2.5 py-1.5 text-xs w-full sm:w-36" />
                      <input value={editForm.detail} onChange={e => setEditForm(f => ({ ...f, detail: e.target.value }))} placeholder="Detail" className="input px-2.5 py-1.5 text-sm w-full sm:flex-1 sm:min-w-[140px]" />
                      <span className="input px-2.5 py-1.5 text-xs w-full sm:w-auto bg-black/[0.03] text-muted flex items-center whitespace-nowrap">{r.customerName ?? "Cash"}</span>
                      <input value={editForm.packing} onChange={e => setEditForm(f => ({ ...f, packing: e.target.value }))} placeholder="Packing" className="input px-2.5 py-1.5 text-xs w-full sm:w-24" />
                      <input value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} placeholder="Unit" className="input px-2.5 py-1.5 text-xs w-full sm:w-20" />
                      <input type="number" value={editForm.qty} onChange={e => setEditForm(f => ({ ...f, qty: e.target.value }))} onBlur={handleEditAutoAmount} placeholder="Qty" className="input px-2.5 py-1.5 text-xs w-full sm:w-20" />
                      <input type="number" value={editForm.rate} onChange={e => setEditForm(f => ({ ...f, rate: e.target.value }))} onBlur={handleEditAutoAmount} placeholder="Rate" className="input px-2.5 py-1.5 text-xs w-full sm:w-24 text-right font-mono" />
                      <input type="number" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} title="Auto-fills from Qty × Rate — you can override it" placeholder="Amount" className="input px-2.5 py-1.5 text-sm w-full sm:w-28 text-right font-mono" />
                      <div className="flex gap-1 w-full sm:w-auto">
                        <input type="number" value={editForm.saleKg} onChange={e => setEditForm(f => ({ ...f, saleKg: e.target.value }))} className="input px-2.5 py-1.5 text-xs text-right font-mono w-full sm:w-20" placeholder="Sale Kg" />
                        <select value={editForm.saleKgUnit} onChange={e => setEditForm(f => ({ ...f, saleKgUnit: e.target.value }))} className="select px-1 py-1.5 text-xs w-[54px] flex-shrink-0">
                          <option value="Kg">Kg</option>
                          <option value="L">L</option>
                        </select>
                      </div>
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
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.customerId && r.customerName ? (
                      <Link href={`/dashboard/customers/${r.customerId}`} className="text-[13px] text-accent-ink hover:text-accent-hover font-medium transition-colors">
                        {r.customerName}
                      </Link>
                    ) : (
                      <span className="text-muted text-xs">Cash</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{r.packing || "—"}</td>
                  <td className="px-4 py-3 text-muted text-xs">{r.unit || "—"}</td>
                  <td className="px-4 py-3 text-muted text-xs">{r.qty ? Number(r.qty).toLocaleString() : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted text-xs tabular-nums">{r.rate ? formatMoney(r.rate) : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(r.amount)}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted text-xs tabular-nums whitespace-nowrap">{r.saleKg ? `${Number(r.saleKg).toLocaleString()} ${r.saleKgUnit ?? "Kg"}` : "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(r)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/60 hover:text-accent hover:bg-accent-tint transition-colors" aria-label="Edit sale">
                        <Pencil className="w-4 h-4" strokeWidth={2} />
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/60 hover:text-danger hover:bg-danger-tint transition-colors" aria-label="Delete sale">
                        <Trash2 className="w-4 h-4" strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-line bg-black/[0.02]">
                  <td colSpan={7} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {search ? "Total (filtered)" : "Total Sales"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(total)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-muted text-xs tabular-nums whitespace-nowrap">
                    {totalKg > 0 || totalL > 0 ? `${totalKg > 0 ? totalKg.toLocaleString() + " Kg" : ""}${totalKg > 0 && totalL > 0 ? " · " : ""}${totalL > 0 ? totalL.toLocaleString() + " L" : ""}` : "—"}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!loading && !error && <Pagination page={page} total={count} pageSize={PAGE_SIZE} onPage={goPage} />}
      </div>
      )}

      {view === "month" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="bg-black/[0.02] border-b border-line">
                  <th className="th">Month</th>
                  <th className="th text-right">Sales</th>
                  <th className="th text-right">Total Amount</th>
                  <th className="th text-right">Sale Kg / L</th>
                </tr>
              </thead>
              <tbody key={monthsFadeKey} className={monthsLoading ? "divide-y divide-line" : "divide-y divide-line content-fade"}>
                {monthsLoading ? (
                  <TableSkeleton rows={5} cols={4} />
                ) : months.length === 0 ? (
                  <tr><td colSpan={4}><EmptyState icon={TrendingUp} compact title="No sales yet" description="Monthly totals appear here once you record sales." /></td></tr>
                ) : months.map(m => (
                  <tr key={m.month} className="hover:bg-black/[0.015] transition-colors">
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{new Date(m.month + "-01T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" })}</td>
                    <td className="px-4 py-3 text-right text-muted text-xs tabular-nums">{m.count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(m.total)}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted text-xs tabular-nums whitespace-nowrap">
                      {m.totalKg > 0 || m.totalL > 0 ? `${m.totalKg > 0 ? m.totalKg.toLocaleString() + " Kg" : ""}${m.totalKg > 0 && m.totalL > 0 ? " · " : ""}${m.totalL > 0 ? m.totalL.toLocaleString() + " L" : ""}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              {months.length > 0 && (
                <tfoot>
                  <tr className="border-t border-line bg-black/[0.02]">
                    <td className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">All months</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-muted text-xs tabular-nums">{months.reduce((a, m) => a + m.count, 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(months.reduce((a, m) => a + m.total, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-muted text-xs tabular-nums whitespace-nowrap">
                      {(() => { const k = months.reduce((a, m) => a + m.totalKg, 0), l = months.reduce((a, m) => a + m.totalL, 0); return k > 0 || l > 0 ? `${k > 0 ? k.toLocaleString() + " Kg" : ""}${k > 0 && l > 0 ? " · " : ""}${l > 0 ? l.toLocaleString() + " L" : ""}` : "—"; })()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
