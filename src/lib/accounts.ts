import { db } from "@/db";
import { accounts, customers } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * Party = the counterparty on a payment (an existing Customer or a new
 * supplier/vendor). Resolves an existing match case-insensitively; creates a
 * new `accounts` row (type='party') if nothing matches. When the name
 * matches an existing Customer, that customer is auto-linked via
 * `customers.account_id` (created the first time they appear in a payment)
 * so the payment can mirror into their ledger — see src/lib/payments.ts.
 */
export async function findOrCreatePartyAccount(
  name: string,
): Promise<{ accountId: number; customerId: number | null }> {
  const trimmed = name.trim();

  const [customerMatch] = await db
    .select({ id: customers.id, accountId: customers.accountId })
    .from(customers)
    .where(sql`lower(${customers.name}) = lower(${trimmed})`)
    .limit(1);

  if (customerMatch) {
    if (customerMatch.accountId) {
      return { accountId: customerMatch.accountId, customerId: customerMatch.id };
    }
    const [acct] = await db.insert(accounts).values({ name: trimmed, type: "party" }).returning({ id: accounts.id });
    await db.update(customers).set({ accountId: acct.id }).where(eq(customers.id, customerMatch.id));
    return { accountId: acct.id, customerId: customerMatch.id };
  }

  const [partyMatch] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.type, "party"), sql`lower(${accounts.name}) = lower(${trimmed})`))
    .limit(1);
  if (partyMatch) return { accountId: partyMatch.id, customerId: null };

  const [created] = await db.insert(accounts).values({ name: trimmed, type: "party" }).returning({ id: accounts.id });
  return { accountId: created.id, customerId: null };
}

/**
 * Owner = a partner cash account (Mubashir, Naqi, …). Same find-or-create,
 * no customer linking — this is how "+ Add owner" on the Payments page
 * works without a separate create endpoint.
 */
export async function findOrCreatePartnerAccount(name: string): Promise<number> {
  const trimmed = name.trim();
  const [match] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.type, "partner"), sql`lower(${accounts.name}) = lower(${trimmed})`))
    .limit(1);
  if (match) return match.id;
  const [created] = await db.insert(accounts).values({ name: trimmed, type: "partner" }).returning({ id: accounts.id });
  return created.id;
}
