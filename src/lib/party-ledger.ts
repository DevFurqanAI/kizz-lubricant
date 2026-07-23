import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Recompute every running balance for one account (party or partner) in
 * `ledger_entries`, seeded from `accounts.opening_balance`. Mirrors
 * `recalcBalances` in src/lib/ledger.ts (single windowed UPDATE — the Neon
 * HTTP driver can't run interactive transactions, and this stays atomic and
 * fast) but, unlike that one, correctly folds in the opening balance from
 * the start since `ledger_entries` has no legacy zero-start data to stay
 * compatible with.
 */
export async function recalcAccountBalances(accountId: number) {
  await db.execute(sql`
    UPDATE ledger_entries AS le
    SET balance = t.running
    FROM (
      SELECT le2.id,
             a.opening_balance + SUM(le2.debit - le2.credit) OVER (
               ORDER BY le2.date, le2.id
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
             ) AS running
      FROM ledger_entries le2
      JOIN accounts a ON a.id = le2.account_id
      WHERE le2.account_id = ${accountId}
    ) AS t
    WHERE le.id = t.id
  `);
}
