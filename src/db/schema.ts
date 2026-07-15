import {
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  numeric,
  integer,
  date,
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
});

// ─── Sales ───────────────────────────────────────────────────
export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  detail: varchar("detail", { length: 400 }).notNull(),
  qty: numeric("qty", { precision: 12, scale: 3 }),
  rate: numeric("rate", { precision: 14, scale: 2 }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Purchasing ───────────────────────────────────────────────
export const purchasing = pgTable("purchasing", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  detail: varchar("detail", { length: 400 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Expenses ─────────────────────────────────────────────────
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  detail: varchar("detail", { length: 400 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Salary ───────────────────────────────────────────────────
export const salary = pgTable("salary", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  employee: varchar("employee", { length: 200 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  account: varchar("account", { length: 300 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type CustomerEntry = typeof customerEntries.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type Purchase = typeof purchasing.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type SalaryPayment = typeof salary.$inferSelect;
