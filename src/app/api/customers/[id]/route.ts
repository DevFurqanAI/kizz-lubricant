import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { customers, customerEntries } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(params.id);
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const entries = await db.select().from(customerEntries).where(eq(customerEntries.customerId, id)).orderBy(asc(customerEntries.date), asc(customerEntries.id));
  return NextResponse.json({ ...customer, entries });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const [row] = await db.update(customers).set(body).where(eq(customers.id, Number(params.id))).returning();
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await db.delete(customers).where(eq(customers.id, Number(params.id)));
  return NextResponse.json({ ok: true });
}
