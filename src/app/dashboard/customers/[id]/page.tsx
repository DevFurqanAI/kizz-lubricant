// "use client";

// import { useState, useEffect, useCallback } from "react";
// import { useParams } from "next/navigation";
// import Link from "next/link";
// import { api } from "@/lib/api";
// import { formatMoney, toNum, fmtDate } from "@/lib/utils";
// import type { Customer, CustomerEntry } from "@/db/schema";

// type FullCustomer = Customer & { entries: CustomerEntry[] };

// export default function CustomerLedgerPage() {
//   const { id } = useParams<{ id: string }>();
//   const [customer, setCustomer] = useState<FullCustomer | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [showForm, setShowForm] = useState(false);
//   const [saving, setSaving] = useState(false);
//   const [form, setForm] = useState({
//     date: new Date().toISOString().slice(0, 10),
//     product: "",
//     packing: "",
//     unit: "",
//     qty: "",
//     rate: "",
//     debit: "",
//     credit: "",
//     account: "",
//   });

//   const load = useCallback(async () => {
//     setLoading(true);
//     try {
//       const data = await api.get<FullCustomer>(`/customers/${id}`);
//       setCustomer(data);
//     } finally {
//       setLoading(false);
//     }
//   }, [id]);

//   useEffect(() => { load(); }, [load]);

//   const handleSave = async () => {
//     if (!form.date) return;
//     setSaving(true);
//     try {
//       const entries = await api.post<CustomerEntry[]>(`/customers/${id}/entries`, {
//         ...form,
//         debit: form.debit ? Number(form.debit) : 0,
//         credit: form.credit ? Number(form.credit) : 0,
//         qty: form.qty ? Number(form.qty) : null,
//         rate: form.rate ? Number(form.rate) : null,
//       });
//       setCustomer((c) => c ? { ...c, entries } : c);
//       setForm({ date: new Date().toISOString().slice(0, 10), product: "", packing: "", unit: "", qty: "", rate: "", debit: "", credit: "", account: "" });
//       setShowForm(false);
//     } finally {
//       setSaving(false);
//     }
//   };

//   const handleDelete = async (entryId: number) => {
//     if (!confirm("Delete this entry?")) return;
//     const entries = await api.del<CustomerEntry[]>(`/customers/${id}/entries/${entryId}`);
//     setCustomer((c) => c ? { ...c, entries } : c);
//   };

//   const handleAutoDebit = () => {
//     const qty = Number(form.qty);
//     const rate = Number(form.rate);
//     if (qty > 0 && rate > 0) {
//       setForm((f) => ({ ...f, debit: String(qty * rate) }));
//     }
//   };

//   if (loading) return (
//     <div className="space-y-4">
//       <div className="h-6 w-48 bg-gray-100 rounded animate-pulse" />
//       <div className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
//       <div className="h-64 bg-gray-100 rounded-2xl animate-pulse" />
//     </div>
//   );

//   if (!customer) return <div className="text-gray-400 text-sm">Customer not found.</div>;

//   const entries = customer.entries ?? [];
//   const lastEntry = entries[entries.length - 1];
//   const currentBalance = lastEntry ? toNum(lastEntry.balance) : 0;
//   const totalDebit = entries.reduce((a, e) => a + toNum(e.debit), 0);
//   const totalCredit = entries.reduce((a, e) => a + toNum(e.credit), 0);

//   return (
//     <div className="space-y-6">
//       {/* Breadcrumb */}
//       <div className="flex items-center gap-2 text-sm text-gray-400">
//         <Link href="/dashboard/customers" className="hover:text-amber-600 transition-colors">Customers</Link>
//         <span>/</span>
//         <span className="text-gray-700 font-medium">{customer.name}</span>
//       </div>

//       {/* Customer info card */}
//       <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
//         {/* Colored header strip */}
//         <div className="h-2 bg-gradient-to-r from-amber-400 to-amber-600" />
//         <div className="p-6">
//           <div className="flex items-start justify-between gap-4 flex-wrap">
//             <div>
//               <h1 className="text-xl font-display font-bold uppercase tracking-wide text-gray-900">{customer.name}</h1>
//               <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
//                 {customer.owner && <span><b className="text-gray-600">Owner:</b> {customer.owner}</span>}
//                 {customer.cnic && <span><b className="text-gray-600">CNIC:</b> {customer.cnic}</span>}
//                 {customer.address && <span><b className="text-gray-600">Address:</b> {customer.address}</span>}
//                 {customer.phone && <span><b className="text-gray-600">Phone:</b> {customer.phone}</span>}
//                 {customer.whatsapp && <span><b className="text-gray-600">WhatsApp:</b> {customer.whatsapp}</span>}
//               </div>
//             </div>
//             <div className="text-right">
//               <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Current Balance</p>
//               <p className={`font-mono text-2xl font-bold mt-0.5 ${currentBalance > 0 ? "text-amber-600" : currentBalance < 0 ? "text-emerald-600" : "text-gray-400"}`}>
//                 {formatMoney(currentBalance)}
//               </p>
//               <p className="text-xs text-gray-400 mt-0.5">
//                 {currentBalance > 0 ? "Customer owes" : currentBalance < 0 ? "Advance paid" : "Settled"}
//               </p>
//             </div>
//           </div>

//           {/* Summary row */}
//           <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100">
//             <div>
//               <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Total Debit</p>
//               <p className="font-mono font-semibold text-amber-600 mt-1">{formatMoney(totalDebit)}</p>
//             </div>
//             <div>
//               <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Total Credit</p>
//               <p className="font-mono font-semibold text-emerald-600 mt-1">{formatMoney(totalCredit)}</p>
//             </div>
//             <div>
//               <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Transactions</p>
//               <p className="font-mono font-semibold text-gray-700 mt-1">{entries.length}</p>
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Action bar */}
//       <div className="flex items-center justify-between gap-3 flex-wrap">
//         <h2 className="font-display font-semibold uppercase tracking-wide text-gray-700">Ledger</h2>
//         <div className="flex gap-3">
//           <button
//             onClick={() => setShowForm((s) => !s)}
//             className="px-4 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl hover:bg-black transition-colors"
//           >
//             + Add Entry
//           </button>
//         </div>
//       </div>

//       {/* Add entry form */}
//       {showForm && (
//         <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
//           <h3 className="font-semibold text-gray-800 mb-4">New Ledger Entry</h3>
//           <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
//             {[
//               { key: "date", label: "Date", type: "date" },
//               { key: "product", label: "Product", type: "text" },
//               { key: "packing", label: "Packing", type: "text" },
//               { key: "unit", label: "Unit", type: "text" },
//               { key: "qty", label: "Qty", type: "number" },
//               { key: "rate", label: "Rate (Rs)", type: "number" },
//               { key: "debit", label: "Debit (Rs)", type: "number" },
//               { key: "credit", label: "Credit (Rs)", type: "number" },
//               { key: "account", label: "Account / Note", type: "text" },
//             ].map(({ key, label, type }) => (
//               <div key={key}>
//                 <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{label}</label>
//                 <input
//                   type={type}
//                   value={(form as Record<string, string>)[key]}
//                   onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
//                   onBlur={key === "rate" || key === "qty" ? handleAutoDebit : undefined}
//                   className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:border-amber-400 outline-none"
//                 />
//               </div>
//             ))}
//           </div>
//           <p className="text-xs text-gray-400 mt-3">
//             Tip: Enter Qty + Rate and click the Rate field — Debit auto-calculates.
//           </p>
//           <div className="flex gap-3 mt-4">
//             <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl disabled:opacity-50">
//               {saving ? "Saving…" : "Save Entry"}
//             </button>
//             <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50">
//               Cancel
//             </button>
//           </div>
//         </div>
//       )}

//       {/* Ledger table */}
//       <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
//         <div className="overflow-x-auto">
//           <table className="w-full text-sm min-w-[900px]">
//             <thead>
//               <tr className="bg-[#111318] text-white">
//                 {["Date", "Product", "Packing", "Unit", "Qty", "Rate", "Debit", "Credit", "Balance", "Account / Note", ""].map((h) => (
//                   <th key={h} className={`py-3 px-4 text-[11px] font-semibold uppercase tracking-wider ${h === "Debit" || h === "Credit" || h === "Balance" || h === "Rate" ? "text-right" : "text-left"}`}>
//                     {h}
//                   </th>
//                 ))}
//               </tr>
//             </thead>
//             <tbody className="divide-y divide-gray-50">
//               {entries.length === 0 && (
//                 <tr>
//                   <td colSpan={11} className="px-6 py-10 text-center text-gray-400 text-sm">
//                     No entries yet. Click <b>+ Add Entry</b> to record the first transaction.
//                   </td>
//                 </tr>
//               )}
//               {entries.map((e) => {
//                 const bal = toNum(e.balance);
//                 const isDebitRow = toNum(e.debit) > 0;
//                 const isCreditRow = toNum(e.credit) > 0 && !isDebitRow;
//                 return (
//                   <tr key={e.id} className={`hover:bg-gray-50/50 transition-colors ${isCreditRow ? "bg-emerald-50/20" : ""}`}>
//                     <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(e.date)}</td>
//                     <td className="px-4 py-3 font-medium text-gray-800">{e.product || <span className="text-gray-300">—</span>}</td>
//                     <td className="px-4 py-3 text-gray-400 text-xs">{e.packing || "—"}</td>
//                     <td className="px-4 py-3 text-gray-400 text-xs">{e.unit || "—"}</td>
//                     <td className="px-4 py-3 text-gray-600 text-xs">{e.qty ? Number(e.qty).toLocaleString() : "—"}</td>
//                     <td className="px-4 py-3 text-right text-gray-500 text-xs font-mono">{e.rate ? formatMoney(e.rate) : "—"}</td>
//                     <td className="px-4 py-3 text-right font-mono text-amber-600 font-semibold">{toNum(e.debit) > 0 ? formatMoney(e.debit) : <span className="text-gray-200">—</span>}</td>
//                     <td className="px-4 py-3 text-right font-mono text-emerald-600 font-semibold">{toNum(e.credit) > 0 ? formatMoney(e.credit) : <span className="text-gray-200">—</span>}</td>
//                     <td className={`px-4 py-3 text-right font-mono font-bold text-[13px] ${bal > 0 ? "text-amber-600" : bal < 0 ? "text-emerald-600" : "text-gray-400"}`}>
//                       {formatMoney(bal)}
//                     </td>
//                     <td className="px-4 py-3 text-gray-400 text-xs max-w-[180px] truncate">{e.account || "—"}</td>
//                     <td className="px-4 py-3">
//                       <button onClick={() => handleDelete(e.id)} className="text-gray-300 hover:text-rose-500 transition-colors text-lg leading-none" title="Delete entry">×</button>
//                     </td>
//                   </tr>
//                 );
//               })}
//             </tbody>
//             {entries.length > 0 && (
//               <tfoot>
//                 <tr className="border-t-2 border-gray-200 bg-gray-50">
//                   <td colSpan={6} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Totals</td>
//                   <td className="px-4 py-3 text-right font-mono font-bold text-amber-600">{formatMoney(totalDebit)}</td>
//                   <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">{formatMoney(totalCredit)}</td>
//                   <td className={`px-4 py-3 text-right font-mono font-bold text-[14px] ${currentBalance > 0 ? "text-amber-600" : currentBalance < 0 ? "text-emerald-600" : "text-gray-400"}`}>
//                     {formatMoney(currentBalance)}
//                   </td>
//                   <td colSpan={2} />
//                 </tr>
//               </tfoot>
//             )}
//           </table>
//         </div>
//       </div>
//     </div>
//   );
// }






// "use client";

// import { useState, useEffect, useCallback } from "react";
// import { useParams } from "next/navigation";
// import Link from "next/link";
// import { api } from "@/lib/api";
// import { formatMoney, toNum, fmtDate } from "@/lib/utils";
// import type { Customer, CustomerEntry } from "@/db/schema";
// import { FileSpreadsheet } from "lucide-react";

// type FullCustomer = Customer & { entries: CustomerEntry[] };
// const customerCache = new Map<string, FullCustomer>();

// export default function CustomerLedgerPage() {
//   const { id } = useParams<{ id: string }>();
//   const [customer, setCustomer] = useState<FullCustomer | null>(() => customerCache.get(id) ?? null);
//   const [loading, setLoading] = useState(() => !customerCache.has(id));
//   const [exporting, setExporting] = useState(false);
//   const [showForm, setShowForm] = useState(false);
//   const [saving, setSaving] = useState(false);
//   const [form, setForm] = useState({
//     date: new Date().toISOString().slice(0, 10),
//     product: "",
//     packing: "",
//     unit: "",
//     qty: "",
//     rate: "",
//     debit: "",
//     credit: "",
//     account: "",
//   });

//   const load = useCallback(
//     async (opts?: { silent?: boolean }) => {
//       if (!opts?.silent) setLoading(true);
//       try {
//         const data = await api.get<FullCustomer>(`/customers/${id}`);
//         customerCache.set(id, data);
//         setCustomer(data);
//       } finally {
//         if (!opts?.silent) setLoading(false);
//       }
//     },
//     [id]
//   );

//   useEffect(() => {
//     const cached = customerCache.get(id);
//     if (cached) {
//       // Instant paint from cache, then silently revalidate against the server.
//       setCustomer(cached);
//       setLoading(false);
//       load({ silent: true });
//     } else {
//       load();
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [id]);

//   const handleSave = async () => {
//     if (!form.date) return;
//     setSaving(true);
//     try {
//       const entries = await api.post<CustomerEntry[]>(`/customers/${id}/entries`, {
//         ...form,
//         debit: form.debit ? Number(form.debit) : 0,
//         credit: form.credit ? Number(form.credit) : 0,
//         qty: form.qty ? Number(form.qty) : null,
//         rate: form.rate ? Number(form.rate) : null,
//       });
//       setCustomer((c) => {
//         const next = c ? { ...c, entries } : c;
//         if (next) customerCache.set(id, next);
//         return next;
//       });
//       setForm({ date: new Date().toISOString().slice(0, 10), product: "", packing: "", unit: "", qty: "", rate: "", debit: "", credit: "", account: "" });
//       setShowForm(false);
//     } finally {
//       setSaving(false);
//     }
//   };

//   const handleDelete = async (entryId: number) => {
//     if (!confirm("Delete this entry?")) return;
//     const entries = await api.del<CustomerEntry[]>(`/customers/${id}/entries/${entryId}`);
//     setCustomer((c) => {
//       const next = c ? { ...c, entries } : c;
//       if (next) customerCache.set(id, next);
//       return next;
//     });
//   };

//   const handleAutoDebit = () => {
//     const qty = Number(form.qty);
//     const rate = Number(form.rate);
//     if (qty > 0 && rate > 0) {
//       setForm((f) => ({ ...f, debit: String(qty * rate) }));
//     }
//   };

//   // Builds a clean, line-by-line .xlsx of the ledger and downloads it.
//   // "xlsx" (SheetJS) is loaded on demand so it never adds weight to the
//   // initial page load — only the click that needs it pays for it.
//   const handleExportExcel = async () => {
//     if (!customer) return;
//     setExporting(true);
//     try {
//       const XLSX = await import("xlsx");
//       const entries = customer.entries ?? [];

//       const rows = entries.map((e) => ({
//         Date: fmtDate(e.date),
//         Product: e.product || "",
//         Packing: e.packing || "",
//         Unit: e.unit || "",
//         Qty: e.qty ? Number(e.qty) : "",
//         Rate: e.rate ? Number(toNum(e.rate)) : "",
//         Debit: toNum(e.debit) || "",
//         Credit: toNum(e.credit) || "",
//         Balance: toNum(e.balance),
//         "Account / Note": e.account || "",
//       }));

//       const totalDebit = entries.reduce((a, e) => a + toNum(e.debit), 0);
//       const totalCredit = entries.reduce((a, e) => a + toNum(e.credit), 0);
//       const lastEntry = entries[entries.length - 1];
//       const currentBalance = lastEntry ? toNum(lastEntry.balance) : 0;

//       rows.push({
//         Date: "",
//         Product: "",
//         Packing: "",
//         Unit: "",
//         Qty: "",
//         Rate: "",
//         Debit: totalDebit,
//         Credit: totalCredit,
//         Balance: currentBalance,
//         "Account / Note": "TOTAL",
//       });

//       const ws = XLSX.utils.json_to_sheet(rows);
//       ws["!cols"] = [
//         { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 8 },
//         { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 26 },
//       ];

//       const wb = XLSX.utils.book_new();
//       XLSX.utils.book_append_sheet(wb, ws, "Ledger");
//       const safeName = customer.name.replace(/[^a-z0-9]+/gi, "_");
//       XLSX.writeFile(wb, `${safeName}_ledger_${new Date().toISOString().slice(0, 10)}.xlsx`);
//     } finally {
//       setExporting(false);
//     }
//   };

//   if (loading) return (
//     <div className="space-y-4">
//       <div className="h-5 w-40 bg-gray-100 rounded animate-pulse" />
//       <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
//         <div className="h-2 bg-gray-100 animate-pulse" />
//         <div className="p-6 space-y-4">
//           <div className="h-6 w-56 bg-gray-100 rounded animate-pulse" />
//           <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
//           <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
//             {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
//           </div>
//         </div>
//       </div>
//       <div className="h-64 bg-gray-100 rounded-2xl animate-pulse" />
//     </div>
//   );

//   if (!customer) return <div className="text-gray-400 text-sm">Customer not found.</div>;

//   const entries = customer.entries ?? [];
//   const lastEntry = entries[entries.length - 1];
//   const currentBalance = lastEntry ? toNum(lastEntry.balance) : 0;
//   const totalDebit = entries.reduce((a, e) => a + toNum(e.debit), 0);
//   const totalCredit = entries.reduce((a, e) => a + toNum(e.credit), 0);

//   return (
//     <div className="space-y-6">
//       {/* Breadcrumb */}
//       <div className="flex items-center gap-2 text-sm text-gray-400">
//         <Link href="/dashboard/customers" className="hover:text-amber-600 transition-colors">Customers</Link>
//         <span>/</span>
//         <span className="text-gray-700 font-medium">{customer.name}</span>
//       </div>

//       {/* Customer info card */}
//       <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
//         {/* Colored header strip */}
//         <div className="h-2 bg-gradient-to-r from-amber-400 to-amber-600" />
//         <div className="p-6">
//           <div className="flex items-start justify-between gap-4 flex-wrap">
//             <div>
//               <h1 className="text-xl font-display font-bold uppercase tracking-wide text-gray-900">{customer.name}</h1>
//               <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
//                 {customer.owner && <span><b className="text-gray-600">Owner:</b> {customer.owner}</span>}
//                 {customer.cnic && <span><b className="text-gray-600">CNIC:</b> {customer.cnic}</span>}
//                 {customer.address && <span><b className="text-gray-600">Address:</b> {customer.address}</span>}
//                 {customer.phone && <span><b className="text-gray-600">Phone:</b> {customer.phone}</span>}
//                 {customer.whatsapp && <span><b className="text-gray-600">WhatsApp:</b> {customer.whatsapp}</span>}
//               </div>
//             </div>
//             <div className="text-right">
//               <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Current Balance</p>
//               <p className={`font-mono text-2xl font-bold mt-0.5 ${currentBalance > 0 ? "text-amber-600" : currentBalance < 0 ? "text-emerald-600" : "text-gray-400"}`}>
//                 {formatMoney(currentBalance)}
//               </p>
//               <p className="text-xs text-gray-400 mt-0.5">
//                 {currentBalance > 0 ? "Customer owes" : currentBalance < 0 ? "Advance paid" : "Settled"}
//               </p>
//             </div>
//           </div>

//           {/* Summary row */}
//           <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100">
//             <div>
//               <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Total Debit</p>
//               <p className="font-mono font-semibold text-amber-600 mt-1">{formatMoney(totalDebit)}</p>
//             </div>
//             <div>
//               <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Total Credit</p>
//               <p className="font-mono font-semibold text-emerald-600 mt-1">{formatMoney(totalCredit)}</p>
//             </div>
//             <div>
//               <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Transactions</p>
//               <p className="font-mono font-semibold text-gray-700 mt-1">{entries.length}</p>
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Action bar */}
//       <div className="flex items-center justify-between gap-3 flex-wrap">
//         <h2 className="font-display font-semibold uppercase tracking-wide text-gray-700">Ledger</h2>
//         <div className="flex gap-3">
//           <button
//             onClick={handleExportExcel}
//             disabled={exporting || entries.length === 0}
//             className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
//           >
//             <FileSpreadsheet className="w-4 h-4" strokeWidth={2} />
//             {exporting ? "Exporting…" : "Export Excel"}
//           </button>
//           <button
//             onClick={() => setShowForm((s) => !s)}
//             className="px-4 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl hover:bg-black transition-colors"
//           >
//             + Add Entry
//           </button>
//         </div>
//       </div>

//       {/* Add entry form */}
//       {showForm && (
//         <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
//           <h3 className="font-semibold text-gray-800 mb-4">New Ledger Entry</h3>
//           <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
//             {[
//               { key: "date", label: "Date", type: "date" },
//               { key: "product", label: "Product", type: "text" },
//               { key: "packing", label: "Packing", type: "text" },
//               { key: "unit", label: "Unit", type: "text" },
//               { key: "qty", label: "Qty", type: "number" },
//               { key: "rate", label: "Rate (Rs)", type: "number" },
//               { key: "debit", label: "Debit (Rs)", type: "number" },
//               { key: "credit", label: "Credit (Rs)", type: "number" },
//               { key: "account", label: "Account / Note", type: "text" },
//             ].map(({ key, label, type }) => (
//               <div key={key}>
//                 <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{label}</label>
//                 <input
//                   type={type}
//                   value={(form as Record<string, string>)[key]}
//                   onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
//                   onBlur={key === "rate" || key === "qty" ? handleAutoDebit : undefined}
//                   className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:border-amber-400 outline-none"
//                 />
//               </div>
//             ))}
//           </div>
//           <p className="text-xs text-gray-400 mt-3">
//             Tip: Enter Qty + Rate and click the Rate field — Debit auto-calculates.
//           </p>
//           <div className="flex gap-3 mt-4">
//             <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl disabled:opacity-50">
//               {saving ? "Saving…" : "Save Entry"}
//             </button>
//             <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50">
//               Cancel
//             </button>
//           </div>
//         </div>
//       )}

//       {/* Ledger table */}
//       <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
//         <div className="overflow-x-auto">
//           <table className="w-full text-sm min-w-[900px]">
//             <thead>
//               <tr className="bg-[#111318] text-white">
//                 {["Date", "Product", "Packing", "Unit", "Qty", "Rate", "Debit", "Credit", "Balance", "Account / Note", ""].map((h) => (
//                   <th key={h} className={`py-3 px-4 text-[11px] font-semibold uppercase tracking-wider ${h === "Debit" || h === "Credit" || h === "Balance" || h === "Rate" ? "text-right" : "text-left"}`}>
//                     {h}
//                   </th>
//                 ))}
//               </tr>
//             </thead>
//             <tbody className="divide-y divide-gray-50">
//               {entries.length === 0 && (
//                 <tr>
//                   <td colSpan={11} className="px-6 py-10 text-center text-gray-400 text-sm">
//                     No entries yet. Click <b>+ Add Entry</b> to record the first transaction.
//                   </td>
//                 </tr>
//               )}
//               {entries.map((e) => {
//                 const bal = toNum(e.balance);
//                 const isDebitRow = toNum(e.debit) > 0;
//                 const isCreditRow = toNum(e.credit) > 0 && !isDebitRow;
//                 return (
//                   <tr key={e.id} className={`hover:bg-gray-50/50 transition-colors ${isCreditRow ? "bg-emerald-50/20" : ""}`}>
//                     <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(e.date)}</td>
//                     <td className="px-4 py-3 font-medium text-gray-800">{e.product || <span className="text-gray-300">—</span>}</td>
//                     <td className="px-4 py-3 text-gray-400 text-xs">{e.packing || "—"}</td>
//                     <td className="px-4 py-3 text-gray-400 text-xs">{e.unit || "—"}</td>
//                     <td className="px-4 py-3 text-gray-600 text-xs">{e.qty ? Number(e.qty).toLocaleString() : "—"}</td>
//                     <td className="px-4 py-3 text-right text-gray-500 text-xs font-mono">{e.rate ? formatMoney(e.rate) : "—"}</td>
//                     <td className="px-4 py-3 text-right font-mono text-amber-600 font-semibold">{toNum(e.debit) > 0 ? formatMoney(e.debit) : <span className="text-gray-200">—</span>}</td>
//                     <td className="px-4 py-3 text-right font-mono text-emerald-600 font-semibold">{toNum(e.credit) > 0 ? formatMoney(e.credit) : <span className="text-gray-200">—</span>}</td>
//                     <td className={`px-4 py-3 text-right font-mono font-bold text-[13px] ${bal > 0 ? "text-amber-600" : bal < 0 ? "text-emerald-600" : "text-gray-400"}`}>
//                       {formatMoney(bal)}
//                     </td>
//                     <td className="px-4 py-3 text-gray-400 text-xs max-w-[180px] truncate">{e.account || "—"}</td>
//                     <td className="px-4 py-3">
//                       <button onClick={() => handleDelete(e.id)} className="text-gray-300 hover:text-rose-500 transition-colors text-lg leading-none" title="Delete entry">×</button>
//                     </td>
//                   </tr>
//                 );
//               })}
//             </tbody>
//             {entries.length > 0 && (
//               <tfoot>
//                 <tr className="border-t-2 border-gray-200 bg-gray-50">
//                   <td colSpan={6} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Totals</td>
//                   <td className="px-4 py-3 text-right font-mono font-bold text-amber-600">{formatMoney(totalDebit)}</td>
//                   <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">{formatMoney(totalCredit)}</td>
//                   <td className={`px-4 py-3 text-right font-mono font-bold text-[14px] ${currentBalance > 0 ? "text-amber-600" : currentBalance < 0 ? "text-emerald-600" : "text-gray-400"}`}>
//                     {formatMoney(currentBalance)}
//                   </td>
//                   <td colSpan={2} />
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

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatMoney, toNum, fmtDate } from "@/lib/utils";
import type { Customer, CustomerEntry } from "@/db/schema";
import { FileSpreadsheet } from "lucide-react";

type FullCustomer = Customer & { entries: CustomerEntry[] };
const customerCache = new Map<string, FullCustomer>();

export default function CustomerLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<FullCustomer | null>(() => customerCache.get(id) ?? null);
  const [loading, setLoading] = useState(() => !customerCache.has(id));
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    product: "",
    packing: "",
    unit: "",
    qty: "",
    rate: "",
    debit: "",
    credit: "",
    account: "",
  });

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const data = await api.get<FullCustomer>(`/customers/${id}`);
        customerCache.set(id, data);
        setCustomer(data);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    const cached = customerCache.get(id);
    if (cached) {
      // Instant paint from cache, then silently revalidate against the server.
      setCustomer(cached);
      setLoading(false);
      load({ silent: true });
    } else {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async () => {
    if (!form.date) return;
    setSaving(true);
    try {
      const entries = await api.post<CustomerEntry[]>(`/customers/${id}/entries`, {
        ...form,
        debit: form.debit ? Number(form.debit) : 0,
        credit: form.credit ? Number(form.credit) : 0,
        qty: form.qty ? Number(form.qty) : null,
        rate: form.rate ? Number(form.rate) : null,
      });
      setCustomer((c) => {
        const next = c ? { ...c, entries } : c;
        if (next) customerCache.set(id, next);
        return next;
      });
      setForm({ date: new Date().toISOString().slice(0, 10), product: "", packing: "", unit: "", qty: "", rate: "", debit: "", credit: "", account: "" });
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entryId: number) => {
    if (!confirm("Delete this entry?")) return;
    const entries = await api.del<CustomerEntry[]>(`/customers/${id}/entries/${entryId}`);
    setCustomer((c) => {
      const next = c ? { ...c, entries } : c;
      if (next) customerCache.set(id, next);
      return next;
    });
  };

  const handleAutoDebit = () => {
    const qty = Number(form.qty);
    const rate = Number(form.rate);
    if (qty > 0 && rate > 0) {
      setForm((f) => ({ ...f, debit: String(qty * rate) }));
    }
  };

  // CSV works reliably on every browser/device — no library quirks, no
  // mobile Safari blob issues, no in-app browser (WhatsApp/Insta) blocks.
  // Excel (.xlsx) export was removed because SheetJS's writeFile() relies
  // on a hidden <a download> click that many mobile browsers/WebViews
  // silently ignore, so the file never actually downloaded there.
  const handleExportCSV = () => {
    if (!customer) return;
    const entries = customer.entries ?? [];

    const headers = ["Date", "Product", "Packing", "Unit", "Qty", "Rate", "Debit", "Credit", "Balance", "Account / Note"];

    const rows: (string | number)[][] = entries.map((e) => [
      fmtDate(e.date),
      e.product || "",
      e.packing || "",
      e.unit || "",
      e.qty ? Number(e.qty) : "",
      e.rate ? Number(toNum(e.rate)) : "",
      toNum(e.debit) || "",
      toNum(e.credit) || "",
      toNum(e.balance),
      e.account || "",
    ]);

    const totalDebit = entries.reduce((a, e) => a + toNum(e.debit), 0);
    const totalCredit = entries.reduce((a, e) => a + toNum(e.credit), 0);
    const lastEntry = entries[entries.length - 1];
    const currentBalance = lastEntry ? toNum(lastEntry.balance) : 0;

    rows.push(["", "", "", "", "", "", totalDebit, totalCredit, currentBalance, "TOTAL"]);

    // Escape commas/quotes/newlines per CSV spec
    const escapeCell = (val: string | number) => {
      const str = String(val);
      if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };

    const csvContent =
      "\uFEFF" + // BOM so Excel/mobile apps detect UTF-8 correctly (fixes non-Latin text)
      [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const safeName = customer.name.replace(/[^a-z0-9]+/gi, "_");
    const fileName = `${safeName}_ledger_${new Date().toISOString().slice(0, 10)}.csv`;

    // iOS Safari + in-app browsers often ignore the `download` attribute on
    // <a>, so open the blob directly — user can then "Share > Save to Files".
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const url = URL.createObjectURL(blob);

    if (isIOS) {
      window.open(url, "_blank");
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  if (loading) return (
    <div className="space-y-4">
      <div className="h-5 w-40 bg-gray-100 rounded animate-pulse" />
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="h-2 bg-gray-100 animate-pulse" />
        <div className="p-6 space-y-4">
          <div className="h-6 w-56 bg-gray-100 rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
            {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
          </div>
        </div>
      </div>
      <div className="h-64 bg-gray-100 rounded-2xl animate-pulse" />
    </div>
  );

  if (!customer) return <div className="text-gray-400 text-sm">Customer not found.</div>;

  const entries = customer.entries ?? [];
  const lastEntry = entries[entries.length - 1];
  const currentBalance = lastEntry ? toNum(lastEntry.balance) : 0;
  const totalDebit = entries.reduce((a, e) => a + toNum(e.debit), 0);
  const totalCredit = entries.reduce((a, e) => a + toNum(e.credit), 0);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/dashboard/customers" className="hover:text-amber-600 transition-colors">Customers</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{customer.name}</span>
      </div>

      {/* Customer info card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Colored header strip */}
        <div className="h-2 bg-gradient-to-r from-amber-400 to-amber-600" />
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-display font-bold uppercase tracking-wide text-gray-900">{customer.name}</h1>
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                {customer.owner && <span><b className="text-gray-600">Owner:</b> {customer.owner}</span>}
                {customer.cnic && <span><b className="text-gray-600">CNIC:</b> {customer.cnic}</span>}
                {customer.address && <span><b className="text-gray-600">Address:</b> {customer.address}</span>}
                {customer.phone && <span><b className="text-gray-600">Phone:</b> {customer.phone}</span>}
                {customer.whatsapp && <span><b className="text-gray-600">WhatsApp:</b> {customer.whatsapp}</span>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Current Balance</p>
              <p className={`font-mono text-2xl font-bold mt-0.5 ${currentBalance > 0 ? "text-amber-600" : currentBalance < 0 ? "text-emerald-600" : "text-gray-400"}`}>
                {formatMoney(currentBalance)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {currentBalance > 0 ? "Customer owes" : currentBalance < 0 ? "Advance paid" : "Settled"}
              </p>
            </div>
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Total Debit</p>
              <p className="font-mono font-semibold text-amber-600 mt-1">{formatMoney(totalDebit)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Total Credit</p>
              <p className="font-mono font-semibold text-emerald-600 mt-1">{formatMoney(totalCredit)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Transactions</p>
              <p className="font-mono font-semibold text-gray-700 mt-1">{entries.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display font-semibold uppercase tracking-wide text-gray-700">Ledger</h2>
        <div className="flex gap-3">
          <button
            onClick={handleExportCSV}
            disabled={entries.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" strokeWidth={2} />
            Export CSV
          </button>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="px-4 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl hover:bg-black transition-colors"
          >
            + Add Entry
          </button>
        </div>
      </div>

      {/* Add entry form */}
      {showForm && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <h3 className="font-semibold text-gray-800 mb-4">New Ledger Entry</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { key: "date", label: "Date", type: "date" },
              { key: "product", label: "Product", type: "text" },
              { key: "packing", label: "Packing", type: "text" },
              { key: "unit", label: "Unit", type: "text" },
              { key: "qty", label: "Qty", type: "number" },
              { key: "rate", label: "Rate (Rs)", type: "number" },
              { key: "debit", label: "Debit (Rs)", type: "number" },
              { key: "credit", label: "Credit (Rs)", type: "number" },
              { key: "account", label: "Account / Note", type: "text" },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{label}</label>
                <input
                  type={type}
                  value={(form as Record<string, string>)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  onBlur={key === "rate" || key === "qty" ? handleAutoDebit : undefined}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:border-amber-400 outline-none"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Tip: Enter Qty + Rate and click the Rate field — Debit auto-calculates.
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl disabled:opacity-50">
              {saving ? "Saving…" : "Save Entry"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Ledger table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-[#111318] text-white">
                {["Date", "Product", "Packing", "Unit", "Qty", "Rate", "Debit", "Credit", "Balance", "Account / Note", ""].map((h) => (
                  <th key={h} className={`py-3 px-4 text-[11px] font-semibold uppercase tracking-wider ${h === "Debit" || h === "Credit" || h === "Balance" || h === "Rate" ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-6 py-10 text-center text-gray-400 text-sm">
                    No entries yet. Click <b>+ Add Entry</b> to record the first transaction.
                  </td>
                </tr>
              )}
              {entries.map((e) => {
                const bal = toNum(e.balance);
                const isDebitRow = toNum(e.debit) > 0;
                const isCreditRow = toNum(e.credit) > 0 && !isDebitRow;
                return (
                  <tr key={e.id} className={`hover:bg-gray-50/50 transition-colors ${isCreditRow ? "bg-emerald-50/20" : ""}`}>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(e.date)}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{e.product || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{e.packing || "—"}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{e.unit || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{e.qty ? Number(e.qty).toLocaleString() : "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs font-mono">{e.rate ? formatMoney(e.rate) : "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-amber-600 font-semibold">{toNum(e.debit) > 0 ? formatMoney(e.debit) : <span className="text-gray-200">—</span>}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600 font-semibold">{toNum(e.credit) > 0 ? formatMoney(e.credit) : <span className="text-gray-200">—</span>}</td>
                    <td className={`px-4 py-3 text-right font-mono font-bold text-[13px] ${bal > 0 ? "text-amber-600" : bal < 0 ? "text-emerald-600" : "text-gray-400"}`}>
                      {formatMoney(bal)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[180px] truncate">{e.account || "—"}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(e.id)} className="text-gray-300 hover:text-rose-500 transition-colors text-lg leading-none" title="Delete entry">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {entries.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={6} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Totals</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-amber-600">{formatMoney(totalDebit)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">{formatMoney(totalCredit)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-bold text-[14px] ${currentBalance > 0 ? "text-amber-600" : currentBalance < 0 ? "text-emerald-600" : "text-gray-400"}`}>
                    {formatMoney(currentBalance)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}