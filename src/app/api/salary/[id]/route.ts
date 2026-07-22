import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { salary } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateSalary, hasErrors, firstError } from "@/lib/validation";
import { parseIdParam } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseIdParam(params.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    await db.delete(salary).where(eq(salary.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /salary/[id] failed:", err);
    return NextResponse.json({ error: "Failed to delete salary record." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseIdParam(params.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    const b = await req.json();
    const errors = validateSalary(b, "update");
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });
    const update: Record<string, unknown> = {};
    if ("date" in b) update.date = b.date;
    if ("employee" in b) update.employee = b.employee;
    if ("account" in b) update.account = b.account ?? null;
    if ("amount" in b) update.amount = String(Number(b.amount));
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
    }
    const [row] = await db.update(salary).set(update).where(eq(salary.id, id)).returning();
    return NextResponse.json(row);
  } catch (err) {
    console.error("PATCH /salary/[id] failed:", err);
    return NextResponse.json({ error: "Failed to update salary record." }, { status: 500 });
  }
}
