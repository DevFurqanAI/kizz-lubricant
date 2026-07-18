import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { asc, desc, sql, ilike } from "drizzle-orm";
import { parseListParams } from "@/lib/pagination";
import { validateAmountEntry, hasErrors, firstError } from "@/lib/validation";

export const dynamic = "force-dynamic";

const SORT = { date: expenses.date, amount: expenses.amount } as const;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { search, page, limit, offset, sort, dir } = parseListParams(req, {
      sortable: Object.keys(SORT),
      defaultSort: "date",
    });
    const where = search ? ilike(expenses.detail, `%${search}%`) : undefined;
    const col = SORT[sort as keyof typeof SORT];
    const order = dir === "asc" ? [asc(col), asc(expenses.id)] : [desc(col), desc(expenses.id)];

    const [rows, [{ total, months }], [{ count }]] = await Promise.all([
      db.select().from(expenses).where(where).orderBy(...order).limit(limit).offset(offset),
      db
        .select({
          total: sql<string>`COALESCE(SUM(amount),0)`,
          // Distinct calendar months with any expense — the denominator for Average / month.
          months: sql<string>`COUNT(DISTINCT TO_CHAR(date, 'YYYY-MM'))`,
        })
        .from(expenses)
        .where(where),
      db.select({ count: sql<string>`COUNT(*)` }).from(expenses).where(where),
    ]);

    return NextResponse.json({ rows, total: Number(total), months: Number(months), count: Number(count), page, limit });
  } catch (err) {
    console.error("GET /expenses failed:", err);
    return NextResponse.json({ error: "Failed to load expenses." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { date, detail, amount } = body;
    const errors = validateAmountEntry(body);
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });
    const [row] = await db.insert(expenses).values({ date, detail, amount: String(amount) }).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("POST /expenses failed:", err);
    return NextResponse.json({ error: "Failed to add expense." }, { status: 500 });
  }
}
