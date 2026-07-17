

"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { customerDetailCache, customerListCache, type CustomerWithBalance } from "@/lib/customercache";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState, CardGridSkeleton } from "@/components/states";
import { SearchInput } from "@/components/search-input";
import { Users } from "lucide-react";

const PAGE_SIZE = 50;
const cacheKey = (q: string, page: number) => `${q}|p${page}`;

export default function CustomersPage() {
  const first = customerListCache.get(cacheKey("", 1));
  const [customers, setCustomers] = useState<CustomerWithBalance[]>(() => first?.rows ?? []);
  const [count, setCount] = useState(() => first?.count ?? 0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(() => !first);
  const [error, setError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", accountTitle: "", owner: "", cnic: "", address: "", phone: "", whatsapp: "", email: "" });
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", owner: "", cnic: "", address: "", phone: "", whatsapp: "" });
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
    if (!form.name) return;
    setSaving(true);
    try {
      await api.post("/customers", form);
      setForm({ name: "", accountTitle: "", owner: "", cnic: "", address: "", phone: "", whatsapp: "", email: "" });
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
    setEditForm({ name: c.name, owner: c.owner ?? "", cnic: c.cnic ?? "", address: c.address ?? "", phone: c.phone ?? "", whatsapp: c.whatsapp ?? "" });
  };

  const cancelEdit = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setEditId(null); };

  const saveEdit = async (id: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!editForm.name) return;
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
    if (!(await confirm({ title: "Delete this customer?", message: "This permanently removes the customer and their entire ledger.", confirmText: "Delete", danger: true }))) return;
    const prev = customers;
    setCustomers(cs => cs.filter(c => c.id !== id));
    setCount(n => Math.max(0, n - 1));
    try {
      await api.del(`/customers/${id}`);
      customerListCache.clear();
      customerDetailCache.delete(String(id));
      load(search, page, { silent: true });
      toast.success("Customer deleted");
    } catch { setCustomers(prev); toast.error("Couldn't delete customer"); }
  };

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
        <button onClick={() => setShowForm(s => !s)} className="btn-primary">
          + Add Customer
        </button>
      </div>

      {showForm && (
        <div className="card p-6">
          <h3 className="font-semibold text-ink mb-4">New Customer</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: "name", label: "Name / Account Title *" },
              { key: "owner", label: "Owner" },
              { key: "cnic", label: "CNIC" },
              { key: "address", label: "Address" },
              { key: "phone", label: "Cell #" },
              { key: "whatsapp", label: "WhatsApp #" },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="input py-2.5 text-sm" />
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={search} onChange={handleSearch} placeholder="Search customers…" className="max-w-sm w-full" />
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {customers.map((c) => {
            const bal = c.balance ?? 0;
            const isEditing = editId === c.id;

            if (isEditing) {
              return (
                <div key={c.id} className="card p-5 space-y-2 ring-1 ring-accent/30">
                  <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Name *" className="input px-2.5 py-1.5 text-sm font-semibold" />
                  <input value={editForm.owner} onChange={e => setEditForm(f => ({ ...f, owner: e.target.value }))} placeholder="Owner" className="input px-2.5 py-1.5 text-xs" />
                  <input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} placeholder="Address" className="input px-2.5 py-1.5 text-xs" />
                  <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="Cell #" className="input px-2.5 py-1.5 text-xs" />
                  <input value={editForm.whatsapp} onChange={e => setEditForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="WhatsApp #" className="input px-2.5 py-1.5 text-xs" />
                  <input value={editForm.cnic} onChange={e => setEditForm(f => ({ ...f, cnic: e.target.value }))} placeholder="CNIC" className="input px-2.5 py-1.5 text-xs" />
                  <div className="flex gap-4 pt-1">
                    <button onClick={(e) => saveEdit(c.id, e)} className="text-success font-semibold text-sm">✓ Save</button>
                    <button onClick={cancelEdit} className="text-muted text-sm">Cancel</button>
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
                <p className="text-xs text-muted mt-0.5">{c.address || "—"}</p>
                {c.phone && <p className="text-xs text-muted mt-0.5">{c.phone}</p>}
                <div className="mt-3 pt-3 border-t border-line flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted font-semibold">Balance</p>
                    <p className={`font-mono font-semibold text-base mt-0.5 tabular-nums ${bal > 0 ? "text-warning" : bal < 0 ? "text-success" : "text-muted"}`}>{formatMoney(bal)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={(e) => startEdit(c, e)} className="text-muted/50 hover:text-accent transition-colors" aria-label="Edit customer">✎</button>
                    <button onClick={(e) => handleDelete(c.id, e)} className="text-muted/50 hover:text-danger transition-colors text-lg leading-none" aria-label="Delete customer">×</button>
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