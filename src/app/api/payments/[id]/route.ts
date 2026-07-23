import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { transactions, customerEntries, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recalcAccountBalances } from "@/lib/party-ledger";
import { recalcBalances } from "@/lib/ledger";
import { parseIdParam } from "@/lib/pagination";

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
