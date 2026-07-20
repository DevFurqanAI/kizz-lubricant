

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { salary } from "@/db/schema";
import { asc, desc, sql, ilike, and, gte, lte } from "drizzle-orm";
import { parseListParams } from "@/lib/pagination";
import { validateSalary, hasErrors, firstError } from "@/lib/validation";

export const dynamic = "force-dynamic"; // ensures this route is never cached/stale

const SORT = { date: salary.date, amount: salary.amount, employee: salary.employee } as const;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { search, page, limit, offset, sort, dir, from, to } = parseListParams(req, {
      sortable: Object.keys(SORT),
      defaultSort: "date",
    });
    const conditions = [
      search ? ilike(salary.employee, `%${search}%`) : undefined,
      from ? gte(salary.date, from) : undefined,
      to ? lte(salary.date, to) : undefined,
    ].filter((c) => c !== undefined);
    const where = conditions.length ? and(...conditions) : undefined;
    const col = SORT[sort as keyof typeof SORT];
    const order = dir === "asc" ? [asc(col), asc(salary.id)] : [desc(col), desc(salary.id)];

    const [rows, [{ total }], [{ count }]] = await Promise.all([
      db.select().from(salary).where(where).orderBy(...order).limit(limit).offset(offset),
      db.select({ total: sql<string>`COALESCE(SUM(amount),0)` }).from(salary).where(where),
      db.select({ count: sql<string>`COUNT(*)` }).from(salary).where(where),
    ]);
    return NextResponse.json({ rows, total: Number(total), count: Number(count), page, limit });
  } catch (err) {
    console.error("GET /salary failed:", err);
    return NextResponse.json({ error: "Failed to fetch salary records" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { date, employee, amount, account } = body;
    const errors = validateSalary(body);
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });
    const [row] = await db.insert(salary).values({ date, employee, amount: String(amount), account: account ?? null }).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("POST /salary failed:", err);
    return NextResponse.json({ error: "Failed to save salary record" }, { status: 500 });
  }
}