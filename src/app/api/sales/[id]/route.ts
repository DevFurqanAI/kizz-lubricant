import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { sales, customerEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recalcBalances } from "@/lib/ledger";
import { validateSale, hasErrors, firstError } from "@/lib/validation";
import { parseIdParam } from "@/lib/pagination";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseIdParam(params.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    const [existing] = await db
      .select({ customerId: sales.customerId, ledgerEntryId: sales.ledgerEntryId })
      .from(sales)
      .where(eq(sales.id, id));

    // Delete the mirrored ledger row first, then the sale itself — if the
    // second delete fails, we've at least removed the debit that would
    // otherwise inflate the customer's balance forever (the sale row lingers
    // instead, which is recoverable: the user retries the delete).
    try {
      if (existing?.ledgerEntryId) {
        await db.delete(customerEntries).where(eq(customerEntries.id, existing.ledgerEntryId));
      }
      await db.delete(sales).where(eq(sales.id, id));
    } catch (innerErr) {
      console.error("DELETE /sales/[id] partial failure, recalculating anyway:", innerErr);
      if (existing?.customerId) await recalcBalances(existing.customerId).catch(() => {});
      return NextResponse.json({ error: "Failed to delete the sale. Please try again." }, { status: 500 });
    }

    if (existing?.customerId) await recalcBalances(existing.customerId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /sales/[id] failed:", err);
    return NextResponse.json({ error: "Failed to delete sale." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseIdParam(params.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    const b = await req.json();
    const errors = validateSale(b, "update");
    if (hasErrors(errors)) {
      return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });
    }
    const update: Record<string, unknown> = {};
    if ("date" in b) update.date = b.date;
    if ("detail" in b) update.detail = b.detail;
    if ("packing" in b) update.packing = num(b.packing);
    if ("unit" in b) update.unit = num(b.unit);
    if ("qty" in b) update.qty = num(b.qty);
    if ("rate" in b) update.rate = num(b.rate);
    if ("amount" in b) update.amount = String(Number(b.amount));
    if ("saleKg" in b) {
      update.saleKg = num(b.saleKg);
      // Keep the unit consistent with the value: set when there's a weight, clear otherwise.
      update.saleKgUnit = update.saleKg ? (b.saleKgUnit ? String(b.saleKgUnit) : "Kg") : null;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
    }

    const [before] = await db.select().from(sales).where(eq(sales.id, id));
    const [row] = await db.update(sales).set(update).where(eq(sales.id, id)).returning();

    // Automation: keep the mirrored ledger entry in step with the edited sale.
    // If this fails, revert BOTH the mirror row and the sale edit rather than
    // leave the sale and its ledger mirror out of sync — same
    // compensate-on-failure idiom as POST. Capturing beforeEntry lets us
    // revert the mirror too if it's recalcBalances (not the mirror write
    // itself) that throws, which would otherwise still leave the two diverged.
    if (row?.ledgerEntryId && row.customerId) {
      const [beforeEntry] = await db.select().from(customerEntries).where(eq(customerEntries.id, row.ledgerEntryId));
      try {
        await db
          .update(customerEntries)
          .set({ date: row.date, product: row.detail, packing: row.packing, unit: row.unit, qty: row.qty, rate: row.rate, debit: row.amount })
          .where(eq(customerEntries.id, row.ledgerEntryId));
        await recalcBalances(row.customerId);
      } catch (mirrorErr) {
        console.error("PATCH /sales/[id] ledger mirror update failed, reverting sale edit:", mirrorErr);
        if (beforeEntry) {
          await db
            .update(customerEntries)
            .set({ date: beforeEntry.date, product: beforeEntry.product, packing: beforeEntry.packing, unit: beforeEntry.unit, qty: beforeEntry.qty, rate: beforeEntry.rate, debit: beforeEntry.debit })
            .where(eq(customerEntries.id, row.ledgerEntryId))
            .catch(() => {});
        }
        if (before) {
          await db
            .update(sales)
            .set({ date: before.date, detail: before.detail, packing: before.packing, unit: before.unit, qty: before.qty, rate: before.rate, amount: before.amount, saleKg: before.saleKg, saleKgUnit: before.saleKgUnit })
            .where(eq(sales.id, id))
            .catch(() => {});
        }
        await recalcBalances(row.customerId).catch(() => {});
        return NextResponse.json(
          { error: "Failed to update the linked ledger entry. The sale was not changed." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(row);
  } catch (err) {
    console.error("PATCH /sales/[id] failed:", err);
    return NextResponse.json({ error: "Failed to update sale." }, { status: 500 });
  }
}
