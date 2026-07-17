import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { sales, purchasing, expenses, salary, customers } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Every read fires in one parallel batch so total latency is one round-trip,
  // not seven in series.
  const [
    [{ totalSales }],
    [{ totalPurch }],
    [{ totalExp }],
    [{ totalSal }],
    [{ customerCount }],
    outstandingRes,
    balancesRes,
  ] = await Promise.all([
    db.select({ totalSales: sql<string>`COALESCE(SUM(amount),0)` }).from(sales),
    db.select({ totalPurch: sql<string>`COALESCE(SUM(amount),0)` }).from(purchasing),
    db.select({ totalExp: sql<string>`COALESCE(SUM(amount),0)` }).from(expenses),
    db.select({ totalSal: sql<string>`COALESCE(SUM(amount),0)` }).from(salary),
    db.select({ customerCount: sql<string>`COUNT(*)` }).from(customers),
    db.execute(sql`
      SELECT COALESCE(SUM(latest_bal), 0) AS total_outstanding
      FROM (
        SELECT DISTINCT ON (customer_id) balance AS latest_bal
        FROM customer_entries
        ORDER BY customer_id, date DESC, id DESC
      ) sub
    `),
    db.execute(sql`
      SELECT c.id, c.name, c.address, c.phone,
        (SELECT balance FROM customer_entries ce WHERE ce.customer_id = c.id ORDER BY date DESC, id DESC LIMIT 1) AS balance
      FROM customers c
      ORDER BY ABS(COALESCE((SELECT balance FROM customer_entries ce WHERE ce.customer_id = c.id ORDER BY date DESC, id DESC LIMIT 1),0)) DESC NULLS LAST
      LIMIT 10
    `),
  ]);

  const outstanding = Number((outstandingRes.rows[0] as Record<string, string>).total_outstanding ?? 0);

  return NextResponse.json({
    stats: {
      totalSales: Number(totalSales),
      totalPurchasing: Number(totalPurch),
      totalExpenses: Number(totalExp),
      totalSalary: Number(totalSal),
      outstanding,
      custCount: Number(customerCount),
    },
    topBalances: balancesRes.rows,
  });
}
