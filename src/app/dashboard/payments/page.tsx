"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatMoney, fmtDate } from "@/lib/utils";
import { createLocalCache } from "@/lib/localCache";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { SortHeader, type Sort, nextSort } from "@/components/sort-header";
import { SearchInput } from "@/components/search-input";
import { DateRangeFilter } from "@/components/date-range-filter";
import { AmountRangeFilter } from "@/components/amount-range-filter";
import { FilterBar } from "@/components/filter-bar";
import { resolveDateRange, encodeDateRange, decodeDateRange, type DateRangeSelection } from "@/lib/date-range";
import { buildQueryString } from "@/lib/url-filter-sync";
import { useContentFadeKey } from "@/lib/use-fade-key";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import { validatePayment, hasErrors, firstError, type FieldErrors } from "@/lib/validation";

type Direction = "received" | "sent";
type Row = { id: number; date: string; amount: string; note: string | null; partyName: string; partnerName: string };
type PaymentsData = { rows: Row[]; total: number; count: number };
type Partner = { id: number; name: string };

const PAGE_SIZE = 50;
const paymentsCache = createLocalCache<PaymentsData>("payments", { ttlMs: 5 * 60_000 });
const keyFor = (dir: Direction, q: string, s: Sort, p: number, from: string | null, to: string | null, amountMin: string, amountMax: string, partnerId: string) =>
  `${dir}|${q}|${s.col}|${s.dir}|p${p}|${from ?? ""}|${to ?? ""}|${amountMin}|${amountMax}|${partnerId}`;

export default function PaymentsPage() {
  const initSort: Sort = { col: "date", dir: "desc" };
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [direction, setDirection] = useState<Direction>("received");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>(initSort);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeSelection>({ preset: "all" });
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partyOptions, setPartyOptions] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingOwner, setAddingOwner] = useState(false);
  const emptyForm = { date: new Date().toISOString().slice(0, 10), partyName: "", partnerName: "", amount: "", note: "" };
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<FieldErrors>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (dir: Direction, q: string, p: number, s: Sort, from: string | null, to: string | null, aMin: string, aMax: string, pId: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) { setLoading(true); setError(false); }
    try {
      const qs = new URLSearchParams({ direction: dir, search: q, page: String(p), limit: String(PAGE_SIZE), sort: s.col, dir: s.dir });
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      if (aMin) qs.set("amountMin", aMin);
      if (aMax) qs.set("amountMax", aMax);
      if (pId) qs.set("partnerId", pId);
      const data = await api.get<PaymentsData>(`/payments?${qs}`);
      paymentsCache.set(keyFor(dir, q, s, p, from, to, aMin, aMax, pId), data);
      setRows(data.rows); setTotal(data.total); setCount(data.count);
    } catch {
      if (!opts?.silent) setError(true);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialDirection: Direction = searchParams.get("direction") === "sent" ? "sent" : "received";
    const initialSearch = searchParams.get("search")?.trim() ?? "";
    const initialRange = decodeDateRange(searchParams);
    const initialAmountMin = searchParams.get("amountMin") ?? "";
    const initialAmountMax = searchParams.get("amountMax") ?? "";
    const initialPartnerId = searchParams.get("partnerId") ?? "";
    setDirection(initialDirection);
    setSearch(initialSearch);
    setDateRange(initialRange);
    setAmountMin(initialAmountMin);
    setAmountMax(initialAmountMax);
    setPartnerId(initialPartnerId);
    const { from, to } = resolveDateRange(initialRange);
    load(initialDirection, initialSearch, 1, initSort, from, to, initialAmountMin, initialAmountMax, initialPartnerId);
    api.get<Partner[]>("/accounts/partners").then(setPartners).catch(() => {});
    api.get<string[]>("/accounts/parties").then(setPartyOptions).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncUrl = (overrides: Partial<{ direction: Direction; search: string; dateRange: DateRangeSelection; amountMin: string; amountMax: string; partnerId: string; sort: Sort; page: number }> = {}) => {
    const dir = overrides.direction ?? direction;
    const s = overrides.search ?? search;
    const dr = overrides.dateRange ?? dateRange;
    const aMin = overrides.amountMin ?? amountMin;
    const aMax = overrides.amountMax ?? amountMax;
    const pId = overrides.partnerId ?? partnerId;
    const srt = overrides.sort ?? sort;
    const p = overrides.page ?? page;
    router.replace(`${pathname}?${buildQueryString({ direction: dir, search: s, ...encodeDateRange(dr), amountMin: aMin, amountMax: aMax, partnerId: pId, sort: srt.col, dir: srt.dir, page: p })}`, { scroll: false });
  };

  const switchDirection = (dir: Direction) => {
    setDirection(dir); setPage(1);
    const { from, to } = resolveDateRange(dateRange);
    const cached = paymentsCache.get(keyFor(dir, search, sort, 1, from, to, amountMin, amountMax, partnerId));
    if (cached) { setRows(cached.rows); setTotal(cached.total); setCount(cached.count); }
    load(dir, search, 1, sort, from, to, amountMin, amountMax, partnerId);
    syncUrl({ direction: dir, page: 1 });
  };

  const handleSearch = (v: string) => {
    setSearch(v); setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const { from, to } = resolveDateRange(dateRange);
      load(direction, v, 1, sort, from, to, amountMin, amountMax, partnerId);
      syncUrl({ search: v, page: 1 });
    }, 300);
  };
  const onSort = (col: string) => {
    const s = nextSort(sort, col); setSort(s); setPage(1);
    const { from, to } = resolveDateRange(dateRange);
    load(direction, search, 1, s, from, to, amountMin, amountMax, partnerId);
    syncUrl({ sort: s, page: 1 });
  };
  const goPage = (p: number) => {
    setPage(p);
    const { from, to } = resolveDateRange(dateRange);
    load(direction, search, p, sort, from, to, amountMin, amountMax, partnerId);
    syncUrl({ page: p });
  };
  const handleDateRangeChange = (v: DateRangeSelection) => {
    setDateRange(v); setPage(1);
    const { from, to } = resolveDateRange(v);
    load(direction, search, 1, sort, from, to, amountMin, amountMax, partnerId);
    syncUrl({ dateRange: v, page: 1 });
  };
  const handleFilterChange = (next: Partial<{ amountMin: string; amountMax: string; partnerId: string }>) => {
    const nextMin = next.amountMin ?? amountMin;
    const nextMax = next.amountMax ?? amountMax;
    const nextPartnerId = next.partnerId ?? partnerId;
    setAmountMin(nextMin); setAmountMax(nextMax); setPartnerId(nextPartnerId); setPage(1);
    const { from, to } = resolveDateRange(dateRange);
    load(direction, search, 1, sort, from, to, nextMin, nextMax, nextPartnerId);
    syncUrl({ amountMin: nextMin, amountMax: nextMax, partnerId: nextPartnerId, page: 1 });
  };
  const clearFilters = () => {
    setDateRange({ preset: "all" }); setAmountMin(""); setAmountMax(""); setPartnerId(""); setPage(1);
    load(direction, search, 1, sort, null, null, "", "", "");
    syncUrl({ dateRange: { preset: "all" }, amountMin: "", amountMax: "", partnerId: "", page: 1 });
  };

  const handleSave = async () => {
    const payload = { ...form, direction };
    const errs = validatePayment(payload);
    if (hasErrors(errs)) { setFormErrors(errs); toast.error(firstError(errs)!); return; }
    setFormErrors({});
    setSaving(true);
    try {
      await api.post("/payments", { ...payload, amount: Number(form.amount) });
      setForm(emptyForm);
      setAddingOwner(false);
      setShowForm(false);
      paymentsCache.clear();
      setPage(1);
      const { from, to } = resolveDateRange(dateRange);
      load(direction, search, 1, sort, from, to, amountMin, amountMax, partnerId);
      api.get<Partner[]>("/accounts/partners").then(setPartners).catch(() => {});
      api.get<string[]>("/accounts/parties").then(setPartyOptions).catch(() => {});
      toast.success(direction === "received" ? "Payment received recorded" : "Payment sent recorded");
    } catch { toast.error("Couldn't record payment"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm({ title: "Delete this payment?", message: "This also removes it from the party's ledger and, if linked, the customer's ledger.", confirmText: "Delete", danger: true }))) return;
    const prevRows = rows, prevTotal = total, prevCount = count;
    const del = rows.find((r) => r.id === id);
    setRows((r) => r.filter((row) => row.id !== id));
    if (del) setTotal((t) => t - Number(del.amount));
    setCount((c) => Math.max(0, c - 1));
    try {
      await api.del(`/payments/${id}`);
      paymentsCache.clear();
      toast.success("Payment deleted");
    } catch {
      setRows(prevRows); setTotal(prevTotal); setCount(prevCount);
      toast.error("Couldn't delete payment");
    }
  };

  const rowsFadeKey = useContentFadeKey(rows);
  const heading = direction === "received" ? "Payments Received" : "Payments Sent";
  const partyLabel = direction === "received" ? "From" : "To";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[26px] font-semibold text-ink">Payments</h1>
            {count > 0 && <span className="badge-neutral tabular-nums">{count.toLocaleString()}</span>}
          </div>
          <p className="mt-1 text-sm text-muted">Who sent or received money, and which owner handled it.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">+ Add Payment</button>
      </div>

      <div className="flex gap-2 border-b border-line">
        {(["received", "sent"] as Direction[]).map((d) => (
          <button
            key={d}
            onClick={() => switchDirection(d)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${direction === d ? "border-accent text-accent-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {d === "received" ? "Received" : "Sent"}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="rise card p-6">
          <h3 className="font-semibold text-ink mb-4">{heading} — New Entry</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="input py-2.5 text-sm" />
            </div>
            <div>
              <label className="label">{partyLabel} *</label>
              <input
                list="party-options"
                value={form.partyName}
                onChange={(e) => { setForm((f) => ({ ...f, partyName: e.target.value })); setFormErrors((er) => ({ ...er, partyName: "" })); }}
                placeholder="Customer or supplier name"
                className={`input py-2.5 text-sm${formErrors.partyName ? " ring-1 ring-danger" : ""}`}
              />
              <datalist id="party-options">
                {partyOptions.map((name) => <option key={name} value={name} />)}
              </datalist>
              {formErrors.partyName && <p className="mt-1 text-xs text-danger">{formErrors.partyName}</p>}
            </div>
            <div>
              <label className="label">Owner *</label>
              {addingOwner ? (
                <input
                  value={form.partnerName}
                  onChange={(e) => { setForm((f) => ({ ...f, partnerName: e.target.value })); setFormErrors((er) => ({ ...er, partnerName: "" })); }}
                  placeholder="New owner name"
                  className={`input py-2.5 text-sm${formErrors.partnerName ? " ring-1 ring-danger" : ""}`}
                />
              ) : (
                <select
                  value={form.partnerName}
                  onChange={(e) => {
                    if (e.target.value === "__add__") { setAddingOwner(true); setForm((f) => ({ ...f, partnerName: "" })); return; }
                    setForm((f) => ({ ...f, partnerName: e.target.value })); setFormErrors((er) => ({ ...er, partnerName: "" }));
                  }}
                  className={`input py-2.5 text-sm${formErrors.partnerName ? " ring-1 ring-danger" : ""}`}
                >
                  <option value="">Select owner</option>
                  {partners.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                  <option value="__add__">+ Add owner…</option>
                </select>
              )}
              {formErrors.partnerName && <p className="mt-1 text-xs text-danger">{formErrors.partnerName}</p>}
            </div>
            <div>
              <label className="label">Amount (Rs) *</label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); setFormErrors((er) => ({ ...er, amount: "" })); }}
                className={`input py-2.5 text-sm${formErrors.amount ? " ring-1 ring-danger" : ""}`}
              />
              {formErrors.amount && <p className="mt-1 text-xs text-danger">{formErrors.amount}</p>}
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="label">Note</label>
              <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional — method, reference, etc." className="input py-2.5 text-sm" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving || !form.partyName || !form.partnerName || !form.amount} className="btn-primary">{saving ? "Saving…" : "Save"}</button>
            <button onClick={() => { setShowForm(false); setAddingOwner(false); }} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-4">
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] text-muted uppercase tracking-wider">Total</p>
          <p className="font-mono font-semibold text-ink tabular-nums">{formatMoney(total)}</p>
        </div>
      </div>

      <FilterBar active={!!(search || dateRange.preset !== "all" || amountMin || amountMax || partnerId)} onClear={clearFilters}>
        <SearchInput value={search} onChange={handleSearch} placeholder={`Search ${partyLabel.toLowerCase()}…`} className="w-full max-w-xs" />
        <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} />
        <AmountRangeFilter min={amountMin} max={amountMax} onChange={(min, max) => handleFilterChange({ amountMin: min, amountMax: max })} />
        <select
          value={partnerId}
          onChange={(e) => handleFilterChange({ partnerId: e.target.value })}
          className="input py-2 text-sm w-auto"
        >
          <option value="">All owners</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </FilterBar>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black/[0.02] border-b border-line">
                <SortHeader col="date" label="Date" sort={sort} onSort={onSort} />
                <th className="th">{partyLabel}</th>
                <th className="th">Owner</th>
                <SortHeader col="amount" label="Amount" sort={sort} onSort={onSort} align="right" />
                <th className="th">Note</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody key={rowsFadeKey} className={loading ? "divide-y divide-line" : "divide-y divide-line content-fade"}>
              {loading ? <TableSkeleton rows={6} cols={6} /> :
               error ? <tr><td colSpan={6}><ErrorState onRetry={() => { const { from, to } = resolveDateRange(dateRange); load(direction, search, page, sort, from, to, amountMin, amountMax, partnerId); }} compact /></td></tr> :
               rows.length === 0 ? <tr><td colSpan={6}><EmptyState icon={ArrowLeftRight} compact title={search ? "No matches" : "No entries yet"} description={search ? `Nothing matches "${search}".` : `Record your first payment with the "Add Payment" button.`} /></td></tr> :
               rows.map((r) => (
                <tr key={r.id} className="hover:bg-black/[0.015] transition-colors">
                  <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3 text-ink font-medium">{r.partyName}</td>
                  <td className="px-4 py-3 text-muted">{r.partnerName}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(r.amount)}</td>
                  <td className="px-4 py-3 text-muted text-xs">{r.note || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button onClick={() => handleDelete(r.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/60 hover:text-danger hover:bg-danger-tint transition-colors" aria-label="Delete entry">
                      <Trash2 className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && <tfoot><tr className="border-t border-line bg-black/[0.02]"><td colSpan={3} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{search ? "Total (filtered)" : "Total"}</td><td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(total)}</td><td colSpan={2} /></tr></tfoot>}
          </table>
        </div>
        {!loading && !error && <Pagination page={page} total={count} pageSize={PAGE_SIZE} onPage={goPage} />}
      </div>
    </div>
  );
}
