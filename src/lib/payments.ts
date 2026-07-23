import { db } from "@/db";
import { transactions, ledgerEntries, customerEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recalcAccountBalances } from "@/lib/party-ledger";
import { recalcBalances } from "@/lib/ledger";

export type PaymentDirection = "received" | "sent";

export type PostPaymentInput = {
  date: string;
  direction: PaymentDirection;
  amount: string;
  note: string | null;
  partyAccountId: number;
  partnerAccountId: number;
  customerId: number | null;
};

/**
 * One payment = one `transactions` row + two `ledger_entries` postings
 * (party + owner), following the fan-out table in
 * docs/automation-spec.md §5:
 *   Received (purchaser_receipt): party credit (they owe less), owner debit (cash in)
 *   Sent (supplier_payment):      party debit (we owe less),   owner credit (cash out)
 * When `customerId` is set, also mirrors a credit/debit row into
 * customer_entries — same pattern sales.ledgerEntryId uses — so the
 * Customer ledger page needs no changes.
 *
 * The Neon HTTP driver can't run interactive transactions (see
 * src/lib/ledger.ts), so on any failure after the initial insert this
 * deletes what it already created rather than leave the ledger
 * inconsistent — same approach as POST /api/sales.
 */
export async function postPaymentTransaction(input: PostPaymentInput) {
  const kind = input.direction === "received" ? "purchaser_receipt" : "supplier_payment";

  const [txn] = await db
    .insert(transactions)
    .values({
      date: input.date,
      kind,
      amount: input.amount,
      partyAccountId: input.partyAccountId,
      partnerAccountId: input.partnerAccountId,
      note: input.note,
    })
    .returning();

  let mirrorId: number | null = null;
  try {
    await db.insert(ledgerEntries).values({
      accountId: input.partyAccountId,
      transactionId: txn.id,
      date: input.date,
      debit: input.direction === "sent" ? input.amount : "0",
      credit: input.direction === "received" ? input.amount : "0",
      balance: "0",
    });
    await db.insert(ledgerEntries).values({
      accountId: input.partnerAccountId,
      transactionId: txn.id,
      date: input.date,
      debit: input.direction === "received" ? input.amount : "0",
      credit: input.direction === "sent" ? input.amount : "0",
      balance: "0",
    });
    await recalcAccountBalances(input.partyAccountId);
    await recalcAccountBalances(input.partnerAccountId);

    if (input.customerId) {
      const [mirror] = await db
        .insert(customerEntries)
        .values({
          customerId: input.customerId,
          date: input.date,
          // No product on Received — an empty product is what marks a row
          // as a payment for the ledger render + Excel export (see
          // memory: payments-model). Sent-to-a-customer is a rare edge
          // case (e.g. a refund), so it gets an explicit product label
          // instead of tripping that "Payment Received" detection.
          product: input.direction === "sent" ? "Payment Sent" : null,
          debit: input.direction === "sent" ? input.amount : "0",
          credit: input.direction === "received" ? input.amount : "0",
          balance: "0",
          account: input.note,
        })
        .returning();
      mirrorId = mirror.id;
      await db.update(transactions).set({ mirroredEntryId: mirror.id }).where(eq(transactions.id, txn.id));
      await recalcBalances(input.customerId);
    }
  } catch (err) {
    console.error("postPaymentTransaction failed, rolling back:", err);
    if (mirrorId) await db.delete(customerEntries).where(eq(customerEntries.id, mirrorId)).catch((cleanupErr) => console.error("rollback cleanup failed:", cleanupErr));
    // Deleting the transaction cascades its ledger_entries (onDelete: "cascade").
    await db.delete(transactions).where(eq(transactions.id, txn.id)).catch((cleanupErr) => console.error("rollback cleanup failed:", cleanupErr));
    throw err;
  }

  return txn;
}
