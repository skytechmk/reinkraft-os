-- 0004: each external invoice has a document language (en or mk). It is chosen at creation,
-- locked once the invoice is issued, and decides the wording the generated lines and printout use.
alter table public.invoices
  add column if not exists language text not null default 'en' check (language in ('en', 'mk'));

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
     and (new.project_id, new.client_name, new.client_address, new.vat_pct, new.due_date, new.notes, new.advance_paid, new.currency, new.language)
         is distinct from
         (old.project_id, old.client_name, old.client_address, old.vat_pct, old.due_date, old.notes, old.advance_paid, old.currency, old.language) then
    raise exception 'INVOICE_LOCKED';
  end if;
  return new;
end $$;

-- fill_invoice_lines: same copy of real usage, with the labour line worded in the invoice language
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
                                       when 'M' then 'м' when 'ML' then 'мл' when 'BOX' then 'кутија' else x.unit end
           else x.unit
         end,
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

drop function if exists public.create_external_invoice(uuid, uuid);
create or replace function public.create_external_invoice(p_client_op_id uuid, p_project_id uuid, p_language text default 'en')
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

  insert into public.invoices (company_id, project_id, client_name, vat_pct, advance_paid, currency, due_date, client_op_id, language)
  values (v_company, v_proj.id, v_proj.client_name, v_set.default_vat_pct, v_proj.advance_paid, v_set.currency,
          v_proj.due_date, p_client_op_id, case when p_language in ('en', 'mk') then p_language else 'en' end)
  returning * into v_row;

  perform public.fill_invoice_lines(v_row.id);
  return v_row;
end $$;

revoke execute on function public.create_external_invoice(uuid, uuid, text) from public, anon;
grant  execute on function public.create_external_invoice(uuid, uuid, text) to authenticated;
