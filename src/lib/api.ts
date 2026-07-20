/** Thin fetch wrappers used by client components */

const BASE = "/api";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    // Session expired / not authenticated — send the user back to sign-in
    // instead of surfacing a broken page.
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.assign("/");
      throw new Error("Session expired");
    }
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => req<T>(path),
  post: <T>(path: string, body: unknown) =>
    req<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    req<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => req<T>(path, { method: "DELETE" }),
};

/**
 * Walks every page of a `{ rows, count }` list endpoint and returns the full
 * row set for the given filter — used by Excel exports, which need every
 * matching record, not just the current page (list endpoints cap at 100/page).
 */
export async function fetchAllRows<T>(
  path: string,
  params: Record<string, string>,
): Promise<T[]> {
  const limit = 100;
  const rows: T[] = [];
  let page = 1;
  for (;;) {
    const qs = new URLSearchParams({ ...params, page: String(page), limit: String(limit) });
    const data = await api.get<{ rows: T[]; count: number }>(`${path}?${qs}`);
    rows.push(...data.rows);
    if (data.rows.length === 0 || rows.length >= data.count) break;
    page++;
  }
  return rows;
}
