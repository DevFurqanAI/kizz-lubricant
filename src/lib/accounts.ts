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
 *
 * `customers.name` and `accounts (name, type)` both carry a case-insensitive
 * unique index (see src/db/schema.ts) — concurrent calls for the same new
 * name race on the DB's unique constraint instead of the app, so at most one
 * row is ever created; the loser's INSERT returns no row and falls back to
 * SELECT-ing the winner.
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
    const acctRows = await db.execute(sql`
      INSERT INTO accounts (name, type) VALUES (${trimmed}, 'party')
      ON CONFLICT (lower(name), type) DO NOTHING
      RETURNING id
    `);
    let acct = (acctRows.rows as { id: number }[])[0];
    if (!acct) {
      [acct] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.type, "party"), sql`lower(${accounts.name}) = lower(${trimmed})`))
        .limit(1);
    }
    try {
      await db.update(customers).set({ accountId: acct.id }).where(eq(customers.id, customerMatch.id));
    } catch (err) {
      // Clean up the orphaned account row on failure (best-effort). Only safe
      // to delete if we're the one who created it, but a delete on a row now
      // referenced elsewhere is a no-op failure we swallow — never delete
      // another customer's already-linked account.
      await db.delete(accounts).where(eq(accounts.id, acct.id)).catch(() => {});
      throw err;
    }
    return { accountId: acct.id, customerId: customerMatch.id };
  }

  const createdRows = await db.execute(sql`
    INSERT INTO accounts (name, type) VALUES (${trimmed}, 'party')
    ON CONFLICT (lower(name), type) DO NOTHING
    RETURNING id
  `);
  let created = (createdRows.rows as { id: number }[])[0];
  if (!created) {
    [created] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.type, "party"), sql`lower(${accounts.name}) = lower(${trimmed})`))
      .limit(1);
  }
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

  const createdRows = await db.execute(sql`
    INSERT INTO accounts (name, type) VALUES (${trimmed}, 'partner')
    ON CONFLICT (lower(name), type) DO NOTHING
    RETURNING id
  `);
  let created = (createdRows.rows as { id: number }[])[0];
  if (!created) {
    [created] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.type, "partner"), sql`lower(${accounts.name}) = lower(${trimmed})`))
      .limit(1);
  }
  return created.id;
}
