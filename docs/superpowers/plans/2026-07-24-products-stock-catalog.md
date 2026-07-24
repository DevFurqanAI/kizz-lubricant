# Products & Stock Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Products catalog (Oil/Grease category) with per-SKU stock tracking, and wire Sales/Purchasing to reference it via a pick-or-add-inline combobox.

**Architecture:** Two new tables — `products` (catalog) and `product_stock` (running quantity per exact `(product, packing, unit)` SKU, same incremental-balance idiom as `customer_entries.balance`). `sales`/`purchasing` gain an optional `productId`; every insert/delete that references a product also posts a signed delta to `product_stock` via a single atomic `INSERT ... ON CONFLICT ... DO UPDATE` (upsert), so there's no separate read-then-write race and no interactive transaction needed (the Neon HTTP driver can't run those — see `src/lib/ledger.ts:12-14`). A new Products page lists/filters by category and shows live stock; Sales/Purchasing forms get a product combobox with inline "add new product" fed from `datalist`, following the exact pattern already used for party names on the Payments page (`src/app/dashboard/payments/page.tsx:364-374`).

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, Neon Postgres (HTTP driver — no interactive multi-statement transactions), NextAuth session guard on every API route, Tailwind CSS. No test runner exists in this repo (no `jest`/`vitest` in `package.json`) — verification is `npx tsc --noEmit`, `npm run lint`, and manual browser checks against the dev server, matching how the rest of the app is verified.

## Global Constraints

- Every API route must start with the `getServerSession(authOptions)` guard used by every existing route (e.g. `src/app/api/purchasing/route.ts:14-16`) — unauthenticated requests get `401`.
- All money/qty columns are `numeric`; send values through `String(x)` before inserting, matching every existing route.
- The Neon HTTP driver cannot run interactive transactions — any multi-insert flow that can partially fail must clean up on error, matching `src/app/api/sales/route.ts:119-178`.
- Schema changes are applied with `npm run db:push` (Drizzle push workflow — no `drizzle/` migrations directory).
- Follow existing file conventions: routes under `src/app/api/**/route.ts`, dashboard pages under `src/app/dashboard/**/page.tsx`, shared logic in `src/lib/**`.
- No unit conversion between packing sizes — stock is tracked per exact `(productId, packing, unit)` combination (per `docs/superpowers/specs/2026-07-24-products-stock-and-expense-tracking-design.md` Part A).

---

### Task 1: Schema — `products`, `product_stock`, and the new FK columns

**Files:**
- Modify: `src/db/schema.ts:78-112` (insert new tables after `customerEntries`, before `sales`; add columns to `sales` and `purchasing`)

**Interfaces:**
- Produces: `products` table (`id`, `name`, `category`, `createdAt`), `productStock` table (`id`, `productId`, `packing`, `unit`, `stockQty`, `createdAt`), `sales.productId: number | null`, `purchasing.productId/packing/unit/qty/rate` — every later task in this plan reads/writes these exact Drizzle-camelCase names.

- [ ] **Step 1: Add the `products` and `product_stock` tables**

In `src/db/schema.ts`, right after the `customerEntries` table closes (currently ends at line 75) and before `// ─── Sales ───`, insert:

```ts
// ─── Products ──────────────────────────────────────────────────
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 16 }).notNull(), // 'oil' | 'grease'
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("products_name_unique").on(sql`lower(${t.name})`),
]);

// ─── Product Stock ───────────────────────────────────────────────
// One row per exact SKU as it appears on the ledger — e.g. "Kizz D4 / 4*4 /
// crtn" and "Kizz D4 / 2*8 / crtn" are tracked separately, never summed
// together (no unit conversion between packing sizes — see the design spec).
// stockQty is a running total: purchase referencing this SKU adds, sale
// referencing it subtracts, via a single atomic upsert in src/lib/stock.ts.
// packing/unit default to "" (not null) so the unique index below actually
// enforces one row per SKU — Postgres treats NULL as distinct from NULL in
// unique constraints, which would otherwise let duplicate "no packing" rows
// through.
export const productStock = pgTable("product_stock", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  packing: varchar("packing", { length: 100 }).notNull().default(""),
  unit: varchar("unit", { length: 50 }).notNull().default(""),
  stockQty: numeric("stock_qty", { precision: 14, scale: 3 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("product_stock_sku_unique").on(t.productId, t.packing, t.unit),
]);
```

- [ ] **Step 2: Add `productId` to `sales`**

In the `sales` table (currently lines 78-101), add the column right after `customerId`:

```ts
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  // Optional link to the Products catalog — purely for stock tracking; the
  // free-text detail/packing/unit/rate fields above stay authoritative for
  // what's shown on the ledger/receipt. Null = not tracked in stock (e.g. a
  // one-off/misc sale).
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
```

- [ ] **Step 3: Add product fields to `purchasing`**

The `purchasing` table (currently lines 104-112) is just `date`/`detail`/`amount`. Add optional fields, mirroring the shape already on `sales`:

```ts
export const purchasing = pgTable("purchasing", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  detail: varchar("detail", { length: 400 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  // Optional stock link — same meaning as sales.productId. All four are
  // null together for a misc/cash purchase with no stock effect.
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  packing: varchar("packing", { length: 100 }),
  unit: varchar("unit", { length: 50 }),
  qty: numeric("qty", { precision: 12, scale: 3 }),
  rate: numeric("rate", { precision: 14, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("purchasing_date_idx").on(t.date.desc(), t.id.desc()),
]);
```

- [ ] **Step 4: Add the type exports**

Near the bottom of `src/db/schema.ts`, alongside the other `export type` lines:

```ts
export type Product = typeof products.$inferSelect;
export type ProductStock = typeof productStock.$inferSelect;
```

- [ ] **Step 5: Push the schema**

Run: `npm run db:push`
Expected: Drizzle reports two new tables (`products`, `product_stock`) and new nullable columns on `sales`/`purchasing`, no destructive changes. Accept any prompts about new FK columns (all nullable, non-breaking).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -f src/db/schema.ts
git commit -m "feat(products): add products + product_stock tables, link sales/purchasing"
```

---

### Task 2: `src/lib/stock.ts` — find-or-create product, atomic stock adjustment

**Files:**
- Create: `src/lib/stock.ts`

**Interfaces:**
- Consumes: `db` from `@/db`, `products`/`productStock` tables from `@/db/schema` (Task 1).
- Produces: `findOrCreateProduct(name: string, category?: "oil" | "grease"): Promise<number>`, `adjustStock(productId: number | null, packing: string | null, unit: string | null, qtyDelta: string | null): Promise<void>` — Tasks 5, 6, 7 call both by these exact signatures.

- [ ] **Step 1: Write the module**

```ts
import { db } from "@/db";
import { products } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * Find an existing product by case-insensitive name, or create one.
 * `category` is only used on create (a new product with no category
 * defaults to 'oil' — the caller's form should always pass one when
 * creating, this is just a safe fallback for stray calls).
 *
 * Same race-safe idiom as findOrCreatePartyAccount in src/lib/accounts.ts:
 * `products.name` carries a case-insensitive unique index, so concurrent
 * calls for the same new name race on the DB's constraint instead of the
 * app — the loser's INSERT returns no row and falls back to a SELECT.
 */
export async function findOrCreateProduct(name: string, category?: "oil" | "grease"): Promise<number> {
  const trimmed = name.trim();
  const [match] = await db
    .select({ id: products.id })
    .from(products)
    .where(sql`lower(${products.name}) = lower(${trimmed})`)
    .limit(1);
  if (match) return match.id;

  const createdRows = await db.execute(sql`
    INSERT INTO products (name, category) VALUES (${trimmed}, ${category ?? "oil"})
    ON CONFLICT (lower(name)) DO NOTHING
    RETURNING id
  `);
  let created = (createdRows.rows as { id: number }[])[0];
  if (!created) {
    [created] = await db
      .select({ id: products.id })
      .from(products)
      .where(sql`lower(${products.name}) = lower(${trimmed})`)
      .limit(1);
  }
  return created.id;
}

/**
 * Post a signed quantity delta against one product's SKU (exact packing +
 * unit combination — no unit conversion, see docs/superpowers/specs/…
 * Part A). No-op when there's nothing to adjust (no product picked, or no
 * qty given).
 *
 * A single atomic upsert, not a read-then-write: the Neon HTTP driver can't
 * run interactive transactions, and a separate SELECT+UPDATE would race
 * under concurrent writes to the same SKU. `packing`/`unit` are coalesced to
 * "" to match the NOT NULL DEFAULT '' columns (see Task 1) — the unique
 * index needs real matching values, not NULLs, to actually de-duplicate.
 *
 * Call with a negative delta to reverse a previous call (e.g. deleting a
 * sale that reduced stock should call this again with the same qty
 * positive).
 */
export async function adjustStock(
  productId: number | null,
  packing: string | null,
  unit: string | null,
  qtyDelta: string | null,
): Promise<void> {
  if (productId == null || qtyDelta == null) return;
  const delta = Number(qtyDelta);
  if (!Number.isFinite(delta) || delta === 0) return;

  const pack = packing?.trim() || "";
  const u = unit?.trim() || "";

  await db.execute(sql`
    INSERT INTO product_stock (product_id, packing, unit, stock_qty)
    VALUES (${productId}, ${pack}, ${u}, ${String(delta)})
    ON CONFLICT (product_id, packing, unit)
    DO UPDATE SET stock_qty = product_stock.stock_qty + EXCLUDED.stock_qty
  `);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stock.ts
git commit -m "feat(products): add findOrCreateProduct + atomic adjustStock helpers"
```

---

### Task 3: `validatePurchase` — extend validation for the new optional fields

**Files:**
- Modify: `src/lib/validation.ts:160-167` (right after `validateAmountEntry`)

**Interfaces:**
- Consumes: `checkQty`, `checkMoney`, `checkOptionalText`, `active`, `set` (all already defined above in this file).
- Produces: `validatePurchase(b, mode?): FieldErrors` — Task 5 (`POST /api/purchasing`) calls this instead of `validateAmountEntry`.

- [ ] **Step 1: Add the validator**

```ts
/** Purchasing's optional stock-link fields — all four travel together (see design spec Part A). */
export function validatePurchase(b: Record<string, unknown>, mode: Mode = "create"): FieldErrors {
  const e = validateAmountEntry(b, mode);
  if (active(b, "packing", mode)) set(e, "packing", checkOptionalText(b.packing, "Packing", 100));
  if (active(b, "unit", mode)) set(e, "unit", checkOptionalText(b.unit, "Unit", 50));
  if (active(b, "qty", mode)) set(e, "qty", checkQty(b.qty));
  if (active(b, "rate", mode)) set(e, "rate", checkMoney(b.rate, "Rate"));
  return e;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/validation.ts
git commit -m "feat(products): add validatePurchase for the optional stock-link fields"
```

---

### Task 4: `GET/POST /api/products` and `PATCH/DELETE /api/products/[id]`

**Files:**
- Create: `src/app/api/products/route.ts`
- Create: `src/app/api/products/[id]/route.ts`

**Interfaces:**
- Consumes: `products`, `productStock` tables (Task 1), `findOrCreateProduct` (Task 2).
- Produces: `GET /api/products?category=oil|grease&search=` → `{ rows: { id, name, category, skus: { packing, unit, stockQty }[] }[] }`; `POST /api/products` body `{ name, category }` → created row; `PATCH /api/products/[id]` body `{ name?, category? }`; `DELETE /api/products/[id]`. Task 6 (Products page) and Task 7 (Sales combobox) call these.

- [ ] **Step 1: Write the list + create route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { products, productStock } from "@/db/schema";
import { asc, eq, ilike, and, sql } from "drizzle-orm";
import { checkRequiredText, checkOptionalText, hasErrors, firstError, type FieldErrors } from "@/lib/validation";

export const dynamic = "force-dynamic";

function validateProduct(b: Record<string, unknown>, mode: "create" | "update" = "create"): FieldErrors {
  const e: FieldErrors = {};
  if (mode === "create" || "name" in b) {
    const err = checkRequiredText(b.name, "Name", 200);
    if (err) e.name = err;
  }
  if (mode === "create" || "category" in b) {
    if (b.category !== "oil" && b.category !== "grease") e.category = "Category must be 'oil' or 'grease'.";
  }
  return e;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const category = req.nextUrl.searchParams.get("category");
    const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
    const conditions = [
      category === "oil" || category === "grease" ? eq(products.category, category) : undefined,
      search ? ilike(products.name, `%${search}%`) : undefined,
    ].filter((c) => c !== undefined);
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db.select().from(products).where(where).orderBy(asc(products.name));
    const skus = await db.select().from(productStock);
    const skusByProduct = new Map<number, typeof skus>();
    for (const s of skus) {
      const list = skusByProduct.get(s.productId) ?? [];
      list.push(s);
      skusByProduct.set(s.productId, list);
    }
    const result = rows.map((p) => ({ ...p, skus: skusByProduct.get(p.id) ?? [] }));
    return NextResponse.json({ rows: result });
  } catch (err) {
    console.error("GET /products failed:", err);
    return NextResponse.json({ error: "Failed to load products." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const errors = validateProduct(body);
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });
    const [row] = await db
      .insert(products)
      .values({ name: String(body.name).trim(), category: body.category })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("POST /products failed:", err);
    return NextResponse.json({ error: "Failed to add product." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write the `[id]` route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseIdParam } from "@/lib/pagination";
import { checkRequiredText, hasErrors, firstError, type FieldErrors } from "@/lib/validation";

export const dynamic = "force-dynamic";

function validateUpdate(b: Record<string, unknown>): FieldErrors {
  const e: FieldErrors = {};
  if ("name" in b) {
    const err = checkRequiredText(b.name, "Name", 200);
    if (err) e.name = err;
  }
  if ("category" in b && b.category !== "oil" && b.category !== "grease") {
    e.category = "Category must be 'oil' or 'grease'.";
  }
  return e;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseIdParam(params.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    const b = await req.json();
    const errors = validateUpdate(b);
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });
    const update: Record<string, unknown> = {};
    if ("name" in b) update.name = String(b.name).trim();
    if ("category" in b) update.category = b.category;
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
    }
    const [row] = await db.update(products).set(update).where(eq(products.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    console.error("PATCH /products/[id] failed:", err);
    return NextResponse.json({ error: "Failed to update product." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = parseIdParam(params.id);
    if (id === null) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    // product_stock rows cascade-delete (onDelete: "cascade" — Task 1); any
    // sales/purchasing rows referencing this product keep their history,
    // their productId just goes null (onDelete: "set null").
    await db.delete(products).where(eq(products.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /products/[id] failed:", err);
    return NextResponse.json({ error: "Failed to delete product." }, { status: 500 });
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, sign in, then from the browser console or a REST client:
```
POST /api/products { "name": "Kizz D4", "category": "oil" } → 201
GET /api/products?category=oil → includes "Kizz D4" with skus: []
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/products
git commit -m "feat(products): add GET/POST /api/products and PATCH/DELETE /api/products/[id]"
```

---

### Task 5: Wire stock adjustment into Sales (create, edit, delete)

**Files:**
- Modify: `src/app/api/sales/route.ts` (POST handler, lines 87-185)
- Modify: `src/app/api/sales/[id]/route.ts` (DELETE lines 15-48, PATCH lines 50-124)

**Interfaces:**
- Consumes: `adjustStock` (Task 2).
- Produces: nothing new consumed by later tasks — this task is a leaf.

- [ ] **Step 1: Accept `productId` in `POST /api/sales` and adjust stock**

In `src/app/api/sales/route.ts`, add `productId` to the destructured body (line 92) and pass it through to the insert (line 110), then adjust stock right after the insert succeeds (after line 111, before the `if (custId)` block):

```ts
    const { date, detail, packing, unit, qty, rate, amount, saleKg, saleKgUnit, customerId, productId, paidNow, paidMethod, paidNote } = body;
```
```ts
    const [row] = await db
      .insert(sales)
      .values({ date, detail, packing: num(packing), unit: num(unit), qty: num(qty), rate: num(rate), amount: String(amount), saleKg: kg, saleKgUnit: kgUnit, customerId: custId, productId: productId ? Number(productId) : null })
      .returning();

    // A sale reduces stock. Best-effort in the sense that a stock-adjust
    // failure here doesn't roll back the sale itself — stock is a secondary,
    // derived number, unlike the customer ledger below which IS the money
    // record and must stay consistent.
    if (productId) {
      await adjustStock(Number(productId), num(packing), num(unit), qty ? String(-Number(qty)) : null).catch((err) => {
        console.error("POST /sales stock adjustment failed (non-fatal):", err);
      });
    }
```

Add the import at the top:
```ts
import { adjustStock } from "@/lib/stock";
```

- [ ] **Step 2: Reverse stock on `DELETE /api/sales/[id]`**

In `src/app/api/sales/[id]/route.ts`, the existing `SELECT` (lines 21-24) needs `productId`, `packing`, `unit`, `qty` added so the reversal has what it needs:

```ts
    const [existing] = await db
      .select({ customerId: sales.customerId, ledgerEntryId: sales.ledgerEntryId, productId: sales.productId, packing: sales.packing, unit: sales.unit, qty: sales.qty })
      .from(sales)
      .where(eq(sales.id, id));
```

Then, after the sale row is deleted successfully (after line 34, inside the `try` block, before the `catch`):

```ts
      await db.delete(sales).where(eq(sales.id, id));
      if (existing?.productId) {
        await adjustStock(existing.productId, existing.packing, existing.unit, existing.qty ? String(Number(existing.qty)) : null).catch((err) => {
          console.error("DELETE /sales/[id] stock reversal failed (non-fatal):", err);
        });
      }
```

Add the import:
```ts
import { adjustStock } from "@/lib/stock";
```

- [ ] **Step 3: Reverse-old + apply-new stock on `PATCH /api/sales/[id]`**

In `src/app/api/sales/[id]/route.ts`, the handler already fetches `before` (line 78) and computes `row` (line 79) after the update. Right after `const [row] = await db.update(sales)...` (line 79), before the ledger-mirror block:

```ts
    // Stock follow-up: reverse whatever the OLD row posted, then apply
    // whatever the NEW row should post — using `before` (pre-update) and
    // `row` (post-update) so this is correct whether productId, packing,
    // unit, or qty changed (or several at once).
    if (before?.productId) {
      await adjustStock(before.productId, before.packing, before.unit, before.qty ? String(Number(before.qty)) : null).catch((err) => {
        console.error("PATCH /sales/[id] stock reversal failed (non-fatal):", err);
      });
    }
    if (row?.productId) {
      await adjustStock(row.productId, row.packing, row.unit, row.qty ? String(-Number(row.qty)) : null).catch((err) => {
        console.error("PATCH /sales/[id] stock re-apply failed (non-fatal):", err);
      });
    }
```

Add the import:
```ts
import { adjustStock } from "@/lib/stock";
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

With the dev server running: create a product via `POST /api/products`, then post a sale with that `productId`, `packing`, `unit`, `qty: 5` — `GET /api/products?category=oil` should show `stockQty: "-5.000"` for that SKU. Delete the sale — stock should return to `0`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/sales
git commit -m "feat(products): adjust product stock on sale create/edit/delete"
```

---

### Task 6: Wire stock adjustment into Purchasing (create only — no edit/delete route exists yet)

**Files:**
- Modify: `src/app/api/purchasing/route.ts` (POST handler, lines 47-61)

**Interfaces:**
- Consumes: `adjustStock` (Task 2), `validatePurchase` (Task 3).

- [ ] **Step 1: Accept product fields and adjust stock on create**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { purchasing } from "@/db/schema";
import { asc, desc, sql, ilike, and, gte, lte } from "drizzle-orm";
import { parseListParams } from "@/lib/pagination";
import { validatePurchase, hasErrors, firstError } from "@/lib/validation";
import { adjustStock } from "@/lib/stock";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const SORT = { date: purchasing.date, amount: purchasing.amount } as const;

// ...GET handler unchanged...

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { date, detail, amount, productId, packing, unit, qty, rate } = body;
    const errors = validatePurchase(body);
    if (hasErrors(errors)) return NextResponse.json({ error: firstError(errors), fields: errors }, { status: 400 });
    const [row] = await db
      .insert(purchasing)
      .values({
        date, detail, amount: String(amount),
        productId: productId ? Number(productId) : null,
        packing: num(packing), unit: num(unit), qty: num(qty), rate: num(rate),
      })
      .returning();

    // A purchase adds stock. Non-fatal on failure — same reasoning as Sales
    // (Task 5): stock is a derived number, the purchase record itself is
    // what matters most.
    if (productId) {
      await adjustStock(Number(productId), num(packing), num(unit), qty ? String(Number(qty)) : null).catch((err) => {
        console.error("POST /purchasing stock adjustment failed (non-fatal):", err);
      });
    }

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("POST /purchasing failed:", err);
    return NextResponse.json({ error: "Failed to add purchase." }, { status: 500 });
  }
}
```

(Only the `import`s and `POST` body change — the existing `GET` handler at the top of the file is untouched.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

`POST /api/purchasing` with a `productId`/`packing`/`unit`/`qty: 10` — `GET /api/products` should show `stockQty` increase by `10` for that SKU.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/purchasing/route.ts
git commit -m "feat(products): adjust product stock on purchase create"
```

---

### Task 7: Products page — list, Oil/Grease filter, add/edit, per-SKU stock

**Files:**
- Create: `src/app/dashboard/products/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/products`, `PATCH/DELETE /api/products/[id]` (Task 4); shared components `EmptyState`, `ErrorState` from `@/components/states`, `useToast` from `@/components/toast`, `useConfirm` from `@/components/confirm`, `api` from `@/lib/api` — same imports every other dashboard page uses (see `src/app/dashboard/expenses/page.tsx:1-23`).
- Produces: the `/dashboard/products` route Task 8's Sales combobox links out to (informationally — no direct code dependency).

- [ ] **Step 1: Write the page**

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Plus, Package, Trash2, Pencil, Check, X } from "lucide-react";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";

type Sku = { id: number; packing: string; unit: string; stockQty: string };
type Product = { id: number; name: string; category: "oil" | "grease"; skus: Sku[] };
type Category = "all" | "oil" | "grease";

export default function ProductsPage() {
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<Category>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ name: string; category: "oil" | "grease" }>({ name: "", category: "oil" });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; category: "oil" | "grease" }>({ name: "", category: "oil" });
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (cat: Category) => {
    setLoading(true); setError(false);
    try {
      const qs = cat === "all" ? "" : `?category=${cat}`;
      const data = await api.get<{ rows: Product[] }>(`/products${qs}`);
      setRows(data.rows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(category); }, [category, load]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required."); return; }
    setSaving(true);
    try {
      await api.post("/products", form);
      setForm({ name: "", category: "oil" });
      setShowForm(false);
      load(category);
      toast.success("Product added");
    } catch {
      toast.error("Couldn't add product");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p: Product) => { setEditingId(p.id); setEditForm({ name: p.name, category: p.category }); };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async (id: number) => {
    try {
      await api.patch(`/products/${id}`, editForm);
      setEditingId(null);
      load(category);
      toast.success("Product updated");
    } catch {
      toast.error("Couldn't update product");
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm({ title: "Delete this product?", message: "Its stock history is removed; past sales/purchases keep their record but lose the product link.", confirmText: "Delete", danger: true }))) return;
    try {
      await api.del(`/products/${id}`);
      load(category);
      toast.success("Product deleted");
    } catch {
      toast.error("Couldn't delete product");
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Products</h1>
          <p className="mt-1 text-sm text-muted">Oil and Grease catalog with live stock per packing size.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add product
        </button>
      </div>

      <div className="flex gap-2 border-b border-line">
        {(["all", "oil", "grease"] as Category[]).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${category === c ? "border-accent text-accent-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {c === "all" ? "All" : c}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="card p-5 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Name *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input py-2.5 text-sm" />
            </div>
            <div>
              <label className="label">Category *</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as "oil" | "grease" }))} className="input py-2.5 text-sm">
                <option value="oil">Oil</option>
                <option value="grease">Grease</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-primary">{saving ? "Saving…" : "Save product"}</button>
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
                <th className="th">Category</th>
                <th className="th">Stock by SKU</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? <TableSkeleton rows={6} cols={4} /> :
               error ? <tr><td colSpan={4}><ErrorState onRetry={() => load(category)} compact /></td></tr> :
               rows.length === 0 ? <tr><td colSpan={4}><EmptyState icon={Package} compact title="No products yet" description="Add your first product with the button above." /></td></tr> :
               rows.map((p) => (
                <tr key={p.id} className="hover:bg-black/[0.015] transition-colors">
                  {editingId === p.id ? (
                    <>
                      <td className="px-4 py-2.5" colSpan={2}>
                        <div className="flex gap-2">
                          <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="input px-2.5 py-1.5 text-sm flex-1" />
                          <select value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value as "oil" | "grease" }))} className="input px-2.5 py-1.5 text-sm w-28">
                            <option value="oil">Oil</option>
                            <option value="grease">Grease</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted text-xs">
                        {p.skus.map((s) => `${s.packing || "—"} / ${s.unit || "—"}: ${Number(s.stockQty).toLocaleString()}`).join(", ") || "No stock yet"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => saveEdit(p.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-success hover:bg-success-tint" aria-label="Save"><Check className="w-4 h-4" strokeWidth={2.5} /></button>
                          <button onClick={cancelEdit} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:bg-black/5" aria-label="Cancel"><X className="w-4 h-4" strokeWidth={2.5} /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-ink font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-muted capitalize">{p.category}</td>
                      <td className="px-4 py-3 text-muted text-xs">
                        {p.skus.map((s) => `${s.packing || "—"} / ${s.unit || "—"}: ${Number(s.stockQty).toLocaleString()}`).join(", ") || "No stock yet"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => startEdit(p)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/40 hover:!text-accent transition-colors" aria-label="Edit product"><Pencil className="w-4 h-4" strokeWidth={2} /></button>
                          <button onClick={() => handleDelete(p.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted/40 hover:!text-danger transition-colors" aria-label="Delete product"><Trash2 className="w-4 h-4" strokeWidth={2} /></button>
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

- [ ] **Step 3: Add the sidebar nav entry**

In `src/app/dashboard/sidebar.tsx`, add `Package` to the `lucide-react` import (line 11-23) and a new entry to `NAV` (after the `Purchasing` row, line 29):

```ts
  { href: "/dashboard/products", label: "Products", icon: Package },
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, sign in, go to `/dashboard/products`. Add an Oil product and a Grease product, confirm the tab filter shows/hides them correctly, edit one, delete one.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/products src/app/dashboard/sidebar.tsx
git commit -m "feat(products): add Products page with Oil/Grease filter and sidebar nav entry"
```

---

### Task 8: Sales page — product combobox (pick existing or add inline)

**Files:**
- Modify: `src/app/dashboard/sales/page.tsx`

**Interfaces:**
- Consumes: `GET /api/products` (Task 4), `findOrCreateProduct` indirectly via `POST /api/sales` now accepting `productId` (Task 5).

- [ ] **Step 1: Load the product list for the combobox**

Near the other `useEffect`-driven option loads (the pattern used for customers on this same page), add state and a fetch:

```ts
const [productOptions, setProductOptions] = useState<{ id: number; name: string; category: string }[]>([]);
```

In the page's mount `useEffect` (the one that calls `load(...)` on mount), add:
```ts
api.get<{ rows: { id: number; name: string; category: string }[] }>("/products").then((d) => setProductOptions(d.rows)).catch(() => {});
```

- [ ] **Step 2: Replace the free-text Detail field with a combobox**

The existing form field list (around line 425-430) renders `detail` as a plain text input via the `{ key: "detail", label: "Detail *", type: "text" }` map entry. Pull `detail` out of that generic map (since it now needs custom markup) and render it explicitly just above the mapped fields:

```tsx
<div>
  <label className="label">Product / Detail *</label>
  <input
    list="product-options"
    value={form.detail}
    onChange={(e) => {
      const val = e.target.value;
      setForm((f) => ({ ...f, detail: val }));
      const match = productOptions.find((p) => p.name.toLowerCase() === val.trim().toLowerCase());
      setForm((f) => ({ ...f, productId: match ? String(match.id) : "" }));
    }}
    placeholder="Pick an existing product or type a new one"
    className="input py-2.5 text-sm"
  />
  <datalist id="product-options">
    {productOptions.map((p) => <option key={p.id} value={p.name} />)}
  </datalist>
</div>
```

Add `productId: ""` to the initial `form` state (and to the reset after save) alongside the existing fields.

- [ ] **Step 3: Handle "new product" on save — prompt for category once**

In `handleSave`, before building the POST body, resolve `productId`: if `form.detail` matches an existing option, use its id; otherwise create the product first (prompting for category via a simple `confirm`-style toggle, matching the "+ Add owner" pattern on the Payments page at `src/app/dashboard/payments/page.tsx:376-398`):

```ts
let productId = form.productId ? Number(form.productId) : null;
if (!productId && form.detail.trim()) {
  const isGrease = window.confirm(`"${form.detail.trim()}" isn't in the catalog yet. Click OK for Grease, Cancel for Oil.`);
  const created = await api.post<{ id: number }>("/products", { name: form.detail.trim(), category: isGrease ? "grease" : "oil" });
  productId = created.id;
}
```

Include `productId` in the `api.post("/sales", { ... })` body.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

On `/dashboard/sales`, type a brand-new product name into Detail, save — confirm it appears afterward on `/dashboard/products`, and that its stock went down by the sale's qty.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/sales/page.tsx
git commit -m "feat(products): add product combobox with inline add to the Sales form"
```

---

### Task 9: Purchasing page — optional product/packing/qty/unit/rate block

**Files:**
- Modify: `src/app/dashboard/purchasing/page.tsx`

**Interfaces:**
- Consumes: `GET /api/products` (Task 4), `POST /api/purchasing` now accepting the optional stock fields (Task 6).

- [ ] **Step 1: Add the optional fields to the form state and UI**

Following the exact same combobox pattern as Task 8 (Sales), add `productId`, `packing`, `unit`, `qty`, `rate` to the Purchasing form's state, and render them as a collapsible "Link to a product (optional)" section below the existing Detail/Amount fields — reusing the `datalist`-backed combobox from Task 8 (same `product-options` markup, same category-prompt-on-create logic in `handleSave`).

- [ ] **Step 2: Include the fields in the POST body**

In `handleSave`, add `productId`, `packing`, `unit`, `qty`, `rate` to the `api.post("/purchasing", { ... })` call — all `undefined`/empty when the optional section was never touched, which the API already treats as "no stock effect" (Task 6).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

On `/dashboard/purchasing`, leave the product section blank and save — confirm it behaves exactly as before (no product, no stock change). Then fill in a product + qty and save — confirm stock on `/dashboard/products` increases.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/purchasing/page.tsx
git commit -m "feat(products): add optional product/stock fields to the Purchasing form"
```

---

## Self-Review Notes

- **Spec coverage:** `products` table ✓ (Task 1), `product_stock` per-SKU ✓ (Task 1/2), Sales combobox + inline add ✓ (Task 8), Purchasing optional block ✓ (Task 9), Products page with Oil/Grease filter ✓ (Task 7), non-goals (no unit conversion, no alerts, no per-warehouse, no supplier-specific stock) — none implemented, matching the spec.
- **No placeholders:** every step has complete code, no TODOs.
- **Type consistency:** `adjustStock(productId, packing, unit, qtyDelta)` signature is identical across Tasks 2, 5, 6. `findOrCreateProduct(name, category?)` used consistently. `Product`/`ProductStock` types match the schema fields used in the Products page's `Sku`/`Product` client types.
