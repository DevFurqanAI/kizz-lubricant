

"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { customerDetailCache, customerListCache, type CustomerWithBalance } from "@/lib/customercache";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithBalance[]>(() => customerListCache.get("") ?? []);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(() => !customerListCache.has(""));
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", accountTitle: "", owner: "", cnic: "", address: "", phone: "", whatsapp: "", email: "" });
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", owner: "", cnic: "", address: "", phone: "", whatsapp: "" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (q = "", opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      // Balances now arrive with the list in a single request (server-computed).
      const rows = await api.get<CustomerWithBalance[]>(`/customers${q ? `?search=${encodeURIComponent(q)}` : ""}`);
      customerListCache.set(q, rows);
      setCustomers(rows);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = customerListCache.get("");
    if (cached) {
      setCustomers(cached);
      setLoading(false);
      load("", { silent: true });
    } else {
      load("");
    }
  }, []);

  const handleSearch = (v: string) => {
    setSearch(v);
    const cached = customerListCache.get(v);
    if (cached) setCustomers(cached);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(v), 300);
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      await api.post("/customers", form);
      setForm({ name: "", accountTitle: "", owner: "", cnic: "", address: "", phone: "", whatsapp: "", email: "" });
      setShowForm(false);
      customerListCache.delete(search);
      load(search);
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
      customerListCache.delete(search);
      customerDetailCache.delete(String(id));
      load(search, { silent: true });
      toast.success("Customer updated");
    } catch { setCustomers(prev); toast.error("Couldn't update customer"); }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!(await confirm({ title: "Delete this customer?", message: "This permanently removes the customer and their entire ledger.", confirmText: "Delete", danger: true }))) return;
    const prev = customers;
    setCustomers(cs => cs.filter(c => c.id !== id));
    try {
      await api.del(`/customers/${id}`);
      customerListCache.delete(search);
      customerDetailCache.delete(String(id));
      toast.success("Customer deleted");
    } catch { setCustomers(prev); toast.error("Couldn't delete customer"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-600 font-mono">Accounts</p>
          <h1 className="mt-1 text-2xl font-display font-bold uppercase tracking-wide text-gray-900">Customers</h1>
          <p className="mt-1 text-sm text-gray-500">Each customer has a full ledger — debit, credit and running balance.</p>
        </div>
        <button onClick={() => setShowForm(s => !s)} className="px-4 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl hover:bg-black transition-colors">
          + Add Customer
        </button>
      </div>

      {showForm && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <h3 className="font-semibold text-gray-800 mb-4">New Customer</h3>
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
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">{label}</label>
                <input value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:border-amber-400 outline-none" />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving || !form.name} className="px-5 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl disabled:opacity-50">
              {saving ? "Saving…" : "Save Customer"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Search customers…" className="w-full max-w-sm px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-amber-400 outline-none" />

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-gray-500">No customers found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {customers.map((c) => {
            const bal = c.balance ?? 0;
            const isEditing = editId === c.id;

            if (isEditing) {
              return (
                <div key={c.id} className="bg-amber-50 rounded-2xl border border-amber-200 shadow-sm p-5 space-y-2">
                  <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Name *" className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 text-sm font-semibold bg-white outline-none focus:border-amber-400" />
                  <input value={editForm.owner} onChange={e => setEditForm(f => ({ ...f, owner: e.target.value }))} placeholder="Owner" className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs bg-white outline-none focus:border-amber-400" />
                  <input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} placeholder="Address" className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs bg-white outline-none focus:border-amber-400" />
                  <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="Cell #" className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs bg-white outline-none focus:border-amber-400" />
                  <input value={editForm.whatsapp} onChange={e => setEditForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="WhatsApp #" className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs bg-white outline-none focus:border-amber-400" />
                  <input value={editForm.cnic} onChange={e => setEditForm(f => ({ ...f, cnic: e.target.value }))} placeholder="CNIC" className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs bg-white outline-none focus:border-amber-400" />
                  <div className="flex gap-4 pt-1">
                    <button onClick={(e) => saveEdit(c.id, e)} className="text-emerald-600 font-bold text-sm">✓ Save</button>
                    <button onClick={cancelEdit} className="text-gray-500 text-sm">Cancel</button>
                  </div>
                </div>
              );
            }

            return (
              <Link key={c.id} href={`/dashboard/customers/${c.id}`} className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-amber-300 hover:shadow-md transition-all group flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 font-display font-bold text-sm">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${bal > 0 ? "bg-amber-50 text-amber-600" : bal < 0 ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-500"}`}>
                    {bal > 0 ? "Owes" : bal < 0 ? "Credit" : "Settled"}
                  </span>
                </div>
                <p className="font-semibold text-gray-800 group-hover:text-amber-700 transition-colors">{c.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{c.address || "—"}</p>
                {c.phone && <p className="text-xs text-gray-500 mt-0.5">{c.phone}</p>}
                <div className="mt-3 pt-3 border-t border-gray-50 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Balance</p>
                    <p className={`font-mono font-semibold text-base mt-0.5 ${bal > 0 ? "text-amber-600" : bal < 0 ? "text-emerald-600" : "text-gray-500"}`}>{formatMoney(bal)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={(e) => startEdit(c, e)} className="text-gray-300 hover:text-amber-600 transition-colors" aria-label="Edit customer">✎</button>
                    <button onClick={(e) => handleDelete(c.id, e)} className="text-gray-300 hover:text-rose-500 transition-colors text-lg leading-none" aria-label="Delete customer">×</button>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}