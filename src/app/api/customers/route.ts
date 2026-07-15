import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { customers, customerEntries } from "@/db/schema";
import { ilike, or, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const rows = search
    ? await db.select().from(customers).where(or(ilike(customers.name, `%${search}%`), ilike(customers.address, `%${search}%`)))
    : await db.select().from(customers);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const [row] = await db.insert(customers).values({
    name: body.name,
    accountTitle: body.accountTitle ?? null,
    owner: body.owner ?? null,
    cnic: body.cnic ?? null,
    address: body.address ?? null,
    phone: body.phone ?? null,
    whatsapp: body.whatsapp ?? null,
    email: body.email ?? null,
  }).returning();
  return NextResponse.json(row, { status: 201 });
}
