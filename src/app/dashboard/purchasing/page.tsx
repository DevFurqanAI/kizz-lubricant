

"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { formatMoney, fmtDate } from "@/lib/utils";
import { createLocalCache } from "@/lib/localCache"
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { SortHeader, type Sort, nextSort } from "@/components/sort-header";
import { SearchInput } from "@/components/search-input";
import { TrendingDown } from "lucide-react";

type Row = { id: number; date: string; detail: string; amount: string };
type PurchasingData = { rows: Row[]; total: number; count: number };

const PAGE_SIZE = 50;
const purchasingCache = createLocalCache<PurchasingData>("purchasing", { ttlMs: 5 * 60_000 });
const keyFor = (q: string, s: Sort, p: number) => `${q}|${s.col}|${s.dir}|p${p}`;

export default function PurchasingPage() {
  const initSort: Sort = { col: "date", dir: "desc" };
  const cached0 = purchasingCache.get(keyFor("", initSort, 1));
  const [rows, setRows] = useState<Row[]>(cached0?.rows ?? []);
  const [total, setTotal] = useState(cached0?.total ?? 0);
  const [count, setCount] = useState(cached0?.count ?? 0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>(initSort);
  const [loading, setLoading] = useState(!cached0);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), detail: "", amount: "" });
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ date: "", detail: "", amount: "" });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (q: string, p: number, s: Sort, opts?: { silent?: boolean }) => {
    if (!opts?.silent) { setLoading(true); setError(false); }
    try {
      const data = await api.get<PurchasingData>(`/purchasing?search=${encodeURIComponent(q)}&page=${p}&limit=${PAGE_SIZE}&sort=${s.col}&dir=${s.dir}`);
      purchasingCache.set(keyFor(q, s, p), data);
      setRows(data.rows); setTotal(data.total); setCount(data.count);
    } catch {
      if (!opts?.silent) setError(true);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = purchasingCache.get(keyFor("", initSort, 1));
    if (cached) {
      setRows(cached.rows); setTotal(cached.total); setCount(cached.count);
      setLoading(false);
      load("", 1, initSort, { silent: true });
    } else {
      load("", 1, initSort);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyView = (q: string, p: number, s: Sort) => {
    const cached = purchasingCache.get(keyFor(q, s, p));
    if (cached) { setRows(cached.rows); setTotal(cached.total); setCount(cached.count); }
    load(q, p, s);
  };

  const handleSearch = (v: string) => {
    setSearch(v); setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyView(v, 1, sort), 300);
  };
  const onSort = (col: string) => { const s = nextSort(sort, col); setSort(s); setPage(1); applyView(search, 1, s); };
  const goPage = (p: number) => { setPage(p); applyView(search, p, sort); };

  const handleSave = async () => {
    if (!form.date || !form.detail || !form.amount) return;
    setSaving(true);
    try {
      await api.post<Row>("/purchasing", { ...form, amount: Number(form.amount) });
      setForm({ date: new Date().toISOString().slice(0,10), detail: "", amount: "" });
      setShowForm(false);
      purchasingCache.clear();
      setPage(1);
      load(search, 1, sort);
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
    try { await api.del(`/purchasing/${id}`); purchasingCache.clear(); load(search, page, sort, { silent: true }); toast.success("Purchase deleted"); }
    catch { setRows(prevRows); setTotal(prevTotal); setCount(prevCount); toast.error("Couldn't delete purchase"); }
  };

  const startEdit = (r: Row) => { setEditId(r.id); setEditForm({ date: r.date.slice(0,10), detail: r.detail, amount: r.amount }); };
  const saveEdit = async (id: number) => {
    if (!editForm.date || !editForm.detail || !editForm.amount) return;
    const prevRows = rows;
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...editForm } : r));
    setEditId(null);
    try { await api.patch(`/purchasing/${id}`, { ...editForm, amount: Number(editForm.amount) }); purchasingCache.clear(); load(search, page, sort, { silent: true }); toast.success("Purchase updated"); }
    catch { setRows(prevRows); toast.error("Couldn't update purchase"); }
  };

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
        <button onClick={() => setShowForm(s => !s)} className="btn-primary">+ Add Purchasing</button>
      </div>

      {showForm && (
        <div className="card p-6">
          <h3 className="font-semibold text-ink mb-4">New Entry</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[{ key: "date", label: "Date", type: "date" }, { key: "detail", label: "Detail *", type: "text" }, { key: "amount", label: "Amount (Rs) *", type: "number" }].map(({ key, label, type }) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input type={type} value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="input py-2.5 text-sm" />
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
        <SearchInput value={search} onChange={handleSearch} placeholder="Search purchases…" className="w-full max-w-sm" />
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] text-muted uppercase tracking-wider">Total</p>
          <p className="font-mono font-semibold text-ink tabular-nums">{formatMoney(total)}</p>
        </div>
      </div>

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
            <tbody className="divide-y divide-line">
              {loading ? <TableSkeleton rows={6} cols={4} /> :
               error ? <tr><td colSpan={4}><ErrorState onRetry={() => load(search, page, sort)} compact /></td></tr> :
               rows.length === 0 ? <tr><td colSpan={4}><EmptyState icon={TrendingDown} compact title={search ? "No matches" : "No entries yet"} description={search ? `Nothing matches “${search}”.` : "Record your first purchase with the “Add Purchasing” button."} /></td></tr> :
               rows.map(r => editId === r.id ? (
                <tr key={r.id} className="bg-accent-tint/40">
                  <td className="px-4 py-2">
                    <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} className="input px-2 py-1.5 text-xs" />
                  </td>
                  <td className="px-4 py-2">
                    <input value={editForm.detail} onChange={e => setEditForm(f => ({ ...f, detail: e.target.value }))} className="input px-2 py-1.5 text-sm" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} className="input px-2 py-1.5 text-sm text-right font-mono" />
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
                  <td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(r.amount)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-4">
                      <button onClick={() => startEdit(r)} className="text-muted/50 hover:text-accent transition-colors">✎</button>
                      <button onClick={() => handleDelete(r.id)} className="text-muted/50 hover:text-danger transition-colors text-lg leading-none">×</button>
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