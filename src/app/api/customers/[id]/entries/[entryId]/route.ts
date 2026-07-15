import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { customerEntries } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

async function recalcBalances(customerId: number) {
  const entries = await db
    .select()
    .from(customerEntries)
    .where(eq(customerEntries.customerId, customerId))
    .orderBy(asc(customerEntries.date), asc(customerEntries.id));

  let running = 0;
  for (const entry of entries) {
    running = running + Number(entry.debit ?? 0) - Number(entry.credit ?? 0);
    await db
      .update(customerEntries)
      .set({ balance: String(running) })
      .where(eq(customerEntries.id, entry.id));
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; entryId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const customerId = Number(params.id);
  await db.delete(customerEntries).where(eq(customerEntries.id, Number(params.entryId)));
  await recalcBalances(customerId);

  const entries = await db
    .select()
    .from(customerEntries)
    .where(eq(customerEntries.customerId, customerId))
    .orderBy(asc(customerEntries.date), asc(customerEntries.id));

  return NextResponse.json(entries);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; entryId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const customerId = Number(params.id);
  const body = await req.json();

  await db.update(customerEntries).set(body).where(eq(customerEntries.id, Number(params.entryId)));
  await recalcBalances(customerId);

  const entries = await db
    .select()
    .from(customerEntries)
    .where(eq(customerEntries.customerId, customerId))
    .orderBy(asc(customerEntries.date), asc(customerEntries.id));

  return NextResponse.json(entries);
}
