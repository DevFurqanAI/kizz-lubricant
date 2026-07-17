import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { sales, purchasing, expenses, salary, customers } from "@/db/schema";
import { sql, type SQL } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Sum a money table across three time windows in one pass. "Today" and "this
// month" are anchored to Asia/Karachi so they match the owner's local day,
// not the server's UTC day.
function periodSums(table: SQL | object) {
  return db.execute(sql`
    SELECT
      COALESCE(SUM(amount), 0) AS t_all,
      COALESCE(SUM(amount) FILTER (WHERE date = (now() AT TIME ZONE 'Asia/Karachi')::date), 0) AS t_today,
      COALESCE(SUM(amount) FILTER (WHERE date >= date_trunc('month', (now() AT TIME ZONE 'Asia/Karachi'))::date), 0) AS t_month
    FROM ${table}
  `);
}

const toPeriod = (res: { rows: Record<string, unknown>[] }) => {
  const r = res.rows[0];
  return { all: Number(r.t_all), today: Number(r.t_today), month: Number(r.t_month) };
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // One parallel batch: period sums for each flow, current-state balances, and the trend series.
    const [
      salesRes,
      purchRes,
      expRes,
      salRes,
      [{ customerCount }],
      outstandingRes,
      balancesRes,
      monthlyRes,
    ] = await Promise.all([
      periodSums(sales),
      periodSums(purchasing),
      periodSums(expenses),
      periodSums(salary),
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
      db.execute(sql`
        SELECT TO_CHAR(date, 'YYYY-MM') AS month, COALESCE(SUM(amount), 0) AS total
        FROM sales GROUP BY 1 ORDER BY 1
      `),
    ]);

    const outstanding = Number((outstandingRes.rows[0] as Record<string, string>).total_outstanding ?? 0);

    return NextResponse.json({
      stats: {
        sales: toPeriod(salesRes),
        purchasing: toPeriod(purchRes),
        expenses: toPeriod(expRes),
        salary: toPeriod(salRes),
        outstanding,
        custCount: Number(customerCount),
      },
      topBalances: balancesRes.rows,
      monthlySales: monthlyRes.rows,
    });
  } catch (err) {
    console.error("GET /dashboard-stats failed:", err);
    return NextResponse.json({ error: "Failed to load dashboard stats." }, { status: 500 });
  }
}
