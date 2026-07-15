// "use client";
// import { useState, useEffect, useCallback } from "react";
// import Link from "next/link";
// import { api } from "@/lib/api";
// import { formatMoney, toNum } from "@/lib/utils";
// import type { Customer } from "@/db/schema";

// type CustomerWithBalance = Customer & { balance?: number };

// export default function CustomersPage() {
//   const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
//   const [search, setSearch] = useState("");
//   const [loading, setLoading] = useState(true);
//   const [showForm, setShowForm] = useState(false);
//   const [saving, setSaving] = useState(false);
//   const [form, setForm] = useState({ name: "", accountTitle: "", owner: "", cnic: "", address: "", phone: "", whatsapp: "", email: "" });

//   const load = useCallback(async (q = "") => {
//     setLoading(true);
//     try {
//       const rows = await api.get<Customer[]>(`/customers${q ? `?search=${encodeURIComponent(q)}` : ""}`);
//       // Fetch balances for each customer in parallel
//       const withBal = await Promise.all(rows.map(async (c) => {
//         try {
//           const detail = await api.get<Customer & { entries: { balance: string }[] }>(`/customers/${c.id}`);
//           const entries = detail.entries ?? [];
//           const bal = entries.length > 0 ? toNum(entries[entries.length - 1].balance) : 0;
//           return { ...c, balance: bal };
//         } catch { return { ...c, balance: 0 }; }
//       }));
//       setCustomers(withBal);
//     } finally { setLoading(false); }
//   }, []);

//   useEffect(() => { load(); }, [load]);

//   const handleSearch = (v: string) => { setSearch(v); load(v); };

//   const handleSave = async () => {
//     if (!form.name) return;
//     setSaving(true);
//     try {
//       await api.post("/customers", form);
//       setForm({ name: "", accountTitle: "", owner: "", cnic: "", address: "", phone: "", whatsapp: "", email: "" });
//       setShowForm(false);
//       load(search);
//     } finally { setSaving(false); }
//   };

//   return (
//     <div className="space-y-6">
//       <div className="flex items-start justify-between gap-4 flex-wrap">
//         <div>
//           <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-600 font-mono">Accounts</p>
//           <h1 className="mt-1 text-2xl font-display font-bold uppercase tracking-wide text-gray-900">Customers</h1>
//           <p className="mt-1 text-sm text-gray-400">Each customer has a full ledger — debit, credit and running balance.</p>
//         </div>
//         <button onClick={() => setShowForm(s => !s)} className="px-4 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl hover:bg-black transition-colors">
//           + Add Customer
//         </button>
//       </div>

//       {showForm && (
//         <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
//           <h3 className="font-semibold text-gray-800 mb-4">New Customer</h3>
//           <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
//             {[
//               { key: "name", label: "Name / Account Title *" },
//               { key: "owner", label: "Owner" },
//               { key: "cnic", label: "CNIC" },
//               { key: "address", label: "Address" },
//               { key: "phone", label: "Cell #" },
//               { key: "whatsapp", label: "WhatsApp #" },
//             ].map(({ key, label }) => (
//               <div key={key}>
//                 <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{label}</label>
//                 <input value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:border-amber-400 outline-none" />
//               </div>
//             ))}
//           </div>
//           <div className="flex gap-3 mt-4">
//             <button onClick={handleSave} disabled={saving || !form.name} className="px-5 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl disabled:opacity-50">
//               {saving ? "Saving…" : "Save Customer"}
//             </button>
//             <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
//           </div>
//         </div>
//       )}

//       <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Search customers…" className="w-full max-w-sm px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-amber-400 outline-none" />

//       {loading ? (
//         <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
//           {[...Array(6)].map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
//         </div>
//       ) : customers.length === 0 ? (
//         <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
//           <p className="text-gray-400">No customers found.</p>
//         </div>
//       ) : (
//         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
//           {customers.map((c) => {
//             const bal = c.balance ?? 0;
//             return (
//               <Link key={c.id} href={`/dashboard/customers/${c.id}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-amber-300 hover:shadow-md transition-all group">
//                 <div className="flex items-start justify-between mb-3">
//                   <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 font-display font-bold text-sm">
//                     {c.name.charAt(0).toUpperCase()}
//                   </div>
//                   <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${bal > 0 ? "bg-amber-50 text-amber-600" : bal < 0 ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-400"}`}>
//                     {bal > 0 ? "Owes" : bal < 0 ? "Credit" : "Settled"}
//                   </span>
//                 </div>
//                 <p className="font-semibold text-gray-800 group-hover:text-amber-700 transition-colors">{c.name}</p>
//                 <p className="text-xs text-gray-400 mt-0.5">{c.address || "—"}</p>
//                 {c.phone && <p className="text-xs text-gray-400 mt-0.5">{c.phone}</p>}
//                 <div className="mt-3 pt-3 border-t border-gray-50">
//                   <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Balance</p>
//                   <p className={`font-mono font-semibold text-base mt-0.5 ${bal > 0 ? "text-amber-600" : bal < 0 ? "text-emerald-600" : "text-gray-400"}`}>{formatMoney(bal)}</p>
//                 </div>
//               </Link>
//             );
//           })}
//         </div>
//       )}
//     </div>
//   );
// }

"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatMoney, toNum } from "@/lib/utils";
import type { Customer } from "@/db/schema";
import { customerDetailCache, customerListCache, latestBalance, type CustomerWithBalance, type FullCustomer } from "@/lib/customercache";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithBalance[]>(() => customerListCache.get("") ?? []);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(() => !customerListCache.has(""));
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", accountTitle: "", owner: "", cnic: "", address: "", phone: "", whatsapp: "", email: "" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q = "", opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const rows = await api.get<Customer[]>(`/customers${q ? `?search=${encodeURIComponent(q)}` : ""}`);

      // Fetch balances in parallel, but skip the network entirely for any
      // customer we already have a cached detail record for.
      const withBal = await Promise.all(
        rows.map(async (c) => {
          const key = String(c.id);
          const cached = customerDetailCache.get(key);
          if (cached) {
            return { ...c, balance: latestBalance(cached.entries) };
          }
          try {
            const detail = await api.get<FullCustomer>(`/customers/${c.id}`);
            customerDetailCache.set(key, detail);
            return { ...c, balance: latestBalance(detail.entries) };
          } catch {
            return { ...c, balance: 0 };
          }
        })
      );

      customerListCache.set(q, withBal);
      setCustomers(withBal);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  // Initial mount: paint from cache instantly if we have it, then
  // quietly revalidate in the background instead of a cold fetch.
  useEffect(() => {
    const cached = customerListCache.get("");
    if (cached) {
      setCustomers(cached);
      setLoading(false);
      load("", { silent: true });
    } else {
      load("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search: typing updates the input instantly, but the network
  // call only fires 300ms after the last keystroke. If we've searched this
  // exact term before in this session, show it immediately while the fresh
  // request is in flight.
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
      customerListCache.delete(search); // list is now stale, force a real refetch
      load(search);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-600 font-mono">Accounts</p>
          <h1 className="mt-1 text-2xl font-display font-bold uppercase tracking-wide text-gray-900">Customers</h1>
          <p className="mt-1 text-sm text-gray-400">Each customer has a full ledger — debit, credit and running balance.</p>
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
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{label}</label>
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
          <p className="text-gray-400">No customers found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {customers.map((c) => {
            const bal = c.balance ?? 0;
            return (
              <Link key={c.id} href={`/dashboard/customers/${c.id}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-amber-300 hover:shadow-md transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 font-display font-bold text-sm">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${bal > 0 ? "bg-amber-50 text-amber-600" : bal < 0 ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-400"}`}>
                    {bal > 0 ? "Owes" : bal < 0 ? "Credit" : "Settled"}
                  </span>
                </div>
                <p className="font-semibold text-gray-800 group-hover:text-amber-700 transition-colors">{c.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{c.address || "—"}</p>
                {c.phone && <p className="text-xs text-gray-400 mt-0.5">{c.phone}</p>}
                <div className="mt-3 pt-3 border-t border-gray-50">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Balance</p>
                  <p className={`font-mono font-semibold text-base mt-0.5 ${bal > 0 ? "text-amber-600" : bal < 0 ? "text-emerald-600" : "text-gray-400"}`}>{formatMoney(bal)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}