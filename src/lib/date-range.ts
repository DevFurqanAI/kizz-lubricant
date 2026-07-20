export type DateRangeSelection =
  | { preset: "7d" | "30d" | "90d" | "ytd" | "all" }
  | { preset: "custom"; from: string; to: string };

/** "YYYY-MM-DD" + N days -> "YYYY-MM-DD", via UTC to avoid local-timezone drift. */
function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a selection into inclusive ISO date bounds ("YYYY-MM-DD"). Either
 * bound is `null` when unbounded in that direction (only "all" is fully
 * unbounded). `todayISO` is injectable so callers/tests get a deterministic
 * "today" instead of the real wall-clock date.
 */
export function resolveDateRange(
  sel: DateRangeSelection,
  todayISO: string = new Date().toISOString().slice(0, 10),
): { from: string | null; to: string | null } {
  switch (sel.preset) {
    case "all":
      return { from: null, to: null };
    case "7d":
      return { from: shiftDays(todayISO, -6), to: todayISO };
    case "30d":
      return { from: shiftDays(todayISO, -29), to: todayISO };
    case "90d":
      return { from: shiftDays(todayISO, -89), to: todayISO };
    case "ytd":
      return { from: `${todayISO.slice(0, 4)}-01-01`, to: todayISO };
    case "custom": {
      let { from, to } = sel;
      if (from > to) [from, to] = [to, from];
      return { from, to };
    }
  }
}

/** Plain-language description of the active range, for badges/empty-state copy. */
export function describeDateRange(sel: DateRangeSelection): string {
  switch (sel.preset) {
    case "all": return "all time";
    case "7d": return "last 7 days";
    case "30d": return "last 30 days";
    case "90d": return "last 90 days";
    case "ytd": return "year to date";
    case "custom": {
      let { from, to } = sel;
      if (from > to) [from, to] = [to, from];
      return `${from} – ${to}`;
    }
  }
}
