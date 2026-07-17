import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { customers, customerEntries } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { buildLedgerBlob, XLSX_MIME } from "@/lib/ledger-xlsx";
import { uploadMedia, sendDocument } from "@/lib/wasender";
import { formatMoney, toNum, waNumber } from "@/lib/utils";
import type { FullCustomer } from "@/lib/customercache";

// exceljs needs the Node runtime (not edge).
export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.WASENDER_API_KEY) {
    return NextResponse.json({ error: "WhatsApp sending is not configured (missing API key)." }, { status: 500 });
  }

  const id = Number(params.id);
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const entries = await db
    .select()
    .from(customerEntries)
    .where(eq(customerEntries.customerId, id))
    .orderBy(asc(customerEntries.date), asc(customerEntries.id));

  if (entries.length === 0) {
    return NextResponse.json({ error: "This customer has no ledger entries to send." }, { status: 400 });
  }

  const number = waNumber(customer.whatsapp || customer.phone);
  if (!number) {
    return NextResponse.json({ error: "This customer has no valid WhatsApp/phone number." }, { status: 400 });
  }

  const full: FullCustomer = { ...customer, entries };

  try {
    // Build the same polished .xlsx the browser download produces.
    const blob = await buildLedgerBlob(full);
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const dataUrl = `data:${XLSX_MIME};base64,${base64}`;

    const safeName = customer.name.replace(/[^a-z0-9]+/gi, "_");
    const fileName = `${safeName}_ledger_${new Date().toISOString().slice(0, 10)}.xlsx`;

    // Host the file, then deliver it as a WhatsApp document.
    const documentUrl = await uploadMedia(dataUrl);

    const last = entries[entries.length - 1];
    const bal = last ? toNum(last.balance) : 0;
    const status = bal > 0 ? "outstanding (owes)" : bal < 0 ? "advance / credit balance" : "settled";
    const text =
      `*Kizz Lubricants* — Ledger Statement\n\n` +
      `Customer: ${customer.name}\n` +
      `Current balance: ${formatMoney(Math.abs(bal))} ${status}\n\n` +
      `Your statement is attached. Thank you for your business.`;

    await sendDocument({ to: number, documentUrl, fileName, text });

    return NextResponse.json({ ok: true, to: number });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send ledger over WhatsApp.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
