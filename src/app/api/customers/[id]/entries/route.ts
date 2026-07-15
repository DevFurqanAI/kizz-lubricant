import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { customerEntries } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

/**
 * Recalculates running balance for ALL entries of a customer
 * in date + id order (oldest first).
 *
 * Balance logic (same as the original Excel ledger):
 *   balance[0] = -debit[0] + credit[0]
 *   balance[n] = balance[n-1] - debit[n] + credit[n]
 *
 * Positive balance  → customer owes us money
 * Negative balance  → we owe customer (advance payment)
 *
 * This matches the Kamar Multan sheet: debits create negative balance
 * (Rs –330,000) meaning "we delivered goods so customer owes us",
 * and credits flip it toward zero / positive.
 */
async function recalcBalances(customerId: number) {
  const entries = await db
    .select()
    .from(customerEntries)
    .where(eq(customerEntries.customerId, customerId))
    .orderBy(asc(customerEntries.date), asc(customerEntries.id));

  let running = 0;
  for (const entry of entries) {
    running = running + Number(entry.debit ?? 0) - Number(entry.credit ?? 0);
    await db
      .update(customerEntries)
      .set({ balance: String(running) })
      .where(eq(customerEntries.id, entry.id));
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const customerId = Number(params.id);
  const body = await req.json();
  const { date, product, packing, unit, qty, rate, debit, credit, account } = body;

  if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });

  const debitVal = Number(debit ?? 0);
  const creditVal = Number(credit ?? 0);

  await db.insert(customerEntries).values({
    customerId,
    date,
    product: product ?? null,
    packing: packing ?? null,
    unit: unit ?? null,
    qty: qty ? String(qty) : null,
    rate: rate ? String(rate) : null,
    debit: String(debitVal),
    credit: String(creditVal),
    balance: "0", // will be recalculated below
    account: account ?? null,
  });

  await recalcBalances(customerId);

  // Return all entries with fresh balances
  const entries = await db
    .select()
    .from(customerEntries)
    .where(eq(customerEntries.customerId, customerId))
    .orderBy(asc(customerEntries.date), asc(customerEntries.id));

  return NextResponse.json(entries, { status: 201 });
}
