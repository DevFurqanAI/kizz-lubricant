/** Format a number as Pakistani Rupee (e.g. Rs 1,23,456) */
export function formatMoney(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (isNaN(n)) return "Rs 0";
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-PK");
  return `${n < 0 ? "-" : ""}Rs ${formatted}`;
}

/** Parse any money-ish value to a safe JS number */
export function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/** YYYY-MM-DD → readable label */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-PK", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

/** YYYY-MM → "Jan 2026" */
export function monthLabel(key: string): string {
  if (!key || key === "Unknown") return "Unknown";
  const [y, m] = key.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Normalize a stored phone/WhatsApp number to international format (digits only,
 * no `+`). Assumes Pakistan (+92) when no country code is present.
 * Returns null when there are no usable digits.
 */
export function waNumber(raw?: string | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = "92" + d.slice(1);               // 03xx… → 92 3xx…
  else if (d.length === 10 && d.startsWith("3")) d = "92" + d; // 3xx… → 92 3xx…
  return d;
}
