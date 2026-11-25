-- Reinkraft OS V1.0 — core schema, RLS and atomic RPCs.
-- Multi-tenant by company_id. Every stock/cost change goes through an RPC that
-- locks the inventory row, mutates stock and writes the log in ONE transaction.
-- client_op_id (UUID generated on the device) makes every RPC idempotent, so an
-- offline replay after a dropped connection can never double-decrement stock.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tenancy
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null,
  created_at timestamptz not null default now()
);

create or replace function public.current_company_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select p.company_id from public.profiles p where p.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------- tables
create table if not exists public.company_settings (
  company_id                 uuid primary key,
  company_name               text not null default 'Reinkraft',
  currency                   text not null default 'EUR' check (currency in ('EUR','USD','MKD')),
  unit_system                text not null default 'METRIC' check (unit_system in ('METRIC','IMPERIAL')),
  hourly_labor_rate          numeric(10,2) not null default 0 check (hourly_labor_rate >= 0),
  weld_consumable_markup_pct numeric(6,2) not null default 70,
  min_remnant_length_mm      int not null default 500,
  enabled_processes          jsonb not null default '["MIG","TIG_DC","TIG_AC","PLASMA","MMA","PAINT"]'::jsonb
);

create table if not exists public.inventory (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null,
  item_type           text not null check (item_type in ('PROFILE','SHEET','CONSUMABLE','CHEMICAL','CUSTOM')),
  name                text not null,
  material_grade      text,
  standard_length_mm  int,                 -- 3000 or 6000 for profiles
  sheet_width_mm      int,
  sheet_length_mm     int,
  sheet_thickness_mm  numeric(6,2),
  volume_ml           numeric(12,2),
  unit_label          text not null check (unit_label in ('PCS','BAR','SHEET','ML','M','BOX')),
  qty_on_hand         numeric(12,3) not null default 0 check (qty_on_hand >= 0),
  min_alert_qty       numeric(12,3) not null default 0,
  last_buy_price      numeric(12,4) not null default 0,
  prev_buy_price      numeric(12,4),
  is_pinned_stepper   boolean not null default false,
  is_remnant          boolean not null default false,
  remnant_length_mm   int,
  parent_id           uuid references public.inventory(id),
  coverage_m2_per_l   numeric(10,3),       -- V1.1 hook
  mix_ratio_json      jsonb,               -- V1.1 hook
  created_at          timestamptz not null default now()
);
create index if not exists inventory_company_idx on public.inventory(company_id);

create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  project_type    text not null check (project_type in ('MAIN','SYSTEM_SERVICE')),
  status          text not null check (status in ('QUOTE','ACTIVE','FINISHED')),
  title           text not null,
  client_name     text,
  quoted_price    numeric(12,2),
  start_date      date,                    -- V1.1 hook
  due_date        date,                    -- V1.1 hook
  estimated_hours numeric(8,2),            -- V1.1 hook
  created_at      timestamptz not null default now()
);
create index if not exists projects_company_idx on public.projects(company_id);
-- exactly one hidden Quick Service bucket per company
create unique index if not exists projects_one_system_per_company
  on public.projects(company_id) where project_type = 'SYSTEM_SERVICE';

create table if not exists public.project_logs (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null,
  project_id         uuid not null references public.projects(id),
  inventory_id       uuid references public.inventory(id),
  log_category       text not null check (log_category in ('LABOR','WELD','MATERIAL','CONSUMABLE','HARDWARE','ONE_OFF_EXPENSE')),
  description        text,
  qty_delta          numeric(12,3) not null check (qty_delta <> 0), -- stock: negative = consumed; LABOR: hours
  unit_cost_at_time  numeric(12,4) not null,                        -- frozen at log time
  service_batch_id   uuid,
  charged_amount     numeric(12,2),
  payment_status     text check (payment_status in ('PAID','UNPAID','FREE')),
  service_photos     jsonb not null default '[]'::jsonb,            -- V1.1 hook
  source_log_id      uuid references public.project_logs(id),       -- remnant credit -> bar deduction
  client_op_id       uuid not null unique,
  created_at         timestamptz not null default now()
);
create index if not exists project_logs_company_idx on public.project_logs(company_id, created_at);
create unique index if not exists project_logs_one_remnant_per_source
  on public.project_logs(source_log_id) where source_log_id is not null;

create table if not exists public.project_notes (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null,
  project_id       uuid not null references public.projects(id),
  note_text        text not null,
  is_pinned_warning boolean not null default false,
  remind_at        timestamptz,                                        -- V1.1 hook
  reminder_status  text not null default 'NONE' check (reminder_status in ('NONE','PENDING','FIRED','DONE')),
  target_worker_id uuid                                                -- V1.2 hook
);

create table if not exists public.purchases (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null,
  inventory_id     uuid not null references public.inventory(id),
  brand_tag        text,
  qty_bought       numeric(12,3) not null check (qty_bought > 0),
  unit_price_paid  numeric(12,4) not null check (unit_price_paid >= 0),
  total_paid       numeric(12,2) not null,
  purchased_at     timestamptz not null default now(),
  client_op_id     uuid not null unique
);

-- ---------------------------------------------------------------- RLS
alter table public.profiles         enable row level security;
alter table public.company_settings enable row level security;
alter table public.inventory        enable row level security;
alter table public.projects         enable row level security;
alter table public.project_logs     enable row level security;
alter table public.project_notes    enable row level security;
alter table public.purchases        enable row level security;

create policy profiles_self on public.profiles
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['company_settings','inventory','projects','project_logs','project_notes','purchases'] loop
    execute format(
      'create policy tenant_isolation on public.%I for all to authenticated
         using (company_id = public.current_company_id())
         with check (company_id = public.current_company_id())', t);
  end loop;
end $$;

-- anon has no business access at all
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------- bootstrap
create or replace function public.ensure_system_project(p_company uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.projects (company_id, project_type, status, title, client_name)
  values (p_company, 'SYSTEM_SERVICE', 'ACTIVE', 'Quick Service (system)', 'INTERNAL')
  on conflict (company_id) where project_type = 'SYSTEM_SERVICE' do nothing;
  select id into v_id from public.projects
   where company_id = p_company and project_type = 'SYSTEM_SERVICE';
  return v_id;
end $$;

create or replace function public.bootstrap_company(p_name text default 'Reinkraft')
returns uuid
language plpgsql
set search_path = ''
as $$
declare v_company uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where user_id = auth.uid()) then
    raise exception 'ALREADY_BOOTSTRAPPED';
  end if;
  insert into public.profiles (user_id, company_id) values (auth.uid(), v_company);
  insert into public.company_settings (company_id, company_name)
  values (v_company, coalesce(nullif(p_name, ''), 'Reinkraft'));
  perform public.ensure_system_project(v_company);
  return v_company;
end $$;

-- ---------------------------------------------------------------- atomic RPCs
-- 1. Log labour or material use. Freezes unit cost, decrements stock under a row lock.
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

  -- idempotent replay: the same device operation returns the original row
  select * into v_row from public.project_logs where client_op_id = p_client_op_id;
  if found then return v_row; end if;

  if p_qty is null or p_qty <= 0 then raise exception 'QTY_MUST_BE_POSITIVE'; end if;
  if p_category not in ('LABOR','WELD','MATERIAL','CONSUMABLE','HARDWARE','ONE_OFF_EXPENSE') then
    raise exception 'BAD_CATEGORY';
  end if;

  perform 1 from public.projects where id = p_project_id and company_id = v_company;
  if not found then raise exception 'PROJECT_NOT_FOUND'; end if;

  select * into v_settings from public.company_settings where company_id = v_company;

  if p_category = 'LABOR' then
    v_cost   := coalesce(v_settings.hourly_labor_rate, 0);
    v_delta  := p_qty;            -- hours, not stock
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

-- 2. Return a remnant from a full-bar deduction. Credits proportional cost and
--    adds a remnant stock piece. Lengths are the 1-tap presets from the spec.
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
  if p_length_mm not in (1000, 1500, 2000, 2500) then raise exception 'BAD_REMNANT_LENGTH'; end if;

  select * into v_settings from public.company_settings where company_id = v_company;
  if p_length_mm < coalesce(v_settings.min_remnant_length_mm, 500)
     or p_length_mm >= v_bar.standard_length_mm then
    raise exception 'REMNANT_BELOW_MIN';
  end if;

  v_credit := v_src.unit_cost_at_time * p_length_mm / v_bar.standard_length_mm;

  select * into v_rem from public.inventory
   where company_id = v_company and parent_id = v_bar.id
     and is_remnant and remnant_length_mm = p_length_mm
   for update;
  if not found then
    insert into public.inventory (
      company_id, item_type, name, material_grade, unit_label,
      qty_on_hand, min_alert_qty, last_buy_price, is_remnant, remnant_length_mm, parent_id)
    values (
      v_company, v_bar.item_type, v_bar.name || ' remnant ' || p_length_mm || 'mm',
      v_bar.material_grade, v_bar.unit_label,
      0, 0, v_bar.last_buy_price * p_length_mm / v_bar.standard_length_mm,
      true, p_length_mm, v_bar.id)
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

-- 3. Undo a log: restores stock (qty_on_hand - qty_delta) and deletes the row.
create or replace function public.undo_project_log(p_log_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_company uuid := public.current_company_id();
  v_log     public.project_logs%rowtype;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;

  select * into v_log from public.project_logs
   where id = p_log_id and company_id = v_company for update;
  if not found then raise exception 'LOG_NOT_FOUND'; end if;

  if exists (select 1 from public.project_logs where source_log_id = p_log_id) then
    raise exception 'UNDO_REMNANT_FIRST';
  end if;

  if v_log.inventory_id is not null then
    update public.inventory set qty_on_hand = qty_on_hand - v_log.qty_delta
     where id = v_log.inventory_id;
  end if;

  delete from public.project_logs where id = v_log.id;
end $$;

-- 4. Record a purchase: raises stock, rotates last/prev buy price.
create or replace function public.record_purchase(
  p_client_op_id uuid,
  p_inventory_id uuid,
  p_qty          numeric,
  p_unit_price   numeric,
  p_brand_tag    text default null
)
returns public.purchases
language plpgsql
set search_path = ''
as $$
declare
  v_company uuid := public.current_company_id();
  v_row     public.purchases%rowtype;
  v_inv     public.inventory%rowtype;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;

  select * into v_row from public.purchases where client_op_id = p_client_op_id;
  if found then return v_row; end if;

  if p_qty is null or p_qty <= 0 or p_unit_price is null or p_unit_price < 0 then
    raise exception 'BAD_AMOUNT';
  end if;

  select * into v_inv from public.inventory
   where id = p_inventory_id and company_id = v_company for update;
  if not found then raise exception 'INVENTORY_NOT_FOUND'; end if;

  update public.inventory
     set qty_on_hand    = qty_on_hand + p_qty,
         prev_buy_price = last_buy_price,
         last_buy_price = p_unit_price
   where id = v_inv.id;

  insert into public.purchases (
    company_id, inventory_id, brand_tag, qty_bought, unit_price_paid, total_paid,
    purchased_at, client_op_id)
  values (
    v_company, v_inv.id, p_brand_tag, p_qty, p_unit_price, p_qty * p_unit_price,
    now(), p_client_op_id)
  returning * into v_row;

  return v_row;
end $$;

-- ---------------------------------------------------------------- RPC grants
revoke execute on function public.bootstrap_company(text)                              from public, anon;
revoke execute on function public.log_project_activity(uuid,uuid,text,numeric,text,uuid,uuid,numeric,text) from public, anon;
revoke execute on function public.return_remnant(uuid,uuid,int)                        from public, anon;
revoke execute on function public.undo_project_log(uuid)                               from public, anon;
revoke execute on function public.record_purchase(uuid,uuid,numeric,numeric,text)      from public, anon;
grant  execute on function public.bootstrap_company(text)                              to authenticated;
grant  execute on function public.log_project_activity(uuid,uuid,text,numeric,text,uuid,uuid,numeric,text) to authenticated;
grant  execute on function public.return_remnant(uuid,uuid,int)                        to authenticated;
grant  execute on function public.undo_project_log(uuid)                               to authenticated;
grant  execute on function public.record_purchase(uuid,uuid,numeric,numeric,text)      to authenticated;
