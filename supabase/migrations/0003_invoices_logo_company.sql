-- 0003: stored external invoices, numbering, locking, logo and company details.
--
-- Internal invoices are NOT stored: they are generated live from project_logs and inventory.
-- External invoices are separate documents. They start as a copy of the project's real usage and
-- may then be edited freely while DRAFT. Nothing in invoices/invoice_lines ever touches inventory
-- or project_logs, so editing an external invoice cannot change stock or the internal record.

-- ---------------------------------------------------------------- company profile and logo
alter table public.company_settings
  add column if not exists logo_data_url        text,
  add column if not exists company_address      text,
  add column if not exists company_tax_id       text,
  add column if not exists company_phone        text,
  add column if not exists company_bank_account text,
  add column if not exists default_vat_pct      numeric(5,2) not null default 0;

alter table public.company_settings
  add constraint company_logo_is_small_image check (
    logo_data_url is null
    or (length(logo_data_url) <= 600000 and logo_data_url ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$')),
  add constraint company_vat_range check (default_vat_pct between 0 and 100);

-- ---------------------------------------------------------------- tables
create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null,
  project_id     uuid not null references public.projects(id),
  status         text not null default 'DRAFT' check (status in ('DRAFT','ISSUED','PAID','VOID')),
  number         text,                         -- assigned when issued, so drafts leave no gaps
  issued_at      date,
  due_date       date,
  client_name    text,
  client_address text,
  vat_pct        numeric(5,2) not null default 0 check (vat_pct between 0 and 100),
  notes          text,
  advance_paid   numeric(12,2) not null default 0 check (advance_paid >= 0),
  currency       text not null,
  client_op_id   uuid unique,
  created_at     timestamptz not null default now(),
  unique (company_id, number)
);
create index invoices_company_idx on public.invoices(company_id, created_at desc);
create index invoices_project_idx on public.invoices(project_id);

create table public.invoice_lines (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null,
  invoice_id          uuid not null references public.invoices(id) on delete cascade,
  position            int not null default 0,
  line_type           text not null check (line_type in ('LABOR','MATERIAL','CONSUMABLE','WELD','HARDWARE','CUSTOM')),
  description         text not null,
  qty                 numeric(12,3) not null check (qty >= 0),
  unit                text not null default 'pcs',
  unit_price          numeric(12,4) not null check (unit_price >= 0),
  -- reference only. Editing a line never changes stock.
  source_inventory_id uuid references public.inventory(id) on delete set null,
  line_total          numeric(14,2) generated always as (round(qty * unit_price, 2)) stored
);
create index invoice_lines_invoice_idx on public.invoice_lines(invoice_id, position);

create table public.invoice_counters (
  company_id uuid not null,
  year       int  not null,
  last_no    int  not null default 0,
  primary key (company_id, year)
);

-- ---------------------------------------------------------------- RLS
alter table public.invoices         enable row level security;
alter table public.invoice_lines    enable row level security;
alter table public.invoice_counters enable row level security;   -- no policy: only issue_invoice() touches it

create policy tenant_isolation on public.invoices
  for all to authenticated
  using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());
create policy tenant_isolation on public.invoice_lines
  for all to authenticated
  using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());

revoke all on public.invoices, public.invoice_lines, public.invoice_counters from anon;
revoke all on public.invoice_counters from authenticated;

-- ---------------------------------------------------------------- guards
-- Lines can only change while the invoice is a DRAFT, and only on an invoice of the same company.
create or replace function public.guard_invoice_lines() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_status  text;
  v_company uuid;
  v_id      uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  select status, company_id into v_status, v_company from public.invoices where id = v_id;
  if v_status is null then
    -- parent already gone (cascade delete) is fine; anything else points at an invoice we cannot see
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'INVOICE_NOT_FOUND';
  end if;
  if v_status <> 'DRAFT' then raise exception 'INVOICE_LOCKED'; end if;
  if tg_op <> 'DELETE' and new.company_id <> v_company then raise exception 'WRONG_COMPANY'; end if;
  return coalesce(new, old);
end $$;

create trigger invoice_lines_guard
  before insert or update or delete on public.invoice_lines
  for each row execute function public.guard_invoice_lines();

-- Status and number change only through the RPCs. Issued invoices are frozen.
create or replace function public.guard_invoices() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' or new.number is not null or new.issued_at is not null then
      raise exception 'USE_INVOICE_RPC';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'DRAFT' then raise exception 'INVOICE_LOCKED'; end if;
    return old;
  end if;
  if (new.status, new.number, new.issued_at) is distinct from (old.status, old.number, old.issued_at)
     and coalesce(current_setting('reinkraft.rpc', true), '') <> '1' then
    raise exception 'USE_INVOICE_RPC';
  end if;
  if old.status <> 'DRAFT'
     and (new.project_id, new.client_name, new.client_address, new.vat_pct, new.due_date, new.notes, new.advance_paid, new.currency)
         is distinct from
         (old.project_id, old.client_name, old.client_address, old.vat_pct, old.due_date, old.notes, old.advance_paid, old.currency) then
    raise exception 'INVOICE_LOCKED';
  end if;
  return new;
end $$;

create trigger invoices_guard
  before insert or update or delete on public.invoices
  for each row execute function public.guard_invoices();

-- ---------------------------------------------------------------- RPCs
-- Copies the project's real usage into the invoice lines. Reads logs only: it never changes stock.
-- Labour is one line with the exact hours. Each item is one line with the quantity used and its
-- frozen cost, net of any offcut returned to stock.
create or replace function public.fill_invoice_lines(p_invoice_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_company uuid := public.current_company_id();
  v_inv     public.invoices%rowtype;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if v_inv.status <> 'DRAFT' then raise exception 'INVOICE_LOCKED'; end if;

  delete from public.invoice_lines where invoice_id = v_inv.id;

  insert into public.invoice_lines (company_id, invoice_id, position, line_type, description, qty, unit, unit_price)
  select v_company, v_inv.id, 0, 'LABOR', 'Labour', sum(l.qty_delta), 'h',
         round(sum(abs(l.qty_delta) * l.unit_cost_at_time) / sum(l.qty_delta), 4)
    from public.project_logs l
   where l.project_id = v_inv.project_id and l.log_category = 'LABOR'
  having sum(l.qty_delta) > 0;

  insert into public.invoice_lines (company_id, invoice_id, position, line_type, description, qty, unit, unit_price, source_inventory_id)
  select v_company, v_inv.id, (row_number() over (order by x.name))::int, x.line_type, x.name, x.qty, x.unit,
         round(greatest(x.amount, 0) / x.qty, 4), x.inventory_id
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

create or replace function public.create_external_invoice(p_client_op_id uuid, p_project_id uuid)
returns public.invoices
language plpgsql set search_path = '' as $$
declare
  v_company uuid := public.current_company_id();
  v_row     public.invoices%rowtype;
  v_proj    public.projects%rowtype;
  v_set     public.company_settings%rowtype;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;

  select * into v_row from public.invoices where client_op_id = p_client_op_id;
  if found then return v_row; end if;

  select * into v_proj from public.projects where id = p_project_id and company_id = v_company;
  if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
  select * into v_set from public.company_settings where company_id = v_company;

  insert into public.invoices (company_id, project_id, client_name, vat_pct, advance_paid, currency, due_date, client_op_id)
  values (v_company, v_proj.id, v_proj.client_name, v_set.default_vat_pct, v_proj.advance_paid, v_set.currency, v_proj.due_date, p_client_op_id)
  returning * into v_row;

  perform public.fill_invoice_lines(v_row.id);
  return v_row;
end $$;

-- Assigns the next number for the year, race-free, and freezes the invoice.
create or replace function public.issue_invoice(p_invoice_id uuid) returns public.invoices
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := public.current_company_id();
  v_inv     public.invoices%rowtype;
  v_year    int := extract(year from current_date)::int;
  v_no      int;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if v_inv.status <> 'DRAFT' then raise exception 'ALREADY_ISSUED'; end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = v_inv.id) then
    raise exception 'INVOICE_HAS_NO_LINES';
  end if;

  insert into public.invoice_counters as c (company_id, year, last_no) values (v_company, v_year, 1)
  on conflict (company_id, year) do update set last_no = c.last_no + 1
  returning c.last_no into v_no;

  perform set_config('reinkraft.rpc', '1', true);
  update public.invoices
     set status = 'ISSUED', number = 'INV-' || v_year || '-' || lpad(v_no::text, 4, '0'), issued_at = current_date
   where id = v_inv.id
  returning * into v_inv;
  perform set_config('reinkraft.rpc', '', true);
  return v_inv;
end $$;

create or replace function public.set_invoice_status(p_invoice_id uuid, p_status text) returns public.invoices
language plpgsql set search_path = '' as $$
declare
  v_company uuid := public.current_company_id();
  v_inv     public.invoices%rowtype;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id and company_id = v_company for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if not ((v_inv.status = 'ISSUED' and p_status in ('PAID', 'VOID')) or (v_inv.status = 'PAID' and p_status = 'ISSUED')) then
    raise exception 'BAD_STATUS_CHANGE';
  end if;
  perform set_config('reinkraft.rpc', '1', true);
  update public.invoices set status = p_status where id = v_inv.id returning * into v_inv;
  perform set_config('reinkraft.rpc', '', true);
  return v_inv;
end $$;

revoke execute on function public.fill_invoice_lines(uuid)             from public, anon;
revoke execute on function public.create_external_invoice(uuid, uuid)  from public, anon;
revoke execute on function public.issue_invoice(uuid)                  from public, anon;
revoke execute on function public.set_invoice_status(uuid, text)       from public, anon;
grant  execute on function public.fill_invoice_lines(uuid)             to authenticated;
grant  execute on function public.create_external_invoice(uuid, uuid)  to authenticated;
grant  execute on function public.issue_invoice(uuid)                  to authenticated;
grant  execute on function public.set_invoice_status(uuid, text)       to authenticated;
