import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { transactions, accounts } from "@/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { asc, desc, eq, sql, ilike, and, gte, lte } from "drizzle-orm";
import { parseListParams } from "@/lib/pagination";
import { validatePayment, hasErrors, firstError } from "@/lib/validation";
import { findOrCreatePartyAccount, findOrCreatePartnerAccount } from "@/lib/accounts";
import { postPaymentTransaction } from "@/lib/payments";

export const dynamic = "force-dynamic";

const partyAccounts = alias(accounts, "party_accounts");
const partnerAccounts = alias(accounts, "partner_accounts");
const SORT = { date: transactions.date, amount: transactions.amount } as const;
const KIND: Record<string, string> = { received: "purchaser_receipt", sent: "supplier_payment" };

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const direction = req.nextUrl.searchParams.get("direction");
    const kind = direction ? KIND[direction] : undefined;
    if (!kind) return NextResponse.json({ error: "direction must be 'received' or 'sent'." }, { status: 400 });

    const { search, page, limit, offset, sort, dir, from, to, amountMin, amountMax } = parseListParams(req, {
      sortable: Object.keys(SORT),
      defaultSort: "date",
    });
    const partnerIdParam = req.nextUrl.searchParams.get("partnerId");
    const partnerId = partnerIdParam ? Number(partnerIdParam) : null;

    const conditions = [
      eq(transactions.kind, kind),
      search ? ilike(partyAccounts.name, `%${search}%`) : undefined,
      from ? gte(transactions.date, from) : undefined,
      to ? lte(transactions.date, to) : undefined,
      amountMin != null ? gte(transactions.amount, String(amountMin)) : undefined,
      amountMax != null ? lte(transactions.amount, String(amountMax)) : undefined,
      partnerId != null && Number.isFinite(partnerId) ? eq(transactions.partnerAccountId, partnerId) : undefined,
    ].filter((c) => c !== undefined);
    const where = and(...conditions);
    const col = SORT[sort as keyof typeof SORT];
    const order = dir === "asc" ? [asc(col), asc(transactions.id)] : [desc(col), desc(transactions.id)];

    const rowsQuery = db
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        note: transactions.note,
        partyAccountId: transactions.partyAccountId,
        partyName: partyAccounts.name,
        partnerAccountId: transactions.partnerAccountId,
        partnerName: partnerAccounts.name,
      })
      .from(transactions)
      .innerJoin(partyAccounts, eq(transactions.partyAccountId, partyAccounts.id))
      .innerJoin(partnerAccounts, eq(transactions.partnerAccountId, partnerAccounts.id))
      .where(where)
      .orderBy(...order)
      .limit(limit)
      .offset(offset);

    const totalsQuery = db
      .select({ total: sql<string>`COALESCE(SUM(${transactions.amount}),0)`, count: sql<string>`COUNT(*)` })
      .from(transactions)
      .innerJoin(partyAccounts, eq(transactions.partyAccountId, partyAccounts.id))
      .where(where);

    const [rows, [{ total, count }]] = await Promise.all([rowsQuery, totalsQuery]);

    return NextResponse.json({ rows, total: Number(total), count: Number(count), page, limit });
  } catch (err) {
    console.error("GET /payments failed:", err);
    return NextResponse.json({ error: "Failed to load payments." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const errors = validatePayment(body);
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });

    const { date, direction, partyName, partnerName, amount, note } = body as {
      date: string;
      direction: "received" | "sent";
      partyName: string;
      partnerName: string;
      amount: number;
      note?: string;
    };

    const { accountId: partyAccountId, customerId } = await findOrCreatePartyAccount(partyName);
    const partnerAccountId = await findOrCreatePartnerAccount(partnerName);

    const txn = await postPaymentTransaction({
      date,
      direction,
      amount: String(amount),
      note: note?.trim() || null,
      partyAccountId,
      partnerAccountId,
      customerId,
    });

    return NextResponse.json(txn, { status: 201 });
  } catch (err) {
    console.error("POST /payments failed:", err);
    return NextResponse.json({ error: "Failed to record payment." }, { status: 500 });
  }
}
