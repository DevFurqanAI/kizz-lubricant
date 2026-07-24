import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { customers, accounts } from "@/db/schema";
import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";
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
    const rows = list.map((c) => ({ ...c, balance: balMap.get(c.id) ?? Number(c.openingBalance) }));
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

    let row;
    try {
      [row] = await db.insert(customers).values({
        name: body.name,
        accountTitle: body.accountTitle ?? null,
        owner: body.owner ?? null,
        openingBalance: String(Number(body.openingBalance ?? 0)),
        cnic: body.cnic ?? null,
        address: body.address ?? null,
        phone: body.phone ?? null,
        whatsapp: body.whatsapp ?? null,
        email: body.email ?? null,
      }).returning();
    } catch (insertErr: unknown) {
      const code = (insertErr as { code?: string })?.code;
      if (code === "23505") {
        return NextResponse.json(
          { error: "A customer with this name already exists.", fields: { name: "A customer with this name already exists." } },
          { status: 400 }
        );
      }
      throw insertErr;
    }

    // Re-link an orphaned party account left behind by a previously deleted
    // customer of the same name (customers.accountId is set-null on delete),
    // so their old payment history reappears instead of staying invisible.
    // "Unclaimed" = no *other* live customer already points at it.
    // The customer row above is already committed — a relink failure here
    // must not turn a successful creation into a false 500, so it's isolated
    // in its own try/catch and logged rather than propagated.
    try {
      const [orphan] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .leftJoin(customers, eq(customers.accountId, accounts.id))
        .where(and(eq(accounts.type, "party"), sql`lower(${accounts.name}) = lower(${row.name})`, isNull(customers.id)))
        .limit(1);
      if (orphan) {
        await db.update(customers).set({ accountId: orphan.id }).where(eq(customers.id, row.id));
        row.accountId = orphan.id;
      }
    } catch (relinkErr) {
      console.error("POST /customers orphan account relink failed (customer was still created):", relinkErr);
    }

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("POST /customers failed:", err);
    return NextResponse.json({ error: "Failed to add customer." }, { status: 500 });
  }
}
