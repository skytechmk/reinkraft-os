-- Database tests for external invoices (migrations 0003 and 0004). Runs in one rolled-back transaction.
-- Usage: psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f invoices.test.sql
BEGIN;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'inv-a@test.local', '', now(), now()),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'inv-b@test.local', '', now(), now());

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

-- ------------------------------------------------ tenant A: a project with real usage
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-0000000000a1');
SELECT public.bootstrap_company('Tenant A');
UPDATE public.company_settings SET hourly_labor_rate = 600, default_vat_pct = 18, weld_consumable_markup_pct = 70;

CREATE TEMP TABLE ctx AS SELECT
  (SELECT company_id FROM public.profiles WHERE user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') AS company;

INSERT INTO public.projects (company_id, project_type, status, title, client_name, advance_paid)
VALUES ((SELECT company FROM ctx), 'MAIN', 'ACTIVE', 'Gate', 'Mile', 1000);
INSERT INTO public.projects (company_id, project_type, status, title) VALUES ((SELECT company FROM ctx), 'MAIN', 'ACTIVE', 'Empty project');
INSERT INTO public.inventory (company_id, item_type, name, unit_label, standard_length_mm)
VALUES ((SELECT company FROM ctx), 'PROFILE', 'Tube', 'BAR', 6000);
INSERT INTO public.inventory (company_id, item_type, name, unit_label)
VALUES ((SELECT company FROM ctx), 'CONSUMABLE', 'Wire', 'M');

CREATE TEMP TABLE ids AS SELECT
  (SELECT id FROM public.projects WHERE title = 'Gate') AS gate,
  (SELECT id FROM public.projects WHERE title = 'Empty project') AS empty,
  (SELECT id FROM public.inventory WHERE name = 'Tube') AS tube,
  (SELECT id FROM public.inventory WHERE name = 'Wire') AS wire;

SELECT public.record_purchase('00000000-0000-0000-0000-00000000f001', (SELECT tube FROM ids), 10, 1850);
SELECT public.record_purchase('00000000-0000-0000-0000-00000000f002', (SELECT wire FROM ids), 100, 4.2);

SELECT public.log_project_activity('00000000-0000-0000-0000-00000000e001', (SELECT gate FROM ids), 'LABOR', 2.5, 'Labour');
SELECT public.log_project_activity('00000000-0000-0000-0000-00000000e002', (SELECT gate FROM ids), 'LABOR', 2.5, 'Labour');
SELECT public.log_project_activity('00000000-0000-0000-0000-00000000e003', (SELECT gate FROM ids), 'MATERIAL', 1, 'Tube', (SELECT tube FROM ids));
SELECT public.log_project_activity('00000000-0000-0000-0000-00000000e004', (SELECT gate FROM ids), 'MATERIAL', 2, 'Tube', (SELECT tube FROM ids));
SELECT public.log_project_activity('00000000-0000-0000-0000-00000000e005', (SELECT gate FROM ids), 'WELD', 48, 'Wire', (SELECT wire FROM ids));
SELECT public.return_remnant('00000000-0000-0000-0000-00000000e006',
  (SELECT id FROM public.project_logs WHERE client_op_id = '00000000-0000-0000-0000-00000000e003'), 2000);

CREATE TEMP TABLE before_state AS SELECT
  (SELECT sum(qty_on_hand) FROM public.inventory) AS stock,
  (SELECT count(*) FROM public.project_logs) AS logs,
  (SELECT sum(abs(qty_delta) * unit_cost_at_time) FROM public.project_logs) AS cost;

-- ------------------------------------------------ create from records
SELECT public.create_external_invoice('00000000-0000-0000-0000-0000000000c1', (SELECT gate FROM ids), 'en');
CREATE TEMP TABLE inv1 AS SELECT id FROM public.invoices WHERE client_op_id = '00000000-0000-0000-0000-0000000000c1';

SELECT pg_temp.assert_text((SELECT status FROM public.invoices WHERE id = (SELECT id FROM inv1)), 'DRAFT', 'new invoice is a draft');
SELECT pg_temp.assert_eq((SELECT vat_pct FROM public.invoices WHERE id = (SELECT id FROM inv1)), 18, 'VAT copied from settings');
SELECT pg_temp.assert_eq((SELECT advance_paid FROM public.invoices WHERE id = (SELECT id FROM inv1)), 1000, 'advance copied from project');
SELECT pg_temp.assert_text((SELECT client_name FROM public.invoices WHERE id = (SELECT id FROM inv1)), 'Mile', 'client copied from project');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv1)), 3, 'labour + tube + wire lines');
SELECT pg_temp.assert_eq((SELECT qty FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv1) AND line_type = 'LABOR'), 5, 'exact hours');
SELECT pg_temp.assert_eq((SELECT unit_price FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv1) AND line_type = 'LABOR'), 600, 'labour priced at the frozen rate');
SELECT pg_temp.assert_text((SELECT unit FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv1) AND line_type = 'LABOR'), 'h', 'English labour unit');
SELECT pg_temp.assert_eq((SELECT qty FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv1) AND description = 'Tube'), 3, 'bars used');
SELECT pg_temp.assert_eq((SELECT unit_price FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv1) AND description = 'Tube'), 1644.4444, 'tube price nets the returned offcut');
SELECT pg_temp.assert_eq((SELECT unit_price FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv1) AND description = 'Wire'), 7.14, 'wire is quoted with the 70% consumable markup, not at the price the shop paid');
SELECT pg_temp.assert_eq((SELECT line_total FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv1) AND description = 'Wire'), 342.72, 'line total is qty x price');
SELECT pg_temp.assert_eq((SELECT unit_price FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv1) AND description = 'Tube'), 1644.4444, 'steel is quoted at cost (net of the returned offcut), no markup');

-- creating again with the same client op returns the same invoice
SELECT public.create_external_invoice('00000000-0000-0000-0000-0000000000c1', (SELECT gate FROM ids), 'en');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.invoices), 1, 'replayed create makes no second invoice');

-- ------------------------------------------------ edits never touch inventory or the internal record
UPDATE public.invoice_lines SET qty = qty + 10, unit_price = unit_price * 2 WHERE invoice_id = (SELECT id FROM inv1);
INSERT INTO public.invoice_lines (company_id, invoice_id, position, line_type, description, qty, unit, unit_price)
VALUES ((SELECT company FROM ctx), (SELECT id FROM inv1), 9, 'CUSTOM', 'Delivery', 1, 'pcs', 50);
DELETE FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv1) AND description = 'Wire';
SELECT pg_temp.assert_eq((SELECT sum(qty_on_hand) FROM public.inventory), (SELECT stock FROM before_state), 'stock unchanged by invoice edits');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.project_logs), (SELECT logs FROM before_state), 'logs unchanged by invoice edits');
SELECT pg_temp.assert_eq((SELECT sum(abs(qty_delta) * unit_cost_at_time) FROM public.project_logs), (SELECT cost FROM before_state), 'internal costs unchanged by invoice edits');

-- reset rebuilds the lines from the records and discards edits
SELECT public.fill_invoice_lines((SELECT id FROM inv1));
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv1)), 3, 'reset restores the three lines');
SELECT pg_temp.assert_eq((SELECT qty FROM public.invoice_lines WHERE invoice_id = (SELECT id FROM inv1) AND description = 'Tube'), 3, 'reset restores the quantity');

-- Macedonian invoice words the generated lines in Macedonian; drafts can be deleted
SELECT public.create_external_invoice('00000000-0000-0000-0000-0000000000c2', (SELECT gate FROM ids), 'mk');
SELECT pg_temp.assert_text((SELECT description FROM public.invoice_lines l JOIN public.invoices i ON i.id = l.invoice_id WHERE i.client_op_id = '00000000-0000-0000-0000-0000000000c2' AND l.line_type = 'LABOR'), 'Работни часови', 'Macedonian labour line');
SELECT pg_temp.assert_text((SELECT unit FROM public.invoice_lines l JOIN public.invoices i ON i.id = l.invoice_id WHERE i.client_op_id = '00000000-0000-0000-0000-0000000000c2' AND l.description = 'Tube'), 'шипка', 'Macedonian unit');
DELETE FROM public.invoices WHERE client_op_id = '00000000-0000-0000-0000-0000000000c2';
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.invoices), 1, 'draft deleted');

-- ------------------------------------------------ status and number only through the RPCs
SELECT pg_temp.assert_fails(format($q$UPDATE public.invoices SET status = 'ISSUED' WHERE id = %L$q$, (SELECT id FROM inv1)), 'USE_INVOICE_RPC');
SELECT pg_temp.assert_fails(format($q$UPDATE public.invoices SET number = 'INV-1' WHERE id = %L$q$, (SELECT id FROM inv1)), 'USE_INVOICE_RPC');
SELECT pg_temp.assert_fails(format($q$INSERT INTO public.invoices (company_id, project_id, status, currency) VALUES (%L, %L, 'ISSUED', 'EUR')$q$, (SELECT company FROM ctx), (SELECT gate FROM ids)), 'USE_INVOICE_RPC');

-- an invoice with no lines cannot be issued
SELECT public.create_external_invoice('00000000-0000-0000-0000-0000000000c3', (SELECT empty FROM ids), 'en');
SELECT pg_temp.assert_fails(format($q$SELECT public.issue_invoice(%L)$q$, (SELECT id FROM public.invoices WHERE client_op_id = '00000000-0000-0000-0000-0000000000c3')), 'INVOICE_HAS_NO_LINES');

-- ------------------------------------------------ issue, number, lock
SELECT public.issue_invoice((SELECT id FROM inv1));
SELECT pg_temp.assert_text((SELECT number FROM public.invoices WHERE id = (SELECT id FROM inv1)),
  'INV-' || extract(year from current_date)::int || '-0001', 'first number of the year');
SELECT pg_temp.assert_text((SELECT status FROM public.invoices WHERE id = (SELECT id FROM inv1)), 'ISSUED', 'issued');

SELECT pg_temp.assert_fails(format($q$UPDATE public.invoice_lines SET qty = 99 WHERE invoice_id = %L$q$, (SELECT id FROM inv1)), 'INVOICE_LOCKED');
SELECT pg_temp.assert_fails(format($q$DELETE FROM public.invoice_lines WHERE invoice_id = %L$q$, (SELECT id FROM inv1)), 'INVOICE_LOCKED');
SELECT pg_temp.assert_fails(format($q$INSERT INTO public.invoice_lines (company_id, invoice_id, line_type, description, qty, unit_price) VALUES (%L, %L, 'CUSTOM', 'x', 1, 1)$q$, (SELECT company FROM ctx), (SELECT id FROM inv1)), 'INVOICE_LOCKED');
SELECT pg_temp.assert_fails(format($q$UPDATE public.invoices SET client_name = 'Someone else' WHERE id = %L$q$, (SELECT id FROM inv1)), 'INVOICE_LOCKED');
SELECT pg_temp.assert_fails(format($q$UPDATE public.invoices SET language = 'mk' WHERE id = %L$q$, (SELECT id FROM inv1)), 'INVOICE_LOCKED');
SELECT pg_temp.assert_fails(format($q$DELETE FROM public.invoices WHERE id = %L$q$, (SELECT id FROM inv1)), 'INVOICE_LOCKED');
SELECT pg_temp.assert_fails(format($q$SELECT public.issue_invoice(%L)$q$, (SELECT id FROM inv1)), 'ALREADY_ISSUED');
SELECT pg_temp.assert_fails(format($q$SELECT public.fill_invoice_lines(%L)$q$, (SELECT id FROM inv1)), 'INVOICE_LOCKED');

-- allowed status moves only
SELECT public.set_invoice_status((SELECT id FROM inv1), 'PAID');
SELECT pg_temp.assert_fails(format($q$SELECT public.set_invoice_status(%L, 'VOID')$q$, (SELECT id FROM inv1)), 'BAD_STATUS_CHANGE');
SELECT public.set_invoice_status((SELECT id FROM inv1), 'ISSUED');
SELECT public.set_invoice_status((SELECT id FROM inv1), 'VOID');
SELECT pg_temp.assert_fails(format($q$SELECT public.set_invoice_status(%L, 'PAID')$q$, (SELECT id FROM inv1)), 'BAD_STATUS_CHANGE');

-- the next invoice gets the next number
SELECT public.create_external_invoice('00000000-0000-0000-0000-0000000000c4', (SELECT gate FROM ids), 'en');
SELECT public.issue_invoice((SELECT id FROM public.invoices WHERE client_op_id = '00000000-0000-0000-0000-0000000000c4'));
SELECT pg_temp.assert_text((SELECT number FROM public.invoices WHERE client_op_id = '00000000-0000-0000-0000-0000000000c4'),
  'INV-' || extract(year from current_date)::int || '-0002', 'second number of the year');

-- the counter table is not reachable from the API
SELECT pg_temp.assert_fails('SELECT * FROM public.invoice_counters', 'permission denied');

-- ------------------------------------------------ logo constraint
UPDATE public.company_settings SET logo_data_url = 'data:image/png;base64,iVBORw0KGgo=';
SELECT pg_temp.assert_fails($q$UPDATE public.company_settings SET logo_data_url = 'javascript:alert(1)'$q$, 'company_logo_is_small_image');
SELECT pg_temp.assert_fails($q$UPDATE public.company_settings SET logo_data_url = 'data:image/svg+xml;base64,PHN2Zz4='$q$, 'company_logo_is_small_image');
UPDATE public.company_settings SET logo_data_url = NULL;

-- ------------------------------------------------ tenant B sees and touches nothing of A
SELECT pg_temp.as_user('bbbbbbbb-0000-0000-0000-0000000000b2');
SELECT public.bootstrap_company('Tenant B');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.invoices), 0, 'B sees no invoices of A');
SELECT pg_temp.assert_eq((SELECT count(*) FROM public.invoice_lines), 0, 'B sees no lines of A');
SELECT pg_temp.assert_fails(format($q$SELECT public.create_external_invoice(gen_random_uuid(), %L, 'en')$q$, (SELECT gate FROM ids)), 'PROJECT_NOT_FOUND');
SELECT pg_temp.assert_fails(format($q$SELECT public.issue_invoice(%L)$q$, (SELECT id FROM inv1)), 'INVOICE_NOT_FOUND');
SELECT pg_temp.assert_fails(format($q$INSERT INTO public.invoice_lines (company_id, invoice_id, line_type, description, qty, unit_price) SELECT company_id, %L, 'CUSTOM', 'x', 1, 1 FROM public.profiles WHERE user_id = auth.uid()$q$, (SELECT id FROM inv1)), 'INVOICE_NOT_FOUND');

SET LOCAL ROLE anon;
SELECT pg_temp.assert_fails('SELECT count(*) FROM public.invoices', 'permission denied');

DO $$ BEGIN RAISE NOTICE 'ALL INVOICE TESTS PASSED'; END $$;
ROLLBACK;
