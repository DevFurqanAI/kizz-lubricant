// "use client";
// import { useState, useEffect, useCallback } from "react";
// import { api } from "@/lib/api";
// import { formatMoney, toNum, fmtDate } from "@/lib/utils";
// import type { Sale } from "@/db/schema";

// export default function SalesPage() {
//   const [rows, setRows] = useState<Sale[]>([]);
//   const [total, setTotal] = useState(0);
//   const [loading, setLoading] = useState(true);
//   const [search, setSearch] = useState("");
//   const [showForm, setShowForm] = useState(false);
//   const [saving, setSaving] = useState(false);
//   const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), detail: "", qty: "", rate: "", amount: "" });

//   const load = useCallback(async (q = "") => {
//     setLoading(true);
//     try {
//       const data = await api.get<{ rows: Sale[]; total: number }>(`/sales${q ? `?search=${encodeURIComponent(q)}` : ""}`);
//       setRows(data.rows); setTotal(data.total);
//     } finally { setLoading(false); }
//   }, []);

//   useEffect(() => { load(); }, [load]);

//   const handleAutoAmount = () => {
//     const q = Number(form.qty), r = Number(form.rate);
//     if (q > 0 && r > 0) setForm(f => ({ ...f, amount: String(q * r) }));
//   };

//   const handleSave = async () => {
//     if (!form.date || !form.detail || !form.amount) return;
//     setSaving(true);
//     try {
//       await api.post("/sales", { ...form, qty: form.qty ? Number(form.qty) : null, rate: form.rate ? Number(form.rate) : null, amount: Number(form.amount) });
//       setForm({ date: new Date().toISOString().slice(0,10), detail: "", qty: "", rate: "", amount: "" });
//       setShowForm(false); load(search);
//     } finally { setSaving(false); }
//   };

//   const handleDelete = async (id: number) => {
//     if (!confirm("Delete this sale?")) return;
//     await api.del(`/sales/${id}`); load(search);
//   };

//   return (
//     <div className="space-y-6">
//       <div className="flex items-start justify-between gap-4 flex-wrap">
//         <div>
//           <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600 font-mono">Income</p>
//           <h1 className="mt-1 text-2xl font-display font-bold uppercase tracking-wide text-gray-900">Sales</h1>
//           <p className="mt-1 text-sm text-gray-400">Every sale made from the factory.</p>
//         </div>
//         <button onClick={() => setShowForm(s => !s)} className="px-4 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl hover:bg-black transition-colors">+ Add Sale</button>
//       </div>

//       {showForm && (
//         <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
//           <h3 className="font-semibold text-gray-800 mb-4">New Sale</h3>
//           <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
//             {[
//               { key: "date", label: "Date", type: "date" },
//               { key: "detail", label: "Detail *", type: "text" },
//               { key: "qty", label: "Qty", type: "number" },
//               { key: "rate", label: "Rate (Rs)", type: "number" },
//               { key: "amount", label: "Amount (Rs) *", type: "number" },
//             ].map(({ key, label, type }) => (
//               <div key={key}>
//                 <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{label}</label>
//                 <input type={type} value={(form as Record<string, string>)[key]}
//                   onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
//                   onBlur={key === "rate" || key === "qty" ? handleAutoAmount : undefined}
//                   className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:border-emerald-400 outline-none" />
//               </div>
//             ))}
//           </div>
//           <p className="text-xs text-gray-400 mt-2">Tip: Enter Qty + Rate — Amount auto-calculates on blur.</p>
//           <div className="flex gap-3 mt-4">
//             <button onClick={handleSave} disabled={saving || !form.detail || !form.amount} className="px-5 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl disabled:opacity-50">{saving ? "Saving…" : "Save Sale"}</button>
//             <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
//           </div>
//         </div>
//       )}

//       <div className="flex items-center justify-between gap-4">
//         <input value={search} onChange={e => { setSearch(e.target.value); load(e.target.value); }} placeholder="Search sales…" className="w-full max-w-sm px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-emerald-400 outline-none" />
//         <div className="text-right flex-shrink-0">
//           <p className="text-[11px] text-gray-400 uppercase tracking-wider">Total</p>
//           <p className="font-mono font-bold text-emerald-600">{formatMoney(total)}</p>
//         </div>
//       </div>

//       <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
//         <div className="overflow-x-auto">
//           <table className="w-full text-sm min-w-[640px]">
//             <thead>
//               <tr className="bg-[#111318] text-white">
//                 {["Date", "Detail", "Qty", "Rate", "Amount", ""].map(h => (
//                   <th key={h} className={`py-3 px-4 text-[11px] font-semibold uppercase tracking-wider ${h === "Amount" || h === "Rate" ? "text-right" : "text-left"}`}>{h}</th>
//                 ))}
//               </tr>
//             </thead>
//             <tbody className="divide-y divide-gray-50">
//               {loading ? (
//                 [...Array(5)].map((_, i) => <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>)
//               ) : rows.length === 0 ? (
//                 <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400 text-sm">No sales recorded yet.</td></tr>
//               ) : rows.map(r => (
//                 <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
//                   <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
//                   <td className="px-4 py-3 text-gray-800">{r.detail}</td>
//                   <td className="px-4 py-3 text-gray-500 text-xs">{r.qty ? Number(r.qty).toLocaleString() : "—"}</td>
//                   <td className="px-4 py-3 text-right font-mono text-gray-500 text-xs">{r.rate ? formatMoney(r.rate) : "—"}</td>
//                   <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600">{formatMoney(r.amount)}</td>
//                   <td className="px-4 py-3"><button onClick={() => handleDelete(r.id)} className="text-gray-300 hover:text-rose-500 transition-colors text-lg leading-none">×</button></td>
//                 </tr>
//               ))}
//             </tbody>
//             {rows.length > 0 && (
//               <tfoot>
//                 <tr className="border-t-2 border-gray-200 bg-gray-50">
//                   <td colSpan={4} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Total Sales</td>
//                   <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">{formatMoney(total)}</td>
//                   <td />
//                 </tr>
//               </tfoot>
//             )}
//           </table>
//         </div>
//       </div>
//     </div>
//   );
// }


"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { formatMoney, toNum, fmtDate } from "@/lib/utils";
import type { Sale } from "@/db/schema";

type SalesData = { rows: Sale[]; total: number };

// Module-scoped cache keyed by search term. Repeat visits / repeat searches
// paint instantly from here instead of showing skeletons, while a silent
// background call keeps the data fresh.
const salesCache = new Map<string, SalesData>();

export default function SalesPage() {
  const cached0 = salesCache.get("");
  const [rows, setRows] = useState<Sale[]>(cached0?.rows ?? []);
  const [total, setTotal] = useState(cached0?.total ?? 0);
  const [loading, setLoading] = useState(!cached0);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), detail: "", qty: "", rate: "", amount: "" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q = "", opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const data = await api.get<SalesData>(`/sales${q ? `?search=${encodeURIComponent(q)}` : ""}`);
      salesCache.set(q, data);
      setRows(data.rows); setTotal(data.total);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  // Initial mount: paint from cache instantly if present, then quietly
  // revalidate instead of a cold fetch every time the page opens.
  useEffect(() => {
    const cached = salesCache.get("");
    if (cached) {
      setRows(cached.rows); setTotal(cached.total);
      setLoading(false);
      load("", { silent: true });
    } else {
      load("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search: input updates instantly, network call fires 300ms
  // after the last keystroke. A term searched before shows immediately
  // while the fresh request is in flight.
  const handleSearch = (v: string) => {
    setSearch(v);
    const cached = salesCache.get(v);
    if (cached) { setRows(cached.rows); setTotal(cached.total); }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(v), 300);
  };

  const handleAutoAmount = () => {
    const q = Number(form.qty), r = Number(form.rate);
    if (q > 0 && r > 0) setForm(f => ({ ...f, amount: String(q * r) }));
  };

  const handleSave = async () => {
    if (!form.date || !form.detail || !form.amount) return;
    setSaving(true);
    try {
      await api.post("/sales", { ...form, qty: form.qty ? Number(form.qty) : null, rate: form.rate ? Number(form.rate) : null, amount: Number(form.amount) });
      setForm({ date: new Date().toISOString().slice(0,10), detail: "", qty: "", rate: "", amount: "" });
      setShowForm(false);
      salesCache.clear(); // a new sale changes every existing view's totals
      load(search);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this sale?")) return;
    await api.del(`/sales/${id}`);
    salesCache.clear();
    load(search);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600 font-mono">Income</p>
          <h1 className="mt-1 text-2xl font-display font-bold uppercase tracking-wide text-gray-900">Sales</h1>
          <p className="mt-1 text-sm text-gray-400">Every sale made from the factory.</p>
        </div>
        <button onClick={() => setShowForm(s => !s)} className="px-4 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl hover:bg-black transition-colors">+ Add Sale</button>
      </div>

      {showForm && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
          <h3 className="font-semibold text-gray-800 mb-4">New Sale</h3>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { key: "date", label: "Date", type: "date" },
              { key: "detail", label: "Detail *", type: "text" },
              { key: "qty", label: "Qty", type: "number" },
              { key: "rate", label: "Rate (Rs)", type: "number" },
              { key: "amount", label: "Amount (Rs) *", type: "number" },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{label}</label>
                <input type={type} value={(form as Record<string, string>)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  onBlur={key === "rate" || key === "qty" ? handleAutoAmount : undefined}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:border-emerald-400 outline-none" />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Tip: Enter Qty + Rate — Amount auto-calculates on blur.</p>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving || !form.detail || !form.amount} className="px-5 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl disabled:opacity-50">{saving ? "Saving…" : "Save Sale"}</button>
            <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Search sales…" className="w-full max-w-sm px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-emerald-400 outline-none" />
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] text-gray-400 uppercase tracking-wider">Total</p>
          <p className="font-mono font-bold text-emerald-600">{formatMoney(total)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-[#111318] text-white">
                {["Date", "Detail", "Qty", "Rate", "Amount", ""].map(h => (
                  <th key={h} className={`py-3 px-4 text-[11px] font-semibold uppercase tracking-wider ${h === "Amount" || h === "Rate" ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                [...Array(5)].map((_, i) => <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>)
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400 text-sm">No sales recorded yet.</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3 text-gray-800">{r.detail}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.qty ? Number(r.qty).toLocaleString() : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-500 text-xs">{r.rate ? formatMoney(r.rate) : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600">{formatMoney(r.amount)}</td>
                  <td className="px-4 py-3"><button onClick={() => handleDelete(r.id)} className="text-gray-300 hover:text-rose-500 transition-colors text-lg leading-none">×</button></td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={4} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Total Sales</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">{formatMoney(total)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}