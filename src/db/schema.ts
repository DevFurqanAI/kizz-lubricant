import {
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  numeric,
  integer,
  date,
  index,
} from "drizzle-orm/pg-core";

// ─── Users ───────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull().default("Admin"),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 32 }).notNull().default("admin"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Customers ───────────────────────────────────────────────
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  accountTitle: varchar("account_title", { length: 200 }),
  owner: varchar("owner", { length: 200 }),
  cnic: varchar("cnic", { length: 30 }),
  address: varchar("address", { length: 300 }),
  phone: varchar("phone", { length: 50 }),
  whatsapp: varchar("whatsapp", { length: 50 }),
  email: varchar("email", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Customer Ledger Entries ──────────────────────────────────
// Debit  = customer owes us (we sold to them / they bought from us)
// Credit = customer paid us (payment received)
// Balance runs from oldest to newest: prev_balance - debit + credit
export const customerEntries = pgTable("customer_entries", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  product: varchar("product", { length: 200 }),
  packing: varchar("packing", { length: 100 }),
  unit: varchar("unit", { length: 50 }),
  qty: numeric("qty", { precision: 12, scale: 3 }),
  rate: numeric("rate", { precision: 14, scale: 2 }),
  debit: numeric("debit", { precision: 14, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 14, scale: 2 }).notNull().default("0"),
  // Running balance: positive = customer owes us | negative = we owe customer (advance)
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("0"),
  account: varchar("account", { length: 300 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  // Serves the DISTINCT ON (customer_id) … ORDER BY date DESC, id DESC balance
  // query AND the per-customer ledger lookup (scanned backward for ASC order).
  index("customer_entries_customer_date_idx").on(t.customerId, t.date.desc(), t.id.desc()),
]);

// ─── Sales ───────────────────────────────────────────────────
export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  detail: varchar("detail", { length: 400 }).notNull(),
  qty: numeric("qty", { precision: 12, scale: 3 }),
  rate: numeric("rate", { precision: 14, scale: 2 }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("sales_date_idx").on(t.date.desc(), t.id.desc()),
]);

// ─── Purchasing ───────────────────────────────────────────────
export const purchasing = pgTable("purchasing", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  detail: varchar("detail", { length: 400 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("purchasing_date_idx").on(t.date.desc(), t.id.desc()),
]);

// ─── Expenses ─────────────────────────────────────────────────
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  detail: varchar("detail", { length: 400 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("expenses_date_idx").on(t.date.desc(), t.id.desc()),
]);

// ─── Salary ───────────────────────────────────────────────────
export const salary = pgTable("salary", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  employee: varchar("employee", { length: 200 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  account: varchar("account", { length: 300 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("salary_date_idx").on(t.date.desc(), t.id.desc()),
]);

// ═══════════════════════════════════════════════════════════════════
//  UNIFIED MODEL (single source of truth) — see docs/automation-spec.md
//  Added alongside the tables above; the legacy tables stay in place
//  until the read screens are migrated (Phase 3), so nothing breaks.
// ═══════════════════════════════════════════════════════════════════

// ─── Accounts ────────────────────────────────────────────────────────
// A trade `party` (buys and/or supplies) OR a `partner` cash hub (Imran,
// Naqi). Roles are NOT fixed here — direction lives on each transaction.
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  type: varchar("type", { length: 16 }).notNull().default("party"), // 'party' | 'partner'
  // For parties only: what they are to us. Direction still lives per-transaction;
  // this is a label for filtering/UI. 'supplier' | 'purchaser' | 'both' (null for partners).
  role: varchar("role", { length: 16 }),
  openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull().default("0"),
  // Party contact details (null for partners)
  accountTitle: varchar("account_title", { length: 200 }),
  owner: varchar("owner", { length: 200 }),
  cnic: varchar("cnic", { length: 30 }),
  address: varchar("address", { length: 300 }),
  phone: varchar("phone", { length: 50 }),
  whatsapp: varchar("whatsapp", { length: 50 }),
  email: varchar("email", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("accounts_type_idx").on(t.type),
]);

// ─── Transactions ────────────────────────────────────────────────────
// The single entry point. One row = one money event; the fan-out (see
// spec §5) turns it into ledger_entries postings + category totals.
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  // purchase | sale | supplier_payment | purchaser_receipt | expense | salary | transfer
  kind: varchar("kind", { length: 24 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  // Which accounts this event touches
  partyAccountId: integer("party_account_id").references(() => accounts.id, { onDelete: "set null" }),
  partnerAccountId: integer("partner_account_id").references(() => accounts.id, { onDelete: "set null" }),
  counterAccountId: integer("counter_account_id").references(() => accounts.id, { onDelete: "set null" }), // transfer "to"
  // Line-item detail (sales / purchases)
  product: varchar("product", { length: 200 }),
  packing: varchar("packing", { length: 100 }),
  unit: varchar("unit", { length: 50 }),
  qty: numeric("qty", { precision: 12, scale: 3 }),
  rate: numeric("rate", { precision: 14, scale: 2 }),
  saleKg: numeric("sale_kg", { precision: 12, scale: 3 }),
  employee: varchar("employee", { length: 200 }), // salary only
  detail: varchar("detail", { length: 400 }),
  note: varchar("note", { length: 300 }), // the Excel "Account" text
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("transactions_date_idx").on(t.date.desc(), t.id.desc()),
  index("transactions_kind_idx").on(t.kind),
  index("transactions_party_idx").on(t.partyAccountId),
  index("transactions_partner_idx").on(t.partnerAccountId),
]);

// ─── Ledger Entries (auto-generated postings) ────────────────────────
// One or two per transaction. balance = opening + Σ(debit − credit),
// oldest→newest. Positive = they owe us / partner holds cash.
export const ledgerEntries = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id").references(() => transactions.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  debit: numeric("debit", { precision: 14, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 14, scale: 2 }).notNull().default("0"),
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ledger_entries_account_date_idx").on(t.accountId, t.date.desc(), t.id.desc()),
]);

export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type CustomerEntry = typeof customerEntries.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type Purchase = typeof purchasing.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type SalaryPayment = typeof salary.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
