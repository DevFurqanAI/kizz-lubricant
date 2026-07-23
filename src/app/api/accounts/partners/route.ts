import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Owner dropdown options for the Payments page (Mubashir, Naqi, …).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = await db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.type, "partner"))
      .orderBy(asc(accounts.name));
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /accounts/partners failed:", err);
    return NextResponse.json({ error: "Failed to load owners." }, { status: 500 });
  }
}
