import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { customerEntries } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { recalcBalances } from "@/lib/ledger";
import { validateLedgerEntry, hasErrors, firstError } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Coerce an optional numeric field to the DB's string|null shape. */
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

function entriesFor(customerId: number) {
  return db
    .select()
    .from(customerEntries)
    .where(eq(customerEntries.customerId, customerId))
    .orderBy(asc(customerEntries.date), asc(customerEntries.id));
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; entryId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const customerId = Number(params.id);
    await db.delete(customerEntries).where(eq(customerEntries.id, Number(params.entryId)));
    await recalcBalances(customerId);
    return NextResponse.json(await entriesFor(customerId));
  } catch (err) {
    console.error("DELETE /customers/[id]/entries/[entryId] failed:", err);
    return NextResponse.json({ error: "Failed to delete ledger entry." }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; entryId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const customerId = Number(params.id);
    const b = await req.json();

    const errors = validateLedgerEntry(b, "update");
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });

    // Whitelist editable columns only — never trust the raw body to set id,
    // customerId, balance or createdAt. balance is recomputed below regardless.
    await db
      .update(customerEntries)
      .set({
        date: b.date,
        product: b.product ?? null,
        packing: b.packing ?? null,
        unit: b.unit ?? null,
        qty: num(b.qty),
        rate: num(b.rate),
        debit: String(Number(b.debit ?? 0)),
        credit: String(Number(b.credit ?? 0)),
        account: b.account ?? null,
      })
      .where(eq(customerEntries.id, Number(params.entryId)));

    await recalcBalances(customerId);
    return NextResponse.json(await entriesFor(customerId));
  } catch (err) {
    console.error("PATCH /customers/[id]/entries/[entryId] failed:", err);
    return NextResponse.json({ error: "Failed to update ledger entry." }, { status: 500 });
  }
}
