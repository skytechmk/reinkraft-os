-- Database tests for weld length, saw cuts and automatic consumption (migration 0006).
-- Runs in one rolled-back transaction. To test the migration itself before applying it, run
-- "BEGIN; <0006 migration> <this file>" as one script: the final ROLLBACK undoes both.
BEGIN;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'weld-a@test.local', '', now(), now()),
  ('bbbbbbbb-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'weld-b@test.local', '', now(), now());

CREATE FUNCTION pg_temp.as_user(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
END $$;
CREATE FUNCTION pg_temp.assert_fails(q text, want text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE q;
  RAISE EXCEPTION 'ASSERT FAILED: no error raised for check %', left(q, 70);
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%' || want || '%' THEN
    RAISE EXCEPTION 'ASSERT FAILED: check % raised "%"', left(q, 70), SQLERRM;
  END IF;
END $$;
CREATE FUNCTION pg_temp.assert_eq(actual numeric, expected numeric, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'ASSERT FAILED: % expected % got %', label, expected, actual; END IF;
END $$;
CREATE FUNCTION pg_temp.assert_text(actual text, expected text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'ASSERT FAILED: % expected "%" got "%"', label, expected, actual; END IF;
END $$;

-- ------------------------------------------------ tenant A
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-0000000000c1');
SELECT public.bootstrap_company('Tenant A');
CREATE TEMP TABLE ctx AS SELECT (SELECT company_id FROM public.profiles WHERE user_id = 'aaaaaaaa-0000-0000-0000-0000000000c1') AS company;

INSERT INTO public.projects (company_id, project_type, status, title, client_name)
VALUES ((SELECT company FROM ctx), 'MAIN', 'ACTIVE', 'Gate', 'Mile');
INSERT INTO public.inventory (company_id, item_type, name, unit_label, folder, subfolder)
VALUES ((SELECT company FROM ctx), 'CONSUMABLE', 'Wire', 'KG', 'WELDING', 'MIG_MAG'),
       ((SELECT company FROM ctx), 'CONSUMABLE', 'Gas', 'L', 'WELDING', 'MIG_MAG'),
       ((SELECT company FROM ctx), 'CONSUMABLE', 'Wrong wire (metres)', 'M', 'WELDING', 'MIG_MAG');
CREATE TEMP TABLE ids AS SELECT
  (SELECT id FROM public.projects WHERE title = 'Gate') AS gate,
  (SELECT id FROM public.inventory WHERE name = 'Wire') AS wire,
  (SELECT id FROM public.inventory WHERE name = 'Gas') AS gas,
  (SELECT id FROM public.inventory WHERE name = 'Wrong wire (metres)') AS bad_wire;

SELECT public.record_purchase('00000000-0000-0000-0000-00000000a001', (SELECT wire FROM ids), 10, 450);
SELECT public.record_purchase('00000000-0000-0000-0000-00000000a002', (SELECT gas FROM ids), 40, 12);

-- everything is OFF by default
SELECT pg_temp.assert_text((SELECT weld_rate_enabled::text FROM public.company_settings), 'false', 'weld rate starts off');
SELECT pg_temp.assert_text((SELECT saw_rate_enabled::text FROM public.company_settings), 'false', 'saw rate starts off');
SELECT pg_temp.assert_text((SELECT auto_consumption_enabled::text FROM public.company_settings), 'false', 'auto consumption starts off');
SELECT pg_temp.assert_fails(format($q$SELECT public.log_weld(gen_random_uuid(), %L, 'MIG', 100)$q$, (SELECT gate FROM ids)), 'WELD_RATE_OFF');
SELECT pg_temp.assert_fails(format($q$SELECT public.log_project_activity(gen_random_uuid(), %L, 'SAW_CUT', 1)$q$, (SELECT gate FROM ids)), 'SAW_RATE_OFF');

-- ------------------------------------------------ saw cuts
UPDATE public.company_settings SET saw_rate_enabled = true, saw_cut_rate = 50;
SELECT public.log_project_activity('00000000-0000-0000-0000-00000000b001', (SELECT gate FROM ids), 'SAW_CUT', 2);
SELECT pg_temp.assert_eq((SELECT qty_delta FROM public.project_logs WHERE client_op_id = '00000000-0000-0000-0000-00000000b001'), 2, 'two saw cuts logged');
SELECT pg_temp.assert_eq((SELECT unit_cost_at_time FROM public.project_logs WHERE client_op_id = '00000000-0000-0000-0000-00000000b001'), 50, 'saw cut rate frozen on the row');
SELECT pg_temp.assert_text((SELECT inventory_id::text FROM public.project_logs WHERE client_op_id = '00000000-0000-0000-0000-00000000b001'), NULL, 'saw cuts touch no stock');
SELECT pg_temp.assert_fails(format($q$SELECT public.log_project_activity(gen_random_uuid(), %L, 'SAW_CUT', 0)$q$, (SELECT gate FROM ids)), 'QTY_MUST_BE_POSITIVE');

-- ------------------------------------------------ weld length, billing only (auto consumption off)
UPDATE public.company_settings SET weld_rate_enabled = true,
  process_config = jsonb_build_object('MIG', jsonb_build_object(
    'rate_per_cm', 0.5, 'wire_item_id', (SELECT wire FROM ids), 'wire_g_per_m', 20, 'gas_item_id', (SELECT gas FROM ids), 'gas_l_per_m', 8));
SELECT public.log_weld('00000000-0000-0000-0000-00000000b002', (SELECT gate FROM ids), 'MIG', 100);
SELECT pg_temp.assert_eq((SELECT qty_delta FROM public.project_logs WHERE client_op_id = '00000000-0000-0000-0000-00000000b002'), 100, 'weld length in cm');
SELECT pg_temp.assert_eq((SELECT unit_cost_at_time FROM public.project_logs WHERE client_op_id = '00000000-0000-0000-0000-00000000b002'), 0.5, 'MIG rate per cm frozen');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.project_logs WHERE parent_log_id IS NOT NULL), 0, 'no stock rows while auto consumption is off');
SELECT pg_temp.assert_eq((SELECT qty_on_hand FROM public.inventory WHERE id = (SELECT wire FROM ids)), 10, 'wire untouched while off');

-- ------------------------------------------------ automatic consumption
UPDATE public.company_settings SET auto_consumption_enabled = true;
SELECT public.log_weld('00000000-0000-0000-0000-00000000b003', (SELECT gate FROM ids), 'MIG', 150);
CREATE TEMP TABLE weld3 AS SELECT id FROM public.project_logs WHERE client_op_id = '00000000-0000-0000-0000-00000000b003';
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.project_logs WHERE parent_log_id = (SELECT id FROM weld3)), 2, 'wire and gas rows are children of the weld');
SELECT pg_temp.assert_eq((SELECT qty_on_hand FROM public.inventory WHERE id = (SELECT wire FROM ids)), 9.97, '1.5 m x 20 g/m = 30 g = 0.03 kg of wire');
SELECT pg_temp.assert_eq((SELECT qty_on_hand FROM public.inventory WHERE id = (SELECT gas FROM ids)), 28, '1.5 m x 8 L/m = 12 L of gas');
SELECT pg_temp.assert_eq((SELECT unit_cost_at_time FROM public.project_logs WHERE parent_log_id = (SELECT id FROM weld3) AND inventory_id = (SELECT wire FROM ids)), 450, 'consumed wire cost is frozen');
SELECT pg_temp.assert_text((SELECT log_category FROM public.project_logs WHERE parent_log_id = (SELECT id FROM weld3) AND inventory_id = (SELECT gas FROM ids)), 'WELD', 'consumption is a welding consumable (carries the markup)');

-- replaying the same operation changes nothing
SELECT public.log_weld('00000000-0000-0000-0000-00000000b003', (SELECT gate FROM ids), 'MIG', 150);
SELECT pg_temp.assert_eq((SELECT qty_on_hand FROM public.inventory WHERE id = (SELECT gas FROM ids)), 28, 'replayed weld deducts once');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.project_logs WHERE log_category = 'WELD_LENGTH'), 2, 'replayed weld adds no row');

-- the wire and gas rows cannot be undone on their own
SELECT pg_temp.assert_fails(
  format($q$SELECT public.undo_project_log(%L)$q$, (SELECT id FROM public.project_logs WHERE parent_log_id = (SELECT id FROM weld3) LIMIT 1)),
  'UNDO_PARENT_INSTEAD');

-- a weld that cannot be fully supplied writes nothing at all
SELECT pg_temp.assert_fails(format($q$SELECT public.log_weld(gen_random_uuid(), %L, 'MIG', 10000)$q$, (SELECT gate FROM ids)), 'INSUFFICIENT_STOCK');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.project_logs WHERE log_category = 'WELD_LENGTH'), 2, 'failed weld leaves no row behind');
SELECT pg_temp.assert_eq((SELECT qty_on_hand FROM public.inventory WHERE id = (SELECT wire FROM ids)), 9.97, 'failed weld leaves wire alone');

-- undoing the weld gives everything back in one go
SELECT public.undo_project_log((SELECT id FROM weld3));
SELECT pg_temp.assert_eq((SELECT qty_on_hand FROM public.inventory WHERE id = (SELECT wire FROM ids)), 10, 'wire restored');
SELECT pg_temp.assert_eq((SELECT qty_on_hand FROM public.inventory WHERE id = (SELECT gas FROM ids)), 40, 'gas restored');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.project_logs WHERE parent_log_id IS NOT NULL), 0, 'children removed with the weld');

-- a preset whose item has the wrong unit never touches stock
UPDATE public.company_settings SET process_config = jsonb_build_object('MIG', jsonb_build_object(
    'rate_per_cm', 0.5, 'wire_item_id', (SELECT bad_wire FROM ids), 'wire_g_per_m', 20));
SELECT public.log_weld('00000000-0000-0000-0000-00000000b004', (SELECT gate FROM ids), 'MIG', 100);
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.project_logs WHERE parent_log_id IS NOT NULL), 0, 'wire in metres is ignored, not guessed');

-- an unknown or unconfigured process still bills at rate 0 and does not fail
SELECT pg_temp.assert_fails(format($q$SELECT public.log_weld(gen_random_uuid(), %L, 'FLAME', 10)$q$, (SELECT gate FROM ids)), 'BAD_PROCESS');
SELECT public.log_weld('00000000-0000-0000-0000-00000000b005', (SELECT gate FROM ids), 'TIG_DC', 10);
SELECT pg_temp.assert_eq((SELECT unit_cost_at_time FROM public.project_logs WHERE client_op_id = '00000000-0000-0000-0000-00000000b005'), 0, 'unconfigured process bills nothing');

-- ------------------------------------------------ quote lines
UPDATE public.company_settings SET process_config = jsonb_build_object('MIG', jsonb_build_object(
    'rate_per_cm', 0.5, 'wire_item_id', (SELECT wire FROM ids), 'wire_g_per_m', 20, 'gas_item_id', (SELECT gas FROM ids), 'gas_l_per_m', 8)),
  weld_consumable_markup_pct = 70;
SELECT public.log_weld('00000000-0000-0000-0000-00000000b006', (SELECT gate FROM ids), 'MIG', 200);
SELECT public.create_external_invoice('00000000-0000-0000-0000-0000000000e1', (SELECT gate FROM ids), 'en');
CREATE TEMP TABLE inv AS SELECT id FROM public.invoices WHERE client_op_id = '00000000-0000-0000-0000-0000000000e1';
-- weld lengths that remain: 100 cm at 0.5, 100 cm at 0.5, 10 cm at 0 and 200 cm at 0.5 = 410 cm billed 200 (the 150 cm weld was undone)
SELECT pg_temp.assert_eq((SELECT qty FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv) AND description = 'Welding'), 410, 'welding line carries the total length');
SELECT pg_temp.assert_text((SELECT unit FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv) AND description = 'Welding'), 'cm', 'welding unit');
SELECT pg_temp.assert_eq((SELECT line_total FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv) AND description = 'Welding'), 200, 'welding billed at the frozen rates');
SELECT pg_temp.assert_eq((SELECT qty FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv) AND description = 'Saw cuts'), 2, 'saw cuts line');
SELECT pg_temp.assert_eq((SELECT line_total FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv) AND description = 'Saw cuts'), 100, 'saw cuts billed at the frozen rate');
-- wire used 0.04 kg (200 cm) at 450, quoted with the 70% markup: 450 x 1.7 = 765 per kg, never the 450 paid
SELECT pg_temp.assert_eq((SELECT unit_price FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv) AND description = 'Wire'), 765, 'consumed wire is quoted with markup');

-- ------------------------------------------------ tenant B
SELECT pg_temp.as_user('bbbbbbbb-0000-0000-0000-0000000000d2');
SELECT public.bootstrap_company('Tenant B');
SELECT pg_temp.assert_fails(format($q$SELECT public.log_weld(gen_random_uuid(), %L, 'MIG', 10)$q$, (SELECT gate FROM ids)), 'PROJECT_NOT_FOUND');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.project_logs), 0, 'B sees none of the weld rows of A');

SET LOCAL ROLE anon;
SELECT pg_temp.assert_fails($q$SELECT public.log_weld(gen_random_uuid(), gen_random_uuid(), 'MIG', 10)$q$, 'permission denied');

DO $$ BEGIN RAISE NOTICE 'ALL WELD AND SAW TESTS PASSED'; END $$;
ROLLBACK;
