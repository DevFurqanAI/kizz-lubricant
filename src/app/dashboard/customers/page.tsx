

"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, fetchAllRows } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { customerDetailCache, customerListCache, type CustomerWithBalance } from "@/lib/customercache";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState, CardGridSkeleton } from "@/components/states";
import { SearchInput } from "@/components/search-input";
import { saveOrShareBlob } from "@/lib/file-download";
import { Users, FileSpreadsheet, Pencil, Trash2, Check, X } from "lucide-react";
import { validateCustomer, hasErrors, firstError, type FieldErrors } from "@/lib/validation";
import { useContentFadeKey } from "@/lib/use-fade-key";

const PAGE_SIZE = 50;
const cacheKey = (q: string, page: number) => `${q}|p${page}`;
const VIEW_STYLES = ["table", "cards"] as const;
type ViewStyle = typeof VIEW_STYLES[number];
const VIEW_LABELS: Record<ViewStyle, string> = { table: "Table", cards: "Cards" };

type EditFormT = { name: string; owner: string; openingBalance: string; cnic: string; address: string; phone: string; whatsapp: string; email: string };

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
        value={editForm.name}
        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
        placeholder="Name *"
        className={`input ${dense ? "px-2.5 py-1.5 text-sm w-full sm:flex-1 sm:min-w-0 font-semibold" : "px-2.5 py-1.5 text-sm w-full font-semibold"}`}
      />
      <input
        value={editForm.owner}
        onChange={(e) => setEditForm((f) => ({ ...f, owner: e.target.value }))}
        placeholder="Owner"
        className={`input ${dense ? "px-2.5 py-1.5 text-xs w-full sm:w-32" : "px-2.5 py-1.5 text-xs w-full"}`}
      />
      <input
        type="number"
        value={editForm.openingBalance}
        onChange={(e) => setEditForm((f) => ({ ...f, openingBalance: e.target.value }))}
        placeholder="Opening Balance"
        className={`input text-right font-mono ${dense ? "px-2.5 py-1.5 text-xs w-full sm:w-32" : "px-2.5 py-1.5 text-xs w-full"}`}
      />
      <input
        value={editForm.cnic}
        onChange={(e) => setEditForm((f) => ({ ...f, cnic: e.target.value }))}
        placeholder="CNIC"
        className={`input ${dense ? "px-2.5 py-1.5 text-xs w-full sm:w-32" : "px-2.5 py-1.5 text-xs w-full"}`}
      />
      <input
        value={editForm.phone}
        onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
        placeholder="Cell #"
        className={`input ${dense ? "px-2.5 py-1.5 text-xs w-full sm:w-32" : "px-2.5 py-1.5 text-xs w-full"}`}
      />
      <input
        type="email"
        value={editForm.email}
        onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
        placeholder="Email"
        className={`input ${dense ? "px-2.5 py-1.5 text-xs w-full sm:w-40" : "px-2.5 py-1.5 text-xs w-full"}`}
      />
      <input
        value={editForm.whatsapp}
        onChange={(e) => setEditForm((f) => ({ ...f, whatsapp: e.target.value }))}
        placeholder="WhatsApp #"
        className={`input ${dense ? "px-2.5 py-1.5 text-xs w-full sm:w-32" : "px-2.5 py-1.5 text-xs w-full"}`}
      />
      <input
        value={editForm.address}
        onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
        placeholder="Address"
        className={`input ${dense ? "px-2.5 py-1.5 text-xs w-full sm:flex-1 sm:min-w-0" : "px-2.5 py-1.5 text-xs w-full"}`}
      />
    </>
  );
}

export default function CustomersPage() {
  const router = useRouter();
  const first = customerListCache.get(cacheKey("", 1));
  const [customers, setCustomers] = useState<CustomerWithBalance[]>(() => first?.rows ?? []);
  const [count, setCount] = useState(() => first?.count ?? 0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(() => !first);
  const [error, setError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", accountTitle: "", owner: "", openingBalance: "", cnic: "", address: "", phone: "", whatsapp: "", email: "" });
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditFormT>({ name: "", owner: "", openingBalance: "", cnic: "", address: "", phone: "", whatsapp: "", email: "" });
  const [viewStyle, setViewStyle] = useState<ViewStyle>("table");
  const [exporting, setExporting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (q = "", p = 1, opts?: { silent?: boolean }) => {
    if (!opts?.silent) { setLoading(true); setError(false); }
    try {
      const data = await api.get<{ rows: CustomerWithBalance[]; count: number }>(
        `/customers?search=${encodeURIComponent(q)}&page=${p}&limit=${PAGE_SIZE}`,
      );
      customerListCache.set(cacheKey(q, p), data);
      setCustomers(data.rows);
      setCount(data.count);
    } catch {
      if (!opts?.silent) setError(true);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = customerListCache.get(cacheKey("", 1));
    if (cached) { setCustomers(cached.rows); setCount(cached.count); setLoading(false); load("", 1, { silent: true }); }
    else load("", 1);
  }, [load]);

  const goPage = (p: number) => {
    setPage(p);
    const cached = customerListCache.get(cacheKey(search, p));
    if (cached) { setCustomers(cached.rows); setCount(cached.count); }
    load(search, p);
  };

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
    const cached = customerListCache.get(cacheKey(v, 1));
    if (cached) { setCustomers(cached.rows); setCount(cached.count); }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(v, 1), 300);
  };

  const handleSave = async () => {
    const errs = validateCustomer(form);
    if (hasErrors(errs)) { setFormErrors(errs); toast.error(firstError(errs)!); return; }
    setFormErrors({});
    setSaving(true);
    try {
      await api.post("/customers", { ...form, openingBalance: form.openingBalance ? Number(form.openingBalance) : 0 });
      setForm({ name: "", accountTitle: "", owner: "", openingBalance: "", cnic: "", address: "", phone: "", whatsapp: "", email: "" });
      setShowForm(false);
      customerListCache.clear();
      setPage(1);
      load(search, 1);
      toast.success("Customer added");
    } catch {
      toast.error("Couldn't add customer");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c: CustomerWithBalance, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setEditId(c.id);
    setEditForm({ name: c.name, owner: c.owner ?? "", openingBalance: c.openingBalance ?? "0", cnic: c.cnic ?? "", address: c.address ?? "", phone: c.phone ?? "", whatsapp: c.whatsapp ?? "", email: c.email ?? "" });
  };

  const cancelEdit = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setEditId(null); };

  const saveEdit = async (id: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const errs = validateCustomer(editForm);
    if (hasErrors(errs)) { toast.error(firstError(errs)!); return; }
    const prev = customers;
    setCustomers(cs => cs.map(c => c.id === id ? { ...c, ...editForm } : c));
    setEditId(null);
    try {
      await api.patch(`/customers/${id}`, editForm);
      customerListCache.clear();
      customerDetailCache.delete(String(id));
      load(search, page, { silent: true });
      toast.success("Customer updated");
    } catch { setCustomers(prev); toast.error("Couldn't update customer"); }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!(await confirm({ title: "Delete this customer?", message: "This permanently removes the customer and their ledger entries. Any past sales linked to them will remain on the Sales page as unlinked cash sales.", confirmText: "Delete", danger: true }))) return;
    const prev = customers;
    const prevCount = count;
    setCustomers(cs => cs.filter(c => c.id !== id));
    setCount(n => Math.max(0, n - 1));
    try {
      await api.del(`/customers/${id}`);
      customerListCache.clear();
      customerDetailCache.delete(String(id));
      const newCount = Math.max(0, prevCount - 1);
      const maxPage = Math.max(1, Math.ceil(newCount / PAGE_SIZE));
      const nextPage = Math.min(page, maxPage);
      if (nextPage !== page) setPage(nextPage);
      load(search, nextPage, { silent: true });
      toast.success("Customer deleted");
    } catch { setCustomers(prev); setCount(prevCount); toast.error("Couldn't delete customer"); }
  };

  const cycleStyle = () => setViewStyle(s => VIEW_STYLES[(VIEW_STYLES.indexOf(s) + 1) % VIEW_STYLES.length]);

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const all = await fetchAllRows<CustomerWithBalance>("/customers", { search });
      const { buildCustomersXlsx } = await import("@/lib/reports-xlsx");
      const blob = await buildCustomersXlsx(all, search ? `Filtered: "${search}"` : undefined);
      await saveOrShareBlob(blob, `customers_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast.error("Couldn't export customers");
    } finally {
      setExporting(false);
    }
  };

  const customersFadeKey = useContentFadeKey(customers);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[26px] font-semibold text-ink">Customers</h1>
            {count > 0 && <span className="badge-neutral tabular-nums">{count.toLocaleString()}</span>}
          </div>
          <p className="mt-1 text-sm text-muted">Everyone you buy from or sell to. Open a card to see their full history and what they owe.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportXlsx} disabled={exporting || customers.length === 0} className="btn-secondary">
            <FileSpreadsheet className="w-4 h-4" strokeWidth={2} />
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
          <button onClick={() => setShowForm(s => !s)} className="btn-primary">
            + Add Customer
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rise card p-6">
          <h3 className="font-semibold text-ink mb-4">New Customer</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: "name", label: "Name / Account Title *" },
              { key: "owner", label: "Owner" },
              { key: "openingBalance", label: "Opening Balance (Rs)", type: "number" },
              { key: "cnic", label: "CNIC" },
              { key: "address", label: "Address" },
              { key: "phone", label: "Cell #" },
              { key: "whatsapp", label: "WhatsApp #" },
              { key: "email", label: "Email", type: "email" },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input type={type ?? "text"} value={(form as Record<string, string>)[key]} onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setFormErrors(er => ({ ...er, [key]: "" })); }} className={`input py-2.5 text-sm${formErrors[key] ? " ring-1 ring-danger" : ""}`} />
                {formErrors[key] && <p className="mt-1 text-xs text-danger">{formErrors[key]}</p>}
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={handleSave} disabled={saving || !form.name} className="btn-primary">
              {saving ? "Saving…" : "Save Customer"}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <SearchInput value={search} onChange={handleSearch} placeholder="Search customers…" className="sm:flex-1 sm:min-w-[200px] sm:max-w-sm" />
        <div className="flex flex-wrap items-center gap-3">
          {!loading && !error && customers.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
              <span className="flex items-center gap-1.5 text-muted">
                <span className="w-2 h-2 rounded-full bg-warning" /> <span className="text-warning font-medium">Owes you</span>
              </span>
              <span className="flex items-center gap-1.5 text-muted">
                <span className="w-2 h-2 rounded-full bg-success" /> <span className="text-success font-medium">Paid ahead</span>
              </span>
            </div>
          )}
          <button
            onClick={cycleStyle}
            className="btn-sm inline-flex items-center gap-2 rounded-lg bg-accent-tint text-accent-hover font-medium hover:brightness-95 transition-[filter]"
          >
            View: {VIEW_LABELS[viewStyle]}
          </button>
        </div>
      </div>

      {loading ? (
        <CardGridSkeleton count={8} />
      ) : error ? (
        <div className="card"><ErrorState onRetry={() => load(search, page)} /></div>
      ) : customers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Users}
            title={search ? "No matches" : "No customers yet"}
            description={search ? `Nothing matches “${search}”. Try a different name or address.` : "Add your first customer to start tracking their ledger — debit, credit and running balance."}
            action={!search && <button onClick={() => setShowForm(true)} className="btn-primary">+ Add Customer</button>}
          />
        </div>
      ) : viewStyle === "table" ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="bg-black/[0.02] border-b border-line">{["Name", "Owner", "CNIC", "Phone", "Email", "Address", "Balance", ""].map(h => <th key={h} className={`th ${h === "Balance" ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody key={customersFadeKey} className="divide-y divide-line content-fade">
                {customers.map(c => {
                  const bal = c.balance ?? 0;
                  return editId === c.id ? (
                    <tr key={c.id} className="bg-accent-tint/40">
                      <td className="px-4 py-2" colSpan={7}>
                        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                          <EditRowInputs editForm={editForm} setEditForm={setEditForm} />
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => saveEdit(c.id, e)} className="w-7 h-7 flex items-center justify-center rounded-lg text-success hover:bg-success-tint" aria-label="Save">
                            <Check className="w-4 h-4" strokeWidth={2.5} />
                          </button>
                          <button onClick={cancelEdit} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:bg-black/5" aria-label="Cancel">
                            <X className="w-4 h-4" strokeWidth={2.5} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.id} onClick={() => router.push(`/dashboard/customers/${c.id}`)} className="hover:bg-black/[0.015] transition-colors cursor-pointer">
                      <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                      <td className="px-4 py-3 text-muted text-xs">{c.owner || "—"}</td>
                      <td className="px-4 py-3 text-muted text-xs">{c.cnic || "—"}</td>
                      <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{c.phone || "—"}</td>
                      <td className="px-4 py-3 text-muted text-xs">{c.email || "—"}</td>
                      <td className="px-4 py-3 text-muted text-xs">{c.address || "—"}</td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${bal > 0 ? "text-warning" : bal < 0 ? "text-success" : "text-muted"}`}>{formatMoney(bal)}</td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => startEdit(c, e)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/60 hover:text-accent hover:bg-accent-tint transition-colors" aria-label="Edit customer">
                            <Pencil className="w-4 h-4" strokeWidth={2} />
                          </button>
                          <button onClick={(e) => handleDelete(c.id, e)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/60 hover:text-danger hover:bg-danger-tint transition-colors" aria-label="Delete customer">
                            <Trash2 className="w-4 h-4" strokeWidth={2} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      ) : (
        <div key={customersFadeKey} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-fade">
          {customers.map((c) => {
            const bal = c.balance ?? 0;
            const isEditing = editId === c.id;

            if (isEditing) {
              return (
                <div key={c.id} className="card p-5 space-y-2 bg-accent-tint/40">
                  <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Name *" className="input px-2.5 py-1.5 text-sm font-semibold" />
                  <input value={editForm.owner} onChange={e => setEditForm(f => ({ ...f, owner: e.target.value }))} placeholder="Owner" className="input px-2.5 py-1.5 text-xs" />
                  <input type="number" value={editForm.openingBalance} onChange={e => setEditForm(f => ({ ...f, openingBalance: e.target.value }))} placeholder="Opening Balance" className="input px-2.5 py-1.5 text-xs text-right font-mono" />
                  <input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} placeholder="Address" className="input px-2.5 py-1.5 text-xs" />
                  <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="Cell #" className="input px-2.5 py-1.5 text-xs" />
                  <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" className="input px-2.5 py-1.5 text-xs" />
                  <input value={editForm.whatsapp} onChange={e => setEditForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="WhatsApp #" className="input px-2.5 py-1.5 text-xs" />
                  <input value={editForm.cnic} onChange={e => setEditForm(f => ({ ...f, cnic: e.target.value }))} placeholder="CNIC" className="input px-2.5 py-1.5 text-xs" />
                  <div className="flex items-center gap-1 justify-end pt-1">
                    <button onClick={(e) => saveEdit(c.id, e)} className="w-7 h-7 flex items-center justify-center rounded-lg text-success hover:bg-success-tint" aria-label="Save">
                      <Check className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                    <button onClick={cancelEdit} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:bg-black/5" aria-label="Cancel">
                      <X className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <Link key={c.id} href={`/dashboard/customers/${c.id}`} className="relative card p-5 hover:border-accent/40 hover:shadow-pop transition-all group flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-accent-tint flex items-center justify-center text-accent-hover font-semibold text-sm">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <span className={`badge ${bal > 0 ? "bg-warning-tint text-warning" : bal < 0 ? "bg-success-tint text-success" : "bg-black/[0.05] text-muted"}`}>
                    {bal > 0 ? "Owes you" : bal < 0 ? "Paid ahead" : "Settled"}
                  </span>
                </div>
                <p className="font-semibold text-ink group-hover:text-accent transition-colors">{c.name}</p>
                {c.owner && <p className="text-xs text-muted mt-0.5">Owner: {c.owner}</p>}
                <p className="text-xs text-muted mt-0.5">{c.address || "—"}</p>
                {c.phone && <p className="text-xs text-muted mt-0.5">{c.phone}</p>}
                <div className="mt-3 pt-3 border-t border-line flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted font-semibold">Balance</p>
                    <p className={`font-mono font-semibold text-base mt-0.5 tabular-nums ${bal > 0 ? "text-warning" : bal < 0 ? "text-success" : "text-muted"}`}>{formatMoney(bal)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => startEdit(c, e)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/60 hover:text-accent hover:bg-accent-tint transition-colors" aria-label="Edit customer">
                      <Pencil className="w-4 h-4" strokeWidth={2} />
                    </button>
                    <button onClick={(e) => handleDelete(c.id, e)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/60 hover:text-danger hover:bg-danger-tint transition-colors" aria-label="Delete customer">
                      <Trash2 className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </Link>
            );
          })}
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