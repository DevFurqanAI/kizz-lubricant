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
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Only accept a well-formed "YYYY-MM-DD" — anything else is treated as absent. */
function parseIsoDate(v: string | null): string | null {
  return v && ISO_DATE.test(v) ? v : null;
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
  return { search, page, limit, offset: (page - 1) * limit, sort, dir, from, to };
}
