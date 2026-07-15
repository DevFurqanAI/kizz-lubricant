"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { formatMoney, fmtDate } from "@/lib/utils";

type Row = { id: number; date: string; detail: string; amount: string };

export default function PurchasingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), detail: "", amount: "" });

  const load = useCallback(async (q = "") => {
    setLoading(true);
    try {
      const data = await api.get<{ rows: Row[]; total: number }>(`/purchasing${q ? `?search=${encodeURIComponent(q)}` : ""}`);
      setRows(data.rows); setTotal(data.total);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.date || !form.detail || !form.amount) return;
    setSaving(true);
    try {
      await api.post("/purchasing", { ...form, amount: Number(form.amount) });
      setForm({ date: new Date().toISOString().slice(0,10), detail: "", amount: "" });
      setShowForm(false); load(search);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this entry?")) return;
    await api.del(`/purchasing/${id}`); load(search);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-600 font-mono">Cost</p>
          <h1 className="mt-1 text-2xl font-display font-bold uppercase tracking-wide text-gray-900">Purchasing</h1>
          <p className="mt-1 text-sm text-gray-400">Oil, drums, chemicals and other purchases.</p>
        </div>
        <button onClick={() => setShowForm(s => !s)} className="px-4 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl hover:bg-black transition-colors">+ Add Purchasing</button>
      </div>

      {showForm && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6">
          <h3 className="font-semibold text-gray-800 mb-4">New Entry</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[{ key: "date", label: "Date", type: "date" }, { key: "detail", label: "Detail *", type: "text" }, { key: "amount", label: "Amount (Rs) *", type: "number" }].map(({ key, label, type }) => (
              <div key={key}>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{label}</label>
                <input type={type} value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:border-rose-400 outline-none" />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving || !form.detail || !form.amount} className="px-5 py-2.5 bg-[#111318] text-white text-sm font-semibold rounded-xl disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
            <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <input value={search} onChange={e => { setSearch(e.target.value); load(e.target.value); }} placeholder="Search…" className="w-full max-w-sm px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-rose-400 outline-none" />
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] text-gray-400 uppercase tracking-wider">Total</p>
          <p className="font-mono font-bold text-rose-600">{formatMoney(total)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#111318] text-white">
                {["Date", "Detail", "Amount", ""].map(h => <th key={h} className={`py-3 px-4 text-[11px] font-semibold uppercase tracking-wider ${h === "Amount" ? "text-right" : "text-left"}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? [...Array(4)].map((_, i) => <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>) :
               rows.length === 0 ? <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400 text-sm">No entries yet.</td></tr> :
               rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3 text-gray-800">{r.detail}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-rose-600">{formatMoney(r.amount)}</td>
                  <td className="px-4 py-3"><button onClick={() => handleDelete(r.id)} className="text-gray-300 hover:text-rose-500 transition-colors text-lg leading-none">×</button></td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && <tfoot><tr className="border-t-2 border-gray-200 bg-gray-50"><td colSpan={2} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Total</td><td className="px-4 py-3 text-right font-mono font-bold text-rose-600">{formatMoney(total)}</td><td /></tr></tfoot>}
          </table>
        </div>
      </div>
    </div>
  );
}
