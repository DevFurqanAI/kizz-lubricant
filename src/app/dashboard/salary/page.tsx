


"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { formatMoney, toNum, fmtDate } from "@/lib/utils";
import { createLocalCache } from "@/lib/localCache";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";

type Row = { id: number; date: string; employee: string; amount: string; account: string };
type SalaryData = { rows: Row[]; total: number };
type EditFormT = { date: string; employee: string; amount: string; account: string };

const salaryCache = createLocalCache<SalaryData>("salary", { ttlMs: 5 * 60_000 });
const VIEW_STYLES = ["table", "cards", "minimal"] as const;
type ViewStyle = typeof VIEW_STYLES[number];
const VIEW_LABELS: Record<ViewStyle, string> = { table: "Table", cards: "Cards", minimal: "Minimal" };

/* ── Moved OUTSIDE the page component so React doesn't recreate ──
   these as "new" component types on every keystroke/render.
   That recreation was what caused the cursor-jump bug. ────────── */

function EditRowInputs({
  editForm,
  setEditForm,
  dense,
}: {
  editForm: EditFormT;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormT>>;
  dense?: boolean;
}) {
  return (
    <>
      <input
        type="date"
        value={editForm.date}
        onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
        className={`rounded-lg border border-violet-200 bg-white outline-none focus:border-violet-400 ${dense ? "px-2 py-1.5 text-xs w-full sm:w-32" : "px-2 py-1.5 text-xs w-full"}`}
      />
      <input
        value={editForm.employee}
        onChange={(e) => setEditForm((f) => ({ ...f, employee: e.target.value }))}
        placeholder="Employee"
        className={`rounded-lg border border-violet-200 bg-white outline-none focus:border-violet-400 ${dense ? "px-2.5 py-1.5 text-sm w-full sm:flex-1 sm:min-w-0" : "px-2 py-1.5 text-sm w-full"}`}
      />
      <input
        type="number"
        value={editForm.amount}
        onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
        placeholder="Amount"
        className={`rounded-lg border border-violet-200 bg-white text-right font-mono outline-none focus:border-violet-400 ${dense ? "px-2.5 py-1.5 text-sm w-full sm:w-28" : "px-2 py-1.5 text-sm w-full"}`}
      />
      <input
        value={editForm.account}
        onChange={(e) => setEditForm((f) => ({ ...f, account: e.target.value }))}
        placeholder="Paid via"
        className={`rounded-lg border border-violet-200 bg-white outline-none focus:border-violet-400 ${dense ? "px-2.5 py-1.5 text-xs w-full sm:w-32" : "px-2 py-1.5 text-xs w-full"}`}
      />
    </>
  );
}

function RowActions({
  r,
  startEdit,
  handleDelete,
}: {
  r: Row;
  startEdit: (r: Row) => void;
  handleDelete: (id: number) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <button onClick={() => startEdit(r)} className="text-gray-300 hover:text-violet-500 transition-colors">✎</button>
      <button onClick={() => handleDelete(r.id)} className="text-gray-300 hover:text-rose-500 transition-colors text-lg leading-none">×</button>
    </div>
  );
}

export default function SalaryPage() {
  const cached0 = salaryCache.get("");
  const [rows, setRows] = useState<Row[]>(cached0?.rows ?? []);
  const [total, setTotal] = useState(cached0?.total ?? 0);
  const [loading, setLoading] = useState(!cached0);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), employee: "", amount: "", account: "" });
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditFormT>({ date: "", employee: "", amount: "", account: "" });
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [viewStyle, setViewStyle] = useState<ViewStyle>("table");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (q = "", opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const data = await api.get<SalaryData>(`/salary${q ? `?search=${encodeURIComponent(q)}` : ""}`);
      salaryCache.set(q, data);
      setRows(data.rows); setTotal(data.total);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = salaryCache.get("");
    if (cached) { setRows(cached.rows); setTotal(cached.total); setLoading(false); load("", { silent: true }); }
    else load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (v: string) => {
    setSearch(v);
    const cached = salaryCache.get(v);
    if (cached) { setRows(cached.rows); setTotal(cached.total); }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(v), 300);
  };

  const handleSave = async () => {
    if (!form.date || !form.employee || !form.amount) return;
    setSaving(true);
    const tempId = -Date.now();
    const optimistic: Row = { ...form, id: tempId };
    const prevRows = rows, prevTotal = total;
    setRows(r => [optimistic, ...r]);
    setTotal(t => t + Number(form.amount));
    setForm({ date: new Date().toISOString().slice(0, 10), employee: "", amount: "", account: "" });
    setShowForm(false);
    try {
      const saved = await api.post<Row>("/salary", { ...optimistic, amount: Number(optimistic.amount) });
      setRows(r => r.map(row => row.id === tempId ? saved : row));
      salaryCache.clear();
      toast.success("Payment added");
    } catch { setRows(prevRows); setTotal(prevTotal); toast.error("Couldn't add payment"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm({ title: "Delete this payment?", confirmText: "Delete", danger: true }))) return;
    const prevRows = rows, prevTotal = total;
    const del = rows.find(r => r.id === id);
    setRows(r => r.filter(row => row.id !== id));
    if (del) setTotal(t => t - toNum(del.amount));
    try { await api.del(`/salary/${id}`); salaryCache.clear(); toast.success("Payment deleted"); }
    catch { setRows(prevRows); setTotal(prevTotal); toast.error("Couldn't delete payment"); }
  };

  const startEdit = (r: Row) => { setEditId(r.id); setEditForm({ date: r.date.slice(0, 10), employee: r.employee, amount: r.amount, account: r.account ?? "" }); };
  const saveEdit = async (id: number) => {
    if (!editForm.date || !editForm.employee || !editForm.amount) return;
    const prevRows = rows;
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...editForm } : r));
    setEditId(null);
    try { await api.patch(`/salary/${id}`, { ...editForm, amount: Number(editForm.amount) }); salaryCache.clear(); load(search); toast.success("Payment updated"); }
    catch { setRows(prevRows); toast.error("Couldn't update payment"); }
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => sortOrder === "newest" ? b.date.localeCompare(a.date) || b.id - a.id : a.date.localeCompare(b.date) || a.id - b.id);
    return copy;
  }, [rows, sortOrder]);

  const cycleStyle = () => setViewStyle(s => VIEW_STYLES[(VIEW_STYLES.indexOf(s) + 1) % VIEW_STYLES.length]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-600 font-mono">Payroll</p>
          <h1 className="mt-1 text-2xl font-display font-bold uppercase tracking-wide text-gray-900">Salary</h1>
          <p className="mt-1 text-sm text-gray-500">Staff salary payments, tracked by employee and transfer method.</p>
        </div>
        <button onClick={() => setShowForm(s => !s)} className="px-4 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl hover:bg-black">+ Add Payment</button>
      </div>

      {/* ── Luxury total-paid box ──────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1a1025] via-[#111318] to-[#1a1025] p-6 sm:p-8 shadow-[0_20px_60px_-15px_rgba(124,58,237,0.35)] border border-violet-500/10">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute -left-16 -bottom-16 w-56 h-56 rounded-full bg-fuchsia-600/10 blur-3xl" />
        <div className="relative flex items-center justify-between flex-wrap gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-violet-300/70 font-mono">Total Salary Paid</p>
            <p className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-mono font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-violet-200 to-fuchsia-200 tabular-nums break-all">
              {formatMoney(total)}
            </p>
            <p className="mt-2 text-xs text-violet-300/50">across {rows.length} recorded payment{rows.length === 1 ? "" : "s"}</p>
          </div>
          <div className="hidden xs:flex gap-[3px]">
            {[...Array(20)].map((_, i) => (
              <span key={i} className={`h-8 w-[3px] rounded-full ${i < 14 ? "bg-gradient-to-t from-violet-500 to-amber-300" : "bg-white/10"}`} />
            ))}
          </div>
        </div>
      </div>

      {showForm && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-6">
          <h3 className="font-semibold text-gray-800 mb-4">New Payment</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[{ key: "date", label: "Date", type: "date" }, { key: "employee", label: "Employee *", type: "text" }, { key: "amount", label: "Amount (Rs) *", type: "number" }, { key: "account", label: "Paid Via / Account", type: "text" }].map(({ key, label, type }) => (
              <div key={key}><label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">{label}</label><input type={type} value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:border-violet-400 outline-none" /></div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving || !form.employee || !form.amount} className="px-5 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl disabled:opacity-50">{saving ? "Saving…" : "Save Payment"}</button>
            <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Controls: search, sort, style toggle ───────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Search by employee…" className="w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-violet-400 outline-none" />
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSortOrder(s => s === "newest" ? "oldest" : "newest")}
            className="px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:border-violet-300 hover:text-violet-600 transition-colors flex items-center gap-1.5"
          >
            {sortOrder === "newest" ? "↓ Newest first" : "↑ Oldest first"}
          </button>
          <button
            onClick={cycleStyle}
            className="px-3.5 py-2.5 rounded-xl border border-violet-200 bg-violet-50 text-xs font-semibold text-violet-600 hover:bg-violet-100 transition-colors"
          >
            View: {VIEW_LABELS[viewStyle]}
          </button>
        </div>
      </div>

      {/* ── Entries: 3 swappable styles ─────────────────────── */}
      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : sortedRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 px-6 py-14 text-center text-gray-500 text-sm">No salary records yet.</div>

      ) : viewStyle === "table" ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead><tr className="bg-gradient-to-r from-[#1C1F27] via-[#101318] to-[#0B0D12] text-white">{["Date", "Employee", "Amount", "Paid Via", ""].map(h => <th key={h} className={`py-3 px-4 text-[11px] font-semibold uppercase tracking-wider ${h === "Amount" ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">
                {sortedRows.map(r => editId === r.id ? (
                  <tr key={r.id} className="bg-violet-50/40">
                    <td className="px-4 py-2" colSpan={4}>
                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                        <EditRowInputs editForm={editForm} setEditForm={setEditForm} />
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap"><div className="flex items-center gap-4"><button onClick={() => saveEdit(r.id)} className="text-emerald-600 font-bold">✓</button><button onClick={() => setEditId(null)} className="text-gray-500">×</button></div></td>
                  </tr>
                ) : (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{r.employee}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-violet-600">{formatMoney(r.amount)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.account || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><RowActions r={r} startEdit={startEdit} handleDelete={handleDelete} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      ) : viewStyle === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sortedRows.map(r => editId === r.id ? (
            <div key={r.id} className="bg-violet-50 border border-violet-200 rounded-2xl p-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                <EditRowInputs editForm={editForm} setEditForm={setEditForm} />
              </div>
              <div className="flex gap-4 pt-1"><button onClick={() => saveEdit(r.id)} className="text-emerald-600 font-bold text-sm">✓ Save</button><button onClick={() => setEditId(null)} className="text-gray-500 text-sm">Cancel</button></div>
            </div>
          ) : (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 font-bold text-sm flex-shrink-0">{r.employee.charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm truncate">{r.employee}</p>
                <p className="text-[11px] text-gray-500 mt-0.5 truncate">{fmtDate(r.date)} · {r.account || "—"}</p>
              </div>
              <p className="font-mono font-bold text-violet-600 flex-shrink-0 text-sm sm:text-base">{formatMoney(r.amount)}</p>
              <RowActions r={r} startEdit={startEdit} handleDelete={handleDelete} />
            </div>
          ))}
        </div>

      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {sortedRows.map(r => editId === r.id ? (
            <div key={r.id} className="px-4 py-3 bg-violet-50/50 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
              <EditRowInputs editForm={editForm} setEditForm={setEditForm} dense />
              <div className="flex gap-4 sm:ml-auto"><button onClick={() => saveEdit(r.id)} className="text-emerald-600 font-bold">✓</button><button onClick={() => setEditId(null)} className="text-gray-500">×</button></div>
            </div>
          ) : (
            <div key={r.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-amber-300 to-violet-500 flex-shrink-0" />
              <span className="text-[11px] text-gray-500 font-mono w-16 sm:w-20 flex-shrink-0">{fmtDate(r.date)}</span>
              <span className="font-medium text-gray-800 text-sm flex-1 truncate">{r.employee}</span>
              <span className="text-[11px] text-gray-500 hidden sm:inline">{r.account || "—"}</span>
              <span className="font-mono font-semibold text-violet-600 text-sm w-20 sm:w-24 text-right flex-shrink-0">{formatMoney(r.amount)}</span>
              <RowActions r={r} startEdit={startEdit} handleDelete={handleDelete} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}