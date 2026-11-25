# REINKRAFT OS — V1.0 Technical Specification (clean-slate blueprint)

Target stack: React + TypeScript + Supabase (PostgreSQL) + offline-capable PWA. Design language: tactile industrial console.

**Core directive.** Zero-keyboard, glove-friendly workshop operating system for metal fabricators and welders. The interface behaves like a physical industrial control console ("Winamp cockpit"): dense, high-contrast dark theme (**#121214** background, **#1E1E22** panels, **#FF6B00** safety-orange active indicators, **monospace LED readouts**), no multi-page wizards, instant tactile `[ - ]` / `[ + ]` steppers.

## 1. Layout and navigation (3-column cockpit)

When a project is active on desktop or landscape tablet/mobile the workspace is locked into three parallel columns so the user never switches tabs to check stock, log work or review profit. No empty placeholder screens: on launch the first active project opens automatically.

| Zone | Components | Behaviour |
|---|---|---|
| **Top command bar** (full width, fixed) | ⚡ QUICK SERVICE button, tabs (PROJECTS, INVENTORY, PURCHASES, CALENDAR 🔒 V1.1), language toggle (EN / MK), unit toggle (MM / INCH), SETTINGS | QUICK SERVICE opens a fast modal for walk-in repairs (10 min weld, 2 discs) outside formal projects. The separate INVOICES tab is eliminated; printing lives inside each project. |
| **Left column (25%)** navigation and stock alerts | Search bar, ACTIVE / FINISHED project tabs, scrollable project list, + NEW PROJECT, pinned Low-Stock Alert Panel at the bottom | Selecting a project highlights it with a #FF6B00 left accent bar. The bottom alert panel shows real-time capacity bars and red ALARM badges strictly for items below threshold. |
| **Center column (45%)** active workbench | Project title, editable Workshop Notes & Deadlines box, large `[ - ] / [ + ]` daily steppers, `[ ↩ Undo ]`, `[ ♻️ +Remnant ]`, collapsed bottom drawer `[ + Raw Materials & Hardware ]` | Top area holds high-frequency daily inputs (hours, weld length, saw cuts, consumables). One-time structural materials (bars, sheets, Lexan) stay in the collapsible bottom drawer. |
| **Right column (30%)** stats, finance and print | Auto-Inventory Summary (consumed bars, gas litres, wire kg), Engineering Calculators (steel weight kg/lb, surface area m²/ft² and paint estimate), Private Profit Breakdown, two bottom print buttons | Shows internal cost vs client quote vs net margin (visible only to the fabricator). Bottom-right: white A4 printouts via gray `[ PRINT INTERNAL ]` and orange `[ EXPORT CLIENT QUOTE ]`. |

**Portrait mobile.** The left project/alert list collapses into a swipeable side drawer, the center workbench takes 100% width with oversized thumb-friendly steppers, and the right financial/print block stacks directly beneath the workbench.

## 2. Global settings and dynamic process filtering

| Group | Controls | Dependency |
|---|---|---|
| Units & currency | METRIC (mm/m/kg/L) vs IMPERIAL (in/ft/lb/gal); currency MKD, EUR, USD; VAT presets 0%, 18%, custom | Converts display dimensions and weights without altering stored values. Currency change applies forward without rewriting history. |
| Welding process toggles (multi-select) | MIG, MAG, TIG DC, TIG AC/DC, PULSE, MMA, PLASMA, LASER | Disabling a process hides its consumables from Inventory and project quick-pickers. Enabling PULSE unlocks a reduced wire/gas consumption preset per unit of weld length. |
| Billing & rate logic (independent ON/OFF) | Labour rate per hour (always active). Weld rate per cm (or in): ON/OFF + per-process rates. Saw cut rate per cut: ON/OFF + rate per cut. | When a rate is OFF its stepper disappears from active projects; billing relies on hourly labour + materials + markup. |
| Thresholds & safety | Consumable markup % (default 70%), auto-calc consumption per metre of weld, minimum usable offcut length (default 500 mm), `[ 💾 Export JSON Backup ]` | Controls automatic deduction of gas and filler wire when logging weld length, defines when offcuts enter the Remnant Rack, enables a full local database backup. |

## 3. Hierarchical inventory (folders and subfolders)

Strict two-level hierarchy. Every record stores: name, folder, subfolder, unit_type (BAR, SHEET, PCS, M, M2, KG, L, ML, BOX), stock_qty, min_alert_qty, unit_cost, plus nullable future B2B fields manufacturer_sku, supplier_name, supplier_contact.

1. **RAW MATERIALS** (always visible): Profiles & Tubes (BAR 3m/6m, M); Sheets & Mesh (SHEET, M2, KG); Roofing & Panels (M2, M, SHEET); Lexan & Polycarbonate (SHEET, M2); Remnants Rack (PCS + exact mm). Items: square/rectangular/round tubes, flat bars, angles, UNP, IPE/HEA, solid bars (steel, galvanized, stainless 304/316, aluminium); black/galv/inox/checker sheets; trapezoidal roof sheets and sandwich panels; cellular/solid Lexan and H/U profiles; auto-logged offcuts >= 500 mm.
2. **HARDWARE & FITTINGS** (always visible): Gates & Doors (PCS); Sliding Systems (PCS, M); Caps & Ornaments (PCS); Fasteners (PCS, BOX). Items: weld-on/bearing hinges, locks, cylinders, handles, latches, stoppers; V/U-groove wheels, floor tracks, guide rollers, gear racks; plastic tube end-caps, forged rosettes; bolts, nuts, concrete anchors, self-drilling roof screws, rivets.
3. **ABRASIVES & CUTTING** (always visible): Cutting & Grinding Discs (PCS, BOX); Flap & Polishing (PCS, BOX); Drilling & Tapping (PCS). Items: cutting discs (115/125/180/230 mm steel/inox), grinding discs, chop-saw discs (355 mm), bandsaw blades; flap discs (P40-P120), fibre discs, Scotch-Brite inox wheels, wire brushes; HSS-G / HSS-Co drill bits, step drills, taps.
4. **CHEMICAL & PAINT** (always visible): Paints & Primers (L, KG, PCS); Thinners & Prep (L, ML, PCS). Items: anti-corrosive primer, epoxy primer, 2K polyurethane topcoat, 3-in-1 enamel, wrought-iron paint, cold galvanizing zinc spray; nitro/PU thinners, acetone degreaser, stainless pickling/passivation paste, cutting fluid.
5. **WELDING CONSUMABLES** (filtered by Settings): MIG/MAG, TIG DC / AC-DC, MMA (electrodes), PLASMA, LASER.
   - MIG/MAG: CO2, mix gas; 0.8/1.0/1.2 mm wire; nozzles, contact tips, diffusers, liners, anti-spatter.
   - TIG shared: pure argon, tungsten (1.6/2.4/3.2 mm), ceramic cups, gas lenses, collets/bodies, back caps. TIG DC only: ER70S-6, ER308L, ER316L, ER309L, ER312 rods. TIG AC/DC only: ER4043, ER4047, ER5356 alu rods, green tungsten, inox brushes.
   - MMA: rutile (6013), basic (7018), inox, cast iron electrodes.
   - PLASMA: electrodes, cutting nozzles/tips, shield caps, swirl rings.
   - LASER: argon/nitrogen, 0.8-1.6 mm laser wire, protective windows, focus lenses, copper laser nozzles, ceramic rings.

## 4. Database integrity, project execution and print engine

- **Atomic transactions and cost freezing.** Every `[ + ]` click runs one PostgreSQL RPC transaction that deducts stock, writes an audit entry to project_logs and freezes unit_cost_at_time. Later price hikes never distort historical margins.
- **One-tap undo and remnant return.** `[ ↩ Undo ]` reverses the most recent project_logs row and restores stock. `[ ♻️ +Remnant ]` next to a consumed profile bar prompts for the offcut length (mm/in) and adds a tracked piece to the Remnants Rack subfolder.
- **Dual A4 print engine** (`@media print`): both buttons render clean white A4 regardless of the dark UI.
  - *Internal workshop job sheet* (`PRINT INTERNAL`): project title, client name, workshop notes, cut list, required materials and a consumables checklist, strictly stripped of all prices, hourly rates and profit margins, so helpers can work from it on the shop floor.
  - *External client quote / invoice* (`EXPORT CLIENT QUOTE`): company header/logo, itemised client pricing, optional VAT breakdown and payment terms, without exposing internal material costs or markup percentages.
- **Multi-tenant SaaS foundation.** All tables carry company_id and RLS policies, paired with a tenant_theme configuration object so the platform can be white-labelled without code changes.
