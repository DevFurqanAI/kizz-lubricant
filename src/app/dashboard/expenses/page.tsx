// "use client";
// import { useState, useEffect, useCallback } from "react";
// import { api } from "@/lib/api";
// import { formatMoney, fmtDate } from "@/lib/utils";

// type Row = { id: number; date: string; detail: string; amount: string };

// export default function ExpensesPage() {
//   const [rows, setRows] = useState<Row[]>([]);
//   const [total, setTotal] = useState(0);
//   const [loading, setLoading] = useState(true);
//   const [search, setSearch] = useState("");
//   const [showForm, setShowForm] = useState(false);
//   const [saving, setSaving] = useState(false);
//   const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), detail: "", amount: "" });

//   const load = useCallback(async (q = "") => {
//     setLoading(true);
//     try {
//       const data = await api.get<{ rows: Row[]; total: number }>(`/expenses${q ? `?search=${encodeURIComponent(q)}` : ""}`);
//       setRows(data.rows); setTotal(data.total);
//     } finally { setLoading(false); }
//   }, []);

//   useEffect(() => { load(); }, [load]);

//   const handleSave = async () => {
//     if (!form.date || !form.detail || !form.amount) return;
//     setSaving(true);
//     try {
//       await api.post("/expenses", { ...form, amount: Number(form.amount) });
//       setForm({ date: new Date().toISOString().slice(0,10), detail: "", amount: "" });
//       setShowForm(false); load(search);
//     } finally { setSaving(false); }
//   };

//   const handleDelete = async (id: number) => {
//     if (!confirm("Delete this entry?")) return;
//     await api.del(`/expenses/${id}`); load(search);
//   };

//   return (
//     <div className="space-y-6">
//       <div className="flex items-start justify-between gap-4 flex-wrap">
//         <div>
//           <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-600 font-mono">Cost</p>
//           <h1 className="mt-1 text-2xl font-display font-bold uppercase tracking-wide text-gray-900">Expenses</h1>
//           <p className="mt-1 text-sm text-gray-400">Plant rent, petrol, repairs and other running costs.</p>
//         </div>
//         <button onClick={() => setShowForm(s => !s)} className="px-4 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl hover:bg-black transition-colors">+ Add Expenses</button>
//       </div>

//       {showForm && (
//         <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
//           <h3 className="font-semibold text-gray-800 mb-4">New Entry</h3>
//           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
//             {[{ key: "date", label: "Date", type: "date" }, { key: "detail", label: "Detail *", type: "text" }, { key: "amount", label: "Amount (Rs) *", type: "number" }].map(({ key, label, type }) => (
//               <div key={key}>
//                 <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{label}</label>
//                 <input type={type} value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:border-amber-400 outline-none" />
//               </div>
//             ))}
//           </div>
//           <div className="flex gap-3 mt-4">
//             <button onClick={handleSave} disabled={saving || !form.detail || !form.amount} className="px-5 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
//             <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
//           </div>
//         </div>
//       )}

//       <div className="flex items-center justify-between gap-4">
//         <input value={search} onChange={e => { setSearch(e.target.value); load(e.target.value); }} placeholder="Search…" className="w-full max-w-sm px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-amber-400 outline-none" />
//         <div className="text-right flex-shrink-0">
//           <p className="text-[11px] text-gray-400 uppercase tracking-wider">Total</p>
//           <p className="font-mono font-bold text-amber-600">{formatMoney(total)}</p>
//         </div>
//       </div>

//       <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
//         <div className="overflow-x-auto">
//           <table className="w-full text-sm">
//             <thead>
//               <tr className="bg-[#111318] text-white">
//                 {["Date", "Detail", "Amount", ""].map(h => <th key={h} className={`py-3 px-4 text-[11px] font-semibold uppercase tracking-wider ${h === "Amount" ? "text-right" : "text-left"}`}>{h}</th>)}
//               </tr>
//             </thead>
//             <tbody className="divide-y divide-gray-50">
//               {loading ? [...Array(4)].map((_, i) => <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>) :
//                rows.length === 0 ? <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400 text-sm">No entries yet.</td></tr> :
//                rows.map(r => (
//                 <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
//                   <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
//                   <td className="px-4 py-3 text-gray-800">{r.detail}</td>
//                   <td className="px-4 py-3 text-right font-mono font-semibold text-amber-600">{formatMoney(r.amount)}</td>
//                   <td className="px-4 py-3"><button onClick={() => handleDelete(r.id)} className="text-gray-300 hover:text-rose-500 transition-colors text-lg leading-none">×</button></td>
//                 </tr>
//               ))}
//             </tbody>
//             {rows.length > 0 && <tfoot><tr className="border-t-2 border-gray-200 bg-gray-50"><td colSpan={2} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Total</td><td className="px-4 py-3 text-right font-mono font-bold text-amber-600">{formatMoney(total)}</td><td /></tr></tfoot>}
//           </table>
//         </div>
//       </div>
//     </div>
//   );
// }


"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { formatMoney, fmtDate } from "@/lib/utils";
import { Plus, Search, Fuel, Trash2, X } from "lucide-react";

type Row = { id: number; date: string; detail: string; amount: string };

export default function ExpensesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), detail: "", amount: "" });

  const load = useCallback(async (q = "") => {
    setLoading(true);
    try {
      const data = await api.get<{ rows: Row[]; total: number }>(`/expenses${q ? `?search=${encodeURIComponent(q)}` : ""}`);
      setRows(data.rows);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.date || !form.detail || !form.amount) return;
    setSaving(true);
    try {
      await api.post("/expenses", { ...form, amount: Number(form.amount) });
      setForm({ date: new Date().toISOString().slice(0, 10), detail: "", amount: "" });
      setShowForm(false);
      load(search);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this entry?")) return;
    await api.del(`/expenses/${id}`);
    load(search);
  };

  const average = useMemo(() => (rows.length ? total / rows.length : 0), [rows, total]);

  return (
    <div className="space-y-6 pb-10">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#D97706] font-mono">
              Ledger · 04 / 06
            </p>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-display font-bold uppercase tracking-wide text-[#0B0D12]">
            Expenses
          </h1>
          <p className="mt-1 text-sm text-black/40">Plant rent, petrol, repairs and other running costs.</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0B0D12] text-white text-sm font-semibold rounded-xl hover:bg-black active:scale-[0.98] transition-all shadow-[0_6px_18px_-6px_rgba(217,119,6,0.4)]"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add expense
        </button>
      </div>

      {/* ── Stat strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative overflow-hidden rounded-2xl bg-[#0B0D12] p-5">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-[#D97706]/10 blur-2xl" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35 font-mono">Total cost</p>
          <p className="mt-2 text-2xl font-mono font-bold text-[#F59E0B] tabular-nums">{formatMoney(total)}</p>
          {/* gauge ticks */}
          <div className="mt-3 flex gap-[3px]">
            {[...Array(24)].map((_, i) => (
              <span key={i} className={`h-3 w-[2px] rounded-full ${i < 16 ? "bg-[#D97706]/70" : "bg-white/10"}`} />
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-black/[0.06] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35 font-mono">Entries</p>
          <p className="mt-2 text-2xl font-mono font-bold text-[#0B0D12] tabular-nums">{rows.length}</p>
          <p className="mt-3 text-xs text-black/35">{search ? `matching "${search}"` : "all recorded so far"}</p>
        </div>
        <div className="rounded-2xl bg-white border border-black/[0.06] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35 font-mono">Average / entry</p>
          <p className="mt-2 text-2xl font-mono font-bold text-[#0B0D12] tabular-nums">{formatMoney(average)}</p>
          <p className="mt-3 text-xs text-black/35">based on current view</p>
        </div>
      </div>

      {/* ── New entry form (slide down) ───────────────────── */}
      <div
        className={`transition-all duration-300 ease-out overflow-hidden ${
          showForm ? "max-h-[420px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="bg-amber-50/60 border border-amber-200/70 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="flex items-center gap-2 font-display font-semibold text-[#0B0D12] text-sm uppercase tracking-wide">
              <Fuel className="w-4 h-4 text-[#D97706]" strokeWidth={2} />
              New entry
            </h3>
            <button
              onClick={() => setShowForm(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-black/30 hover:text-black hover:bg-black/5"
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
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-black/40 mb-1.5">
                  {label}
                </label>
                <input
                  type={type}
                  value={(form as Record<string, string>)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-black/10 text-sm bg-white focus:border-[#D97706] focus:ring-2 focus:ring-[#D97706]/15 outline-none transition-shadow"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-5">
            <button
              onClick={handleSave}
              disabled={saving || !form.detail || !form.amount}
              className="px-5 py-2.5 bg-[#0B0D12] text-white text-sm font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black active:scale-[0.98] transition-all"
            >
              {saving ? "Saving…" : "Save entry"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-5 py-2.5 border border-black/10 text-black/60 text-sm font-semibold rounded-xl hover:bg-black/[0.03] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-black/25" strokeWidth={2} />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            load(e.target.value);
          }}
          placeholder="Search expenses…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-black/10 text-sm bg-white focus:border-[#D97706] focus:ring-2 focus:ring-[#D97706]/15 outline-none transition-shadow"
        />
      </div>

      {/* ── Desktop / tablet table ─────────────────────────── */}
      <div className="hidden sm:block bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0B0D12] text-white">
                {["Date", "Detail", "Amount", ""].map((h) => (
                  <th
                    key={h}
                    className={`py-3 px-4 text-[11px] font-semibold uppercase tracking-wider ${
                      h === "Amount" ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {loading
                ? [...Array(4)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={4} className="px-4 py-3">
                        <div className="h-4 bg-black/[0.05] rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                : rows.length === 0
                ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-14 text-center">
                      <Fuel className="w-8 h-8 mx-auto text-black/15 mb-2" strokeWidth={1.5} />
                      <p className="text-black/40 text-sm">No entries yet. Add your first expense above.</p>
                    </td>
                  </tr>
                )
                : rows.map((r) => (
                  <tr key={r.id} className="hover:bg-black/[0.015] transition-colors group">
                    <td className="px-4 py-3.5 text-black/45 text-xs font-mono whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3.5 text-black/80">{r.detail}</td>
                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-[#D97706] tabular-nums">
                      {formatMoney(r.amount)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-black/15 group-hover:text-black/40 hover:!text-rose-500 transition-colors"
                        aria-label="Delete entry"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-black/[0.06] bg-black/[0.015]">
                  <td colSpan={2} className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-black/45">
                    Total
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-[#D97706] tabular-nums">
                    {formatMoney(total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Mobile card list ───────────────────────────────── */}
      <div className="sm:hidden space-y-2.5">
        {loading
          ? [...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-white rounded-2xl border border-black/[0.06] animate-pulse" />
            ))
          : rows.length === 0
          ? (
            <div className="bg-white rounded-2xl border border-black/[0.06] px-6 py-12 text-center">
              <Fuel className="w-8 h-8 mx-auto text-black/15 mb-2" strokeWidth={1.5} />
              <p className="text-black/40 text-sm">No entries yet.</p>
            </div>
          )
          : rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 bg-white rounded-2xl border border-black/[0.06] px-4 py-3.5 active:bg-black/[0.02]"
            >
              <div className="flex-1 min-w-0">
                <p className="text-black/85 text-sm truncate">{r.detail}</p>
                <p className="text-black/35 text-[11px] font-mono mt-0.5">{fmtDate(r.date)}</p>
              </div>
              <p className="font-mono font-semibold text-[#D97706] text-sm tabular-nums flex-shrink-0">
                {formatMoney(r.amount)}
              </p>
              <button
                onClick={() => handleDelete(r.id)}
                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-black/20 active:text-rose-500 active:bg-rose-50"
                aria-label="Delete entry"
              >
                <Trash2 className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
          ))}

        {rows.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3.5 rounded-2xl bg-[#0B0D12]">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Total</p>
            <p className="font-mono font-bold text-[#F59E0B] tabular-nums">{formatMoney(total)}</p>
          </div>
        )}
      </div>
    </div>
  );
}