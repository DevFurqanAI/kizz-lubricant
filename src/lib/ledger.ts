import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Recompute every running balance for one customer in a SINGLE atomic statement.
 *
 *   balance[n] = customer.openingBalance + Σ(debit − credit) from the oldest
 *   entry through n, ordered by date then id.
 *   Positive → customer owes us; negative → they've paid ahead.
 *
 * Why one statement: the Neon HTTP driver can't run interactive multi-statement
 * transactions, and a round-trip-per-entry loop is slow with no atomicity — a
 * mid-loop failure leaves the ledger half-updated. A single windowed UPDATE is
 * both fast and atomic.
 *
 * Anchoring to `customers.opening_balance` (rather than zero) preserves balances
 * that predate a customer's first entry — e.g. carried over from a paper ledger.
 * Manual write-offs that aren't a debit/credit row still aren't preserved; those
 * need an explicit adjustment entry.
 */
export async function recalcBalances(customerId: number) {
  await db.execute(sql`
    UPDATE customer_entries AS ce
    SET balance = t.running
    FROM (
      SELECT ce2.id,
             c.opening_balance + SUM(ce2.debit - ce2.credit) OVER (
               ORDER BY ce2.date, ce2.id
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
             ) AS running
      FROM customer_entries ce2
      JOIN customers c ON c.id = ce2.customer_id
      WHERE ce2.customer_id = ${customerId}
    ) AS t
    WHERE ce.id = t.id
  `);
}
