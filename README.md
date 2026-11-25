# Reinkraft OS

Offline-capable PWA for a metal fabrication shop. React 19, Vite 8, Tailwind 4, TanStack Query,
Supabase. Decisions: `docs/adr/0044-reinkraft-os-pwa-with-supabase-atomic-rpcs.md`.

## Run

```bash
npm install
npm run demo        # local preview with sample data, no backend needed (http://127.0.0.1:5199)
npm test            # unit and component tests
npm run build       # needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

`npm run demo` uses an in-memory stand-in for Supabase (`src/lib/demoBackend.ts`). It is for
design work only and is not part of the production build.

## Printing and invoices

- Two buttons at the bottom of every open project:
  - **Internal work sheet**: your hours, materials and stock left. No prices. Never for the client.
  - **External quote / invoice**: for the client, with prices. A draft prints as a quote; issuing it makes it
    an invoice with a number and locks it. "Edit prices and lines" opens the editor (quantities, hours,
    prices, VAT). Editing never touches inventory or the internal record.
- Logo, address, tax id, bank account and default VAT are set in Settings and printed on both.
- Languages: English and Macedonian (switch in the header). Messages live in `src/i18n/messages/`.
- Measuring units: metric or imperial in Settings. Display only; records stay metric (`src/domain/measure.ts`).
- Calendar is locked until V1.1.
- Weld length and saw cuts are billable daily inputs, OFF until switched on in Settings. Optional automatic
  wire and gas deduction uses adjustable starting values, not measurements.
- Weld length and saw cuts are billable daily inputs, OFF until switched on in Settings. Optional automatic wire and gas deduction uses adjustable starting values.

## Database

- Migrations: `supabase/migrations/` (apply in order).
- Tests (each runs in one rolled-back transaction): `rpc_rls.test.sql`, `invoices.test.sql`
  and `weld.test.sql` in `supabase/tests/`:
  `psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f supabase/tests/invoices.test.sql`

## Deploy (LXC 313 on DELL)

Build with the two env vars, then copy `dist/` into `/srv/reinkraft` in CT 313. Caddy serves it.
The API lives in CT 314 (`/opt/supabase`). Credentials are in Vaultwarden, never in this repo.
