# Expense Categorization, Personal & Tour Pages, Staff Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `expenses` with a category (office/personal/tour) and a "paid by" partner link that posts real ledger postings against that partner's balance; add a Personal Expenses page (owner-filterable, mirrors Payments) and a Tour page (two fixed tabs: Luke M, Universal); add a Staff/Employee roster and link it to Salary.

**Architecture:** `expenses` gains `category`, `recipient`, `partnerAccountId`, `tourGroup`, and `ledgerEntryId` — the same "mirror into `ledger_entries` + track the mirror's id for edit/delete sync" idiom already used by `sales.ledgerEntryId` and `transactions.mirroredEntryId` (`src/lib/payments.ts`). Setting `partnerAccountId` posts a credit (cash out) against that partner via `recalcAccountBalances` (`src/lib/party-ledger.ts`) — the exact mechanism Payments already uses for partner cash. The existing `/api/expenses` route stays backward-compatible (no `category` in the request = `'office'`, matching every request the current Expenses page already sends); Personal Expenses and Tour are new pages that call the *same* route with `category=personal`/`category=tour`. `employees` is a new roster table; `salary.employeeId` links to it via the same find-or-create-on-save combobox pattern used for parties on the Payments page.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, Neon Postgres (HTTP driver — no interactive multi-statement transactions), NextAuth session guard on every API route, Tailwind CSS. No test runner exists in this repo — verification is `npx tsc --noEmit`, `npm run lint`, and manual browser checks.

## Global Constraints

- Every API route must start with the `getServerSession(authOptions)` guard used by every existing route.
- All money columns are `numeric(14,2)`; send values through `String(x)`/`formatMoney(x)` before inserting, matching every existing route.
- The Neon HTTP driver cannot run interactive transactions — any multi-insert flow that can partially fail must clean up on error (delete what was already created), matching `src/app/api/sales/route.ts:119-178` and `src/lib/payments.ts:92-106`.
- Schema changes are applied with `npm run db:push`.
- Follow existing file conventions: routes under `src/app/api/**/route.ts`, dashboard pages under `src/app/dashboard/**/page.tsx`, shared logic in `src/lib/**`.
- Tour groups are a **fixed two-value set**: `"Luke M"` and `"Universal"` — not an open-ended list (per the design spec's Assumption 2).

---

### Task 1: Schema — `employees` table, `salary.employeeId`, `expenses` category/recipient/partner/tourGroup/mirror

**Files:**
- Modify: `src/db/schema.ts` (insert `employees` table before `salary`; add `employeeId` to `salary`; add columns to `expenses`)

**Interfaces:**
- Produces: `employees` table (`id`, `name`, `joiningDate`, `baseSalary`, `createdAt`), `salary.employeeId: number | null`, `expenses.category/recipient/partnerAccountId/tourGroup/ledgerEntryId` — every later task in this plan reads/writes these exact names.

- [ ] **Step 1: Add the `employees` table**

Insert right before the `// ─── Salary ───` section (currently line 125):

```ts
// ─── Employees ─────────────────────────────────────────────────
// The staff roster — separate from `salary`, which only logs individual
// payments. A payment can (optionally) reference the employee it was paid
// to via `salary.employeeId`, instead of retyping the name every time.
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  joiningDate: date("joining_date").notNull(),
  baseSalary: numeric("base_salary", { precision: 14, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("employees_name_unique").on(sql`lower(${t.name})`),
]);
```

- [ ] **Step 2: Add `employeeId` to `salary`**

In the `salary` table (currently lines 126-135), add after `employee`:

```ts
  employee: varchar("employee", { length: 200 }).notNull(),
  // Optional link to the roster (Task above) — the free-text `employee`
  // column stays authoritative for what's shown/searched; this is purely
  // for the pick-or-add-inline combobox on the Salary page.
  employeeId: integer("employee_id").references(() => employees.id, { onDelete: "set null" }),
```

- [ ] **Step 3: Extend `expenses`**

In the `expenses` table (currently lines 115-123):

```ts
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  detail: varchar("detail", { length: 400 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  // 'office' | 'personal' | 'tour'. Office is the existing/default behavior
  // (plant rent, petrol, repairs — shown on the original Expenses page).
  // Personal = an owner's personal spending; Tour = spending tagged to one
  // of the two fixed tour parties (see tourGroup). Both require a "paid by"
  // partner (below) since they only mean something against real cash.
  category: varchar("category", { length: 16 }).notNull().default("office"),
  // Who received the money (office/dispatch-style expenses). Optional.
  recipient: varchar("recipient", { length: 200 }),
  // Which partner's cash actually paid for this. Nullable on old rows;
  // required going forward for personal/tour (enforced in validation, not
  // the DB, matching how every other optional-then-required field in this
  // codebase is handled). Setting this posts a real ledger_entries credit
  // against the partner — see src/lib/expense-ledger.ts.
  partnerAccountId: integer("partner_account_id").references(() => accounts.id, { onDelete: "set null" }),
  // Only set when category = 'tour'. Fixed two-value set: "Luke M" | "Universal".
  tourGroup: varchar("tour_group", { length: 32 }),
  // Points at the ledger_entries row this expense's partner posting created,
  // so edits/deletes keep both in sync — same pattern as sales.ledgerEntryId.
  ledgerEntryId: integer("ledger_entry_id").references(() => ledgerEntries.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("expenses_date_idx").on(t.date.desc(), t.id.desc()),
]);
```

Note: `expenses` is defined (line 115) *before* `accounts` and `ledgerEntries` (lines 146, 207) in the current file — move the `expenses` table definition to *after* both, so the `.references(() => accounts.id)` / `.references(() => ledgerEntries.id)` calls resolve. (Drizzle table definitions can reference tables declared later in the same file via the arrow-function callback, but keeping the physical order matching dependency order is the existing convention in this file — `sales` already comes after `customers`/`customerEntries` for the same reason.) Moving `expenses` to just after `ledgerEntries` (currently ending at line 218) is the simplest fix.

- [ ] **Step 4: Add type exports**

```ts
export type Employee = typeof employees.$inferSelect;
```

- [ ] **Step 5: Push the schema**

Run: `npm run db:push`
Expected: Drizzle reports the new `employees` table and new nullable columns on `salary`/`expenses`, no destructive changes.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -f src/db/schema.ts
git commit -m "feat(expenses): add employees table, salary.employeeId, expenses category/partner/tour fields"
```

---

### Task 2: `src/lib/employees.ts` — find-or-create employee

**Files:**
- Create: `src/lib/employees.ts`

**Interfaces:**
- Consumes: `employees` table (Task 1).
- Produces: `findOrCreateEmployee(name: string): Promise<number>` — Task 7 (`POST /api/salary`) calls this.

- [ ] **Step 1: Write the module**

```ts
import { db } from "@/db";
import { employees } from "@/db/schema";
import { sql } from "drizzle-orm";

/**
 * Find an existing employee by case-insensitive name, or create one with
 * today's date as joiningDate (the Salary page's inline "new employee" flow
 * doesn't ask for a joining date — it can be corrected later on the Staff
 * page). Same race-safe find-or-create idiom as findOrCreateProduct
 * (src/lib/stock.ts) / findOrCreatePartyAccount (src/lib/accounts.ts).
 */
export async function findOrCreateEmployee(name: string): Promise<number> {
  const trimmed = name.trim();
  const [match] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(sql`lower(${employees.name}) = lower(${trimmed})`)
    .limit(1);
  if (match) return match.id;

  const today = new Date().toISOString().slice(0, 10);
  const createdRows = await db.execute(sql`
    INSERT INTO employees (name, joining_date) VALUES (${trimmed}, ${today})
    ON CONFLICT (lower(name)) DO NOTHING
    RETURNING id
  `);
  let created = (createdRows.rows as { id: number }[])[0];
  if (!created) {
    [created] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(sql`lower(${employees.name}) = lower(${trimmed})`)
      .limit(1);
  }
  return created.id;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/employees.ts
git commit -m "feat(expenses): add findOrCreateEmployee helper"
```

---

### Task 3: `src/lib/expense-ledger.ts` — post/reverse the partner ledger mirror

**Files:**
- Create: `src/lib/expense-ledger.ts`

**Interfaces:**
- Consumes: `ledgerEntries` table (existing), `recalcAccountBalances` from `src/lib/party-ledger.ts` (existing).
- Produces: `postExpensePartnerLedger(partnerAccountId: number, date: string, amount: string): Promise<number>` (returns the new ledger entry id), `deleteExpensePartnerLedger(ledgerEntryId: number, partnerAccountId: number): Promise<void>` — Task 6 (`/api/expenses` routes) calls both.

- [ ] **Step 1: Write the module**

```ts
import { db } from "@/db";
import { ledgerEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recalcAccountBalances } from "@/lib/party-ledger";

/**
 * An expense "paid by" a partner posts a credit (cash out) against that
 * partner's ledger_entries — no transactions row (transactionId stays null;
 * the column is nullable), since this is a simpler one-sided posting than
 * the two-sided fan-out Payments uses. Mirrors the `sales.ledgerEntryId`
 * pattern: the caller stores the returned id on the expense row so a later
 * edit/delete can keep both in sync.
 */
export async function postExpensePartnerLedger(partnerAccountId: number, date: string, amount: string): Promise<number> {
  const [entry] = await db
    .insert(ledgerEntries)
    .values({ accountId: partnerAccountId, transactionId: null, date, debit: "0", credit: amount, balance: "0" })
    .returning();
  await recalcAccountBalances(partnerAccountId);
  return entry.id;
}

/** Reverses postExpensePartnerLedger — deletes the mirror row and recomputes. */
export async function deleteExpensePartnerLedger(ledgerEntryId: number, partnerAccountId: number): Promise<void> {
  await db.delete(ledgerEntries).where(eq(ledgerEntries.id, ledgerEntryId));
  await recalcAccountBalances(partnerAccountId);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/expense-ledger.ts
git commit -m "feat(expenses): add postExpensePartnerLedger / deleteExpensePartnerLedger"
```

---

### Task 4: Validation — `validateExpense`, `validateEmployee`

**Files:**
- Modify: `src/lib/validation.ts` (add after `validateSalary`, currently ending line 176)

**Interfaces:**
- Produces: `validateExpense(b, mode?): FieldErrors`, `validateEmployee(b, mode?): FieldErrors`, `TOUR_GROUPS: readonly string[]` — Task 5 (`/api/employees`) and Task 6 (`/api/expenses`) use these.

- [ ] **Step 1: Add the validators**

```ts
export const TOUR_GROUPS = ["Luke M", "Universal"] as const;

/**
 * Expenses: office/personal/tour. "Paid by" (partnerName) is required for
 * personal/tour (an owner-attributed expense with no owner doesn't mean
 * anything) but stays optional for office, preserving today's behavior.
 * Cross-field checks (partner/tourGroup required based on category) only
 * apply in "create" mode — "update" mode validates only fields actually
 * present in the patch body, same convention as every other validator here.
 */
export function validateExpense(b: Record<string, unknown>, mode: Mode = "create"): FieldErrors {
  const e = validateAmountEntry(b, mode);
  const category = mode === "create" ? (typeof b.category === "string" ? b.category : "office") : undefined;
  if (active(b, "category", mode)) {
    const c = typeof b.category === "string" ? b.category : "office";
    if (!["office", "personal", "tour"].includes(c)) e.category = "Category must be office, personal, or tour.";
  }
  if (active(b, "recipient", mode)) set(e, "recipient", checkOptionalText(b.recipient, "Recipient", 200));
  if (active(b, "partnerName", mode)) {
    const required = category === "personal" || category === "tour";
    set(e, "partnerName", required ? checkRequiredText(b.partnerName, "Paid by", 200) : checkOptionalText(b.partnerName, "Paid by", 200));
  }
  if (active(b, "tourGroup", mode) && category === "tour") {
    if (!TOUR_GROUPS.includes(b.tourGroup as (typeof TOUR_GROUPS)[number])) e.tourGroup = "Tour group must be Luke M or Universal.";
  }
  return e;
}

export function validateEmployee(b: Record<string, unknown>, mode: Mode = "create"): FieldErrors {
  const e: FieldErrors = {};
  if (active(b, "name", mode)) set(e, "name", checkRequiredText(b.name, "Name", 200));
  if (active(b, "joiningDate", mode)) set(e, "joiningDate", checkDate(b.joiningDate, { required: true }));
  if (active(b, "baseSalary", mode)) set(e, "baseSalary", checkMoney(b.baseSalary, "Base Salary"));
  return e;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/validation.ts
git commit -m "feat(expenses): add validateExpense and validateEmployee"
```

---

### Task 5: `GET/POST /api/employees` and `PATCH/DELETE /api/employees/[id]`

**Files:**
- Create: `src/app/api/employees/route.ts`
- Create: `src/app/api/employees/[id]/route.ts`

**Interfaces:**
- Consumes: `employees` table (Task 1), `validateEmployee` (Task 4).
- Produces: `GET /api/employees?search=` → `{ rows: Employee[] }`; `POST /api/employees` → created row; `PATCH/DELETE /api/employees/[id]`. Task 8 (Staff page) and Task 9 (Salary combobox) call these.

- [ ] **Step 1: Write the list + create route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { asc, ilike } from "drizzle-orm";
import { validateEmployee, hasErrors, firstError, formatMoney } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
    const rows = await db
      .select()
      .from(employees)
      .where(search ? ilike(employees.name, `%${search}%`) : undefined)
      .orderBy(asc(employees.name));
    return NextResponse.json({ rows });
  } catch (err) {
    console.error("GET /employees failed:", err);
    return NextResponse.json({ error: "Failed to load employees." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const errors = validateEmployee(body);
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });
    const [row] = await db
      .insert(employees)
      .values({
        name: String(body.name).trim(),
        joiningDate: body.joiningDate,
        baseSalary: body.baseSalary != null && body.baseSalary !== "" ? formatMoney(body.baseSalary) : null,
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("POST /employees failed:", err);
    return NextResponse.json({ error: "Failed to add employee." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write the `[id]` route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseIdParam } from "@/lib/pagination";
import { validateEmployee, hasErrors, firstError, formatMoney } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseIdParam(params.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    const b = await req.json();
    const errors = validateEmployee(b, "update");
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });
    const update: Record<string, unknown> = {};
    if ("name" in b) update.name = String(b.name).trim();
    if ("joiningDate" in b) update.joiningDate = b.joiningDate;
    if ("baseSalary" in b) update.baseSalary = b.baseSalary != null && b.baseSalary !== "" ? formatMoney(b.baseSalary) : null;
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
    }
    const [row] = await db.update(employees).set(update).where(eq(employees.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    console.error("PATCH /employees/[id] failed:", err);
    return NextResponse.json({ error: "Failed to update employee." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseIdParam(params.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    // salary.employeeId is onDelete: "set null" (Task 1) — existing salary
    // history keeps its free-text `employee` name, it just loses the roster link.
    await db.delete(employees).where(eq(employees.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /employees/[id] failed:", err);
    return NextResponse.json({ error: "Failed to delete employee." }, { status: 500 });
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/employees
git commit -m "feat(expenses): add GET/POST /api/employees and PATCH/DELETE /api/employees/[id]"
```

---

### Task 6: `/api/expenses` — category filter, "paid by" partner mirror on create/edit/delete

**Files:**
- Modify: `src/app/api/expenses/route.ts` (whole file)
- Modify: `src/app/api/expenses/[id]/route.ts` (whole file)

**Interfaces:**
- Consumes: `findOrCreatePartnerAccount` (`src/lib/accounts.ts`, existing), `postExpensePartnerLedger`/`deleteExpensePartnerLedger` (Task 3), `validateExpense` (Task 4).
- Produces: `GET /api/expenses?category=&partnerId=&tourGroup=` (all optional; no `category` = `'office'`, exactly matching every request the current Expenses page sends), `POST`/`PATCH`/`DELETE` accepting `category`/`recipient`/`partnerName`/`tourGroup`. Task 10 (Personal Expenses page) and Task 11 (Tour page) call this same route with `category=personal`/`category=tour`.

- [ ] **Step 1: Rewrite `GET`/`POST` in `src/app/api/expenses/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { expenses, accounts } from "@/db/schema";
import { asc, desc, sql, ilike, and, gte, lte, eq } from "drizzle-orm";
import { parseListParams } from "@/lib/pagination";
import { validateExpense, hasErrors, firstError } from "@/lib/validation";
import { findOrCreatePartnerAccount } from "@/lib/accounts";
import { postExpensePartnerLedger } from "@/lib/expense-ledger";

export const dynamic = "force-dynamic";

const SORT = { date: expenses.date, amount: expenses.amount } as const;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { search, page, limit, offset, sort, dir, from, to, amountMin, amountMax } = parseListParams(req, {
      sortable: Object.keys(SORT),
      defaultSort: "date",
    });
    // No `category` param = 'office' — this is exactly what every request
    // from the existing Expenses page already sends, so its behavior is
    // unchanged. Personal Expenses / Tour pages (Tasks 10/11) pass it explicitly.
    const category = req.nextUrl.searchParams.get("category") ?? "office";
    const partnerIdParam = req.nextUrl.searchParams.get("partnerId");
    const partnerId = partnerIdParam ? Number(partnerIdParam) : null;
    const tourGroup = req.nextUrl.searchParams.get("tourGroup");

    const conditions = [
      eq(expenses.category, category),
      search ? ilike(expenses.detail, `%${search}%`) : undefined,
      from ? gte(expenses.date, from) : undefined,
      to ? lte(expenses.date, to) : undefined,
      amountMin != null ? gte(expenses.amount, String(amountMin)) : undefined,
      amountMax != null ? lte(expenses.amount, String(amountMax)) : undefined,
      partnerId != null && Number.isFinite(partnerId) ? eq(expenses.partnerAccountId, partnerId) : undefined,
      tourGroup ? eq(expenses.tourGroup, tourGroup) : undefined,
    ].filter((c) => c !== undefined);
    const where = and(...conditions);
    const col = SORT[sort as keyof typeof SORT];
    const order = dir === "asc" ? [asc(col), asc(expenses.id)] : [desc(col), desc(expenses.id)];

    // The plain office Expenses page only reads its own columns (Row type
    // has no partnerName), so the left join is harmless there — it only
    // matters to Personal Expenses / Tour (Tasks 10/11), which select it.
    const [rows, [{ total, months }], [{ count }]] = await Promise.all([
      db
        .select({
          id: expenses.id,
          date: expenses.date,
          detail: expenses.detail,
          amount: expenses.amount,
          category: expenses.category,
          recipient: expenses.recipient,
          partnerAccountId: expenses.partnerAccountId,
          partnerName: accounts.name,
          tourGroup: expenses.tourGroup,
        })
        .from(expenses)
        .leftJoin(accounts, eq(expenses.partnerAccountId, accounts.id))
        .where(where)
        .orderBy(...order)
        .limit(limit)
        .offset(offset),
      db
        .select({
          total: sql<string>`COALESCE(SUM(amount),0)`,
          months: sql<string>`COUNT(DISTINCT TO_CHAR(date, 'YYYY-MM'))`,
        })
        .from(expenses)
        .where(where),
      db.select({ count: sql<string>`COUNT(*)` }).from(expenses).where(where),
    ]);

    return NextResponse.json({ rows, total: Number(total), months: Number(months), count: Number(count), page, limit });
  } catch (err) {
    console.error("GET /expenses failed:", err);
    return NextResponse.json({ error: "Failed to load expenses." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const errors = validateExpense(body);
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });

    const { date, detail, amount, category, recipient, partnerName, tourGroup } = body as {
      date: string; detail: string; amount: number;
      category?: "office" | "personal" | "tour"; recipient?: string; partnerName?: string; tourGroup?: string;
    };

    const partnerAccountId = partnerName?.trim() ? await findOrCreatePartnerAccount(partnerName) : null;

    const [row] = await db
      .insert(expenses)
      .values({
        date, detail, amount: String(amount),
        category: category ?? "office",
        recipient: recipient?.trim() || null,
        partnerAccountId,
        tourGroup: category === "tour" ? tourGroup ?? null : null,
      })
      .returning();

    if (partnerAccountId) {
      try {
        const ledgerEntryId = await postExpensePartnerLedger(partnerAccountId, date, String(amount));
        await db.update(expenses).set({ ledgerEntryId }).where(eq(expenses.id, row.id));
      } catch (innerErr) {
        console.error("POST /expenses partner ledger mirroring failed, rolling back:", innerErr);
        await db.delete(expenses).where(eq(expenses.id, row.id)).catch(() => {});
        return NextResponse.json(
          { error: "Failed to record this expense against the owner's account. Nothing was saved — please try again." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("POST /expenses failed:", err);
    return NextResponse.json({ error: "Failed to add expense." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Rewrite `src/app/api/expenses/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateExpense, hasErrors, firstError, formatMoney } from "@/lib/validation";
import { parseIdParam } from "@/lib/pagination";
import { findOrCreatePartnerAccount } from "@/lib/accounts";
import { postExpensePartnerLedger, deleteExpensePartnerLedger } from "@/lib/expense-ledger";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseIdParam(params.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    const [existing] = await db
      .select({ partnerAccountId: expenses.partnerAccountId, ledgerEntryId: expenses.ledgerEntryId })
      .from(expenses)
      .where(eq(expenses.id, id));

    await db.delete(expenses).where(eq(expenses.id, id));
    if (existing?.ledgerEntryId && existing.partnerAccountId) {
      await deleteExpensePartnerLedger(existing.ledgerEntryId, existing.partnerAccountId);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /expenses/[id] failed:", err);
    return NextResponse.json({ error: "Failed to delete expense." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseIdParam(params.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    const b = await req.json();
    const errors = validateExpense(b, "update");
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });

    const [before] = await db.select().from(expenses).where(eq(expenses.id, id));
    if (!before) return NextResponse.json({ error: "Expense not found." }, { status: 404 });

    const update: Record<string, unknown> = {};
    if ("date" in b) update.date = b.date;
    if ("detail" in b) update.detail = b.detail;
    if ("amount" in b) update.amount = formatMoney(b.amount);
    if ("recipient" in b) update.recipient = b.recipient?.trim() || null;
    if ("tourGroup" in b) update.tourGroup = b.tourGroup ?? null;

    // "Paid by" resolves to a fresh partnerAccountId whenever partnerName is
    // present in the patch body (even blank — clearing it removes the mirror).
    const touchesPartner = "partnerName" in b;
    const newPartnerAccountId = touchesPartner && b.partnerName?.trim()
      ? await findOrCreatePartnerAccount(b.partnerName)
      : touchesPartner ? null : before.partnerAccountId;
    if (touchesPartner) update.partnerAccountId = newPartnerAccountId;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
    }

    const [row] = await db.update(expenses).set(update).where(eq(expenses.id, id)).returning();

    // Resync the partner ledger mirror: always drop the old one (if any),
    // then create a fresh one against the row's FINAL date/amount/partner —
    // simplest correct approach for a single mirror row (unlike Sales' qty
    // deltas, there's no partial-adjustment math here, just replace).
    try {
      if (before.ledgerEntryId && before.partnerAccountId) {
        await deleteExpensePartnerLedger(before.ledgerEntryId, before.partnerAccountId);
      }
      if (row.partnerAccountId) {
        const ledgerEntryId = await postExpensePartnerLedger(row.partnerAccountId, row.date, row.amount);
        await db.update(expenses).set({ ledgerEntryId }).where(eq(expenses.id, id));
      } else if (row.ledgerEntryId) {
        await db.update(expenses).set({ ledgerEntryId: null }).where(eq(expenses.id, id));
      }
    } catch (mirrorErr) {
      console.error("PATCH /expenses/[id] partner ledger resync failed, reverting:", mirrorErr);
      await db.update(expenses).set({
        date: before.date, detail: before.detail, amount: before.amount, recipient: before.recipient,
        partnerAccountId: before.partnerAccountId, tourGroup: before.tourGroup, ledgerEntryId: before.ledgerEntryId,
      }).where(eq(expenses.id, id)).catch(() => {});
      return NextResponse.json(
        { error: "Failed to update the linked owner's account. The expense was not changed." },
        { status: 500 }
      );
    }

    return NextResponse.json(row);
  } catch (err) {
    console.error("PATCH /expenses/[id] failed:", err);
    return NextResponse.json({ error: "Failed to update expense." }, { status: 500 });
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

With the dev server running: `POST /api/expenses { date, detail: "Test office", amount: 100 }` (no `category`/`partnerName`) → succeeds exactly as before. Then `POST /api/expenses { date, detail: "Test personal", amount: 500, category: "personal", partnerName: "Naqi" }` → 201, and the Naqi partner account's balance (check via `GET /api/accounts/partners` + the partner's ledger, or `/dashboard/personal-expenses` once Task 10 lands) drops by 500.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/expenses
git commit -m "feat(expenses): add category filter + paid-by partner ledger mirror to /api/expenses"
```

---

### Task 7: `/api/salary` — accept `employeeId` via find-or-create

**Files:**
- Modify: `src/app/api/salary/route.ts` (POST handler, lines 51-65)
- Modify: `src/app/api/salary/[id]/route.ts` (PATCH handler, lines 26-49)

**Interfaces:**
- Consumes: `findOrCreateEmployee` (Task 2).

- [ ] **Step 1: Resolve `employeeId` on create**

In `src/app/api/salary/route.ts`, add the import and update `POST`:

```ts
import { findOrCreateEmployee } from "@/lib/employees";
```

```ts
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { date, employee, amount, account } = body;
    const errors = validateSalary(body);
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });
    const employeeId = employee?.trim() ? await findOrCreateEmployee(employee) : null;
    const [row] = await db.insert(salary).values({ date, employee, amount: String(amount), account: account ?? null, employeeId }).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("POST /salary failed:", err);
    return NextResponse.json({ error: "Failed to save salary record" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Resolve `employeeId` on edit (only when the employee name changes)**

In `src/app/api/salary/[id]/route.ts`, add the import and update `PATCH`:

```ts
import { findOrCreateEmployee } from "@/lib/employees";
```

```ts
    if ("employee" in b) {
      update.employee = b.employee;
      update.employeeId = b.employee?.trim() ? await findOrCreateEmployee(b.employee) : null;
    }
```

(Insert this in place of the existing `if ("employee" in b) update.employee = b.employee;` line.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/salary
git commit -m "feat(expenses): link salary payments to the employee roster via employeeId"
```

---

### Task 8: Staff page — employee roster CRUD

**Files:**
- Create: `src/app/dashboard/staff/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/employees`, `PATCH/DELETE /api/employees/[id]` (Task 5).

- [ ] **Step 1: Write the page**

Follow the exact same list/add/edit/delete structure as the Products page (`src/app/dashboard/products/page.tsx`, Products & Stock plan Task 7), but with fields `name` / `joiningDate` (date input) / `baseSalary` (number input, optional) instead of `name`/`category`, no tab filter, and calling `/api/employees` instead of `/api/products`:

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { formatMoney, fmtDate } from "@/lib/utils";
import { Plus, Users, Trash2, Pencil, Check, X } from "lucide-react";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";

type Employee = { id: number; name: string; joiningDate: string; baseSalary: string | null };

export default function StaffPage() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", joiningDate: new Date().toISOString().slice(0, 10), baseSalary: "" });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", joiningDate: "", baseSalary: "" });
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const data = await api.get<{ rows: Employee[] }>("/employees");
      setRows(data.rows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.joiningDate) { toast.error("Name and joining date are required."); return; }
    setSaving(true);
    try {
      await api.post("/employees", { ...form, baseSalary: form.baseSalary ? Number(form.baseSalary) : null });
      setForm({ name: "", joiningDate: new Date().toISOString().slice(0, 10), baseSalary: "" });
      setShowForm(false);
      load();
      toast.success("Employee added");
    } catch {
      toast.error("Couldn't add employee");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (r: Employee) => { setEditingId(r.id); setEditForm({ name: r.name, joiningDate: r.joiningDate.slice(0, 10), baseSalary: r.baseSalary ?? "" }); };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async (id: number) => {
    try {
      await api.patch(`/employees/${id}`, { ...editForm, baseSalary: editForm.baseSalary ? Number(editForm.baseSalary) : null });
      setEditingId(null);
      load();
      toast.success("Employee updated");
    } catch {
      toast.error("Couldn't update employee");
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm({ title: "Delete this employee?", message: "Past salary payments keep their record but lose the roster link.", confirmText: "Delete", danger: true }))) return;
    try {
      await api.del(`/employees/${id}`);
      load();
      toast.success("Employee deleted");
    } catch {
      toast.error("Couldn't delete employee");
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Staff</h1>
          <p className="mt-1 text-sm text-muted">Employee roster — name, joining date, and base salary.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add employee
        </button>
      </div>

      {showForm && (
        <div className="card p-5 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Name *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input py-2.5 text-sm" />
            </div>
            <div>
              <label className="label">Joining Date *</label>
              <input type="date" value={form.joiningDate} onChange={(e) => setForm((f) => ({ ...f, joiningDate: e.target.value }))} className="input py-2.5 text-sm" />
            </div>
            <div>
              <label className="label">Base Salary (Rs)</label>
              <input type="number" value={form.baseSalary} onChange={(e) => setForm((f) => ({ ...f, baseSalary: e.target.value }))} className="input py-2.5 text-sm" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.joiningDate} className="btn-primary">{saving ? "Saving…" : "Save employee"}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black/[0.02] border-b border-line">
                <th className="th">Name</th>
                <th className="th">Joined</th>
                <th className="th text-right">Base Salary</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? <TableSkeleton rows={6} cols={4} /> :
               error ? <tr><td colSpan={4}><ErrorState onRetry={load} compact /></td></tr> :
               rows.length === 0 ? <tr><td colSpan={4}><EmptyState icon={Users} compact title="No employees yet" description="Add your first employee with the button above." /></td></tr> :
               rows.map((r) => (
                <tr key={r.id} className="hover:bg-black/[0.015] transition-colors">
                  {editingId === r.id ? (
                    <>
                      <td className="px-4 py-2.5" colSpan={3}>
                        <div className="flex gap-2">
                          <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="input px-2.5 py-1.5 text-sm flex-1" />
                          <input type="date" value={editForm.joiningDate} onChange={(e) => setEditForm((f) => ({ ...f, joiningDate: e.target.value }))} className="input px-2.5 py-1.5 text-sm w-36" />
                          <input type="number" value={editForm.baseSalary} onChange={(e) => setEditForm((f) => ({ ...f, baseSalary: e.target.value }))} className="input px-2.5 py-1.5 text-sm w-32 text-right font-mono" />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => saveEdit(r.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-success hover:bg-success-tint" aria-label="Save"><Check className="w-4 h-4" strokeWidth={2.5} /></button>
                          <button onClick={cancelEdit} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:bg-black/5" aria-label="Cancel"><X className="w-4 h-4" strokeWidth={2.5} /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-ink font-medium">{r.name}</td>
                      <td className="px-4 py-3 text-muted text-xs">{fmtDate(r.joiningDate)}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink tabular-nums">{r.baseSalary ? formatMoney(r.baseSalary) : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => startEdit(r)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/40 hover:!text-accent transition-colors" aria-label="Edit employee"><Pencil className="w-4 h-4" strokeWidth={2} /></button>
                          <button onClick={() => handleDelete(r.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/40 hover:!text-danger transition-colors" aria-label="Delete employee"><Trash2 className="w-4 h-4" strokeWidth={2} /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

`npm run dev`, sign in, go to `/dashboard/staff`, add/edit/delete an employee.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/staff
git commit -m "feat(expenses): add Staff page (employee roster CRUD)"
```

---

### Task 9: Salary page — employee combobox against the roster

**Files:**
- Modify: `src/app/dashboard/salary/page.tsx`

**Interfaces:**
- Consumes: `GET /api/employees` (Task 5) as the combobox source (in addition to, not instead of, the existing `/salary/employees` distinct-values endpoint which still powers the search filter dropdown — leave that alone).

- [ ] **Step 1: Load the roster for the combobox**

Add state alongside the existing `options` state (line 122):

```ts
const [rosterNames, setRosterNames] = useState<string[]>([]);
```

In the mount `useEffect` (which already calls `api.get<Options>("/salary/employees")` at line 181), add:

```ts
api.get<{ rows: { name: string }[] }>("/employees").then((d) => setRosterNames(d.rows.map((e) => e.name))).catch(() => {});
```

- [ ] **Step 2: Back the Employee field with a `datalist` of roster names**

The existing form field list (around line 348) renders `employee` as a plain text input via the generic `{ key: "employee", label: "Employee *", type: "text" }` map entry. Pull `employee` out of that map and render it explicitly with a `datalist`:

```tsx
<div>
  <label className="label">Employee *</label>
  <input
    list="employee-roster"
    value={form.employee}
    onChange={(e) => setForm((f) => ({ ...f, employee: e.target.value }))}
    placeholder="Pick an existing employee or type a new one"
    className="input py-2.5 text-sm"
  />
  <datalist id="employee-roster">
    {rosterNames.map((n) => <option key={n} value={n} />)}
  </datalist>
</div>
```

(No change needed to `handleSave` — the existing `api.post("/salary", { ...form, amount: Number(form.amount) })` call already sends `employee` as a plain string; Task 7 resolves it server-side via `findOrCreateEmployee`.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

On `/dashboard/salary`, type a brand-new employee name and save — confirm it now appears on `/dashboard/staff` (Task 8) with today's joining date.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/salary/page.tsx
git commit -m "feat(expenses): back the Salary employee field with the roster combobox"
```

---

### Task 10: Personal Expenses page — owner-filterable, mirrors Payments

**Files:**
- Create: `src/app/dashboard/personal-expenses/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/expenses` with `category=personal` (Task 6), `GET /api/accounts/partners` (existing, for the owner dropdown).

- [ ] **Step 1: Write the page**

Structure this exactly like `src/app/dashboard/payments/page.tsx` (owner filter dropdown, `+ Add owner` inline creation in the form, date range + search + amount range filters, sortable table, pagination) but:
- No direction tabs (there's only one direction: an owner spent money).
- Every list/create call fixes `category: "personal"` and always sends `partnerId`/`partnerName` (never omitted — personal expenses require a "paid by" owner, per `validateExpense`'s create-mode rule from Task 4).
- Row shape: `{ id, date, detail, amount, partnerName }` (no `partyName`/`note` — that's Payments-specific; `detail` replaces `partyName` as the primary text field, matching the Expenses row shape).

```tsx
"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { formatMoney, fmtDate } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { SearchInput } from "@/components/search-input";
import { Wallet, Trash2, Pencil, Check, X } from "lucide-react";
import { validateExpense, hasErrors, firstError, type FieldErrors } from "@/lib/validation";

type Row = { id: number; date: string; detail: string; amount: string; partnerAccountId: number | null; partnerName: string | null };
type Partner = { id: number; name: string };
const PAGE_SIZE = 50;

export default function PersonalExpensesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [partners, setPartners] = useState<Partner[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingOwner, setAddingOwner] = useState(false);
  const emptyForm = { date: new Date().toISOString().slice(0, 10), detail: "", partnerName: "", amount: "" };
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ date: "", detail: "", amount: "" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (q: string, p: number, pId: string) => {
    setLoading(true); setError(false);
    try {
      const qs = new URLSearchParams({ category: "personal", search: q, page: String(p), limit: String(PAGE_SIZE) });
      if (pId) qs.set("partnerId", pId);
      const data = await api.get<{ rows: Row[]; total: number; count: number }>(`/expenses?${qs}`);
      setRows(data.rows); setTotal(data.total); setCount(data.count);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("", 1, "");
    api.get<Partner[]>("/accounts/partners").then(setPartners).catch(() => {});
  }, [load]);

  const handleSearch = (v: string) => {
    setSearch(v); setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(v, 1, partnerId), 300);
  };
  const handlePartnerFilter = (v: string) => { setPartnerId(v); setPage(1); load(search, 1, v); };
  const goPage = (p: number) => { setPage(p); load(search, p, partnerId); };

  const handleSave = async () => {
    const payload = { ...form, category: "personal" };
    const errs = validateExpense(payload);
    if (hasErrors(errs)) { setFormErrors(errs); toast.error(firstError(errs)!); return; }
    setFormErrors({});
    setSaving(true);
    try {
      await api.post("/expenses", { ...payload, amount: Number(form.amount) });
      setForm(emptyForm); setAddingOwner(false); setShowForm(false); setPage(1);
      load(search, 1, partnerId);
      api.get<Partner[]>("/accounts/partners").then(setPartners).catch(() => {});
      toast.success("Personal expense recorded");
    } catch { toast.error("Couldn't record expense"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm({ title: "Delete this expense?", message: "This also removes it from the owner's account.", confirmText: "Delete", danger: true }))) return;
    const prevRows = rows;
    setRows((r) => r.filter((row) => row.id !== id));
    try {
      await api.del(`/expenses/${id}`);
      toast.success("Expense deleted");
    } catch {
      setRows(prevRows);
      toast.error("Couldn't delete expense");
    }
  };

  const startEdit = (r: Row) => { setEditId(r.id); setEditForm({ date: r.date.slice(0, 10), detail: r.detail, amount: r.amount }); };
  const saveEdit = async (id: number) => {
    const errs = validateExpense(editForm, "update");
    if (hasErrors(errs)) { toast.error(firstError(errs)!); return; }
    try {
      await api.patch(`/expenses/${id}`, { ...editForm, amount: Number(editForm.amount) });
      setEditId(null);
      load(search, page, partnerId);
      toast.success("Expense updated");
    } catch {
      toast.error("Couldn't update expense");
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[26px] font-semibold text-ink">Personal Expenses</h1>
            {count > 0 && <span className="badge-neutral tabular-nums">{count.toLocaleString()}</span>}
          </div>
          <p className="mt-1 text-sm text-muted">Each owner's personal spending, tracked against their own account.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">+ Add Expense</button>
      </div>

      {showForm && (
        <div className="card p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="input py-2.5 text-sm" />
            </div>
            <div>
              <label className="label">Detail *</label>
              <input value={form.detail} onChange={(e) => { setForm((f) => ({ ...f, detail: e.target.value })); setFormErrors((er) => ({ ...er, detail: "" })); }} className={`input py-2.5 text-sm${formErrors.detail ? " ring-1 ring-danger" : ""}`} />
              {formErrors.detail && <p className="mt-1 text-xs text-danger">{formErrors.detail}</p>}
            </div>
            <div>
              <label className="label">Owner *</label>
              {addingOwner ? (
                <input value={form.partnerName} onChange={(e) => { setForm((f) => ({ ...f, partnerName: e.target.value })); setFormErrors((er) => ({ ...er, partnerName: "" })); }} placeholder="New owner name" className={`input py-2.5 text-sm${formErrors.partnerName ? " ring-1 ring-danger" : ""}`} />
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
              <input type="number" value={form.amount} onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); setFormErrors((er) => ({ ...er, amount: "" })); }} className={`input py-2.5 text-sm${formErrors.amount ? " ring-1 ring-danger" : ""}`} />
              {formErrors.amount && <p className="mt-1 text-xs text-danger">{formErrors.amount}</p>}
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving || !form.detail || !form.partnerName || !form.amount} className="btn-primary">{saving ? "Saving…" : "Save"}</button>
            <button onClick={() => { setShowForm(false); setAddingOwner(false); }} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput value={search} onChange={handleSearch} placeholder="Search…" className="w-full max-w-xs" />
        <select value={partnerId} onChange={(e) => handlePartnerFilter(e.target.value)} className="input py-2 text-sm w-auto">
          <option value="">All owners</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black/[0.02] border-b border-line">
                <th className="th">Date</th>
                <th className="th">Detail</th>
                <th className="th">Owner</th>
                <th className="th text-right">Amount</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? <TableSkeleton rows={6} cols={5} /> :
               error ? <tr><td colSpan={5}><ErrorState onRetry={() => load(search, page, partnerId)} compact /></td></tr> :
               rows.length === 0 ? <tr><td colSpan={5}><EmptyState icon={Wallet} compact title="No entries yet" description={`Record your first personal expense with the "Add Expense" button.`} /></td></tr> :
               rows.map((r) => editId === r.id ? (
                <tr key={r.id} className="bg-accent-tint/40">
                  <td className="px-4 py-2" colSpan={4}>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input type="date" value={editForm.date} onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))} className="input px-2 py-1.5 text-xs w-full sm:w-36" />
                      <input value={editForm.detail} onChange={(e) => setEditForm((f) => ({ ...f, detail: e.target.value }))} className="input px-2 py-1.5 text-sm w-full sm:flex-1" />
                      <input type="number" value={editForm.amount} onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))} className="input px-2 py-1.5 text-sm w-full sm:w-32" />
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button onClick={() => saveEdit(r.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-success hover:bg-success-tint" aria-label="Save"><Check className="w-4 h-4" strokeWidth={2.5} /></button>
                      <button onClick={() => setEditId(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:bg-black/5" aria-label="Cancel"><X className="w-4 h-4" strokeWidth={2.5} /></button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={r.id} className="hover:bg-black/[0.015] transition-colors">
                  <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3 text-ink">{r.detail}</td>
                  <td className="px-4 py-3 text-muted">{r.partnerName ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(r.amount)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => startEdit(r)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/60 hover:text-accent hover:bg-accent-tint" aria-label="Edit"><Pencil className="w-4 h-4" strokeWidth={2} /></button>
                      <button onClick={() => handleDelete(r.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/60 hover:text-danger hover:bg-danger-tint" aria-label="Delete"><Trash2 className="w-4 h-4" strokeWidth={2} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && <tfoot><tr className="border-t border-line bg-black/[0.02]"><td colSpan={3} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Total</td><td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(total)}</td><td /></tr></tfoot>}
          </table>
        </div>
        {!loading && !error && <Pagination page={page} total={count} pageSize={PAGE_SIZE} onPage={goPage} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

`npm run dev`, sign in, go to `/dashboard/personal-expenses`, add an expense for an existing owner and for a brand-new owner (via "+ Add owner…"), filter by owner, edit and delete an entry.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/personal-expenses src/app/api/expenses/route.ts
git commit -m "feat(expenses): add Personal Expenses page, owner-filterable"
```

---

### Task 11: Tour page — two fixed tabs (Luke M, Universal)

**Files:**
- Create: `src/app/dashboard/tour/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/expenses` with `category=tour&tourGroup=` (Task 6), `GET /api/accounts/partners` (existing).

- [ ] **Step 1: Write the page**

Same structure as Task 10's Personal Expenses page, with two differences: (1) a tab bar with exactly two fixed options — `"Luke M"` and `"Universal"` (styled identically to the direction tabs on `src/app/dashboard/payments/page.tsx:342-352`) instead of an owner filter dropdown; (2) every list/create call fixes `category: "tour"` and includes the active tab as `tourGroup`, while the "Owner" field (who actually paid) stays exactly as in Personal Expenses — a tour expense has both a fixed tour-party tab AND a "paid by" owner, per the design spec.

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { formatMoney, fmtDate } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Map, Trash2 } from "lucide-react";
import { validateExpense, hasErrors, firstError, type FieldErrors } from "@/lib/validation";

const TOUR_GROUPS = ["Luke M", "Universal"] as const;
type TourGroup = (typeof TOUR_GROUPS)[number];
type Row = { id: number; date: string; detail: string; amount: string; partnerName: string | null };
type Partner = { id: number; name: string };

export default function TourPage() {
  const [group, setGroup] = useState<TourGroup>("Luke M");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingOwner, setAddingOwner] = useState(false);
  const emptyForm = { date: new Date().toISOString().slice(0, 10), detail: "", partnerName: "", amount: "" };
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (g: TourGroup) => {
    setLoading(true); setError(false);
    try {
      const qs = new URLSearchParams({ category: "tour", tourGroup: g });
      const data = await api.get<{ rows: Row[]; total: number }>(`/expenses?${qs}`);
      setRows(data.rows); setTotal(data.total);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(group);
    api.get<Partner[]>("/accounts/partners").then(setPartners).catch(() => {});
  }, [group, load]);

  const handleSave = async () => {
    const payload = { ...form, category: "tour", tourGroup: group };
    const errs = validateExpense(payload);
    if (hasErrors(errs)) { setFormErrors(errs); toast.error(firstError(errs)!); return; }
    setFormErrors({});
    setSaving(true);
    try {
      await api.post("/expenses", { ...payload, amount: Number(form.amount) });
      setForm(emptyForm); setAddingOwner(false); setShowForm(false);
      load(group);
      api.get<Partner[]>("/accounts/partners").then(setPartners).catch(() => {});
      toast.success(`${group} tour expense recorded`);
    } catch { toast.error("Couldn't record expense"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm({ title: "Delete this expense?", confirmText: "Delete", danger: true }))) return;
    const prevRows = rows;
    setRows((r) => r.filter((row) => row.id !== id));
    try {
      await api.del(`/expenses/${id}`);
      toast.success("Expense deleted");
    } catch {
      setRows(prevRows);
      toast.error("Couldn't delete expense");
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Tour</h1>
          <p className="mt-1 text-sm text-muted">Tour-related spending, split by party.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">+ Add Expense</button>
      </div>

      <div className="flex gap-2 border-b border-line">
        {TOUR_GROUPS.map((g) => (
          <button key={g} onClick={() => setGroup(g)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${group === g ? "border-accent text-accent-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {g}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="card p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="input py-2.5 text-sm" />
            </div>
            <div>
              <label className="label">Detail *</label>
              <input value={form.detail} onChange={(e) => { setForm((f) => ({ ...f, detail: e.target.value })); setFormErrors((er) => ({ ...er, detail: "" })); }} className={`input py-2.5 text-sm${formErrors.detail ? " ring-1 ring-danger" : ""}`} />
              {formErrors.detail && <p className="mt-1 text-xs text-danger">{formErrors.detail}</p>}
            </div>
            <div>
              <label className="label">Paid By *</label>
              {addingOwner ? (
                <input value={form.partnerName} onChange={(e) => { setForm((f) => ({ ...f, partnerName: e.target.value })); setFormErrors((er) => ({ ...er, partnerName: "" })); }} placeholder="New owner name" className={`input py-2.5 text-sm${formErrors.partnerName ? " ring-1 ring-danger" : ""}`} />
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
              <input type="number" value={form.amount} onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); setFormErrors((er) => ({ ...er, amount: "" })); }} className={`input py-2.5 text-sm${formErrors.amount ? " ring-1 ring-danger" : ""}`} />
              {formErrors.amount && <p className="mt-1 text-xs text-danger">{formErrors.amount}</p>}
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving || !form.detail || !form.partnerName || !form.amount} className="btn-primary">{saving ? "Saving…" : "Save"}</button>
            <button onClick={() => { setShowForm(false); setAddingOwner(false); }} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black/[0.02] border-b border-line">
                <th className="th">Date</th>
                <th className="th">Detail</th>
                <th className="th">Paid By</th>
                <th className="th text-right">Amount</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? <TableSkeleton rows={6} cols={5} /> :
               error ? <tr><td colSpan={5}><ErrorState onRetry={() => load(group)} compact /></td></tr> :
               rows.length === 0 ? <tr><td colSpan={5}><EmptyState icon={Map} compact title="No entries yet" description={`Record the first ${group} tour expense with the "Add Expense" button.`} /></td></tr> :
               rows.map((r) => (
                <tr key={r.id} className="hover:bg-black/[0.015] transition-colors">
                  <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3 text-ink">{r.detail}</td>
                  <td className="px-4 py-3 text-muted">{r.partnerName ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(r.amount)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button onClick={() => handleDelete(r.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/60 hover:text-danger hover:bg-danger-tint" aria-label="Delete"><Trash2 className="w-4 h-4" strokeWidth={2} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && <tfoot><tr className="border-t border-line bg-black/[0.02]"><td colSpan={3} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Total</td><td className="px-4 py-3 text-right font-mono font-semibold text-ink tabular-nums">{formatMoney(total)}</td><td /></tr></tfoot>}
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

`npm run dev`, sign in, go to `/dashboard/tour`, add an expense under "Luke M", switch to "Universal" and confirm it's empty there, add one under "Universal" too.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/tour
git commit -m "feat(expenses): add Tour page with Luke M / Universal tabs"
```

---

### Task 12: Sidebar nav entries

**Files:**
- Modify: `src/app/dashboard/sidebar.tsx`

**Interfaces:**
- Consumes: routes from Tasks 8, 10, 11.

- [ ] **Step 1: Add the three new nav entries**

Add `Users` (already imported, line 13), `Map`, and reuse `Wallet` (already imported, line 17) to the `lucide-react` import — only `Map` is new. Add to `NAV` (after the existing `Salary` row):

```ts
  { href: "/dashboard/staff", label: "Staff", icon: Users },
  { href: "/dashboard/personal-expenses", label: "Personal Expenses", icon: Wallet },
  { href: "/dashboard/tour", label: "Tour", icon: Map },
```

Note: `Users` is already used for the "Customers" nav entry — reusing the same icon for two different nav items is fine (Lucide icons aren't unique-per-route elsewhere in this file either), but if a visually distinct icon is preferred, `UserCog` is a reasonable alternative for Staff (add it to the import instead).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

`npm run dev`, sign in, confirm all three new items appear in both the desktop sidebar and the mobile bottom bar, and route correctly.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/sidebar.tsx
git commit -m "feat(expenses): add Staff/Personal Expenses/Tour to the sidebar nav"
```

---

## Self-Review Notes

- **Spec coverage:** office expenses + recipient ✓ (Task 6), Staff/Employee roster ✓ (Tasks 1, 2, 5, 8) linked to Salary ✓ (Tasks 7, 9), Personal Expenses owner-filterable page ✓ (Task 10), Tour page with fixed Luke M/Universal tabs ✓ (Task 11), Dispatching folded into the "office" category pattern (no separate page, per the design spec's verdict table) — not implemented as a distinct feature, matching the spec's explicit non-goal. Receiving/Sending Payment sheets — no work here, already served by the existing Payments feature (confirmed in the design spec, nothing to build).
- **No placeholders:** every step has complete code.
- **Type consistency:** `adjustStock`-equivalent here is `postExpensePartnerLedger(partnerAccountId, date, amount)` / `deleteExpensePartnerLedger(ledgerEntryId, partnerAccountId)` — identical signatures used in Task 3, Task 6 (both POST and PATCH), consistent with each other. `findOrCreateEmployee(name)` used identically in Task 2, Task 7. `TOUR_GROUPS` defined once in `validation.ts` (Task 4) and duplicated as a local const in the Tour page (Task 11) for the client-side tab list — acceptable duplication since the client bundle can't import server-only validation code across the fetch boundary in this codebase's existing conventions (see how `Direction` is redefined client-side on the Payments page too).
