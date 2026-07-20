"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { api, fetchAllRows } from "@/lib/api";
import { formatMoney, toNum, fmtDate } from "@/lib/utils";
import { createLocalCache } from "@/lib/localCache";
import { customerDetailCache } from "@/lib/customercache";
import { saveOrShareBlob } from "@/lib/file-download";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { SortHeader, type Sort, nextSort } from "@/components/sort-header";
import { SearchInput } from "@/components/search-input";
import { TrendingUp, FileSpreadsheet } from "lucide-react";
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
const keyFor = (q: string, s: Sort, p: number) => `${q}|${s.col}|${s.dir}|p${p}`;

export default function SalesPage() {
  const initSort: Sort = { col: "date", dir: "desc" };
  const cached0 = salesCache.get(keyFor("", initSort, 1));
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

  const load = useCallback(async (q: string, p: number, s: Sort, opts?: { silent?: boolean }) => {
    if (!opts?.silent) { setLoading(true); setError(false); }
    try {
      const data = await api.get<SalesData>(`/sales?search=${encodeURIComponent(q)}&page=${p}&limit=${PAGE_SIZE}&sort=${s.col}&dir=${s.dir}`);
      salesCache.set(keyFor(q, s, p), data);
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
    const initial = new URLSearchParams(window.location.search).get("search")?.trim() ?? "";
    if (initial) { setSearch(initial); setPage(1); load(initial, 1, initSort); return; }
    const cached = salesCache.get(keyFor("", initSort, 1));
    if (cached) {
      setRows(cached.rows); setTotal(cached.total); setCount(cached.count);
      setLoading(false);
      load("", 1, initSort, { silent: true });
    } else {
      load("", 1, initSort);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Customer options for the "sell to" picker.
  useEffect(() => {
    api.get<CustomerOption[]>("/customers/options").then(setCustomers).catch(() => {});
  }, []);

  const applyView = (q: string, p: number, s: Sort) => {
    const cached = salesCache.get(keyFor(q, s, p));
    if (cached) { setRows(cached.rows); setTotal(cached.total); setTotalKg(cached.totalKg ?? 0); setTotalL(cached.totalL ?? 0); setCount(cached.count); }
    load(q, p, s);
  };

  // Fetch the monthly roll-up the first time the user switches to that view.
  const switchView = (v: "list" | "month") => {
    setView(v);
    if (v === "month" && months.length === 0) loadMonths();
  };

  const handleSearch = (v: string) => {
    setSearch(v); setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyView(v, 1, sort), 300);
  };
  const onSort = (col: string) => { const s = nextSort(sort, col); setSort(s); setPage(1); applyView(search, 1, s); };
  const goPage = (p: number) => { setPage(p); applyView(search, p, sort); };

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
      // The linked customer's ledger just changed — drop its cached detail.
      if (form.customerId) customerDetailCache.delete(form.customerId);
      setForm({ date: new Date().toISOString().slice(0, 10), detail: "", packing: "", unit: "", qty: "", rate: "", amount: "", saleKg: "", saleKgUnit: "Kg", customerId: "", paidNow: "", paidMethod: "", paidNote: "" });
      autoAmt.current = "";
      setShowForm(false);
      salesCache.clear();
      if (months.length) loadMonths();
      setPage(1);
      load(search, 1, sort);
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
      if (del?.customerId) customerDetailCache.delete(String(del.customerId));
      salesCache.clear();
      load(search, page, sort, { silent: true });
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
      if (edited?.customerId) customerDetailCache.delete(String(edited.customerId));
      salesCache.clear();
      if (months.length) loadMonths();
      load(search, page, sort, { silent: true });
      toast.success("Sale updated");
    } catch { setRows(prevRows); toast.error("Couldn't update sale"); }
  };

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const all = await fetchAllRows<SaleRow>("/sales", { search, sort: sort.col, dir: sort.dir });
      const { buildSalesXlsx } = await import("@/lib/reports-xlsx");
      const blob = await buildSalesXlsx(all, search ? `Filtered: "${search}"` : undefined);
      await saveOrShareBlob(blob, `sales_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast.error("Couldn't export sales");
    } finally {
      setExporting(false);
    }
  };

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
        <div className="card p-6">
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
        <div className="flex items-center gap-3 flex-wrap">
          {/* View toggle: paginated entries vs per-month roll-up (the sheet's blocks) */}
          <div className="inline-flex rounded-lg border border-line-strong overflow-hidden text-[13px]">
            <button onClick={() => switchView("list")} className={`px-3 py-1.5 font-medium transition-colors ${view === "list" ? "bg-surface text-ink" : "text-muted hover:text-ink"}`}>Entries</button>
            <button onClick={() => switchView("month")} className={`px-3 py-1.5 font-medium transition-colors border-l border-line-strong ${view === "month" ? "bg-surface text-ink" : "text-muted hover:text-ink"}`}>By month</button>
          </div>
          {view === "list" && <SearchInput value={search} onChange={handleSearch} placeholder="Search sales…" className="w-full max-w-xs" />}
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
            <tbody className="divide-y divide-line">
              {loading ? (
                <TableSkeleton rows={6} cols={10} />
              ) : error ? (
                <tr><td colSpan={10}><ErrorState onRetry={() => load(search, page, sort)} compact /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10}><EmptyState icon={TrendingUp} compact title={search ? "No matches" : "No sales yet"} description={search ? `Nothing matches “${search}”.` : "Record your first sale with the “Add Sale” button."} /></td></tr>
              ) : rows.map(r => editId === r.id ? (
                <tr key={r.id} className="bg-accent-tint/40">
                  <td className="px-4 py-2">
                    <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} className="input px-2 py-1.5 text-xs" />
                  </td>
                  <td className="px-4 py-2">
                    <input value={editForm.detail} onChange={e => setEditForm(f => ({ ...f, detail: e.target.value }))} className="input px-2 py-1.5 text-sm" />
                  </td>
                  <td className="px-4 py-2 text-muted text-xs whitespace-nowrap">{r.customerName ?? "Cash"}</td>
                  <td className="px-4 py-2">
                    <input value={editForm.packing} onChange={e => setEditForm(f => ({ ...f, packing: e.target.value }))} className="input px-2 py-1.5 text-xs" />
                  </td>
                  <td className="px-4 py-2">
                    <input value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} className="input px-2 py-1.5 text-xs" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" value={editForm.qty} onChange={e => setEditForm(f => ({ ...f, qty: e.target.value }))} onBlur={handleEditAutoAmount} className="input px-2 py-1.5 text-xs" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" value={editForm.rate} onChange={e => setEditForm(f => ({ ...f, rate: e.target.value }))} onBlur={handleEditAutoAmount} className="input px-2 py-1.5 text-xs text-right font-mono" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} title="Auto-fills from Qty × Rate — you can override it" className="input px-2 py-1.5 text-sm text-right font-mono" />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <input type="number" value={editForm.saleKg} onChange={e => setEditForm(f => ({ ...f, saleKg: e.target.value }))} className="input px-2 py-1.5 text-xs text-right font-mono w-full min-w-0" placeholder="0" />
                      <select value={editForm.saleKgUnit} onChange={e => setEditForm(f => ({ ...f, saleKgUnit: e.target.value }))} className="select px-1 py-1.5 text-xs w-[46px] flex-shrink-0">
                        <option value="Kg">Kg</option>
                        <option value="L">L</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-4">
                      <button onClick={() => saveEdit(r.id)} className="text-success font-semibold">✓</button>
                      <button onClick={() => setEditId(null)} className="text-muted">×</button>
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
                    <div className="flex items-center gap-4">
                      <button onClick={() => startEdit(r)} className="text-muted/50 hover:text-accent transition-colors">✎</button>
                      <button onClick={() => handleDelete(r.id)} className="text-muted/50 hover:text-danger transition-colors text-lg leading-none">×</button>
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
              <tbody className="divide-y divide-line">
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
