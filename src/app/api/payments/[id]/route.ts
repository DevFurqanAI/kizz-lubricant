import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { transactions, customerEntries, customers, ledgerEntries } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { recalcAccountBalances } from "@/lib/party-ledger";
import { recalcBalances } from "@/lib/ledger";
import { parseIdParam } from "@/lib/pagination";
import { validatePayment, hasErrors, firstError, formatMoney } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseIdParam(params.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

    const [existing] = await db
      .select({
        partyAccountId: transactions.partyAccountId,
        partnerAccountId: transactions.partnerAccountId,
        mirroredEntryId: transactions.mirroredEntryId,
      })
      .from(transactions)
      .where(eq(transactions.id, id));
    if (!existing) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

    let customerId: number | null = null;
    if (existing.partyAccountId) {
      const [linked] = await db.select({ id: customers.id }).from(customers).where(eq(customers.accountId, existing.partyAccountId));
      customerId = linked?.id ?? null;
    }

    // The mirrored ledger row has no FK back to `transactions`, so it must be
    // deleted explicitly. `transactions` cascades `ledger_entries` on delete.
    if (existing.mirroredEntryId) {
      await db.delete(customerEntries).where(eq(customerEntries.id, existing.mirroredEntryId));
    }
    await db.delete(transactions).where(eq(transactions.id, id));

    if (existing.partyAccountId) await recalcAccountBalances(existing.partyAccountId);
    if (existing.partnerAccountId) await recalcAccountBalances(existing.partnerAccountId);
    if (customerId) await recalcBalances(customerId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /payments/[id] failed:", err);
    return NextResponse.json({ error: "Failed to delete payment." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseIdParam(params.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    const b = await req.json();
    const errors = validatePayment(b, "update");
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });

    const update: Record<string, unknown> = {};
    if ("date" in b) update.date = b.date;
    if ("amount" in b) update.amount = formatMoney(b.amount);
    if ("note" in b) update.note = typeof b.note === "string" ? (b.note.trim() || null) : null;
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
    }

    const [before] = await db.select().from(transactions).where(eq(transactions.id, id));
    if (!before) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

    const [row] = await db.update(transactions).set(update).where(eq(transactions.id, id)).returning();
    const direction: "received" | "sent" = row.kind === "purchaser_receipt" ? "received" : "sent";

    // Keep the two ledger_entries postings (party + owner) and, if this
    // payment mirrors into a customer's ledger, that mirror row, in step
    // with the edited date/amount. Neon's HTTP driver has no interactive
    // transactions, so on failure this reverts everything it touched and
    // recalculates, rather than leave the postings out of sync with
    // `transactions` — same idiom as PATCH /api/sales/[id].
    try {
      if (row.partyAccountId) {
        await db
          .update(ledgerEntries)
          .set({
            date: row.date,
            debit: direction === "sent" ? row.amount : "0",
            credit: direction === "received" ? row.amount : "0",
          })
          .where(and(eq(ledgerEntries.transactionId, id), eq(ledgerEntries.accountId, row.partyAccountId)));
        await recalcAccountBalances(row.partyAccountId);
      }
      if (row.partnerAccountId) {
        await db
          .update(ledgerEntries)
          .set({
            date: row.date,
            debit: direction === "received" ? row.amount : "0",
            credit: direction === "sent" ? row.amount : "0",
          })
          .where(and(eq(ledgerEntries.transactionId, id), eq(ledgerEntries.accountId, row.partnerAccountId)));
        await recalcAccountBalances(row.partnerAccountId);
      }

      if (row.mirroredEntryId) {
        await db
          .update(customerEntries)
          .set({
            date: row.date,
            debit: direction === "sent" ? row.amount : "0",
            credit: direction === "received" ? row.amount : "0",
          })
          .where(eq(customerEntries.id, row.mirroredEntryId));
        if (row.partyAccountId) {
          const [linked] = await db.select({ id: customers.id }).from(customers).where(eq(customers.accountId, row.partyAccountId));
          if (linked) await recalcBalances(linked.id);
        }
      }
    } catch (ledgerErr) {
      console.error("PATCH /payments/[id] ledger update failed, reverting:", ledgerErr);
      await db
        .update(transactions)
        .set({ date: before.date, amount: before.amount, note: before.note })
        .where(eq(transactions.id, id))
        .catch(() => {});
      if (before.partyAccountId) {
        await db
          .update(ledgerEntries)
          .set({
            date: before.date,
            debit: direction === "sent" ? before.amount : "0",
            credit: direction === "received" ? before.amount : "0",
          })
          .where(and(eq(ledgerEntries.transactionId, id), eq(ledgerEntries.accountId, before.partyAccountId)))
          .catch(() => {});
        await recalcAccountBalances(before.partyAccountId).catch(() => {});
      }
      if (before.partnerAccountId) {
        await db
          .update(ledgerEntries)
          .set({
            date: before.date,
            debit: direction === "received" ? before.amount : "0",
            credit: direction === "sent" ? before.amount : "0",
          })
          .where(and(eq(ledgerEntries.transactionId, id), eq(ledgerEntries.accountId, before.partnerAccountId)))
          .catch(() => {});
        await recalcAccountBalances(before.partnerAccountId).catch(() => {});
      }
      if (before.mirroredEntryId) {
        await db
          .update(customerEntries)
          .set({
            date: before.date,
            debit: direction === "sent" ? before.amount : "0",
            credit: direction === "received" ? before.amount : "0",
          })
          .where(eq(customerEntries.id, before.mirroredEntryId))
          .catch(() => {});
        if (before.partyAccountId) {
          const [linked] = await db.select({ id: customers.id }).from(customers).where(eq(customers.accountId, before.partyAccountId));
          if (linked) await recalcBalances(linked.id).catch(() => {});
        }
      }
      return NextResponse.json(
        { error: "Failed to update the linked ledger entries. The payment was not changed." },
        { status: 500 }
      );
    }

    return NextResponse.json(row);
  } catch (err) {
    console.error("PATCH /payments/[id] failed:", err);
    return NextResponse.json({ error: "Failed to update payment." }, { status: 500 });
  }
}
