import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { purchasing } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateAmountEntry, hasErrors, firstError, formatMoney } from "@/lib/validation";
import { parseIdParam } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseIdParam(params.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    await db.delete(purchasing).where(eq(purchasing.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /purchasing/[id] failed:", err);
    return NextResponse.json({ error: "Failed to delete purchase." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseIdParam(params.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    const b = await req.json();
    const errors = validateAmountEntry(b, "update");
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });
    const update: Record<string, unknown> = {};
    if ("date" in b) update.date = b.date;
    if ("detail" in b) update.detail = b.detail;
    if ("amount" in b) update.amount = formatMoney(b.amount);
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
    }
    const [row] = await db.update(purchasing).set(update).where(eq(purchasing.id, id)).returning();
    return NextResponse.json(row);
  } catch (err) {
    console.error("PATCH /purchasing/[id] failed:", err);
    return NextResponse.json({ error: "Failed to update purchase." }, { status: 500 });
  }
}
