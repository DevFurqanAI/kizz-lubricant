import { toNum } from "@/lib/utils";
import type { Customer, CustomerEntry } from "@/db/schema";

export type FullCustomer = Customer & { entries: CustomerEntry[] };
export type CustomerWithBalance = Customer & { balance?: number };
export const customerDetailCache = new Map<string, FullCustomer>();
export const customerListCache = new Map<string, CustomerWithBalance[]>();

export function latestBalance(entries: { balance: string }[] = []) {
  if (!entries.length) return 0;
  return toNum(entries[entries.length - 1].balance);
}