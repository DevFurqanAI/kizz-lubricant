import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { ilike, or, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const search = req.nextUrl.searchParams.get("search") ?? "";

  // Two independent queries in parallel: the customer list, and each
  // customer's latest running balance in a single DISTINCT ON pass.
  // (Replaces the old client-side N+1 that fetched every ledger per customer.)
  const [list, balances] = await Promise.all([
    search
      ? db.select().from(customers).where(or(ilike(customers.name, `%${search}%`), ilike(customers.address, `%${search}%`)))
      : db.select().from(customers),
    db.execute(sql`
      SELECT DISTINCT ON (customer_id) customer_id, balance
      FROM customer_entries
      ORDER BY customer_id, date DESC, id DESC
    `),
  ]);

  const balMap = new Map(
    (balances.rows as Array<{ customer_id: number; balance: string }>).map((r) => [Number(r.customer_id), Number(r.balance)])
  );
  const rows = list.map((c) => ({ ...c, balance: balMap.get(c.id) ?? 0 }));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const [row] = await db.insert(customers).values({
    name: body.name,
    accountTitle: body.accountTitle ?? null,
    owner: body.owner ?? null,
    cnic: body.cnic ?? null,
    address: body.address ?? null,
    phone: body.phone ?? null,
    whatsapp: body.whatsapp ?? null,
    email: body.email ?? null,
  }).returning();
  return NextResponse.json(row, { status: 201 });
}
