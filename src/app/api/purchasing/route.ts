import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { purchasing } from "@/db/schema";
import { asc, desc, sql, ilike, and, gte, lte } from "drizzle-orm";
import { parseListParams } from "@/lib/pagination";
import { validateAmountEntry, hasErrors, firstError } from "@/lib/validation";

export const dynamic = "force-dynamic";

const SORT = { date: purchasing.date, amount: purchasing.amount } as const;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { search, page, limit, offset, sort, dir, from, to } = parseListParams(req, {
      sortable: Object.keys(SORT),
      defaultSort: "date",
    });
    const conditions = [
      search ? ilike(purchasing.detail, `%${search}%`) : undefined,
      from ? gte(purchasing.date, from) : undefined,
      to ? lte(purchasing.date, to) : undefined,
    ].filter((c) => c !== undefined);
    const where = conditions.length ? and(...conditions) : undefined;
    const col = SORT[sort as keyof typeof SORT];
    const order = dir === "asc" ? [asc(col), asc(purchasing.id)] : [desc(col), desc(purchasing.id)];

    const [rows, [{ total }], [{ count }]] = await Promise.all([
      db.select().from(purchasing).where(where).orderBy(...order).limit(limit).offset(offset),
      db.select({ total: sql<string>`COALESCE(SUM(amount),0)` }).from(purchasing).where(where),
      db.select({ count: sql<string>`COUNT(*)` }).from(purchasing).where(where),
    ]);

    return NextResponse.json({ rows, total: Number(total), count: Number(count), page, limit });
  } catch (err) {
    console.error("GET /purchasing failed:", err);
    return NextResponse.json({ error: "Failed to load purchasing." }, { status: 500 });
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
    const [row] = await db.insert(purchasing).values({ date, detail, amount: String(amount) }).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("POST /purchasing failed:", err);
    return NextResponse.json({ error: "Failed to add purchase." }, { status: 500 });
  }
}
