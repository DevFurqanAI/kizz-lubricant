# New Star Lubricants — Admin Panel

**Stack:** Next.js 14 (App Router) · React 18 · NextAuth v4 (JWT) · Drizzle ORM · Neon PostgreSQL · NodeMailer · Tailwind CSS · TypeScript

---

## Features

| Section | What it does |
|---|---|
| **Login** | Email + password only. No signup, no forgot password. Admin seeded via script. |
| **Dashboard** | Live totals: sales, purchasing, expenses, salary, net profit/loss, customer balances |
| **Customers** | Card grid + individual ledger page (Date, Product, Packing, Unit, Qty, Rate, Debit, Credit, Running Balance) |
| **Sales** | Add/delete sales with auto amount calculation (Qty × Rate) |
| **Purchasing** | Oil, drums, chemicals — add/delete |
| **Expenses** | Petrol, electricity, repairs — add/delete |
| **Salary** | Per-employee payment tracking with totals per person |
| **Profit & Loss** | Monthly breakdown: Sales − (Purchasing + Expenses + Salary) with margin % |

**Balance logic** (matches your Excel ledger exactly):
- `Debit` = customer owes us (we delivered goods)  
- `Credit` = payment received from customer  
- `Balance` = cumulative: positive → they owe us, negative → advance paid

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create `.env` file
Copy `.env.example` to `.env` and fill in the values:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon dashboard → Connection Details → **Pooled** connection string |
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` and paste the output |
| `NEXTAUTH_URL` | `http://localhost:3000` for local dev |
| `ADMIN_EMAIL` | Login email (default: `admin@newstar.com`) |
| `ADMIN_PASSWORD` | Login password (default: `NewStar@2026`) |
| `SMTP_*` | NodeMailer config — fill when you need email features |

### 3. Push database schema
```bash
npm run db:push
```

### 4. Seed the database
```bash
npm run db:seed
```
This creates the admin account + seeds all customer ledgers, sales, purchasing, expenses and salary from the Grease Plant workbook.

### 5. Run development server
```bash
npm run dev
```
Open `http://localhost:3000` → login → `/dashboard`

---

## Default dev credentials
```
Email:    admin@newstar.com
Password: NewStar@2026
```
Change `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` before going to production, then re-run `npm run db:seed`.

---

## Project structure
```
src/
├── app/
│   ├── page.tsx                         # Login page
│   ├── layout.tsx                       # Root layout + fonts
│   ├── globals.css                      # Tailwind + animations
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts  # NextAuth handler
│   │   ├── customers/route.ts           # List + create customers
│   │   ├── customers/[id]/route.ts      # Get, update, delete customer
│   │   ├── customers/[id]/entries/      # Add ledger entry (auto-recalcs balance)
│   │   ├── customers/[id]/entries/[entryId]/ # Delete/patch single entry
│   │   ├── sales/route.ts               # List + create sales
│   │   ├── sales/[id]/route.ts          # Delete / update sale
│   │   ├── purchasing/                  # Same pattern
│   │   ├── expenses/                    # Same pattern
│   │   ├── salary/                      # Same pattern
│   │   ├── dashboard-stats/route.ts     # Aggregated stats for dashboard
│   │   └── pnl/route.ts                 # Monthly P&L
│   └── dashboard/
│       ├── layout.tsx                   # Dashboard shell + auth guard
│       ├── sidebar.tsx                  # Navigation sidebar
│       ├── page.tsx                     # Overview page
│       ├── customers/page.tsx           # Customer card grid
│       ├── customers/[id]/page.tsx      # Individual ledger
│       ├── sales/page.tsx
│       ├── purchasing/page.tsx
│       ├── expenses/page.tsx
│       ├── salary/page.tsx
│       └── pnl/page.tsx
├── db/
│   ├── schema.ts                        # All 7 Drizzle table definitions
│   └── index.ts                         # Lazy Neon + Drizzle client
├── lib/
│   ├── auth.ts                          # NextAuth config (Credentials + JWT)
│   ├── mailer.ts                        # NodeMailer transporter
│   ├── api.ts                           # Client-side fetch wrappers
│   └── utils.ts                         # formatMoney, fmtDate, monthLabel, etc.
├── middleware.ts                         # Protects /dashboard/* routes
└── types/next-auth.d.ts                 # Session type augmentation
scripts/
└── seed.ts                              # Full DB seed from Grease Plant data
```
