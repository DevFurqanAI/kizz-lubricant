import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  users, customers, customerEntries, sales, purchasing, expenses, salary,
} from "../src/db/schema";

// ── Dev credentials (change in .env for production) ─────────────────
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@newstar.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "NewStar@2026";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing in .env");

  const client = neon(process.env.DATABASE_URL);
  const db = drizzle(client);

  // Pass `--reset` (or `npm run db:seed:reset`) to wipe the data tables first.
  // The users table is intentionally left alone so your login survives.
  const RESET = process.argv.includes("--reset");
  if (RESET) {
    console.log("⚠  --reset: clearing customers, customer_entries, sales, purchasing, expenses, salary (users kept)…");
    await db.execute(sql`
      TRUNCATE TABLE customer_entries, sales, purchasing, expenses, salary, customers
      RESTART IDENTITY CASCADE
    `);
    console.log("✔ Data tables cleared");
  }

  // ── 1. Admin user ────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const existing = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL.toLowerCase())).limit(1);
  if (existing.length > 0) {
    await db.update(users).set({ passwordHash }).where(eq(users.email, ADMIN_EMAIL.toLowerCase()));
    console.log(`✔ Admin password updated: ${ADMIN_EMAIL}`);
  } else {
    await db.insert(users).values({ name: "Admin", email: ADMIN_EMAIL.toLowerCase(), passwordHash, role: "admin" });
    console.log(`✔ Admin created: ${ADMIN_EMAIL}`);
  }

  // Check if already seeded (skip data if customers exist)
  const existing_customers = await db.select().from(customers).limit(1);
  if (existing_customers.length > 0) {
    console.log("ℹ  Data already present — skipping. Re-run with `--reset` to wipe and re-seed.");
    return;
  }

  // ── 2. Customers ─────────────────────────────────────────────────────
  const [qamar] = await db.insert(customers).values({ name: "Qamar Bhai", address: "Multan", phone: "0333-7284001" }).returning();
  const [ahmad] = await db.insert(customers).values({ name: "Ahmad Raza (Empty Drum)", address: "Multan", phone: "0349-2371597" }).returning();
  const [shoaib] = await db.insert(customers).values({ name: "Shoaib Ali", address: "Multan" }).returning();
  const [yaseen] = await db.insert(customers).values({ name: "Chudry Yaseen", address: "Multan", phone: "0300-8630670" }).returning();
  const [ardeca] = await db.insert(customers).values({
    name: "Ikrama Ullah (Ardeca Oil Company)", address: "Bajaur", phone: "0346-7394721",
    cnic: "21102-24432489", owner: "Ikram Ullah", whatsapp: "92-3467394721",
  }).returning();

  // ── Helper: insert entries and auto-calc running balance ─────────────
  // A payment is a CREDIT row with NO product line — that empty product is
  // what the ledger UI and Excel export detect and render as "Payment Received".
  // So: goods sold → set `product` + `debit`; money received → set `credit`
  // and leave `product` blank.
  type EntryInput = {
    date: string; product?: string; packing?: string; unit?: string;
    qty?: number; rate?: number; debit: number; credit: number; account?: string;
  };

  // Sort by date BEFORE computing the running balance, so the seeded balances
  // match exactly what recalcBalances() produces (it orders by date, then id).
  async function insertEntries(customerId: number, entries: EntryInput[]) {
    const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let running = 0;
    for (const e of sorted) {
      running = running + e.debit - e.credit;
      await db.insert(customerEntries).values({
        customerId, date: e.date, product: e.product ?? null, packing: e.packing ?? null,
        unit: e.unit ?? null, qty: e.qty ? String(e.qty) : null, rate: e.rate ? String(e.rate) : null,
        debit: String(e.debit), credit: String(e.credit), balance: String(running), account: e.account ?? null,
      });
    }
  }

  // ── 3. Qamar Bhai ledger — 650 Oil, settles in full via Imran Online ──
  await insertEntries(qamar.id, [
    { date: "2026-02-15", product: "650 Oil", packing: "200 L (RS 275)", qty: 6, rate: 55000, debit: 330000, credit: 0 },
    { date: "2026-02-18", debit: 0, credit: 95000, account: "Imran Online to Qamar" },
    { date: "2026-02-22", debit: 0, credit: 100000, account: "Imran Online to Qamar" },
    { date: "2026-02-25", product: "650 Oil", packing: "200 L (RS 275)", qty: 6, rate: 55000, debit: 330000, credit: 0 },
    { date: "2026-02-27", debit: 0, credit: 135000, account: "Imran Online to Qamar" },
    { date: "2026-03-02", debit: 0, credit: 150000, account: "Imran Online to Qamar" },
    { date: "2026-03-10", debit: 0, credit: 160000, account: "Imran Online to Qamar" },
    { date: "2026-03-15", product: "650 Oil", packing: "200 L (RS 275)", qty: 6, rate: 55000, debit: 330000, credit: 0 },
    { date: "2026-03-20", debit: 0, credit: 350000, account: "Imran Online to Qamar" },
    { date: "2026-04-05", product: "650 Oil", packing: "200 L (RS 415)", qty: 6, rate: 83000, debit: 498000, credit: 0 },
    { date: "2026-04-20", debit: 0, credit: 498000, account: "Imran Online to Qamar" },
  ]);

  // ── 4. Ahmad Raza ledger — empty drums, each sold & paid same day ─────
  await insertEntries(ahmad.id, [
    { date: "2026-03-06", product: "Empty Drum", packing: "205 L", qty: 1, rate: 3500, debit: 3500, credit: 0 },
    { date: "2026-03-06", debit: 0, credit: 3500, account: "Imran Online to Ahmad Raza" },
    { date: "2026-05-06", product: "Empty Drum", packing: "180 Kg", qty: 10, rate: 4500, debit: 45000, credit: 0 },
    { date: "2026-05-06", debit: 0, credit: 45000, account: "Imran Online to Ahmad Raza" },
    { date: "2026-05-16", product: "Empty Drum", packing: "180 Kg", qty: 3, rate: 4500, debit: 13500, credit: 0 },
    { date: "2026-05-16", debit: 0, credit: 13500, account: "Imran Online to Ahmad Raza" },
    { date: "2026-05-23", product: "Empty Drum", packing: "180 Kg", qty: 2, rate: 4500, debit: 9000, credit: 0 },
    { date: "2026-05-23", debit: 0, credit: 9000, account: "Imran Online to Ahmad Raza" },
    { date: "2026-06-11", product: "Empty Drum", packing: "205 L", qty: 2, rate: 4800, debit: 9600, credit: 0 },
    { date: "2026-06-11", debit: 0, credit: 9600, account: "Imran Online to Ahmad Raza" },
  ]);

  // ── 5. Shoaib Ali ledger — chemicals, still owes the last lot ─────────
  await insertEntries(shoaib.id, [
    { date: "2026-02-16", product: "Chemical Bag", qty: 5, rate: 22500, debit: 112500, credit: 0 },
    { date: "2026-02-16", product: "Chemical CPP", packing: "55 Kg", qty: 55, rate: 850, debit: 46750, credit: 0 },
    { date: "2026-02-25", debit: 0, credit: 100000, account: "Imran Online to Shoaib" },
    { date: "2026-02-26", debit: 0, credit: 59250, account: "Imran Online to Shoaib" },
    { date: "2026-03-03", product: "Chemical Bag", qty: 5, rate: 22500, debit: 112500, credit: 0 },
    { date: "2026-03-10", debit: 0, credit: 73000, account: "Imran Online to Shoaib" },
    { date: "2026-03-15", product: "Chemical Bag", qty: 7, rate: 22500, debit: 157500, credit: 0 },
    { date: "2026-04-04", debit: 0, credit: 197000, account: "Imran Online to Shoaib" },
    { date: "2026-04-10", product: "Chemical Bag", qty: 7, rate: 22500, debit: 157500, credit: 0 },
    { date: "2026-04-10", product: "Chemical CPP", packing: "145 Kg", debit: 123250, credit: 0 },
    { date: "2026-05-06", debit: 0, credit: 280750, account: "Imran Online to Shoaib" },
    { date: "2026-06-06", product: "Chemical Bags", qty: 12, rate: 22500, debit: 270000, credit: 0 },
  ]);

  // ── 6. Chudry Yaseen ledger — oil drums, each sold & paid same day ────
  await insertEntries(yaseen.id, [
    { date: "2026-03-06", product: "BSM", packing: "170 L (Drum)", qty: 1, rate: 102000, debit: 102000, credit: 0 },
    { date: "2026-03-06", debit: 0, credit: 102000, account: "Imran Online to Yaseen" },
    { date: "2026-03-06", product: "DD", packing: "40 L", qty: 1, rate: 13600, debit: 13600, credit: 0 },
    { date: "2026-03-06", debit: 0, credit: 13600, account: "Imran Online to Yaseen" },
    { date: "2026-04-23", product: "DD", packing: "205 L (Drum)", qty: 1, rate: 70500, debit: 70500, credit: 0 },
    { date: "2026-04-23", debit: 0, credit: 70500, account: "Imran Online to Yaseen" },
    { date: "2026-05-06", product: "DD", packing: "205 L (Drum)", qty: 8, rate: 69085, debit: 552680, credit: 0 },
    { date: "2026-05-06", debit: 0, credit: 552680, account: "Imran Online to Yaseen" },
    { date: "2026-05-06", product: "BSM", packing: "120 L (Drum)", qty: 1, rate: 72000, debit: 72000, credit: 0 },
    { date: "2026-05-06", debit: 0, credit: 72000, account: "Imran Online to Yaseen" },
    { date: "2026-06-07", product: "DD", packing: "205 L (Drum)", qty: 2, rate: 69000, debit: 138000, credit: 0 },
    { date: "2026-06-07", debit: 0, credit: 138000, account: "Imran Online to Yaseen" },
    { date: "2026-06-11", product: "BSM", packing: "170 L (Drum)", qty: 2, rate: 102000, debit: 204000, credit: 0 },
    { date: "2026-06-11", debit: 0, credit: 204000, account: "Imran Online to Yaseen" },
    { date: "2026-06-11", product: "DD", packing: "76 L (Drum)", qty: 1, rate: 25612, debit: 25612, credit: 0 },
    { date: "2026-06-11", debit: 0, credit: 25612, account: "Imran Online to Yaseen" },
  ]);

  // ── 7. Ardeca Oil Company ledger — cartons/buckets, owes the last lot ─
  await insertEntries(ardeca.id, [
    { date: "2025-11-11", product: "Ardeca D3", packing: "4*4", unit: "crtn", qty: 100, rate: 9748, debit: 974800, credit: 0 },
    { date: "2025-11-15", debit: 0, credit: 974800, account: "Receiving Amount" },
    { date: "2025-12-20", product: "Ardeca D3", packing: "4*4", unit: "crtn", qty: 50, rate: 9748, debit: 487400, credit: 0 },
    { date: "2026-01-02", debit: 0, credit: 450000, account: "Receiving Amount" },
    { date: "2026-01-13", debit: 0, credit: 37400, account: "Receiving Amount" },
    { date: "2026-03-04", product: "Ardeca D1", packing: "1*8", unit: "bukat", qty: 40, rate: 2584, debit: 103360, credit: 0 },
    { date: "2026-03-08", debit: 0, credit: 103360, account: "Receiving Amount" },
    { date: "2026-04-04", product: "Ardeca D3", packing: "4*4", unit: "crtn", qty: 30, rate: 12720, debit: 381600, credit: 0 },
    { date: "2026-04-10", debit: 0, credit: 210000, account: "Receiving Amount" },
    { date: "2026-04-15", debit: 0, credit: 171600, account: "Receiving Amount" },
    { date: "2026-05-06", product: "Ardeca D1", packing: "1*8", unit: "bukat", qty: 20, rate: 4200, debit: 84000, credit: 0 },
    { date: "2026-05-12", debit: 0, credit: 64000, account: "Receiving Amount" },
    { date: "2026-05-18", debit: 0, credit: 20000, account: "Receiving Amount" },
    { date: "2026-06-05", product: "Ardeca D3", packing: "4*4", unit: "crtn", qty: 50, rate: 13334, debit: 667200, credit: 0 },
    { date: "2026-06-05", product: "Ardeca D1", packing: "1*8", unit: "bukat", qty: 50, rate: 4030, debit: 201500, credit: 0 },
    { date: "2026-06-10", debit: 0, credit: 300000, account: "Receiving Amount" },
    { date: "2026-06-20", debit: 0, credit: 100000, account: "Receiving Amount" },
  ]);

  // ── 8. Sales ─────────────────────────────────────────────────────────
  // Sale Kg / L is derived from the pack size in the detail (e.g. "180 Kg
  // Drum" × qty), so it's consistent with what was actually sold. Grams are
  // converted to Kg. Details with no explicit pack size get no weight.
  type SaleSeed = { date: string; detail: string; qty: string | null; rate: string | null; amount: string };

  function deriveKg(detail: string, qty: string | null): { saleKg: string | null; saleKgUnit: string | null } {
    const q = qty ? Number(qty) : 0;
    const m = detail.match(/(\d+(?:\.\d+)?)\s*(kg|l|g)\b/i);
    if (!m || !q) return { saleKg: null, saleKgUnit: null };
    let size = Number(m[1]);
    const raw = m[2].toUpperCase();
    if (raw === "G") size = size / 1000; // grams → Kg
    const unit = raw === "L" ? "L" : "Kg";
    return { saleKg: String(Number((size * q).toFixed(3))), saleKgUnit: unit };
  }

  const salesData: SaleSeed[] = [
    { date: "2026-01-04", detail: "Rizwan (180 Kg) Drum", qty: "10", rate: "126000", amount: "1260000" },
    { date: "2026-01-04", detail: "Akhtar Ali Sawat New Star Grease (500 G)", qty: "15", rate: "4700", amount: "70500" },
    { date: "2026-01-04", detail: "Abbas Ali Teamer Ghara (500 G)", qty: "32", rate: "3900", amount: "124800" },
    { date: "2026-01-17", detail: "Kizz Safa Oil Fateh Jhung (500 G)", qty: "10", rate: "4450", amount: "44500" },
    { date: "2026-01-17", detail: "Kizz Safa Oil Fateh Jhung (180 G)", qty: "8", rate: "3450", amount: "27600" },
    { date: "2026-01-21", detail: "Kizz Sadam Oil Bakhar (500 G)", qty: "10", rate: "4000", amount: "40000" },
    { date: "2026-01-22", detail: "Rizwan Lahore Blue Drum (180 Kg)", qty: "6", rate: "95000", amount: "570000" },
    { date: "2026-01-22", detail: "Rizwan Drum Lahore (180 Kg)", qty: "3", rate: "96000", amount: "288000" },
    { date: "2026-01-22", detail: "Packet Ismail Peshawar Party", qty: "10", rate: "4650", amount: "46500" },
    { date: "2026-01-27", detail: "Rizwan Lahore Bucket Grease (18 Kg)", qty: "10", rate: "9800", amount: "98000" },
    { date: "2026-01-29", detail: "Rizwan Lahore Gear Oil Drum (208 L)", qty: "1", rate: "90000", amount: "90000" },
    { date: "2026-01-31", detail: "Rizwan Lahore Drum Grease (180 Kg)", qty: "1", rate: "96000", amount: "96000" },
    { date: "2026-01-31", detail: "Packet Ismail Sindh Party", qty: "10", rate: "4650", amount: "46500" },
    { date: "2026-02-02", detail: "Multan Baber (3 Kg)", qty: "1", rate: "9200", amount: "9200" },
    { date: "2026-02-14", detail: "Shahid Ali Para Chanar Kizz Mix CTN", qty: "24", rate: null, amount: "114320" },
    { date: "2026-02-16", detail: "Rizwan Lahore Drum Grease (180 Kg)", qty: "2", rate: "96000", amount: "192000" },
    { date: "2026-02-16", detail: "Ismail Multan (500 G) New Star", qty: "20", rate: "3850", amount: "77000" },
    { date: "2026-02-18", detail: "Ismail Multan (500 G) New Star", qty: "51", rate: "3850", amount: "196350" },
    { date: "2026-02-18", detail: "Malik Shafi (500 G) New Star", qty: "8", rate: "3900", amount: "31200" },
    { date: "2026-02-18", detail: "Malik Shafi (500 G) New Star", qty: "21", rate: "3900", amount: "81900" },
    { date: "2026-02-20", detail: "Akbar Party Zimidara Autos 6 Mix CTN", qty: "6", rate: null, amount: "32831" },
    { date: "2026-02-26", detail: "Rizwan Lahore (180 Kg) Drum", qty: "2", rate: "96000", amount: "192000" },
    { date: "2026-02-26", detail: "Asad Tarnol (500 G)", qty: "70", rate: "3060", amount: "214200" },
    { date: "2026-02-28", detail: "Sadam Oil Bakhar 3 Kg Bucket", qty: "12", rate: "7500", amount: "90000" },
    { date: "2026-02-28", detail: "Rizwan Lahore Bucket Grease (18 Kg)", qty: "7", rate: "9800", amount: "68600" },
    { date: "2026-02-28", detail: "Haroon Autos Peshawar New Star (500 G)", qty: "26", rate: "4000", amount: "104000" },
    { date: "2026-03-03", detail: "Rizwan CL 2 Drum (205 L)", qty: "1", rate: "98000", amount: "98000" },
    { date: "2026-03-03", detail: "Monex (500 G)", qty: "20", rate: "3360", amount: "67200" },
    { date: "2026-03-03", detail: "Rizwan CL 2 Drum (205 L)", qty: "2", rate: "102000", amount: "204000" },
    { date: "2026-03-03", detail: "Ismail Multan 3 Kg Bucket New Star", qty: "22", rate: "7200", amount: "158400" },
    { date: "2026-03-03", detail: "Asad Tarnol (500 G)", qty: "70", rate: "3060", amount: "214200" },
    { date: "2026-03-06", detail: "Tayyab Gear Oil (210 L)", qty: "1", rate: "145000", amount: "145000" },
    { date: "2026-05-06", detail: "Rizwan Lahore (180 Kg)", qty: "10", rate: "120000", amount: "1200000" },
    { date: "2026-05-18", detail: "Rizwan Lahore (180 Kg) Drum", qty: "3", rate: "124000", amount: "372000" },
    { date: "2026-05-23", detail: "Emaan Lubricants (13 Kg)", qty: "10", rate: "8400", amount: "84000" },
    { date: "2026-05-23", detail: "Arsalan Oryxx (500 G)", qty: "42", rate: "3600", amount: "151200" },
    { date: "2026-05-23", detail: "Arsalan Oryxx (180 G)", qty: "15", rate: "2592", amount: "38880" },
    { date: "2026-05-23", detail: "Sheikh Umer Lahore (140 Kg)", qty: "2", rate: "93000", amount: "186000" },
    { date: "2026-06-09", detail: "Rizwan Lahore Gear Oil (208 L)", qty: "2", rate: "136500", amount: "273000" },
  ];
  for (const s of salesData) {
    const { saleKg, saleKgUnit } = deriveKg(s.detail, s.qty);
    await db.insert(sales).values({ ...s, saleKg, saleKgUnit });
  }
  console.log(`✔ ${salesData.length} sales seeded`);

  // ── 9. Purchasing ────────────────────────────────────────────────────
  const purchData = [
    { date: "2025-12-12", detail: "(650 Oil) 1025 L Oil Uni", amount: "283987" },
    { date: "2025-12-12", detail: "BS MVI (205 L) Oil", amount: "88088" },
    { date: "2025-12-12", detail: "BS HVI (410 L) Oil", amount: "198793" },
    { date: "2025-12-12", detail: "MT Drum (8 Uni)", amount: "32000" },
    { date: "2025-12-15", detail: "Chemical", amount: "144500" },
    { date: "2025-12-15", detail: "(650 Oil) Multan (615 L)", amount: "169125" },
    { date: "2025-12-30", detail: "Chemical", amount: "45000" },
    { date: "2025-12-30", detail: "(650 Oil) Multan (410 L)", amount: "111930" },
    { date: "2026-01-01", detail: "(650 Oil) 1025 L Oil Uni", amount: "283987" },
    { date: "2026-01-01", detail: "5 Drum Uni", amount: "20000" },
    { date: "2026-01-22", detail: "(650 Oil) Multan Sey (615 L)", amount: "169300" },
    { date: "2026-01-22", detail: "6 Drum Multan", amount: "13200" },
    { date: "2026-01-22", detail: "Chemical 2 Bag", amount: "45000" },
    { date: "2026-01-22", detail: "Blue Drum Faisalabad (6 Drum)", amount: "441000" },
    { date: "2026-01-22", detail: "Builty Lahore Sey MT", amount: "13175" },
    { date: "2026-01-22", detail: "Ismail Sey Grease Packet", amount: "42500" },
    { date: "2026-01-27", detail: "Rizwan Lahore Gear Oil Drum", amount: "82200" },
    { date: "2026-01-29", detail: "4 Drum Liye", amount: "18000" },
    { date: "2026-01-31", detail: "Ismail Sey Grease Packet", amount: "42500" },
    { date: "2026-02-15", detail: "650 Oil Kamar Multan (1200 L)", amount: "330000" },
    { date: "2026-02-15", detail: "Chemical", amount: "159250" },
    { date: "2026-02-15", detail: "Drum Wala Raqam Di", amount: "20000" },
    { date: "2026-02-23", detail: "650 Oil Kamar Multan (1200 L)", amount: "330000" },
    { date: "2026-02-25", detail: "New Star CTN Banvaye", amount: "20000" },
    { date: "2026-02-25", detail: "Chemical", amount: "112500" },
    { date: "2026-02-26", detail: "4 Drum Liye", amount: "20000" },
    { date: "2026-03-01", detail: "Ismail Sey Grease Packet", amount: "44000" },
    { date: "2026-03-05", detail: "Oil DD + CL", amount: "82640" },
    { date: "2026-03-07", detail: "Oil DD + CL", amount: "186940" },
    { date: "2026-03-07", detail: "New Star CTN Banvaye", amount: "65000" },
    { date: "2026-03-09", detail: "Chemical 7 Bag", amount: "157500" },
    { date: "2026-03-15", detail: "650 Oil Kamar Multan 6 Drum", amount: "330000" },
    { date: "2026-04-01", detail: "10 Drum Liye", amount: "55000" },
    { date: "2026-04-01", detail: "Oil BSH 205 L (Chudry Yaseen)", amount: "125000" },
    { date: "2026-04-04", detail: "Chemical 7 Bag", amount: "157500" },
    { date: "2026-04-04", detail: "PPC Chemical (850 Kg)", amount: "123250" },
    { date: "2026-04-05", detail: "Oil DD Liya (Chudry Yaseen)", amount: "340300" },
    { date: "2026-04-06", detail: "Oil DD (Kamar Multan)", amount: "498000" },
    { date: "2026-05-16", detail: "Empty Grease 3 Drum (Imran)", amount: "13500" },
  ];
  for (const p of purchData) await db.insert(purchasing).values(p);
  console.log(`✔ ${purchData.length} purchases seeded`);

  // ── 10. Expenses ─────────────────────────────────────────────────────
  // Genuine running costs ONLY. Salary payments live in the salary table
  // (below) — they were previously double-counted here, inflating P&L cost.
  const expData = [
    { date: "2025-12-01", detail: "Plant Rent Kamar Bhai", amount: "80000" },
    { date: "2026-05-09", detail: "Loader Petrol (Imran)", amount: "500" },
    { date: "2026-05-11", detail: "Oryxx MT Builty (Naqi Pay)", amount: "5000" },
    { date: "2026-05-12", detail: "Facebook Page Ads (Imran)", amount: "1500" },
    { date: "2026-05-13", detail: "Bike Petrol — Imran Visit to Factory", amount: "500" },
    { date: "2026-05-15", detail: "Petrol", amount: "1000" },
    { date: "2026-05-16", detail: "Petrol — Purchase Empty Grease Drum (Imran)", amount: "500" },
    { date: "2026-05-16", detail: "Loader Petrol (Imran)", amount: "500" },
    { date: "2026-05-17", detail: "Oil Purchase Loader (Imran)", amount: "2500" },
    { date: "2026-05-17", detail: "Fan Repair for Factory (Imran)", amount: "2000" },
    { date: "2026-05-17", detail: "Loader Petrol — Drum Delivery to Rizwan (Imran)", amount: "1000" },
    { date: "2026-05-22", detail: "Factory Electricity Bill (M. Naqi)", amount: "62000" },
    { date: "2026-05-22", detail: "Factory Mistri (Imran)", amount: "3000" },
    { date: "2026-05-23", detail: "Loader Petrol for Oil Purchase (Imran)", amount: "1000" },
    { date: "2026-05-25", detail: "Bike Petrol (Imran)", amount: "500" },
    { date: "2026-05-25", detail: "Lunch Imran", amount: "200" },
    { date: "2026-05-25", detail: "Loader Petrol (Imran)", amount: "500" },
    { date: "2026-06-02", detail: "Bike Petrol (Imran)", amount: "1000" },
    { date: "2026-06-03", detail: "Loader Petrol for Oil Purchase (Imran)", amount: "500" },
    { date: "2026-06-03", detail: "Imran Bike Petrol (Imran)", amount: "500" },
    { date: "2026-06-04", detail: "Loader Petrol — Deliver Gear Oil (Imran)", amount: "1000" },
    { date: "2026-06-05", detail: "Factory Work (Imran)", amount: "2000" },
    { date: "2026-06-06", detail: "Loader Petrol for Oil Purchase (Imran)", amount: "1000" },
    { date: "2026-06-06", detail: "Factory Work — Nut Bolt (Imran)", amount: "1600" },
    { date: "2026-06-07", detail: "Bike Petrol (Imran)", amount: "500" },
    { date: "2026-06-07", detail: "Loader Petrol for Oil Purchase (Imran)", amount: "1200" },
    { date: "2026-06-07", detail: "Relay for Panel (Imran)", amount: "4000" },
    { date: "2026-06-07", detail: "Loader Petrol — Delivery Rizwan (Imran)", amount: "1000" },
    { date: "2026-06-07", detail: "Imran Lunch", amount: "300" },
    { date: "2026-06-09", detail: "Ads Charges (Imran)", amount: "1000" },
    { date: "2026-06-09", detail: "Loader Petrol — Delivery Rizwan (Imran)", amount: "1000" },
    { date: "2026-06-11", detail: "Loader Petrol for Oil Purchase (Imran)", amount: "1000" },
  ];
  for (const e of expData) await db.insert(expenses).values(e);
  console.log(`✔ ${expData.length} expenses seeded`);

  // ── 11. Salary ───────────────────────────────────────────────────────
  const salaryData = [
    { date: "2026-01-02", employee: "Manan", amount: "3000", account: "Imran Online to Manan" },
    { date: "2026-01-03", employee: "Asad", amount: "25000", account: "Naqi Online to Asad" },
    { date: "2026-01-22", employee: "Manan", amount: "10000", account: "Imran Online to Manan" },
    { date: "2026-01-29", employee: "Manan", amount: "1000", account: "Imran Online to Manan" },
    { date: "2026-02-02", employee: "Asad", amount: "25000", account: "Naqi Online to Asad" },
    { date: "2026-02-03", employee: "Manan", amount: "14000", account: "Imran Online to Manan" },
    { date: "2026-02-03", employee: "Manan", amount: "3000", account: "Imran Online to Manan" },
    { date: "2026-02-10", employee: "Manan", amount: "3000", account: "Imran Online to Manan" },
    { date: "2026-02-16", employee: "Manan", amount: "18000", account: "Imran Online to Manan" },
    { date: "2026-02-16", employee: "Manan", amount: "2000", account: "Imran Online to Manan" },
    { date: "2026-02-24", employee: "Manan", amount: "2000", account: "Imran Online to Manan" },
    { date: "2026-03-02", employee: "Manan", amount: "11000", account: "Imran Online to Manan" },
    { date: "2026-03-16", employee: "Manan", amount: "3000", account: "Naqi Online to Manan" },
    { date: "2026-03-20", employee: "Asad", amount: "2000", account: "Naqi Online to Asad" },
    { date: "2026-04-22", employee: "Manan", amount: "9630", account: "Imran Online to Manan" },
    { date: "2026-04-22", employee: "Manan", amount: "2370", account: "Imran Online to Manan" },
    { date: "2026-04-23", employee: "Manan", amount: "1000", account: "Naqi Online to Manan" },
    { date: "2026-05-04", employee: "Asad", amount: "23000", account: "Imran Online to Asad" },
    { date: "2026-05-04", employee: "Manan", amount: "10000", account: "Imran Online to Manan" },
    { date: "2026-05-13", employee: "Manan", amount: "1000", account: "Naqi Online to Manan" },
    { date: "2026-05-15", employee: "Manan", amount: "2000", account: "Naqi Online to Manan" },
    { date: "2026-05-16", employee: "Manan", amount: "15000", account: "Imran Online to Manan" },
    { date: "2026-06-05", employee: "Asad", amount: "30000", account: "Naqi Online to Asad" },
    { date: "2026-06-05", employee: "Manan", amount: "3000", account: "Naqi Online to Manan" },
  ];
  for (const s of salaryData) await db.insert(salary).values(s);
  console.log(`✔ ${salaryData.length} salary records seeded`);

  console.log("\n✅ Database fully seeded!\n");
  console.log(`   Login: ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
