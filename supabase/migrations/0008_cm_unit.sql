-- 0008: centimetres (CM) as an inventory unit. Additive: widens the unit check, and the Macedonian invoice
-- wording learns 'см'. No data changes.
alter table public.inventory drop constraint inventory_unit_label_check;
alter table public.inventory add constraint inventory_unit_label_check
  check (unit_label in ('PCS','BAR','SHEET','ML','M','CM','BOX','M2','KG','L'));

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
                                       when 'M' then 'м' when 'CM' then 'см' when 'ML' then 'мл' when 'BOX' then 'кутија'
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
