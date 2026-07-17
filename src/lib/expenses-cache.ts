import { createLocalCache } from "@/lib/localCache";

/**
 * Expenses cache — a thin facade over the shared `createLocalCache` so the
 * expenses page keeps its `getCache` / `setCache` / `clearCache` API while
 * using the same localStorage-backed, stale-while-revalidate store as every
 * other ledger page (sales, salary, purchasing…).
 */
const cache = createLocalCache<unknown>("expenses", { ttlMs: 5 * 60_000 });

export function getCache<T>(key: string): T | null {
  return (cache.get(key) as T | undefined) ?? null;
}

export function setCache<T>(key: string, data: T) {
  cache.set(key, data);
}

export function clearCache() {
  cache.clear();
}
