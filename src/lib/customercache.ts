import { toNum } from "@/lib/utils";
import type { Customer, CustomerEntry } from "@/db/schema";

export type FullCustomer = Customer & { entries: CustomerEntry[] };
export type CustomerWithBalance = Customer & { balance?: number };

/**
 * Module-scoped caches shared by every page that touches customer data.
 * A customer fetched once (from the list page or their ledger page) stays
 * warm for the rest of the session — visiting it again anywhere paints
 * instantly instead of re-hitting the network, then silently revalidates.
 */
export const customerDetailCache = new Map<string, FullCustomer>();
export const customerListCache = new Map<string, CustomerWithBalance[]>();

export function latestBalance(entries: { balance: string }[] = []) {
  if (!entries.length) return 0;
  return toNum(entries[entries.length - 1].balance);
}