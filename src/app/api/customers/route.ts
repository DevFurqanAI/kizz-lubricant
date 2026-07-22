import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { asc, ilike, or, sql } from "drizzle-orm";
import { parseListParams } from "@/lib/pagination";
import { validateCustomer, hasErrors, firstError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { search, page, limit, offset } = parseListParams(req, {
      sortable: ["name"],
      defaultSort: "name",
    });
    const where = search
      ? or(ilike(customers.name, `%${search}%`), ilike(customers.address, `%${search}%`))
      : undefined;

    // A page of customers and the total matching count, in parallel.
    const [list, [{ count }]] = await Promise.all([
      db.select().from(customers).where(where).orderBy(asc(customers.name), asc(customers.id)).limit(limit).offset(offset),
      db.select({ count: sql<string>`COUNT(*)` }).from(customers).where(where),
    ]);

    // Latest running balance per customer, scoped to just this page's ids —
    // computing it for every customer in the table on every list request
    // doesn't scale with total ledger size.
    const ids = list.map((c) => c.id);
    const balances = ids.length
      ? await db.execute(sql`
          SELECT DISTINCT ON (customer_id) customer_id, balance
          FROM customer_entries
          WHERE customer_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
          ORDER BY customer_id, date DESC, id DESC
        `)
      : { rows: [] as unknown[] };

    const balMap = new Map(
      (balances.rows as Array<{ customer_id: number; balance: string }>).map((r) => [Number(r.customer_id), Number(r.balance)])
    );
    const rows = list.map((c) => ({ ...c, balance: balMap.get(c.id) ?? 0 }));
    return NextResponse.json({ rows, count: Number(count), page, limit });
  } catch (err) {
    console.error("GET /customers failed:", err);
    return NextResponse.json({ error: "Failed to load customers." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const errors = validateCustomer(body);
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });
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
  } catch (err) {
    console.error("POST /customers failed:", err);
    return NextResponse.json({ error: "Failed to add customer." }, { status: 500 });
  }
}
