import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { salary } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [employees, accounts] = await Promise.all([
      db.select({ v: sql<string>`DISTINCT employee` }).from(salary).orderBy(sql`employee`),
      db.select({ v: sql<string>`DISTINCT account` }).from(salary).where(sql`account IS NOT NULL AND account <> ''`).orderBy(sql`account`),
    ]);
    return NextResponse.json({ employees: employees.map((e) => e.v), accounts: accounts.map((a) => a.v) });
  } catch (err) {
    console.error("GET /salary/employees failed:", err);
    return NextResponse.json({ error: "Failed to load options." }, { status: 500 });
  }
}
