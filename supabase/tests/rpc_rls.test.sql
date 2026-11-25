-- Database tests for Reinkraft OS RPCs and RLS.
-- Run against a disposable database after migration 0001. Everything happens inside
-- one transaction that is rolled back, so no test data is kept.
-- Usage: psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f rpc_rls.test.sql

BEGIN;

-- two tenants, each with one admin user
INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'tenant-a@test.local', '', now(), now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'tenant-b@test.local', '', now(), now());

CREATE FUNCTION pg_temp.as_user(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
END $$;

-- asserts that q raises an error whose message contains want
CREATE FUNCTION pg_temp.assert_fails(q text, want text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE q;
  RAISE EXCEPTION 'ASSERT FAILED: no error raised for check %', left(q, 60);
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%' || want || '%' THEN
    RAISE EXCEPTION 'ASSERT FAILED: check % raised "%"', left(q, 60), SQLERRM;
  END IF;
END $$;

CREATE FUNCTION pg_temp.assert_eq(actual numeric, expected numeric, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'ASSERT FAILED: % expected % got %', label, expected, actual;
  END IF;
END $$;

CREATE FUNCTION pg_temp.assert_text(actual text, expected text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'ASSERT FAILED: % expected "%" got "%"', label, expected, actual;
  END IF;
END $$;

-- ---------------------------------------------- tenant A set-up
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT public.bootstrap_company('Tenant A');
CREATE TEMP TABLE ids AS SELECT
  (SELECT id FROM public.projects WHERE project_type = 'SYSTEM_SERVICE') AS sys_a;

INSERT INTO public.inventory (company_id, item_type, name, unit_label, standard_length_mm)
VALUES ((SELECT company_id FROM public.profiles WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
        'PROFILE', 'Bar A', 'BAR', 6000);
CREATE TEMP TABLE bar AS SELECT id FROM public.inventory WHERE name = 'Bar A';

-- buy one bar at 12.00: stock 1, frozen cost basis 12.00
SELECT public.record_purchase('00000000-0000-0000-0000-00000000a001', (SELECT id FROM bar), 1, 12, 'T');
SELECT pg_temp.assert_eq((SELECT qty_on_hand FROM public.inventory WHERE id = (SELECT id FROM bar)), 1, 'stock after purchase');

-- 1. overdraw is rejected, stock never goes negative
SELECT pg_temp.assert_fails(
  format($q$SELECT public.log_project_activity(gen_random_uuid(), %L, 'MATERIAL', 2, 'x', %L)$q$,
         (SELECT sys_a FROM ids), (SELECT id FROM bar)),
  'INSUFFICIENT_STOCK');

-- 2. replaying the same client op returns the original row and deducts once
SELECT public.log_project_activity('00000000-0000-0000-0000-00000000b001', (SELECT sys_a FROM ids), 'MATERIAL', 1, 'Bar A', (SELECT id FROM bar));
SELECT public.log_project_activity('00000000-0000-0000-0000-00000000b001', (SELECT sys_a FROM ids), 'MATERIAL', 1, 'Bar A', (SELECT id FROM bar));
SELECT pg_temp.assert_eq((SELECT qty_on_hand FROM public.inventory WHERE id = (SELECT id FROM bar)), 0, 'stock after replayed log');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.project_logs WHERE client_op_id = '00000000-0000-0000-0000-00000000b001'), 1, 'one log row for replayed op');
CREATE TEMP TABLE deduct AS SELECT id FROM public.project_logs WHERE client_op_id = '00000000-0000-0000-0000-00000000b001';

-- 4. remnant rules
SELECT pg_temp.assert_fails(
  format($q$SELECT public.return_remnant(gen_random_uuid(), %L, 300)$q$, (SELECT id FROM deduct)),
  'REMNANT_BELOW_MIN');
SELECT pg_temp.assert_fails(
  format($q$SELECT public.return_remnant(gen_random_uuid(), %L, 6000)$q$, (SELECT id FROM deduct)),
  'REMNANT_TOO_LONG');
SELECT pg_temp.assert_fails(
  format($q$SELECT public.return_remnant(gen_random_uuid(), %L, 0)$q$, (SELECT id FROM deduct)),
  'BAD_REMNANT_LENGTH');
SELECT public.return_remnant('00000000-0000-0000-0000-00000000c001', (SELECT id FROM deduct), 2000);
SELECT pg_temp.assert_eq((SELECT unit_cost_at_time FROM public.project_logs WHERE source_log_id = (SELECT id FROM deduct)), -4, 'remnant credit = 12 * 2000/6000 (negated)');
-- the offcut piece is filed in the Remnants Rack as one piece with its exact length
SELECT pg_temp.assert_text((SELECT folder || '/' || subfolder || '/' || unit_label FROM public.inventory WHERE is_remnant AND remnant_length_mm = 2000), 'RAW/REMNANTS/PCS', 'offcut filed in the Remnants Rack');
-- a second remnant for the same bar deduction is refused by the unique source_log_id
SELECT pg_temp.assert_fails(
  format($q$SELECT public.return_remnant('00000000-0000-0000-0000-00000000c002', %L, 2000)$q$, (SELECT id FROM deduct)),
  'duplicate key');
-- undo of the bar deduction is blocked while its remnant credit exists
SELECT pg_temp.assert_fails(
  format($q$SELECT public.undo_project_log(%L)$q$, (SELECT id FROM deduct)),
  'UNDO_REMNANT_FIRST');
-- undo the remnant credit first, then the deduction: stock returns to 1
SELECT public.undo_project_log((SELECT id FROM public.project_logs WHERE source_log_id = (SELECT id FROM deduct)));
SELECT public.undo_project_log((SELECT id FROM deduct));
SELECT pg_temp.assert_eq((SELECT qty_on_hand FROM public.inventory WHERE id = (SELECT id FROM bar)), 1, 'stock restored after undo');

-- 5. tenant isolation: tenant B sees and touches nothing of tenant A
SELECT pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
SELECT public.bootstrap_company('Tenant B');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.inventory WHERE name = 'Bar A'), 0, 'tenant B cannot read A inventory');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.project_logs), 0, 'tenant B cannot read A logs');
SELECT pg_temp.assert_fails(
  format($q$SELECT public.log_project_activity(gen_random_uuid(), %L, 'LABOR', 1)$q$, (SELECT sys_a FROM ids)),
  'PROJECT_NOT_FOUND');
SELECT pg_temp.assert_fails(
  format($q$SELECT public.record_purchase(gen_random_uuid(), %L, 1, 1)$q$, (SELECT id FROM bar)),
  'INVENTORY_NOT_FOUND');

-- anon has no table access at all
SET LOCAL ROLE anon;
SELECT pg_temp.assert_fails('SELECT count(*) FROM public.inventory', 'permission denied');

DO $$ BEGIN RAISE NOTICE 'ALL RPC AND RLS TESTS PASSED'; END $$;
ROLLBACK;
