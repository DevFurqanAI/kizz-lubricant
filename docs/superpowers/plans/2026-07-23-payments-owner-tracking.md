# Payments (Received / Sent) with Owner Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Payments" section (Received / Sent tabs) that records who money moved with, which of the two owners (Mubashir, Naqi — extensible) handled it, and mirrors into the existing Customer ledger when the counterparty is a known customer.

**Architecture:** Activates the already-scaffolded-but-unused unified model in `src/db/schema.ts` (`accounts`, `transactions`, `ledger_entries` — see `docs/automation-spec.md`). Every payment is one `transactions` row (`kind: 'purchaser_receipt' | 'supplier_payment'`) that fans out to two `ledger_entries` postings (party + owner) via the same accounting rules already documented in the spec's §5 fan-out table. When the counterparty matches an existing `customers` row, the payment also mirrors a credit/debit row into `customer_entries` — the same pattern `sales.ledgerEntryId` already uses — so the existing Customer ledger page needs zero changes.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, Neon Postgres (HTTP driver — no interactive multi-statement transactions), NextAuth session guard on every API route, Tailwind CSS. No test runner exists in this repo (no `jest`/`vitest` in `package.json`) — verification is `npx tsc --noEmit`, `npm run lint`, and manual browser checks against the dev server, matching how the rest of the app is verified.

## Global Constraints

- Every API route must start with the `getServerSession(authOptions)` guard used by every existing route (e.g. `src/app/api/purchasing/route.ts:15-16`) — unauthenticated requests get `401`.
- All money columns are `numeric(14,2)`; send values through `String(amount)` before inserting, matching every existing route (`src/app/api/purchasing/route.ts:55`).
- The Neon HTTP driver cannot run interactive transactions (documented at `src/lib/ledger.ts:12-14`) — any multi-insert flow that can partially fail must clean up on error, matching `src/app/api/sales/route.ts:117-179`.
- Schema changes are applied with `npm run db:push` (Drizzle push workflow — this repo has no `drizzle/` migrations directory, confirmed empty).
- Follow existing file conventions: routes under `src/app/api/**/route.ts`, dashboard pages under `src/app/dashboard/**/page.tsx`, shared logic in `src/lib/**`.

---

## Phase 1 task list (this plan)

1. Schema: `customers.account_id`, `transactions.mirrored_entry_id`, push, seed owners.
2. `src/lib/accounts.ts` — find-or-create party / partner accounts.
3. `src/lib/party-ledger.ts` — running balance recompute for `ledger_entries`.
4. `src/lib/payments.ts` — the fan-out + customer-ledger mirror.
5. `src/lib/validation.ts` — `validatePayment`.
6. `src/app/api/accounts/partners/route.ts`, `src/app/api/accounts/parties/route.ts` — picker data.
7. `src/app/api/payments/route.ts` — GET (list) + POST (create).
8. `src/app/api/payments/[id]/route.ts` — DELETE.
9. `src/app/dashboard/payments/page.tsx` — the UI.
10. Sidebar nav entry + end-to-end manual verification.

## Phase 2 (separate future plan, not built here)

Link `purchasing` rows to `accounts.party`, giving suppliers a full ledger (purchases + payments), mirroring what customers already get. Flagged in `docs/superpowers/specs/2026-07-23-payments-owner-tracking-design.md` §3 — write a fresh plan for it once Phase 1 has shipped and been used for a while.

---

### Task 1: Schema — link customers to accounts, link transactions to their mirrored ledger row, seed owners

**Files:**
- Modify: `src/db/schema.ts:24-35` (customers table), `src/db/schema.ts:158-184` (transactions table)
- Modify: `scripts/seed.ts:1-48`

**Interfaces:**
- Produces: `customers.accountId: number | null` (FK → `accounts.id`), `transactions.mirroredEntryId: number | null` (FK → `customerEntries.id`) — every later task reads/writes these exact column names via Drizzle's camelCase mapping.

- [ ] **Step 1: Add `accountId` to the `customers` table**

In `src/db/schema.ts`, inside the `customers` table definition (around line 24-35), add the new column right after `owner`:

```ts
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  accountTitle: varchar("account_title", { length: 200 }),
  owner: varchar("owner", { length: 200 }),
  // Lazily linked the first time this customer appears in a Payment — see
  // src/lib/accounts.ts. Null for customers who've never been paid via the
  // Payments page.
  accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }),
  cnic: varchar("cnic", { length: 30 }),
  address: varchar("address", { length: 300 }),
  phone: varchar("phone", { length: 50 }),
  whatsapp: varchar("whatsapp", { length: 50 }),
  email: varchar("email", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

- [ ] **Step 2: Add `mirroredEntryId` to the `transactions` table**

In the same file, inside the `transactions` table definition (around line 158-184), add the column after `counterAccountId`:

```ts
  counterAccountId: integer("counter_account_id").references(() => accounts.id, { onDelete: "set null" }), // transfer "to"
  // Set only for purchaser_receipt / supplier_payment transactions whose
  // party is a linked Customer — points at the mirrored row this payment
  // created in customer_entries, so delete/edit can keep both in sync (same
  // pattern as sales.ledgerEntryId).
  mirroredEntryId: integer("mirrored_entry_id").references(() => customerEntries.id, { onDelete: "set null" }),
```

- [ ] **Step 3: Push the schema**

Run: `npm run db:push`
Expected: Drizzle reports two new columns added (`customers.account_id`, `transactions.mirrored_entry_id`) with no destructive changes. If it prompts about the new FK columns, accept (they're nullable, non-breaking).

- [ ] **Step 4: Seed the two owner accounts**

In `scripts/seed.ts`, add `accounts` to the schema import on line 6-8:

```ts
import {
  users, customers, customerEntries, sales, purchasing, expenses, salary, accounts,
} from "../src/db/schema";
```

Then insert a new block **before** the `existing_customers` early-return check (so it still runs on an already-seeded database — the existing check at line 44-48 returns early and would otherwise skip this). Place it right after the admin-user block (after line 41), before `// Check if already seeded`:

```ts
  // ── 1.5 Partner accounts (owners) ──────────────────────────────────────
  // Idempotent and placed before the "already seeded" early-return so it
  // still runs against a database that already has customer/sales data.
  const existingPartners = await db.select().from(accounts).where(eq(accounts.type, "partner"));
  if (existingPartners.length === 0) {
    await db.insert(accounts).values([
      { name: "Mubashir", type: "partner" },
      { name: "Naqi", type: "partner" },
    ]);
    console.log("✔ Partner accounts seeded: Mubashir, Naqi");
  } else {
    console.log("ℹ  Partner accounts already present — skipping.");
  }
```

- [ ] **Step 5: Run the seed and verify**

Run: `npm run db:seed`
Expected: output includes either `✔ Partner accounts seeded: Mubashir, Naqi` (first run) or `ℹ  Partner accounts already present — skipping.` (subsequent runs), proving the block is idempotent and reachable regardless of the customers early-return.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts scripts/seed.ts
git commit -m "feat(payments): add customer<->account link, transaction mirror FK, seed owner accounts"
```

---

### Task 2: `src/lib/accounts.ts` — find-or-create party / partner accounts

**Files:**
- Create: `src/lib/accounts.ts`

**Interfaces:**
- Consumes: `db` from `@/db`, `accounts`/`customers` tables from `@/db/schema` (Task 1).
- Produces: `findOrCreatePartyAccount(name: string): Promise<{ accountId: number; customerId: number | null }>`, `findOrCreatePartnerAccount(name: string): Promise<number>` — Task 7 (POST /api/payments) calls both by exact name.

- [ ] **Step 1: Write the module**

```ts
import { db } from "@/db";
import { accounts, customers } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * Party = the counterparty on a payment (an existing Customer or a new
 * supplier/vendor). Resolves an existing match case-insensitively; creates a
 * new `accounts` row (type='party') if nothing matches. When the name
 * matches an existing Customer, that customer is auto-linked via
 * `customers.account_id` (created the first time they appear in a payment)
 * so the payment can mirror into their ledger — see src/lib/payments.ts.
 */
export async function findOrCreatePartyAccount(
  name: string,
): Promise<{ accountId: number; customerId: number | null }> {
  const trimmed = name.trim();

  const [customerMatch] = await db
    .select({ id: customers.id, accountId: customers.accountId })
    .from(customers)
    .where(sql`lower(${customers.name}) = lower(${trimmed})`)
    .limit(1);

  if (customerMatch) {
    if (customerMatch.accountId) {
      return { accountId: customerMatch.accountId, customerId: customerMatch.id };
    }
    const [acct] = await db.insert(accounts).values({ name: trimmed, type: "party" }).returning({ id: accounts.id });
    await db.update(customers).set({ accountId: acct.id }).where(eq(customers.id, customerMatch.id));
    return { accountId: acct.id, customerId: customerMatch.id };
  }

  const [partyMatch] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.type, "party"), sql`lower(${accounts.name}) = lower(${trimmed})`))
    .limit(1);
  if (partyMatch) return { accountId: partyMatch.id, customerId: null };

  const [created] = await db.insert(accounts).values({ name: trimmed, type: "party" }).returning({ id: accounts.id });
  return { accountId: created.id, customerId: null };
}

/**
 * Owner = a partner cash account (Mubashir, Naqi, …). Same find-or-create,
 * no customer linking — this is how "+ Add owner" on the Payments page
 * works without a separate create endpoint.
 */
export async function findOrCreatePartnerAccount(name: string): Promise<number> {
  const trimmed = name.trim();
  const [match] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.type, "partner"), sql`lower(${accounts.name}) = lower(${trimmed})`))
    .limit(1);
  if (match) return match.id;
  const [created] = await db.insert(accounts).values({ name: trimmed, type: "partner" }).returning({ id: accounts.id });
  return created.id;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/accounts.ts
git commit -m "feat(payments): add find-or-create helpers for party/partner accounts"
```

---

### Task 3: `src/lib/party-ledger.ts` — running balance recompute for `ledger_entries`

**Files:**
- Create: `src/lib/party-ledger.ts`

**Interfaces:**
- Produces: `recalcAccountBalances(accountId: number): Promise<void>` — called by Task 4 and Task 8.

- [ ] **Step 1: Write the module**

```ts
import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Recompute every running balance for one account (party or partner) in
 * `ledger_entries`, seeded from `accounts.opening_balance`. Mirrors
 * `recalcBalances` in src/lib/ledger.ts (single windowed UPDATE — the Neon
 * HTTP driver can't run interactive transactions, and this stays atomic and
 * fast) but, unlike that one, correctly folds in the opening balance from
 * the start since `ledger_entries` has no legacy zero-start data to stay
 * compatible with.
 */
export async function recalcAccountBalances(accountId: number) {
  await db.execute(sql`
    UPDATE ledger_entries AS le
    SET balance = t.running
    FROM (
      SELECT le2.id,
             a.opening_balance + SUM(le2.debit - le2.credit) OVER (
               ORDER BY le2.date, le2.id
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
             ) AS running
      FROM ledger_entries le2
      JOIN accounts a ON a.id = le2.account_id
      WHERE le2.account_id = ${accountId}
    ) AS t
    WHERE le.id = t.id
  `);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/party-ledger.ts
git commit -m "feat(payments): add running-balance recompute for ledger_entries"
```

---

### Task 4: `src/lib/payments.ts` — the fan-out + customer-ledger mirror

**Files:**
- Create: `src/lib/payments.ts`

**Interfaces:**
- Consumes: `recalcAccountBalances` (Task 3), `recalcBalances` from `@/lib/ledger` (existing).
- Produces: `postPaymentTransaction(input): Promise<Transaction>` where `input` is `{ date: string; direction: "received" | "sent"; amount: string; note: string | null; partyAccountId: number; partnerAccountId: number; customerId: number | null }` — called by Task 7's POST handler.

- [ ] **Step 1: Write the module**

```ts
import { db } from "@/db";
import { transactions, ledgerEntries, customerEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recalcAccountBalances } from "@/lib/party-ledger";
import { recalcBalances } from "@/lib/ledger";

export type PaymentDirection = "received" | "sent";

export type PostPaymentInput = {
  date: string;
  direction: PaymentDirection;
  amount: string;
  note: string | null;
  partyAccountId: number;
  partnerAccountId: number;
  customerId: number | null;
};

/**
 * One payment = one `transactions` row + two `ledger_entries` postings
 * (party + owner), following the fan-out table in
 * docs/automation-spec.md §5:
 *   Received (purchaser_receipt): party credit (they owe less), owner debit (cash in)
 *   Sent (supplier_payment):      party debit (we owe less),   owner credit (cash out)
 * When `customerId` is set, also mirrors a credit/debit row into
 * customer_entries — same pattern sales.ledgerEntryId uses — so the
 * Customer ledger page needs no changes.
 *
 * The Neon HTTP driver can't run interactive transactions (see
 * src/lib/ledger.ts), so on any failure after the initial insert this
 * deletes what it already created rather than leave the ledger
 * inconsistent — same approach as POST /api/sales.
 */
export async function postPaymentTransaction(input: PostPaymentInput) {
  const kind = input.direction === "received" ? "purchaser_receipt" : "supplier_payment";

  const [txn] = await db
    .insert(transactions)
    .values({
      date: input.date,
      kind,
      amount: input.amount,
      partyAccountId: input.partyAccountId,
      partnerAccountId: input.partnerAccountId,
      note: input.note,
    })
    .returning();

  let mirrorId: number | null = null;
  try {
    await db.insert(ledgerEntries).values({
      accountId: input.partyAccountId,
      transactionId: txn.id,
      date: input.date,
      debit: input.direction === "sent" ? input.amount : "0",
      credit: input.direction === "received" ? input.amount : "0",
      balance: "0",
    });
    await db.insert(ledgerEntries).values({
      accountId: input.partnerAccountId,
      transactionId: txn.id,
      date: input.date,
      debit: input.direction === "received" ? input.amount : "0",
      credit: input.direction === "sent" ? input.amount : "0",
      balance: "0",
    });
    await recalcAccountBalances(input.partyAccountId);
    await recalcAccountBalances(input.partnerAccountId);

    if (input.customerId) {
      const [mirror] = await db
        .insert(customerEntries)
        .values({
          customerId: input.customerId,
          date: input.date,
          // No product on Received — an empty product is what marks a row
          // as a payment for the ledger render + Excel export (see
          // memory: payments-model). Sent-to-a-customer is a rare edge
          // case (e.g. a refund), so it gets an explicit product label
          // instead of tripping that "Payment Received" detection.
          product: input.direction === "sent" ? "Payment Sent" : null,
          debit: input.direction === "sent" ? input.amount : "0",
          credit: input.direction === "received" ? input.amount : "0",
          balance: "0",
          account: input.note,
        })
        .returning();
      mirrorId = mirror.id;
      await db.update(transactions).set({ mirroredEntryId: mirror.id }).where(eq(transactions.id, txn.id));
      await recalcBalances(input.customerId);
    }
  } catch (err) {
    console.error("postPaymentTransaction failed, rolling back:", err);
    if (mirrorId) await db.delete(customerEntries).where(eq(customerEntries.id, mirrorId)).catch(() => {});
    // Deleting the transaction cascades its ledger_entries (onDelete: "cascade").
    await db.delete(transactions).where(eq(transactions.id, txn.id)).catch(() => {});
    throw err;
  }

  return txn;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/payments.ts
git commit -m "feat(payments): add postPaymentTransaction fan-out + customer ledger mirror"
```

---

### Task 5: `src/lib/validation.ts` — `validatePayment`

**Files:**
- Modify: `src/lib/validation.ts` (append near `validateSalary`, around line 159)

**Interfaces:**
- Produces: `validatePayment(b, mode?): FieldErrors` — used by both the API route (Task 7) and the dashboard form (Task 9), same dual-use pattern as every other `validate*` export in this file.

- [ ] **Step 1: Add the validator**

Append to `src/lib/validation.ts`, after `validateSalary` (after line 159):

```ts
function checkDirection(v: unknown): string | null {
  return v === "received" || v === "sent" ? null : "Direction must be 'received' or 'sent'.";
}

function checkPositiveMoney(v: unknown, label: string): string | null {
  const err = checkMoney(v, label, { required: true });
  if (err) return err;
  if (Number(v) <= 0) return `${label} must be greater than 0.`;
  return null;
}

export function validatePayment(b: Record<string, unknown>, mode: Mode = "create"): FieldErrors {
  const e: FieldErrors = {};
  if (active(b, "date", mode)) set(e, "date", checkDate(b.date, { required: true }));
  if (active(b, "direction", mode)) set(e, "direction", checkDirection(b.direction));
  if (active(b, "partyName", mode)) set(e, "partyName", checkRequiredText(b.partyName, "Party", 200));
  if (active(b, "partnerName", mode)) set(e, "partnerName", checkRequiredText(b.partnerName, "Owner", 200));
  if (active(b, "amount", mode)) set(e, "amount", checkPositiveMoney(b.amount, "Amount"));
  if (active(b, "note", mode)) set(e, "note", checkOptionalText(b.note, "Note", 300));
  return e;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/validation.ts
git commit -m "feat(payments): add validatePayment"
```

---

### Task 6: Picker endpoints — owners list and party-name suggestions

**Files:**
- Create: `src/app/api/accounts/partners/route.ts`
- Create: `src/app/api/accounts/parties/route.ts`

**Interfaces:**
- Produces: `GET /api/accounts/partners` → `{ id: number; name: string }[]`; `GET /api/accounts/parties` → `string[]`. Both consumed by Task 9's page.

- [ ] **Step 1: Write the partners endpoint**

```ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Owner dropdown options for the Payments page (Mubashir, Naqi, …).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = await db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.type, "partner"))
      .orderBy(asc(accounts.name));
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /accounts/partners failed:", err);
    return NextResponse.json({ error: "Failed to load owners." }, { status: 500 });
  }
}
```

Create at `src/app/api/accounts/partners/route.ts`.

- [ ] **Step 2: Write the parties endpoint**

```ts
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
```

Create at `src/app/api/accounts/parties/route.ts`.

- [ ] **Step 3: Manual check**

Run: `npm run dev`, sign in, then in the browser console on any dashboard page run:
```js
fetch("/api/accounts/partners").then(r => r.json()).then(console.log)
fetch("/api/accounts/parties").then(r => r.json()).then(console.log)
```
Expected: `partners` returns `[{ id, name: "Mubashir" }, { id, name: "Naqi" }]` (order may vary); `parties` returns an array of every existing customer name.

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/accounts
git commit -m "feat(payments): add owner and party picker endpoints"
```

---

### Task 7: `src/app/api/payments/route.ts` — GET (list) + POST (create)

**Files:**
- Create: `src/app/api/payments/route.ts`

**Interfaces:**
- Consumes: `findOrCreatePartyAccount`, `findOrCreatePartnerAccount` (Task 2), `postPaymentTransaction` (Task 4), `validatePayment` (Task 5).
- Produces: `GET /api/payments?direction=received|sent&...` → `{ rows: PaymentRow[]; total: number; count: number; page: number; limit: number }` where `PaymentRow = { id, date, amount, note, partyAccountId, partyName, partnerAccountId, partnerName }`; `POST /api/payments` body `{ date, direction, partyName, partnerName, amount, note? }` → the created `transactions` row. Both consumed by Task 9's page.

- [ ] **Step 1: Write the route**

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `alias` import errors, confirm the installed `drizzle-orm` version exports it from `drizzle-orm/pg-core` — it does as of `^0.38.3`, per `package.json`.)

- [ ] **Step 3: Manual check**

With `npm run dev` running and signed in, from the browser console:
```js
fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ date: "2026-07-23", direction: "received", partyName: "Abid Yaseen", partnerName: "Mubashir", amount: 250000, note: "Test" }) })
  .then(r => r.json()).then(console.log)
fetch("/api/payments?direction=received").then(r => r.json()).then(console.log)
```
Expected: POST returns `201` with the created transaction row; GET returns it in `rows` with `partyName: "Abid Yaseen"`, `partnerName: "Mubashir"`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/payments/route.ts
git commit -m "feat(payments): add GET/POST /api/payments"
```

---

### Task 8: `src/app/api/payments/[id]/route.ts` — DELETE

**Files:**
- Create: `src/app/api/payments/[id]/route.ts`

**Interfaces:**
- Consumes: `recalcAccountBalances` (Task 3), `recalcBalances` from `@/lib/ledger` (existing).
- Produces: `DELETE /api/payments/[id]` — consumed by Task 9's page.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { transactions, customerEntries, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recalcAccountBalances } from "@/lib/party-ledger";
import { recalcBalances } from "@/lib/ledger";
import { parseIdParam } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseIdParam(params.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

    const [existing] = await db
      .select({
        partyAccountId: transactions.partyAccountId,
        partnerAccountId: transactions.partnerAccountId,
        mirroredEntryId: transactions.mirroredEntryId,
      })
      .from(transactions)
      .where(eq(transactions.id, id));
    if (!existing) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

    let customerId: number | null = null;
    if (existing.partyAccountId) {
      const [linked] = await db.select({ id: customers.id }).from(customers).where(eq(customers.accountId, existing.partyAccountId));
      customerId = linked?.id ?? null;
    }

    // The mirrored ledger row has no FK back to `transactions`, so it must be
    // deleted explicitly. `transactions` cascades `ledger_entries` on delete.
    if (existing.mirroredEntryId) {
      await db.delete(customerEntries).where(eq(customerEntries.id, existing.mirroredEntryId));
    }
    await db.delete(transactions).where(eq(transactions.id, id));

    if (existing.partyAccountId) await recalcAccountBalances(existing.partyAccountId);
    if (existing.partnerAccountId) await recalcAccountBalances(existing.partnerAccountId);
    if (customerId) await recalcBalances(customerId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /payments/[id] failed:", err);
    return NextResponse.json({ error: "Failed to delete payment." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual check**

Using the id returned by Task 7's test POST:
```js
fetch("/api/payments/<id>", { method: "DELETE" }).then(r => r.json()).then(console.log)
fetch("/api/payments?direction=received").then(r => r.json()).then(console.log)
```
Expected: DELETE returns `{ ok: true }`; the follow-up GET no longer includes that row.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/payments/[id]/route.ts"
git commit -m "feat(payments): add DELETE /api/payments/[id]"
```

---

### Task 9: `src/app/dashboard/payments/page.tsx` — the UI

**Files:**
- Create: `src/app/dashboard/payments/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/payments`, `DELETE /api/payments/[id]` (Tasks 7-8), `GET /api/accounts/partners`, `GET /api/accounts/parties` (Task 6), plus existing shared components (`FilterBar`, `SearchInput`, `DateRangeFilter`, `AmountRangeFilter`, `SortHeader`, `Pagination`, `EmptyState`/`ErrorState`/`TableSkeleton`, `useToast`, `useConfirm`, `createLocalCache`, `resolveDateRange`/`encodeDateRange`/`decodeDateRange`, `buildQueryString`) exactly as used in `src/app/dashboard/purchasing/page.tsx`.
- Produces: the `/dashboard/payments` route, linked from the sidebar in Task 10.

- [ ] **Step 1: Write the page**

No inline edit in this first pass (deleting and re-adding is enough — payments carry real ledger side effects on both the party and owner accounts, so in-place edits are deliberately deferred rather than half-built).

```tsx
"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatMoney, fmtDate } from "@/lib/utils";
import { createLocalCache } from "@/lib/localCache";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { SortHeader, type Sort, nextSort } from "@/components/sort-header";
import { SearchInput } from "@/components/search-input";
import { DateRangeFilter } from "@/components/date-range-filter";
import { AmountRangeFilter } from "@/components/amount-range-filter";
import { FilterBar } from "@/components/filter-bar";
import { resolveDateRange, encodeDateRange, decodeDateRange, type DateRangeSelection } from "@/lib/date-range";
import { buildQueryString } from "@/lib/url-filter-sync";
import { useContentFadeKey } from "@/lib/use-fade-key";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import { validatePayment, hasErrors, firstError, type FieldErrors } from "@/lib/validation";

type Direction = "received" | "sent";
type Row = { id: number; date: string; amount: string; note: string | null; partyName: string; partnerName: string };
type PaymentsData = { rows: Row[]; total: number; count: number };
type Partner = { id: number; name: string };

const PAGE_SIZE = 50;
const paymentsCache = createLocalCache<PaymentsData>("payments", { ttlMs: 5 * 60_000 });
const keyFor = (dir: Direction, q: string, s: Sort, p: number, from: string | null, to: string | null, amountMin: string, amountMax: string, partnerId: string) =>
  `${dir}|${q}|${s.col}|${s.dir}|p${p}|${from ?? ""}|${to ?? ""}|${amountMin}|${amountMax}|${partnerId}`;

export default function PaymentsPage() {
  const initSort: Sort = { col: "date", dir: "desc" };
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [direction, setDirection] = useState<Direction>("received");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>(initSort);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeSelection>({ preset: "all" });
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partyOptions, setPartyOptions] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingOwner, setAddingOwner] = useState(false);
  const emptyForm = { date: new Date().toISOString().slice(0, 10), partyName: "", partnerName: "", amount: "", note: "" };
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<FieldErrors>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (dir: Direction, q: string, p: number, s: Sort, from: string | null, to: string | null, aMin: string, aMax: string, pId: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) { setLoading(true); setError(false); }
    try {
      const qs = new URLSearchParams({ direction: dir, search: q, page: String(p), limit: String(PAGE_SIZE), sort: s.col, dir: s.dir });
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      if (aMin) qs.set("amountMin", aMin);
      if (aMax) qs.set("amountMax", aMax);
      if (pId) qs.set("partnerId", pId);
      const data = await api.get<PaymentsData>(`/payments?${qs}`);
      paymentsCache.set(keyFor(dir, q, s, p, from, to, aMin, aMax, pId), data);
      setRows(data.rows); setTotal(data.total); setCount(data.count);
    } catch {
      if (!opts?.silent) setError(true);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialDirection: Direction = searchParams.get("direction") === "sent" ? "sent" : "received";
    const initialSearch = searchParams.get("search")?.trim() ?? "";
    const initialRange = decodeDateRange(searchParams);
    const initialAmountMin = searchParams.get("amountMin") ?? "";
    const initialAmountMax = searchParams.get("amountMax") ?? "";
    const initialPartnerId = searchParams.get("partnerId") ?? "";
    setDirection(initialDirection);
    setSearch(initialSearch);
    setDateRange(initialRange);
    setAmountMin(initialAmountMin);
    setAmountMax(initialAmountMax);
    setPartnerId(initialPartnerId);
    const { from, to } = resolveDateRange(initialRange);
    load(initialDirection, initialSearch, 1, initSort, from, to, initialAmountMin, initialAmountMax, initialPartnerId);
    api.get<Partner[]>("/accounts/partners").then(setPartners).catch(() => {});
    api.get<string[]>("/accounts/parties").then(setPartyOptions).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncUrl = (overrides: Partial<{ direction: Direction; search: string; dateRange: DateRangeSelection; amountMin: string; amountMax: string; partnerId: string; sort: Sort; page: number }> = {}) => {
    const dir = overrides.direction ?? direction;
    const s = overrides.search ?? search;
    const dr = overrides.dateRange ?? dateRange;
    const aMin = overrides.amountMin ?? amountMin;
    const aMax = overrides.amountMax ?? amountMax;
    const pId = overrides.partnerId ?? partnerId;
    const srt = overrides.sort ?? sort;
    const p = overrides.page ?? page;
    router.replace(`${pathname}?${buildQueryString({ direction: dir, search: s, ...encodeDateRange(dr), amountMin: aMin, amountMax: aMax, partnerId: pId, sort: srt.col, dir: srt.dir, page: p })}`, { scroll: false });
  };

  const switchDirection = (dir: Direction) => {
    setDirection(dir); setPage(1);
    const { from, to } = resolveDateRange(dateRange);
    const cached = paymentsCache.get(keyFor(dir, search, sort, 1, from, to, amountMin, amountMax, partnerId));
    if (cached) { setRows(cached.rows); setTotal(cached.total); setCount(cached.count); }
    load(dir, search, 1, sort, from, to, amountMin, amountMax, partnerId);
    syncUrl({ direction: dir, page: 1 });
  };

  const handleSearch = (v: string) => {
    setSearch(v); setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const { from, to } = resolveDateRange(dateRange);
      load(direction, v, 1, sort, from, to, amountMin, amountMax, partnerId);
      syncUrl({ search: v, page: 1 });
    }, 300);
  };
  const onSort = (col: string) => {
    const s = nextSort(sort, col); setSort(s); setPage(1);
    const { from, to } = resolveDateRange(dateRange);
    load(direction, search, 1, s, from, to, amountMin, amountMax, partnerId);
    syncUrl({ sort: s, page: 1 });
  };
  const goPage = (p: number) => {
    setPage(p);
    const { from, to } = resolveDateRange(dateRange);
    load(direction, search, p, sort, from, to, amountMin, amountMax, partnerId);
    syncUrl({ page: p });
  };
  const handleDateRangeChange = (v: DateRangeSelection) => {
    setDateRange(v); setPage(1);
    const { from, to } = resolveDateRange(v);
    load(direction, search, 1, sort, from, to, amountMin, amountMax, partnerId);
    syncUrl({ dateRange: v, page: 1 });
  };
  const handleFilterChange = (next: Partial<{ amountMin: string; amountMax: string; partnerId: string }>) => {
    const nextMin = next.amountMin ?? amountMin;
    const nextMax = next.amountMax ?? amountMax;
    const nextPartnerId = next.partnerId ?? partnerId;
    setAmountMin(nextMin); setAmountMax(nextMax); setPartnerId(nextPartnerId); setPage(1);
    const { from, to } = resolveDateRange(dateRange);
    load(direction, search, 1, sort, from, to, nextMin, nextMax, nextPartnerId);
    syncUrl({ amountMin: nextMin, amountMax: nextMax, partnerId: nextPartnerId, page: 1 });
  };
  const clearFilters = () => {
    setDateRange({ preset: "all" }); setAmountMin(""); setAmountMax(""); setPartnerId(""); setPage(1);
    load(direction, search, 1, sort, null, null, "", "", "");
    syncUrl({ dateRange: { preset: "all" }, amountMin: "", amountMax: "", partnerId: "", page: 1 });
  };

  const handleSave = async () => {
    const payload = { ...form, direction };
    const errs = validatePayment(payload);
    if (hasErrors(errs)) { setFormErrors(errs); toast.error(firstError(errs)!); return; }
    setFormErrors({});
    setSaving(true);
    try {
      await api.post("/payments", { ...payload, amount: Number(form.amount) });
      setForm(emptyForm);
      setAddingOwner(false);
      setShowForm(false);
      paymentsCache.clear();
      setPage(1);
      const { from, to } = resolveDateRange(dateRange);
      load(direction, search, 1, sort, from, to, amountMin, amountMax, partnerId);
      api.get<Partner[]>("/accounts/partners").then(setPartners).catch(() => {});
      api.get<string[]>("/accounts/parties").then(setPartyOptions).catch(() => {});
      toast.success(direction === "received" ? "Payment received recorded" : "Payment sent recorded");
    } catch { toast.error("Couldn't record payment"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm({ title: "Delete this payment?", message: "This also removes it from the party's ledger and, if linked, the customer's ledger.", confirmText: "Delete", danger: true }))) return;
    const prevRows = rows, prevTotal = total, prevCount = count;
    const del = rows.find((r) => r.id === id);
    setRows((r) => r.filter((row) => row.id !== id));
    if (del) setTotal((t) => t - Number(del.amount));
    setCount((c) => Math.max(0, c - 1));
    try {
      await api.del(`/payments/${id}`);
      paymentsCache.clear();
      toast.success("Payment deleted");
    } catch {
      setRows(prevRows); setTotal(prevTotal); setCount(prevCount);
      toast.error("Couldn't delete payment");
    }
  };

  const rowsFadeKey = useContentFadeKey(rows);
  const heading = direction === "received" ? "Payments Received" : "Payments Sent";
  const partyLabel = direction === "received" ? "From" : "To";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[26px] font-semibold text-ink">Payments</h1>
            {count > 0 && <span className="badge-neutral tabular-nums">{count.toLocaleString()}</span>}
          </div>
          <p className="mt-1 text-sm text-muted">Who sent or received money, and which owner handled it.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">+ Add Payment</button>
      </div>

      <div className="flex gap-2 border-b border-line">
        {(["received", "sent"] as Direction[]).map((d) => (
          <button
            key={d}
            onClick={() => switchDirection(d)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${direction === d ? "border-accent text-accent-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {d === "received" ? "Received" : "Sent"}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="rise card p-6">
          <h3 className="font-semibold text-ink mb-4">{heading} — New Entry</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="input py-2.5 text-sm" />
            </div>
            <div>
              <label className="label">{partyLabel} *</label>
              <input
                list="party-options"
                value={form.partyName}
                onChange={(e) => { setForm((f) => ({ ...f, partyName: e.target.value })); setFormErrors((er) => ({ ...er, partyName: "" })); }}
                placeholder="Customer or supplier name"
                className={`input py-2.5 text-sm${formErrors.partyName ? " ring-1 ring-danger" : ""}`}
              />
              <datalist id="party-options">
                {partyOptions.map((name) => <option key={name} value={name} />)}
              </datalist>
              {formErrors.partyName && <p className="mt-1 text-xs text-danger">{formErrors.partyName}</p>}
            </div>
            <div>
              <label className="label">Owner *</label>
              {addingOwner ? (
                <input
                  value={form.partnerName}
                  onChange={(e) => { setForm((f) => ({ ...f, partnerName: e.target.value })); setFormErrors((er) => ({ ...er, partnerName: "" })); }}
                  placeholder="New owner name"
                  className={`input py-2.5 text-sm${formErrors.partnerName ? " ring-1 ring-danger" : ""}`}
                />
              ) : (
                <select
                  value={form.partnerName}
                  onChange={(e) => {
                    if (e.target.value === "__add__") { setAddingOwner(true); setForm((f) => ({ ...f, partnerName: "" })); return; }
                    setForm((f) => ({ ...f, partnerName: e.target.value })); setFormErrors((er) => ({ ...er, partnerName: "" }));
                  }}
                  className={`input py-2.5 text-sm${formErrors.partnerName ? " ring-1 ring-danger" : ""}`}
                >
                  <option value="">Select owner</option>
                  {partners.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                  <option value="__add__">+ Add owner…</option>
                </select>
              )}
              {formErrors.partnerName && <p className="mt-1 text-xs text-danger">{formErrors.partnerName}</p>}
            </div>
            <div>
              <label className="label">Amount (Rs) *</label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); setFormErrors((er) => ({ ...er, amount: "" })); }}
                className={`input py-2.5 text-sm${formErrors.amount ? " ring-1 ring-danger" : ""}`}
              />
              {formErrors.amount && <p className="mt-1 text-xs text-danger">{formErrors.amount}</p>}
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="label">Note</label>
              <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional — method, reference, etc." className="input py-2.5 text-sm" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving || !form.partyName || !form.partnerName || !form.amount} className="btn-primary">{saving ? "Saving…" : "Save"}</button>
            <button onClick={() => { setShowForm(false); setAddingOwner(false); }} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-4">
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] text-muted uppercase tracking-wider">Total</p>
          <p className="font-mono font-semibold text-ink tabular-nums">{formatMoney(total)}</p>
        </div>
      </div>

      <FilterBar active={!!(search || dateRange.preset !== "all" || amountMin || amountMax || partnerId)} onClear={clearFilters}>
        <SearchInput value={search} onChange={handleSearch} placeholder={`Search ${partyLabel.toLowerCase()}…`} className="w-full max-w-xs" />
        <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} />
        <AmountRangeFilter min={amountMin} max={amountMax} onChange={(min, max) => handleFilterChange({ amountMin: min, amountMax: max })} />
        <select
          value={partnerId}
          onChange={(e) => handleFilterChange({ partnerId: e.target.value })}
          className="input py-2 text-sm w-auto"
        >
          <option value="">All owners</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </FilterBar>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black/[0.02] border-b border-line">
                <SortHeader col="date" label="Date" sort={sort} onSort={onSort} />
                <th className="th">{partyLabel}</th>
                <th className="th">Owner</th>
                <SortHeader col="amount" label="Amount" sort={sort} onSort={onSort} align="right" />
                <th className="th">Note</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody key={rowsFadeKey} className={loading ? "divide-y divide-line" : "divide-y divide-line content-fade"}>
              {loading ? <TableSkeleton rows={6} cols={6} /> :
               error ? <tr><td colSpan={6}><ErrorState onRetry={() => { const { from, to } = resolveDateRange(dateRange); load(direction, search, page, sort, from, to, amountMin, amountMax, partnerId); }} compact /></td></tr> :
               rows.length === 0 ? <tr><td colSpan={6}><EmptyState icon={ArrowLeftRight} compact title={search ? "No matches" : "No entries yet"} description={search ? `Nothing matches "${search}".` : `Record your first payment with the "Add Payment" button.`} /></td></tr> :
               rows.map((r) => (
                <tr key={r.id} className="hover:bg-black/[0.015] transition-colors">
                  <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3 text-ink font-medium">{r.partyName}</td>
                  <td className="px-4 py-3 text-muted">{r.partnerName}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(r.amount)}</td>
                  <td className="px-4 py-3 text-muted text-xs">{r.note || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button onClick={() => handleDelete(r.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/60 hover:text-danger hover:bg-danger-tint transition-colors" aria-label="Delete entry">
                      <Trash2 className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && <tfoot><tr className="border-t border-line bg-black/[0.02]"><td colSpan={3} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{search ? "Total (filtered)" : "Total"}</td><td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(total)}</td><td colSpan={2} /></tr></tfoot>}
          </table>
        </div>
        {!loading && !error && <Pagination page={page} total={count} pageSize={PAGE_SIZE} onPage={goPage} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. If `AmountRangeFilter`, `SearchInput`, `DateRangeFilter`, `SortHeader`, `TableSkeleton`, or `EmptyState` prop names differ slightly from this draft, fix the call sites to match their actual exported signatures (check `src/components/*.tsx`) — this page intentionally copies the exact call shapes already used in `src/app/dashboard/purchasing/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/payments/page.tsx
git commit -m "feat(payments): add Payments Received/Sent dashboard page"
```

---

### Task 10: Sidebar nav entry + end-to-end manual verification

**Files:**
- Modify: `src/app/dashboard/sidebar.tsx:11-32`

**Interfaces:**
- Consumes: everything from Tasks 1-9.

- [ ] **Step 1: Add the nav entry**

In `src/app/dashboard/sidebar.tsx`, add `ArrowLeftRight` to the lucide-react import on line 11-22:

```ts
import {
  LayoutGrid,
  Users,
  TrendingUp,
  TrendingDown,
  Receipt,
  Wallet,
  ArrowLeftRight,
  BarChart3,
  LogOut,
  Search,
  ChevronLeft,
} from "lucide-react";
```

Then add the nav item to the `NAV` array (line 24-32), between Salary and Profit & Loss:

```ts
const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/sales", label: "Sales", icon: TrendingUp },
  { href: "/dashboard/purchasing", label: "Purchasing", icon: TrendingDown },
  { href: "/dashboard/expenses", label: "Expenses", icon: Receipt },
  { href: "/dashboard/salary", label: "Salary", icon: Wallet },
  { href: "/dashboard/payments", label: "Payments", icon: ArrowLeftRight },
  { href: "/dashboard/pnl", label: "Profit & Loss", icon: BarChart3 },
];
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Full manual walkthrough in the browser**

Run: `npm run dev`, sign in, open `/dashboard/payments`.

1. **Received tab**, click "+ Add Payment": date today, Party = an existing customer's exact name (autocomplete should suggest it from the datalist), Owner = "Mubashir", Amount = 5000, Note = "Test received". Save.
   - Expected: row appears in the table; toast "Payment received recorded".
   - Open that customer's ledger page (`/dashboard/customers/[id]`) — expected: a new credit row for 5000 with no product (renders as the existing "Payment Received" band), and their balance drops by 5000.
2. **Sent tab**: Party = "Test Supplier Co" (a brand-new name, not a customer), Owner → "+ Add owner…" → type "Imran", Amount = 2000. Save.
   - Expected: row appears; a new "Imran" option now shows up in the Owner dropdown on reload.
3. Filter the Sent tab by Owner = "Imran" — expected: only the row just added shows.
4. Delete the Received-tab test row — expected: it disappears from the table, and the customer's ledger balance reverts (re-open their ledger page to confirm the credit row is gone and balance is back to what it was before step 1).
5. Reload the page with the browser's back/forward buttons after applying a filter — expected: the URL carries `?direction=…&partnerId=…` etc. and the filter state restores (matches the existing URL-sync behavior on Purchasing/Salary).

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/sidebar.tsx
git commit -m "feat(payments): add Payments nav entry"
```

---

## Self-Review Notes

- **Spec coverage:** Owner tracking (§3 data model, transactions.partnerAccountId) → Tasks 1-2, 4, 7, 9. Counterparty visibility with auto-link/auto-create (§3) → Tasks 2, 7. Customer ledger mirroring with zero changes to the ledger page (§3) → Task 4. Filters matching existing pattern (§3 UI) → Task 9. Phase 2 explicitly deferred, not silently dropped → noted above and in the spec §3.
- **Type consistency:** `PostPaymentInput` (Task 4) fields match exactly what `POST /api/payments` (Task 7) constructs. `Row`/`Partner` types in the page (Task 9) match the JSON shapes returned by Tasks 6-7. `recalcAccountBalances` name is used consistently across Tasks 3, 4, 8.
- **No placeholders:** every step has complete, runnable code — no "similar to Task N" shortcuts.
