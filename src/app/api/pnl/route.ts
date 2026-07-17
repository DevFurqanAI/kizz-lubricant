import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";

type MonthBucket = {
  sales: number;
  purchasing: number;
  expenses: number;
  salary: number;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Group each table by YYYY-MM
  const [salesRows, purchRows, expRows, salRows] = await Promise.all([
    db.execute(sql`SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(amount) AS total FROM sales GROUP BY 1 ORDER BY 1`),
    db.execute(sql`SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(amount) AS total FROM purchasing GROUP BY 1 ORDER BY 1`),
    db.execute(sql`SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(amount) AS total FROM expenses GROUP BY 1 ORDER BY 1`),
    db.execute(sql`SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(amount) AS total FROM salary GROUP BY 1 ORDER BY 1`),
  ]);

  const months: Record<string, MonthBucket> = {};
  const ensure = (m: string) => {
    months[m] = months[m] ?? { sales: 0, purchasing: 0, expenses: 0, salary: 0 };
  };

  type Row = { month: string; total: string };

  for (const r of salesRows.rows as Row[]) { ensure(r.month); months[r.month].sales = Number(r.total); }
  for (const r of purchRows.rows as Row[]) { ensure(r.month); months[r.month].purchasing = Number(r.total); }
  for (const r of expRows.rows as Row[]) { ensure(r.month); months[r.month].expenses = Number(r.total); }
  for (const r of salRows.rows as Row[]) { ensure(r.month); months[r.month].salary = Number(r.total); }

  const keys = Object.keys(months).sort();
  const rows = keys.map((month) => {
    const m = months[month];
    const totalCost = m.purchasing + m.expenses + m.salary;
    const profit = m.sales - totalCost;
    const margin = m.sales > 0 ? (profit / m.sales) * 100 : 0;
    return { month, ...m, totalCost, profit, margin };
  });

  // Grand totals
  const grand = rows.reduce(
    (acc, r) => {
      acc.sales += r.sales;
      acc.purchasing += r.purchasing;
      acc.expenses += r.expenses;
      acc.salary += r.salary;
      acc.totalCost += r.totalCost;
      acc.profit += r.profit;
      return acc;
    },
    { sales: 0, purchasing: 0, expenses: 0, salary: 0, totalCost: 0, profit: 0 }
  );
  const grandMargin = grand.sales > 0 ? (grand.profit / grand.sales) * 100 : 0;

  return NextResponse.json({ rows, grand: { ...grand, margin: grandMargin } });
}
