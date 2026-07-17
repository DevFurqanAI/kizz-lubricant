/**
 * Phase 1 migration: fold the legacy tables (customers, customer_entries,
 * sales, purchasing, expenses, salary) into the unified model
 * (accounts, transactions, ledger_entries) — see docs/automation-spec.md.
 *
 * The legacy tables are left untouched; this only POPULATES the new ones,
 * so the running app is unaffected until Phase 3 rewires the read screens.
 *
 * Re-runnable: it wipes and rebuilds the new tables each time, so you can
 * iterate safely. It never touches legacy data.
 *
 *   npm run db:push          # create the new tables first
 *   tsx scripts/migrate-to-transactions.ts
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { asc, eq, sql } from "drizzle-orm";
import {
  customers, customerEntries, sales, purchasing, expenses, salary,
  accounts, transactions, ledgerEntries,
} from "../src/db/schema";

const n = (v: unknown) => Number(v ?? 0);
const money = (v: number) => v.toLocaleString("en-US");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing in .env");
  const db = drizzle(neon(process.env.DATABASE_URL));

  // ── Reset the new tables (idempotent) ──────────────────────────────
  await db.delete(ledgerEntries);
  await db.delete(transactions);
  await db.delete(accounts);
  console.log("✔ Cleared new tables\n");

  // ── Partners (cash hubs) ───────────────────────────────────────────
  const [imran] = await db.insert(accounts).values({ name: "Imran Ullah", type: "partner" }).returning();
  const [naqi] = await db.insert(accounts).values({ name: "M. Naqi", type: "partner" }).returning();
  const partnerId = (note?: string | null): number | null => {
    const t = (note ?? "").toLowerCase();
    if (t.includes("naqi")) return naqi.id;
    if (t.includes("imran")) return imran.id;
    return null;
  };

  // ── Parties (from legacy customers), keep old→new id map ────────────
  const legacyCustomers = await db.select().from(customers);
  const partyMap = new Map<number, number>();
  const partyTokens: string[] = []; // for de-duping the Purchasing sheet
  for (const c of legacyCustomers) {
    const [row] = await db.insert(accounts).values({
      name: c.name, type: "party",
      accountTitle: c.accountTitle, owner: c.owner, cnic: c.cnic,
      address: c.address, phone: c.phone, whatsapp: c.whatsapp, email: c.email,
    }).returning();
    partyMap.set(c.id, row.id);
    // distinctive name words used to detect duplicate purchase rows
    for (const w of c.name.toLowerCase().replace(/[()]/g, " ").split(/\s+/))
      if (w.length >= 4 && !["empty","company"].includes(w)) partyTokens.push(w);
  }
  partyTokens.push("empty"); // "Ahmad Raza (Empty Drum)" purchases say just "Empty …"
  console.log(`✔ ${legacyCustomers.length} parties + 2 partners created\n`);

  // ── Helpers ────────────────────────────────────────────────────────
  type Post = { accountId: number; debit: number; credit: number };
  async function tx(
    fields: Record<string, unknown>, date: string, posts: Post[],
  ) {
    const [t] = await db.insert(transactions).values({ ...fields, date } as never).returning();
    for (const p of posts) {
      await db.insert(ledgerEntries).values({
        accountId: p.accountId, transactionId: t.id, date,
        debit: String(p.debit), credit: String(p.credit), balance: "0",
      });
    }
  }

  // ── Customer ledgers → purchases + supplier payments ───────────────
  // Legacy convention: debit column = goods we received (a purchase),
  // credit column = money we sent the party (a supplier payment).
  const entries = await db.select().from(customerEntries)
    .orderBy(asc(customerEntries.customerId), asc(customerEntries.date), asc(customerEntries.id));
  let purchaseFromParty = 0, supplierPayments = 0;
  for (const e of entries) {
    const partyAccountId = partyMap.get(e.customerId)!;
    const debit = n(e.debit), credit = n(e.credit);
    if (debit > 0) {
      // Purchase from party → party CREDIT (we owe them)
      await tx({
        kind: "purchase", amount: String(debit), partyAccountId,
        product: e.product, packing: e.packing, unit: e.unit,
        qty: e.qty, rate: e.rate, detail: e.product, note: e.account,
      }, e.date, [{ accountId: partyAccountId, debit: 0, credit: debit }]);
      purchaseFromParty += debit;
    }
    if (credit > 0) {
      // Payment to party → party DEBIT (we owe less) + partner cash out
      const pid = partnerId(e.account);
      const posts: Post[] = [{ accountId: partyAccountId, debit: credit, credit: 0 }];
      if (pid) posts.push({ accountId: pid, debit: 0, credit });
      await tx({
        kind: "supplier_payment", amount: String(credit), partyAccountId,
        partnerAccountId: pid, note: e.account,
      }, e.date, posts);
      supplierPayments += credit;
    }
  }
  console.log(`✔ Party ledgers → ${money(purchaseFromParty)} purchases, ${money(supplierPayments)} payments`);

  // ── Sales sheet → cash sales (no party ledger) ─────────────────────
  const saleRows = await db.select().from(sales);
  let cashSales = 0;
  for (const s of saleRows) {
    await tx({
      kind: "sale", amount: s.amount, product: s.detail, detail: s.detail,
      qty: s.qty, rate: s.rate,
    }, s.date, []);
    cashSales += n(s.amount);
  }
  console.log(`✔ ${saleRows.length} cash sales → ${money(cashSales)}`);

  // ── Purchasing sheet → cash purchases, minus party duplicates ──────
  const purchRows = await db.select().from(purchasing);
  let cashPurch = 0, skipped = 0, skippedAmt = 0;
  for (const p of purchRows) {
    const d = p.detail.toLowerCase();
    if (partyTokens.some((tok) => d.includes(tok))) { skipped++; skippedAmt += n(p.amount); continue; }
    await tx({ kind: "purchase", amount: p.amount, detail: p.detail }, p.date, []);
    cashPurch += n(p.amount);
  }
  console.log(`✔ ${purchRows.length - skipped} cash purchases → ${money(cashPurch)}  (skipped ${skipped} party-duplicate rows = ${money(skippedAmt)})`);

  // ── Expenses ───────────────────────────────────────────────────────
  const expRows = await db.select().from(expenses);
  let totalExp = 0;
  for (const ex of expRows) {
    await tx({ kind: "expense", amount: ex.amount, detail: ex.detail, partnerAccountId: partnerId(ex.detail) },
      ex.date, partnerId(ex.detail) ? [{ accountId: partnerId(ex.detail)!, debit: 0, credit: n(ex.amount) }] : []);
    totalExp += n(ex.amount);
  }
  console.log(`✔ ${expRows.length} expenses → ${money(totalExp)}`);

  // ── Salary ─────────────────────────────────────────────────────────
  const salRows = await db.select().from(salary);
  let totalSal = 0;
  for (const s of salRows) {
    const pid = partnerId(s.account);
    await tx({ kind: "salary", amount: s.amount, employee: s.employee, note: s.account, partnerAccountId: pid },
      s.date, pid ? [{ accountId: pid, debit: 0, credit: n(s.amount) }] : []);
    totalSal += n(s.amount);
  }
  console.log(`✔ ${salRows.length} salary → ${money(totalSal)}\n`);

  // ── Derive each party's role from its actual activity ──────────────
  // supplier side = we buy from them; purchaser side = we sell to them.
  // A party with both becomes 'both'. (Direction still lives per-transaction;
  // this is just a label for filtering/UI.)
  for (const [, accId] of partyMap) {
    const kinds = await db.execute(sql`
      SELECT DISTINCT kind FROM transactions WHERE party_account_id = ${accId}
    `).then((r) => (r.rows as Array<{ kind: string }>).map((x) => x.kind));
    const supplierSide = kinds.includes("purchase") || kinds.includes("supplier_payment");
    const purchaserSide = kinds.includes("sale") || kinds.includes("purchaser_receipt");
    const role = supplierSide && purchaserSide ? "both" : supplierSide ? "supplier" : purchaserSide ? "purchaser" : null;
    if (role) await db.update(accounts).set({ role }).where(eq(accounts.id, accId));
  }

  // ── Recompute running balances per account ─────────────────────────
  const allAccounts = await db.select().from(accounts);
  for (const a of allAccounts) {
    const posts = await db.select().from(ledgerEntries)
      .where(eq(ledgerEntries.accountId, a.id))
      .orderBy(asc(ledgerEntries.date), asc(ledgerEntries.id));
    let running = n(a.openingBalance);
    for (const p of posts) {
      running += n(p.debit) - n(p.credit);
      await db.update(ledgerEntries).set({ balance: String(running) }).where(eq(ledgerEntries.id, p.id));
    }
  }

  // ── Verification summary ───────────────────────────────────────────
  console.log("── Account balances (positive = they owe us / partner cash) ──");
  for (const a of allAccounts) {
    const [{ bal }] = await db.execute(sql`
      SELECT COALESCE((SELECT balance FROM ledger_entries WHERE account_id = ${a.id}
        ORDER BY date DESC, id DESC LIMIT 1), 0) AS bal
    `).then((r) => r.rows as Array<{ bal: string }>);
    const tag = a.type === "partner" ? "partner" : (a.role ?? "—");
    console.log(`   ${a.type === "partner" ? "🏦" : "👤"} ${a.name.padEnd(30)} ${tag.padEnd(10)} ${money(n(bal)).padStart(14)}`);
  }

  const totals = await db.execute(sql`
    SELECT kind, COALESCE(SUM(amount),0) AS total FROM transactions GROUP BY kind ORDER BY kind
  `).then((r) => r.rows as Array<{ kind: string; total: string }>);
  const by = Object.fromEntries(totals.map((t) => [t.kind, n(t.total)]));
  const sale = by.sale ?? 0, purchase = by.purchase ?? 0, expense = (by.expense ?? 0) + (by.salary ?? 0);
  console.log("\n── P&L (live, all dates) ──");
  console.log(`   Sale       ${money(sale).padStart(14)}`);
  console.log(`   Purchase   ${money(purchase).padStart(14)}`);
  console.log(`   Expense    ${money(expense).padStart(14)}   (incl. salary ${money(by.salary ?? 0)})`);
  console.log(`   ─────────────────────────`);
  console.log(`   Net        ${money(sale - purchase - expense).padStart(14)}`);
  console.log("\n✅ Migration complete.\n");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
