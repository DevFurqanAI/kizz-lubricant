import type { Customer, CustomerEntry } from "@/db/schema";
import { createLocalCache } from "@/lib/localCache";

export type FullCustomer = Customer & { entries: CustomerEntry[] };
export type CustomerWithBalance = Customer & { balance?: number };

/**
 * Map-like facade over the shared localStorage cache so the customer pages
 * keep their `.get / .set / .has / .delete` calls while gaining persistence
 * and TTL. `.delete(key)` drops a single entry; `.clear()` wipes the namespace.
 */
function mapLikeCache<T>(namespace: string) {
  const cache = createLocalCache<T>(namespace, { ttlMs: 5 * 60_000 });
  return {
    get: (key: string): T | undefined => cache.get(key),
    set: (key: string, value: T) => cache.set(key, value),
    has: (key: string): boolean => cache.has(key),
    delete: (key: string) => cache.del(key),
    clear: () => cache.clear(),
  };
}

export const customerDetailCache = mapLikeCache<FullCustomer>("customer-detail");
export const customerListCache = mapLikeCache<CustomerWithBalance[]>("customer-list");
