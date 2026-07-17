/**
 * Small localStorage-backed cache for ledger pages (salary, sales, purchasing, expenses...).
 *
 * Unlike a plain in-memory `Map` (which resets on every hard refresh / new tab),
 * this persists to localStorage so a page can paint from cache even after a
 * full reload, then silently revalidate against the server in the background.
 *
 * Usage in a ledger page:
 *
 *   const cache = createLocalCache<SalaryData>("salary", { ttlMs: 5 * 60_000 });
 *
 *   const cached0 = cache.get("");
 *   const [rows, setRows] = useState(cached0?.rows ?? []);
 *
 *   const load = async (q = "", opts?: { silent?: boolean }) => {
 *     if (!opts?.silent) setLoading(true);
 *     const data = await api.get(`/salary${q ? `?search=${q}` : ""}`);
 *     cache.set(q, data);
 *     setRows(data.rows);
 *   };
 *
 *   useEffect(() => {
 *     const cached = cache.get("");
 *     if (cached) { setRows(cached.rows); load("", { silent: true }); }
 *     else load("");
 *   }, []);
 *
 *   // after create/delete:
 *   cache.clear();
 */

type Entry<T> = { value: T; savedAt: number };

const memoryFallback = new Map<string, string>();

function storageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const testKey = "__cache_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false; // private-browsing / storage disabled / quota full
  }
}

export function createLocalCache<T>(
  namespace: string,
  opts?: { ttlMs?: number; version?: string }
) {
  const ttlMs = opts?.ttlMs ?? 5 * 60_000; // default: 5 minutes
  const version = opts?.version ?? "v1";
  const hasStorage = storageAvailable();
  const keyFor = (k: string) => `ledger-cache:${version}:${namespace}:${k}`;

  function readRaw(key: string): string | undefined {
    if (hasStorage) return window.localStorage.getItem(key) ?? undefined;
    return memoryFallback.get(key);
  }
  function writeRaw(key: string, val: string) {
    if (hasStorage) {
      try {
        window.localStorage.setItem(key, val);
      } catch {
        // quota exceeded or blocked — fall back silently, cache is best-effort
      }
    } else {
      memoryFallback.set(key, val);
    }
  }
  function removeRaw(key: string) {
    if (hasStorage) window.localStorage.removeItem(key);
    else memoryFallback.delete(key);
  }

  return {
    get(searchKey: string): T | undefined {
      const raw = readRaw(keyFor(searchKey));
      if (!raw) return undefined;
      try {
        const entry: Entry<T> = JSON.parse(raw);
        if (Date.now() - entry.savedAt > ttlMs) {
          removeRaw(keyFor(searchKey)); // stale — drop it
          return undefined;
        }
        return entry.value;
      } catch {
        return undefined;
      }
    },

    set(searchKey: string, value: T) {
      const entry: Entry<T> = { value, savedAt: Date.now() };
      writeRaw(keyFor(searchKey), JSON.stringify(entry));
    },

    /** True when a fresh (non-stale) entry exists for this key. */
    has(searchKey: string): boolean {
      return this.get(searchKey) !== undefined;
    },

    /** Drop a single key (e.g. one customer's detail after an edit). */
    del(searchKey: string) {
      removeRaw(keyFor(searchKey));
    },

    /** Call after any create/update/delete so stale totals aren't shown. */
    clear() {
      if (hasStorage) {
        const prefix = `ledger-cache:${version}:${namespace}:`;
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const k = window.localStorage.key(i);
          if (k?.startsWith(prefix)) window.localStorage.removeItem(k);
        }
      } else {
        for (const k of Array.from(memoryFallback.keys())) {
          if (k.startsWith(`ledger-cache:${version}:${namespace}:`)) memoryFallback.delete(k);
        }
      }
    },
  };
}
