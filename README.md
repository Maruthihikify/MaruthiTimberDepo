# Maruthi Timber Depot

Website and business software for a timber depot and sawmill — built for the way a Karnataka depot actually works:
logs bought by Hoppus CFT with forest transit permits, sawn timber stocked by size **and** length, sawmill runs that
turn logs into sizes with real recovery and cost, GST bills, carpenter commissions, credit control and day-to-day money.

- **Website** (`/`) — cinematic scroll story, species gallery with real wood scans, live yard availability,
  CFT / Hoppus calculator, quote form that lands in the software.
- **Software** (`/app`) — staff sign in at `/login` with a user name or mobile number.

## What the software does

| Area | Highlights |
| --- | --- |
| Billing | GST tax invoices and quotations; CGST+SGST or IGST from the place of supply; HSN per line; bill discount spread over lines; round-off; amount in words; A4 print / PDF; WhatsApp share |
| Controls | Credit limit check (owner/manager can allow once), counter staff discount cap, walk-ins must pay in full, every cancellation needs a reason (audit trail) |
| Returns | Credit notes against an invoice by pieces, back into stock at original cost, refund or keep as credit, carpenter commission reversed |
| Stock | Sawn sizes as a pieces × length matrix per species, plywood sheets, doors, firewood; weighted-average cost; adjustments with reasons; full movement ledger |
| Log yard | Every log by number, length, girth, bark allowance → Hoppus CFT, true volume, landed cost, bay, days seasoning |
| Sawmill | Logs → sizes with recovery %, firewood credit, sawing cost → true cost per sawn CFT; live cutting-pattern drawing |
| Purchases | Logs measured on arrival (feet/inches or metres/cm), permit & vehicle numbers, freight + hamali spread into landed cost |
| Money | Receipts / payments with bill-wise or oldest-first allocation, advances, cheques pending → cleared / bounced, expenses |
| Parties | Customers, suppliers, carpenters (mestris) with balances, overdue, credit use, statement with running balance |
| Reports | GSTR-1 style summary (B2B, B2C, HSN with UQC — CFT reported as CBM), profit by species, receivables ageing, day book, commission, stock valuation; CSV export |
| Roles | Owner, Manager, Accounts, Billing counter, Yard & sawmill — enforced in the database, not just hidden in the UI |

Trade formulas (identical in the browser and the database):
- Sawn timber CFT = thickness″ × width″ × length′ × pieces ÷ 144
- Log Hoppus CFT = ((girth″ − bark allowance″) ÷ 4)² × length′ ÷ 144  (≈ 78.5% of the true round volume)
- 1 m³ = 35.3147 CFT

## Tech

React 19 + Vite + TypeScript + Tailwind CSS 4, TanStack Query (cached, instant screens), Motion for animation,
Supabase (Postgres 17, row-level security, all stock/money logic in SQL functions, one Edge Function for staff logins).

## Run locally

```bash
npm install
npm run env:setup   # writes .env.local with the project URL + public key (needs `npx supabase login`)
npm run dev         # http://localhost:5320
```

Environment variables (public values only): `VITE_MTD_SUPABASE_URL`, `VITE_MTD_SUPABASE_ANON_KEY` — see `.env.example`.

## Database

Migrations are in `supabase/migrations` (apply in order):

```bash
npx supabase db query --linked --project-ref pozqgnihmzxjtpjioegb -f supabase/migrations/0001_schema.sql
```

- Staff-login function: `npx supabase functions deploy admin-users --project-ref pozqgnihmzxjtpjioegb --use-api`
- Demo data (80 days of a working depot + demo staff logins written to the git-ignored `LOGINS.local.md`):
  `npx vite-node scripts/seed.ts` (`--reset` to rebuild it)
- **Go-live:** run `supabase/purge_demo_data.sql` to clear all demo transactions and parties (keeps species, rate card,
  product catalogue and staff logins), then fill Settings → Business (GSTIN, address, bank/UPI).

## Website videos

Generate the clips with the prompts in `docs/VEO_PROMPTS.md` and drop them into `public/landing/video/`
(`hero.mp4`, `saw.mp4`, `grain.mp4`, `yard.mp4`, `door.mp4`, optional `*-portrait.mp4`). Missing clips fall back to
real-wood stills automatically. Wood scans in `public/landing/textures` are CC0 (Poly Haven) — see `CREDITS.md`.

## Deploy

`npm run build` → `dist/`. It is a single-page app: `vercel.json` (Vercel) and `public/.htaccess` (Hostinger/Apache)
send every route to `index.html`. Set the two `VITE_MTD_*` variables in the host's build settings.
