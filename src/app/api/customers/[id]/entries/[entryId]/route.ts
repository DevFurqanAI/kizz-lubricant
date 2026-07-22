import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { customerEntries, sales } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { recalcBalances } from "@/lib/ledger";
import { validateLedgerEntry, hasErrors, firstError } from "@/lib/validation";
import { parseIdParam } from "@/lib/pagination";

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
    const customerId = parseIdParam(params.id);
    const entryId = parseIdParam(params.entryId);
    if (customerId === null || entryId === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

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
    const customerId = parseIdParam(params.id);
    const entryId = parseIdParam(params.entryId);
    if (customerId === null || entryId === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    const b = await req.json();

    const errors = validateLedgerEntry(b, "update");
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });

    // Two-way sync: does this ledger row mirror a sale?
    const [backingSale] = await db
      .select({ id: sales.id })
      .from(sales)
      .where(eq(sales.ledgerEntryId, entryId));

    // Merge onto the existing row so fields the caller didn't send are left
    // untouched instead of being silently zeroed/nulled — this is a partial
    // update (mode: "update" in validateLedgerEntry only checks present keys,
    // so the write must honor that same partial-update contract).
    const [existing] = await db.select().from(customerEntries).where(eq(customerEntries.id, entryId));
    if (!existing) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

    const debit = "debit" in b ? Number(b.debit ?? 0) : Number(existing.debit ?? 0);
    const detail =
      "product" in b ? (typeof b.product === "string" ? b.product.trim() : "") : (existing.product ?? "").trim();

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

    // Whitelist editable columns AND only include keys actually present in the
    // body — never trust the raw body to set id, customerId, balance or
    // createdAt, and never overwrite a field the caller didn't send.
    const update: Record<string, unknown> = {};
    if ("date" in b) update.date = b.date;
    if ("product" in b) update.product = b.product ?? null;
    if ("packing" in b) update.packing = b.packing ?? null;
    if ("unit" in b) update.unit = b.unit ?? null;
    if ("qty" in b) update.qty = num(b.qty);
    if ("rate" in b) update.rate = num(b.rate);
    if ("debit" in b) update.debit = String(debit);
    if ("credit" in b) update.credit = String(Number(b.credit ?? 0));
    if ("account" in b) update.account = b.account ?? null;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
    }

    await db.update(customerEntries).set(update).where(eq(customerEntries.id, entryId));

    // Mirror the change back onto the linked sale so both tables agree.
    if (backingSale) {
      const saleUpdate: Record<string, unknown> = {};
      if ("date" in b) saleUpdate.date = b.date;
      if ("product" in b) saleUpdate.detail = detail;
      if ("packing" in b) saleUpdate.packing = b.packing ?? null;
      if ("unit" in b) saleUpdate.unit = b.unit ?? null;
      if ("qty" in b) saleUpdate.qty = num(b.qty);
      if ("rate" in b) saleUpdate.rate = num(b.rate);
      if ("debit" in b) saleUpdate.amount = String(debit);
      if (Object.keys(saleUpdate).length > 0) {
        await db.update(sales).set(saleUpdate).where(eq(sales.id, backingSale.id));
      }
    }

    await recalcBalances(customerId);
    return NextResponse.json(await entriesFor(customerId));
  } catch (err) {
    console.error("PATCH /customers/[id]/entries/[entryId] failed:", err);
    return NextResponse.json({ error: "Failed to update ledger entry." }, { status: 500 });
  }
}
