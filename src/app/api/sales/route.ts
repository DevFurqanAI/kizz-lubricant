import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { sales, customers, customerEntries } from "@/db/schema";
import { asc, desc, eq, sql, ilike } from "drizzle-orm";
import { parseListParams } from "@/lib/pagination";
import { recalcBalances } from "@/lib/ledger";

export const dynamic = "force-dynamic";

const SORT = { date: sales.date, amount: sales.amount } as const;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { search, page, limit, offset, sort, dir } = parseListParams(req, {
      sortable: Object.keys(SORT),
      defaultSort: "date",
    });
    const where = search ? ilike(sales.detail, `%${search}%`) : undefined;
    const col = SORT[sort as keyof typeof SORT];
    const order = dir === "asc" ? [asc(col), asc(sales.id)] : [desc(col), desc(sales.id)];

    const [rows, [{ total }], [{ count }]] = await Promise.all([
      db
        .select({
          id: sales.id,
          date: sales.date,
          detail: sales.detail,
          qty: sales.qty,
          rate: sales.rate,
          amount: sales.amount,
          customerId: sales.customerId,
          customerName: customers.name,
        })
        .from(sales)
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .where(where)
        .orderBy(...order)
        .limit(limit)
        .offset(offset),
      db.select({ total: sql<string>`COALESCE(SUM(amount),0)` }).from(sales).where(where),
      db.select({ count: sql<string>`COUNT(*)` }).from(sales).where(where),
    ]);

    return NextResponse.json({ rows, total: Number(total), count: Number(count), page, limit });
  } catch (err) {
    console.error("GET /sales failed:", err);
    return NextResponse.json({ error: "Failed to load sales." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { date, detail, qty, rate, amount, customerId } = await req.json();
    if (!date || !detail || amount === undefined) {
      return NextResponse.json({ error: "date, detail and amount are required" }, { status: 400 });
    }
    const custId = customerId ? Number(customerId) : null;

    const [row] = await db
      .insert(sales)
      .values({ date, detail, qty: num(qty), rate: num(rate), amount: String(amount), customerId: custId })
      .returning();

    // Automation: mirror the sale into the customer's ledger as a debit.
    if (custId) {
      const [entry] = await db
        .insert(customerEntries)
        .values({
          customerId: custId,
          date,
          product: detail,
          qty: num(qty),
          rate: num(rate),
          debit: String(amount),
          credit: "0",
          balance: "0", // recalculated below
          account: "Sale",
        })
        .returning();
      await recalcBalances(custId);
      await db.update(sales).set({ ledgerEntryId: entry.id }).where(eq(sales.id, row.id));
    }

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("POST /sales failed:", err);
    return NextResponse.json({ error: "Failed to add sale." }, { status: 500 });
  }
}
