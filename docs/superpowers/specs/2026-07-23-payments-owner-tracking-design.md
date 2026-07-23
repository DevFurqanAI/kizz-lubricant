# Payments (Received / Sent) with Owner Tracking — Design

> Source of truth for what the client asked for: `office.xlsx` → sheets "Receiving
> Pyment" (Date, Amount, Account Name) and "Pyment Sending" (Date, Amount, Name
> transfer company). Neither sheet has an owner column today — that's the gap the
> client wants filled: "who sent/received the money, **and** which of the owners
> handled it."

---

## 1. Problem

The client tracks money in/out in two flat Excel sheets with no structure:
who the counterparty is and which owner (there are currently two — **Mubashir**
and **Naqi** — though a third, **Imran**, may show up later since he appears in
older records) handled the transaction. They want this in the app with filters
by owner, and — per this design — the counterparty side should plug into the
existing party/ledger machinery instead of being a disconnected log.

## 2. Foundation already in place

`src/db/schema.ts` already has an unused "unified model" (see
`docs/automation-spec.md`): `accounts` (parties + partners), `transactions`
(single entry point with a `kind` + fan-out), `ledger_entries` (auto-generated
postings). It was scaffolded exactly for this kind of event and is currently
dead weight — nothing queries it. This feature is the first real consumer.

## 3. Scope

### Phase 1 — Payments Received / Sent (this build)

**Data model**
- `accounts` is the shared party directory going forward for payments:
  - `type: 'partner'` rows = the owners. Seed Mubashir + Naqi; the UI supports
    adding more inline (so Imran, or anyone else, can be added later without a
    migration).
  - `type: 'party'` rows = counterparties (customers or suppliers).
- `customers` gets a new nullable `account_id` FK → `accounts.id`. It stays
  lazily populated: the first time an existing customer is used in a payment,
  their `accounts` row is created and linked. No bulk migration, no risk to
  current ledger data.
- Typing a counterparty with no match (customer or existing party) auto-creates
  a new `accounts` party row on the fly.
- Each payment is one `transactions` row:
  - Received → `kind: 'purchaser_receipt'`
  - Sent → `kind: 'supplier_payment'`
  - `party_account_id` = counterparty, `partner_account_id` = owner who handled it,
    `amount`, `date`, optional `note`.
  - The existing fan-out table (automation-spec §5) already defines the
    postings for both kinds — party debt moves, partner cash ledger moves —
    so `ledger_entries` generation is not new logic, just the first caller.
- **Mirror into `customer_entries` when the party is a linked customer**: same
  pattern `sales.ledgerEntryId` already uses. Received → credit row, Sent →
  debit row, linked back via a `ledgerEntryId`-style FK so edits/deletes stay
  in sync. This means the existing Customer ledger page needs **zero** changes
  — it keeps reading `customer_entries` exactly as it does today.
  - Suppliers (parties with no linked customer) only get `ledger_entries`,
    not a `customer_entries` mirror — there's no customer ledger page for
    them yet (that gap is Phase 2, see below).

**UI**
- New sidebar entry "Payments" → one page, two tabs: **Received** / **Sent**.
  Table columns: Date · Party · Amount · Owner · Note. Add/delete, same
  interaction pattern as Purchasing/Expenses/Salary.
- Party field: type-ahead combobox searching customers + existing parties,
  with "+ Add new" when nothing matches.
- Owner field: dropdown of partner accounts, with "+ Add owner" inline.
- Filters: reuse the existing `FilterBar` component — owner dropdown, amount
  range, date range, URL-synced — matching the Purchasing/Expenses/Salary
  pages exactly (no new filter UI pattern to design).

### Phase 2 — Supplier ledgers (follow-up, not this build)

Right now `purchasing` entries have no party link, so a supplier's history
via Payments will only show their payments, not what was purchased from them
— unlike customers, who get a full ledger (sales debit + payment credit).

Phase 2 closes that gap:
- Add `party_account_id` (nullable) to `purchasing`, same shape as
  `sales.customerId`.
- When a purchase is tagged with a party, mirror a debit-side posting into
  `ledger_entries` for that party (they're owed money → we owe them, per the
  existing `purchase` fan-out row in automation-spec §5).
- Add a party detail page (parallel to the Customer ledger page) showing the
  combined purchase + payment history and running balance for that supplier.
- Not designed in detail here — scoped as a distinct follow-up spec once
  Phase 1 ships and the client has used the Payments page for a bit.

## 4. Out of scope (either phase)

- Migrating Sales/Expenses/Salary onto the unified `transactions` model —
  they keep using their existing dedicated tables. Only Payments (and, in
  Phase 2, Purchasing's party link) touch the unified model for now.
- Multi-currency, partial payments / installments tracking beyond what a
  running balance already gives you.

## 5. Risks / open questions

- `recalcBalances` (see [[ledger-opening-balance-issue]] in memory) currently
  wipes opening balances + manual adjustments on any `customer_entries` write.
  The mirrored payment rows go through the same write path, so this
  pre-existing bug applies here too — not introduced by this feature, but
  worth the owner knowing it's still unresolved.
- Deleting a payment that was mirrored into a customer ledger must delete
  both sides (the `transactions`/`ledger_entries` row and the mirrored
  `customer_entries` row) — same dual-delete care `sales` already takes with
  `ledgerEntryId`.
