# Reinkraft OS (V1.0) — Brief

Ultra-fast, "No-Keyboard", offline-capable PWA for a metal fabrication and welding workshop. Priorities: data integrity (ACID inventory and financial logging), then zero-clutter speed for use with gloves on a phone or a 27" desktop.

## Tech stack
- React + TypeScript + Vite + Tailwind CSS + Lucide icons
- TanStack Query + optimistic UI, IndexedDB queue for offline resilience
- Supabase (Postgres, RLS, RPC functions for atomic stock and log transactions)
- `vite-plugin-pwa` (manifest + service worker)
- Printing via `printService.ts`: hidden iframe, strict `@media print`, `#FFFFFF` background and `#000000` text, A4 thermal/laser

## UI / UX
1. Palette: background `#0F1115`, cards `#181B20`, safety amber `#F59E0B`, critical stock `#EF4444`, profit `#10B981`. Touch targets `min-h-[48px]`.
2. Focus-Expand: never more than one module open. Home shows collapsed bars `INVENTORY`, `PROJECTS`, `BUYS`, `CALENDAR`, `EXPORTS & STATS` and a persistent top-bar `[ ⚡ QUICK SERVICE ]`. Opening one collapses the others.
3. No-keyboard input: large `[-]` / `[+]` steppers (`+0.5h`, `+1h`, `+0.5m weld`, `+1 disc`, `+1 full bar`, `+0.5 bar`, `+1/4 sheet`) and one-tap chips.

## Schema (Postgres / Supabase, `company_id` on every table, V1.1/V1.2 nullable hooks)
1. `company_settings`: company_id (PK), company_name (default 'Reinkraft'), currency ('EUR'|'USD'|'MKD'), unit_system ('METRIC'|'IMPERIAL'), hourly_labor_rate, weld_consumable_markup_pct (default 70), min_remnant_length_mm (default 500), enabled_processes (jsonb: MIG, TIG_DC, TIG_AC, PLASMA, MMA, PAINT).
2. `inventory`: id, company_id, item_type ('PROFILE'|'SHEET'|'CONSUMABLE'|'CHEMICAL'|'CUSTOM'), name, material_grade, standard_length_mm (3000 or 6000 for profiles), sheet_width_mm, sheet_length_mm, sheet_thickness_mm, volume_ml, unit_label ('PCS'|'BAR'|'SHEET'|'ML'|'M'|'BOX'), qty_on_hand (decimal), min_alert_qty, last_buy_price, prev_buy_price, is_pinned_stepper, is_remnant (default false), remnant_length_mm, coverage_m2_per_l (V1.1), mix_ratio_json (V1.1).
3. `projects`: id, company_id, project_type ('MAIN'|'SYSTEM_SERVICE'), status ('QUOTE'|'ACTIVE'|'FINISHED'), title, client_name, quoted_price, start_date (V1.1), due_date (V1.1), estimated_hours (V1.1). Exactly one hidden SYSTEM_SERVICE record per company holds all Quick Service logs.
4. `project_logs` (single source of truth for cost, stock and stats): id, company_id, project_id, inventory_id (nullable), log_category ('LABOR'|'WELD'|'MATERIAL'|'CONSUMABLE'|'HARDWARE'|'ONE_OFF_EXPENSE'), description, qty_delta, unit_cost_at_time (CRITICAL: freezes cost at log time), service_batch_id, charged_amount, payment_status ('PAID'|'UNPAID'|'FREE'), service_photos (jsonb, V1.1), created_at.
5. `project_notes`: id, project_id, note_text, is_pinned_warning, remind_at (V1.1), reminder_status ('NONE'|'PENDING'|'FIRED'|'DONE'), target_worker_id (V1.2).
6. `purchases`: id, company_id, inventory_id, brand_tag, qty_bought, unit_price_paid, total_paid, purchased_at.

## Atomic RPCs
1. `log_project_activity`: inserts a `project_logs` row that freezes `unit_cost_at_time` from `inventory.last_buy_price` (or `company_settings.hourly_labor_rate` for labour) and atomically decrements `inventory.qty_on_hand`. Undo restores `qty_on_hand` atomically.
2. Remnant Rack (`return_remnant`): when a full bar (6000 mm or 3000 mm) is deducted, a one-tap `[ ♻️ Return Remnant ]` offers 1 m, 1.5 m, 2 m, 2.5 m. Ignored if below `min_remnant_length_mm`. Creates or increments an `is_remnant = true` inventory item and credits the proportional cost.

## Acceptance (from the brief)
- Every stock change is atomic and idempotent under retries.
- A bar can be returned as remnant once per deduction.
- Undo restores stock exactly.
- Tenants cannot read or write each other's rows.
