import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { customers, customerEntries } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { validateCustomer, hasErrors, firstError } from "@/lib/validation";

export const dynamic = "force-dynamic";

// Only these columns may be edited via PATCH — never id / createdAt / raw body.
const EDITABLE = ["name", "accountTitle", "owner", "cnic", "address", "phone", "whatsapp", "email"] as const;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = Number(params.id);
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const entries = await db
      .select()
      .from(customerEntries)
      .where(eq(customerEntries.customerId, id))
      .orderBy(asc(customerEntries.date), asc(customerEntries.id));
    return NextResponse.json({ ...customer, entries });
  } catch (err) {
    console.error("GET /customers/[id] failed:", err);
    return NextResponse.json({ error: "Failed to load customer." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const errors = validateCustomer(body, "update");
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });
    const update: Record<string, unknown> = {};
    for (const k of EDITABLE) if (k in body) update[k] = body[k] ?? null;
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
    }
    const [row] = await db.update(customers).set(update).where(eq(customers.id, Number(params.id))).returning();
    return NextResponse.json(row);
  } catch (err) {
    console.error("PATCH /customers/[id] failed:", err);
    return NextResponse.json({ error: "Failed to update customer." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await db.delete(customers).where(eq(customers.id, Number(params.id)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /customers/[id] failed:", err);
    return NextResponse.json({ error: "Failed to delete customer." }, { status: 500 });
  }
}
