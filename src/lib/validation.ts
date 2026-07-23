/**
 * Shared input validation — the single source of truth used by BOTH the API
 * routes (server, the real integrity guard) and the dashboard forms (client,
 * for inline errors). Keep this file free of any `next`/server-only imports so
 * it can run in the browser too.
 *
 * Business rules (confirmed with the owner):
 *  - Quantity: optional; if given, must be > 0 and at most 3 decimal places
 *    (the qty column is numeric(12,3) — more decimals get silently truncated).
 *  - Money (amount / rate / debit / credit): must be a valid finite number;
 *    negatives ARE allowed (corrections/refunds). At most 2 decimal places
 *    (numeric(_,2)) and within the column's range.
 *  - Dates: must be a real calendar date (YYYY-MM-DD); past or future both fine.
 *  - Text: trimmed, required-where-noted, and capped to the DB column width.
 */

export type FieldErrors = Record<string, string>;

// Column limits from src/db/schema.ts
const MONEY_MAX = 999_999_999_999.99; // numeric(14,2)
const QTY_MAX = 999_999_999.999; //       numeric(12,3)

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** Number of digits after the decimal point, robust to scientific notation. */
function decimalPlaces(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const s = Math.abs(n).toString();
  if (s.includes("e") || s.includes("E")) {
    const [mantissa, expPart] = s.split(/e/i);
    const frac = mantissa.split(".")[1]?.length ?? 0;
    return Math.max(0, frac - Number(expPart));
  }
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

// ── Field-level checks — each returns an error message or null ──────────────

export function checkDate(v: unknown, opts: { required?: boolean } = {}): string | null {
  if (isBlank(v)) return opts.required ? "Date is required." : null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "Enter a valid date.";
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Catches rollovers like 2026-02-31 that the Date constructor silently shifts.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) {
    return "Enter a valid date.";
  }
  return null;
}

export function checkRequiredText(v: unknown, label: string, max: number): string | null {
  if (isBlank(v)) return `${label} is required.`;
  if (String(v).trim().length > max) return `${label} must be ${max} characters or fewer.`;
  return null;
}

export function checkOptionalText(v: unknown, label: string, max: number): string | null {
  if (isBlank(v)) return null;
  if (String(v).trim().length > max) return `${label} must be ${max} characters or fewer.`;
  return null;
}

export function checkMoney(v: unknown, label: string, opts: { required?: boolean } = {}): string | null {
  if (isBlank(v)) return opts.required ? `${label} is required.` : null;
  const n = Number(v);
  if (!Number.isFinite(n)) return `${label} must be a valid number.`;
  if (Math.abs(n) > MONEY_MAX) return `${label} is too large.`;
  if (decimalPlaces(n) > 2) return `${label} can have at most 2 decimal places.`;
  return null;
}

export function checkQty(v: unknown, label = "Quantity"): string | null {
  if (isBlank(v)) return null; // optional
  const n = Number(v);
  if (!Number.isFinite(n)) return `${label} must be a valid number.`;
  if (n <= 0) return `${label} must be greater than 0.`;
  if (n > QTY_MAX) return `${label} is too large.`;
  if (decimalPlaces(n) > 3) return `${label} can have at most 3 decimal places.`;
  return null;
}

export function checkEmail(v: unknown): string | null {
  if (isBlank(v)) return null;
  const s = String(v).trim();
  if (s.length > 255) return "Email must be 255 characters or fewer.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "Enter a valid email address.";
  return null;
}

// ── Entity validators — return {} when the record is valid ──────────────────
// `mode: "update"` (PATCH) only validates the fields actually present in the
// body; "create" (POST / a full form) validates every field including required.

type Mode = "create" | "update";

/** Assigns `msg` to `errors[key]` only when there's actually an error. */
function set(errors: FieldErrors, key: string, msg: string | null): void {
  if (msg) errors[key] = msg;
}

/** True when this field should be validated in the given mode. */
const active = (b: Record<string, unknown>, key: string, mode: Mode) =>
  mode === "create" || key in b;

export function validateSale(b: Record<string, unknown>, mode: Mode = "create"): FieldErrors {
  const e: FieldErrors = {};
  if (active(b, "date", mode)) set(e, "date", checkDate(b.date, { required: true }));
  if (active(b, "detail", mode)) set(e, "detail", checkRequiredText(b.detail, "Detail", 400));
  if (active(b, "packing", mode)) set(e, "packing", checkOptionalText(b.packing, "Packing", 100));
  if (active(b, "unit", mode)) set(e, "unit", checkOptionalText(b.unit, "Unit", 50));
  if (active(b, "qty", mode)) set(e, "qty", checkQty(b.qty));
  if (active(b, "rate", mode)) set(e, "rate", checkMoney(b.rate, "Rate"));
  if (active(b, "amount", mode)) set(e, "amount", checkMoney(b.amount, "Amount", { required: true }));
  if (active(b, "saleKg", mode)) set(e, "saleKg", checkQty(b.saleKg, "Sale Kg"));
  if (active(b, "saleKgUnit", mode)) set(e, "saleKgUnit", checkSaleKgUnit(b.saleKgUnit));
  return e;
}

/** Sale Kg unit: optional, but if given must be one of the known units. */
export function checkSaleKgUnit(v: unknown): string | null {
  if (isBlank(v)) return null;
  return ["Kg", "L"].includes(String(v).trim()) ? null : "Unit must be Kg or L.";
}

export function validateLedgerEntry(b: Record<string, unknown>, mode: Mode = "create"): FieldErrors {
  const e: FieldErrors = {};
  if (active(b, "date", mode)) set(e, "date", checkDate(b.date, { required: true }));
  if (active(b, "product", mode)) set(e, "product", checkOptionalText(b.product, "Product", 200));
  if (active(b, "packing", mode)) set(e, "packing", checkOptionalText(b.packing, "Packing", 100));
  if (active(b, "unit", mode)) set(e, "unit", checkOptionalText(b.unit, "Unit", 50));
  if (active(b, "qty", mode)) set(e, "qty", checkQty(b.qty));
  if (active(b, "rate", mode)) set(e, "rate", checkMoney(b.rate, "Rate"));
  if (active(b, "debit", mode)) set(e, "debit", checkMoney(b.debit, "Debit"));
  if (active(b, "credit", mode)) set(e, "credit", checkMoney(b.credit, "Credit"));
  if (active(b, "account", mode)) set(e, "account", checkOptionalText(b.account, "Account / Note", 300));
  return e;
}

/** Purchasing and Expenses share the same shape (date / detail / amount). */
export function validateAmountEntry(b: Record<string, unknown>, mode: Mode = "create"): FieldErrors {
  const e: FieldErrors = {};
  if (active(b, "date", mode)) set(e, "date", checkDate(b.date, { required: true }));
  if (active(b, "detail", mode)) set(e, "detail", checkRequiredText(b.detail, "Detail", 400));
  if (active(b, "amount", mode)) set(e, "amount", checkMoney(b.amount, "Amount", { required: true }));
  return e;
}

export function validateSalary(b: Record<string, unknown>, mode: Mode = "create"): FieldErrors {
  const e: FieldErrors = {};
  if (active(b, "date", mode)) set(e, "date", checkDate(b.date, { required: true }));
  if (active(b, "employee", mode)) set(e, "employee", checkRequiredText(b.employee, "Employee", 200));
  if (active(b, "amount", mode)) set(e, "amount", checkMoney(b.amount, "Amount", { required: true }));
  if (active(b, "account", mode)) set(e, "account", checkOptionalText(b.account, "Paid Via / Account", 300));
  return e;
}

function checkDirection(v: unknown): string | null {
  return v === "received" || v === "sent" ? null : "Direction must be 'received' or 'sent'.";
}

function checkPositiveMoney(v: unknown, label: string): string | null {
  const err = checkMoney(v, label, { required: true });
  if (err) return err;
  if (Number(v) <= 0) return `${label} must be greater than 0.`;
  return null;
}

export function validatePayment(b: Record<string, unknown>, mode: Mode = "create"): FieldErrors {
  const e: FieldErrors = {};
  if (active(b, "date", mode)) set(e, "date", checkDate(b.date, { required: true }));
  if (active(b, "direction", mode)) set(e, "direction", checkDirection(b.direction));
  if (active(b, "partyName", mode)) set(e, "partyName", checkRequiredText(b.partyName, "Party", 200));
  if (active(b, "partnerName", mode)) set(e, "partnerName", checkRequiredText(b.partnerName, "Owner", 200));
  if (active(b, "amount", mode)) set(e, "amount", checkPositiveMoney(b.amount, "Amount"));
  if (active(b, "note", mode)) set(e, "note", checkOptionalText(b.note, "Note", 300));
  return e;
}

export function validateCustomer(b: Record<string, unknown>, mode: Mode = "create"): FieldErrors {
  const e: FieldErrors = {};
  if (active(b, "name", mode)) set(e, "name", checkRequiredText(b.name, "Name", 200));
  if (active(b, "accountTitle", mode)) set(e, "accountTitle", checkOptionalText(b.accountTitle, "Account Title", 200));
  if (active(b, "owner", mode)) set(e, "owner", checkOptionalText(b.owner, "Owner", 200));
  if (active(b, "cnic", mode)) set(e, "cnic", checkOptionalText(b.cnic, "CNIC", 30));
  if (active(b, "address", mode)) set(e, "address", checkOptionalText(b.address, "Address", 300));
  if (active(b, "phone", mode)) set(e, "phone", checkOptionalText(b.phone, "Cell #", 50));
  if (active(b, "whatsapp", mode)) set(e, "whatsapp", checkOptionalText(b.whatsapp, "WhatsApp #", 50));
  if (active(b, "email", mode)) set(e, "email", checkEmail(b.email));
  return e;
}

// ── Helpers for callers ─────────────────────────────────────────────────────

export function hasErrors(e: FieldErrors): boolean {
  return Object.keys(e).length > 0;
}

/** First error message, for a toast or an API `error` string. */
export function firstError(e: FieldErrors): string | null {
  const keys = Object.keys(e);
  return keys.length ? e[keys[0]] : null;
}
