
"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatMoney, toNum, fmtDate } from "@/lib/utils";
import type { CustomerEntry } from "@/db/schema";
import { FileSpreadsheet, MessageCircle, ReceiptText } from "lucide-react";
import { customerDetailCache as customerCache, type FullCustomer } from "@/lib/customercache";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { EmptyState, ErrorState } from "@/components/states";
import { validateLedgerEntry, hasErrors, firstError, type FieldErrors } from "@/lib/validation";

const VISIBLE_LIMIT = 100; // progressively reveal older rows beyond this

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
  const [formErrors, setFormErrors] = useState<FieldErrors>({});

  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    date: "", product: "", packing: "", unit: "", qty: "", rate: "", debit: "", credit: "", account: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState(false);
  const [showAll, setShowAll] = useState(false); // progressive render for long ledgers
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) { setLoading(true); setError(false); }
      try {
        const data = await api.get<FullCustomer>(`/customers/${id}`);
        customerCache.set(id, data);
        setCustomer(data);
      } catch {
        if (!opts?.silent) setError(true);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    const cached = customerCache.get(id);
    if (cached) {
      setCustomer(cached);
      setLoading(false);
      load({ silent: true });
    } else {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async () => {
    const errs = validateLedgerEntry(form);
    if (hasErrors(errs)) { setFormErrors(errs); toast.error(firstError(errs)!); return; }
    setFormErrors({});
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
      toast.success("Entry added");
    } catch {
      toast.error("Couldn't add entry");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entryId: number) => {
    if (!(await confirm({ title: "Delete this entry?", confirmText: "Delete", danger: true }))) return;
    const prev = customer;
    setCustomer((c) => c ? { ...c, entries: c.entries.filter(e => e.id !== entryId) } : c);
    try {
      const entries = await api.del<CustomerEntry[]>(`/customers/${id}/entries/${entryId}`);
      setCustomer((c) => {
        const next = c ? { ...c, entries } : c;
        if (next) customerCache.set(id, next);
        return next;
      });
      toast.success("Entry deleted");
    } catch {
      setCustomer(prev);
      toast.error("Couldn't delete entry");
    }
  };

  const handleAutoDebit = () => {
    const qty = Number(form.qty);
    const rate = Number(form.rate);
    if (qty > 0 && rate > 0) {
      setForm((f) => ({ ...f, debit: String(qty * rate) }));
    }
  };

  // ── Edit handlers ───────────────────────────────────────
  const startEdit = (e: CustomerEntry) => {
    setEditId(e.id);
    setEditForm({
      date: e.date.slice(0, 10),
      product: e.product ?? "",
      packing: e.packing ?? "",
      unit: e.unit ?? "",
      qty: e.qty ? String(e.qty) : "",
      rate: e.rate ? String(e.rate) : "",
      debit: e.debit && Number(e.debit) > 0 ? String(e.debit) : "",
      credit: e.credit && Number(e.credit) > 0 ? String(e.credit) : "",
      account: e.account ?? "",
    });
  };

  const cancelEdit = () => setEditId(null);

  const handleEditAutoDebit = () => {
    const qty = Number(editForm.qty);
    const rate = Number(editForm.rate);
    if (qty > 0 && rate > 0) setEditForm((f) => ({ ...f, debit: String(qty * rate) }));
  };

  const saveEdit = async (entryId: number) => {
    const errs = validateLedgerEntry(editForm);
    if (hasErrors(errs)) { toast.error(firstError(errs)!); return; }
    setEditSaving(true);
    try {
      const entries = await api.patch<CustomerEntry[]>(`/customers/${id}/entries/${entryId}`, {
        ...editForm,
        debit: editForm.debit ? Number(editForm.debit) : 0,
        credit: editForm.credit ? Number(editForm.credit) : 0,
        qty: editForm.qty ? Number(editForm.qty) : null,
        rate: editForm.rate ? Number(editForm.rate) : null,
      });
      setCustomer((c) => {
        const next = c ? { ...c, entries } : c;
        if (next) customerCache.set(id, next);
        return next;
      });
      setEditId(null);
      toast.success("Entry updated");
    } catch {
      toast.error("Couldn't update entry");
    } finally {
      setEditSaving(false);
    }
  };

  const shareOnWhatsApp = async () => {
    if (!customer || sharing) return;
    if ((customer.entries ?? []).length === 0) {
      toast.error("No ledger entries to send");
      return;
    }
    if (!customer.whatsapp && !customer.phone) {
      toast.error("No WhatsApp/phone number on file");
      return;
    }
    setSharing(true);
    try {
      // The server builds the Excel ledger, uploads it, and delivers it as a
      // WhatsApp document via WasenderApi — no wa.me hand-off needed.
      const res = await api.post<{ ok: boolean; to: string }>(`/customers/${id}/send-whatsapp`, {});
      toast.success(`Ledger sent on WhatsApp to +${res.to}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send on WhatsApp");
    } finally {
      setSharing(false);
    }
  };

  const exportLedger = async () => {
    if (!customer) return;
    setExporting(true);
    try {
      const { buildLedgerBlob } = await import("@/lib/ledger-xlsx");
      const blob = await buildLedgerBlob(customer);
      const safeName = customer.name.replace(/[^a-z0-9]+/gi, "_");
      const filename = `${safeName}_ledger_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const file = new File([blob], filename, { type: blob.type });

      // On phones, open the native share sheet \u2014 it offers both "Save to
      // Files" and opening straight in Google Sheets / Drive, in one place.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
          return;
        } catch (err) {
          if ((err as Error)?.name === "AbortError") return; // user dismissed
          // any other failure \u2192 fall through to a plain download
        }
      }

      // Desktop (or no share support): download the file to the device.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return (
    <div className="space-y-4">
      <div className="h-5 w-40 bg-black/[0.04] rounded animate-pulse" />
      <div className="card overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="h-6 w-56 bg-black/[0.04] rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-black/[0.04] rounded animate-pulse" />
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-line">
            {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-black/[0.04] rounded animate-pulse" />)}
          </div>
        </div>
      </div>
      <div className="h-64 bg-black/[0.04] rounded-2xl animate-pulse" />
    </div>
  );

  if (error && !customer) return (
    <div className="space-y-4">
      <Link href="/dashboard/customers" className="text-sm text-muted hover:text-accent transition-colors">← Customers</Link>
      <div className="card"><ErrorState message="Couldn't load this customer's ledger." onRetry={() => load()} /></div>
    </div>
  );

  if (!customer) return (
    <div className="card"><EmptyState title="Customer not found" description="This customer may have been removed." action={<Link href="/dashboard/customers" className="btn-secondary">← Back to customers</Link>} /></div>
  );

  const entries = customer.entries ?? [];
  const lastEntry = entries[entries.length - 1];
  const currentBalance = lastEntry ? toNum(lastEntry.balance) : 0;
  const totalDebit = entries.reduce((a, e) => a + toNum(e.debit), 0);
  const totalCredit = entries.reduce((a, e) => a + toNum(e.credit), 0);
  // Keep the DOM light on long statements — show the most recent rows, reveal older on demand.
  const hidden = !showAll && entries.length > VISIBLE_LIMIT ? entries.length - VISIBLE_LIMIT : 0;
  const visibleEntries = hidden ? entries.slice(-VISIBLE_LIMIT) : entries;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Link href="/dashboard/customers" className="hover:text-accent transition-colors">Customers</Link>
        <span>/</span>
        <span className="text-ink font-medium">{customer.name}</span>
      </div>

      <div className="card overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-ink">{customer.name}</h1>
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted">
                {customer.owner && <span><b className="text-ink font-medium">Owner:</b> {customer.owner}</span>}
                {customer.cnic && <span><b className="text-ink font-medium">CNIC:</b> {customer.cnic}</span>}
                {customer.address && <span><b className="text-ink font-medium">Address:</b> {customer.address}</span>}
                {customer.phone && <span><b className="text-ink font-medium">Phone:</b> {customer.phone}</span>}
                {customer.whatsapp && <span><b className="text-ink font-medium">WhatsApp:</b> {customer.whatsapp}</span>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-muted font-semibold">Current Balance</p>
              <p className={`font-mono text-2xl font-semibold mt-0.5 tabular-nums ${currentBalance > 0 ? "text-warning" : currentBalance < 0 ? "text-success" : "text-muted"}`}>
                {formatMoney(Math.abs(currentBalance))}
              </p>
              <p className={`text-xs mt-0.5 font-medium ${currentBalance > 0 ? "text-warning" : currentBalance < 0 ? "text-success" : "text-muted"}`}>
                {currentBalance > 0 ? "Customer owes you this" : currentBalance < 0 ? "Paid ahead by this" : "Fully settled"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-line">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted font-semibold">Total Debit</p>
              <p className="font-mono font-semibold text-warning mt-1 tabular-nums">{formatMoney(totalDebit)}</p>
              <p className="text-[11px] text-muted mt-0.5">Goods billed to them</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted font-semibold">Total Credit</p>
              <p className="font-mono font-semibold text-success mt-1 tabular-nums">{formatMoney(totalCredit)}</p>
              <p className="text-[11px] text-muted mt-0.5">Payments received</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted font-semibold">Transactions</p>
              <p className="font-mono font-semibold text-ink mt-1 tabular-nums">{entries.length}</p>
              <p className="text-[11px] text-muted mt-0.5">Rows in the ledger</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Ledger</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">Every transaction in order, with the running balance after each one.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={exportLedger}
            disabled={entries.length === 0 || exporting}
            className="btn-secondary"
          >
            <FileSpreadsheet className="w-4 h-4" strokeWidth={2} />
            {exporting ? "Preparing…" : "Export Excel"}
          </button>
          <button
            onClick={shareOnWhatsApp}
            disabled={entries.length === 0 || sharing}
            className="btn inline-flex items-center gap-2 border border-success/30 text-success hover:bg-success-tint"
          >
            <MessageCircle className="w-4 h-4" strokeWidth={2} />
            {sharing ? "Sending…" : "WhatsApp"}
          </button>
          <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
            + Add Entry
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card p-6">
          <h3 className="font-semibold text-ink mb-4">New Ledger Entry</h3>
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
                <label className="label">{label}</label>
                <input
                  type={type}
                  value={(form as Record<string, string>)[key]}
                  onChange={(e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setFormErrors((er) => ({ ...er, [key]: "" })); }}
                  onBlur={key === "rate" || key === "qty" ? handleAutoDebit : undefined}
                  className={`input py-2.5 text-sm${formErrors[key] ? " ring-1 ring-danger" : ""}`}
                />
                {formErrors[key] && <p className="mt-1 text-xs text-danger">{formErrors[key]}</p>}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-3">
            Tip: Enter Qty + Rate and click the Rate field — Debit auto-calculates.
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Save Entry"}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {entries.length > 0 && (
          <div className="px-4 py-2.5 border-b border-line bg-black/[0.01] flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="w-2 h-2 rounded-full bg-warning" /> <span className="text-warning font-medium">Debit</span> — goods billed to them (increases what they owe)
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <span className="w-2 h-2 rounded-full bg-success" /> <span className="text-success font-medium">Credit</span> — payment received (reduces what they owe)
            </span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-black/[0.02] border-b border-line">
                {["Date", "Product", "Packing", "Unit", "Qty", "Rate", "Debit", "Credit", "Balance", "Account / Note", ""].map((h) => (
                  <th key={h} className={`th ${h === "Debit" || h === "Credit" || h === "Balance" || h === "Rate" ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.length === 0 && (
                <tr>
                  <td colSpan={11}>
                    <EmptyState icon={ReceiptText} compact title="No entries yet" description="Use “+ Add Entry” to record this customer's first transaction." />
                  </td>
                </tr>
              )}
              {hidden > 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-2.5 text-center bg-black/[0.015]">
                    <button onClick={() => setShowAll(true)} className="text-[13px] font-medium text-accent-ink hover:text-accent-hover">
                      Show {hidden.toLocaleString()} older {hidden === 1 ? "entry" : "entries"}
                    </button>
                  </td>
                </tr>
              )}
              {visibleEntries.map((e) => {
                if (editId === e.id) {
                  return (
                    <tr key={e.id} className="bg-accent-tint/40">
                      <td className="px-4 py-2">
                        <input type="date" value={editForm.date} onChange={ev => setEditForm(f => ({ ...f, date: ev.target.value }))} className="input px-2 py-1.5 text-xs" />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editForm.product} onChange={ev => setEditForm(f => ({ ...f, product: ev.target.value }))} className="input px-2 py-1.5 text-sm" />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editForm.packing} onChange={ev => setEditForm(f => ({ ...f, packing: ev.target.value }))} className="input px-2 py-1.5 text-xs" />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editForm.unit} onChange={ev => setEditForm(f => ({ ...f, unit: ev.target.value }))} className="input px-2 py-1.5 text-xs" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" value={editForm.qty} onChange={ev => setEditForm(f => ({ ...f, qty: ev.target.value }))} onBlur={handleEditAutoDebit} className="input px-2 py-1.5 text-xs" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" value={editForm.rate} onChange={ev => setEditForm(f => ({ ...f, rate: ev.target.value }))} onBlur={handleEditAutoDebit} className="input px-2 py-1.5 text-xs text-right font-mono" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" value={editForm.debit} onChange={ev => setEditForm(f => ({ ...f, debit: ev.target.value }))} className="input px-2 py-1.5 text-sm text-right font-mono" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" value={editForm.credit} onChange={ev => setEditForm(f => ({ ...f, credit: ev.target.value }))} className="input px-2 py-1.5 text-sm text-right font-mono" />
                      </td>
                      <td className="px-4 py-2 text-center text-muted/50 text-xs">auto</td>
                      <td className="px-4 py-2">
                        <input value={editForm.account} onChange={ev => setEditForm(f => ({ ...f, account: ev.target.value }))} className="input px-2 py-1.5 text-xs" />
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-4">
                          <button onClick={() => saveEdit(e.id)} disabled={editSaving} className="text-success font-semibold disabled:opacity-40">✓</button>
                          <button onClick={cancelEdit} className="text-muted">×</button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const bal = toNum(e.balance);
                const isDebitRow = toNum(e.debit) > 0;
                const isCreditRow = toNum(e.credit) > 0 && !isDebitRow;
                return (
                  <tr key={e.id} className={`hover:bg-black/[0.015] transition-colors ${isCreditRow ? "bg-success-tint/40" : ""}`}>
                    <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{fmtDate(e.date)}</td>
                    <td className="px-4 py-3 font-medium text-ink">{e.product || <span className="text-muted/40">—</span>}</td>
                    <td className="px-4 py-3 text-muted text-xs">{e.packing || "—"}</td>
                    <td className="px-4 py-3 text-muted text-xs">{e.unit || "—"}</td>
                    <td className="px-4 py-3 text-muted text-xs">{e.qty ? Number(e.qty).toLocaleString() : "—"}</td>
                    <td className="px-4 py-3 text-right text-muted text-xs font-mono tabular-nums">{e.rate ? formatMoney(e.rate) : "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-warning font-semibold tabular-nums">{toNum(e.debit) > 0 ? formatMoney(e.debit) : <span className="text-muted/30">—</span>}</td>
                    <td className="px-4 py-3 text-right font-mono text-success font-semibold tabular-nums">{toNum(e.credit) > 0 ? formatMoney(e.credit) : <span className="text-muted/30">—</span>}</td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold text-[13px] tabular-nums ${bal > 0 ? "text-warning" : bal < 0 ? "text-success" : "text-muted"}`}>
                      {formatMoney(bal)}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs max-w-[180px] truncate">{e.account || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-4">
                        <button onClick={() => startEdit(e)} className="text-muted/50 hover:text-accent transition-colors" title="Edit entry">✎</button>
                        <button onClick={() => handleDelete(e.id)} className="text-muted/50 hover:text-danger transition-colors text-lg leading-none" title="Delete entry">×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {entries.length > 0 && (
              <tfoot>
                <tr className="border-t border-line bg-black/[0.02]">
                  <td colSpan={6} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Totals</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-warning tabular-nums">{formatMoney(totalDebit)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-success tabular-nums">{formatMoney(totalCredit)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold text-[14px] tabular-nums ${currentBalance > 0 ? "text-warning" : currentBalance < 0 ? "text-success" : "text-muted"}`}>
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