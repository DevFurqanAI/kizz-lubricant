import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { accounts, customers } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Datalist suggestions for the Party field: every Customer name plus every
// existing supplier/vendor `accounts` party that isn't a Customer.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [customerRows, partyRows] = await Promise.all([
      db.select({ name: customers.name }).from(customers),
      db.select({ name: accounts.name }).from(accounts).where(eq(accounts.type, "party")),
    ]);
    const names = Array.from(new Set([...customerRows, ...partyRows].map((r) => r.name))).sort((a, b) =>
      a.localeCompare(b),
    );
    return NextResponse.json(names);
  } catch (err) {
    console.error("GET /accounts/parties failed:", err);
    return NextResponse.json({ error: "Failed to load parties." }, { status: 500 });
  }
}
