import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { purchasing } from "@/db/schema";
import { desc, sql, ilike } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const rows = search
    ? await db.select().from(purchasing).where(ilike(purchasing.detail, `%${search}%`)).orderBy(desc(purchasing.date), desc(purchasing.id))
    : await db.select().from(purchasing).orderBy(desc(purchasing.date), desc(purchasing.id));
  const [{ total }] = await db.select({ total: sql<string>`COALESCE(SUM(amount),0)` }).from(purchasing);
  return NextResponse.json({ rows, total: Number(total) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { date, detail, amount } = await req.json();
  if (!date || !detail || amount === undefined) return NextResponse.json({ error: "date, detail and amount required" }, { status: 400 });
  const [row] = await db.insert(purchasing).values({ date, detail, amount: String(amount) }).returning();
  return NextResponse.json(row, { status: 201 });
}
