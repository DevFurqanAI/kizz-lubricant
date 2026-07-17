-- Performance indexes (idempotent). Apply once against the live database.
-- Primary path: `npm run db:push` (drizzle-kit diffs the live DB and creates
-- exactly these). This file is a manual fallback for the Neon SQL console / psql.
--
-- CONCURRENTLY avoids locking the tables while the index builds. Each statement
-- must run on its own (CONCURRENTLY cannot run inside a transaction block).

-- Latest-balance-per-customer (DISTINCT ON) + per-customer ledger lookups.
CREATE INDEX CONCURRENTLY IF NOT EXISTS customer_entries_customer_date_idx
  ON customer_entries (customer_id, date DESC, id DESC);

-- Ledger list pages: ORDER BY date DESC, id DESC.
CREATE INDEX CONCURRENTLY IF NOT EXISTS sales_date_idx      ON sales      (date DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS purchasing_date_idx ON purchasing (date DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS expenses_date_idx   ON expenses   (date DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS salary_date_idx     ON salary     (date DESC, id DESC);
