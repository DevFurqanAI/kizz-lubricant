
"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api } from "@/lib/api";
import { formatMoney, fmtDate } from "@/lib/utils";
import { getCache, setCache, clearCache } from "@/lib/expenses-cache";
import { Plus, Receipt, Trash2, X, Pencil, Check } from "lucide-react";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { SortHeader, type Sort, nextSort } from "@/components/sort-header";
import { SearchInput } from "@/components/search-input";
import { validateAmountEntry, hasErrors, firstError, type FieldErrors } from "@/lib/validation";

type Row = { id: number; date: string; detail: string; amount: string };
type ListResponse = { rows: Row[]; total: number; count: number };

const PAGE_SIZE = 50;
const keyFor = (q: string, s: Sort, p: number) => `${q || "__all__"}|${s.col}|${s.dir}|p${p}`;

export default function ExpensesPage() {
  const initSort: Sort = { col: "date", dir: "desc" };
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>(initSort);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), detail: "", amount: "" });
  const [formErrors, setFormErrors] = useState<FieldErrors>({});

  // ── Edit state ──────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ date: "", detail: "", amount: "" });
  const [editSaving, setEditSaving] = useState(false);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  // ── Load with 5-min stale-while-revalidate cache ───────
  const load = useCallback(async (q: string, p: number, s: Sort, opts?: { silent?: boolean }) => {
    const cached = getCache<ListResponse>(keyFor(q, s, p));
    if (cached) {
      setRows(cached.rows); setTotal(cached.total); setCount(cached.count);
      setLoading(false);
    } else if (!opts?.silent) {
      setLoading(true);
    }
    if (!opts?.silent) setError(false);
    try {
      const data = await api.get<ListResponse>(`/expenses?search=${encodeURIComponent(q)}&page=${p}&limit=${PAGE_SIZE}&sort=${s.col}&dir=${s.dir}`);
      setRows(data.rows); setTotal(data.total); setCount(data.count);
      setCache(keyFor(q, s, p), data);
    } catch {
      if (!cached && !opts?.silent) setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("search")?.trim() ?? "";
    if (initial) setSearch(initial);
    load(initial, 1, initSort);
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSearchChange = (value: string) => {
    setSearch(value); setPage(1);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => load(value, 1, sort), 250);
  };
  const onSort = (col: string) => { const s = nextSort(sort, col); setSort(s); setPage(1); load(search, 1, s); };
  const goPage = (p: number) => { setPage(p); load(search, p, sort); };

  const handleSave = async () => {
    const errs = validateAmountEntry(form);
    if (hasErrors(errs)) { setFormErrors(errs); toast.error(firstError(errs)!); return; }
    setFormErrors({});
    setSaving(true);
    try {
      await api.post("/expenses", { ...form, amount: Number(form.amount) });
      setForm({ date: new Date().toISOString().slice(0, 10), detail: "", amount: "" });
      setShowForm(false);
      clearCache();
      setPage(1);
      load(search, 1, sort);
      toast.success("Expense added");
    } catch {
      toast.error("Couldn't add expense");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm({ title: "Delete this expense?", confirmText: "Delete", danger: true }))) return;
    // Optimistic UI: remove instantly, roll back on failure
    const prevRows = rows;
    const prevTotal = total;
    const prevCount = count;
    const deleted = rows.find((r) => r.id === id);
    setRows((r) => r.filter((row) => row.id !== id));
    if (deleted) setTotal((t) => t - Number(deleted.amount));
    setCount((c) => Math.max(0, c - 1));
    try {
      await api.del(`/expenses/${id}`);
      clearCache();
      load(search, page, sort, { silent: true });
      toast.success("Expense deleted");
    } catch {
      setRows(prevRows);
      setTotal(prevTotal);
      setCount(prevCount);
      toast.error("Couldn't delete expense");
    }
  };

  // ── Edit handlers ───────────────────────────────────────
  const startEdit = (row: Row) => {
    setEditingId(row.id);
    setEditForm({ date: row.date.slice(0, 10), detail: row.detail, amount: row.amount });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ date: "", detail: "", amount: "" });
  };

  const saveEdit = async (id: number) => {
    const errs = validateAmountEntry(editForm);
    if (hasErrors(errs)) { toast.error(firstError(errs)!); return; }
    setEditSaving(true);
    const prevRows = rows;
    try {
      // Optimistic update
      setRows((rs) =>
        rs.map((r) => (r.id === id ? { ...r, ...editForm, amount: String(Number(editForm.amount)) } : r))
      );
      await api.patch(`/expenses/${id}`, { ...editForm, amount: Number(editForm.amount) });
      clearCache();
      cancelEdit();
      load(search, page, sort, { silent: true }); // reconcile total + ordering from server
      toast.success("Expense updated");
    } catch {
      setRows(prevRows); // rollback on failure
      toast.error("Couldn't update expense");
    } finally {
      setEditSaving(false);
    }
  };

  // Average is over the whole (filtered) dataset, not just the current page.
  const average = useMemo(() => (count ? total / count : 0), [count, total]);

  return (
    <div className="space-y-6 pb-10">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[26px] font-semibold text-ink">Expenses</h1>
            {count > 0 && <span className="badge-neutral tabular-nums">{count.toLocaleString()}</span>}
          </div>
          <p className="mt-1 text-sm text-muted">Plant rent, petrol, repairs and other running costs — money going out.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add expense
        </button>
      </div>

      {/* ── Stat strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-5">
          <p className="eyebrow">Total cost</p>
          <p className="mt-2.5 text-[26px] leading-none font-mono font-semibold text-ink tabular-nums">{formatMoney(total)}</p>
        </div>
        <div className="card p-5">
          <p className="eyebrow">Entries</p>
          <p className="mt-2.5 text-[26px] leading-none font-mono font-semibold text-ink tabular-nums">{count.toLocaleString()}</p>
          <p className="mt-2.5 text-xs text-muted">{search ? `matching "${search}"` : "all recorded so far"}</p>
        </div>
        <div className="card p-5">
          <p className="eyebrow">Average / entry</p>
          <p className="mt-2.5 text-[26px] leading-none font-mono font-semibold text-ink tabular-nums">{formatMoney(average)}</p>
          <p className="mt-2.5 text-xs text-muted">{search ? "across matches" : "across all entries"}</p>
        </div>
      </div>

      {/* ── New entry form ─────────────────────────────────── */}
      <div
        className={`transition-all duration-200 ease-out overflow-hidden ${
          showForm ? "max-h-[420px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-ink text-sm">New entry</h3>
            <button
              onClick={() => setShowForm(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-black/5"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { key: "date", label: "Date", type: "date" },
              { key: "detail", label: "Detail *", type: "text" },
              { key: "amount", label: "Amount (Rs) *", type: "number" },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input
                  type={type}
                  value={(form as Record<string, string>)[key]}
                  onChange={(e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setFormErrors((er) => ({ ...er, [key]: "" })); }}
                  className={`input py-2.5 text-sm${formErrors[key] ? " ring-1 ring-danger" : ""}`}
                />
                {formErrors[key] && <p className="mt-1 text-xs text-danger">{formErrors[key]}</p>}
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-5">
            <button
              onClick={handleSave}
              disabled={saving || !form.detail || !form.amount}
              className="btn-primary"
            >
              {saving ? "Saving…" : "Save entry"}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────── */}
      <SearchInput value={search} onChange={onSearchChange} placeholder="Search expenses…" className="max-w-sm" />

      {/* ── Desktop / tablet table ─────────────────────────── */}
      <div className="hidden sm:block card overflow-hidden">
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
            <tbody className="divide-y divide-line">
              {loading
                ? <TableSkeleton rows={6} cols={4} />
                : error
                ? <tr><td colSpan={4}><ErrorState onRetry={() => load(search, page, sort)} compact /></td></tr>
                : rows.length === 0
                ? (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState icon={Receipt} compact title={search ? "No matches" : "No entries yet"} description={search ? `Nothing matches “${search}”.` : "Add your first expense with the button above."} />
                    </td>
                  </tr>
                )
                : rows.map((r) => {
                  const isEditing = editingId === r.id;
                  return (
                    <tr key={r.id} className="hover:bg-black/[0.015] transition-colors group">
                      {isEditing ? (
                        <>
                          <td className="px-4 py-2.5">
                            <input
                              type="date"
                              value={editForm.date}
                              onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                              className="input px-2 py-1.5 text-xs"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="text"
                              value={editForm.detail}
                              onChange={(e) => setEditForm((f) => ({ ...f, detail: e.target.value }))}
                              className="input px-2 py-1.5 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              value={editForm.amount}
                              onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                              className="input px-2 py-1.5 text-sm text-right font-mono"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => saveEdit(r.id)}
                                disabled={editSaving}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-success hover:bg-success-tint disabled:opacity-40"
                                aria-label="Save"
                              >
                                <Check className="w-4 h-4" strokeWidth={2.5} />
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:bg-black/5"
                                aria-label="Cancel"
                              >
                                <X className="w-4 h-4" strokeWidth={2.5} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3.5 text-muted text-xs font-mono whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="px-4 py-3.5 text-ink">{r.detail}</td>
                          <td className="px-4 py-3.5 text-right font-mono font-semibold text-ink tabular-nums">
                            {formatMoney(r.amount)}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => startEdit(r)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/40 group-hover:text-muted hover:!text-accent transition-colors"
                                aria-label="Edit entry"
                              >
                                <Pencil className="w-4 h-4" strokeWidth={2} />
                              </button>
                              <button
                                onClick={() => handleDelete(r.id)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/40 group-hover:text-muted hover:!text-danger transition-colors"
                                aria-label="Delete entry"
                              >
                                <Trash2 className="w-4 h-4" strokeWidth={2} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-line bg-black/[0.02]">
                  <td colSpan={2} className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {search ? "Total (filtered)" : "Total"}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-semibold text-ink tabular-nums">
                    {formatMoney(total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!loading && !error && <Pagination page={page} total={count} pageSize={PAGE_SIZE} onPage={goPage} />}
      </div>

      {/* ── Mobile card list ───────────────────────────────── */}
      <div className="sm:hidden space-y-2.5">
        {loading
          ? [...Array(4)].map((_, i) => (
              <div key={i} className="h-16 card animate-pulse" />
            ))
          : error
          ? <div className="card"><ErrorState onRetry={() => load(search, page, sort)} compact /></div>
          : rows.length === 0
          ? (
            <div className="card">
              <EmptyState icon={Receipt} compact title={search ? "No matches" : "No entries yet"} description={search ? `Nothing matches “${search}”.` : "Add your first expense with the button above."} />
            </div>
          )
          : rows.map((r) => {
            const isEditing = editingId === r.id;
            if (isEditing) {
              return (
                <div key={r.id} className="card px-4 py-3.5 space-y-2 ring-1 ring-accent/30">
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                    className="input px-2.5 py-2 text-xs"
                  />
                  <input
                    type="text"
                    value={editForm.detail}
                    onChange={(e) => setEditForm((f) => ({ ...f, detail: e.target.value }))}
                    className="input px-2.5 py-2 text-sm"
                  />
                  <input
                    type="number"
                    value={editForm.amount}
                    onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                    className="input px-2.5 py-2 text-sm font-mono"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => saveEdit(r.id)}
                      disabled={editSaving}
                      className="btn-primary flex-1 py-2 text-xs"
                    >
                      {editSaving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={cancelEdit} className="btn-secondary flex-1 py-2 text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 card px-4 py-3.5 active:bg-black/[0.02]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-ink text-sm truncate">{r.detail}</p>
                  <p className="text-muted text-[11px] font-mono mt-0.5">{fmtDate(r.date)}</p>
                </div>
                <p className="font-mono font-semibold text-ink text-sm tabular-nums flex-shrink-0">
                  {formatMoney(r.amount)}
                </p>
                <button
                  onClick={() => startEdit(r)}
                  className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-muted/40 active:text-accent active:bg-accent-tint"
                  aria-label="Edit entry"
                >
                  <Pencil className="w-4 h-4" strokeWidth={2} />
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-muted/40 active:text-danger active:bg-danger-tint"
                  aria-label="Delete entry"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            );
          })}

        {rows.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3.5 rounded-2xl bg-black/[0.03] border border-line">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{search ? "Total (filtered)" : "Total"}</p>
            <p className="font-mono font-semibold text-ink tabular-nums">{formatMoney(total)}</p>
          </div>
        )}
        {!loading && !error && count > PAGE_SIZE && (
          <div className="card">
            <Pagination page={page} total={count} pageSize={PAGE_SIZE} onPage={goPage} />
          </div>
        )}
      </div>
    </div>
  );
}