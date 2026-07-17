/**
 * Creates ONLY the three new unified-model tables (accounts, transactions,
 * ledger_entries) with explicit DDL, so we never let drizzle-kit push touch
 * the existing legacy tables. Safe to re-run (IF NOT EXISTS).
 *
 *   tsx scripts/create-new-tables.ts
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing in .env");
  const sql = neon(process.env.DATABASE_URL);

  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id serial PRIMARY KEY,
      name varchar(200) NOT NULL,
      type varchar(16) NOT NULL DEFAULT 'party',
      role varchar(16),
      opening_balance numeric(14,2) NOT NULL DEFAULT '0',
      account_title varchar(200),
      owner varchar(200),
      cnic varchar(30),
      address varchar(300),
      phone varchar(50),
      whatsapp varchar(50),
      email varchar(255),
      created_at timestamp NOT NULL DEFAULT now()
    )`;
  // In case the table already existed from an earlier run without `role`.
  await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS role varchar(16)`;
  await sql`CREATE INDEX IF NOT EXISTS accounts_type_idx ON accounts (type)`;

  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id serial PRIMARY KEY,
      date date NOT NULL,
      kind varchar(24) NOT NULL,
      amount numeric(14,2) NOT NULL DEFAULT '0',
      party_account_id integer REFERENCES accounts(id) ON DELETE SET NULL,
      partner_account_id integer REFERENCES accounts(id) ON DELETE SET NULL,
      counter_account_id integer REFERENCES accounts(id) ON DELETE SET NULL,
      product varchar(200),
      packing varchar(100),
      unit varchar(50),
      qty numeric(12,3),
      rate numeric(14,2),
      sale_kg numeric(12,3),
      employee varchar(200),
      detail varchar(400),
      note varchar(300),
      created_at timestamp NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (date DESC, id DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS transactions_kind_idx ON transactions (kind)`;
  await sql`CREATE INDEX IF NOT EXISTS transactions_party_idx ON transactions (party_account_id)`;
  await sql`CREATE INDEX IF NOT EXISTS transactions_partner_idx ON transactions (partner_account_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id serial PRIMARY KEY,
      account_id integer NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      transaction_id integer REFERENCES transactions(id) ON DELETE CASCADE,
      date date NOT NULL,
      debit numeric(14,2) NOT NULL DEFAULT '0',
      credit numeric(14,2) NOT NULL DEFAULT '0',
      balance numeric(14,2) NOT NULL DEFAULT '0',
      created_at timestamp NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS ledger_entries_account_date_idx ON ledger_entries (account_id, date DESC, id DESC)`;

  console.log("✅ New tables ready: accounts, transactions, ledger_entries");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
