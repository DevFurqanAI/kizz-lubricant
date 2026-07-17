# Kizz Lubricants — Automation Spec (single source of truth)

> Goal: every money event is entered **once**; ledgers, category totals, partner
> cash balances, and P&L are all **derived** from that one entry. Replaces the
> manual multi-sheet Excel workflow (`Grease Plant.xlsx`).

The workbook is treated as the spec. Where it is silent or self-contradictory,
we take the most faithful reading, **document the assumption here**, and build it
so it is cheap to change later.

---

## 1. Core idea

```
        transactions          ← the ONLY thing anyone enters
             │ fan-out (automatic, on write)
     ┌───────┴────────┐
     ▼                ▼
 ledger_entries    grouped-by-kind SUMs
 (per account,     (Sale / Purchase /
  running balance) Expense / Salary → P&L)
```

- **`transactions`** — the business event, with all descriptive detail. Single write target.
- **`ledger_entries`** — machine-generated per-account postings with a running balance
  (parties **and** partners). Never entered by hand; regenerated on every write.
- **Category totals / P&L** — live `SUM`s over `transactions` grouped by `kind`.
  No stored totals → nothing can drift.

---

## 2. Roles live on the transaction, not the party

A single party can **both supply to us and buy from us**, so accounts carry **no fixed
supplier/purchaser role**. The *transaction kind* decides direction:

- **purchase** — we buy from the party (they act as supplier). → Purchase total.
- **sale** — we sell to the party on credit (they act as buyer). → Sale total.

The party's ledger is the **complete record of everything** with them, netted into **one
running balance**. Purchaser support is therefore inherent (a credit sale is just
`kind = sale` with a party); the dedicated purchaser UI is left as a stub for now.

---

## 3. Tables

### `accounts` (extends the old `customers`)
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| name | varchar(200) | |
| type | varchar(16) | `party` \| `partner` (Imran, Naqi) |
| opening_balance | numeric(14,2) default 0 | Excel "Opening Balance" row |
| account_title, owner, cnic, address, phone, whatsapp, email | varchar | party contact; null for partners |
| created_at | timestamp | |

### `transactions` (single entry point)
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| date | date | normalized on entry/import |
| kind | varchar(24) | `purchase` \| `sale` \| `supplier_payment` \| `purchaser_receipt` \| `expense` \| `salary` \| `transfer` |
| amount | numeric(14,2) | always positive |
| party_account_id | int FK→accounts | the trade party (nullable → cash) |
| partner_account_id | int FK→accounts | the partner who paid/received (nullable) |
| counter_account_id | int FK→accounts | transfers only (the "to" side) |
| product, packing, unit | varchar | line detail |
| qty | numeric(12,3) | |
| rate | numeric(14,2) | |
| sale_kg | numeric(12,3) | Sale Factory "Sale Kg" |
| employee | varchar(200) | salary only |
| detail | varchar(400) | free text |
| note | varchar(300) | the Excel "Account" text, e.g. "Imran Online to Yaseen" |
| created_at | timestamp | |

### `ledger_entries` (auto postings — extends the old `customer_entries`)
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| account_id | int FK→accounts | party **or** partner |
| transaction_id | int FK→transactions | source event |
| date | date | for ordering |
| debit | numeric(14,2) default 0 | |
| credit | numeric(14,2) default 0 | |
| balance | numeric(14,2) | running |
| created_at | timestamp | |

The party ledger **page** joins these back to `transactions`, so each row still shows the
full Excel layout: `Date | Product | Packing | Unit | Qty | Rate | Debit | Credit | Balance | Account`.

---

## 4. Balance convention (standardized)

The workbook contradicts itself on sign (Kamar: debit → negative; Shoaib: `Debit(+)/Credit(-)`
→ positive). So we store **one** internal convention and label it in plain language on screen.

```
balance = opening_balance + Σ (debit − credit)     -- oldest → newest
```

| Account type | Positive means | Negative means |
|---|---|---|
| **party** | they owe us | we owe them |
| **partner** | cash held | cash overdrawn |

(e.g. Shoaib nets to **−270,000** = we still owe him for chemicals.)

---

## 5. Fan-out — one entry → its postings

| Kind | Party posting | Partner posting | P&L |
|---|---|---|---|
| **purchase** (from party) | **credit** amount (we owe ↑) | — | + Purchase |
| **supplier_payment** (via partner) | **debit** amount (we owe ↓) | **credit** amount (cash out) | — |
| **sale** (to party, credit) | **debit** amount (they owe ↑) | — | + Sale |
| **purchaser_receipt** (via partner) | **credit** amount (they owe ↓) | **debit** amount (cash in) | — |
| **cash sale** (no party) | — | debit if a partner took it | + Sale |
| **cash purchase** (no party) | — | credit if a partner paid | + Purchase |
| **expense** | — | credit if a partner paid | + Expense |
| **salary** | — | credit if a partner paid | + Expense (via salary) |
| **transfer** | — | credit (from) / debit (to) | — |

The headline win: a **supplier purchase is one entry** feeding both the party ledger and the
Purchase total — no more double-typing into the Purchasing sheet, and no double-count.

---

## 6. Derived views (live, date-range aware)

- **Total Sale** = Σ amount where `kind='sale'`
- **Total Purchase** = Σ amount where `kind='purchase'`
- **Total Expense** = Σ (`kind='expense'`) + Σ (`kind='salary'`)  ← salary inside expense, entered once
- **Gross** = Sale − Purchase   |   **Net** = Sale − Purchase − Expense
- **Party ledger** = `ledger_entries` for that account (net running balance)
- **Partner account** = `ledger_entries` for that partner (cash on hand)
- **Dashboard** = latest balances + category totals, all from the above

The Excel's frozen "197,002" P&L figure is a stale manual snapshot over a partial date range
and is **not** a target; we compute live.

---

## 7. Assumptions (living list)

1. Imran & M. Naqi are `partner` cash accounts.
2. No fixed party role — direction is per-transaction (`purchase` vs `sale`).
3. Salary counted inside Expense, entered once as `kind='salary'`.
4. Sign: positive = they owe us / we hold cash; UI shows plain-language labels.
5. A supplier purchase is a single event feeding both the party ledger and Purchase total;
   duplicate rows in the Purchasing sheet are de-duped on import.
6. P&L computed live; the sheet's frozen totals are not targets.

---

## 8. Phases

- **Phase 1** — schema (`accounts`, `transactions`, `ledger_entries`) + migration from the old
  tables. Old tables kept so the app keeps running. *(in progress)*
- **Phase 2** — one "New Transaction" entry flow with the fan-out.
- **Phase 3** — rebuild read screens (ledgers, partner accounts, corrected P&L) over the new model.
- **Phase 4** — one-time `Grease Plant.xlsx` importer (incl. Imran/Naqi sheets, date + payment de-dupe).
- **Phase 5** — fold in fixes (sign, dates, salary double-count, Sale Kg).
- **Phase 6** — verification & cutover.

## 9. Preserved untouched
Auth, local cache layer, the polished Excel ledger export, and the WhatsApp-send feature.
