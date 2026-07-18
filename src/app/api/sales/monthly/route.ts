import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Sales rolled up by calendar month — the "Total sale Money" per block the
// owner keeps in the spreadsheet, but computed across ALL sales (not per page).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await db.execute(sql`
      SELECT
        TO_CHAR(date, 'YYYY-MM') AS month,
        COUNT(*) AS count,
        COALESCE(SUM(amount), 0) AS total,
        COALESCE(SUM(sale_kg) FILTER (WHERE sale_kg_unit = 'Kg'), 0) AS total_kg,
        COALESCE(SUM(sale_kg) FILTER (WHERE sale_kg_unit = 'L'), 0) AS total_l
      FROM sales
      GROUP BY 1
      ORDER BY 1 DESC
    `);

    const rows = (res.rows as Record<string, string>[]).map((r) => ({
      month: r.month,
      count: Number(r.count),
      total: Number(r.total),
      totalKg: Number(r.total_kg),
      totalL: Number(r.total_l),
    }));

    return NextResponse.json({ rows });
  } catch (err) {
    console.error("GET /sales/monthly failed:", err);
    return NextResponse.json({ error: "Failed to load monthly sales." }, { status: 500 });
  }
}
