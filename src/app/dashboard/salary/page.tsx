


"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { formatMoney, toNum, fmtDate } from "@/lib/utils";
import { createLocalCache } from "@/lib/localCache";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { SearchInput } from "@/components/search-input";
import { Wallet, ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { validateSalary, hasErrors, firstError, type FieldErrors } from "@/lib/validation";

type Row = { id: number; date: string; employee: string; amount: string; account: string };
type SalaryData = { rows: Row[]; total: number; count: number };
type EditFormT = { date: string; employee: string; amount: string; account: string };

const PAGE_SIZE = 50;
const salaryCache = createLocalCache<SalaryData>("salary", { ttlMs: 5 * 60_000 });
const keyFor = (q: string, d: "asc" | "desc", p: number) => `${q}|${d}|p${p}`;
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
        className={`input ${dense ? "px-2 py-1.5 text-xs w-full sm:w-32" : "px-2 py-1.5 text-xs w-full"}`}
      />
      <input
        value={editForm.employee}
        onChange={(e) => setEditForm((f) => ({ ...f, employee: e.target.value }))}
        placeholder="Employee"
        className={`input ${dense ? "px-2.5 py-1.5 text-sm w-full sm:flex-1 sm:min-w-0" : "px-2 py-1.5 text-sm w-full"}`}
      />
      <input
        type="number"
        value={editForm.amount}
        onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
        placeholder="Amount"
        className={`input text-right font-mono ${dense ? "px-2.5 py-1.5 text-sm w-full sm:w-28" : "px-2 py-1.5 text-sm w-full"}`}
      />
      <input
        value={editForm.account}
        onChange={(e) => setEditForm((f) => ({ ...f, account: e.target.value }))}
        placeholder="Paid via"
        className={`input ${dense ? "px-2.5 py-1.5 text-xs w-full sm:w-32" : "px-2 py-1.5 text-xs w-full"}`}
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
      <button onClick={() => startEdit(r)} className="text-muted/50 hover:text-accent transition-colors">✎</button>
      <button onClick={() => handleDelete(r.id)} className="text-muted/50 hover:text-danger transition-colors text-lg leading-none">×</button>
    </div>
  );
}

export default function SalaryPage() {
  const cached0 = salaryCache.get(keyFor("", "desc", 1));
  const [rows, setRows] = useState<Row[]>(cached0?.rows ?? []);
  const [total, setTotal] = useState(cached0?.total ?? 0);
  const [count, setCount] = useState(cached0?.count ?? 0);
  const [page, setPage] = useState(1);
  const [dir, setDir] = useState<"asc" | "desc">("desc"); // desc = newest first
  const [loading, setLoading] = useState(!cached0);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), employee: "", amount: "", account: "" });
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditFormT>({ date: "", employee: "", amount: "", account: "" });
  const [viewStyle, setViewStyle] = useState<ViewStyle>("table");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (q: string, p: number, d: "asc" | "desc", opts?: { silent?: boolean }) => {
    if (!opts?.silent) { setLoading(true); setError(false); }
    try {
      const data = await api.get<SalaryData>(`/salary?search=${encodeURIComponent(q)}&page=${p}&limit=${PAGE_SIZE}&sort=date&dir=${d}`);
      salaryCache.set(keyFor(q, d, p), data);
      setRows(data.rows); setTotal(data.total); setCount(data.count);
    } catch {
      if (!opts?.silent) setError(true);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("search")?.trim() ?? "";
    if (initial) { setSearch(initial); setPage(1); load(initial, 1, "desc"); return; }
    const cached = salaryCache.get(keyFor("", "desc", 1));
    if (cached) { setRows(cached.rows); setTotal(cached.total); setCount(cached.count); setLoading(false); load("", 1, "desc", { silent: true }); }
    else load("", 1, "desc");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyView = (q: string, p: number, d: "asc" | "desc") => {
    const cached = salaryCache.get(keyFor(q, d, p));
    if (cached) { setRows(cached.rows); setTotal(cached.total); setCount(cached.count); }
    load(q, p, d);
  };

  const handleSearch = (v: string) => {
    setSearch(v); setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyView(v, 1, dir), 300);
  };
  const toggleSort = () => { const d = dir === "desc" ? "asc" : "desc"; setDir(d); setPage(1); applyView(search, 1, d); };
  const goPage = (p: number) => { setPage(p); applyView(search, p, dir); };

  const handleSave = async () => {
    const errs = validateSalary(form);
    if (hasErrors(errs)) { setFormErrors(errs); toast.error(firstError(errs)!); return; }
    setFormErrors({});
    setSaving(true);
    try {
      await api.post<Row>("/salary", { ...form, amount: Number(form.amount) });
      setForm({ date: new Date().toISOString().slice(0, 10), employee: "", amount: "", account: "" });
      setShowForm(false);
      salaryCache.clear();
      setPage(1);
      load(search, 1, dir);
      toast.success("Payment added");
    } catch { toast.error("Couldn't add payment"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm({ title: "Delete this payment?", confirmText: "Delete", danger: true }))) return;
    const prevRows = rows, prevTotal = total, prevCount = count;
    const del = rows.find(r => r.id === id);
    setRows(r => r.filter(row => row.id !== id));
    if (del) setTotal(t => t - toNum(del.amount));
    setCount(c => Math.max(0, c - 1));
    try { await api.del(`/salary/${id}`); salaryCache.clear(); load(search, page, dir, { silent: true }); toast.success("Payment deleted"); }
    catch { setRows(prevRows); setTotal(prevTotal); setCount(prevCount); toast.error("Couldn't delete payment"); }
  };

  const startEdit = (r: Row) => { setEditId(r.id); setEditForm({ date: r.date.slice(0, 10), employee: r.employee, amount: r.amount, account: r.account ?? "" }); };
  const saveEdit = async (id: number) => {
    const errs = validateSalary(editForm);
    if (hasErrors(errs)) { toast.error(firstError(errs)!); return; }
    const prevRows = rows;
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...editForm } : r));
    setEditId(null);
    try { await api.patch(`/salary/${id}`, { ...editForm, amount: Number(editForm.amount) }); salaryCache.clear(); load(search, page, dir, { silent: true }); toast.success("Payment updated"); }
    catch { setRows(prevRows); toast.error("Couldn't update payment"); }
  };

  const cycleStyle = () => setViewStyle(s => VIEW_STYLES[(VIEW_STYLES.indexOf(s) + 1) % VIEW_STYLES.length]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[26px] font-semibold text-ink">Salary</h1>
            {count > 0 && <span className="badge-neutral tabular-nums">{count.toLocaleString()}</span>}
          </div>
          <p className="mt-1 text-sm text-muted">Staff salary payments, tracked by employee and transfer method — money going out.</p>
        </div>
        <button onClick={() => setShowForm(s => !s)} className="btn-primary">+ Add Payment</button>
      </div>

      {/* ── Total paid ─────────────────────────────────────── */}
      <div className="card p-6 sm:p-8">
        <p className="eyebrow">Total salary paid{search ? " (filtered)" : ""}</p>
        <p className="mt-2.5 text-[34px] sm:text-[44px] leading-none font-mono font-semibold text-ink tabular-nums break-all">
          {formatMoney(total)}
        </p>
        <p className="mt-3 text-[13px] text-muted">across {count.toLocaleString()} recorded payment{count === 1 ? "" : "s"}</p>
      </div>

      {showForm && (
        <div className="card p-6">
          <h3 className="font-semibold text-ink mb-4">New Payment</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[{ key: "date", label: "Date", type: "date" }, { key: "employee", label: "Employee *", type: "text" }, { key: "amount", label: "Amount (Rs) *", type: "number" }, { key: "account", label: "Paid Via / Account", type: "text" }].map(({ key, label, type }) => (
              <div key={key}><label className="label">{label}</label><input type={type} value={(form as Record<string, string>)[key]} onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setFormErrors(er => ({ ...er, [key]: "" })); }} className={`input py-2.5 text-sm${formErrors[key] ? " ring-1 ring-danger" : ""}`} />{formErrors[key] && <p className="mt-1 text-xs text-danger">{formErrors[key]}</p>}</div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving || !form.employee || !form.amount} className="btn-primary">{saving ? "Saving…" : "Save Payment"}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Controls: search, sort, style toggle ───────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <SearchInput value={search} onChange={handleSearch} placeholder="Search by employee…" className="sm:flex-1 sm:min-w-[200px] sm:max-w-sm" />
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={toggleSort} className="btn-secondary btn-sm">
            {dir === "desc" ? <ArrowDownWideNarrow className="w-4 h-4" strokeWidth={2} /> : <ArrowUpNarrowWide className="w-4 h-4" strokeWidth={2} />}
            {dir === "desc" ? "Newest first" : "Oldest first"}
          </button>
          <button
            onClick={cycleStyle}
            className="btn-sm inline-flex items-center gap-2 rounded-lg bg-accent-tint text-accent-hover font-medium hover:brightness-95 transition-[filter]"
          >
            View: {VIEW_LABELS[viewStyle]}
          </button>
        </div>
      </div>

      {/* ── Entries: 3 swappable styles ─────────────────────── */}
      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-black/[0.04] rounded-2xl animate-pulse" />)}</div>
      ) : error ? (
        <div className="card"><ErrorState onRetry={() => load(search, page, dir)} /></div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={Wallet} title={search ? "No matches" : "No salary records yet"} description={search ? `Nothing matches “${search}”.` : "Record your first salary payment with the “Add Payment” button."} />
        </div>

      ) : viewStyle === "table" ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead><tr className="bg-black/[0.02] border-b border-line">{["Date", "Employee", "Amount", "Paid Via", ""].map(h => <th key={h} className={`th ${h === "Amount" ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map(r => editId === r.id ? (
                  <tr key={r.id} className="bg-accent-tint/40">
                    <td className="px-4 py-2" colSpan={4}>
                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                        <EditRowInputs editForm={editForm} setEditForm={setEditForm} />
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap"><div className="flex items-center gap-4"><button onClick={() => saveEdit(r.id)} className="text-success font-semibold">✓</button><button onClick={() => setEditId(null)} className="text-muted">×</button></div></td>
                  </tr>
                ) : (
                  <tr key={r.id} className="hover:bg-black/[0.015] transition-colors">
                    <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3 font-medium text-ink">{r.employee}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(r.amount)}</td>
                    <td className="px-4 py-3 text-muted text-xs">{r.account || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><RowActions r={r} startEdit={startEdit} handleDelete={handleDelete} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      ) : viewStyle === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map(r => editId === r.id ? (
            <div key={r.id} className="card p-4 space-y-2 ring-1 ring-accent/30">
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                <EditRowInputs editForm={editForm} setEditForm={setEditForm} />
              </div>
              <div className="flex gap-4 pt-1"><button onClick={() => saveEdit(r.id)} className="text-success font-semibold text-sm">✓ Save</button><button onClick={() => setEditId(null)} className="text-muted text-sm">Cancel</button></div>
            </div>
          ) : (
            <div key={r.id} className="card p-4 flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 rounded-lg bg-accent-tint flex items-center justify-center text-accent-hover font-semibold text-sm flex-shrink-0">{r.employee.charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink text-sm truncate">{r.employee}</p>
                <p className="text-[11px] text-muted mt-0.5 truncate">{fmtDate(r.date)} · {r.account || "—"}</p>
              </div>
              <p className="font-mono font-semibold text-ink flex-shrink-0 text-sm sm:text-base tabular-nums">{formatMoney(r.amount)}</p>
              <RowActions r={r} startEdit={startEdit} handleDelete={handleDelete} />
            </div>
          ))}
        </div>

      ) : (
        <div className="card divide-y divide-line">
          {rows.map(r => editId === r.id ? (
            <div key={r.id} className="px-4 py-3 bg-accent-tint/50 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
              <EditRowInputs editForm={editForm} setEditForm={setEditForm} dense />
              <div className="flex gap-4 sm:ml-auto"><button onClick={() => saveEdit(r.id)} className="text-success font-semibold">✓</button><button onClick={() => setEditId(null)} className="text-muted">×</button></div>
            </div>
          ) : (
            <div key={r.id} className="px-4 py-3 flex items-center gap-3 hover:bg-black/[0.015] transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
              <span className="text-[11px] text-muted font-mono w-16 sm:w-20 flex-shrink-0">{fmtDate(r.date)}</span>
              <span className="font-medium text-ink text-sm flex-1 truncate">{r.employee}</span>
              <span className="text-[11px] text-muted hidden sm:inline">{r.account || "—"}</span>
              <span className="font-mono font-semibold text-ink text-sm w-20 sm:w-24 text-right flex-shrink-0 tabular-nums">{formatMoney(r.amount)}</span>
              <RowActions r={r} startEdit={startEdit} handleDelete={handleDelete} />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && count > PAGE_SIZE && (
        <div className="card">
          <Pagination page={page} total={count} pageSize={PAGE_SIZE} onPage={goPage} />
        </div>
      )}
    </div>
  );
}