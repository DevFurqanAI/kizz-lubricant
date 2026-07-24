import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { sales, customers, customerEntries } from "@/db/schema";
import { asc, desc, eq, sql, ilike, and, gte, lte } from "drizzle-orm";
import { parseListParams } from "@/lib/pagination";
import { recalcBalances } from "@/lib/ledger";
import { validateSale, hasErrors, firstError, deriveSaleKg } from "@/lib/validation";

export const dynamic = "force-dynamic";

const SORT = { date: sales.date, amount: sales.amount } as const;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { search, page, limit, offset, sort, dir, from, to, amountMin, amountMax } = parseListParams(req, {
      sortable: Object.keys(SORT),
      defaultSort: "date",
    });
    const customerIdParam = req.nextUrl.searchParams.get("customerId");
    const customerId = customerIdParam ? Number(customerIdParam) : null;
    const conditions = [
      search ? ilike(sales.detail, `%${search}%`) : undefined,
      from ? gte(sales.date, from) : undefined,
      to ? lte(sales.date, to) : undefined,
      amountMin != null ? gte(sales.amount, String(amountMin)) : undefined,
      amountMax != null ? lte(sales.amount, String(amountMax)) : undefined,
      customerId != null && Number.isFinite(customerId) ? eq(sales.customerId, customerId) : undefined,
    ].filter((c) => c !== undefined);
    const where = conditions.length ? and(...conditions) : undefined;
    const col = SORT[sort as keyof typeof SORT];
    const order = dir === "asc" ? [asc(col), asc(sales.id)] : [desc(col), desc(sales.id)];

    const [rows, [{ total, totalKg, totalL }], [{ count }]] = await Promise.all([
      db
        .select({
          id: sales.id,
          date: sales.date,
          detail: sales.detail,
          packing: sales.packing,
          unit: sales.unit,
          qty: sales.qty,
          rate: sales.rate,
          amount: sales.amount,
          saleKg: sales.saleKg,
          saleKgUnit: sales.saleKgUnit,
          customerId: sales.customerId,
          customerName: customers.name,
        })
        .from(sales)
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .where(where)
        .orderBy(...order)
        .limit(limit)
        .offset(offset),
      db
        .select({
          total: sql<string>`COALESCE(SUM(amount),0)`,
          totalKg: sql<string>`COALESCE(SUM(sale_kg) FILTER (WHERE sale_kg_unit = 'Kg'),0)`,
          totalL: sql<string>`COALESCE(SUM(sale_kg) FILTER (WHERE sale_kg_unit = 'L'),0)`,
        })
        .from(sales)
        .where(where),
      db.select({ count: sql<string>`COUNT(*)` }).from(sales).where(where),
    ]);

    return NextResponse.json({
      rows,
      total: Number(total),
      totalKg: Number(totalKg),
      totalL: Number(totalL),
      count: Number(count),
      page,
      limit,
    });
  } catch (err) {
    console.error("GET /sales failed:", err);
    return NextResponse.json({ error: "Failed to load sales." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { date, detail, packing, unit, qty, rate, amount, saleKg, saleKgUnit, customerId, paidNow, paidMethod, paidNote } = body;
    const errors = validateSale(body);
    if (hasErrors(errors)) {
      return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });
    }
    const custId = customerId ? Number(customerId) : null;
    const { saleKg: kg, saleKgUnit: kgUnit } = deriveSaleKg(saleKg, saleKgUnit);

    // On-spot payment: what the customer handed over at the time of sale. Only
    // meaningful against a real customer's ledger (a walk-in sale is cash by
    // definition), so it's ignored when no customer is picked.
    const paid = paidNow === null || paidNow === undefined || paidNow === "" ? 0 : Number(paidNow);
    if (!Number.isFinite(paid) || paid < 0) {
      return NextResponse.json({ error: "Amount paid now must be a positive number." }, { status: 400 });
    }

    const [row] = await db
      .insert(sales)
      .values({ date, detail, packing: num(packing), unit: num(unit), qty: num(qty), rate: num(rate), amount: String(amount), saleKg: kg, saleKgUnit: kgUnit, customerId: custId })
      .returning();

    // Automation: mirror the sale into the customer's ledger as a debit. This
    // is several separate statements (Neon's HTTP driver can't run interactive
    // transactions — see src/lib/ledger.ts) so if anything after the first
    // insert fails, best-effort compensate by deleting whatever ledger rows we
    // already created rather than leaving an orphan debit inflating the
    // customer's balance forever.
    if (custId) {
      const createdEntryIds: number[] = [];
      try {
        const [entry] = await db
          .insert(customerEntries)
          .values({
            customerId: custId,
            date,
            product: detail,
            packing: num(packing),
            unit: num(unit),
            qty: num(qty),
            rate: num(rate),
            debit: String(amount),
            credit: "0",
            balance: "0", // recalculated below
            account: "Sale",
          })
          .returning();
        createdEntryIds.push(entry.id);

        // On-spot payment: post the amount received as a standalone credit. It is
        // NOT linked to the sale — it's real money received, so it survives even
        // if the sale line is later edited or removed.
        if (paid > 0) {
          const acct = [paidMethod, paidNote]
            .map((s) => (typeof s === "string" ? s.trim() : ""))
            .filter(Boolean)
            .join(" · ");
          // No product line — an empty product is what marks a row as a payment
          // (matches the ledger render + Excel export detection).
          const [paymentEntry] = await db
            .insert(customerEntries)
            .values({
              customerId: custId,
              date,
              debit: "0",
              credit: String(paid),
              balance: "0", // recalculated below
              account: acct || null,
            })
            .returning();
          createdEntryIds.push(paymentEntry.id);
        }

        await recalcBalances(custId);
        await db.update(sales).set({ ledgerEntryId: entry.id }).where(eq(sales.id, row.id));
      } catch (innerErr) {
        console.error("POST /sales ledger mirroring failed, rolling back:", innerErr);
        for (const id of createdEntryIds) {
          await db.delete(customerEntries).where(eq(customerEntries.id, id)).catch(() => {});
        }
        await db.delete(sales).where(eq(sales.id, row.id)).catch(() => {});
        if (createdEntryIds.length) await recalcBalances(custId).catch(() => {});
        return NextResponse.json(
          { error: "Failed to record the sale against the customer's ledger. Nothing was saved — please try again." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("POST /sales failed:", err);
    return NextResponse.json({ error: "Failed to add sale." }, { status: 500 });
  }
}
