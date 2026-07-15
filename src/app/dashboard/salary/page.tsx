// "use client";
// import { useState, useEffect, useCallback } from "react";
// import { api } from "@/lib/api";
// import { formatMoney, toNum, fmtDate } from "@/lib/utils";
// type Row = { id: number; date: string; employee: string; amount: string; account: string };

// export default function SalaryPage() {
//   const [rows, setRows] = useState<Row[]>([]);
//   const [total, setTotal] = useState(0);
//   const [loading, setLoading] = useState(true);
//   const [search, setSearch] = useState("");
//   const [showForm, setShowForm] = useState(false);
//   const [saving, setSaving] = useState(false);
//   const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), employee: "", amount: "", account: "" });

//   const load = useCallback(async (q = "") => {
//     setLoading(true);
//     try {
//       const data = await api.get<{ rows: Row[]; total: number }>(`/salary${q ? `?search=${encodeURIComponent(q)}` : ""}`);
//       setRows(data.rows); setTotal(data.total);
//     } finally { setLoading(false); }
//   }, []);

//   useEffect(() => { load(); }, [load]);

//   const handleSave = async () => {
//     if (!form.date || !form.employee || !form.amount) return;
//     setSaving(true);
//     try {
//       await api.post("/salary", { ...form, amount: Number(form.amount) });
//       setForm({ date: new Date().toISOString().slice(0,10), employee: "", amount: "", account: "" });
//       setShowForm(false); load(search);
//     } finally { setSaving(false); }
//   };

//   const byEmployee: Record<string, number> = {};
//   rows.forEach(r => { byEmployee[r.employee] = (byEmployee[r.employee] || 0) + toNum(r.amount); });

//   return (
//     <div className="space-y-6">
//       <div className="flex items-start justify-between gap-4 flex-wrap">
//         <div>
//           <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-600 font-mono">Payroll</p>
//           <h1 className="mt-1 text-2xl font-display font-bold uppercase tracking-wide text-gray-900">Salary</h1>
//           <p className="mt-1 text-sm text-gray-400">Staff salary payments, tracked by employee and transfer method.</p>
//         </div>
//         <button onClick={() => setShowForm(s => !s)} className="px-4 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl hover:bg-black">+ Add Payment</button>
//       </div>

//       {Object.keys(byEmployee).length > 0 && (
//         <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
//           {Object.entries(byEmployee).map(([emp, total]) => (
//             <div key={emp} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
//               <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 font-bold text-sm mb-2">{emp.charAt(0)}</div>
//               <p className="font-semibold text-gray-800 text-sm">{emp}</p>
//               <p className="font-mono text-violet-600 font-bold mt-1">{formatMoney(total)}</p>
//               <p className="text-[11px] text-gray-400 mt-0.5">Total paid</p>
//             </div>
//           ))}
//         </div>
//       )}

//       {showForm && (
//         <div className="bg-violet-50 border border-violet-200 rounded-2xl p-6">
//           <h3 className="font-semibold text-gray-800 mb-4">New Payment</h3>
//           <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
//             {[{ key:"date",label:"Date",type:"date"},{key:"employee",label:"Employee *",type:"text"},{key:"amount",label:"Amount (Rs) *",type:"number"},{key:"account",label:"Paid Via / Account",type:"text"}].map(({key,label,type})=>(
//               <div key={key}><label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{label}</label><input type={type} value={(form as Record<string,string>)[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:border-violet-400 outline-none" /></div>
//             ))}
//           </div>
//           <div className="flex gap-3 mt-4">
//             <button onClick={handleSave} disabled={saving||!form.employee||!form.amount} className="px-5 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl disabled:opacity-50">{saving?"Saving…":"Save Payment"}</button>
//             <button onClick={()=>setShowForm(false)} className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
//           </div>
//         </div>
//       )}

//       <div className="flex items-center justify-between gap-4">
//         <input value={search} onChange={e=>{setSearch(e.target.value);load(e.target.value);}} placeholder="Search by employee…" className="w-full max-w-sm px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-violet-400 outline-none" />
//         <div className="text-right flex-shrink-0"><p className="text-[11px] text-gray-400 uppercase tracking-wider">Total Paid</p><p className="font-mono font-bold text-violet-600">{formatMoney(total)}</p></div>
//       </div>

//       <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
//         <div className="overflow-x-auto">
//           <table className="w-full text-sm min-w-[500px]">
//             <thead><tr className="bg-[#111318] text-white">{["Date","Employee","Amount","Paid Via",""].map(h=><th key={h} className={`py-3 px-4 text-[11px] font-semibold uppercase tracking-wider ${h==="Amount"?"text-right":"text-left"}`}>{h}</th>)}</tr></thead>
//             <tbody className="divide-y divide-gray-50">
//               {loading?[...Array(4)].map((_,i)=><tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse"/></td></tr>):
//                rows.length===0?<tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm">No salary records yet.</td></tr>:
//                rows.map(r=>(
//                 <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
//                   <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
//                   <td className="px-4 py-3 font-semibold text-gray-800">{r.employee}</td>
//                   <td className="px-4 py-3 text-right font-mono font-semibold text-violet-600">{formatMoney(r.amount)}</td>
//                   <td className="px-4 py-3 text-gray-400 text-xs">{r.account||"—"}</td>
//                   <td className="px-4 py-3"><button onClick={async()=>{if(!confirm("Delete?"))return;await api.del(`/salary/${r.id}`);load(search);}} className="text-gray-300 hover:text-rose-500 transition-colors text-lg leading-none">×</button></td>
//                 </tr>
//               ))}
//             </tbody>
//             {rows.length>0&&<tfoot><tr className="border-t-2 border-gray-200 bg-gray-50"><td colSpan={2} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Total Salary Paid</td><td className="px-4 py-3 text-right font-mono font-bold text-violet-600">{formatMoney(total)}</td><td colSpan={2}/></tr></tfoot>}
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
type Row = { id: number; date: string; employee: string; amount: string; account: string };
type SalaryData = { rows: Row[]; total: number };

// Module-scoped cache keyed by search term. Lets us paint instantly on
// repeat visits / repeat searches instead of showing skeletons every time,
// then silently revalidate against the server in the background.
const salaryCache = new Map<string, SalaryData>();

export default function SalaryPage() {
  const cached0 = salaryCache.get("");
  const [rows, setRows] = useState<Row[]>(cached0?.rows ?? []);
  const [total, setTotal] = useState(cached0?.total ?? 0);
  const [loading, setLoading] = useState(!cached0);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), employee: "", amount: "", account: "" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Initial mount: paint from cache instantly if we have it, then quietly
  // revalidate instead of a cold fetch every time the page opens.
  useEffect(() => {
    const cached = salaryCache.get("");
    if (cached) {
      setRows(cached.rows); setTotal(cached.total);
      setLoading(false);
      load("", { silent: true });
    } else {
      load("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search: input stays instant, network call fires 300ms after
  // the last keystroke. Reusing a term you've already searched shows
  // immediately while the fresh request is in flight.
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
    try {
      await api.post("/salary", { ...form, amount: Number(form.amount) });
      setForm({ date: new Date().toISOString().slice(0,10), employee: "", amount: "", account: "" });
      setShowForm(false);
      salaryCache.clear(); // a new payment changes every existing view's totals
      load(search);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete?")) return;
    await api.del(`/salary/${id}`);
    salaryCache.clear();
    load(search);
  };

  const byEmployee: Record<string, number> = {};
  rows.forEach(r => { byEmployee[r.employee] = (byEmployee[r.employee] || 0) + toNum(r.amount); });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-600 font-mono">Payroll</p>
          <h1 className="mt-1 text-2xl font-display font-bold uppercase tracking-wide text-gray-900">Salary</h1>
          <p className="mt-1 text-sm text-gray-400">Staff salary payments, tracked by employee and transfer method.</p>
        </div>
        <button onClick={() => setShowForm(s => !s)} className="px-4 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl hover:bg-black">+ Add Payment</button>
      </div>

      {Object.keys(byEmployee).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Object.entries(byEmployee).map(([emp, total]) => (
            <div key={emp} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 font-bold text-sm mb-2">{emp.charAt(0)}</div>
              <p className="font-semibold text-gray-800 text-sm">{emp}</p>
              <p className="font-mono text-violet-600 font-bold mt-1">{formatMoney(total)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Total paid</p>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-6">
          <h3 className="font-semibold text-gray-800 mb-4">New Payment</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[{ key:"date",label:"Date",type:"date"},{key:"employee",label:"Employee *",type:"text"},{key:"amount",label:"Amount (Rs) *",type:"number"},{key:"account",label:"Paid Via / Account",type:"text"}].map(({key,label,type})=>(
              <div key={key}><label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{label}</label><input type={type} value={(form as Record<string,string>)[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:border-violet-400 outline-none" /></div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving||!form.employee||!form.amount} className="px-5 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl disabled:opacity-50">{saving?"Saving…":"Save Payment"}</button>
            <button onClick={()=>setShowForm(false)} className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <input value={search} onChange={e=>handleSearch(e.target.value)} placeholder="Search by employee…" className="w-full max-w-sm px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-violet-400 outline-none" />
        <div className="text-right flex-shrink-0"><p className="text-[11px] text-gray-400 uppercase tracking-wider">Total Paid</p><p className="font-mono font-bold text-violet-600">{formatMoney(total)}</p></div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead><tr className="bg-[#111318] text-white">{["Date","Employee","Amount","Paid Via",""].map(h=><th key={h} className={`py-3 px-4 text-[11px] font-semibold uppercase tracking-wider ${h==="Amount"?"text-right":"text-left"}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading?[...Array(4)].map((_,i)=><tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse"/></td></tr>):
               rows.length===0?<tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm">No salary records yet.</td></tr>:
               rows.map(r=>(
                <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{r.employee}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-violet-600">{formatMoney(r.amount)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{r.account||"—"}</td>
                  <td className="px-4 py-3"><button onClick={() => handleDelete(r.id)} className="text-gray-300 hover:text-rose-500 transition-colors text-lg leading-none">×</button></td>
                </tr>
              ))}
            </tbody>
            {rows.length>0&&<tfoot><tr className="border-t-2 border-gray-200 bg-gray-50"><td colSpan={2} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Total Salary Paid</td><td className="px-4 py-3 text-right font-mono font-bold text-violet-600">{formatMoney(total)}</td><td colSpan={2}/></tr></tfoot>}
          </table>
        </div>
      </div>
    </div>
  );
}