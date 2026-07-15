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

/** ISO date → YYYY-MM */
export function monthKey(dateStr: string | null | undefined): string {
  if (!dateStr) return "Unknown";
  const m = String(dateStr).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : "Unknown";
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
