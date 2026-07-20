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

type WideRow = { key: string; sales: string; purchasing: string; expenses: string; salary: string };

/** Reshape a {key, sales, purchasing, expenses, salary} row set into one daily array per category. */
function toDailyCategorySeries(rows: WideRow[]) {
  return {
    sales: rows.map((r) => ({ date: r.key, total: Number(r.sales) })),
    purchasing: rows.map((r) => ({ date: r.key, total: Number(r.purchasing) })),
    expenses: rows.map((r) => ({ date: r.key, total: Number(r.expenses) })),
    salary: rows.map((r) => ({ date: r.key, total: Number(r.salary) })),
  };
}

/** Reshape a {key, sales, purchasing, expenses, salary} row set into one monthly array per category. */
function toMonthlyCategorySeries(rows: WideRow[]) {
  return {
    sales: rows.map((r) => ({ month: r.key, total: Number(r.sales) })),
    purchasing: rows.map((r) => ({ month: r.key, total: Number(r.purchasing) })),
    expenses: rows.map((r) => ({ month: r.key, total: Number(r.expenses) })),
    salary: rows.map((r) => ({ month: r.key, total: Number(r.salary) })),
  };
}

/** Zero-filled daily totals for all four categories between two dates (inclusive). */
function dailySeries(fromSql: SQL, toSql: SQL) {
  return db.execute(sql`
    WITH days AS (
      SELECT generate_series(${fromSql}, ${toSql}, interval '1 day')::date AS day
    ),
    s AS (SELECT date, SUM(amount) AS total FROM sales GROUP BY date),
    p AS (SELECT date, SUM(amount) AS total FROM purchasing GROUP BY date),
    e AS (SELECT date, SUM(amount) AS total FROM expenses GROUP BY date),
    sa AS (SELECT date, SUM(amount) AS total FROM salary GROUP BY date)
    SELECT
      TO_CHAR(days.day, 'YYYY-MM-DD') AS key,
      COALESCE(s.total, 0) AS sales,
      COALESCE(p.total, 0) AS purchasing,
      COALESCE(e.total, 0) AS expenses,
      COALESCE(sa.total, 0) AS salary
    FROM days
    LEFT JOIN s ON s.date = days.day
    LEFT JOIN p ON p.date = days.day
    LEFT JOIN e ON e.date = days.day
    LEFT JOIN sa ON sa.date = days.day
    ORDER BY days.day
  `);
}

/** Sparse monthly totals for all four categories — one row per month any category has data in. */
function monthlySeries() {
  return db.execute(sql`
    WITH s AS (SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(amount) AS total FROM sales GROUP BY 1),
    p AS (SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(amount) AS total FROM purchasing GROUP BY 1),
    e AS (SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(amount) AS total FROM expenses GROUP BY 1),
    sa AS (SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(amount) AS total FROM salary GROUP BY 1),
    months AS (
      SELECT month FROM s
      UNION SELECT month FROM p
      UNION SELECT month FROM e
      UNION SELECT month FROM sa
    )
    SELECT
      months.month AS key,
      COALESCE(s.total, 0) AS sales,
      COALESCE(p.total, 0) AS purchasing,
      COALESCE(e.total, 0) AS expenses,
      COALESCE(sa.total, 0) AS salary
    FROM months
    LEFT JOIN s ON s.month = months.month
    LEFT JOIN p ON p.month = months.month
    LEFT JOIN e ON e.month = months.month
    LEFT JOIN sa ON sa.month = months.month
    ORDER BY months.month
  `);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const todayExpr = sql`(now() AT TIME ZONE 'Asia/Karachi')::date`;
    const monthStartExpr = sql`date_trunc('month', (now() AT TIME ZONE 'Asia/Karachi'))::date`;

    const [
      salesRes,
      purchRes,
      expRes,
      salRes,
      [{ customerCount }],
      outstandingRes,
      balancesRes,
      todayDailyRes,
      monthDailyRes,
      allMonthlyRes,
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
      dailySeries(sql`${todayExpr} - interval '13 days'`, todayExpr),
      dailySeries(monthStartExpr, todayExpr),
      monthlySeries(),
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
      sparklines: {
        today: toDailyCategorySeries(todayDailyRes.rows as WideRow[]),
        month: toDailyCategorySeries(monthDailyRes.rows as WideRow[]),
        all: toMonthlyCategorySeries(allMonthlyRes.rows as WideRow[]),
      },
    });
  } catch (err) {
    console.error("GET /dashboard-stats failed:", err);
    return NextResponse.json({ error: "Failed to load dashboard stats." }, { status: 500 });
  }
}
