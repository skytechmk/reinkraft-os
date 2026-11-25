# Blueprint build decisions (2026-11-25)

Read this together with BLUEPRINT.md. These are the choices made while applying it to the existing app.

## Rules for everyone working in src/
- Colour tokens only (no raw hex in new code): `ink`, `plate`, `deck`, `raised`, `rule`, `mute`, `signal`, `crit`, `ok`
  (Tailwind: `bg-plate`, `text-signal`, `border-rule`, ...). The palette is the blueprint's: ink #121214, plate #1E1E22, signal #FF6B00.
- Every visible string goes through `t()` with an English and a Macedonian text. One message module per area; never edit another area's module.
- Touch targets are at least 48 px. Quantities are steppers, not typing.
- Stock changes go through the offline outbox (`enqueue(...)`, see lib/offlineQueue.ts) with optimistic updates (lib/optimistic.ts). Never write stock tables directly.
- The shared layer is READ-ONLY for UI work: src/lib/{types,api,optimistic,offlineQueue,supabase,demoBackend,csv,logo}.ts, src/domain/*, src/i18n/{core.ts,index.tsx}, features/invoices/api.ts. If you need a change there, say so in your report instead of editing.
- No dev servers, no builds, no deploys, no database access, no git commits, no installs.

## Inventory model (migration 0005, already live)
`folder` (RAW, HARDWARE, ABRASIVES, CHEMICAL, WELDING) and `subfolder` ids are in `src/domain/folders.ts`; `process_tags` limit welding items to processes;
`isItemVisible(item, settings.enabled_processes)` is THE visibility rule (inventory and every quick-picker). `isLow(item)` is THE low-stock rule.
`categoryFor(item)` (domain/categories.ts) maps an item to the cost category of its log. Units now include M2, KG, L (display conversion in domain/measure.ts).
Offcuts: any length from `settings.min_remnant_length_mm` up to just under the bar length (RPC `return_remnant`), filed as RAW/REMNANTS, unit PCS.

## Client quote vs internal sheet
Quotes created from a project are priced for the client (consumables carry the markup). The internal sheet has no prices, rates or margins anywhere.
