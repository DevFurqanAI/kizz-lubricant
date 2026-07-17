import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Minimal id+name list for pickers (e.g. the sale → customer selector).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .orderBy(asc(customers.name));
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /customers/options failed:", err);
    return NextResponse.json({ error: "Failed to load customers." }, { status: 500 });
  }
}
