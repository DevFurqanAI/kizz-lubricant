# Design: Product/Stock Catalog + Expense Categorization (Personal, Tour, Staff)

## Why

The client wants Oil and Grease tracked "separately" inside one system (not two
separate systems — see reasoning below), plus several informal Excel sheets
(`office.xlsx`) folded into the app: office expenses with a recipient, a
staff/employee roster, personal (owner) expense tracking, and a "Tour" ledger
split across two parties (Luke M, Universal). The client is non-technical and
was not reachable to confirm details beyond what's captured here — where
ambiguous, the design favors the safer, more complete, and most reversible
reading (see Assumptions).

Two independent sub-features, bundled into one spec per user request. They
don't share code paths; they can be implemented in either order.

---

## Part A — Product & Stock Catalog

### Problem
"Grease separately" is a reporting/inventory need, not a request to fork the
whole system: a customer buying both oil and grease must keep one ledger, one
balance, one payment history. Splitting into two systems would duplicate
customers/payments/balances. Instead: tag every product with a category and
let Sales/Purchasing/Reports filter or group by it.

### Data model
- **`products`** (new): `id`, `name` (unique), `category` (`'oil' | 'grease'`), `createdAt`.
- **`product_stock`** (new): one row per exact SKU as it appears on the ledger —
  `productId`, `packing` (e.g. `"4*4"`), `unit` (e.g. `"crtn"`), `stockQty`,
  `createdAt`. Unique on `(productId, packing, unit)`.
  - **No unit conversion between packing sizes.** Stock is tracked per exact
    (product, packing, unit) combination, not normalized to a common base
    unit — this matches how the client's own ledger already treats
    "Kizz D4 4×4 crtn" and "Kizz D4 2×8 crtn" as distinct line items, and
    avoids requiring the client to define/maintain conversion factors.
  - `stockQty` is a running total: **purchase referencing this SKU → +qty**,
    **sale referencing this SKU → −qty**. Same incremental-balance pattern
    already used for `customer_entries.balance` / `ledger_entries.balance`.
- **`sales.productId`** (new, nullable FK → `products.id`). Existing free-text
  `detail`/`packing`/`unit`/`rate` fields are unchanged and still authoritative
  for what's shown on the ledger/receipt; `productId` is purely the stock link.
- **`purchasing`** (extended): currently just `date`, `detail`, `amount` — no
  qty at all. Add optional `productId`, `packing`, `unit`, `qty`, `rate`
  (mirroring the shape already used on `sales`/`transactions`). All nullable —
  a purchase with no product reference behaves exactly as today (a misc/cash
  purchase, no stock effect).

### UI changes
- **Sales page**: the product field becomes a combobox — pick an existing
  product (auto-fills packing/unit/last rate) or type a new name and get an
  inline "+ Add '{name}' as new product" action that prompts once for
  category (Oil/Grease), creates the `products` row, and continues the sale
  as normal.
- **Purchasing page**: gains the same optional product/packing/qty/unit block
  as Sales. Leaving it blank preserves today's free-text-only behavior.
- **New Products page**: list of products with an Oil/Grease filter (this *is*
  the "grease folder" the client asked for), each showing its packing SKUs and
  current `stockQty`. Add/edit product here too, not only inline from Sales.

### Non-goals (explicitly out of scope)
- No unit conversion/normalization across packing sizes.
- No low-stock alerts or reorder thresholds.
- No per-warehouse or per-location stock.
- No supplier-specific stock tracking.

---

## Part B — Expense Categorization, Personal & Tour Pages, Staff Roster

### Source sheets and where they land
| `office.xlsx` sheet | Verdict |
|---|---|
| **offices expensive** | Existing `expenses` table + new `recipient` field |
| **Staff Name** | New `employees` roster table (doesn't exist today — `salary` only logs payments, not a roster) |
| **Naqi personal** | New Personal Expenses page, tagged to a partner account |
| **Tour expensive** | New Tour page, split into two fixed sub-tabs |
| **Receiving Pyment** / **Pyment Sending** | **No new work.** Already covered by the existing owner-filterable Payments feature (accounts/transactions model) — future entries should go through that page. |
| **Dispatching** | Same pattern as "offices expensive" (recipient-tagged expense); sheet itself was malformed in the source file (merged header spilling across thousands of columns), no separate page requested |

### Data model
- **`expenses`** (extended):
  - `category` (`'office' | 'personal' | 'tour'`), default `'office'` for
    existing rows.
  - `recipient` (varchar, nullable) — who received the money (office/dispatch
    expenses).
  - `partnerAccountId` (nullable FK → `accounts.id`) — which partner's cash
    actually paid for this. When set, posts a real transaction/ledger entry
    that reduces that partner's balance, reusing the same fan-out mechanism
    the Payments feature already uses. Nullable on old rows; required going
    forward for `personal` and `tour` categories (a personal/tour expense
    with no "paid by" doesn't mean anything).
  - `tourGroup` (varchar, nullable) — only set when `category = 'tour'`; one
    of the two fixed values below.
- **`employees`** (new): `id`, `name`, `joiningDate`, `baseSalary`, `createdAt`.
- **`salary.employeeId`** (new, nullable FK → `employees.id`) — same
  pick-existing-or-add-inline pattern as `sales.productId`, so salary payments
  reference the roster instead of retyping the employee's name each time.

### UI changes
- **Expenses page**: gains a category selector; office-category rows keep
  today's shape (+ optional recipient). Personal/tour rows require picking a
  partner account ("paid by").
- **New Personal Expenses page**: same shape as the existing owner-filterable
  Payments page — filter by partner (Naqi, Mubashir, …), list their personal
  expenses, each reducing that partner's real account balance.
- **New Tour page**: two fixed tabs — **Luke M** and **Universal** (these are
  parties/companies the tours relate to, not vehicles or routes). Each tab
  lists `category='tour'` expenses tagged to it, still showing/reducing
  whichever partner actually paid.
- **New Staff/Employee page**: manage the roster (name, joining date, base
  salary). The existing Salary page's employee field becomes a
  pick-or-add-inline combobox against this roster, same UX as Products-in-Sales.

### Non-goals
- No changes to the existing Payments (Received/Sent) feature — Receiving/
  Sending Payment sheets are already served by it.
- No automatic linking of historical `salary.employee` free-text rows to the
  new roster — only new entries use `employeeId`.

---

## Assumptions (ambiguity the client didn't resolve)

1. **Personal/Tour expenses affect real partner balances** (not just a
   categorized log) — client didn't clarify either way; the accounting-correct
   option was chosen since it's what the rest of the app already does for
   partner cash (Payments), and an under-powered log would need re-work later
   if he does want it to reconcile.
2. **Luke M / Universal are a fixed two-tab set**, not an open-ended list of
   tour parties — per client's answer. If a third tour party appears later,
   this needs revisiting (not designed to auto-extend).
3. **Stock is tracked per exact (product, packing, unit)**, not normalized to
   a common unit — chosen for parity with the client's existing manual
   ledger and to avoid conversion-factor setup, per his "similar to what the
   images already have, just... easier to manage" framing.
4. Since the client was unreachable during design, **build first, demo
   second**: nothing here is destructive to existing sales/ledger/expense
   data, so the plan is to ship this and correct course once he reacts to the
   real screens, rather than block on further clarification.

---

## Out of scope for this spec

- Any change to `automation-spec.md`'s unified `transactions`/`ledger_entries`
  model beyond adding the `partnerAccountId` posting path to `expenses` —
  this spec extends the existing legacy `expenses` table rather than
  migrating it onto the unified model in the same pass.
