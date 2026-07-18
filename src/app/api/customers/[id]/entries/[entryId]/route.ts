import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { customerEntries, sales } from "@/db/schema";
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
    const entryId = Number(params.entryId);

    // Two-way sync: if this ledger row is the mirror of a sale, deleting it
    // deletes the originating sale too, so the two tables stay consistent.
    // (Capture the sale first — deleting the entry NULLs sales.ledgerEntryId.)
    const [backingSale] = await db
      .select({ id: sales.id })
      .from(sales)
      .where(eq(sales.ledgerEntryId, entryId));

    await db.delete(customerEntries).where(eq(customerEntries.id, entryId));
    if (backingSale) await db.delete(sales).where(eq(sales.id, backingSale.id));

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

    const entryId = Number(params.entryId);
    const debit = Number(b.debit ?? 0);
    const detail = typeof b.product === "string" ? b.product.trim() : "";

    // Two-way sync: does this ledger row mirror a sale?
    const [backingSale] = await db
      .select({ id: sales.id })
      .from(sales)
      .where(eq(sales.ledgerEntryId, entryId));

    // A sale-backed entry must stay a valid sale. A sale needs a non-empty
    // `detail` and a positive `amount` (= the debit). If the edit would break
    // either, reject it and point the user at the Sales screen — editing here
    // must not silently corrupt or orphan the linked sale.
    if (backingSale && (!detail || debit <= 0)) {
      return NextResponse.json(
        {
          error:
            "This entry is linked to a sale. Keep a product/detail and a positive debit, " +
            "or edit it from the Sales screen instead.",
        },
        { status: 400 }
      );
    }

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
        debit: String(debit),
        credit: String(Number(b.credit ?? 0)),
        account: b.account ?? null,
      })
      .where(eq(customerEntries.id, entryId));

    // Mirror the change back onto the linked sale so both tables agree.
    if (backingSale) {
      await db
        .update(sales)
        .set({
          date: b.date,
          detail,
          packing: b.packing ?? null,
          unit: b.unit ?? null,
          qty: num(b.qty),
          rate: num(b.rate),
          amount: String(debit),
        })
        .where(eq(sales.id, backingSale.id));
    }

    await recalcBalances(customerId);
    return NextResponse.json(await entriesFor(customerId));
  } catch (err) {
    console.error("PATCH /customers/[id]/entries/[entryId] failed:", err);
    return NextResponse.json({ error: "Failed to update ledger entry." }, { status: 500 });
  }
}
