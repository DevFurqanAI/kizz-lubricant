import type { NextRequest } from "next/server";

/** Default page size for server-paginated ledger lists. */
export const PAGE_SIZE = 50;

export type ListParams = {
  search: string;
  page: number;
  limit: number;
  offset: number;
  sort: string; // validated against the caller's whitelist
  dir: "asc" | "desc";
  from: string | null; // inclusive ISO date lower bound, or null = unbounded
  to: string | null; // inclusive ISO date upper bound, or null = unbounded
  amountMin: number | null; // inclusive amount lower bound, or null = unbounded
  amountMax: number | null; // inclusive amount upper bound, or null = unbounded
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Only accept a well-formed "YYYY-MM-DD" that's also a real calendar date. */
function parseIsoDate(v: string | null): string | null {
  if (!v || !ISO_DATE.test(v)) return null;
  const d = new Date(v + "T00:00:00Z");
  return d.toISOString().slice(0, 10) === v ? v : null;
}

/** Only accept a finite, non-negative number — anything else is treated as absent. */
function parseAmount(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Parse + sanitize list query params (search / page / limit / sort / dir /
 * from / to). `sortable` is the whitelist of allowed sort keys → the sort
 * key is never taken raw from the client, so it can't be used for SQL
 * injection.
 */
export function parseListParams(
  req: NextRequest,
  opts: { sortable: readonly string[]; defaultSort: string },
): ListParams {
  const sp = req.nextUrl.searchParams;
  const search = sp.get("search")?.trim() ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || PAGE_SIZE));
  const requested = sp.get("sort") ?? "";
  const sort = opts.sortable.includes(requested) ? requested : opts.defaultSort;
  const dir = sp.get("dir") === "asc" ? "asc" : "desc";
  let from = parseIsoDate(sp.get("from"));
  let to = parseIsoDate(sp.get("to"));
  if (from && to && from > to) [from, to] = [to, from];
  let amountMin = parseAmount(sp.get("amountMin"));
  let amountMax = parseAmount(sp.get("amountMax"));
  if (amountMin !== null && amountMax !== null && amountMin > amountMax) [amountMin, amountMax] = [amountMax, amountMin];
  return { search, page, limit, offset: (page - 1) * limit, sort, dir, from, to, amountMin, amountMax };
}
