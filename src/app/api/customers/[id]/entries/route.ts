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

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const customerId = Number(params.id);
    const body = await req.json();
    const { date, product, packing, unit, qty, rate, debit, credit, account } = body;

    const errors = validateLedgerEntry(body);
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });

    await db.insert(customerEntries).values({
      customerId,
      date,
      product: product ?? null,
      packing: packing ?? null,
      unit: unit ?? null,
      qty: num(qty),
      rate: num(rate),
      debit: String(Number(debit ?? 0)),
      credit: String(Number(credit ?? 0)),
      balance: "0", // recalculated below
      account: account ?? null,
    });

    await recalcBalances(customerId);

    const entries = await db
      .select()
      .from(customerEntries)
      .where(eq(customerEntries.customerId, customerId))
      .orderBy(asc(customerEntries.date), asc(customerEntries.id));

    return NextResponse.json(entries, { status: 201 });
  } catch (err) {
    console.error("POST /customers/[id]/entries failed:", err);
    return NextResponse.json({ error: "Failed to add ledger entry." }, { status: 500 });
  }
}
