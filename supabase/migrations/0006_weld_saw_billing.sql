-- 0006: blueprint phase B. Weld length and saw cuts as billable daily inputs, with optional automatic
-- deduction of filler wire and shielding gas. Additive, and everything is OFF until the owner turns it on:
--  * company_settings: weld_rate_enabled, saw_rate_enabled, saw_cut_rate, auto_consumption_enabled, process_config
--  * project_logs: categories WELD_LENGTH and SAW_CUT, and parent_log_id so one weld is undone as one unit
--  * RPCs: log_weld (new), log_project_activity (adds SAW_CUT), undo_project_log (parent/child aware),
--    fill_invoice_lines (welding and saw-cut lines)
--
-- process_config (jsonb) example, one entry per process, all keys optional:
--   { "MIG": { "rate_per_cm": 0.5, "wire_item_id": "<uuid, unit KG>", "wire_g_per_m": 20,
--              "gas_item_id": "<uuid, unit L or ML>", "gas_l_per_m": 8 } }

-- ---------------------------------------------------------------- settings
alter table public.company_settings
  add column if not exists weld_rate_enabled        boolean not null default false,
  add column if not exists saw_rate_enabled         boolean not null default false,
  add column if not exists saw_cut_rate             numeric(10,2) not null default 0 check (saw_cut_rate >= 0),
  add column if not exists auto_consumption_enabled boolean not null default false,
  add column if not exists process_config           jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------- logs
alter table public.project_logs add column if not exists parent_log_id uuid references public.project_logs(id);
create index if not exists project_logs_parent_idx on public.project_logs(parent_log_id) where parent_log_id is not null;

alter table public.project_logs drop constraint project_logs_log_category_check;
alter table public.project_logs add constraint project_logs_log_category_check
  check (log_category in ('LABOR','WELD','MATERIAL','CONSUMABLE','HARDWARE','ONE_OFF_EXPENSE','WELD_LENGTH','SAW_CUT'));

-- ---------------------------------------------------------------- log_project_activity: adds SAW_CUT
create or replace function public.log_project_activity(
  p_client_op_id     uuid,
  p_project_id       uuid,
  p_category         text,
  p_qty              numeric,
  p_description      text default null,
  p_inventory_id     uuid default null,
  p_service_batch_id uuid default null,
  p_charged_amount   numeric default null,
  p_payment_status   text default null
)
returns public.project_logs
language plpgsql
set search_path = ''
as $$
declare
  v_company  uuid := public.current_company_id();
  v_settings public.company_settings%rowtype;
  v_inv      public.inventory%rowtype;
  v_row      public.project_logs%rowtype;
  v_cost     numeric;
  v_delta    numeric;
  v_inv_id   uuid := p_inventory_id;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;

  select * into v_row from public.project_logs where client_op_id = p_client_op_id;
  if found then return v_row; end if;

  if p_qty is null or p_qty <= 0 then raise exception 'QTY_MUST_BE_POSITIVE'; end if;
  if p_category not in ('LABOR','WELD','MATERIAL','CONSUMABLE','HARDWARE','ONE_OFF_EXPENSE','SAW_CUT') then
    raise exception 'BAD_CATEGORY';
  end if;

  perform 1 from public.projects where id = p_project_id and company_id = v_company;
  if not found then raise exception 'PROJECT_NOT_FOUND'; end if;

  select * into v_settings from public.company_settings where company_id = v_company;

  if p_category = 'LABOR' then
    v_cost   := coalesce(v_settings.hourly_labor_rate, 0);
    v_delta  := p_qty;            -- hours, not stock
    v_inv_id := null;
  elsif p_category = 'SAW_CUT' then
    if not coalesce(v_settings.saw_rate_enabled, false) then raise exception 'SAW_RATE_OFF'; end if;
    v_cost   := coalesce(v_settings.saw_cut_rate, 0);
    v_delta  := p_qty;            -- number of cuts, not stock
    v_inv_id := null;
  else
    if v_inv_id is null then raise exception 'INVENTORY_REQUIRED'; end if;
    select * into v_inv from public.inventory
     where id = v_inv_id and company_id = v_company for update;
    if not found then raise exception 'INVENTORY_NOT_FOUND'; end if;
    if v_inv.qty_on_hand < p_qty then
      raise exception 'INSUFFICIENT_STOCK' using detail = v_inv.qty_on_hand::text;
    end if;
    update public.inventory set qty_on_hand = qty_on_hand - p_qty where id = v_inv.id;
    v_cost  := v_inv.last_buy_price;
    v_delta := -p_qty;
  end if;

  insert into public.project_logs (
    company_id, project_id, inventory_id, log_category, description, qty_delta,
    unit_cost_at_time, service_batch_id, charged_amount, payment_status, client_op_id)
  values (
    v_company, p_project_id, v_inv_id, p_category, p_description, v_delta,
    v_cost, p_service_batch_id, p_charged_amount, p_payment_status, p_client_op_id)
  returning * into v_row;

  return v_row;
end $$;

-- ---------------------------------------------------------------- log_weld
-- One weld entry: the length (billed at the process rate) and, when auto-consumption is on and the
-- process has a wire and a gas item assigned, the filler wire (kg) and gas (L) it used. All in one
-- transaction: if either item is short of stock nothing is written.
create or replace function public.log_weld(
  p_client_op_id uuid,
  p_project_id   uuid,
  p_process      text,
  p_length_cm    numeric
)
returns public.project_logs
language plpgsql
set search_path = ''
as $$
declare
  v_company  uuid := public.current_company_id();
  v_settings public.company_settings%rowtype;
  v_row      public.project_logs%rowtype;
  v_cfg      jsonb;
  v_rate     numeric;
  v_item     public.inventory%rowtype;
  v_item_id  uuid;
  v_per_m    numeric;
  v_need     numeric;
  v_part     int;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;

  select * into v_row from public.project_logs where client_op_id = p_client_op_id;
  if found then return v_row; end if;

  if p_length_cm is null or p_length_cm <= 0 then raise exception 'QTY_MUST_BE_POSITIVE'; end if;
  if p_process not in ('MIG','MAG','TIG_DC','TIG_ACDC','PULSE','MMA','PLASMA','LASER') then
    raise exception 'BAD_PROCESS';
  end if;

  perform 1 from public.projects where id = p_project_id and company_id = v_company;
  if not found then raise exception 'PROJECT_NOT_FOUND'; end if;

  select * into v_settings from public.company_settings where company_id = v_company;
  if not coalesce(v_settings.weld_rate_enabled, false) then raise exception 'WELD_RATE_OFF'; end if;

  v_cfg  := coalesce(v_settings.process_config -> p_process, '{}'::jsonb);
  v_rate := coalesce((v_cfg ->> 'rate_per_cm')::numeric, 0);

  insert into public.project_logs (
    company_id, project_id, inventory_id, log_category, description, qty_delta, unit_cost_at_time, client_op_id)
  values (v_company, p_project_id, null, 'WELD_LENGTH', p_process, p_length_cm, v_rate, p_client_op_id)
  returning * into v_row;

  if coalesce(v_settings.auto_consumption_enabled, false) then
    for v_part in 1..2 loop
      if v_part = 1 then      -- filler wire, stored in kg
        v_item_id := nullif(v_cfg ->> 'wire_item_id', '')::uuid;
        v_per_m   := coalesce((v_cfg ->> 'wire_g_per_m')::numeric, 0) / 1000;
      else                    -- shielding gas, stored in L (or ml)
        v_item_id := nullif(v_cfg ->> 'gas_item_id', '')::uuid;
        v_per_m   := coalesce((v_cfg ->> 'gas_l_per_m')::numeric, 0);
      end if;
      continue when v_item_id is null or v_per_m <= 0;

      select * into v_item from public.inventory where id = v_item_id and company_id = v_company for update;
      continue when not found;
      -- the unit has to match what the preset is expressed in
      continue when not ((v_part = 1 and v_item.unit_label = 'KG') or (v_part = 2 and v_item.unit_label in ('L', 'ML')));

      v_need := round((p_length_cm / 100.0) * v_per_m * case when v_part = 2 and v_item.unit_label = 'ML' then 1000 else 1 end, 3);
      continue when v_need <= 0;

      if v_item.qty_on_hand < v_need then
        raise exception 'INSUFFICIENT_STOCK' using detail = v_item.name || ': ' || v_item.qty_on_hand::text;
      end if;
      update public.inventory set qty_on_hand = qty_on_hand - v_need where id = v_item.id;
      insert into public.project_logs (
        company_id, project_id, inventory_id, log_category, description, qty_delta,
        unit_cost_at_time, parent_log_id, client_op_id)
      values (v_company, p_project_id, v_item.id, 'WELD', v_item.name, -v_need,
              v_item.last_buy_price, v_row.id, gen_random_uuid());
    end loop;
  end if;

  return v_row;
end $$;

-- ---------------------------------------------------------------- undo_project_log: a weld goes back as one unit
create or replace function public.undo_project_log(p_log_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_company uuid := public.current_company_id();
  v_log     public.project_logs%rowtype;
  v_child   public.project_logs%rowtype;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;

  select * into v_log from public.project_logs
   where id = p_log_id and company_id = v_company for update;
  if not found then raise exception 'LOG_NOT_FOUND'; end if;

  -- the wire and gas rows of a weld cannot be taken back on their own: undo the weld
  if v_log.parent_log_id is not null then raise exception 'UNDO_PARENT_INSTEAD'; end if;

  if exists (select 1 from public.project_logs where source_log_id = p_log_id) then
    raise exception 'UNDO_REMNANT_FIRST';
  end if;

  for v_child in select * from public.project_logs where parent_log_id = p_log_id for update loop
    if v_child.inventory_id is not null then
      update public.inventory set qty_on_hand = qty_on_hand - v_child.qty_delta where id = v_child.inventory_id;
    end if;
    delete from public.project_logs where id = v_child.id;
  end loop;

  if v_log.inventory_id is not null then
    update public.inventory set qty_on_hand = qty_on_hand - v_log.qty_delta
     where id = v_log.inventory_id;
  end if;

  delete from public.project_logs where id = v_log.id;
end $$;

revoke execute on function public.log_weld(uuid, uuid, text, numeric) from public, anon;
grant  execute on function public.log_weld(uuid, uuid, text, numeric) to authenticated;

-- ---------------------------------------------------------------- quotes: welding and saw-cut lines
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

  -- weld length, at the process rates that were frozen when it was logged
  insert into public.invoice_lines (company_id, invoice_id, position, line_type, description, qty, unit, unit_price)
  select v_company, v_inv.id, 1, 'LABOR',
         case v_inv.language when 'mk' then 'Заварување' else 'Welding' end,
         sum(l.qty_delta), case v_inv.language when 'mk' then 'см' else 'cm' end,
         round(sum(l.qty_delta * l.unit_cost_at_time) / sum(l.qty_delta), 4)
    from public.project_logs l
   where l.project_id = v_inv.project_id and l.log_category = 'WELD_LENGTH'
  having sum(l.qty_delta) > 0;

  insert into public.invoice_lines (company_id, invoice_id, position, line_type, description, qty, unit, unit_price)
  select v_company, v_inv.id, 2, 'LABOR',
         case v_inv.language when 'mk' then 'Сечења со пила' else 'Saw cuts' end,
         sum(l.qty_delta), case v_inv.language when 'mk' then 'ком' else 'pcs' end,
         round(sum(l.qty_delta * l.unit_cost_at_time) / sum(l.qty_delta), 4)
    from public.project_logs l
   where l.project_id = v_inv.project_id and l.log_category = 'SAW_CUT'
  having sum(l.qty_delta) > 0;

  insert into public.invoice_lines (company_id, invoice_id, position, line_type, description, qty, unit, unit_price, source_inventory_id)
  select v_company, v_inv.id, (row_number() over (order by x.name))::int + 2, x.line_type, x.name, x.qty,
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
