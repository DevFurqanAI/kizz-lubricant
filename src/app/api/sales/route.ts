import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { desc, sql, ilike } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const search = req.nextUrl.searchParams.get("search") ?? "";
  const [rows, [{ total }]] = await Promise.all([
    search
      ? db.select().from(sales).where(ilike(sales.detail, `%${search}%`)).orderBy(desc(sales.date), desc(sales.id))
      : db.select().from(sales).orderBy(desc(sales.date), desc(sales.id)),
    db.select({ total: sql<string>`COALESCE(SUM(amount),0)` }).from(sales),
  ]);

  return NextResponse.json({ rows, total: Number(total) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { date, detail, qty, rate, amount } = body;
  if (!date || !detail || amount === undefined) {
    return NextResponse.json({ error: "date, detail and amount are required" }, { status: 400 });
  }

  const [row] = await db
    .insert(sales)
    .values({ date, detail, qty: qty || null, rate: rate || null, amount: String(amount) })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
