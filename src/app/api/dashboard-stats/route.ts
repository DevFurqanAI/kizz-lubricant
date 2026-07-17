import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { sales, purchasing, expenses, salary, customers } from "@/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    [{ totalSales }],
    [{ totalPurch }],
    [{ totalExp }],
    [{ totalSal }],
    [{ customerCount }],
  ] = await Promise.all([
    db.select({ totalSales: sql<string>`COALESCE(SUM(amount),0)` }).from(sales),
    db.select({ totalPurch: sql<string>`COALESCE(SUM(amount),0)` }).from(purchasing),
    db.select({ totalExp: sql<string>`COALESCE(SUM(amount),0)` }).from(expenses),
    db.select({ totalSal: sql<string>`COALESCE(SUM(amount),0)` }).from(salary),
    db.select({ customerCount: sql<string>`COUNT(*)` }).from(customers),
  ]);

  // Outstanding: latest balance per customer
  const latestBalances = await db.execute(sql`
    SELECT COALESCE(SUM(latest_bal), 0) AS total_outstanding
    FROM (
      SELECT DISTINCT ON (customer_id) balance AS latest_bal
      FROM customer_entries
      ORDER BY customer_id, date DESC, id DESC
    ) sub
  `);

  const totalOutstanding = Number((latestBalances.rows[0] as Record<string, string>).total_outstanding ?? 0);

  return NextResponse.json({
    totalSales: Number(totalSales),
    totalPurchasing: Number(totalPurch),
    totalExpenses: Number(totalExp),
    totalSalary: Number(totalSal),
    totalOutstanding,
    customerCount: Number(customerCount),
  });
}
