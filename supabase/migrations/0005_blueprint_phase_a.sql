-- 0005: blueprint phase A. Strictly additive: nothing is dropped or rewritten except the two CHECK
-- lists that must grow and the enabled_processes names.
--  * inventory folders and subfolders, more units (M2, KG, L), supplier fields, process tags
--  * workshop notes and cut list on projects
--  * payment terms and a tenant theme on company_settings, new process names
--  * offcuts of any length (at least the company minimum, shorter than the bar), filed in the Remnants Rack
--  * a quote created from the project's records is priced for the CLIENT, not at internal cost

-- ---------------------------------------------------------------- inventory
alter table public.inventory
  add column if not exists folder            text,
  add column if not exists subfolder         text,
  add column if not exists process_tags      text[] not null default '{}',
  add column if not exists manufacturer_sku  text,
  add column if not exists supplier_name     text,
  add column if not exists supplier_contact  text;

alter table public.inventory drop constraint inventory_unit_label_check;
alter table public.inventory add constraint inventory_unit_label_check
  check (unit_label in ('PCS','BAR','SHEET','ML','M','BOX','M2','KG','L'));
alter table public.inventory add constraint inventory_folder_check
  check (folder is null or folder in ('RAW','HARDWARE','ABRASIVES','CHEMICAL','WELDING'));
create index if not exists inventory_folder_idx on public.inventory(company_id, folder, subfolder);

-- ---------------------------------------------------------------- projects
alter table public.projects
  add column if not exists workshop_notes text,
  add column if not exists cut_list       text;

-- ---------------------------------------------------------------- company settings
alter table public.company_settings
  add column if not exists payment_terms text,
  add column if not exists tenant_theme  jsonb not null default '{}'::jsonb;

-- process names: TIG_AC becomes TIG_ACDC, PAINT is not a welding process. PULSE and LASER stay off.
update public.company_settings
   set enabled_processes = coalesce((
     select jsonb_agg(v order by v)
       from (select distinct case e when 'TIG_AC' then 'TIG_ACDC' else e end as v
               from jsonb_array_elements_text(enabled_processes) as e
              where e <> 'PAINT') s), '[]'::jsonb);
alter table public.company_settings
  alter column enabled_processes set default '["MIG","MAG","TIG_DC","TIG_ACDC","MMA","PLASMA"]'::jsonb;

-- ---------------------------------------------------------------- offcuts of any length
create or replace function public.return_remnant(
  p_client_op_id uuid,
  p_log_id       uuid,
  p_length_mm    int
)
returns public.project_logs
language plpgsql
set search_path = ''
as $$
declare
  v_company  uuid := public.current_company_id();
  v_row      public.project_logs%rowtype;
  v_src      public.project_logs%rowtype;
  v_bar      public.inventory%rowtype;
  v_rem      public.inventory%rowtype;
  v_settings public.company_settings%rowtype;
  v_credit   numeric;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;

  select * into v_row from public.project_logs where client_op_id = p_client_op_id;
  if found then return v_row; end if;

  select * into v_src from public.project_logs where id = p_log_id and company_id = v_company;
  if not found then raise exception 'LOG_NOT_FOUND'; end if;
  if v_src.inventory_id is null or v_src.qty_delta >= 0 or v_src.log_category <> 'MATERIAL' then
    raise exception 'NOT_A_BAR_DEDUCTION';
  end if;

  select * into v_bar from public.inventory
   where id = v_src.inventory_id and company_id = v_company for update;
  if v_bar.standard_length_mm is null then raise exception 'NOT_A_BAR'; end if;
  if p_length_mm is null or p_length_mm <= 0 then raise exception 'BAD_REMNANT_LENGTH'; end if;

  select * into v_settings from public.company_settings where company_id = v_company;
  if p_length_mm < coalesce(v_settings.min_remnant_length_mm, 500) then raise exception 'REMNANT_BELOW_MIN'; end if;
  if p_length_mm >= v_bar.standard_length_mm then raise exception 'REMNANT_TOO_LONG'; end if;

  v_credit := v_src.unit_cost_at_time * p_length_mm / v_bar.standard_length_mm;

  select * into v_rem from public.inventory
   where company_id = v_company and parent_id = v_bar.id
     and is_remnant and remnant_length_mm = p_length_mm
   for update;
  if not found then
    insert into public.inventory (
      company_id, item_type, name, material_grade, unit_label,
      qty_on_hand, min_alert_qty, last_buy_price, is_remnant, remnant_length_mm, parent_id,
      folder, subfolder)
    values (
      v_company, v_bar.item_type, v_bar.name || ' remnant ' || p_length_mm || 'mm',
      v_bar.material_grade, 'PCS',
      0, 0, v_bar.last_buy_price * p_length_mm / v_bar.standard_length_mm,
      true, p_length_mm, v_bar.id,
      'RAW', 'REMNANTS')
    returning * into v_rem;
  end if;

  update public.inventory set qty_on_hand = qty_on_hand + 1 where id = v_rem.id;

  insert into public.project_logs (
    company_id, project_id, inventory_id, log_category, description, qty_delta,
    unit_cost_at_time, service_batch_id, source_log_id, client_op_id)
  values (
    v_company, v_src.project_id, v_rem.id, 'MATERIAL',
    'Remnant returned ' || p_length_mm || 'mm', 1,
    -v_credit, v_src.service_batch_id, v_src.id, p_client_op_id)
  returning * into v_row;

  return v_row;
end $$;

-- ---------------------------------------------------------------- quotes are priced for the client
-- Same lines and quantities as the project's records, but consumables (wire, gas, discs) carry the
-- company markup, so an unedited quote never shows what the shop paid for them. Labour is at the rate.
create or replace function public.fill_invoice_lines(p_invoice_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_company uuid := public.current_company_id();
  v_inv     public.invoices%rowtype;
  v_markup  numeric;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if v_inv.status <> 'DRAFT' then raise exception 'INVOICE_LOCKED'; end if;

  select coalesce(weld_consumable_markup_pct, 0) / 100 into v_markup
    from public.company_settings where company_id = v_company;

  delete from public.invoice_lines where invoice_id = v_inv.id;

  insert into public.invoice_lines (company_id, invoice_id, position, line_type, description, qty, unit, unit_price)
  select v_company, v_inv.id, 0, 'LABOR',
         case v_inv.language when 'mk' then 'Работни часови' else 'Labour' end,
         sum(l.qty_delta), case v_inv.language when 'mk' then 'ч' else 'h' end,
         round(sum(abs(l.qty_delta) * l.unit_cost_at_time) / sum(l.qty_delta), 4)
    from public.project_logs l
   where l.project_id = v_inv.project_id and l.log_category = 'LABOR'
  having sum(l.qty_delta) > 0;

  insert into public.invoice_lines (company_id, invoice_id, position, line_type, description, qty, unit, unit_price, source_inventory_id)
  select v_company, v_inv.id, (row_number() over (order by x.name))::int, x.line_type, x.name, x.qty,
         case v_inv.language
           when 'mk' then case x.unit when 'PCS' then 'ком' when 'BAR' then 'шипка' when 'SHEET' then 'лим'
                                       when 'M' then 'м' when 'ML' then 'мл' when 'BOX' then 'кутија'
                                       when 'M2' then 'м²' when 'KG' then 'кг' when 'L' then 'л' else x.unit end
           else x.unit
         end,
         round(greatest(x.amount, 0) * case when x.line_type in ('WELD', 'CONSUMABLE') then 1 + v_markup else 1 end / x.qty, 4),
         x.inventory_id
    from (
      select i.id as inventory_id, i.name, i.unit_label as unit,
             case max(l.log_category) when 'ONE_OFF_EXPENSE' then 'HARDWARE' else max(l.log_category) end as line_type,
             sum(-l.qty_delta) as qty,
             sum(abs(l.qty_delta) * l.unit_cost_at_time)
               - coalesce((select sum(abs(c.qty_delta) * abs(c.unit_cost_at_time))
                             from public.project_logs c
                             join public.project_logs s on s.id = c.source_log_id
                            where c.project_id = v_inv.project_id and s.inventory_id = i.id), 0) as amount
        from public.project_logs l
        join public.inventory i on i.id = l.inventory_id
       where l.project_id = v_inv.project_id and l.log_category <> 'LABOR' and l.qty_delta < 0
       group by i.id, i.name, i.unit_label
    ) x
   where x.qty > 0;
end $$;
