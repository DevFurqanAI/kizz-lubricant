import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { sales, customerEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recalcBalances } from "@/lib/ledger";
import { validateSale, hasErrors, firstError } from "@/lib/validation";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = Number(params.id);
    const [existing] = await db
      .select({ customerId: sales.customerId, ledgerEntryId: sales.ledgerEntryId })
      .from(sales)
      .where(eq(sales.id, id));

    await db.delete(sales).where(eq(sales.id, id));

    // Automation: remove the mirrored ledger entry and re-balance that customer.
    if (existing?.ledgerEntryId) {
      await db.delete(customerEntries).where(eq(customerEntries.id, existing.ledgerEntryId));
      if (existing.customerId) await recalcBalances(existing.customerId);
    }

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

    const [row] = await db.update(sales).set(update).where(eq(sales.id, Number(params.id))).returning();

    // Automation: keep the mirrored ledger entry in step with the edited sale.
    if (row?.ledgerEntryId && row.customerId) {
      await db
        .update(customerEntries)
        .set({ date: row.date, product: row.detail, packing: row.packing, unit: row.unit, qty: row.qty, rate: row.rate, debit: row.amount })
        .where(eq(customerEntries.id, row.ledgerEntryId));
      await recalcBalances(row.customerId);
    }

    return NextResponse.json(row);
  } catch (err) {
    console.error("PATCH /sales/[id] failed:", err);
    return NextResponse.json({ error: "Failed to update sale." }, { status: 500 });
  }
}
