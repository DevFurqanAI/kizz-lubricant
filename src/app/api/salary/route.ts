

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { salary } from "@/db/schema";
import { desc, sql, ilike } from "drizzle-orm";

export const dynamic = "force-dynamic"; // ensures this route is never cached/stale

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const search = req.nextUrl.searchParams.get("search") ?? "";
    const rows = search
      ? await db.select().from(salary).where(ilike(salary.employee, `%${search}%`)).orderBy(desc(salary.date), desc(salary.id))
      : await db.select().from(salary).orderBy(desc(salary.date), desc(salary.id));
    const [{ total }] = await db.select({ total: sql<string>`COALESCE(SUM(amount),0)` }).from(salary);
    return NextResponse.json({ rows, total: Number(total) });
  } catch (err) {
    console.error("GET /salary failed:", err);
    return NextResponse.json({ error: "Failed to fetch salary records" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { date, employee, amount, account } = await req.json();
    if (!date || !employee || amount === undefined)
      return NextResponse.json({ error: "date, employee and amount required" }, { status: 400 });
    const [row] = await db.insert(salary).values({ date, employee, amount: String(amount), account: account ?? null }).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("POST /salary failed:", err);
    return NextResponse.json({ error: "Failed to save salary record" }, { status: 500 });
  }
}